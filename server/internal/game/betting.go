package game

import "errors"

// Betting is the authoritative betting-round state machine — a faithful port of
// the action rules in src/lib/betting.ts (handleAction / isRoundComplete /
// computeSidePots). It is decoupled from the deck/board: Room composes it with
// poker dealing + street advancement. Server-side, this is what makes betting
// trustworthy (the client can no longer self-adjudicate).

type SeatStatus string

const (
	StatusActive SeatStatus = "active"
	StatusFolded SeatStatus = "folded"
	StatusAllIn  SeatStatus = "all-in"
	StatusOut    SeatStatus = "out"
)

type BetSeat struct {
	ID       string
	Chips    int
	Bet      int // committed this street
	TotalBet int // committed this hand
	Status   SeatStatus
}

type SidePot struct {
	Amount      int
	EligibleIDs []string
}

type Betting struct {
	Seats      []*BetSeat // in seating order
	Pot        int
	CurrentBet int
	MinRaise   int
	BigBlind   int
	ToAct      string   // id to act, "" when the round is closed
	Acted      []string // ids that have acted this round
}

var (
	ErrNotYourTurn  = errors.New("not your turn")
	ErrUnknownSeat  = errors.New("unknown seat")
	ErrCannotCheck  = errors.New("cannot check facing a bet")
	ErrBadAmount    = errors.New("invalid amount")
	ErrUnderRaise   = errors.New("raise below minimum")
	ErrUnknownAct   = errors.New("unknown action")
)

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func (b *Betting) seatByID(id string) (*BetSeat, int) {
	for i, s := range b.Seats {
		if s.ID == id {
			return s, i
		}
	}
	return nil, -1
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// Apply validates and applies an action by seat id. On an illegal action it
// returns an error and leaves state unchanged-ish (callers should treat an
// error as "rejected"). After a legal action it records the actor and advances
// ToAct (set to "" when the round is complete).
func (b *Betting) Apply(id, action string, amount int) error {
	if b.ToAct != id {
		return ErrNotYourTurn
	}
	s, _ := b.seatByID(id)
	if s == nil {
		return ErrUnknownSeat
	}

	switch action {
	case "fold":
		s.Status = StatusFolded

	case "check":
		if s.Bet < b.CurrentBet {
			return ErrCannotCheck
		}

	case "call":
		toCall := b.CurrentBet - s.Bet
		if toCall > s.Chips {
			toCall = s.Chips
		}
		if toCall < 0 {
			toCall = 0
		}
		s.Chips -= toCall
		s.Bet += toCall
		s.TotalBet += toCall
		b.Pot += toCall
		if s.Chips == 0 {
			s.Status = StatusAllIn
		}

	case "bet":
		betAmt := amount
		if betAmt > s.Chips {
			betAmt = s.Chips
		}
		if betAmt <= 0 {
			return ErrBadAmount
		}
		// Sub-minimum opening bets are illegal unless the player is going all-in.
		isAllIn := betAmt == s.Chips
		if !isAllIn && betAmt < b.MinRaise {
			return ErrBadAmount
		}
		s.Chips -= betAmt
		s.Bet += betAmt
		s.TotalBet += betAmt
		b.Pot += betAmt
		b.CurrentBet = s.Bet
		b.MinRaise = betAmt
		b.Acted = []string{id}
		if s.Chips == 0 {
			s.Status = StatusAllIn
		}

	case "raise":
		maxTotal := s.Chips + s.Bet
		raiseTotal := amount
		if raiseTotal > maxTotal {
			raiseTotal = maxTotal
		}
		inc := raiseTotal - s.Bet
		if inc <= 0 {
			return ErrBadAmount
		}
		isAllIn := raiseTotal == maxTotal
		minRaiseTotal := b.CurrentBet + b.MinRaise
		if !isAllIn && raiseTotal < minRaiseTotal {
			return ErrUnderRaise
		}
		s.Chips -= inc
		s.Bet = raiseTotal
		s.TotalBet += inc
		b.Pot += inc
		if raiseTotal > b.CurrentBet {
			b.MinRaise = raiseTotal - b.CurrentBet
			b.CurrentBet = raiseTotal
			b.Acted = []string{id}
		}
		if s.Chips == 0 {
			s.Status = StatusAllIn
		}

	case "all-in":
		allIn := s.Chips
		if allIn <= 0 {
			return ErrBadAmount
		}
		newBet := s.Bet + allIn
		s.Chips = 0
		s.Bet = newBet
		s.TotalBet += allIn
		b.Pot += allIn
		s.Status = StatusAllIn
		if newBet > b.CurrentBet {
			b.MinRaise = newBet - b.CurrentBet
			b.CurrentBet = newBet
			b.Acted = []string{id}
		}

	default:
		return ErrUnknownAct
	}

	if !contains(b.Acted, id) {
		b.Acted = append(b.Acted, id)
	}
	b.advance()
	return nil
}

// ForceFold folds a seat out of the normal turn flow (e.g. on disconnect). If it
// was that seat's turn, the turn advances. Returns false if the seat can't fold.
func (b *Betting) ForceFold(id string) bool {
	s, _ := b.seatByID(id)
	if s == nil || s.Status == StatusFolded || s.Status == StatusOut {
		return false
	}
	s.Status = StatusFolded
	if !contains(b.Acted, id) {
		b.Acted = append(b.Acted, id)
	}
	if b.ToAct == id {
		b.advance()
	}
	return true
}

// actionable = seats that can still act (have chips and aren't folded/out/all-in).
func (b *Betting) actionable() []*BetSeat {
	var out []*BetSeat
	for _, s := range b.Seats {
		if s.Status == StatusActive {
			out = append(out, s)
		}
	}
	return out
}

// RoundComplete reports whether every actionable seat has matched the current
// bet and acted this round.
func (b *Betting) RoundComplete() bool {
	active := b.actionable()
	if len(active) == 0 {
		return true
	}
	for _, s := range active {
		if s.Bet < b.CurrentBet {
			return false
		}
		if !contains(b.Acted, s.ID) {
			return false
		}
	}
	return true
}

func (b *Betting) nextActive(fromIdx int) int {
	n := len(b.Seats)
	for i := 1; i <= n; i++ {
		idx := (fromIdx + i) % n
		if b.Seats[idx].Status == StatusActive {
			return idx
		}
	}
	return -1
}

func (b *Betting) advance() {
	if b.RoundComplete() {
		b.ToAct = ""
		return
	}
	_, idx := b.seatByID(b.ToAct)
	if idx < 0 {
		idx = 0
	}
	next := b.nextActive(idx)
	if next < 0 {
		b.ToAct = ""
		return
	}
	b.ToAct = b.Seats[next].ID
}

// ComputeSidePots splits the pot by all-in tiers. Faithful port of
// computeSidePots in betting.ts: each distinct total-bet level forms a tier;
// only non-folded seats that reached a tier are eligible for it.
func (b *Betting) ComputeSidePots() []SidePot {
	var contributors int
	for _, s := range b.Seats {
		if s.TotalBet > 0 {
			contributors++
		}
	}
	if contributors == 0 {
		var elig []string
		for _, s := range b.Seats {
			if s.Status != StatusFolded {
				elig = append(elig, s.ID)
			}
		}
		return []SidePot{{Amount: b.Pot, EligibleIDs: elig}}
	}

	// Distinct total-bet levels, ascending.
	seen := map[int]bool{}
	var caps []int
	for _, s := range b.Seats {
		if s.TotalBet > 0 && !seen[s.TotalBet] {
			seen[s.TotalBet] = true
			caps = append(caps, s.TotalBet)
		}
	}
	for i := 0; i < len(caps); i++ {
		for j := i + 1; j < len(caps); j++ {
			if caps[j] < caps[i] {
				caps[i], caps[j] = caps[j], caps[i]
			}
		}
	}

	var pots []SidePot
	prev := 0
	for _, capLevel := range caps {
		tier := capLevel - prev
		amount := 0
		for _, s := range b.Seats {
			amount += clampInt(s.TotalBet-prev, 0, tier)
		}
		var elig []string
		for _, s := range b.Seats {
			if s.TotalBet >= capLevel && s.Status != StatusFolded {
				elig = append(elig, s.ID)
			}
		}
		if amount > 0 {
			pots = append(pots, SidePot{Amount: amount, EligibleIDs: elig})
		}
		prev = capLevel
	}
	return pots
}
