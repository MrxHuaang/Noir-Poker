// Package hub is the real-time fan-out layer for the game server: rooms of
// connected clients with thread-safe join/leave/broadcast. This is the
// transport substrate the authoritative game loop will sit on top of — for now
// it just relays messages within a room.
package hub

import "sync"

// Client is one connected participant in a room. send is its outbound queue;
// the WebSocket writer goroutine drains it.
type Client struct {
	ID   string
	Room string
	send chan []byte
}

// Outbound is the channel of messages to write to this client's socket.
func (c *Client) Outbound() <-chan []byte { return c.send }

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*Client]struct{}
}

func New() *Hub {
	return &Hub{rooms: make(map[string]map[*Client]struct{})}
}

// Join registers a new client in room and returns it.
func (h *Hub) Join(room, id string) *Client {
	c := &Client{ID: id, Room: room, send: make(chan []byte, 32)}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = make(map[*Client]struct{})
	}
	h.rooms[room][c] = struct{}{}
	return c
}

// Leave removes a client and closes its outbound queue. Safe to call once per
// client; the close + removal happen under the same lock that Broadcast takes,
// so no send-on-closed-channel can race.
func (h *Hub) Leave(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.rooms[c.Room]
	if set == nil {
		return
	}
	if _, ok := set[c]; !ok {
		return
	}
	delete(set, c)
	if len(set) == 0 {
		delete(h.rooms, c.Room)
	}
	close(c.send)
}

// Broadcast delivers msg to every client in room except `except` (pass nil to
// include all). Slow consumers are skipped rather than blocking the hub.
func (h *Hub) Broadcast(room string, msg []byte, except *Client) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[room] {
		if c == except {
			continue
		}
		select {
		case c.send <- msg:
		default: // drop for a backed-up client; never block other peers
		}
	}
}

// RoomSize returns the number of clients currently in room.
func (h *Hub) RoomSize(room string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[room])
}
