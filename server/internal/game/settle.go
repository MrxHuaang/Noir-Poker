package game

import "github.com/MrxHuaang/poker-sim/server/internal/poker"

// Winner is a payout: a seat and the chips it won across all pots.
type Winner struct {
	ID     string `json:"id"`
	Amount int    `json:"amount"`
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
