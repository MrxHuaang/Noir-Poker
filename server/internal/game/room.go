package game

import (
	"errors"

	"github.com/MrxHuaang/poker-sim/server/internal/poker"
)

// Phase is the stage of a hand.
type Phase string

const (
	PhaseIdle     Phase = "idle"
	PhasePreflop  Phase = "preflop"
	PhaseFlop     Phase = "flop"
	PhaseTurn     Phase = "turn"
	PhaseRiver    Phase = "river"
	PhaseShowdown Phase = "showdown"
)

// Room is the authoritative engine for one table. It owns persistent stacks and
// drives a full hand: post blinds, deal, run betting (via Betting), advance
// streets dealing the board, and settle the showdown (via Settle). Burns are
// omitted (cosmetic; cards are still random). Not safe for concurrent use — the
// session manager serializes access per room.
type Room struct {
	seatIDs []string
	chips   map[string]int
	button  int
	handNum int
	sb, bb  int

	betting *Betting
	deck    []poker.Card
	board   []poker.Card
	holes   map[string][2]poker.Card
	phase   Phase
	winners []Winner
	reveals map[string][2]poker.Card // shown holes at a contested showdown
}

func NewRoom(smallBlind, bigBlind int) *Room {
	return &Room{
		chips:  make(map[string]int),
		button: -1,
		sb:     smallBlind,
		bb:     bigBlind,
		phase:  PhaseIdle,
		holes:  make(map[string][2]poker.Card),
	}
}

// AddSeat seats a player with a starting stack (or updates the stack if already
// seated). Stacks persist across hands.
func (r *Room) AddSeat(id string, chips int) {
	if _, ok := r.chips[id]; !ok {
		r.seatIDs = append(r.seatIDs, id)
	}
	r.chips[id] = chips
}

func (r *Room) Seats() []string     { return append([]string(nil), r.seatIDs...) }
func (r *Room) HandNum() int        { return r.handNum }
func (r *Room) Phase() Phase        { return r.phase }
func (r *Room) Winners() []Winner   { return append([]Winner(nil), r.winners...) }
func (r *Room) Chips(id string) int { return r.chips[id] }

var ErrNotEnoughPlayers = errors.New("need at least 2 funded players")

// StartHand shuffles a fresh deck (crypto RNG) and begins a hand.
func (r *Room) StartHand() error {
	deck := poker.NewDeck()
	poker.Shuffle(deck)
	return r.startHandWithDeck(deck)
}

// startHandWithDeck is the deterministic core (tests inject a known deck).
func (r *Room) startHandWithDeck(deck []poker.Card) error {
	funded := make([]string, 0, len(r.seatIDs))
	for _, id := range r.seatIDs {
		if r.chips[id] > 0 {
			funded = append(funded, id)
		}
	}
	if len(funded) < 2 {
		return ErrNotEnoughPlayers
	}

	r.handNum++
	r.button = (r.button + 1) % len(funded)
	r.deck = deck
	r.board = nil
	r.winners = nil
	r.reveals = nil
	r.holes = make(map[string][2]poker.Card)
	r.phase = PhasePreflop

	// Build betting seats in funded order, deal 2 holes each.
	seats := make([]*BetSeat, len(funded))
	idx := 0
	for i, id := range funded {
		seats[i] = &BetSeat{ID: id, Chips: r.chips[id], Status: StatusActive}
		r.holes[id] = [2]poker.Card{deck[idx], deck[idx+1]}
		idx += 2
	}
	r.deck = deck[idx:] // remaining deck for the board

	heads := len(funded) == 2
	var sbPos, bbPos, utgPos int
	if heads {
		sbPos = r.button
		bbPos = (r.button + 1) % 2
		utgPos = r.button // HU: button/SB acts first preflop
	} else {
		sbPos = (r.button + 1) % len(funded)
		bbPos = (r.button + 2) % len(funded)
		utgPos = (r.button + 3) % len(funded)
	}

	b := &Betting{Seats: seats, BigBlind: r.bb, MinRaise: r.bb}
	post := func(pos, amt int) {
		s := seats[pos]
		put := amt
		if put > s.Chips {
			put = s.Chips
		}
		s.Chips -= put
		s.Bet += put
		s.TotalBet += put
		b.Pot += put
		if s.Chips == 0 {
			s.Status = StatusAllIn
		}
	}
	post(sbPos, r.sb)
	post(bbPos, r.bb)
	b.CurrentBet = r.bb
	b.ToAct = seats[utgPos].ID
	r.betting = b
	return nil
}

// Action applies a betting action and advances the hand (street / showdown).
func (r *Room) Action(id, action string, amount int) error {
	if r.phase == PhaseShowdown || r.phase == PhaseIdle || r.betting == nil {
		return errors.New("no active betting")
	}
	if err := r.betting.Apply(id, action, amount); err != nil {
		return err
	}
	r.maybeAdvance()
	return nil
}

