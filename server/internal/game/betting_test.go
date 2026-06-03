package game

import "testing"

func seat(id string, chips, bet, total int, st SeatStatus) *BetSeat {
	return &BetSeat{ID: id, Chips: chips, Bet: bet, TotalBet: total, Status: st}
}

// Heads-up preflop: SB calls, BB checks -> round complete, pot correct.
func TestHeadsUpCallCheckClosesRound(t *testing.T) {
	b := &Betting{
		Seats:      []*BetSeat{seat("p1", 95, 5, 5, StatusActive), seat("p2", 90, 10, 10, StatusActive)},
		Pot:        15,
		CurrentBet: 10,
		MinRaise:   10,
		BigBlind:   10,
		ToAct:      "p1",
	}
	if err := b.Apply("p1", "call", 0); err != nil {
		t.Fatalf("p1 call: %v", err)
	}
	if b.ToAct != "p2" {
		t.Fatalf("after call ToAct = %q, want p2", b.ToAct)
	}
	if err := b.Apply("p2", "check", 0); err != nil {
		t.Fatalf("p2 check: %v", err)
	}
	if !b.RoundComplete() || b.ToAct != "" {
		t.Fatalf("round should be complete, ToAct empty; got ToAct=%q", b.ToAct)
	}
	if b.Pot != 20 {
		t.Fatalf("pot = %d, want 20", b.Pot)
	}
}

func TestCannotCheckFacingBet(t *testing.T) {
	b := &Betting{
		Seats:      []*BetSeat{seat("p1", 95, 5, 5, StatusActive), seat("p2", 90, 10, 10, StatusActive)},
		CurrentBet: 10, MinRaise: 10, ToAct: "p1",
	}
	if err := b.Apply("p1", "check", 0); err != ErrCannotCheck {
		t.Fatalf("expected ErrCannotCheck, got %v", err)
	}
}

func TestNotYourTurn(t *testing.T) {
	b := &Betting{
		Seats: []*BetSeat{seat("p1", 100, 0, 0, StatusActive), seat("p2", 100, 0, 0, StatusActive)},
		ToAct: "p1",
	}
	if err := b.Apply("p2", "check", 0); err != ErrNotYourTurn {
		t.Fatalf("expected ErrNotYourTurn, got %v", err)
	}
}

func TestUnderRaiseRejectedMinRaiseAccepted(t *testing.T) {
	mk := func() *Betting {
		return &Betting{
			Seats:      []*BetSeat{seat("p1", 90, 10, 10, StatusActive), seat("p2", 90, 10, 10, StatusActive)},
			CurrentBet: 10, MinRaise: 10, BigBlind: 10, ToAct: "p1",
		}
	}
	if err := mk().Apply("p1", "raise", 15); err != ErrUnderRaise {
		t.Fatalf("raise to 15 should be under-raise, got %v", err)
	}
	b := mk()
	if err := b.Apply("p1", "raise", 20); err != nil {
		t.Fatalf("raise to 20 (min) should be legal, got %v", err)
	}
	if b.CurrentBet != 20 || b.MinRaise != 10 {
		t.Fatalf("after min-raise currentBet=%d minRaise=%d, want 20/10", b.CurrentBet, b.MinRaise)
	}
}

func TestShortAllInRaiseAllowedBelowMin(t *testing.T) {
	b := &Betting{
		Seats:      []*BetSeat{seat("p1", 3, 10, 10, StatusActive), seat("p2", 90, 10, 10, StatusActive)},
		CurrentBet: 10, MinRaise: 10, BigBlind: 10, ToAct: "p1",
	}
	// p1 shoves to 13 total (all-in), below the 20 min-raise -> allowed.
	if err := b.Apply("p1", "raise", 13); err != nil {
		t.Fatalf("short all-in raise should be legal, got %v", err)
	}
	if b.CurrentBet != 13 {
		t.Fatalf("currentBet = %d, want 13", b.CurrentBet)
	}
	p1, _ := b.seatByID("p1")
	if p1.Status != StatusAllIn || p1.Chips != 0 {
		t.Fatalf("p1 should be all-in with 0 chips, got %s/%d", p1.Status, p1.Chips)
	}
}

func TestComputeSidePots(t *testing.T) {
	b := &Betting{
		Seats: []*BetSeat{
			seat("p1", 0, 0, 200, StatusActive),
			seat("p2", 0, 0, 200, StatusActive),
			seat("p3", 0, 0, 50, StatusAllIn),
		},
		Pot: 450,
	}
	pots := b.ComputeSidePots()
	if len(pots) != 2 {
		t.Fatalf("pots = %d, want 2: %+v", len(pots), pots)
	}
	// Main pot: tier 0..50, all three contribute 50 = 150, eligible all 3.
	if pots[0].Amount != 150 || len(pots[0].EligibleIDs) != 3 {
		t.Fatalf("main pot = %+v, want 150/3", pots[0])
	}
	// Side pot: tier 50..200, p1+p2 contribute 150 each = 300, eligible p1,p2.
	if pots[1].Amount != 300 || len(pots[1].EligibleIDs) != 2 {
		t.Fatalf("side pot = %+v, want 300/2", pots[1])
	}
}

func TestFoldedExcludedFromSidePotEligibility(t *testing.T) {
	b := &Betting{
		Seats: []*BetSeat{
			seat("p1", 0, 0, 100, StatusActive),
			seat("p2", 0, 0, 100, StatusFolded),
			seat("p3", 0, 0, 100, StatusActive),
		},
		Pot: 300,
	}
	pots := b.ComputeSidePots()
	if len(pots) != 1 || pots[0].Amount != 300 {
		t.Fatalf("want single 300 pot, got %+v", pots)
	}
	for _, id := range pots[0].EligibleIDs {
		if id == "p2" {
			t.Fatal("folded p2 should not be eligible")
		}
	}
}
