package hub

import (
	"context"
	"errors"
	"net/http"

	"github.com/coder/websocket"
)

// Authenticator verifies a token and returns the caller's uid. With a non-nil
// authenticator the handler rejects connections without a valid token.
type Authenticator func(ctx context.Context, token string) (uid string, err error)

// Handler upgrades GET /ws?room=CODE to a WebSocket. If auth is non-nil,
// ?token=<firebase-id-token> is required and the client id is the verified uid.
// onJoin (if set) fires once the client is registered (e.g. to push current
// state); onLeave fires on disconnect while the client is still in the room
// (e.g. to fold them). Each inbound frame is dispatched to onMessage; when
// onMessage is nil the frame is rebroadcast to the room (dev/relay fallback).
func (h *Hub) Handler(
	auth Authenticator,
	onJoin func(c *Client),
	onLeave func(c *Client),
	onMessage func(c *Client, data []byte),
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		room := r.URL.Query().Get("room")
		if room == "" {
			http.Error(w, "missing room", http.StatusBadRequest)
			return
		}
		id := r.URL.Query().Get("id")
		if auth != nil {
			uid, err := auth(r.Context(), r.URL.Query().Get("token"))
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			id = uid
		}
		if id == "" {
			id = "anon"
		}

		// Origin check: when AllowedOrigins is configured, the websocket library
		// verifies the request Origin host against these patterns. Without it we
		// fall back to allow-any (dev only).
		opts := &websocket.AcceptOptions{}
		if len(h.AllowedOrigins) > 0 {
			opts.OriginPatterns = h.AllowedOrigins
		} else {
			opts.InsecureSkipVerify = true
		}
		conn, err := websocket.Accept(w, r, opts)
		if err != nil {
			return
		}
		defer conn.CloseNow()

		ctx := r.Context()
		client := h.Join(room, id, r.URL.Query().Get("name"))
		if r.URL.Query().Get("spectator") == "1" {
			client.Spectator = true
		}
		// On disconnect: onLeave (while still registered) then Leave.
		defer func() {
			if onLeave != nil {
				onLeave(client)
			}
			h.Leave(client)
		}()

		// Writer goroutine: drain the client's queue to the socket. Ends when
		// Leave closes the queue (on disconnect).
		go func() {
			for msg := range client.Outbound() {
				if err := conn.Write(ctx, websocket.MessageText, msg); err != nil {
					return
				}
			}
		}()

		if onJoin != nil {
			onJoin(client)
		}

		// Reader loop: every inbound frame is broadcast to the rest of the room.
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				var ce websocket.CloseError
				if errors.As(err, &ce) || ctx.Err() != nil {
					return
				}
				return
			}
			if onMessage != nil {
				onMessage(client, data)
			} else {
				h.Broadcast(room, data, client)
			}
		}
	}
}
