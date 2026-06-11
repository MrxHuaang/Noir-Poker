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
	"log"
	"sort"
	"sync"
	"time"

	"github.com/MrxHuaang/poker-sim/server/internal/game"
	"github.com/MrxHuaang/poker-sim/server/internal/hub"
	"github.com/MrxHuaang/poker-sim/server/internal/store"
)

const (
	defaultSB   = 5
	defaultBB   = 10
	turnTimeout = 30 * time.Second
	// teardownGrace is how long an empty room keeps its state (stacks, hand
	// number, config) before being dropped. Long enough for the leaver's
	// cash-out request to read /stacks and for a brief everyone's-wifi-blip,
	// short enough that abandoned rooms don't accumulate.
	teardownGrace = 2 * time.Minute
)

// roomTimer tracks the active turn timer for a room.
type roomTimer struct {
	timer  *time.Timer
	forUID string
}

// blindTicker escalates blinds on an interval; stop terminates its goroutine.
type blindTicker struct {
	ticker *time.Ticker
	stop   chan struct{}
}

type Manager struct {
	hub      *hub.Hub
	mu       sync.Mutex
	games    map[string]*game.Room
	timers   map[string]*roomTimer
	blinds   map[string]*blindTicker // per-room blind escalation tickers
	owners   map[string]string       // room code -> uid allowed to start/configure
	cleanups map[string]*time.Timer  // per-room delayed teardown when emptied
	store    *store.SupabaseStore    // nil when SUPABASE_URL/SUPABASE_SERVICE_KEY unset
}

func NewManager(h *hub.Hub) *Manager {
	return &Manager{
		hub:      h,
		games:    make(map[string]*game.Room),
		timers:   make(map[string]*roomTimer),
		blinds:   make(map[string]*blindTicker),
		owners:   make(map[string]string),
		cleanups: make(map[string]*time.Timer),
		store:    store.New(),
	}
}

// isOwnerLocked reports whether id may start/configure the room, claiming
// ownership when the room has none (e.g. it was just vacated). Must be called
// with m.mu held.
func (m *Manager) isOwnerLocked(code, id string) bool {
	owner := m.owners[code]
	if owner == "" {
		m.owners[code] = id
		m.syncOwnerLocked(code)
		return true
	}
	return owner == id
}

// reassignOwnerLocked picks a new owner when the current one leaves: the first
// remaining non-spectator client, or none. Must be called with m.mu held.
func (m *Manager) reassignOwnerLocked(code, leavingID string) {
	delete(m.owners, code)
	for _, c := range m.hub.Clients(code) {
		if c.Spectator || c.ID == leavingID {
			continue
		}
		m.owners[code] = c.ID
		break
	}
	m.syncOwnerLocked(code)
}

// syncOwnerLocked mirrors the owner uid into the room so it is published in
// PublicState (clients show start/pause controls only to the owner). Must be
// called with m.mu held.
func (m *Manager) syncOwnerLocked(code string) {
	if r := m.games[code]; r != nil {
		r.SetOwner(m.owners[code])
	}
}

// roomLocked returns the room for code, creating it lazily so that joiners
// receive a state snapshot even before the owner configures or deals. Must be
// called with m.mu held.
func (m *Manager) roomLocked(code string) *game.Room {
	r := m.games[code]
	if r == nil {
		r = game.NewRoom(defaultSB, defaultBB)
		m.games[code] = r
		m.syncOwnerLocked(code)
	}
	return r
}

// connectedPlayerIDs returns the de-duplicated non-spectator client ids in the
// room in ARRIVAL order (a player with two open tabs shares one seat and keeps
// the earliest arrival). The order matters: the room seats the first MaxSeated
// and queues the rest, so first-come must be first-served deterministically.
func (m *Manager) connectedPlayerIDs(code string) []string {
	return m.connectedPlayerIDsExcept(code, nil)
}

