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
  return { id, cells, weight };
}

const L = {
  h: 'hull',
  p: 'plating',
  g: 'gatling',
  c: 'cannon',
  m: 'mortar',
  s: 'saw',
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
