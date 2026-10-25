import Phaser from 'phaser';
import { TILES } from '../config/tiles';
import { cellId, type PlacedTile } from '../sim/grid';
import type { BuffType, Chain, Synergies } from '../sim/synergies';
import { COLORS } from './palette';

/** Look of chain links (dark ink line, white dots) (concept.md §2.7, §6). */
const CHAIN = { glowWidth: 0.34, glowAlpha: 0.35, coreWidth: 0.09, coreAlpha: 0.95, dot: 0.1 };

/**
 * Piece outlines (concept-v2.md §3.3): screen px widths of the border where a
 * tile meets another group or empty space, and of the seam between tiles of
 * the same group.
 */
const OUTLINE = { edge: 3, edgeAlpha: 0.9, seam: 1, seamAlpha: 0.35 };

/**
 * Draws piece outlines for a grid whose cell (0, 0) has its top-left corner
 * at (ox, oy), with cells of `cs` px; `px` is one screen pixel in these units.
 */
export function drawPieceOutlines(
  g: Phaser.GameObjects.Graphics,
  tiles: readonly PlacedTile[],
  cs: number,
  ox: number,
  oy: number,
  px: number,
): void {
  const group = new Map<number, number>();
  for (const t of tiles) group.set(cellId(t.gx, t.gy), t.groupId);
  const edge = (t: PlacedTile, dx: number, dy: number) => {
    const x0 = ox + (t.gx + (dx > 0 ? 1 : 0)) * cs;
    const y0 = oy + (t.gy + (dy > 0 ? 1 : 0)) * cs;
    if (dx !== 0) g.lineBetween(x0, y0, x0, y0 + cs);
    else g.lineBetween(x0, y0, x0 + cs, y0);
  };
  // Seams: each shared edge once (right and down neighbours only).
  g.lineStyle(OUTLINE.seam * px, COLORS.ink, OUTLINE.seamAlpha);
  for (const t of tiles) {
    if (group.get(cellId(t.gx + 1, t.gy)) === t.groupId) edge(t, 1, 0);
    if (group.get(cellId(t.gx, t.gy + 1)) === t.groupId) edge(t, 0, 1);
  }
  g.lineStyle(OUTLINE.edge * px, COLORS.ink, OUTLINE.edgeAlpha);
  for (const t of tiles) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (group.get(cellId(t.gx + dx, t.gy + dy)) !== t.groupId) edge(t, dx, dy);
    }
  }
}

/** Buff pips (concept-v2.md §3.3): which types get one, in corner order, and their look. */
const PIP_TYPES: readonly BuffType[] = ['generator'];
const PIP = { radius: 0.11, x0: 0.24, step: 0.26, y: 0.76, outline: 0.035 };

/**
 * Draws one pip per support type buffing each tile, along the tile's bottom
 * left in PIP_TYPES order (a fixed slot per type), in that type's colour.
 * Same grid convention as drawPieceOutlines.
 */
export function drawBuffPips(
  g: Phaser.GameObjects.Graphics,
  tiles: readonly PlacedTile[],
  syn: Synergies,
  cs: number,
  ox: number,
  oy: number,
): void {
  const types = new Map<number, Set<BuffType>>();
  for (const l of syn.links) {
    let set = types.get(l.to);
    if (!set) types.set(l.to, (set = new Set()));
    set.add(l.type);
  }
  for (const t of tiles) {
    const set = types.get(t.id);
    if (!set) continue;
    PIP_TYPES.forEach((type, i) => {
      if (!set.has(type)) return;
      const x = ox + (t.gx + PIP.x0 + i * PIP.step) * cs;
      const y = oy + (t.gy + PIP.y) * cs;
      g.fillStyle(TILES[type].color, 1);
      g.fillCircle(x, y, cs * PIP.radius);
      g.lineStyle(Math.max(1, cs * PIP.outline), COLORS.ink, 1);
      g.strokeCircle(x, y, cs * PIP.radius);
    });
  }
}

/**
 * Draws weapon chain links for a grid whose cell (0, 0) has its top-left
 * corner at (ox, oy), with cells of `cs` px. Sizes scale with the cell.
 */
export function drawSynergyLines(
  g: Phaser.GameObjects.Graphics,
  chains: readonly Chain[],
  cs: number,
  ox: number,
  oy: number,
): void {
  for (const c of chains) {
    const color = TILES[c.type].color;
    const x0 = ox + (c.x0 + 0.5) * cs;
    const y0 = oy + (c.y0 + 0.5) * cs;
    const x1 = ox + (c.x1 + 0.5) * cs;
    const y1 = oy + (c.y1 + 0.5) * cs;
    g.lineStyle(cs * CHAIN.glowWidth, color, CHAIN.glowAlpha);
    g.lineBetween(x0, y0, x1, y1);
    g.lineStyle(Math.max(1.5, cs * CHAIN.coreWidth), COLORS.ink, CHAIN.coreAlpha);
    g.lineBetween(x0, y0, x1, y1);
    for (let i = 0; i < c.length; i++) {
      const f = c.length > 1 ? i / (c.length - 1) : 0;
      const x = x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f;
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y, cs * CHAIN.dot);
      g.lineStyle(Math.max(1, cs * 0.04), COLORS.ink, CHAIN.coreAlpha);
      g.strokeCircle(x, y, cs * CHAIN.dot);
    }
  }
}
