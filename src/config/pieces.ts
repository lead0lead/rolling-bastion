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
  g: 'gatling',
  x: 'crossbow',
  f: 'flamethrower',
  e: 'generator',
  n: 'engine',
  t: 'tesla',
  k: 'confetti',
  o: 'blackhole',
  a: 'hangar',
  y: 'dome',
  i: 'robot',
} as const satisfies Record<string, TileType>;

/** The shop's stock (concept-v2.md §2.13): every tile type except the Core, one cell each, always on sale. */
export const SHOP_PIECES: PieceDef[] = Object.entries(L).map(([ch, tile]) =>
  piece(`shop-${tile}`, [ch], L),
);

/**
 * Phase 1 sandbox pool: one of each common shape with a mix of tile types,
 * so layouts can be tried by hand. Replaced by the real pools in Phase 2/3.
 */
export const SANDBOX_POOL: PieceDef[] = [
  piece('mono-hull', ['h'], L),
  piece('domino-hull', ['hh'], L),
  piece('i3-gatling', ['ggg'], L),
  piece('i4-gatling', ['hggh'], L),
  piece('o-generator', ['ge', 'gg'], L),
  piece('z-crossbow', ['.hx', 'xh.'], L),
  piece('l-gatling', ['g.', 'g.', 'ge'], L),
  piece('l3-engine', ['n.', 'hh'], L),
  piece('l3-flamer', ['f.', 'hf'], L),
];

/** Phase 2 pool (concept.md §4.2): Gatling pieces plus pure Hull. */
export const PHASE2_POOL: PieceDef[] = [
  piece('domino-gatling', ['gh'], L),
  piece('l3-gatling', ['g.', 'hg'], L),
  piece('i4-gatling', ['hggh'], L),
  piece('t-gatling', ['ggg', '.h.'], L),
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
  piece('domino-crossbow', ['xh'], L, 0.8),
  piece('i4-gatling', ['hggh'], L, 0.6),
  piece('domino-flamer', ['fh'], L, 0.8),
  piece('l3-flamer', ['f.', 'hh'], L, 0.6),
  // Structure
  piece('mono-hull', ['h'], L, 0.3),
  piece('o-hull', ['hh', 'hh'], L, 0.3),
  // Support
  piece('domino-generator', ['eg'], L, 0.8),
  piece('domino-engine', ['nh'], L, 0.8),
  // Pentominoes, from 4:00
  piece('i5-gatling', ['hgggh'], L, 0.6, PENTOMINO_TIME),
  piece('x5-generator', ['.g.', 'geg', '.g.'], L, 0.4, PENTOMINO_TIME),
  piece('p5-gatling', ['eg', 'gg', 'h.'], L, 0.4, PENTOMINO_TIME),
];