func (r *Room) inHand() []*BetSeat {
	var out []*BetSeat
	for _, s := range r.betting.Seats {
		if s.Status == StatusActive || s.Status == StatusAllIn {
			out = append(out, s)
		}
	}
	return out
}

func (r *Room) maybeAdvance() {
	// Everyone folded but one: that player wins the whole pot immediately, no
	// showdown — checked after every action, not just when a round completes.
	if contenders := r.inHand(); len(contenders) == 1 {
		r.winners = []Winner{{ID: contenders[0].ID, Amount: r.betting.Pot}}
		r.applyWinnings()
		r.phase = PhaseShowdown
		return
	}

	if !r.betting.RoundComplete() {
		return
	}

	// Betting closed for the hand (<=1 can still act): run the board out to the
	// river, then settle.
	if len(r.betting.actionable()) <= 1 {
		for len(r.board) < 5 {
			r.dealNextStreet()
		}
		r.settleShowdown()
		return
	}

	if r.phase == PhaseRiver {
		r.settleShowdown()
		return
	}
	r.advanceStreet()
}

func (r *Room) dealNextStreet() {
	switch len(r.board) {
	case 0:
		r.board = append(r.board, r.deck[0], r.deck[1], r.deck[2])
		r.deck = r.deck[3:]
	case 3, 4:
		r.board = append(r.board, r.deck[0])
		r.deck = r.deck[1:]
	}
}

func (r *Room) advanceStreet() {
	r.dealNextStreet()
	switch len(r.board) {
	case 3:
		r.phase = PhaseFlop
	case 4:
		r.phase = PhaseTurn
	case 5:
		r.phase = PhaseRiver
	}
	// Reset per-street betting; first to act is the first active seat left of
	// the button.
	for _, s := range r.betting.Seats {
		s.Bet = 0
	}
	r.betting.CurrentBet = 0
	r.betting.MinRaise = r.bb
	r.betting.Acted = nil
	r.betting.ToAct = ""
	n := len(r.betting.Seats)
	for i := 1; i <= n; i++ {
		pos := (r.button + i) % n
		if r.betting.Seats[pos].Status == StatusActive {
			r.betting.ToAct = r.betting.Seats[pos].ID
			break
		}
	}
}

func (r *Room) settleShowdown() {
	r.winners = Settle(r.betting, r.holes, r.board)
	// Contested showdown: reveal the holes of everyone still in.
	r.reveals = make(map[string][2]poker.Card)
	for _, s := range r.betting.Seats {
		if s.Status == StatusFolded || s.Status == StatusOut {
			continue
		}
		if h, ok := r.holes[s.ID]; ok {
			r.reveals[s.ID] = h
		}
	}
	r.applyWinnings()
	r.phase = PhaseShowdown
}

// PublicMsg builds the public "state" message (no hole cards) for broadcast.
func (r *Room) PublicMsg() ServerMsg {
	board := make([]string, len(r.board))
	for i, c := range r.board {
		board[i] = c.ID()
	}
	var seats []PublicSeat
	if r.betting != nil {
		seats = make([]PublicSeat, len(r.betting.Seats))
		for i, s := range r.betting.Seats {
			seats[i] = PublicSeat{
				ID: s.ID, Chips: s.Chips, Bet: s.Bet, Status: string(s.Status),
				HasCards: s.Status != StatusFolded && s.Status != StatusOut,
			}
		}
	} else {
		seats = make([]PublicSeat, len(r.seatIDs))
		for i, id := range r.seatIDs {
			seats[i] = PublicSeat{ID: id, Chips: r.chips[id], Status: string(StatusActive)}
		}
	}
	pot, toAct := 0, ""
	if r.betting != nil {
		pot, toAct = r.betting.Pot, r.betting.ToAct
	}
	var reveals map[string][]string
	if len(r.reveals) > 0 {
		reveals = make(map[string][]string, len(r.reveals))
		for id, h := range r.reveals {
			reveals[id] = []string{h[0].ID(), h[1].ID()}
		}
	}
	msg, _ := encode("state", PublicState{
		HandNum: r.handNum, Phase: string(r.phase), Board: board,
		Pot: pot, ToAct: toAct, Seats: seats, Winners: r.winners, Reveals: reveals,
	})
	return msg
}

// HoleMsgs builds one private "hole" message per seat (its own two cards).
func (r *Room) HoleMsgs() map[string]ServerMsg {
	out := make(map[string]ServerMsg, len(r.holes))
	for id, h := range r.holes {
		if msg, err := encode("hole", PrivateHole{Cards: []string{h[0].ID(), h[1].ID()}}); err == nil {
			out[id] = msg
		}
	}
	return out
}

// applyWinnings credits winners back into persistent stacks. Losers' committed
// chips already left their stacks during betting (Chips was decremented), so we
// only add winnings here, then sync remaining table chips back to r.chips.
func (r *Room) applyWinnings() {
	for _, s := range r.betting.Seats {
		r.chips[s.ID] = s.Chips
	}
	for _, w := range r.winners {
		r.chips[w.ID] += w.Amount
	}
}
