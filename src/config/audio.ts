/**
 * A sound made on the fly with the Web Audio API instead of a file (party update, concept-v2.md §2.17):
 * an oscillator gliding from `from` to `to` Hz over `dur` s, optionally with a burst of noise.
 */
export interface Synth {
  wave: OscillatorType;
  from: number;
  to: number;
  dur: number;
  noise?: boolean;
}

/**
 * Sound effects (concept.md §7): Kenney CC0 samples in public/sfx (see ASSETS.md), plus synthesised ones
 * (`synth`). Per sound: volume (0–1, before the master volume) and the
 * shortest gap between two plays (s), so frequent sounds don't machine-gun.
 */
export const SOUNDS = {
  'shot-gatling': { volume: 0.25, gap: 0.07 },
  'shot-crossbow': { volume: 0.35, gap: 0.12 },
  'shot-flame': { volume: 0.2, gap: 0.25 },
  blast: { volume: 0.35, gap: 0.12 },
  bomb: { volume: 0.6, gap: 0.15 },
  'enemy-pop': { volume: 0.3, gap: 0.045 },
  'enemy-shot': { volume: 0.2, gap: 0.15 },
  gem: { volume: 0.25, gap: 0.06 },
  'tile-lost': { volume: 0.6, gap: 0.1 },
  'level-up': { volume: 0.6, gap: 0.2 },
  upgrade: { volume: 0.6, gap: 0.2 },
  'grid-expand': { volume: 0.6, gap: 0.5 },
  'boss-phase': { volume: 0.8, gap: 0.5 },
  'boss-charge': { volume: 0.6, gap: 0.5 },
  win: { volume: 0.8, gap: 1 },
  lose: { volume: 0.8, gap: 1 },
  'ui-pick': { volume: 0.5, gap: 0.03 },
  'ui-place': { volume: 0.6, gap: 0.03 },
  'ui-rotate': { volume: 0.5, gap: 0.03 },
  'ui-scrap': { volume: 0.6, gap: 0.05 },
  'ui-error': { volume: 0.5, gap: 0.2 },
  'ui-confirm': { volume: 0.6, gap: 0.1 },
  'ui-click': { volume: 0.5, gap: 0.03 },
  'ui-toggle': { volume: 0.5, gap: 0.03 },
  'shot-tesla': {
    volume: 0.3,
    gap: 0.1,
    synth: { wave: 'sawtooth', from: 1100, to: 140, dur: 0.18, noise: true },
  },
  'shot-confetti': {
    volume: 0.3,
    gap: 0.12,
    synth: { wave: 'square', from: 260, to: 900, dur: 0.12 },
  },
  'shot-hole': { volume: 0.5, gap: 0.5, synth: { wave: 'sine', from: 180, to: 28, dur: 0.6 } },
  'shot-hangar': {
    volume: 0.12,
    gap: 0.08,
    synth: { wave: 'square', from: 1300, to: 800, dur: 0.05 },
  },
  'drone-launch': {
    volume: 0.35,
    gap: 0.2,
    synth: { wave: 'sine', from: 300, to: 1000, dur: 0.18 },
  },
  'dome-hit': {
    volume: 0.25,
    gap: 0.1,
    synth: { wave: 'triangle', from: 520, to: 300, dur: 0.08 },
  },
  'dome-break': {
    volume: 0.7,
    gap: 0.5,
    synth: { wave: 'sawtooth', from: 1000, to: 50, dur: 0.7, noise: true },
  },
  steal: { volume: 0.4, gap: 0.2, synth: { wave: 'square', from: 520, to: 160, dur: 0.35 } },
  'disco-beat': { volume: 0.5, gap: 0.2, synth: { wave: 'sine', from: 160, to: 42, dur: 0.14 } },
  'disco-strike': {
    volume: 0.55,
    gap: 0.2,
    synth: { wave: 'sawtooth', from: 260, to: 70, dur: 0.22, noise: true },
  },
  'casino-tick': {
    volume: 0.25,
    gap: 0.04,
    synth: { wave: 'square', from: 900, to: 600, dur: 0.03 },
  },
  'casino-win': { volume: 0.5, gap: 0.3, synth: { wave: 'square', from: 500, to: 1400, dur: 0.4 } },
  'casino-big': { volume: 0.6, gap: 0.3, synth: { wave: 'square', from: 300, to: 2000, dur: 0.9 } },
  'casino-lose': {
    volume: 0.45,
    gap: 0.3,
    synth: { wave: 'sawtooth', from: 300, to: 80, dur: 0.5 },
  },
  streak: { volume: 0.4, gap: 0.2, synth: { wave: 'square', from: 500, to: 1100, dur: 0.16 } },
} as const satisfies Record<string, { volume: number; gap: number; synth?: Synth }>;

export type SoundKey = keyof typeof SOUNDS;

export const SOUND_KEYS = Object.keys(SOUNDS) as SoundKey[];

/** The synthesised definition of a sound, or undefined for one that is a file. */
export function synthOf(key: SoundKey): Synth | undefined {
  return (SOUNDS[key] as { synth?: Synth }).synth;
}

/** Where the files are, relative to the page. */
export const soundUrl = (key: SoundKey) => `sfx/${key}.mp3`;
