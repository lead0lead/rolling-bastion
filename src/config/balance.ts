/** Grid and build-screen tuning (concept.md §2.1, §2.3, §2.8). Starting values. */
export const GRID = {
  /** Side length of the starting grid. */
  startSize: 6,
  /** Each expansion adds one ring of cells: side length grows by 2. */
  expansionGrowth: 2,
  /** Largest grid side length. */
  maxSize: 10,
  /** World pixels per cell. */
  cellPx: 32,
} as const;

export const OFFERS = {
  /** Pieces offered per build pause. */
  count: 3,
} as const;
