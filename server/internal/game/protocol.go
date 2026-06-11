// Package game holds the authoritative game core: the server owns the deck,
// deals, and produces per-client messages. The privacy invariant — a client
// ever only sees its OWN hole cards, never the deck or opponents' holes — lives
// here, enforced by construction (private holes are a separate per-seat message).
package game

import "encoding/json"

// ServerMsg is the envelope sent server -> client. Payload shape depends on Type.
type ServerMsg struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// ClientMsg is the envelope client -> server (used once the action protocol lands).
type ClientMsg struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

func encode(typ string, payload any) (ServerMsg, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return ServerMsg{}, err
	}
	return ServerMsg{Type: typ, Payload: b}, nil
}

// PublicState is broadcast to everyone in the room. It carries the board, pot,
// phase, whose turn, and per-seat public info — but NEVER hole cards.
type PublicState struct {
	HandNum  int          `json:"handNum"`
	Phase    string       `json:"phase"`
	Board    []string     `json:"board"` // community card ids
	Pot      int          `json:"pot"`
	ToAct    string       `json:"toAct"`
	Deadline int64        `json:"deadline,omitempty"` // Unix ms; when ToAct's turn expires (0 = no timer)
	Seats    []PublicSeat `json:"seats"`
	Winners  []Winner     `json:"winners,omitempty"`
	// Reveals holds the shown hole cards at a contested showdown (seatID -> 2
	// card ids). Empty otherwise — uncontested (fold-to-one) wins never reveal.
	Reveals map[string][]string `json:"reveals,omitempty"`
	// Runs is populated for run-it-N all-in outcomes (N > 1). Each entry is one
	// board's result. Empty for single-run hands.
	Runs []RunResult `json:"runs,omitempty"`
	// SB / BB are the current blind levels (always set). Clients use them to
	// display the blind level and compute pot-odds quick-sizes.
	SB int `json:"sb"`
	BB int `json:"bb"`
	// StartStack is the stack granted to a newly seated player. Clients use it
	// to escrow the matching coin buy-in instead of guessing from URL params.
	StartStack int `json:"startStack"`
	// CurrentBet / MinRaise mirror the live betting round so clients can size
	// raises without re-deriving the rules. Zero outside a betting round.
	CurrentBet int `json:"currentBet,omitempty"`
	MinRaise   int `json:"minRaise,omitempty"`
	// Dealer is the seat id holding the button this hand ("" before the first deal).
	Dealer string `json:"dealer,omitempty"`
	// Owner is the uid with start/configure authority (first player to join).
	Owner string `json:"owner,omitempty"`
	// LastAction is the most recent successful betting action, for client-side
	// action feedback (chip flourish, "raise 40" tag). Cleared on each new hand.
	LastAction *LastAction `json:"lastAction,omitempty"`
	// Paused is true when the owner has suspended the game (tournament break).
	// While paused, action messages are ignored.
	Paused bool `json:"paused,omitempty"`
	// BustedOrder contains the seat IDs of players eliminated from the table,
	// in bust-out order (index 0 = first to bust out). Used for tournament
	// finish rankings. Empty in cash-game mode.
	BustedOrder []string `json:"bustedOrder,omitempty"`
	// Waiting lists connected players without a seat (table full), in arrival
	// order. They are auto-seated when a seat frees up.
	Waiting []string `json:"waiting,omitempty"`
	// HandCategories maps each revealed seat ID to its hand category (0-8:
	// high-card → straight-flush). Only present at showdown when Reveals is set.
	HandCategories map[string]int `json:"handCategories,omitempty"`
}

type PublicSeat struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Seed     string `json:"seed,omitempty"` // avatar seed (client-provided at join)
	Chips    int    `json:"chips"`
	Bet      int    `json:"bet"`
	TotalBet int    `json:"totalBet,omitempty"` // committed across the whole hand
	Status   string `json:"status"`
	HasCards bool   `json:"hasCards"`
}

// LastAction describes the most recent successful betting action.
type LastAction struct {
	SeatID string `json:"seatId"`
	Action string `json:"action"`
	Amount int    `json:"amount,omitempty"`
	TS     int64  `json:"ts"` // Unix ms
}

// PrivateHole is sent ONLY to the owning seat.
type PrivateHole struct {
	Cards []string `json:"cards"` // exactly 2 card ids
}
