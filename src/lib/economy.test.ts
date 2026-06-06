import { describe, it, expect } from "vitest";
import {
  BUST_RESCUE_TARGET,
  DAILY_BONUS,
  DAILY_BONUS_INTERVAL_MS,
  applyBustRescue,
  applyDailyBonus,
  availableCoins,
  cappedCredit,
  creditableHands,
  dailyBonusReady,
  escrowedTotal,
} from "./economy";

describe("economy", () => {
  it("escrowedTotal sums positive escrows", () => {
    expect(escrowedTotal({ a: 100, b: 250 })).toBe(350);
    expect(escrowedTotal(undefined)).toBe(0);
    expect(escrowedTotal({})).toBe(0);
  });

  it("availableCoins floors and clamps", () => {
    expect(availableCoins({ coins: 1234.9 })).toBe(1234);
    expect(availableCoins({ coins: -5 })).toBe(0);
  });

  it("dailyBonusReady respects the 24h interval", () => {
    const now = DAILY_BONUS_INTERVAL_MS * 10;
    expect(dailyBonusReady(now - DAILY_BONUS_INTERVAL_MS, now)).toBe(true);
    expect(dailyBonusReady(now - 1000, now)).toBe(false);
  });

  it("applyDailyBonus grants once and updates timestamp", () => {
    const now = DAILY_BONUS_INTERVAL_MS * 5;
    const fresh = applyDailyBonus({ coins: 100, lastDailyBonus: 0 }, now);
    expect(fresh.granted).toBe(DAILY_BONUS);
    expect(fresh.wallet.coins).toBe(100 + DAILY_BONUS);
    expect(fresh.wallet.lastDailyBonus).toBe(now);
    // Segunda llamada inmediata: sin bono.
    const again = applyDailyBonus(fresh.wallet, now);
    expect(again.granted).toBe(0);
  });

  it("bust rescue tops up only when broke and no escrows", () => {
    const r = applyBustRescue({ coins: 200, escrows: {}, lastDailyBonus: 0 });
    expect(r.wallet.coins).toBe(BUST_RESCUE_TARGET);
    expect(r.granted).toBe(BUST_RESCUE_TARGET - 200);
  });

  it("no rescue when coins locked in escrow", () => {
    const r = applyBustRescue({ coins: 0, escrows: { room1: 5000 }, lastDailyBonus: 0 });
    expect(r.granted).toBe(0);
    expect(r.wallet.coins).toBe(0);
  });

  it("no rescue when above threshold", () => {
    const r = applyBustRescue({ coins: 5000, escrows: {}, lastDailyBonus: 0 });
    expect(r.granted).toBe(0);
  });

  describe("cappedCredit (zero-sum room payout cap)", () => {
    it("pays the full desired amount when within the room pot", () => {
      expect(cappedCredit(500, 1000, 0)).toBe(500);
      expect(cappedCredit(1000, 1000, 0)).toBe(1000);
    });

    it("blocks minting: a host-inflated stack is capped to the room pot", () => {
      // Host sets lobby.chips to 999999 but only 1000 was bought in.
      expect(cappedCredit(999_999, 1000, 0)).toBe(1000);
    });

    it("accounts for coins already cashed out of the room", () => {
      // 1000 in, 800 already paid out -> at most 200 left to pay.
      expect(cappedCredit(500, 1000, 800)).toBe(200);
      expect(cappedCredit(500, 1000, 1000)).toBe(0);
    });

    it("never pays from an empty pot", () => {
      expect(cappedCredit(500, 0, 0)).toBe(0);
    });

    it("clamps negative / non-finite desired to zero", () => {
      expect(cappedCredit(-5, 1000, 0)).toBe(0);
      expect(cappedCredit(NaN, 1000, 0)).toBe(0);
      // Infinity is non-finite -> treated as 0 (safe: never an unbounded payout).
      expect(cappedCredit(Infinity, 1000, 0)).toBe(0);
    });

    it("floors fractional inputs", () => {
      expect(cappedCredit(500.9, 1000.9, 0.9)).toBe(500);
    });
  });

  describe("creditableHands (anti-XP-forging delta)", () => {
    it("grants the full verified count when nothing was credited yet", () => {
      expect(creditableHands(8, 0)).toBe(8);
    });

    it("only grants the new delta on a repeat record", () => {
      // Played 8 hands total in the room, 5 already credited -> only 3 new.
      expect(creditableHands(8, 5)).toBe(3);
    });

    it("grants nothing when the verified count has not advanced", () => {
      // Replaying record-session with no new hands -> no XP farmed.
      expect(creditableHands(5, 5)).toBe(0);
      expect(creditableHands(5, 9)).toBe(0);
    });

    it("clamps negative / fractional inputs", () => {
      expect(creditableHands(-3, 0)).toBe(0);
      expect(creditableHands(7.9, 2.9)).toBe(5);
    });
  });
});
