package session

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/MrxHuaang/poker-sim/server/internal/game"
	"github.com/MrxHuaang/poker-sim/server/internal/hub"
)

func readMsgs(t *testing.T, c *websocket.Conn, n int) [][]byte {
	t.Helper()
	out := make([][]byte, 0, n)
	for i := 0; i < n; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, data, err := c.Read(ctx)
		cancel()
		if err != nil {
			t.Fatalf("read %d/%d: %v", i+1, n, err)
		}
		out = append(out, data)
	}
	return out
}

func holeFrom(t *testing.T, msgs [][]byte) []string {
	t.Helper()
	for _, raw := range msgs {
		var sm game.ServerMsg
		if json.Unmarshal(raw, &sm) != nil || sm.Type != "hole" {
			continue
		}
		var ph game.PrivateHole
		if err := json.Unmarshal(sm.Payload, &ph); err != nil {
			t.Fatalf("decode hole: %v", err)
		}
		return ph.Cards
	}
	t.Fatalf("no hole message in %v", msgs)
	return nil
}

func hasType(msgs [][]byte, typ string) bool {
	for _, raw := range msgs {
		var sm game.ServerMsg
		if json.Unmarshal(raw, &sm) == nil && sm.Type == typ {
			return true
		}
	}
	return false
}

func TestDealFanOutAndPrivacy(t *testing.T) {
	h := hub.New()
	mgr := NewManager(h)
	srv := httptest.NewServer(h.Handler(nil, mgr.OnJoin, mgr.OnLeave, mgr.OnMessage))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	ctx := context.Background()

	a, _, err := websocket.Dial(ctx, wsURL+"?room=R&id=alice", nil)
	if err != nil {
		t.Fatalf("dial a: %v", err)
	}
	defer a.CloseNow()
	b, _, err := websocket.Dial(ctx, wsURL+"?room=R&id=bob", nil)
	if err != nil {
		t.Fatalf("dial b: %v", err)
	}
	defer b.CloseNow()

	deadline := time.Now().Add(2 * time.Second)
	for h.RoomSize("R") < 2 {
		if time.Now().After(deadline) {
			t.Fatal("clients did not both join")
		}
		time.Sleep(5 * time.Millisecond)
	}

	if err := a.Write(ctx, websocket.MessageText, []byte(`{"type":"deal"}`)); err != nil {
		t.Fatalf("write deal: %v", err)
	}

	// Each client receives a public "state" broadcast + its own private "hole".
	aMsgs := readMsgs(t, a, 2)
	bMsgs := readMsgs(t, b, 2)

	if !hasType(aMsgs, "state") || !hasType(bMsgs, "state") {
		t.Fatal("both clients should receive a public state")
	}
	aHole := holeFrom(t, aMsgs)
	bHole := holeFrom(t, bMsgs)
	if len(aHole) != 2 || len(bHole) != 2 {
		t.Fatalf("holes: a=%v b=%v", aHole, bHole)
	}

	// End-to-end privacy: bob's cards must never appear in anything alice
	// received, and vice versa.
	for _, raw := range aMsgs {
		for _, c := range bHole {
			if strings.Contains(string(raw), c) {
				t.Fatalf("bob's card %s leaked to alice: %s", c, raw)
			}
		}
	}
	for _, raw := range bMsgs {
		for _, c := range aHole {
			if strings.Contains(string(raw), c) {
				t.Fatalf("alice's card %s leaked to bob: %s", c, raw)
			}
		}
	}
}

func dial(t *testing.T, wsURL, id string) *websocket.Conn {
	t.Helper()
	c, _, err := websocket.Dial(context.Background(), wsURL+"?room=R&id="+id, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", id, err)
	}
	return c
}

func waitJoined(t *testing.T, h *hub.Hub, n int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for h.RoomSize("R") < n {
		if time.Now().After(deadline) {
			t.Fatalf("only %d/%d joined", h.RoomSize("R"), n)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestJoinReceivesCurrentState(t *testing.T) {
	h := hub.New()
	mgr := NewManager(h)
	srv := httptest.NewServer(h.Handler(nil, mgr.OnJoin, mgr.OnLeave, mgr.OnMessage))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	a := dial(t, wsURL, "alice")
	defer a.CloseNow()
	b := dial(t, wsURL, "bob")
	defer b.CloseNow()
	waitJoined(t, h, 2)

	a.Write(context.Background(), websocket.MessageText, []byte(`{"type":"start"}`))
	readMsgs(t, a, 2)
	readMsgs(t, b, 2)

	// A late joiner gets the current state immediately (no action needed).
	c := dial(t, wsURL, "carol")
	defer c.CloseNow()
	msgs := readMsgs(t, c, 1)
	if !hasType(msgs, "state") {
		t.Fatalf("late joiner should receive current state, got %v", msgs)
	}
}

func TestDisconnectFoldsAndAwards(t *testing.T) {
	h := hub.New()
	mgr := NewManager(h)
	srv := httptest.NewServer(h.Handler(nil, mgr.OnJoin, mgr.OnLeave, mgr.OnMessage))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	a := dial(t, wsURL, "alice")
	defer a.CloseNow()
	b := dial(t, wsURL, "bob")
	waitJoined(t, h, 2)

	a.Write(context.Background(), websocket.MessageText, []byte(`{"type":"start"}`))
	readMsgs(t, a, 2)
	readMsgs(t, b, 2)

	// bob leaves mid-hand -> server folds him -> alice wins -> showdown.
	b.CloseNow()

	found := false
	for i := 0; i < 3 && !found; i++ {
		for _, raw := range readMsgs(t, a, 1) {
			var sm game.ServerMsg
			if json.Unmarshal(raw, &sm) != nil || sm.Type != "state" {
				continue
			}
			var ps game.PublicState
			if json.Unmarshal(sm.Payload, &ps) == nil && (ps.Phase == "showdown" || len(ps.Winners) > 0) {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("alice should receive a showdown/winner state after bob disconnects")
	}
}
