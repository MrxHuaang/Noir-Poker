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

// Handler upgrades GET /ws?room=CODE to a WebSocket and relays messages within
// the room. If auth is non-nil, ?token=<firebase-id-token> is required and the
// client id is the verified uid (the ?id query is ignored). If auth is nil
// (dev), ?id=UID is used as-is. Game protocol comes next; for now any text
// frame is rebroadcast to the rest of the room.
func (h *Hub) Handler(auth Authenticator) http.HandlerFunc {
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

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			// Dev: allow any origin. Tighten to the app's origin before prod.
			InsecureSkipVerify: true,
		})
		if err != nil {
			return
		}
		defer conn.CloseNow()

		ctx := r.Context()
		client := h.Join(room, id)
		defer h.Leave(client)

		// Writer goroutine: drain the client's queue to the socket. Ends when
		// Leave closes the queue (on disconnect).
		go func() {
			for msg := range client.Outbound() {
				if err := conn.Write(ctx, websocket.MessageText, msg); err != nil {
					return
				}
			}
		}()

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
			h.Broadcast(room, data, client)
		}
	}
}
