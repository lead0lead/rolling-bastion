import Phaser from 'phaser';
import type { TileType } from '../config/tiles';
import { COLORS } from './palette';

/**
 * Procedural tile icons (concept.md §6), drawn into a `size`×`size` box at
 * the origin. `ink` is the icon colour, `body` the tile's fill colour.
 * Weapon tiles draw only their turret base; the barrel is a separate sprite.
 */
export function drawIcon(
  g: Phaser.GameObjects.Graphics,
  type: TileType,
  size: number,
  ink: number,
  body: number,
): void {
  const s = size / 64; // icons are designed on a 64 px tile
  const c = size / 2;
  const shade = Phaser.Display.Color.ValueToColor(body).darken(30).color;
  const pts = (xy: number[]) => {
    const out: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < xy.length; i += 2) {
      out.push(new Phaser.Math.Vector2((xy[i] ?? 0) * s, (xy[i + 1] ?? 0) * s));
    }
    return out;
  };

  switch (type) {
    case 'core':
      g.lineStyle(4 * s, COLORS.ink, 1);
      g.strokeCircle(c, c, 14 * s);
      break;
    case 'hull':
      rivets(g, s, shade);
      break;
    case 'plating':
      g.lineStyle(3 * s, ink, 0.85);
      g.strokeRoundedRect(13 * s, 13 * s, 38 * s, 38 * s, 4 * s);
      rivets(g, s, shade);
      break;
    case 'gatling':
    case 'cannon': {
      const r = (type === 'cannon' ? 17 : 15) * s;
      g.fillStyle(shade, 1);
      g.fillCircle(c, c, r);
      g.lineStyle(3 * s, ink, 1);
      g.strokeCircle(c, c, r);
      break;
    }
    case 'crossbow':
      g.fillStyle(shade, 1);
      g.fillCircle(c, c, 13 * s);
      g.lineStyle(3 * s, ink, 1);
      g.strokeCircle(c, c, 13 * s);
      break;
    case 'mortar':
      g.lineStyle(4 * s, ink, 1);
      g.strokeCircle(c, c, 16 * s);
      g.fillStyle(ink, 1);
      g.fillCircle(c, c, 7 * s);
      break;
    case 'saw': {
      const teeth = 10;
      const xy: number[] = [];
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? 23 : 16;
        xy.push(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      g.fillStyle(ink, 1);
      g.fillPoints(pts(xy), true);
      g.fillStyle(shade, 1);
      g.fillCircle(c, c, 6 * s);
      break;
    }
    case 'generator':
      g.fillStyle(ink, 1);
      g.fillPoints(pts([36, 10, 18, 36, 30, 36, 26, 54, 46, 26, 34, 26, 40, 10]), true);
      break;
    case 'shield':
      g.fillStyle(ink, 1);
      g.fillPoints(pts([32, 11, 50, 18, 48, 36, 32, 53, 16, 36, 14, 18]), true);
      g.fillStyle(shade, 1);
      g.fillPoints(pts([32, 20, 42, 24, 41, 35, 32, 44]), true);
      break;
    case 'repair':
      g.fillStyle(ink, 1);
      g.fillRect(27 * s, 14 * s, 10 * s, 36 * s);
      g.fillRect(14 * s, 27 * s, 36 * s, 10 * s);
      break;
    case 'magnet':
      g.lineStyle(8 * s, ink, 1);
      g.beginPath();
      g.arc(c, 30 * s, 13 * s, 0, Math.PI, false);
      g.strokePath();
      g.lineBetween(19 * s, 30 * s, 19 * s, 16 * s);
      g.lineBetween(45 * s, 30 * s, 45 * s, 16 * s);
      g.fillStyle(shade, 1);
      g.fillRect(15 * s, 12 * s, 8 * s, 6 * s);
      g.fillRect(41 * s, 12 * s, 8 * s, 6 * s);
      break;
    case 'engine':
      g.lineStyle(6 * s, ink, 1);
      for (const x of [16, 32]) {
        g.beginPath();
        g.moveTo(x * s, 18 * s);
        g.lineTo((x + 14) * s, 32 * s);
        g.lineTo(x * s, 46 * s);
        g.strokePath();
      }
      break;
  }
}

function rivets(g: Phaser.GameObjects.Graphics, s: number, color: number): void {
  g.fillStyle(color, 1);
  for (const [x, y] of [
    [15, 15],
    [49, 15],
    [15, 49],
    [49, 49],
  ] as const) {
    g.fillCircle(x * s, y * s, 3.5 * s);
  }
}

/** Barrel shapes, drawn pointing right with the pivot at the box centre. */
export type BarrelType = 'core' | 'gatling' | 'cannon' | 'crossbow';
export const BARREL_TYPES: readonly BarrelType[] = ['core', 'gatling', 'cannon', 'crossbow'];

/** Tiles with a turning barrel (aimed weapons). */
export function barrelFor(type: TileType): BarrelType | null {
  return (BARREL_TYPES as readonly string[]).includes(type) ? (type as BarrelType) : null;
}

export function drawBarrel(g: Phaser.GameObjects.Graphics, type: BarrelType, size: number): void {
  const s = size / 64;
  const c = size / 2;
  const fill = type === 'core' ? COLORS.ink : 0xffffff;
  const edge = COLORS.ink;
  g.fillStyle(fill, 1);
  g.lineStyle(2 * s, edge, 1);
  if (type === 'gatling') {
    for (const dy of [-6, 0, 6]) {
      g.fillRect(c, c + (dy - 2) * s, 28 * s, 4 * s);
      g.strokeRect(c, c + (dy - 2) * s, 28 * s, 4 * s);
    }
    g.fillCircle(c, c, 8 * s);
    g.strokeCircle(c, c, 8 * s);
  } else if (type === 'cannon') {
    g.fillRect(c, c - 6 * s, 26 * s, 12 * s);
    g.strokeRect(c, c - 6 * s, 26 * s, 12 * s);
    g.fillRect(c + 24 * s, c - 8 * s, 6 * s, 16 * s);
    g.strokeRect(c + 24 * s, c - 8 * s, 6 * s, 16 * s);
    g.fillCircle(c, c, 11 * s);
    g.strokeCircle(c, c, 11 * s);
  } else if (type === 'crossbow') {
    // Stock along the aim, a bow across its front, the string and a loaded bolt.
    g.fillRect(c - 6 * s, c - 3 * s, 30 * s, 6 * s);
    g.strokeRect(c - 6 * s, c - 3 * s, 30 * s, 6 * s);
    g.lineStyle(4 * s, edge, 1);
    g.beginPath();
    g.arc(c + 10 * s, c, 18 * s, -1.0, 1.0, false);
    g.strokePath();
    g.lineStyle(1.5 * s, edge, 1);
    g.lineBetween(c + 10 * s + Math.cos(-1) * 18 * s, c + Math.sin(-1) * 18 * s, c + 2 * s, c);
    g.lineBetween(c + 10 * s + Math.cos(1) * 18 * s, c + Math.sin(1) * 18 * s, c + 2 * s, c);
    g.fillCircle(c, c, 7 * s);
    g.lineStyle(2 * s, edge, 1);
    g.strokeCircle(c, c, 7 * s);
  } else {
    g.fillRect(c, c - 3 * s, 20 * s, 6 * s);
    g.fillCircle(c, c, 6 * s);
  }
}
