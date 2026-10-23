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
  /** Particles: cap on live particles, and their slow-down rate (1/s). */
  maxParticles: 700,
  particleDrag: 4,
  /** Enemy death pop: confetti count, speed (px/s), size (× enemy radius), life (s). */
  enemyPop: { count: 7, speed: 170, size: 0.7, life: 0.45 },
  /** Tile destruction burst: tumbling squares (size in px). */
  tileBurst: { count: 12, speed: 210, size: 7, life: 0.6 },
  /** Core pulse: scale amount and speed (rad/s). */
  corePulse: { amount: 0.05, speed: 3.2 },
  /** Generator pulse rings: period (s), max radius (cells), start alpha. */
  generatorPulse: { period: 1.2, radius: 1.4, alpha: 0.45 },
  /** Magnet pulse ring: grows to the pulse radius over `time` (s) while fading. */
  magnetPulse: { time: 0.6, alpha: 0.7, width: 3 },
  /** Gem sparkle: scale amount and speed (rad/s). */
  gemSparkle: { amount: 0.18, speed: 6 },
  /** Bounce of a piece just placed in the build screen: overshoot and duration (s). */
  placeBounce: { amount: 0.2, time: 0.25 },
  /** Screen shake (duration ms, intensity): tile lost, boss phase change. */
  shakeTileLoss: { ms: 120, intensity: 0.003 },
  shakeBossPhase: { ms: 320, intensity: 0.007 },
  /**
   * Colossus death (concept-v2.md §2.11): confetti waves (count each, speed
   * px/s, size px, life s; later waves slower), a white flash (ms), a long
   * shake, and how long the first kill plays out before the victory screen (s).
   */
  bossDeath: {
    waves: 3,
    count: 70,
    speed: 620,
    size: 13,
    life: 1.6,
    flashMs: 300,
    shake: { ms: 700, intensity: 0.014 },
    holdSec: 1.8,
  },
  /** Victory screen: title pop-in (ms), stat line delay (ms), confetti per side (speed px/s, size px, life s). */
  victory: {
    popMs: 520,
    statsDelayMs: 350,
    confetti: { count: 90, speed: 700, size: 12, life: 1.8 },
  },
  /** "Reduce effects" setting: this share of particles; no shake, wobble or pulses. */
  reducedParticleShare: 1 / 3,
} as const;
