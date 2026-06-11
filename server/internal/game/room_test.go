package game

import (
	"encoding/json"
	"testing"

	"github.com/MrxHuaang/poker-sim/server/internal/poker"
)

func decodePayload(t *testing.T, msg ServerMsg, v any) {
	t.Helper()
	if err := json.Unmarshal(msg.Payload, v); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
}

func deckOf(t *testing.T, ids ...string) []poker.Card {
	t.Helper()
	return cards(t, ids...)
}

func TestStartHandNeedsTwoFunded(t *testing.T) {
	r := NewRoom(5, 10)
	r.AddSeat("p1", 1000)
	if err := r.StartHand(); err != ErrNotEnoughPlayers {
		t.Fatalf("want ErrNotEnoughPlayers, got %v", err)
	}
}

// Full heads-up hand to showdown on a deterministic deck. p1 (AA) beats p2 (KK).
func TestFullHeadsUpHandToShowdown(t *testing.T) {
	r := NewRoom(5, 10)
	r.AddSeat("p1", 1000)
	r.AddSeat("p2", 1000)
	// Deal order (no burns): p1=deck[0,1], p2=deck[2,3], flop=4,5,6, turn=7, river=8.
	deck := deckOf(t, "AS", "AH", "KS", "KH", "2C", "7D", "9S", "JH", "3C")
	if err := r.startHandWithDeck(deck); err != nil {
		t.Fatalf("start: %v", err)
	}

	// HU preflop: button=p1=SB acts first. call, check; then check it down.
	steps := []string{"call", "check", "check", "check", "check", "check", "check", "check"}
	for i, act := range steps {
		id := r.betting.ToAct
		if id == "" {
			t.Fatalf("step %d (%s): no one to act, phase=%s", i, act, r.phase)
		}
		if err := r.Action(id, act, 0); err != nil {
			t.Fatalf("step %d %s by %s: %v", i, act, id, err)
		}
	}

	if r.Phase() != PhaseShowdown {
		t.Fatalf("phase = %s, want showdown", r.Phase())
	}
	w := r.Winners()
	if len(w) != 1 || w[0].ID != "p1" || w[0].Amount != 20 {
		t.Fatalf("winners = %+v, want [{p1 20}]", w)
	}
	if r.Chips("p1") != 1010 || r.Chips("p2") != 990 {
		t.Fatalf("chips p1=%d p2=%d, want 1010/990", r.Chips("p1"), r.Chips("p2"))
	}
	if r.Chips("p1")+r.Chips("p2") != 2000 {
		t.Fatal("chip conservation broken")
	}
}

func TestShowdownRevealsContested(t *testing.T) {
	r := NewRoom(5, 10)
	r.AddSeat("p1", 1000)
	r.AddSeat("p2", 1000)
	if err := r.startHandWithDeck(deckOf(t, "AS", "AH", "KS", "KH", "2C", "7D", "9S", "JH", "3C")); err != nil {
		t.Fatal(err)
	}
	for _, act := range []string{"call", "check", "check", "check", "check", "check", "check", "check"} {
		if err := r.Action(r.betting.ToAct, act, 0); err != nil {
			t.Fatalf("%s: %v", act, err)
		}
	}
	if len(r.reveals) != 2 {
		t.Fatalf("contested showdown should reveal 2 hands, got %d", len(r.reveals))
	}
	var ps PublicState
	decodePayload(t, r.PublicMsg(), &ps)
	if len(ps.Reveals["p1"]) != 2 || len(ps.Reveals["p2"]) != 2 {
		t.Fatalf("PublicMsg reveals missing: %+v", ps.Reveals)
	}
}

func TestMultiHandRotatesButtonAndCarriesChips(t *testing.T) {
	r := NewRoom(5, 10)
	r.AddSeat("p1", 1000)
	r.AddSeat("p2", 1000)
	deck := deckOf(t, "AS", "AH", "KS", "KH", "2C", "7D", "9S", "JH", "3C")
	if err := r.startHandWithDeck(deck); err != nil {
		t.Fatal(err)
	}
	for _, act := range []string{"call", "check", "check", "check", "check", "check", "check", "check"} {
		_ = r.Action(r.betting.ToAct, act, 0)
	}
	// Hand 1: p1 won -> 1010 / 990. Start hand 2 with rotated button.
	if err := r.startHandWithDeck(deck); err != nil {
		t.Fatal(err)
	}
	if r.HandNum() != 2 {
		t.Fatalf("handNum = %d, want 2", r.HandNum())
	}
	// HU hand 2: button=1 (p2) = SB, p1 = BB. Stacks carried then blinds posted:
	// p1 1010 - BB10 = 1000, p2 990 - SB5 = 985.
	p1, _ := r.betting.seatByID("p1")
	p2, _ := r.betting.seatByID("p2")
	if p1.Chips != 1000 || p2.Chips != 985 {
		t.Fatalf("carried chips wrong: p1=%d p2=%d, want 1000/985", p1.Chips, p2.Chips)
	}
}

