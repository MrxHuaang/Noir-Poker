//! Texas Hold'em equity engine (WASM).
//!
//! Ports the TS hand evaluator (`src/lib/handEval.ts`) to Rust and adds an
//! equity calculator: exact enumeration when <= 2 board cards are missing,
//! Monte-Carlo otherwise. No external RNG crate — a deterministic xorshift PRNG
//! keeps results reproducible and avoids `getrandom` plumbing on wasm.
//!
//! Boundary is JSON in / JSON out to keep wasm-bindgen glue trivial:
//!   input:  {"holes":[["AS","KS"],["7H","7D"]],"board":["2C","9D","JS"],"iters":100000,"seed":1}
//!   output: [{"equity":61.23},{"equity":38.77}]

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, PartialEq, Eq)]
struct Card {
    rank: u8, // 2..=14
    suit: u8, // 0..=3
}

fn parse_card(id: &str) -> Option<Card> {
    let bytes = id.as_bytes();
    if bytes.len() < 2 {
        return None;
    }
    let suit = match bytes[bytes.len() - 1] {
        b'S' => 0,
        b'H' => 1,
        b'D' => 2,
        b'C' => 3,
        _ => return None,
    };
    let rank = match &id[..id.len() - 1] {
        "2" => 2,
        "3" => 3,
        "4" => 4,
        "5" => 5,
        "6" => 6,
        "7" => 7,
        "8" => 8,
        "9" => 9,
        "T" => 10,
        "J" => 11,
        "Q" => 12,
        "K" => 13,
        "A" => 14,
        _ => return None,
    };
    Some(Card { rank, suit })
}

fn full_deck() -> Vec<Card> {
    let mut d = Vec::with_capacity(52);
    for suit in 0..4u8 {
        for rank in 2..=14u8 {
            d.push(Card { rank, suit });
        }
    }
    d
}

/// Pack [category, k0..k4] into a single comparable u32 (4 bits each).
fn pack(fields: &[u8]) -> u32 {
    let mut score = 0u32;
    for i in 0..6 {
        let v = *fields.get(i).unwrap_or(&0) as u32;
        score = (score << 4) | (v & 0xF);
    }
    score
}

/// Evaluate exactly 5 cards. Higher u32 = stronger hand. Mirrors eval5 in TS.
fn eval5(cards: &[Card; 5]) -> u32 {
    let mut ranks: [u8; 5] = [
        cards[0].rank,
        cards[1].rank,
        cards[2].rank,
        cards[3].rank,
        cards[4].rank,
    ];
    ranks.sort_unstable_by(|a, b| b.cmp(a)); // descending

    let flush = cards.iter().all(|c| c.suit == cards[0].suit);

    // Unique ranks descending.
    let mut uniq: Vec<u8> = ranks.to_vec();
    uniq.dedup();

    let mut straight_high = 0u8;
    if uniq.len() == 5 {
        if uniq[0] - uniq[4] == 4 {
            straight_high = uniq[0];
        } else if uniq[0] == 14 && uniq[1] == 5 && uniq[4] == 2 {
            straight_high = 5; // wheel A-2-3-4-5
        }
    }

    // Count occurrences, then sort groups by (count desc, rank desc).
    let mut counts: [u8; 15] = [0; 15];
    for r in ranks.iter() {
        counts[*r as usize] += 1;
    }
    let mut groups: Vec<(u8, u8)> = (2..=14u8)
        .filter(|r| counts[*r as usize] > 0)
        .map(|r| (counts[r as usize], r))
        .collect();
    groups.sort_unstable_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    let sig: Vec<u8> = groups.iter().map(|g| g.0).collect();

    if straight_high > 0 && flush {
        return pack(&[8, straight_high]);
    }
    if sig == [4, 1] {
        return pack(&[7, groups[0].1, groups[1].1]);
    }
    if sig == [3, 2] {
        return pack(&[6, groups[0].1, groups[1].1]);
    }
    if flush {
        return pack(&[5, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]]);
    }
    if straight_high > 0 {
        return pack(&[4, straight_high]);
    }
    if sig == [3, 1, 1] {
        return pack(&[3, groups[0].1, groups[1].1, groups[2].1]);
    }
    if sig == [2, 2, 1] {
        return pack(&[2, groups[0].1, groups[1].1, groups[2].1]);
    }
    if sig == [2, 1, 1, 1] {
        return pack(&[1, groups[0].1, groups[1].1, groups[2].1, groups[3].1]);
    }
    pack(&[0, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]])
}

