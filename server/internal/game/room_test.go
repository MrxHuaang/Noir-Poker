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
