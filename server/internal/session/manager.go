// Package session wires the transport (hub) to the authoritative game engine
// (game). One game.Room per room code. Inbound messages:
//   {"type":"start"}                         -> deal a new hand
//   {"type":"action","payload":{"action":"call","amount":0}} -> betting action
// Fan-out: public "state" to everyone (including spectators); private "hole"
// only to non-spectator owners. Spectators can observe but cannot act or be
// dealt in.
package session

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/MrxHuaang/poker-sim/server/internal/game"
	"github.com/MrxHuaang/poker-sim/server/internal/hub"
)

const (
	defaultSB   = 5
	defaultBB   = 10
	turnTimeout = 30 * time.Second
)

// roomTimer tracks the active turn timer for a room.
type roomTimer struct {
	timer  *time.Timer
	forUID string
}

type Manager struct {
	hub    *hub.Hub
	mu     sync.Mutex
	games  map[string]*game.Room
	timers map[string]*roomTimer
	blinds map[string]*time.Ticker // per-room blind escalation tickers
	owners map[string]string       // room code -> uid allowed to start/configure
}

func NewManager(h *hub.Hub) *Manager {
	return &Manager{
		hub:    h,
		games:  make(map[string]*game.Room),
		timers: make(map[string]*roomTimer),
		blinds: make(map[string]*time.Ticker),
		owners: make(map[string]string),
	}
}

// isOwner reports whether id may start/configure the room. The owner is the
// first non-spectator to join; if a room has no owner (e.g. it was just
// vacated) the next request is allowed and re-establishes control.
func (m *Manager) isOwner(code, id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	owner := m.owners[code]
	return owner == "" || owner == id
}

// reassignOwnerLocked picks a new owner when the current one leaves: the first
// remaining non-spectator client, or none. Must be called with m.mu held.
func (m *Manager) reassignOwnerLocked(code, leavingID string) {
	for _, c := range m.hub.Clients(code) {
		if c.Spectator || c.ID == leavingID {
			continue
		}
		m.owners[code] = c.ID
		return
	}
	delete(m.owners, code)
}

type actionPayload struct {
	Action string `json:"action"`
	Amount int    `json:"amount"`
}

type configPayload struct {
	SB             int `json:"sb"`
	BB             int `json:"bb"`
	Stack          int `json:"stack"`
	RunItN         int `json:"runItN"`
	BlindLevelSecs int `json:"blindLevelSecs"`
}

func (m *Manager) OnMessage(c *hub.Client, data []byte) {
	var msg game.ClientMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}
	switch msg.Type {
	case "start", "deal":
		if c.Spectator {
			return // spectators observe only
		}
		if !m.isOwner(c.Room, c.ID) {
			return // only the room owner deals/starts hands
		}
		m.handleStart(c.Room)
	case "action":
		if c.Spectator {
			return
		}
		var p actionPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		if p.Amount < 0 {
			return // defensive: negative amounts are never valid
		}
		m.handleAction(c.Room, c.ID, p.Action, p.Amount)
	case "config":
		if c.Spectator {
			return
		}
		if !m.isOwner(c.Room, c.ID) {
			return // only the room owner reconfigures the table
		}
		var p configPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		m.handleConfig(c.Room, p)
	}
}

func (m *Manager) handleConfig(code string, p configPayload) {
	m.mu.Lock()
	r := m.games[code]
	if r == nil {
		r = game.NewRoom(defaultSB, defaultBB)
		m.games[code] = r
	}
	r.SetConfig(p.SB, p.BB, p.Stack, p.RunItN, p.BlindLevelSecs)
	m.resetBlindTicker(code, r)
	pub := r.PublicMsg()
	m.mu.Unlock()
	m.broadcast(code, pub)
}

func (m *Manager) handleStart(code string) {
	clients := m.hub.Clients(code)
	ids := make([]string, 0, len(clients))
	seen := make(map[string]bool, len(clients))
	for _, c := range clients {
		// Skip spectators and de-duplicate uids: a player with two open tabs
		// shares one seat, never two (which would corrupt the betting roster).
		if c.Spectator || seen[c.ID] {
			continue
		}
		seen[c.ID] = true
		ids = append(ids, c.ID)
	}

	m.mu.Lock()
	r := m.games[code]
	if r == nil {
		r = game.NewRoom(defaultSB, defaultBB)
		m.games[code] = r
	}
	// Cancel any timer left over from a previous hand.
	m.cancelTimerLocked(code)
	// Seat exactly the non-spectator connected players.
	r.SyncSeats(ids)
	for _, c := range clients {
		if !c.Spectator {
			r.SetName(c.ID, c.Name)
		}
	}
	err := r.StartHand()
	if err != nil {
		m.mu.Unlock()
		return
	}
	m.armTimerLocked(code, r)
	pub := r.PublicMsg()
	holes := r.HoleMsgs()
	m.mu.Unlock()

	m.broadcast(code, pub)
	for _, c := range clients {
		if c.Spectator {
			continue
		}
		if h, ok := holes[c.ID]; ok {
			m.sendTo(c, h)
		}
	}
}

