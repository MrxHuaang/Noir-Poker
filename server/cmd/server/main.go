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

	"github.com/MrxHuaang/poker-sim/server/internal/poker"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
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