/// Best 5-card score out of 7 (2 hole + 5 board). Enumerates the 21 combos.
fn best7(cards: &[Card; 7]) -> u32 {
    const IDX: [[usize; 5]; 21] = [
        [0, 1, 2, 3, 4], [0, 1, 2, 3, 5], [0, 1, 2, 3, 6], [0, 1, 2, 4, 5],
        [0, 1, 2, 4, 6], [0, 1, 2, 5, 6], [0, 1, 3, 4, 5], [0, 1, 3, 4, 6],
        [0, 1, 3, 5, 6], [0, 1, 4, 5, 6], [0, 2, 3, 4, 5], [0, 2, 3, 4, 6],
        [0, 2, 3, 5, 6], [0, 2, 4, 5, 6], [0, 3, 4, 5, 6], [1, 2, 3, 4, 5],
        [1, 2, 3, 4, 6], [1, 2, 3, 5, 6], [1, 2, 4, 5, 6], [1, 3, 4, 5, 6],
        [2, 3, 4, 5, 6],
    ];
    let mut best = 0u32;
    for combo in IDX.iter() {
        let five = [
            cards[combo[0]], cards[combo[1]], cards[combo[2]], cards[combo[3]], cards[combo[4]],
        ];
        let s = eval5(&five);
        if s > best {
            best = s;
        }
    }
    best
}

/// Deterministic PRNG (xorshift64*). No external crate; reproducible across runs.
struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self {
        Rng(seed.max(1))
    }
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next_u64() % n as u64) as usize
    }
}

#[derive(Deserialize)]
struct Input {
    holes: Vec<Vec<String>>,
    #[serde(default)]
    board: Vec<String>,
    #[serde(default = "default_iters")]
    iters: u32,
    #[serde(default = "default_seed")]
    seed: u64,
}
fn default_iters() -> u32 {
    100_000
}
fn default_seed() -> u64 {
    0x9E3779B97F4A7C15
}

#[derive(Serialize)]
struct Equity {
    equity: f64,
}

/// Accumulate one completed board into per-hole win shares (split on ties).
fn tally(holes: &[[Card; 2]], board: &[Card], wins: &mut [f64]) {
    let mut best = 0u32;
    let mut scores = [0u32; 16];
    for (i, h) in holes.iter().enumerate() {
        let seven = [h[0], h[1], board[0], board[1], board[2], board[3], board[4]];
        let s = best7(&seven);
        scores[i] = s;
        if s > best {
            best = s;
        }
    }
    let winners = holes.iter().enumerate().filter(|(i, _)| scores[*i] == best).count();
    let share = 1.0 / winners as f64;
    for (i, _) in holes.iter().enumerate() {
        if scores[i] == best {
            wins[i] += share;
        }
    }
}

/// Recursively enumerate every way to draw `need` cards from `deck[start..]`.
fn enumerate(
    holes: &[[Card; 2]],
    board: &mut Vec<Card>,
    deck: &[Card],
    start: usize,
    need: usize,
    wins: &mut [f64],
    count: &mut u64,
) {
    if need == 0 {
        tally(holes, board, wins);
        *count += 1;
        return;
    }
    for i in start..=deck.len() - need {
        board.push(deck[i]);
        enumerate(holes, board, deck, i + 1, need - 1, wins, count);
        board.pop();
    }
}