// A live hand cannot be restarted: a mid-hand redeal would annul the pot.
func TestStartHandRejectedMidHand(t *testing.T) {
	r := NewRoom(5, 10)
	r.AddSeat("p1", 1000)
	r.AddSeat("p2", 1000)
	deck := deckOf(t, "AS", "AH", "KS", "KH", "2C", "7D", "9S", "JH", "3C")
	if err := r.startHandWithDeck(deck); err != nil {
		t.Fatalf("start: %v", err)
	}
	if err := r.startHandWithDeck(deck); err != ErrHandInProgress {
		t.Fatalf("mid-hand restart: want ErrHandInProgress, got %v", err)
	}
	// After the hand settles, a new hand may start again.
	for _, act := range []string{"call", "check", "check", "check", "check", "check", "check", "check"} {
		_ = r.Action(r.betting.ToAct, act, 0)
	}
	if err := r.startHandWithDeck(deck); err != nil {
		t.Fatalf("restart after showdown: %v", err)
	}
}

// Stacks reflects live betting chips mid-hand and parks departed stacks until
// the player rejoins (cash-out reads them after the WS already closed).
func TestStacksAndDepartedLifecycle(t *testing.T) {
	r := NewRoom(5, 10)
	r.AddSeat("p1", 1000)
	r.AddSeat("p2", 1000)
	deck := deckOf(t, "AS", "AH", "KS", "KH", "2C", "7D", "9S", "JH", "3C")
	if err := r.startHandWithDeck(deck); err != nil {
		t.Fatalf("start: %v", err)
	}
	// Mid-hand: blinds already posted (p1 SB 5, p2 BB 10) -> live stacks shrink.
	st := r.Stacks()
	if st["p1"] != 995 || st["p2"] != 990 {
		t.Fatalf("mid-hand stacks = %+v, want p1=995 p2=990", st)
	}
	for _, act := range []string{"call", "check", "check", "check", "check", "check", "check", "check"} {
		_ = r.Action(r.betting.ToAct, act, 0)
	}
	// Post-hand (p1 wins 20): persisted stacks.
	st = r.Stacks()
	if st["p1"] != 1010 || st["p2"] != 990 {
		t.Fatalf("post-hand stacks = %+v, want p1=1010 p2=990", st)
	}
	// p2 stands up: stack parks in departed, still visible to Stacks.
	r.RemoveSeat("p2")
	st = r.Stacks()
	if st["p2"] != 990 {
		t.Fatalf("departed stack lost: %+v", st)
	}
	if got := len(r.Seats()); got != 1 {
		t.Fatalf("roster size = %d, want 1", got)
	}
	// p2 rejoins: fresh seat at startStack, departed entry cleared.
	r.SyncSeats([]string{"p1", "p2"})
	st = r.Stacks()
	if st["p2"] != r.StartStack() {
		t.Fatalf("rejoin stack = %d, want startStack %d", st["p2"], r.StartStack())
	}
}

// The table caps at MaxSeated; later arrivals queue in order and are promoted
// (with a fresh stack) when a seat frees up.
func TestSyncSeatsCapAndQueue(t *testing.T) {
	r := NewRoom(5, 10)
	ids := make([]string, 0, MaxSeated+2)
	for i := 0; i < MaxSeated+2; i++ {
		ids = append(ids, string(rune('a'+i)))
	}
	r.SyncSeats(ids)
	if got := len(r.Seats()); got != MaxSeated {
		t.Fatalf("seated = %d, want %d", got, MaxSeated)
	}
	w := r.Waiting()
	if len(w) != 2 || w[0] != ids[MaxSeated] || w[1] != ids[MaxSeated+1] {
		t.Fatalf("waiting = %v, want %v", w, ids[MaxSeated:])
	}
	// Waiting players hold no stack yet.
	if r.Chips(ids[MaxSeated]) != 0 {
		t.Fatalf("queued player should have no chips yet")
	}
	// First seat leaves: queue head takes the seat on the next sync.
	r.RemoveSeat(ids[0])
	r.SyncSeats(append(append([]string(nil), ids[1:MaxSeated]...), ids[MaxSeated], ids[MaxSeated+1]))
	if got := len(r.Seats()); got != MaxSeated {
		t.Fatalf("after promotion seated = %d, want %d", got, MaxSeated)
	}
	if r.Chips(ids[MaxSeated]) != r.StartStack() {
		t.Fatalf("promoted player stack = %d, want startStack", r.Chips(ids[MaxSeated]))
	}
	if len(r.Waiting()) != 1 {
		t.Fatalf("waiting after promotion = %v, want 1 entry", r.Waiting())
	}
}

// Folding to one player ends the hand immediately; that player wins the blinds.
func TestFoldEndsHand(t *testing.T) {
	r := NewRoom(5, 10)
	r.AddSeat("p1", 1000)
	r.AddSeat("p2", 1000)
	deck := deckOf(t, "AS", "AH", "KS", "KH", "2C", "7D", "9S", "JH", "3C")
	if err := r.startHandWithDeck(deck); err != nil {
		t.Fatalf("start: %v", err)
	}
	// p1 (button/SB, acts first preflop) folds -> p2 wins the pot (15 in blinds).
	if err := r.Action(r.betting.ToAct, "fold", 0); err != nil {
		t.Fatalf("fold: %v", err)
	}
	if r.Phase() != PhaseShowdown {
		t.Fatalf("phase = %s, want showdown", r.Phase())
	}
	if r.Chips("p2") != 1005 || r.Chips("p1") != 995 {
		t.Fatalf("chips p1=%d p2=%d, want 995/1005", r.Chips("p1"), r.Chips("p2"))
	}
	if len(r.reveals) != 0 {
		t.Fatalf("uncontested fold win should not reveal holes, got %d", len(r.reveals))
	}
}
