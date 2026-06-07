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
	// Paused is true when the owner has suspended the game (tournament break).
	// While paused, action messages are ignored.
	Paused bool `json:"paused,omitempty"`
	// BustedOrder contains the seat IDs of players eliminated from the table,
	// in bust-out order (index 0 = first to bust out). Used for tournament
	// finish rankings. Empty in cash-game mode.
	BustedOrder []string `json:"bustedOrder,omitempty"`
}

type PublicSeat struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Chips    int    `json:"chips"`
	Bet      int    `json:"bet"`
	Status   string `json:"status"`
	HasCards bool   `json:"hasCards"`
}

// PrivateHole is sent ONLY to the owning seat.
type PrivateHole struct {
	Cards []string `json:"cards"` // exactly 2 card ids
}