// OnJoin pushes the current public state to a client that just connected (and
// its hole cards if it's already in the live hand and is not a spectator).
func (m *Manager) OnJoin(c *hub.Client) {
	m.mu.Lock()
	// First non-spectator to join owns the room (start/config authority).
	if !c.Spectator && m.owners[c.Room] == "" {
		m.owners[c.Room] = c.ID
	}
	r := m.games[c.Room]
	if r == nil {
		m.mu.Unlock()
		return
	}
	if !c.Spectator {
		r.SetName(c.ID, c.Name)
	}
	pub := r.PublicMsg()
	var hole game.ServerMsg
	hasHole := false
	if !c.Spectator && r.InHand(c.ID) {
		if h, ok := r.HoleMsgs()[c.ID]; ok {
			hole, hasHole = h, true
		}
	}
	m.mu.Unlock()

	m.sendTo(c, pub)
	if hasHole {
		m.sendTo(c, hole)
	}
}

// OnLeave folds a player who disconnected mid-hand and rebroadcasts the state.
// Spectator disconnects require no game action.
func (m *Manager) OnLeave(c *hub.Client) {
	if c.Spectator {
		return
	}
	m.mu.Lock()
	// If the owner is leaving, hand control to another connected player.
	if m.owners[c.Room] == c.ID {
		m.reassignOwnerLocked(c.Room, c.ID)
	}
	r := m.games[c.Room]
	if r == nil {
		m.mu.Unlock()
		return
	}
	changed := r.LeaveFold(c.ID)
	if changed {
		m.cancelTimerLocked(c.Room)
		m.armTimerLocked(c.Room, r)
	}
	pub := r.PublicMsg()
	m.mu.Unlock()

	if changed {
		m.broadcast(c.Room, pub)
	}
}

func (m *Manager) handleAction(code, id, action string, amount int) {
	m.mu.Lock()
	r := m.games[code]
	if r == nil {
		m.mu.Unlock()
		return
	}
	m.cancelTimerLocked(code)
	err := r.Action(id, action, amount)
	if err != nil {
		m.mu.Unlock()
		return
	}
	m.armTimerLocked(code, r)
	pub := r.PublicMsg()
	m.mu.Unlock()
	m.broadcast(code, pub)
}

// cancelTimerLocked stops and removes any active turn timer.
// Must be called with m.mu held.
func (m *Manager) cancelTimerLocked(code string) {
	if rt := m.timers[code]; rt != nil {
		rt.timer.Stop()
		m.timers[code] = nil
	}
}

// armTimerLocked sets the turn deadline on the room and schedules the
// auto-action callback if there is an active actor. Must be called with m.mu held.
func (m *Manager) armTimerLocked(code string, r *game.Room) {
	toAct := r.ToAct()
	if toAct == "" {
		r.SetDeadline(0)
		return
	}
	deadline := time.Now().Add(turnTimeout).UnixMilli()
	r.SetDeadline(deadline)
	t := time.AfterFunc(turnTimeout, func() { m.onTimeout(code, toAct) })
	m.timers[code] = &roomTimer{timer: t, forUID: toAct}
}

// onTimeout fires when a player's turn timer expires. Auto-checks if possible,
// otherwise auto-folds, then rebroadcasts.
func (m *Manager) onTimeout(code, expectedUID string) {
	m.mu.Lock()
	r := m.games[code]
	if r == nil {
		m.mu.Unlock()
		return
	}
	rt := m.timers[code]
	if rt == nil || rt.forUID != expectedUID {
		m.mu.Unlock()
		return
	}
	m.timers[code] = nil

	action := "fold"
	if r.CanCheck(expectedUID) {
		action = "check"
	}
	_ = r.Action(expectedUID, action, 0)

	m.armTimerLocked(code, r)
	pub := r.PublicMsg()
	m.mu.Unlock()
	m.broadcast(code, pub)
}

// resetBlindTicker cancels any existing blind ticker for the room and starts a
// new one if the room's BlindLevelSecs > 0. Must be called with m.mu held.
func (m *Manager) resetBlindTicker(code string, r *game.Room) {
	if t := m.blinds[code]; t != nil {
		t.Stop()
		m.blinds[code] = nil
	}
	secs := r.BlindLevelSecs()
	if secs <= 0 {
		return
	}
	t := time.NewTicker(time.Duration(secs) * time.Second)
	m.blinds[code] = t
	go func() {
		for range t.C {
			m.mu.Lock()
			room := m.games[code]
			if room == nil {
				m.mu.Unlock()
				return
			}
			room.EscalateBlinds()
			pub := room.PublicMsg()
			m.mu.Unlock()
			m.broadcast(code, pub)
		}
	}()
}

func (m *Manager) broadcast(code string, msg game.ServerMsg) {
	if b, err := json.Marshal(msg); err == nil {
		m.hub.Broadcast(code, b, nil)
	}
}

func (m *Manager) sendTo(c *hub.Client, msg game.ServerMsg) {
	if b, err := json.Marshal(msg); err == nil {
		m.hub.SendTo(c, b)
	}
}
