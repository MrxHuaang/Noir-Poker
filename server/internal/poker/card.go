// Package poker holds the authoritative card model for the game server: the
// deck, a cryptographic shuffle, and a 7-card hand evaluator. The server owns
// the deck and deals — clients never receive it. Card ids match the TS client
// (e.g. "AS", "TD") so the two ends interop.
package poker

import "strings"

type Suit uint8

const (
	Spades Suit = iota
	Hearts
	Diamonds
	Clubs
)

// Card has Rank 2..14 (J=11, Q=12, K=13, A=14) and a Suit.
type Card struct {
	Rank uint8
	Suit Suit
}

var suitChar = [4]byte{'S', 'H', 'D', 'C'}

var rankToStr = map[uint8]string{
	2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
	10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
}

var strToRank = map[string]uint8{
	"2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
	"T": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
}

// ID returns the client-compatible id, e.g. "AS".
func (c Card) ID() string {
	return rankToStr[c.Rank] + string(suitChar[c.Suit])
}

// ParseCard parses an id like "AS"/"TD" into a Card. ok is false if malformed.
func ParseCard(id string) (Card, bool) {
	if len(id) < 2 {
		return Card{}, false
	}
	var suit Suit
	switch id[len(id)-1] {
	case 'S':
		suit = Spades
	case 'H':
		suit = Hearts
	case 'D':
		suit = Diamonds
	case 'C':
		suit = Clubs
	default:
		return Card{}, false
	}
	rank, ok := strToRank[strings.ToUpper(id[:len(id)-1])]
	if !ok {
		return Card{}, false
	}
	return Card{Rank: rank, Suit: suit}, true
}
