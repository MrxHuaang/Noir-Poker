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
	"strings"

	"github.com/MrxHuaang/poker-sim/server/internal/auth"
	"github.com/MrxHuaang/poker-sim/server/internal/hub"
	"github.com/MrxHuaang/poker-sim/server/internal/poker"
	"github.com/MrxHuaang/poker-sim/server/internal/session"
)

func main() {
	mux := http.NewServeMux()
	h := hub.New()

	// Auth: when a Firebase project id is configured, the WS handshake requires
	// a valid Firebase ID token (?token=...). Without it the server FAILS CLOSED
	// in production: open connections are only allowed when ALLOW_DEV_OPEN_WS=true
	// is set explicitly (dev/CI), so a misconfigured deploy can never silently
	// expose an unauthenticated socket.
	var authFn hub.Authenticator
	if projectID := firstNonEmpty(os.Getenv("FIREBASE_PROJECT_ID"), os.Getenv("FIREBASE_ADMIN_PROJECT_ID")); projectID != "" {
		authFn = auth.NewVerifier(projectID).Verify
		log.Printf("WS auth enabled for Firebase project %s", projectID)
	} else if os.Getenv("ALLOW_DEV_OPEN_WS") == "true" {
		log.Print("WARNING: WS auth disabled (ALLOW_DEV_OPEN_WS=true). Do not use in production.")
	} else {
		log.Fatal("refusing to start: set FIREBASE_PROJECT_ID to enable WS auth, or ALLOW_DEV_OPEN_WS=true for an explicitly open dev server")
	}

	// Origin allow-list for the WS upgrade. When ALLOWED_ORIGINS is set (comma
	// separated hosts), only those origins may connect; otherwise any origin is
	// accepted (dev). Tighten this in production via the env var.
	h.AllowedOrigins = splitOrigins(os.Getenv("ALLOWED_ORIGINS"))

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Real-time game socket. GET /ws?room=CODE upgrades to a WebSocket; inbound
	// messages are dispatched to the session manager, which runs the
	// authoritative game and fans out public state + per-seat private holes.
	mgr := session.NewManager(h)
	mux.HandleFunc("/ws", h.Handler(authFn, mgr.OnJoin, mgr.OnLeave, mgr.OnMessage))

	// Room list: returns all active rooms with player count. Used by the lobby UI.
	// CORS is restricted to the configured origins (or any origin in dev).
	mux.HandleFunc("/rooms", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		setCORS(w, r, h.AllowedOrigins)
		_ = json.NewEncoder(w).Encode(h.RoomsSnapshot())
	})

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

// setCORS sets Access-Control-Allow-Origin. With no allow-list configured it
// falls back to "*" (dev). Otherwise it echoes the request Origin only when it
// is in the allow-list, so room codes are not readable from arbitrary origins.
func setCORS(w http.ResponseWriter, r *http.Request, allowed []string) {
	if len(allowed) == 0 {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		return
	}
	origin := r.Header.Get("Origin")
	for _, a := range allowed {
		if a == origin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			return
		}
	}
}

// splitOrigins parses a comma-separated origin list, trimming blanks. Returns
// nil (allow-any, dev) when the input is empty.
func splitOrigins(raw string) []string {
	if raw == "" {
		return nil
	}
	out := make([]string, 0)
	for _, p := range strings.Split(raw, ",") {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}
