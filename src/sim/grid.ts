import { GRID } from '../config/balance';
import type { PieceDef } from '../config/pieces';
import { TILES, type Facing, type TileType } from '../config/tiles';

export interface Cell {
  x: number;
  y: number;
}

export interface PlacedTile {
  id: number;
  type: TileType;
  gx: number;
  gy: number;
  hp: number;
  /** Max HP after levels and bonuses; set from the synergies (concept.md §2.7). */
  maxHp: number;
  groupId: number;
  online: boolean;
  /** Compass facing; turns with the piece (concept.md §2.10). */
  facing: Facing;
}

export interface CityState {
  /** Buildable cells, by `cellId` (concept-v2.md §2.1). Grows by land shapes. */
  board: Set<number>;
  tiles: PlacedTile[];
  typeLevels: Record<TileType, number>;
  nextTileId: number;
  nextGroupId: number;
}

/**
 * One or more groups lifted off the grid together (or a fresh piece not yet
 * placed). Tile gx/gy are relative to the top-left of them all, normalized so
 * the minimum is 0; each tile keeps its own `groupId`. `anchor` is the
 * relative cell the pointer holds them by; `groupId` is the group of that
 * cell (the grabbed one).
 */
export interface HeldGroup {
  groupId: number;
  tiles: PlacedTile[];
  anchor: Cell;
}

/** The distinct groups in a held selection. */
export function heldGroupIds(held: HeldGroup): number[] {
  return [...new Set(held.tiles.map((t) => t.groupId))];
}

export type CellProblem = 'off_board' | 'overlap';

const ALL_TILE_TYPES = Object.keys(TILES) as TileType[];

/**
 * Coordinates must stay within ±COORD_LIMIT − 1 for `cellId` to be unique.
 * This limit keeps every id below 2^30, a small integer for V8: map lookups
 * on the hot path then allocate nothing (larger ids measurably slowed the
 * bench).
 */
const COORD_LIMIT = 16384;

/** A number key per cell, for sparse maps and sets on the open-ended grid. */
export function cellId(x: number, y: number): number {
  return (x + COORD_LIMIT) * 2 * COORD_LIMIT + (y + COORD_LIMIT);
}

export function cellFromId(id: number): Cell {
  const span = 2 * COORD_LIMIT;
  return { x: Math.floor(id / span) - COORD_LIMIT, y: (id % span) - COORD_LIMIT };
}

/** A size×size square of board cells with (0, 0) where v1's grid centre was. */
export function squareBoard(size: number): Set<number> {
  const board = new Set<number>();
  const off = Math.floor(size / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) board.add(cellId(x - off, y - off));
  }
  return board;
}

/**
 * A new city: the Core fixed at (0, 0) on a square starting board
 * (concept-v2.md §2.1).
 */
export function createCity(boardSize: number = GRID.startSize): CityState {
  const typeLevels = Object.fromEntries(ALL_TILE_TYPES.map((t) => [t, 0])) as Record<
    TileType,
    number
  >;
  typeLevels.core = 1;
  return {
    board: squareBoard(boardSize),
    tiles: [
      {
        id: 1,
        type: 'core',
        gx: 0,
        gy: 0,
        hp: TILES.core.maxHp,
        maxHp: TILES.core.maxHp,
        groupId: 1,
        online: true,
        facing: 0,
      },
    ],
    typeLevels,
    nextTileId: 2,
    nextGroupId: 2,
  };
}

export function onBoard(city: CityState, x: number, y: number): boolean {
  return city.board.has(cellId(x, y));
}

export function tileAt(city: CityState, x: number, y: number): PlacedTile | undefined {
  return city.tiles.find((t) => t.gx === x && t.gy === y);
}

export function coreTile(city: CityState): PlacedTile | undefined {
  return city.tiles.find((t) => t.type === 'core');
}

/** Rotates cells by 90° clockwise steps (screen coordinates, y down), then normalizes. */
export function rotateCells<T extends Cell>(cells: readonly T[], quarterTurns: number): T[] {
  const turns = ((quarterTurns % 4) + 4) % 4;
  let out = cells.map((c) => ({ ...c }));
  for (let i = 0; i < turns; i++) out = out.map((c) => ({ ...c, x: -c.y, y: c.x }));
  return normalizeCells(out);
}

export function normalizeCells<T extends Cell>(cells: readonly T[]): T[] {
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  return cells.map((c) => ({ ...c, x: c.x - minX, y: c.y - minY }));
}

