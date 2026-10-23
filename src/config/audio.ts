/**
 * Sound effects (concept.md §7; Phase 6 of v2 added the new weapons' and the
 * Magnet's): Kenney CC0 samples in public/sfx (see ASSETS.md). Per sound: volume (0–1, before the master volume) and the
 * shortest gap between two plays (s), so frequent sounds don't machine-gun.
 */
export const SOUNDS = {
  'shot-gatling': { volume: 0.25, gap: 0.07 },
  'shot-cannon': { volume: 0.35, gap: 0.12 },
  'shot-mortar': { volume: 0.4, gap: 0.15 },
  'shot-crossbow': { volume: 0.35, gap: 0.12 },
  'shot-flame': { volume: 0.2, gap: 0.25 },
  'spear-thrust': { volume: 0.35, gap: 0.12 },
  'saw-hit': { volume: 0.25, gap: 0.12 },
  'magnet-pulse': { volume: 0.5, gap: 0.5 },
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
} as const;

export type SoundKey = keyof typeof SOUNDS;

export const SOUND_KEYS = Object.keys(SOUNDS) as SoundKey[];

/** Where the files are, relative to the page. */
export const soundUrl = (key: SoundKey) => `sfx/${key}.mp3`;
