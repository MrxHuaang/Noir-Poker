package game

import (
	"testing"

	"github.com/MrxHuaang/poker-sim/server/internal/poker"
)

func cards(t *testing.T, ids ...string) []poker.Card {
	t.Helper()
	out := make([]poker.Card, len(ids))
	for i, id := range ids {
		c, ok := poker.ParseCard(id)
		if !ok {
			t.Fatalf("bad card %q", id)
		}
		out[i] = c
	}
	return out
}

func hole(t *testing.T, a, b string) [2]poker.Card {
	t.Helper()
	cs := cards(t, a, b)
	return [2]poker.Card{cs[0], cs[1]}
}

func wonMap(ws []Winner) map[string]int {
	m := map[string]int{}
	for _, w := range ws {
		m[w.ID] = w.Amount
	}
	return m
}

func TestSettleSingleWinner(t *testing.T) {
	b := &Betting{Seats: []*BetSeat{
		seat("p1", 0, 0, 100, StatusActive),
		seat("p2", 0, 0, 100, StatusActive),
	}, Pot: 200}
	board := cards(t, "2C", "7D", "9S", "JH", "KC")
	holes := map[string][2]poker.Card{
		"p1": hole(t, "AS", "AH"), // pair of aces
		"p2": hole(t, "KS", "QD"), // pair of kings
	}
	got := wonMap(Settle(b, holes, board))
	if got["p1"] != 200 || got["p2"] != 0 {
		t.Fatalf("want p1=200 p2=0, got %v", got)
	}
}

func TestSettleSidePotsAllInShortWins(t *testing.T) {
	// p3 all-in short (50); p1,p2 in for 200. Main pot 150 (all eligible),
	// side pot 300 (p1,p2). p3 has quads -> wins main; p1 (aces) wins side.
	b := &Betting{Seats: []*BetSeat{
		seat("p1", 0, 0, 200, StatusActive),
		seat("p2", 0, 0, 200, StatusActive),
		seat("p3", 0, 0, 50, StatusAllIn),
	}, Pot: 450}
	board := cards(t, "9S", "9D", "2C", "5H", "KC")
	holes := map[string][2]poker.Card{
		"p1": hole(t, "AS", "AD"), // two pair aces+nines
		"p2": hole(t, "3S", "4D"), // pair of nines, weak
		"p3": hole(t, "9H", "9C"), // quad nines
	}
	got := wonMap(Settle(b, holes, board))
	if got["p3"] != 150 {
		t.Fatalf("p3 (quads) should win the 150 main pot, got %d", got["p3"])
	}
	if got["p1"] != 300 {
		t.Fatalf("p1 should win the 300 side pot, got %d", got["p1"])
	}
	if got["p2"] != 0 {
		t.Fatalf("p2 should win nothing, got %d", got["p2"])
	}
}

func TestSettleSplitOnBoardTie(t *testing.T) {
	// Royal flush on the board -> both play the board -> split.
	b := &Betting{Seats: []*BetSeat{
		seat("p1", 0, 0, 50, StatusActive),
		seat("p2", 0, 0, 50, StatusActive),
	}, Pot: 100}
	board := cards(t, "AS", "KS", "QS", "JS", "TS")
	holes := map[string][2]poker.Card{
		"p1": hole(t, "2C", "3D"),
		"p2": hole(t, "4H", "5C"),
	}
	got := wonMap(Settle(b, holes, board))
	if got["p1"] != 50 || got["p2"] != 50 {
		t.Fatalf("want 50/50 split, got %v", got)
	}
}