// connectedPlayerIDsExcept is connectedPlayerIDs ignoring one specific client
// connection (the one currently disconnecting — the hub still counts it during
// OnLeave). A second open tab of the same uid still keeps the player present.
func (m *Manager) connectedPlayerIDsExcept(code string, except *hub.Client) []string {
	clients := m.hub.Clients(code)
	earliest := make(map[string]int64, len(clients))
	for _, c := range clients {
		if c.Spectator || c == except {
			continue
		}
		if seq, ok := earliest[c.ID]; !ok || c.JoinSeq < seq {
			earliest[c.ID] = c.JoinSeq
		}
	}
	ids := make([]string, 0, len(earliest))
	for id := range earliest {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return earliest[ids[i]] < earliest[ids[j]] })
	return ids
}

// betweenHands reports whether no hand is currently live (roster changes are safe).
func betweenHands(r *game.Room) bool {
	ph := r.Phase()
	return ph == game.PhaseIdle || ph == game.PhaseShowdown
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
		m.mu.Lock()
		allowed := m.isOwnerLocked(c.Room, c.ID)
		m.mu.Unlock()
		if !allowed {
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
		m.mu.Lock()
		allowed := m.isOwnerLocked(c.Room, c.ID)
		m.mu.Unlock()
		if !allowed {
			return // only the room owner reconfigures the table
		}
		var p configPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		m.handleConfig(c.Room, p)
	case "pause":
		if c.Spectator || !m.isOwner(c.Room, c.ID) {
			return
		}
		m.handlePause(c.Room, true)
	case "resume":
		if c.Spectator || !m.isOwner(c.Room, c.ID) {
			return
		}
		m.handlePause(c.Room, false)
	}
}

// isOwner is the lock-acquiring wrapper around isOwnerLocked.
func (m *Manager) isOwner(code, id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.isOwnerLocked(code, id)
}

func (m *Manager) handleConfig(code string, p configPayload) {
	m.mu.Lock()
	r := m.roomLocked(code)
	r.SetConfig(p.SB, p.BB, p.Stack, p.RunItN, p.BlindLevelSecs)
	m.resetBlindTickerLocked(code, r)
	pub := r.PublicMsg()
	m.mu.Unlock()
	m.broadcast(code, pub)
}

