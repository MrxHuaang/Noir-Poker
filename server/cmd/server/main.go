// Command server is the entry point for the authoritative poker game server.
//
// Foundation only: serves /health and demonstrates an authoritative deal
// (server owns the deck, shuffles with crypto/rand). The real-time WebSocket
// hub + game loop (clients receive only their own private hole cards) is the
// next phase — see server/README.md.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/MrxHuaang/poker-sim/server/internal/auth"
	"github.com/MrxHuaang/poker-sim/server/internal/hub"
	"github.com/MrxHuaang/poker-sim/server/internal/poker"
	"github.com/MrxHuaang/poker-sim/server/internal/session"
)

func main() {
	mux := http.NewServeMux()
	h := hub.New()

	// Auth: when a Firebase project id is configured, the WS handshake requires
	// a valid Firebase ID token (?token=...). Without it (dev), connections are
	// open and use ?id=UID directly.
	var authFn hub.Authenticator
	if projectID := firstNonEmpty(os.Getenv("FIREBASE_PROJECT_ID"), os.Getenv("FIREBASE_ADMIN_PROJECT_ID")); projectID != "" {
		authFn = auth.NewVerifier(projectID).Verify
		log.Printf("WS auth enabled for Firebase project %s", projectID)
	} else {
		log.Print("WS auth disabled (set FIREBASE_PROJECT_ID to enable)")
	}

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Real-time game socket. GET /ws?room=CODE upgrades to a WebSocket; inbound
	// messages are dispatched to the session manager, which runs the
	// authoritative game and fans out public state + per-seat private holes.
	mgr := session.NewManager(h)
	mux.HandleFunc("/ws", h.Handler(authFn, mgr.OnMessage))

	// Debug: prove authoritative dealing. Shuffles a fresh deck server-side and
	// returns the top cards as ids. The real game never exposes the full deck.
	mux.HandleFunc("/debug/deal", func(w http.ResponseWriter, _ *http.Request) {
		deck := poker.NewDeck()
		poker.Shuffle(deck)
		top := make([]string, 0, 5)
		for _, c := range deck[:5] {
			top = append(top, c.ID())
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"top5": top})
	})

	addr := ":" + port()
	log.Printf("poker game server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func port() string {
	if p := os.Getenv("PORT"); p != "" {
		return p
	}
	return "8080"
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
