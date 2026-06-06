package poker

import (
	"sort"
	"testing"
)

func mustCard(t *testing.T, id string) Card {
	t.Helper()
	c, ok := ParseCard(id)
	if !ok {
		t.Fatalf("bad card id %q", id)
	}
	return c
}

func five(t *testing.T, ids ...string) uint32 {
	t.Helper()
	var c [5]Card
	for i, id := range ids {
		c[i] = mustCard(t, id)
	}
	return Eval5(c)
}

func TestCategoryOrdering(t *testing.T) {
	royal := five(t, "AS", "KS", "QS", "JS", "TS")
	quads := five(t, "AS", "AH", "AD", "AC", "KS")
	full := five(t, "AS", "AH", "AD", "KC", "KS")
	flush := five(t, "2S", "5S", "9S", "JS", "KS")
	straight := five(t, "AS", "2H", "3D", "4C", "5S") // wheel
	trips := five(t, "AS", "AH", "AD", "5C", "2S")
	twoPair := five(t, "AS", "AH", "KD", "KC", "2S")
	pair := five(t, "AS", "AH", "KD", "QC", "2S")
	high := five(t, "AS", "KH", "QD", "JC", "9S")

	order := []uint32{royal, quads, full, flush, straight, trips, twoPair, pair, high}
	for i := 1; i < len(order); i++ {
		if !(order[i-1] > order[i]) {
			t.Fatalf("ordering broken at %d: %d !> %d", i, order[i-1], order[i])
		}
	}
}

func TestStraightFlushBeatsQuads(t *testing.T) {
	sf := five(t, "6S", "7S", "8S", "9S", "TS")
	q := five(t, "AS", "AH", "AD", "AC", "2S")
	if !(sf > q) {
		t.Fatalf("straight flush should beat quads")
	}
}

func TestParseRoundTrip(t *testing.T) {
	for _, c := range NewDeck() {
		got, ok := ParseCard(c.ID())
		if !ok || got != c {
			t.Fatalf("round trip failed for %v (id %q)", c, c.ID())
		}
	}
}

func TestNewDeckIs52Unique(t *testing.T) {
	d := NewDeck()
	if len(d) != 52 {
		t.Fatalf("deck len = %d, want 52", len(d))
	}
	seen := map[string]bool{}
	for _, c := range d {
		if seen[c.ID()] {
			t.Fatalf("duplicate card %s", c.ID())
		}
		seen[c.ID()] = true
	}
}

func TestShufflePreservesMultiset(t *testing.T) {
	d := NewDeck()
	Shuffle(d)
	if len(d) != 52 {
		t.Fatalf("shuffle changed length: %d", len(d))
	}
	ids := make([]string, len(d))
	for i, c := range d {
		ids[i] = c.ID()
	}
	sort.Strings(ids)
	want := NewDeck()
	wantIDs := make([]string, len(want))
	for i, c := range want {
		wantIDs[i] = c.ID()
	}
	sort.Strings(wantIDs)
	for i := range ids {
		if ids[i] != wantIDs[i] {
			t.Fatalf("shuffle lost/added cards at %d: %s vs %s", i, ids[i], wantIDs[i])
		}
	}
}

func TestBest7PicksRoyal(t *testing.T) {
	cards := [7]Card{
		mustCard(t, "AS"), mustCard(t, "KS"), // hole
		mustCard(t, "QS"), mustCard(t, "JS"), mustCard(t, "TS"), // board makes royal
		mustCard(t, "2D"), mustCard(t, "7C"),
	}
	got := Best7(cards)
	royal := five(t, "AS", "KS", "QS", "JS", "TS")
	if got != royal {
		t.Fatalf("Best7 = %d, want royal %d", got, royal)
	}
}
