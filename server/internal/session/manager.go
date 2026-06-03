// Package session wires the transport (hub) to the authoritative game engine
// (game). One game.Room per room code. Inbound messages:
//   {"type":"start"}                         -> deal a new hand
//   {"type":"action","payload":{"action":"call","amount":0}} -> betting action
// Fan-out: public "state" to everyone; private "hole" only to its owner. The
// privacy invariant is end-to-end — the deck and opponents' holes never leave
// the server.
package session

import (
	"encoding/json"
	"sync"

	"github.com/MrxHuaang/poker-sim/server/internal/game"
	"github.com/MrxHuaang/poker-sim/server/internal/hub"
)

const (
	defaultStack = 1000
	defaultSB    = 5
	defaultBB    = 10
)

type Manager struct {
	hub   *hub.Hub
	mu    sync.Mutex
	games map[string]*game.Room
}

func NewManager(h *hub.Hub) *Manager {
	return &Manager{hub: h, games: make(map[string]*game.Room)}
}

type actionPayload struct {
	Action string `json:"action"`
	Amount int    `json:"amount"`
}

func (m *Manager) OnMessage(c *hub.Client, data []byte) {
	var msg game.ClientMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}
	switch msg.Type {
	case "start", "deal":
		m.handleStart(c.Room)
	case "action":
		var p actionPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		m.handleAction(c.Room, c.ID, p.Action, p.Amount)
	}
}

func (m *Manager) handleStart(code string) {
	clients := m.hub.Clients(code)
	ids := make([]string, len(clients))
	for i, c := range clients {
		ids[i] = c.ID
	}

	m.mu.Lock()
	r := m.games[code]
	if r == nil {
		r = game.NewRoom(defaultSB, defaultBB)
		m.games[code] = r
	}
	// Seat exactly the connected players (drops anyone who left).
	r.SyncSeats(ids, defaultStack)
	for _, c := range clients {
		r.SetName(c.ID, c.Name)
	}
	err := r.StartHand()
	pub := r.PublicMsg()
	holes := r.HoleMsgs()
	m.mu.Unlock()
	if err != nil {
		return
	}

	m.broadcast(code, pub)
	for _, c := range clients {
		if h, ok := holes[c.ID]; ok {
			m.sendTo(c, h)
		}
	}
}

// OnJoin pushes the current public state to a client that just connected (and
// its hole cards if it's already in the live hand) so joiners/reconnects render
// immediately.
func (m *Manager) OnJoin(c *hub.Client) {
	m.mu.Lock()
	r := m.games[c.Room]
	if r == nil {
		m.mu.Unlock()
		return
	}
	r.SetName(c.ID, c.Name)
	pub := r.PublicMsg()
	var hole game.ServerMsg
	hasHole := false
	if r.InHand(c.ID) {
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
func (m *Manager) OnLeave(c *hub.Client) {
	m.mu.Lock()
	r := m.games[c.Room]
	if r == nil {
		m.mu.Unlock()
		return
	}
	changed := r.LeaveFold(c.ID)
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
	err := r.Action(id, action, amount)
	pub := r.PublicMsg()
	m.mu.Unlock()
	if err != nil {
		return // illegal action: ignore (a future "error" message could notify)
	}
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
