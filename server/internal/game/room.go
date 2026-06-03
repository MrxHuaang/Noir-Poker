package game

import (
	"errors"

	"github.com/MrxHuaang/poker-sim/server/internal/poker"
)

// Room is the authoritative state for one table. Minimal for now: the seat
// roster and a hand counter. The betting state machine (port of betting.ts)
// lands on top of this next.
type Room struct {
	seatIDs []string
	handNum int
}

func NewRoom() *Room { return &Room{} }

// AddSeat adds a player by id (the verified uid). No-op if already seated.
func (r *Room) AddSeat(id string) {
	for _, s := range r.seatIDs {
		if s == id {
			return
		}
	}
	r.seatIDs = append(r.seatIDs, id)
}

// Seats returns a copy of the seat ids in order.
func (r *Room) Seats() []string {
	return append([]string(nil), r.seatIDs...)
}

// SetSeats replaces the roster (keeps the hand counter). Used to sync seats to
// the room's currently connected clients before a deal.
func (r *Room) SetSeats(ids []string) {
	r.seatIDs = append([]string(nil), ids...)
}

func (r *Room) HandNum() int { return r.handNum }

// DealResult is what Deal produces: one public broadcast and one private
// message per seat (its hole cards). The caller fans these out — the public to
// everyone, each private to its owner only.
type DealResult struct {
	Public  ServerMsg
	Private map[string]ServerMsg // seatID -> "hole" message
}

// Deal shuffles a fresh deck with the cryptographic server RNG, deals two hole
// cards per seat, and builds the public state + per-seat private holes. The deck
// and opponents' holes never appear in any produced message — the privacy
// invariant is structural, not a display rule.
func (r *Room) Deal() (DealResult, error) {
	if len(r.seatIDs) < 2 {
		return DealResult{}, errors.New("need at least 2 seats to deal")
	}

	deck := poker.NewDeck()
	poker.Shuffle(deck)
	r.handNum++

	holes := make(map[string][2]poker.Card, len(r.seatIDs))
	i := 0
	for _, id := range r.seatIDs {
		holes[id] = [2]poker.Card{deck[i], deck[i+1]}
		i += 2
	}

	pubSeats := make([]PublicSeat, len(r.seatIDs))
	for j, id := range r.seatIDs {
		pubSeats[j] = PublicSeat{ID: id, HasCards: true}
	}
	public, err := encode("state", PublicState{
		HandNum: r.handNum,
		Street:  "preflop",
		Board:   []string{},
		Seats:   pubSeats,
	})
	if err != nil {
		return DealResult{}, err
	}

	private := make(map[string]ServerMsg, len(holes))
	for id, h := range holes {
		msg, err := encode("hole", PrivateHole{Cards: []string{h[0].ID(), h[1].ID()}})
		if err != nil {
			return DealResult{}, err
		}
		private[id] = msg
	}

	return DealResult{Public: public, Private: private}, nil
}
