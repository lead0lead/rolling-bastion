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
    case 'gatling': {
      const r = 15 * s;
      g.fillStyle(shade, 1);
      g.fillCircle(c, c, r);
      g.lineStyle(3 * s, ink, 1);
      g.strokeCircle(c, c, r);
      break;
    }
    case 'flamethrower':
      // Fuel tank under the nozzle.
      g.fillStyle(shade, 1);
      g.fillRoundedRect(17 * s, 17 * s, 30 * s, 30 * s, 8 * s);
      g.lineStyle(3 * s, ink, 1);
      g.strokeRoundedRect(17 * s, 17 * s, 30 * s, 30 * s, 8 * s);
      break;
    case 'crossbow':
      g.fillStyle(shade, 1);
      g.fillCircle(c, c, 13 * s);
      g.lineStyle(3 * s, ink, 1);
      g.strokeCircle(c, c, 13 * s);
      break;
    case 'generator':
      g.fillStyle(ink, 1);
      g.fillPoints(pts([36, 10, 18, 36, 30, 36, 26, 54, 46, 26, 34, 26, 40, 10]), true);
      break;
    case 'tesla':
      // Coil: a post with a ball on top and two arcs.
      g.fillStyle(shade, 1);
      g.fillCircle(c, c, 15 * s);
      g.lineStyle(3 * s, ink, 1);
      g.strokeCircle(c, c, 15 * s);
      g.fillStyle(ink, 1);
      g.fillPoints(pts([34, 18, 24, 34, 31, 34, 28, 46, 40, 29, 33, 29, 38, 18]), true);
      break;
    case 'confetti':
      g.lineStyle(4 * s, ink, 1);
      g.strokeCircle(c, c, 16 * s);
      for (const [x, y, col] of [
        [24, 26, 0xff6b6b],
        [40, 24, 0x4cc9f0],
        [32, 40, 0xffe94d],
        [44, 40, 0x80ed99],
        [22, 40, 0xcdb4db],
      ] as const) {
        g.fillStyle(col, 1);
        g.fillRect((x - 3) * s, (y - 3) * s, 6 * s, 6 * s);
      }
      break;
    case 'blackhole':
      g.fillStyle(0x1b1d3a, 1);
      g.fillCircle(c, c, 18 * s);
      g.lineStyle(3 * s, ink, 1);
      g.strokeCircle(c, c, 18 * s);
      g.lineStyle(2 * s, ink, 0.7);
      g.strokeCircle(c, c, 11 * s);
      g.fillStyle(0x000000, 1);
      g.fillCircle(c, c, 6 * s);
      break;
    case 'hangar':
      // Landing pad with an H and a little drone.
      g.lineStyle(3 * s, ink, 1);
      g.strokeCircle(c, c, 20 * s);
      g.lineStyle(5 * s, ink, 1);
      g.lineBetween(24 * s, 22 * s, 24 * s, 42 * s);
      g.lineBetween(40 * s, 22 * s, 40 * s, 42 * s);
      g.lineBetween(24 * s, 32 * s, 40 * s, 32 * s);
      break;
    case 'dome':
      g.lineStyle(5 * s, ink, 1);
      g.beginPath();
      g.arc(c, 44 * s, 22 * s, Math.PI, 0, false);
      g.strokePath();
      g.lineBetween(10 * s, 44 * s, 54 * s, 44 * s);
      g.fillStyle(ink, 1);
      g.fillCircle(c, 44 * s, 4 * s);
      break;
    case 'robot':
      // Little robot head: screen face, two eyes, an antenna.
      g.fillStyle(ink, 1);
      g.fillRoundedRect(14 * s, 20 * s, 36 * s, 28 * s, 7 * s);
      g.fillStyle(body, 1);
      g.fillCircle(25 * s, 33 * s, 4.5 * s);
      g.fillCircle(39 * s, 33 * s, 4.5 * s);
      g.fillRect(25 * s, 41 * s, 14 * s, 3 * s);
      g.lineStyle(3 * s, ink, 1);
      g.lineBetween(c, 20 * s, c, 11 * s);
      g.fillStyle(ink, 1);
      g.fillCircle(c, 10 * s, 3 * s);
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
export type BarrelType = 'core' | 'gatling' | 'crossbow' | 'flamethrower';
export const BARREL_TYPES: readonly BarrelType[] = [
  'core',
  'gatling',
  'crossbow',
  'flamethrower',
];

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
  } else if (type === 'flamethrower') {
    // Short nozzle widening to a flared mouth.
    g.fillRect(c, c - 4 * s, 18 * s, 8 * s);
    g.strokeRect(c, c - 4 * s, 18 * s, 8 * s);
    const mouth = [
      { x: c + 16 * s, y: c - 5 * s },
      { x: c + 26 * s, y: c - 9 * s },
      { x: c + 26 * s, y: c + 9 * s },
      { x: c + 16 * s, y: c + 5 * s },
    ];
    g.fillPoints(mouth, true);
    g.strokePoints(mouth, true);
    g.fillCircle(c, c, 8 * s);
    g.strokeCircle(c, c, 8 * s);
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
