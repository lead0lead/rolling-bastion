import { LAND, type LandShape } from '../config/land';
import { cellId, cellKey, normalizeCells, rotateCells, type Cell, type CityState } from './grid';
import type { Rng } from './rng';

/** Land shapes (concept-v2.md §2.1): offers, placement rules, growing the board. */

/** True if reaching this level also offers land. */
export function isLandLevel(level: number): boolean {
  return (LAND.atLevels as readonly number[]).includes(level);
}

/** Distinct land shapes for one land level-up. */
export function rollLand(rng: Rng, pool: readonly LandShape[]): LandShape[] {
  const left = [...pool];
  const out: LandShape[] = [];
  while (out.length < LAND.offers && left.length > 0) {
    out.push(...left.splice(rng.int(0, left.length - 1), 1));
  }
  return out;
}

/**
 * The cells a land shape covers, turned clockwise by `quarterTurns`, with the
 * middle of its bounding box (rounded down) on cell (x, y).
 */
export function landCells(shape: LandShape, quarterTurns: number, x: number, y: number): Cell[] {
  const turned = normalizeCells(rotateCells(shape.cells, quarterTurns));
  const w = Math.max(...turned.map((c) => c.x)) + 1;
  const h = Math.max(...turned.map((c) => c.y)) + 1;
  const ox = x - Math.floor(w / 2);
  const oy = y - Math.floor(h / 2);
  return turned.map((c) => ({ x: ox + c.x, y: oy + c.y }));
}

/**
 * Cells (`cellKey`) that keep the land from being placed: those already on
 * the board, or every cell when none shares an edge with the board.
 */
export function landProblems(city: CityState, cells: readonly Cell[]): Set<string> {
  const problems = new Set<string>();
  let touches = false;
  for (const c of cells) {
    if (city.board.has(cellId(c.x, c.y))) problems.add(cellKey(c.x, c.y));
    for (const [dx, dy] of EDGES) {
      if (city.board.has(cellId(c.x + dx, c.y + dy))) touches = true;
    }
  }
  if (!touches) for (const c of cells) problems.add(cellKey(c.x, c.y));
  return problems;
}

/** Adds the cells to the board. Returns false (no change) if the placement is invalid. */
export function addLand(city: CityState, cells: readonly Cell[]): boolean {
  if (landProblems(city, cells).size > 0) return false;
  for (const c of cells) city.board.add(cellId(c.x, c.y));
  return true;
}

const EDGES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
