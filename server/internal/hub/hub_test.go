package hub

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestHubBroadcastSkipsSender(t *testing.T) {
	h := New()
	a := h.Join("R", "a")
	b := h.Join("R", "b")
	if got := h.RoomSize("R"); got != 2 {
		t.Fatalf("RoomSize = %d, want 2", got)
	}

	h.Broadcast("R", []byte("hello"), a) // a is the sender, should be skipped

	select {
	case msg := <-b.Outbound():
		if string(msg) != "hello" {
			t.Fatalf("b got %q, want hello", msg)
		}
	default:
		t.Fatal("b did not receive broadcast")
	}
	select {
	case <-a.Outbound():
		t.Fatal("sender a should not receive its own broadcast")
	default:
	}
}

func TestHubLeaveRemovesRoom(t *testing.T) {
	h := New()
	a := h.Join("R", "a")
	h.Leave(a)
	if got := h.RoomSize("R"); got != 0 {
		t.Fatalf("RoomSize after leave = %d, want 0", got)
	}
}

func TestWebSocketRelay(t *testing.T) {
	h := New()
	srv := httptest.NewServer(h.Handler(nil, nil))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	ctx := context.Background()
	a, _, err := websocket.Dial(ctx, wsURL+"?room=R&id=a", nil)
	if err != nil {
		t.Fatalf("dial a: %v", err)
	}
	defer a.CloseNow()
	b, _, err := websocket.Dial(ctx, wsURL+"?room=R&id=b", nil)
	if err != nil {
		t.Fatalf("dial b: %v", err)
	}
	defer b.CloseNow()

	// Wait until both clients have registered (no arbitrary sleep).
	deadline := time.Now().Add(2 * time.Second)
	for h.RoomSize("R") < 2 {
		if time.Now().After(deadline) {
			t.Fatal("clients did not both join in time")
		}
		time.Sleep(5 * time.Millisecond)
	}

	if err := a.Write(ctx, websocket.MessageText, []byte("hi from a")); err != nil {
		t.Fatalf("write: %v", err)
	}

	rctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_, data, err := b.Read(rctx)
	if err != nil {
		t.Fatalf("b read: %v", err)
	}
	if string(data) != "hi from a" {
		t.Fatalf("b got %q, want %q", data, "hi from a")
	}
}
