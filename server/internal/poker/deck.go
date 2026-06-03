package poker

import (
	"crypto/rand"
	"encoding/binary"
)

// NewDeck returns a fresh ordered 52-card deck.
func NewDeck() []Card {
	d := make([]Card, 0, 52)
	for s := Suit(0); s < 4; s++ {
		for r := uint8(2); r <= 14; r++ {
			d = append(d, Card{Rank: r, Suit: s})
		}
	}
	return d
}

// secureIntn returns a uniform random int in [0, n) using crypto/rand with
// rejection sampling to avoid modulo bias. Panics only if the OS RNG fails.
func secureIntn(n int) int {
	if n <= 0 {
		return 0
	}
	max := uint32(n)
	// Largest multiple of max that fits in uint32; reject above it.
	limit := (uint32(0xFFFFFFFF) / max) * max
	var buf [4]byte
	for {
		if _, err := rand.Read(buf[:]); err != nil {
			panic("poker: crypto/rand failed: " + err.Error())
		}
		v := binary.LittleEndian.Uint32(buf[:])
		if v < limit {
			return int(v % max)
		}
	}
}

// Shuffle does an in-place Fisher-Yates with a cryptographic RNG. This is the
// authoritative shuffle: the server owns the deck, so the source of randomness
// must be unpredictable to clients (the whole point of an authoritative server).
func Shuffle(d []Card) {
	for i := len(d) - 1; i > 0; i-- {
		j := secureIntn(i + 1)
		d[i], d[j] = d[j], d[i]
	}
}
