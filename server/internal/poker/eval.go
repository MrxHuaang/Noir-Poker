package poker

import "sort"

// pack folds [category, kickers...] into one comparable uint32 (4 bits each).
func pack(fields ...uint8) uint32 {
	var score uint32
	for i := 0; i < 6; i++ {
		var v uint32
		if i < len(fields) {
			v = uint32(fields[i])
		}
		score = (score << 4) | (v & 0xF)
	}
	return score
}

// Eval5 scores exactly 5 cards; higher is stronger. Mirrors eval5 in
// src/lib/handEval.ts and the Rust engine, so all three agree.
func Eval5(cards [5]Card) uint32 {
	ranks := []uint8{cards[0].Rank, cards[1].Rank, cards[2].Rank, cards[3].Rank, cards[4].Rank}
	sort.Slice(ranks, func(i, j int) bool { return ranks[i] > ranks[j] })

	flush := true
	for _, c := range cards {
		if c.Suit != cards[0].Suit {
			flush = false
			break
		}
	}

	uniq := make([]uint8, 0, 5)
	for _, r := range ranks {
		if len(uniq) == 0 || uniq[len(uniq)-1] != r {
			uniq = append(uniq, r)
		}
	}

	var straightHigh uint8
	if len(uniq) == 5 {
		if uniq[0]-uniq[4] == 4 {
			straightHigh = uniq[0]
		} else if uniq[0] == 14 && uniq[1] == 5 && uniq[4] == 2 {
			straightHigh = 5 // wheel A-2-3-4-5
		}
	}

	var counts [15]uint8
	for _, r := range ranks {
		counts[r]++
	}
	type group struct{ count, rank uint8 }
	groups := make([]group, 0, 5)
	for r := uint8(14); r >= 2; r-- {
		if counts[r] > 0 {
			groups = append(groups, group{counts[r], r})
		}
	}
	sort.SliceStable(groups, func(i, j int) bool {
		if groups[i].count != groups[j].count {
			return groups[i].count > groups[j].count
		}
		return groups[i].rank > groups[j].rank
	})
	sig := make([]uint8, len(groups))
	for i, g := range groups {
		sig[i] = g.count
	}
	eq := func(a []uint8, b ...uint8) bool {
		if len(a) != len(b) {
			return false
		}
		for i := range a {
			if a[i] != b[i] {
				return false
			}
		}
		return true
	}

	switch {
	case straightHigh > 0 && flush:
		return pack(8, straightHigh)
	case eq(sig, 4, 1):
		return pack(7, groups[0].rank, groups[1].rank)
	case eq(sig, 3, 2):
		return pack(6, groups[0].rank, groups[1].rank)
	case flush:
		return pack(5, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4])
	case straightHigh > 0:
		return pack(4, straightHigh)
	case eq(sig, 3, 1, 1):
		return pack(3, groups[0].rank, groups[1].rank, groups[2].rank)
	case eq(sig, 2, 2, 1):
		return pack(2, groups[0].rank, groups[1].rank, groups[2].rank)
	case eq(sig, 2, 1, 1, 1):
		return pack(1, groups[0].rank, groups[1].rank, groups[2].rank, groups[3].rank)
	default:
		return pack(0, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4])
	}
}

var combos7 = [21][5]int{
	{0, 1, 2, 3, 4}, {0, 1, 2, 3, 5}, {0, 1, 2, 3, 6}, {0, 1, 2, 4, 5},
	{0, 1, 2, 4, 6}, {0, 1, 2, 5, 6}, {0, 1, 3, 4, 5}, {0, 1, 3, 4, 6},
	{0, 1, 3, 5, 6}, {0, 1, 4, 5, 6}, {0, 2, 3, 4, 5}, {0, 2, 3, 4, 6},
	{0, 2, 3, 5, 6}, {0, 2, 4, 5, 6}, {0, 3, 4, 5, 6}, {1, 2, 3, 4, 5},
	{1, 2, 3, 4, 6}, {1, 2, 3, 5, 6}, {1, 2, 4, 5, 6}, {1, 3, 4, 5, 6},
	{2, 3, 4, 5, 6},
}

// Best7 returns the best 5-card score from 7 cards (2 hole + 5 board).
func Best7(cards [7]Card) uint32 {
	var best uint32
	for _, idx := range combos7 {
		five := [5]Card{cards[idx[0]], cards[idx[1]], cards[idx[2]], cards[idx[3]], cards[idx[4]]}
		if s := Eval5(five); s > best {
			best = s
		}
	}
	return best
}
