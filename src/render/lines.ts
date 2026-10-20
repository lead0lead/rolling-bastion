import Phaser from 'phaser';
import { TILES } from '../config/tiles';
import type { Synergies } from '../sim/synergies';
import { COLORS } from './palette';

/** Look of chain links (dark ink line, white dots) and filled-line frames (concept.md §2.7, §6). */
const CHAIN = { glowWidth: 0.34, glowAlpha: 0.35, coreWidth: 0.09, coreAlpha: 0.95, dot: 0.1 };
const FILL = { color: COLORS.fill, width: 0.08, alpha: 0.55, fillAlpha: 0.08 };

/**
 * Draws filled rows/columns and weapon chain links for a grid whose top-left
 * corner is at (ox, oy) with cells of `cs` px. Sizes scale with the cell.
 */
export function drawSynergyLines(
  g: Phaser.GameObjects.Graphics,
  syn: Synergies,
  gridSize: number,
  cs: number,
  ox: number,
  oy: number,
): void {
  const span = gridSize * cs;
  for (const [lines, horizontal] of [
    [syn.filledRows, true],
    [syn.filledCols, false],
  ] as const) {
    for (const i of lines) {
      const x = horizontal ? ox : ox + i * cs;
      const y = horizontal ? oy + i * cs : oy;
      const w = horizontal ? span : cs;
      const h = horizontal ? cs : span;
      g.fillStyle(FILL.color, FILL.fillAlpha);
      g.fillRect(x, y, w, h);
      g.lineStyle(Math.max(1.5, cs * FILL.width), FILL.color, FILL.alpha);
      g.strokeRect(x, y, w, h);
    }
  }

  for (const c of syn.chains) {
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
