/**
 * The game's colours (concept.md §6, decided 2026-10-20: light, simple and
 * colourful like agar.io). Tile and enemy body colours live in their
 * configs; everything else is here.
 */
export const COLORS = {
  /** Off-white page with a thin light-grey grid. */
  background: 0xf3f5f8,
  bgGridLine: 0xdfe4eb,
  /** Build screen grid cells. */
  gridCell: 0xe8ecf2,
  gridLine: 0xd3d9e3,
  /** Offline tiles: grey body, light icon, red broken link. */
  offline: 0xb9c0cc,
  offlineInk: 0xeef1f5,
  invalid: 0xf0405a,
  valid: 0x2fbf71,
  bridge: 0xffb703,
  /** Outlines of piece groups and the hovered group. */
  groupOutline: 0x2b2f3a,
  hover: 0x2b2f3a,
  panel: 0xffffff,
  panelBorder: 0xd3d9e3,
  /** Buttons: confirm green (hover darker), disabled grey, selected toggle. */
  confirm: 0x34c26d,
  confirmHover: 0x29a95c,
  disabled: 0xdfe4eb,
  selected: 0xd6f5e2,
  /** Bars: background, XP, Core, low Core, boss, enraged boss. */
  barBack: 0xdfe4eb,
  xp: 0x1fa2ff,
  core: 0x2b2f3a,
  coreLow: 0xf0405a,
  boss: 0xb5179e,
  bossEnraged: 0xf0405a,
  /** Dark ink for icons details, barrels' outlines and cracks. */
  ink: 0x2b2f3a,
  /** Filled rows/columns frame. */
  fill: 0x3a86ff,
  /** Player shots, Mortar shells, enemy shots, gems (own colour families). */
  shot: 0xffd23f,
  shotBig: 0xff9f1c,
  shell: 0x8d5a2b,
  enemyShot: 0xe5383b,
  gem: 0x00b4ff,
  blast: 0xff9f1c,
  /** The boss charge telegraph. */
  charge: 0xf0405a,
  text: '#2b2f3a',
  textDim: '#6b7385',
  textWarn: '#e0344b',
  textInfo: '#3a86ff',
  textBoss: '#c2185b',
} as const;

/** CSS hex string for a colour number. */
export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * UI font (concept.md §6): Fredoka, bundled in public/fonts and loaded before
 * the game starts (main.ts); rounded system fonts as fallback.
 */
export const FONT = {
  family: 'Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
  /** CSS weight for normal UI text, and for titles and banners. */
  weight: '500',
  bold: '600',
} as const;
