/**
 * Effect strengths (concept.md §6, decided 2026-10-20: medium — bouncy and
 * poppy, but calm enough to read 600 enemies). Render-only; the simulation
 * never reads these. A "Reduce effects" switch comes with the Phase 6 settings.
 */
export const FX = {
  /** Enemy textures are drawn at this multiple of their world size so faces stay crisp. */
  enemyTexScale: 3,
  /** Idle wobble: squash/stretch amount and speed (rad/s). */
  wobbleAmount: 0.06,
  wobbleSpeed: 9,
  /** Hit squash: amount and how long it takes to spring back (s, game time). */
  squashAmount: 0.22,
  squashTime: 0.14,
  /** The boss is hit almost every frame; it squashes this much less so it doesn't stay flat. */
  bossSquashFactor: 0.2,
  /** White hit flash (s, game time). */
  hitFlash: 0.04,
} as const;
