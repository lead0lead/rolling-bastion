import type { Facing, TileType } from './tiles';

export interface PieceCell {
  x: number;
  y: number;
  tile: TileType;
  /** Facing of the tile when the piece is unrotated (matters for arc weapons). */
  facing: Facing;
}

export interface PieceDef {
  id: string;
  cells: PieceCell[];
  /** Relative offer weight. */
  weight: number;
  /** Earliest game time (s) this piece may be offered. */
  minTime?: number;
}

/**
 * Builds a piece from an ASCII picture: one row per string, one character per
 * cell, '.' for empty. Characters map to tile types via `legend`. Every tile
 * faces `facing` (default up: the side drawn at the top is the piece's front).
 */
function piece(
  id: string,
  rows: string[],
  legend: Record<string, TileType>,
  weight = 1,
  minTime?: number,
  facing: Facing = 0,
): PieceDef {
  const cells: PieceCell[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const tile = legend[ch];
      if (!tile) throw new Error(`piece ${id}: unknown legend char '${ch}'`);
      cells.push({ x, y, tile, facing });
    });
  });
  return minTime === undefined ? { id, cells, weight } : { id, cells, weight, minTime };
}

const L = {
  h: 'hull',
  p: 'plating',
  g: 'gatling',
  c: 'cannon',
  m: 'mortar',
  s: 'saw',
  x: 'crossbow',
  f: 'flamethrower',
  k: 'spear',
  e: 'generator',
  d: 'shield',
  r: 'repair',
  u: 'magnet',
  n: 'engine',
} as const satisfies Record<string, TileType>;

/**
 * Phase 1 sandbox pool: one of each common shape with a mix of tile types,
 * so layouts can be tried by hand. Replaced by the real pools in Phase 2/3.
 */
export const SANDBOX_POOL: PieceDef[] = [
  piece('mono-hull', ['h'], L),
  piece('domino-hull', ['hh'], L),
  piece('i3-gatling', ['ggg'], L),
  piece('l3-cannon', ['c.', 'hh'], L),
  piece('i4-gatling', ['hggh'], L),
  piece('o-generator', ['ge', 'gg'], L),
  piece('t-cannon', ['hch', '.h.'], L),
  piece('s-saw', ['.hs', 'sh.'], L),
  piece('z-shield', ['gd.', '.hg'], L),
  piece('l-gatling', ['g.', 'g.', 'ge'], L),
  piece('j-plating', ['.p', '.p', 'pp'], L),
  piece('t-mortar', ['rmr', '.h.'], L),
  piece('l3-engine', ['n.', 'hu'], L),
  piece('l3-crossbow', ['x.', 'hx'], L),
  piece('l3-flamer', ['f.', 'hf'], L),
  piece('i3-spear', ['kkk'], L),
];

/** Phase 2 pool (concept.md §4.2): Gatling and Cannon pieces plus pure Hull. */
export const PHASE2_POOL: PieceDef[] = [
  piece('domino-gatling', ['gh'], L),
  piece('l3-gatling', ['g.', 'hg'], L),
  piece('i4-gatling', ['hggh'], L),
  piece('t-gatling', ['ggg', '.h.'], L),
  piece('domino-cannon', ['ch'], L),
  piece('l3-cannon', ['c.', 'hh'], L),
  piece('t-cannon', ['hch', '.h.'], L),
  piece('s-cannon', ['.ch', 'hc.'], L),
  piece('mono-hull', ['h'], L, 0.5),
  piece('domino-hull', ['hh'], L, 0.5),
  piece('i3-hull', ['hhh'], L, 0.5),
  piece('o-hull', ['hh', 'hh'], L, 0.4),
];

/** Pentominoes are offered from 4:00 (concept.md §4.2). */
const PENTOMINO_TIME = 240;

/**
 * Phase 3 pool (concept.md §4.2): all tile types. Weighted so that pieces
 * whose main tile is a support tile make up about a third of the offers
 * before 4:00. Starting values to tune.
 */
export const PHASE3_POOL: PieceDef[] = [
  // Weapons
  piece('domino-gatling', ['gh'], L),
  piece('l3-gatling', ['g.', 'hg'], L),
  piece('i3-gatling', ['ggg'], L, 0.6),
  piece('t-cannon', ['hch', '.h.'], L),
  piece('s-cannon', ['.ch', 'hc.'], L, 0.8),
  piece('l3-mortar', ['m.', 'hh'], L, 0.8),
  piece('domino-saw', ['sh'], L, 0.8),
  piece('i4-gatling', ['hggh'], L, 0.6),
  piece('l4-cannon', ['c.', 'c.', 'hh'], L, 0.6),
  piece('domino-crossbow', ['xh'], L, 0.8),
  piece('l3-crossbow', ['x.', 'hh'], L, 0.6),
  piece('domino-flamer', ['fh'], L, 0.8),
  piece('l3-flamer', ['f.', 'hh'], L, 0.6),
  piece('domino-spear', ['kh'], L, 0.8),
  piece('i3-spear', ['kkk'], L, 0.5),
  // Structure
  piece('l3-plating', ['p.', 'pp'], L, 0.6),
  piece('i3-plating', ['ppp'], L, 0.4),
  piece('mono-hull', ['h'], L, 0.3),
  piece('o-hull', ['hh', 'hh'], L, 0.3),
  // Support
  piece('domino-generator', ['eg'], L, 0.8),
  piece('domino-shield', ['dh'], L, 0.8),
  piece('l3-repair', ['r.', 'hh'], L, 0.8),
  piece('domino-magnet', ['uh'], L, 0.8),
  piece('domino-engine', ['nh'], L, 0.8),
  piece('z4-shield', ['dh.', '.hg'], L, 0.6),
  piece('j4-repair', ['.r', '.h', 'hh'], L, 0.5),
  // Pentominoes, from 4:00
  piece('i5-gatling', ['hgggh'], L, 0.6, PENTOMINO_TIME),
  piece('t5-cannon', ['ccc', '.h.', '.h.'], L, 0.5, PENTOMINO_TIME),
  piece('u5-mortar', ['h.h', 'mmm'], L, 0.5, PENTOMINO_TIME),
  piece('x5-generator', ['.g.', 'geg', '.g.'], L, 0.4, PENTOMINO_TIME),
  piece('l5-plating', ['p...', 'pppp'], L, 0.3, PENTOMINO_TIME),
  piece('p5-gatling', ['eg', 'gg', 'h.'], L, 0.4, PENTOMINO_TIME),
  piece('v5-plating', ['p..', 'p..', 'ppp'], L, 0.3, PENTOMINO_TIME),
  piece('y5-saw', ['ssss', '.h..'], L, 0.4, PENTOMINO_TIME),
];
