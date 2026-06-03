package game

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDealNeedsTwoSeats(t *testing.T) {
	r := NewRoom()
	r.AddSeat("p1")
	if _, err := r.Deal(); err == nil {
		t.Fatal("expected error dealing with <2 seats")
	}
}

func TestAddSeatDedupes(t *testing.T) {
	r := NewRoom()
	r.AddSeat("p1")
	r.AddSeat("p1")
	r.AddSeat("p2")
	if got := len(r.Seats()); got != 2 {
		t.Fatalf("seats = %d, want 2", got)
	}
}

func TestDealPrivacyAndUniqueness(t *testing.T) {
	r := NewRoom()
	for _, id := range []string{"p1", "p2", "p3"} {
		r.AddSeat(id)
	}
	res, err := r.Deal()
	if err != nil {
		t.Fatalf("deal: %v", err)
	}

	// One private message per seat, each with exactly 2 cards; all unique.
	if len(res.Private) != 3 {
		t.Fatalf("private msgs = %d, want 3", len(res.Private))
	}
	seen := map[string]bool{}
	var allHole []string
	for id, msg := range res.Private {
		if msg.Type != "hole" {
			t.Fatalf("private[%s] type = %q, want hole", id, msg.Type)
		}
		var ph PrivateHole
		if err := json.Unmarshal(msg.Payload, &ph); err != nil {
			t.Fatalf("decode private[%s]: %v", id, err)
		}
		if len(ph.Cards) != 2 {
			t.Fatalf("private[%s] has %d cards, want 2", id, len(ph.Cards))
		}
		for _, c := range ph.Cards {
			if seen[c] {
				t.Fatalf("duplicate dealt card %s", c)
			}
			seen[c] = true
			allHole = append(allHole, c)
		}
	}

	// Privacy invariant: NO hole card id appears anywhere in the public message.
	pubBytes, err := json.Marshal(res.Public)
	if err != nil {
		t.Fatalf("marshal public: %v", err)
	}
	pub := string(pubBytes)
	for _, c := range allHole {
		if strings.Contains(pub, c) {
			t.Fatalf("hole card %s leaked into public state: %s", c, pub)
		}
	}

	// Public state: preflop, empty board, 3 seats, no cards exposed.
	var ps PublicState
	if err := json.Unmarshal(res.Public.Payload, &ps); err != nil {
		t.Fatalf("decode public: %v", err)
	}
	if ps.Street != "preflop" || len(ps.Board) != 0 || len(ps.Seats) != 3 {
		t.Fatalf("unexpected public state: %+v", ps)
	}
	if ps.HandNum != 1 {
		t.Fatalf("handNum = %d, want 1", ps.HandNum)
	}
}

func TestDealIncrementsHandNum(t *testing.T) {
	r := NewRoom()
	r.AddSeat("a")
	r.AddSeat("b")
	if _, err := r.Deal(); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Deal(); err != nil {
		t.Fatal(err)
	}
	if r.HandNum() != 2 {
		t.Fatalf("handNum = %d, want 2", r.HandNum())
	}
}