func (m *Manager) handleStart(code string) {
	clients := m.hub.Clients(code)
	ids := m.connectedPlayerIDs(code)

	m.mu.Lock()
	r := m.roomLocked(code)
	// Cancel any timer left over from a previous hand.
	m.cancelTimerLocked(code)
	// Seat exactly the non-spectator connected players.
	r.SyncSeats(ids)
	for _, c := range clients {
		if !c.Spectator {
			r.SetName(c.ID, c.Name)
			r.SetSeed(c.ID, c.Seed)
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

// OnJoin seats the newcomer (between hands), pushes the current public state to
// the whole room, and sends the joiner's hole cards if it reconnected mid-hand.
func (m *Manager) OnJoin(c *hub.Client) {
	m.mu.Lock()
	// A join cancels any pending teardown for the room.
	if t := m.cleanups[c.Room]; t != nil {
		t.Stop()
		delete(m.cleanups, c.Room)
	}
	// First non-spectator to join owns the room (start/config authority).
	if !c.Spectator && m.owners[c.Room] == "" {
		m.owners[c.Room] = c.ID
	}
	r := m.roomLocked(c.Room)
	// Mirror the owner into the (possibly pre-existing) room: roomLocked only
	// syncs on creation, and the room may have been vacated and re-entered.
	m.syncOwnerLocked(c.Room)
	if !c.Spectator {
		r.SetName(c.ID, c.Name)
		r.SetSeed(c.ID, c.Seed)
		// Between hands, reflect connected players as seats immediately so the
		// table shows who is waiting (instead of an empty roster until the deal).
		// At showdown the finished hand's seats stay on display (PublicMsg reads
		// them from the betting snapshot); the roster just gains the newcomer.
		if betweenHands(r) {
			r.SyncSeats(m.connectedPlayerIDs(c.Room))
		}
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

	m.broadcast(c.Room, pub)
	if hasHole {
		m.sendTo(c, hole)
	}
}

// OnLeave folds a player who disconnected mid-hand, stands them up between
// hands (parking their stack for the cash-out read), persists the hand if the
// disconnect ended it, and schedules a teardown when the room empties.
func (m *Manager) OnLeave(c *hub.Client) {
	m.mu.Lock()
	// If the owner is leaving, hand control to another connected player.
	if !c.Spectator && m.owners[c.Room] == c.ID {
		m.reassignOwnerLocked(c.Room, c.ID)
	}
	r := m.games[c.Room]
	if r == nil {
		m.mu.Unlock()
		return
	}

	var rec *store.HandRecord
	changed := false
	if !c.Spectator {
		changed = r.LeaveFold(c.ID)
		if changed {
			m.cancelTimerLocked(c.Room)
			m.armTimerLocked(c.Room, r)
			if r.Phase() == game.PhaseShowdown {
				// The disconnect ended the hand: persist it like any showdown.
				rec = m.buildRecord(c.Room, r)
				m.pruneDisconnectedLocked(c.Room, r, c.ID)
			}
		}
		if betweenHands(r) {
			ids := m.connectedPlayerIDsExcept(c.Room, c)
			stillHere := false
			for _, id := range ids {
				if id == c.ID {
					stillHere = true // another tab of the same uid remains
					break
				}
			}
			if !stillHere {
				// Standing up outside a live hand: park the stack for cash-out.
				r.RemoveSeat(c.ID)
			}
			// Re-sync the roster: drops the leaver from the waiting list too
			// and promotes the head of the queue into the freed seat.
			r.SyncSeats(ids)
		}
	}

	// Last client out (the hub still counts the leaver): schedule the teardown.
	if m.othersRemaining(c) == 0 {
		m.scheduleTeardownLocked(c.Room)
		m.mu.Unlock()
		if rec != nil {
			go m.persistHand(*rec)
		}
		return
	}

	pub := r.PublicMsg()
	m.mu.Unlock()

	m.broadcast(c.Room, pub)
	if rec != nil {
		go m.persistHand(*rec)
	}
}

// othersRemaining counts clients in the room besides the given one.
func (m *Manager) othersRemaining(c *hub.Client) int {
	n := 0
	for _, other := range m.hub.Clients(c.Room) {
		if other != c {
			n++
		}
	}
	return n
}

// pruneDisconnectedLocked stands up every seated player with no live connection
// (run after a hand settles). Their stacks are parked in `departed` so a
// pending cash-out can still read them. `alsoGone` treats one extra id as
// disconnected (the client currently leaving). Must be called with m.mu held.
func (m *Manager) pruneDisconnectedLocked(code string, r *game.Room, alsoGone string) {
	connected := make(map[string]bool)
	for _, c := range m.hub.Clients(code) {
		if !c.Spectator {
			connected[c.ID] = true
		}
	}
	if alsoGone != "" {
		delete(connected, alsoGone)
	}
	for _, id := range r.Seats() {
		if !connected[id] {
			r.RemoveSeat(id)
		}
	}
}

// scheduleTeardownLocked drops the room state after a grace period if it is
// still empty. The grace keeps stacks readable for the leaver's cash-out and
// survives a brief everyone-disconnected blip. Must be called with m.mu held.
func (m *Manager) scheduleTeardownLocked(code string) {
	if t := m.cleanups[code]; t != nil {
		t.Stop()
	}
	m.cleanups[code] = time.AfterFunc(teardownGrace, func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		delete(m.cleanups, code)
		if m.hub.RoomSize(code) > 0 {
			return // someone came back; OnJoin also cancels, this is a backstop
		}
		m.cancelTimerLocked(code)
		m.stopBlindTickerLocked(code)
		delete(m.games, code)
		delete(m.owners, code)
	})
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
		// Invalid action: re-arm the timer so the actor is not left unclocked.
		m.armTimerLocked(code, r)
		m.mu.Unlock()
		return
	}
	m.armTimerLocked(code, r)
	atShowdown := r.Phase() == game.PhaseShowdown
	var rec *store.HandRecord
	if atShowdown {
		rec = m.buildRecord(code, r)
		m.pruneDisconnectedLocked(code, r, "")
	}
	pub := r.PublicMsg()
	m.mu.Unlock()
	m.broadcast(code, pub)
	if rec != nil {
		go m.persistHand(*rec)
	}
}

// Stacks returns the live per-player stacks for a room, or nil when the room
// does not exist (expired or never created). Read by the economy backend at
// cash-out via GET /stacks.
func (m *Manager) Stacks(code string) map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.games[code]
	if r == nil {
		return nil
	}
	return r.Stacks()
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
	atShowdown := r.Phase() == game.PhaseShowdown
	pub := r.PublicMsg()
	var rec *store.HandRecord
	if atShowdown {
		rec = m.buildRecord(code, r)
		m.pruneDisconnectedLocked(code, r, "")
	}
	m.mu.Unlock()
	m.broadcast(code, pub)
	if rec != nil {
		go m.persistHand(*rec)
	}
}

// resetBlindTickerLocked cancels any existing blind ticker for the room and
// starts a new one if the room's BlindLevelSecs > 0. Must be called with m.mu held.
func (m *Manager) resetBlindTickerLocked(code string, r *game.Room) {
	m.stopBlindTickerLocked(code)
	secs := r.BlindLevelSecs()
	if secs <= 0 {
		return
	}
	bt := &blindTicker{
		ticker: time.NewTicker(time.Duration(secs) * time.Second),
		stop:   make(chan struct{}),
	}
	m.blinds[code] = bt
	go func() {
		for {
			select {
			case <-bt.stop:
				return
			case <-bt.ticker.C:
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
		}
	}()
}

// stopBlindTickerLocked stops the room's blind ticker (and its goroutine).
// Must be called with m.mu held.
func (m *Manager) stopBlindTickerLocked(code string) {
	if bt := m.blinds[code]; bt != nil {
		bt.ticker.Stop()
		close(bt.stop)
		delete(m.blinds, code)
	}
}

// handlePause pauses or resumes the game. Cancels the turn timer when pausing
// (no auto-fold during a break); re-arms it on resume if there is an active actor.
func (m *Manager) handlePause(code string, pause bool) {
	m.mu.Lock()
	r := m.games[code]
	if r == nil {
		m.mu.Unlock()
		return
	}
	if pause {
		r.Pause()
		m.cancelTimerLocked(code)
	} else {
		r.Resume()
		m.armTimerLocked(code, r)
	}
	pub := r.PublicMsg()
	m.mu.Unlock()
	m.broadcast(code, pub)
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

// buildRecord snapshots the room state into a HandRecord. Must be called with
// m.mu held (reads room fields via exported getters).
func (m *Manager) buildRecord(code string, r *game.Room) *store.HandRecord {
	winners := r.Winners()
	wrs := make([]store.WinnerRecord, len(winners))
	for i, w := range winners {
		wrs[i] = store.WinnerRecord{ID: w.ID, Amount: w.Amount}
	}
	clients := m.hub.Clients(code)
	seatIDs := make([]string, 0, len(clients))
	seen := make(map[string]bool)
	for _, c := range clients {
		if !c.Spectator && !seen[c.ID] {
			seen[c.ID] = true
			seatIDs = append(seatIDs, c.ID)
		}
	}
	var reveals map[string][]string
	if rv := r.Reveals(); len(rv) > 0 {
		reveals = rv
	}
	return &store.HandRecord{
		Room:       code,
		HandNum:    r.HandNum(),
		PlayedAt:   time.Now().UTC(),
		Pot:        r.Pot(),
		Community:  r.Board(),
		Winners:    wrs,
		Reveals:    reveals,
		Categories: r.HandCategories(),
		SeatIDs:    seatIDs,
		SeatNames:  r.SeatNames(),
	}
}

// persistHand writes the record to the durable store. Called in a goroutine.
func (m *Manager) persistHand(rec store.HandRecord) {
	if err := m.store.RecordHand(rec); err != nil {
		log.Printf("store: failed to persist hand %s#%d: %v", rec.Room, rec.HandNum, err)
	}
}
