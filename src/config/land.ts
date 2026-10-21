/**
 * Spike B2 (concept-v2.md §2.1, §11): land shapes added to the board at set
 * levels. Every shape has the same cell count. Claude's first guesses.
 */
export const LAND = {
  /** Levels whose level-up also offers new land. */
  atLevels: [5, 9, 13],
  /** Land shapes offered per expansion. */
  offers: 3,
  /** Cells per land shape (checked against LAND_SHAPES). */
  cells: 12,
} as const;

export interface LandShape {
  id: string;
  name: string;
  /** Cells relative to the shape's top-left. */
  cells: { x: number; y: number }[];
}

function shape(id: string, name: string, rows: string[]): LandShape {
  const cells: { x: number; y: number }[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && cells.push({ x, y })));
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
