import type { LandShape } from '../config/land';
import type { PieceDef } from '../config/pieces';
import type { TileType } from '../config/tiles';
import { updateOnline } from './connectivity';
import {
  destroyTile,
  dropGroup,
  heldCellsAt,
  heldFromPiece,
  heldGroupIds,
  liftGroups,
  placementProblems,
  rotateHeld,
  scrapGroup,
  tileAt,
  type Cell,
  type CellProblem,
  type CityState,
  type HeldGroup,
  type PlacedTile,
} from './grid';
import { addLand, landCells, landProblems } from './land';
import { canUpgrade, upgradeType } from './upgrades';

/** Where the held group came from, so a cancelled move can be undone. */
export type HeldOrigin =
  | { kind: 'offer'; index: number }
  /** Lifted from the grid: the tiles as they were, and whether it was the selection. */
  | { kind: 'grid'; tiles: PlacedTile[]; selection: boolean };

/** State of one build pause (concept.md §2.3). */
export interface BuildSession {
  city: CityState;
  offers: PieceDef[];
  /** True once one offer has been placed (or scrapped), or Repair Core chosen; the others are gone. */
  offerTaken: boolean;
  /** Repair Core was chosen instead of a piece. */
  repairChosen: boolean;
  /** Per offer: the tile type its "Upgrade" option would level, or null if not available. */
  upgrades: (TileType | null)[];
  /** Index of the offer taken as an upgrade instead of placing it, or null. */
  upgradeChosen: number | null;
  /** Placed pieces scrapped during this pause (each refunds XP in a run). */
  scrapped: number;
  held: HeldGroup | null;
  heldOrigin: HeldOrigin | null;
  /**
   * Land shapes to choose from before anything else this pause (a land
   * level-up, concept-v2.md §2.1), or null when there is none or it is placed.
   */
  land: LandShape[] | null;
  /** The land shape in hand (index into `land`) and its rotation. */
  heldLand: { index: number; turns: number } | null;
  /** Selected groups (never the Core's), concept-v2.md §3.1. */
  selection: Set<number>;
}

export type ConfirmBlock = 'land' | 'holding' | 'no_offer_taken' | 'disconnected';

export interface ConfirmStatus {
  ok: boolean;
  block?: ConfirmBlock;
  /** Number of offline tiles when blocked by 'disconnected'. */
  offline?: number;
}

export function startBuild(
  city: CityState,
  offers: PieceDef[],
  land: LandShape[] | null = null,
): BuildSession {
  updateOnline(city);
  return {
    land: land && land.length > 0 ? land : null,
    heldLand: null,
    selection: new Set(),
    city,
    offers,
    offerTaken: offers.length === 0,
    repairChosen: false,
    upgrades: offerUpgrades(city, offers),
    upgradeChosen: null,
    scrapped: 0,
    held: null,
    heldOrigin: null,
  };
}

// --------------------------------------------------------------------- land

/** Debug/sandbox: adds a land step to this pause. Not while a group is held. */
export function offerLand(s: BuildSession, land: LandShape[]): boolean {
  if (s.held || land.length === 0) return false;
  s.land = land;
  s.heldLand = null;
  return true;
}

/** Takes a land shape in hand (swapping out one already held, keeping its rotation). */
export function pickLand(s: BuildSession, index: number): boolean {
  if (!s.land?.[index] || s.held) return false;
  s.heldLand = { index, turns: s.heldLand?.turns ?? 0 };
  return true;
}

/** Cells the held land would cover centred on (x, y), and the cells (`cellKey`) that block it. */
export function landPreviewAt(
  s: BuildSession,
  x: number,
  y: number,
): { cells: Cell[]; problems: Set<string> } | null {
  const shape = s.heldLand && s.land?.[s.heldLand.index];
  if (!shape || !s.heldLand) return null;
  const cells = landCells(shape, s.heldLand.turns, x, y);
  return { cells, problems: landProblems(s.city, cells) };
}

/** Places the held land centred on (x, y). The land step is then done. False if invalid. */
export function placeLandAt(s: BuildSession, x: number, y: number): boolean {
  const preview = landPreviewAt(s, x, y);
  if (!preview || !addLand(s.city, preview.cells)) return false;
  s.land = null;
  s.heldLand = null;
  return true;
}

// ------------------------------------------------------------------- pieces