fn compute(input: &Input) -> Result<Vec<Equity>, String> {
    let holes: Vec<[Card; 2]> = input
        .holes
        .iter()
        .map(|h| {
            if h.len() != 2 {
                return Err("cada mano necesita 2 cartas".to_string());
            }
            let a = parse_card(&h[0]).ok_or("carta invalida")?;
            let b = parse_card(&h[1]).ok_or("carta invalida")?;
            Ok([a, b])
        })
        .collect::<Result<_, String>>()?;
    if holes.is_empty() {
        return Ok(vec![]);
    }
    let board: Vec<Card> = input
        .board
        .iter()
        .map(|c| parse_card(c).ok_or("carta de board invalida".to_string()))
        .collect::<Result<_, String>>()?;

    let need = 5usize.checked_sub(board.len()).ok_or("board > 5 cartas")?;

    // Remaining deck = 52 minus all known cards.
    let mut known: Vec<Card> = board.clone();
    for h in &holes {
        known.push(h[0]);
        known.push(h[1]);
    }
    let deck: Vec<Card> = full_deck()
        .into_iter()
        .filter(|c| !known.iter().any(|k| k == c))
        .collect();

    let mut wins = vec![0.0f64; holes.len()];
    let mut total = 0u64;

    if need == 0 {
        tally(&holes, &board, &mut wins);
        total = 1;
    } else if need <= 2 {
        // Exact: enumerate all remaining boards.
        let mut b = board.clone();
        enumerate(&holes, &mut b, &deck, 0, need, &mut wins, &mut total);
    } else {
        // Monte-Carlo: deterministic xorshift, partial Fisher-Yates per trial.
        let mut rng = Rng::new(input.seed ^ (holes.len() as u64) << 32 ^ deck.len() as u64);
        let mut sim = deck.clone();
        let n = sim.len();
        for _ in 0..input.iters {
            // Partial shuffle: pick `need` cards to the front.
            for j in 0..need {
                let k = j + rng.below(n - j);
                sim.swap(j, k);
            }
            let mut full = board.clone();
            full.extend_from_slice(&sim[0..need]);
            tally(&holes, &full, &mut wins);
            total += 1;
        }
    }

    let denom = total.max(1) as f64;
    Ok(wins
        .into_iter()
        .map(|w| Equity {
            equity: (w / denom * 10_000.0).round() / 100.0,
        })
        .collect())
}

/// WASM entry point. Returns a JSON array of `{equity}` aligned to `holes`,
/// or `{"error": "..."}` on bad input.
#[wasm_bindgen]
pub fn equity_json(input: &str) -> String {
    let parsed: Input = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(e) => return format!("{{\"error\":\"json: {}\"}}", e),
    };
    match compute(&parsed) {
        Ok(rows) => serde_json::to_string(&rows).unwrap_or_else(|_| "[]".to_string()),
        Err(e) => format!("{{\"error\":\"{}\"}}", e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(id: &str) -> Card {
        parse_card(id).unwrap()
    }
    fn five(ids: [&str; 5]) -> u32 {
        eval5(&[c(ids[0]), c(ids[1]), c(ids[2]), c(ids[3]), c(ids[4])])
    }

    #[test]
    fn category_ordering() {
        let royal = five(["AS", "KS", "QS", "JS", "TS"]);
        let quads = five(["AS", "AH", "AD", "AC", "KS"]);
        let full = five(["AS", "AH", "AD", "KC", "KS"]);
        let flush = five(["2S", "5S", "9S", "JS", "KS"]);
        let straight = five(["AS", "2H", "3D", "4C", "5S"]); // wheel
        let trips = five(["AS", "AH", "AD", "5C", "2S"]);
        let two_pair = five(["AS", "AH", "KD", "KC", "2S"]);
        let pair = five(["AS", "AH", "KD", "QC", "2S"]);
        let high = five(["AS", "KH", "QD", "JC", "9S"]);
        assert!(royal > quads);
        assert!(quads > full);
        assert!(full > flush);
        assert!(flush > straight);
        assert!(straight > trips);
        assert!(trips > two_pair);
        assert!(two_pair > pair);
        assert!(pair > high);
    }

    #[test]
    fn straight_flush_beats_quads() {
        let sf = five(["6S", "7S", "8S", "9S", "TS"]);
        let q = five(["AS", "AH", "AD", "AC", "2S"]);
        assert!(sf > q);
    }

    #[test]
    fn exact_equity_sums_to_100() {
        let input = Input {
            holes: vec![
                vec!["AS".into(), "AH".into()],
                vec!["KD".into(), "KC".into()],
            ],
            board: vec!["2S".into(), "7H".into(), "TD".into()],
            iters: 0,
            seed: 1,
        };
        let r = compute(&input).unwrap();
        let sum: f64 = r.iter().map(|e| e.equity).sum();
        assert!((sum - 100.0).abs() < 0.5, "sum was {}", sum);
        assert!(r[0].equity > r[1].equity, "AA should beat KK on 2 7 T");
    }

    #[test]
    fn mc_equity_aa_vs_kk_preflop() {
        let input = Input {
            holes: vec![
                vec!["AS".into(), "AH".into()],
                vec!["KD".into(), "KC".into()],
            ],
            board: vec![],
            iters: 50_000,
            seed: 42,
        };
        let r = compute(&input).unwrap();
        // AA vs KK preflop is ~82% / 18%.
        assert!(r[0].equity > 76.0 && r[0].equity < 88.0, "AA was {}", r[0].equity);
    }
}
