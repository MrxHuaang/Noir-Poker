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

	m.mu.Lock()
	r := m.games[code]
	if r == nil {
		r = game.NewRoom(defaultSB, defaultBB)
		m.games[code] = r
	}
	seated := map[string]bool{}
	for _, id := range r.Seats() {
		seated[id] = true
	}
	for _, c := range clients {
		if !seated[c.ID] {
			r.AddSeat(c.ID, defaultStack)
		}
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