export function pickOffer(s: BuildSession, index: number): boolean {
  const def = s.offers[index];
  if (!def || s.offerTaken || s.held || s.land) return false;
  s.held = heldFromPiece(s.city, def);
  s.heldOrigin = { kind: 'offer', index };
  return true;
}

/**
 * Lifts the group under the given cell, held by that cell; if that group is
 * selected, lifts the whole selection. Picking up an unselected group clears
 * the selection. The Core is fixed (concept-v2.md §2.1).
 */
export function pickUpAt(s: BuildSession, x: number, y: number): boolean {
  if (s.held || s.land) return false;
  const tile = tileAt(s.city, x, y);
  if (!tile || tile.type === 'core') return false;
  const fromSelection = selectedGroups(s).includes(tile.groupId);
  if (!fromSelection) s.selection.clear();
  const ids = new Set(fromSelection ? selectedGroups(s) : [tile.groupId]);
  const snapshot = s.city.tiles.filter((t) => ids.has(t.groupId)).map((t) => ({ ...t }));
  const held = liftGroups(s.city, [...ids], { x, y });
  if (!held) return false;
  s.held = held;
  s.heldOrigin = { kind: 'grid', tiles: snapshot, selection: fromSelection };
  updateOnline(s.city);
  return true;
}

// ---------------------------------------------------------------- selection

/** The selected groups that still exist (a destroyed tile can remove or split one). */
export function selectedGroups(s: BuildSession): number[] {
  const present = new Set(s.city.tiles.map((t) => t.groupId));
  return [...s.selection].filter((id) => present.has(id));
}

/** Shift+click: adds the group under (x, y) to the selection or removes it. Not the Core. */
export function toggleSelectAt(s: BuildSession, x: number, y: number): boolean {
  if (s.held) return false;
  const tile = tileAt(s.city, x, y);
  if (!tile || tile.type === 'core') return false;
  if (s.selection.has(tile.groupId)) s.selection.delete(tile.groupId);
  else s.selection.add(tile.groupId);
  return true;
}

/**
 * Box select: every group with a tile inside the cell rectangle spanned by
 * (x0, y0) and (x1, y1), inclusive. Replaces the selection unless `add`.
 */
export function selectBox(
  s: BuildSession,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  add = false,
): void {
  if (s.held) return;
  if (!add) s.selection.clear();
  const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [minY, maxY] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (const t of s.city.tiles) {
    if (t.type === 'core') continue;
    if (t.gx >= minX && t.gx <= maxX && t.gy >= minY && t.gy <= maxY) s.selection.add(t.groupId);
  }
}

/** Selects every group except the Core's. */
export function selectAll(s: BuildSession): void {
  if (s.held) return;
  for (const t of s.city.tiles) if (t.type !== 'core') s.selection.add(t.groupId);
}

export function clearSelection(s: BuildSession): void {
  s.selection.clear();
}

/** Scraps every selected group. Returns how many were scrapped (each refunds XP in a run). */
export function scrapSelection(s: BuildSession): number {
  if (s.held) return 0;
  const ids = selectedGroups(s);
  for (const id of ids) scrapGroup(s.city, id);
  s.scrapped += ids.length;
  s.selection.clear();
  updateOnline(s.city);
  return ids.length;
}

/** Rotates the held land or group. */
export function rotate(s: BuildSession, quarterTurns = 1): void {
  if (s.heldLand) s.heldLand.turns = (((s.heldLand.turns + quarterTurns) % 4) + 4) % 4;
  else if (s.held) s.held = rotateHeld(s.held, quarterTurns);
}

/** Top-left grid position of the held group when its anchor is over (x, y). */
export function heldOrigin(held: HeldGroup, x: number, y: number): Cell {
  return { x: x - held.anchor.x, y: y - held.anchor.y };
}

/** Cells the held group would cover with its anchor over (x, y), and their problems. */
export function previewAt(
  s: BuildSession,
  x: number,
  y: number,
): { cells: Cell[]; problems: Map<string, CellProblem> } | null {
  if (!s.held) return null;
  const o = heldOrigin(s.held, x, y);
  const cells = heldCellsAt(s.held, o.x, o.y);
  return { cells, problems: placementProblems(s.city, cells) };
}

/** Drops the held group with its anchor over (x, y). False if the spot is invalid. */
export function dropAt(s: BuildSession, x: number, y: number): boolean {
  if (!s.held) return false;
  const o = heldOrigin(s.held, x, y);
  if (!dropGroup(s.city, s.held, o.x, o.y)) return false;
  if (s.heldOrigin?.kind === 'offer') s.offerTaken = true;
  // A moved selection stays selected, so it can be moved again.
  if (s.heldOrigin?.kind === 'grid' && s.heldOrigin.selection) {
    s.selection = new Set(heldGroupIds(s.held));
  }
  s.held = null;
  s.heldOrigin = null;
  updateOnline(s.city);
  return true;
}

