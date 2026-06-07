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
	button     int
	handNum    int
	sb, bb     int
	startStack int

	betting  *Betting
	deck     []poker.Card
	board    []poker.Card
	holes    map[string][2]poker.Card
	phase    Phase
	winners  []Winner
	reveals  map[string][2]poker.Card // shown holes at a contested showdown
	runs     []RunResult              // per-board results for run-it-N (nil for N=1)
	names    map[string]string        // seat id -> display name
	deadline int64                    // Unix ms when the active actor's turn expires (0 = none)

	// config
	runItN         int // how many times to run out the board on all-in (1–3)
	blindLevelSecs int // >0: escalate blinds this often (tournaments)

	paused      bool     // true while owner has suspended play (tournament break)
	bustedOrder []string // seat IDs in bust-out order (index 0 = first eliminated)
}

const defaultStartStack = 1000

func NewRoom(smallBlind, bigBlind int) *Room {
	return &Room{
		chips:      make(map[string]int),
		button:     -1,
		sb:         smallBlind,
		bb:         bigBlind,
		startStack: defaultStartStack,
		runItN:     1,
		phase:      PhaseIdle,
		holes:      make(map[string][2]poker.Card),
		names:      make(map[string]string),
	}
}

// SetConfig sets blinds, starting stack, run-it-N count, and blind escalation
// interval for future hands (fields <= 0 are ignored).
func (r *Room) SetConfig(sb, bb, stack, runItN, blindLevelSecs int) {
	if sb > 0 {
		r.sb = sb
	}
	if bb > 0 {
		r.bb = bb
	}
	if stack > 0 {
		r.startStack = stack
	}
	if runItN >= 1 && runItN <= 3 {
		r.runItN = runItN
	}
	if blindLevelSecs >= 0 {
		r.blindLevelSecs = blindLevelSecs
	}
}

// EscalateBlinds doubles the current blinds (called by the session manager on
// each tournament blind-level tick). Stops doubling above 800/1600.
func (r *Room) EscalateBlinds() {
	if r.sb*2 <= 800 {
		r.sb *= 2
		r.bb *= 2
	}
}

// BlindLevelSecs returns the blind escalation interval in seconds (0 = disabled).
func (r *Room) BlindLevelSecs() int { return r.blindLevelSecs }

// Blinds returns the current sb and bb.
func (r *Room) Blinds() (int, int) { return r.sb, r.bb }

// Pause suspends the game: Action calls are rejected until Resume is called.
func (r *Room) Pause() { r.paused = true }

// Resume lifts the suspension set by Pause.
func (r *Room) Resume() { r.paused = false }

// IsPaused reports whether the room is currently suspended.
func (r *Room) IsPaused() bool { return r.paused }

