/**
 * The shop's casino (concept-v2.md §2.18): one roulette-style wheel, spun for coins.
 * Fair-ish but the house wins in the long run: the expected payout is
 * sum(multiplier) / segments = 17/20 = 85 % of the bet, and the shop allows only a few spins a visit.
 */
export const CASINO = {
  /** Wheel segments, in wheel order: payout multiplier of the bet and colour. */
  segments: [
    [0, 0x3a3f4b],
    [2, 0x2a9d8f],
    [0, 0x3a3f4b],
    [0.5, 0x6c757d],
    [0, 0x3a3f4b],
    [2, 0x2a9d8f],
    [0, 0x3a3f4b],
    [3, 0xe9c46a],
    [0, 0x3a3f4b],
    [0.5, 0x6c757d],
    [0, 0x3a3f4b],
    [2, 0x2a9d8f],
    [0, 0x3a3f4b],
    [5, 0xe63946],
    [0, 0x3a3f4b],
    [2, 0x2a9d8f],
    [0, 0x3a3f4b],
    [0, 0x3a3f4b],
    [0, 0x3a3f4b],
    [0, 0x3a3f4b],
  ],
  /** Bets the player can pick (coins). */
  bets: [5, 10, 25, 50],
  /** Spins per shop visit. */
  maxSpins: 6,
  /** Spin animation: full turns and duration (ms). */
  turns: 5,
  spinMs: 3600,
} as const;
