/**
 * Land shapes (concept-v2.md §2.1): at set levels the level-up first offers
 * land that grows the board. Starting values to tune; the levels were
 * spread out after the user's Spike B2 feedback (2026-10-21).
 */
export const LAND = {
  /**
   * Levels whose level-up also offers land. The balance sim's bots reach
   * them at about 2:10, 3:30, 5:35, 7:20 and 9:05 (they collect every gem,
   * so players get there later).
   */
  atLevels: [8, 15, 22, 29, 36],
  /** After the last of `atLevels`, land keeps coming every this many levels (endless, §2.11). */
  thenEvery: 7,
  /** Land shapes offered per land level-up. */
  offers: 3,
  /** Cells per land shape (every shape has the same count). */
  cells: 12,
} as const;

export interface LandShape {
  id: string;
  name: string;
  /** Cells relative to the shape's top-left, unrotated. */
  cells: { x: number; y: number }[];
}

/** Builds a land shape from an ASCII picture ('#' = cell, '.' = empty). */
function shape(id: string, name: string, rows: string[]): LandShape {
  const cells: { x: number; y: number }[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') cells.push({ x, y });
    }),
  );
  if (cells.length !== LAND.cells) throw new Error(`land ${id}: ${cells.length} cells`);
  return { id, name, cells };
}

export const LAND_SHAPES: LandShape[] = [
  shape('block', 'Block', ['####', '####', '####']),
  shape('strip', 'Strip', ['######', '######']),
  shape('ell', 'Big L', ['##..', '##..', '##..', '##..', '####']),
  shape('tee', 'Big T', ['######', '..##..', '..##..', '..##..']),
  shape('plus', 'Plus', ['.##.', '####', '####', '.##.']),
  shape('cup', 'U', ['#..#', '#..#', '####', '####']),
  shape('zed', 'Thick Z', ['###...', '######', '...###']),
];