/** Puts the held group back where it came from (offer tray or its old cells). */
export function cancelHeld(s: BuildSession): void {
  s.heldLand = null;
  if (!s.held || !s.heldOrigin) return;
  if (s.heldOrigin.kind === 'grid') s.city.tiles.push(...s.heldOrigin.tiles);
  s.held = null;
  s.heldOrigin = null;
  updateOnline(s.city);
}

/** Scraps the held group for good. The Core cannot be scrapped. */
export function scrapHeld(s: BuildSession): boolean {
  if (!s.held || s.held.tiles.some((t) => t.type === 'core')) return false;
  if (s.heldOrigin?.kind === 'offer') {
    s.offerTaken = true;
  } else {
    const ids = heldGroupIds(s.held);
    s.scrapped += ids.length;
    for (const id of ids) s.selection.delete(id);
  }
  s.held = null;
  s.heldOrigin = null;
  updateOnline(s.city);
  return true;
}

/** Scraps the placed group under (x, y). The Core cannot be scrapped. */
export function scrapAt(s: BuildSession, x: number, y: number): boolean {
  if (s.held) return false;
  const tile = tileAt(s.city, x, y);
  if (!tile || tile.type === 'core') return false;
  scrapGroup(s.city, tile.groupId);
  s.selection.delete(tile.groupId);
  s.scrapped++;
  updateOnline(s.city);
  return true;
}

/** Takes Repair Core instead of a piece, or un-chooses it again. */
export function toggleRepair(s: BuildSession): boolean {
  if (s.held || s.land) return false;
  if (s.repairChosen) {
    s.repairChosen = false;
    s.offerTaken = false;
    return true;
  }
  if (s.offerTaken) return false;
  s.offerTaken = true;
  s.repairChosen = true;
  return true;
}

/**
 * Duplicates upgrade instead of placing (concept.md §2.8): available when the
 * city owns the piece's main tile type and it is below the max level.
 */
function offerUpgrades(city: CityState, offers: PieceDef[]): (TileType | null)[] {
  return offers.map((def) => {
    const type = upgradeType(def);
    return canUpgrade(city, type) ? type : null;
  });
}

/** Takes an offer as an upgrade instead of placing it, or un-chooses it again. */
export function toggleUpgrade(s: BuildSession, index: number): boolean {
  if (s.held || s.land || !s.upgrades[index]) return false;
  if (s.upgradeChosen === index) {
    s.upgradeChosen = null;
    s.offerTaken = false;
    return true;
  }
  if (s.offerTaken) return false;
  s.offerTaken = true;
  s.upgradeChosen = index;
  return true;
}

/** The tile type chosen for an upgrade this pause, if any. */
export function chosenUpgrade(s: BuildSession): TileType | null {
  return s.upgradeChosen === null ? null : (s.upgrades[s.upgradeChosen] ?? null);
}

/** Replaces the offers. Only before an offer is taken and while no offer is held. */
export function canReroll(s: BuildSession): boolean {
  return !s.land && !s.offerTaken && s.heldOrigin?.kind !== 'offer' && s.offers.length > 0;
}

export function reroll(s: BuildSession, offers: PieceDef[]): boolean {
  if (!canReroll(s)) return false;
  s.offers = offers;
  s.upgrades = offerUpgrades(s.city, offers);
  return true;
}

export function confirmStatus(s: BuildSession): ConfirmStatus {
  if (s.land) return { ok: false, block: 'land' };
  if (s.held) return { ok: false, block: 'holding' };
  if (!s.offerTaken) return { ok: false, block: 'no_offer_taken' };
  const offline = s.city.tiles.filter((t) => !t.online).length;
  if (offline > 0) return { ok: false, block: 'disconnected', offline };
  return { ok: true };
}

/** Debug: destroy the tile under (x, y), as if enemies had killed it. */
export function debugDestroyAt(s: BuildSession, x: number, y: number): boolean {
  if (s.held) return false;
  const tile = tileAt(s.city, x, y);
  if (!tile || tile.type === 'core') return false;
  destroyTile(s.city, tile.id);
  updateOnline(s.city);
  return true;
}