// SetName records a player's display name (shown in PublicSeat).
func (r *Room) SetName(id, name string) {
	if name != "" {
		r.names[id] = name
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

// SyncSeats sets the active roster to exactly `ids` (the currently connected
// players). New ids get startStack; returning ids keep their persisted stack;
// disconnected ids drop from the roster (their stack is retained in case they
// return). Call before StartHand so left players aren't dealt in.
func (r *Room) SyncSeats(ids []string) {
	r.seatIDs = nil
	for _, id := range ids {
		if _, ok := r.chips[id]; !ok {
			r.chips[id] = r.startStack
		}
		r.seatIDs = append(r.seatIDs, id)
	}
}

// LeaveFold folds a player who left mid-hand and advances the hand. Returns true
// if there was an active hand the player was in (so the caller rebroadcasts).
func (r *Room) LeaveFold(id string) bool {
	if r.betting == nil || r.phase == PhaseIdle || r.phase == PhaseShowdown {
		return false
	}
	if !r.betting.ForceFold(id) {
		return false
	}
	r.maybeAdvance()
	return true
}

// InHand reports whether the player currently holds cards in an active hand.
func (r *Room) InHand(id string) bool {
	if _, ok := r.holes[id]; !ok {
		return false
	}
	return r.phase != PhaseIdle
}
func (r *Room) HandNum() int        { return r.handNum }
func (r *Room) Phase() Phase        { return r.phase }
func (r *Room) Winners() []Winner   { return append([]Winner(nil), r.winners...) }
func (r *Room) Chips(id string) int { return r.chips[id] }

// ToAct returns the ID of the player whose turn it is, or "" when no active
// betting or when the hand is in showdown/idle.
func (r *Room) ToAct() string {
	if r.betting == nil || r.phase == PhaseShowdown || r.phase == PhaseIdle {
		return ""
	}
	return r.betting.ToAct
}

// CanCheck reports whether id can check right now (facing no bet or already
// matched the current bet, e.g. BB preflop with no raise).
func (r *Room) CanCheck(id string) bool {
	if r.betting == nil || r.phase == PhaseShowdown || r.betting.ToAct != id {
		return false
	}
	for _, s := range r.betting.Seats {
		if s.ID == id {
			return s.Bet >= r.betting.CurrentBet
		}
	}
	return false
}

// SetDeadline records the Unix-millisecond deadline for the current actor's
// turn. Pass 0 to clear. Published in PublicState so clients can show a countdown.
func (r *Room) SetDeadline(ms int64) { r.deadline = ms }

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
	r.runs = nil
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
	if r.paused {
		return errors.New("game is paused")
	}
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

	// Betting closed for the hand (<=1 can still act): run the board out.
	if len(r.betting.actionable()) <= 1 {
		needed := 5 - len(r.board)
		if r.runItN > 1 && needed > 0 && len(r.deck) >= needed*r.runItN {
			r.settleRunItN()
		} else {
			for len(r.board) < 5 {
				r.dealNextStreet()
			}
			r.settleShowdown()
		}
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

// settleRunItN deals the remaining community cards r.runItN times (using
// different deck slices per run) and settles each run independently, splitting
// the pot evenly. Called only when actionable == 0 or 1 and the board is
// incomplete (needed > 0) and the deck has enough cards.
func (r *Room) settleRunItN() {
	n := r.runItN
	needed := 5 - len(r.board)
	extras := make([][]poker.Card, n)
	for i := 0; i < n; i++ {
		extras[i] = r.deck[i*needed : (i+1)*needed]
	}
	runs, winners := SettleRunItN(r.betting, r.holes, r.board, extras)
	r.runs = runs
	r.winners = winners

	// Reveal all non-folded hands (contested run-it-N is always a showdown).
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
				ID: s.ID, Name: r.names[s.ID], Chips: s.Chips, Bet: s.Bet, Status: string(s.Status),
				HasCards: s.Status != StatusFolded && s.Status != StatusOut,
			}
		}
	} else {
		seats = make([]PublicSeat, len(r.seatIDs))
		for i, id := range r.seatIDs {
			seats[i] = PublicSeat{ID: id, Name: r.names[id], Chips: r.chips[id], Status: string(StatusActive)}
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
	var bustedOrder []string
	if len(r.bustedOrder) > 0 {
		bustedOrder = append([]string(nil), r.bustedOrder...)
	}
	msg, _ := encode("state", PublicState{
		HandNum: r.handNum, Phase: string(r.phase), Board: board,
		Pot: pot, ToAct: toAct, Deadline: r.deadline, Seats: seats,
		Winners: r.winners, Reveals: reveals, Runs: r.runs,
		SB: r.sb, BB: r.bb, Paused: r.paused, BustedOrder: bustedOrder,
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
// It also records any newly busted-out players into bustedOrder (for tournament
// finish rankings). A player is bust-out when their total chips reach zero after
// all pots are settled.
func (r *Room) applyWinnings() {
	for _, s := range r.betting.Seats {
		r.chips[s.ID] = s.Chips
	}
	for _, w := range r.winners {
		r.chips[w.ID] += w.Amount
	}
	// Record newly busted seats (chips == 0, not already in bustedOrder).
	bustedSet := make(map[string]bool, len(r.bustedOrder))
	for _, id := range r.bustedOrder {
		bustedSet[id] = true
	}
	for _, s := range r.betting.Seats {
		if r.chips[s.ID] == 0 && !bustedSet[s.ID] {
			r.bustedOrder = append(r.bustedOrder, s.ID)
		}
	}
}
