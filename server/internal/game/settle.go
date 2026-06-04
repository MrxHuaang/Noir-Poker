package game

import "github.com/MrxHuaang/poker-sim/server/internal/poker"

// Winner is a payout: a seat and the chips it won across all pots.
type Winner struct {
	ID     string `json:"id"`
	Amount int    `json:"amount"`
}

// RunResult is one board's outcome in a run-it-N settlement.
type RunResult struct {
	Board   []string `json:"board"`
	Pot     int      `json:"pot"`     // this run's share of the total pot
	Winners []Winner `json:"winners"` // payouts from this run's share
}

// SettleRunItN settles a hand run out n times. baseBoard is what is already on
// the table (0, 3, or 4 cards); extras[i] holds the additional community cards
// for run i (len(extras[i]) == 5 - len(baseBoard)). Returns per-run results
// (for display) and aggregated payouts to apply to stacks.
func SettleRunItN(b *Betting, holes map[string][2]poker.Card, baseBoard []poker.Card, extras [][]poker.Card) ([]RunResult, []Winner) {
	n := len(extras)
	if n == 0 {
		return nil, nil
	}
	if n == 1 {
		board := append(append([]poker.Card{}, baseBoard...), extras[0]...)
		w := Settle(b, holes, board)
		return []RunResult{{Board: cardIDs(board), Pot: b.Pot, Winners: w}}, w
	}

	sidePots := b.ComputeSidePots()
	totals := make(map[string]int)
	runs := make([]RunResult, n)

	for ri, extra := range extras {
		board := append(append([]poker.Card{}, baseBoard...), extra...)
		var b5 [5]poker.Card
		copy(b5[:], board[:5])

		runWinners := []Winner{}
		for _, sp := range sidePots {
			perRun := sp.Amount / n
			rem := 0
			if ri == 0 {
				rem = sp.Amount - perRun*n // odd chips go to first run
			}
			pot := perRun + rem
			if pot == 0 {
				continue
			}
			ws := bestHandWinners(b, holes, b5, sp.EligibleIDs, pot)
			for _, w := range ws {
				totals[w.ID] += w.Amount
				runWinners = append(runWinners, w)
			}
		}
		runs[ri] = RunResult{Board: cardIDs(board), Pot: b.Pot / n, Winners: runWinners}
	}

	out := make([]Winner, 0, len(totals))
	for _, s := range b.Seats {
		if amt := totals[s.ID]; amt > 0 {
			out = append(out, Winner{ID: s.ID, Amount: amt})
		}
	}
	return runs, out
}

// bestHandWinners finds the seat(s) with the best hand among eligibleIDs and
// splits pot among ties (odd chip to first in seat order).
func bestHandWinners(b *Betting, holes map[string][2]poker.Card, b5 [5]poker.Card, eligibleIDs []string, pot int) []Winner {
	var best uint32
	var winners []string
	for _, id := range eligibleIDs {
		h, ok := holes[id]
		if !ok {
			continue
		}
		score := poker.Best7([7]poker.Card{h[0], h[1], b5[0], b5[1], b5[2], b5[3], b5[4]})
		switch {
		case score > best:
			best = score
			winners = []string{id}
		case score == best:
			winners = append(winners, id)
		}
	}
	if len(winners) == 0 {
		return nil
	}
	share := pot / len(winners)
	remainder := pot - share*len(winners)
	first := firstInSeatOrder(b, winners)
	out := make([]Winner, 0, len(winners))
	for _, id := range winners {
		award := share
		if id == first {
			award += remainder
		}
		out = append(out, Winner{ID: id, Amount: award})
	}
	return out
}

func cardIDs(cards []poker.Card) []string {
	ids := make([]string, len(cards))
	for i, c := range cards {
		ids[i] = c.ID()
	}
	return ids
}

// Settle awards each side pot to the best 7-card hand among that pot's eligible,
// non-folded seats, splitting ties evenly (odd chip to the first eligible in
// seat order). board must hold the 5 community cards. Returns payouts in seat
// order. This composes ComputeSidePots (the money) with poker.Best7 (the hands)
// — the authoritative showdown.
func Settle(b *Betting, holes map[string][2]poker.Card, board []poker.Card) []Winner {
	won := make(map[string]int)
	if len(board) < 5 {
		return nil
	}
	var b5 [5]poker.Card
	copy(b5[:], board[:5])

	for _, pot := range b.ComputeSidePots() {
		var best uint32
		var winners []string
		for _, id := range pot.EligibleIDs {
			h, ok := holes[id]
			if !ok {
				continue
			}
			score := poker.Best7([7]poker.Card{h[0], h[1], b5[0], b5[1], b5[2], b5[3], b5[4]})
			switch {
			case score > best:
				best = score
				winners = []string{id}
			case score == best:
				winners = append(winners, id)
			}
		}
		if len(winners) == 0 {
			continue
		}
		share := pot.Amount / len(winners)
		remainder := pot.Amount - share*len(winners)
		// Odd chip goes to the first winner in seat order for determinism.
		first := firstInSeatOrder(b, winners)
		for _, id := range winners {
			won[id] += share
			if id == first {
				won[id] += remainder
			}
		}
	}

	out := make([]Winner, 0, len(won))
	for _, s := range b.Seats {
		if amt, ok := won[s.ID]; ok && amt > 0 {
			out = append(out, Winner{ID: s.ID, Amount: amt})
		}
	}
	return out
}

func firstInSeatOrder(b *Betting, ids []string) string {
	for _, s := range b.Seats {
		for _, id := range ids {
			if s.ID == id {
				return id
			}
		}
	}
	if len(ids) > 0 {
		return ids[0]
	}
	return ""
}
