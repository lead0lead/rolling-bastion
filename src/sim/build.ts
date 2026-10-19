import type { PieceDef } from '../config/pieces';
import { updateOnline } from './connectivity';
import {
  destroyTile,
  dropGroup,
  expandGrid,
  heldCellsAt,
  heldFromPiece,
  liftGroup,
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

/** Where the held group came from, so a cancelled move can be undone. */
export type HeldOrigin = { kind: 'offer'; index: number } | { kind: 'grid'; tiles: PlacedTile[] };

/** State of one build pause (concept.md §2.3). */
export interface BuildSession {
  city: CityState;
  offers: PieceDef[];
  /** True once one offer has been placed (or scrapped), or Repair Core chosen; the others are gone. */
  offerTaken: boolean;
  /** Repair Core was chosen instead of a piece. */
  repairChosen: boolean;
  /** Placed pieces scrapped during this pause (each refunds XP in a run). */
  scrapped: number;
  held: HeldGroup | null;
  heldOrigin: HeldOrigin | null;
}

export type ConfirmBlock = 'holding' | 'no_offer_taken' | 'disconnected';

export interface ConfirmStatus {
  ok: boolean;
  block?: ConfirmBlock;
  /** Number of offline tiles when blocked by 'disconnected'. */
  offline?: number;
}

export function startBuild(city: CityState, offers: PieceDef[]): BuildSession {
  updateOnline(city);
  return {
    city,
    offers,
    offerTaken: offers.length === 0,
    repairChosen: false,
    scrapped: 0,
    held: null,
    heldOrigin: null,
  };
}

export function pickOffer(s: BuildSession, index: number): boolean {
  const def = s.offers[index];
  if (!def || s.offerTaken || s.held) return false;
  s.held = heldFromPiece(s.city, def);
  s.heldOrigin = { kind: 'offer', index };
  return true;
}

/** Lifts the group under the given cell, held by that cell. */
export function pickUpAt(s: BuildSession, x: number, y: number): boolean {
  if (s.held) return false;
  const tile = tileAt(s.city, x, y);
  if (!tile) return false;
  const snapshot = s.city.tiles.filter((t) => t.groupId === tile.groupId).map((t) => ({ ...t }));
  const held = liftGroup(s.city, tile.groupId, { x, y });
  if (!held) return false;
  s.held = held;
  s.heldOrigin = { kind: 'grid', tiles: snapshot };
  updateOnline(s.city);
  return true;
}

export function rotate(s: BuildSession, quarterTurns = 1): void {
  if (s.held) s.held = rotateHeld(s.held, quarterTurns);
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
  s.held = null;
  s.heldOrigin = null;
  updateOnline(s.city);
  return true;
}

/** Puts the held group back where it came from (offer tray or its old cells). */
export function cancelHeld(s: BuildSession): void {
  if (!s.held || !s.heldOrigin) return;
  if (s.heldOrigin.kind === 'grid') s.city.tiles.push(...s.heldOrigin.tiles);
  s.held = null;
  s.heldOrigin = null;
  updateOnline(s.city);
}

/** Scraps the held group for good. The Core cannot be scrapped. */
export function scrapHeld(s: BuildSession): boolean {
  if (!s.held || s.held.tiles.some((t) => t.type === 'core')) return false;
  if (s.heldOrigin?.kind === 'offer') s.offerTaken = true;
  else s.scrapped++;
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
  s.scrapped++;
  updateOnline(s.city);
  return true;
}

/** Takes Repair Core instead of a piece, or un-chooses it again. */
export function toggleRepair(s: BuildSession): boolean {
  if (s.held) return false;
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

/** Replaces the offers. Only before an offer is taken and while no offer is held. */
export function canReroll(s: BuildSession): boolean {
  return !s.offerTaken && s.heldOrigin?.kind !== 'offer' && s.offers.length > 0;
}

export function reroll(s: BuildSession, offers: PieceDef[]): boolean {
  if (!canReroll(s)) return false;
  s.offers = offers;
  return true;
}

export function confirmStatus(s: BuildSession): ConfirmStatus {
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

/** Grid expansion. Not allowed while a group is held (its old cells would shift). */
export function expand(s: BuildSession): boolean {
  if (s.held) return false;
  const grown = expandGrid(s.city);
  if (grown) updateOnline(s.city);
  return grown;
}