/** Problems for each cell that cannot be occupied (empty map = placement valid). */
export function placementProblems(
  city: CityState,
  cells: readonly Cell[],
): Map<string, CellProblem> {
  const problems = new Map<string, CellProblem>();
  for (const c of cells) {
    const key = cellKey(c.x, c.y);
    if (!onBoard(city, c.x, c.y)) problems.set(key, 'off_board');
    else if (tileAt(city, c.x, c.y)) problems.set(key, 'overlap');
  }
  return problems;
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Absolute cells a held group would occupy with its top-left at (ox, oy). */
export function heldCellsAt(held: HeldGroup, ox: number, oy: number): Cell[] {
  return held.tiles.map((t) => ({ x: ox + t.gx, y: oy + t.gy }));
}

/** Creates a held group for a fresh piece: new ids, full HP, not yet in the city. */
export function heldFromPiece(city: CityState, def: PieceDef): HeldGroup {
  const groupId = city.nextGroupId++;
  const cells = normalizeCells(def.cells);
  const tiles = cells.map((c) => ({
    id: city.nextTileId++,
    type: c.tile,
    gx: c.x,
    gy: c.y,
    hp: TILES[c.tile].maxHp,
    maxHp: TILES[c.tile].maxHp,
    groupId,
    online: false,
    facing: c.facing,
  }));
  return { groupId, tiles, anchor: centralCell(tiles) };
}

/** Removes a group from the grid and returns it as held, anchored at `grab` (absolute). */
export function liftGroup(city: CityState, groupId: number, grab?: Cell): HeldGroup | undefined {
  return liftGroups(city, [groupId], grab);
}

/**
 * Removes several groups from the grid and returns them as one held
 * selection, keeping their relative positions, anchored at `grab` (absolute;
 * its group becomes `groupId`).
 */
export function liftGroups(
  city: CityState,
  groupIds: readonly number[],
  grab?: Cell,
): HeldGroup | undefined {
  const ids = new Set(groupIds);
  const tiles = city.tiles.filter((t) => ids.has(t.groupId));
  if (tiles.length === 0) return undefined;
  city.tiles = city.tiles.filter((t) => !ids.has(t.groupId));
  const minX = Math.min(...tiles.map((t) => t.gx));
  const minY = Math.min(...tiles.map((t) => t.gy));
  const rel = tiles.map((t) => ({ ...t, gx: t.gx - minX, gy: t.gy - minY }));
  const anchor = grab ? { x: grab.x - minX, y: grab.y - minY } : centralCell(rel);
  const grabbed = rel.find((t) => t.gx === anchor.x && t.gy === anchor.y) ?? rel[0];
  return { groupId: grabbed?.groupId ?? groupIds[0] ?? 0, tiles: rel, anchor };
}

/** Places a held selection with its top-left at (ox, oy). Returns false (no change) if invalid. */
export function dropGroup(city: CityState, held: HeldGroup, ox: number, oy: number): boolean {
  if (placementProblems(city, heldCellsAt(held, ox, oy)).size > 0) return false;
  for (const t of held.tiles) city.tiles.push({ ...t, gx: ox + t.gx, gy: oy + t.gy });
  return true;
}

/** Rotates a held group 90° clockwise per step; the anchor stays on the same tile. */
export function rotateHeld(held: HeldGroup, quarterTurns = 1): HeldGroup {
  const turns = ((quarterTurns % 4) + 4) % 4;
  let tiles = held.tiles.map((t) => ({ ...t }));
  let anchor = { ...held.anchor };
  for (let i = 0; i < turns; i++) {
    tiles = tiles.map((t) => ({ ...t, gx: -t.gy, gy: t.gx, facing: turnFacing(t.facing, 1) }));
    anchor = { x: -anchor.y, y: anchor.x };
  }
  const minX = Math.min(...tiles.map((t) => t.gx));
  const minY = Math.min(...tiles.map((t) => t.gy));
  return {
    groupId: held.groupId,
    tiles: tiles.map((t) => ({ ...t, gx: t.gx - minX, gy: t.gy - minY })),
    anchor: { x: anchor.x - minX, y: anchor.y - minY },
  };
}

export function turnFacing(f: Facing, quarterTurns: number): Facing {
  return ((((f + quarterTurns) % 4) + 4) % 4) as Facing;
}

/** Facing as a screen angle in radians (0 = right, y down). */
export function facingAngle(f: Facing): number {
  return ((f - 1) * Math.PI) / 2;
}

/** Removes a placed group for good. */
export function scrapGroup(city: CityState, groupId: number): void {
  city.tiles = city.tiles.filter((t) => t.groupId !== groupId);
}

/**
 * Destroys a tile for good. If that splits its group into disconnected parts,
 * each extra part becomes its own group. Returns the destroyed tile.
 */
export function destroyTile(city: CityState, tileId: number): PlacedTile | undefined {
  const tile = city.tiles.find((t) => t.id === tileId);
  if (!tile) return undefined;
  city.tiles = city.tiles.filter((t) => t.id !== tileId);
  splitGroup(city, tile.groupId);
  return tile;
}

/** Re-assigns group ids so that every group is orthogonally connected. */
export function splitGroup(city: CityState, groupId: number): void {
  const members = city.tiles.filter((t) => t.groupId === groupId);
  const seen = new Set<number>();
  let first = true;
  for (const start of members) {
    if (seen.has(start.id)) continue;
    const id = first ? groupId : city.nextGroupId++;
    first = false;
    const stack = [start];
    seen.add(start.id);
    while (stack.length > 0) {
      const t = stack.pop() as PlacedTile;
      t.groupId = id;
      for (const n of members) {
        if (!seen.has(n.id) && Math.abs(n.gx - t.gx) + Math.abs(n.gy - t.gy) === 1) {
          seen.add(n.id);
          stack.push(n);
        }
      }
    }
  }
}

/** The tile nearest to the group's centroid (used as default grab point). */
function centralCell(tiles: readonly PlacedTile[]): Cell {
  const cx = tiles.reduce((s, t) => s + t.gx, 0) / tiles.length;
  const cy = tiles.reduce((s, t) => s + t.gy, 0) / tiles.length;
  let best = tiles[0];
  let bestD = Infinity;
  for (const t of tiles) {
    const d = (t.gx - cx) ** 2 + (t.gy - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  if (!best) throw new Error('centralCell: empty group');
  return { x: best.gx, y: best.gy };
}
