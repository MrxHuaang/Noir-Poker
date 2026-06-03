// Package session wires the transport (hub) to the authoritative game core
// (game). It owns one game.Room per room code, dispatches inbound client
// messages, and fans results out: public state to everyone, private hole cards
// only to their owner via Hub.SendTo. This is where the privacy invariant
// becomes end-to-end (deck/opponent holes never leave the server).
package session

import (
	"encoding/json"
	"sync"

	"github.com/MrxHuaang/poker-sim/server/internal/game"
	"github.com/MrxHuaang/poker-sim/server/internal/hub"
)

type Manager struct {
	hub   *hub.Hub
	mu    sync.Mutex
	games map[string]*game.Room
}

func NewManager(h *hub.Hub) *Manager {
	return &Manager{hub: h, games: make(map[string]*game.Room)}
}

// OnMessage is the hub's per-frame callback. Unknown/invalid messages are
// ignored (the protocol grows as the betting state machine lands).
func (m *Manager) OnMessage(c *hub.Client, data []byte) {
	var msg game.ClientMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}
	switch msg.Type {
	case "deal":
		m.handleDeal(c.Room)
	}
}

func (m *Manager) room(code string) *game.Room {
	if g := m.games[code]; g != nil {
		return g
	}
	g := game.NewRoom()
	m.games[code] = g
	return g
}

func (m *Manager) handleDeal(code string) {
	clients := m.hub.Clients(code)
	ids := make([]string, len(clients))
	for i, c := range clients {
		ids[i] = c.ID
	}

	m.mu.Lock()
	g := m.room(code)
	g.SetSeats(ids)
	res, err := g.Deal()
	m.mu.Unlock()
	if err != nil {
		return // e.g. <2 seats; nothing to deal yet
	}

	if pub, err := json.Marshal(res.Public); err == nil {
		m.hub.Broadcast(code, pub, nil)
	}
	for _, c := range clients {
		priv, ok := res.Private[c.ID]
		if !ok {
			continue
		}
		if b, err := json.Marshal(priv); err == nil {
			m.hub.SendTo(c, b) // only this seat's owner receives its holes
		}
	}
}
