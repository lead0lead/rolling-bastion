import Phaser from 'phaser';
import { ELITE, ENEMIES, ENEMY_TYPES, type EnemyType } from '../config/enemies';
import { TILES, type TileType } from '../config/tiles';
import { BARREL_TYPES, drawBarrel, drawIcon, type BarrelType } from './icons';
import { COLORS, drawCracks, drawOfflineMark, drawTile } from './tiles';

/** Procedural textures (concept.md §6: no external art in the prototype). */
export const TEX = {
  bgGrid: 'bg-grid',
  gem: 'gem',
  shotSmall: 'shot-small',
  shotBig: 'shot-big',
  shell: 'shell',
  enemy: (type: string, elite = false) => `enemy-${type}${elite ? '-elite' : ''}`,
  enemyShot: 'enemy-shot',
  tile: (type: TileType, offline: boolean) => `tile-${type}${offline ? '-off' : ''}`,
  barrel: (type: BarrelType) => `barrel-${type}`,
  cracks: 'tile-cracks',
} as const;

/** Tile textures are drawn at this size and scaled to the cell size. */
const TILE_TEX_PX = 64;

export const BG_GRID_SIZE = 64;

export function createTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.gem)) return;
  const g = scene.make.graphics({}, false);

  g.fillStyle(COLORS.background, 1);
  g.fillRect(0, 0, BG_GRID_SIZE, BG_GRID_SIZE);
  g.lineStyle(1, COLORS.gridCell, 1);
  g.strokeRect(0.5, 0.5, BG_GRID_SIZE, BG_GRID_SIZE);
  g.generateTexture(TEX.bgGrid, BG_GRID_SIZE, BG_GRID_SIZE);
  g.clear();

  for (const type of ENEMY_TYPES) {
    for (const elite of [false, true]) {
      const r = ENEMIES[type].radius * (elite ? ELITE.scale : 1);
      const size = Math.ceil(r * 2 + 10);
      drawEnemy(g, type, size / 2, r, elite);
      g.generateTexture(TEX.enemy(type, elite), size, size);
      g.clear();
    }
  }

  g.fillStyle(0xff4d5e, 1);
  g.fillCircle(5, 5, 4);
  g.lineStyle(1.5, 0xffc2c8, 1);
  g.strokeCircle(5, 5, 4);
  g.generateTexture(TEX.enemyShot, 10, 10);
  g.clear();

  g.fillStyle(0x3ff0ff, 1);
  g.fillPoints(toPoints([5, 0, 10, 5, 5, 10, 0, 5]), true);
  g.generateTexture(TEX.gem, 10, 10);
  g.clear();

  g.fillStyle(0xfff3b0, 1);
  g.fillCircle(4, 4, 3);
  g.generateTexture(TEX.shotSmall, 8, 8);
  g.clear();

  g.fillStyle(0xffb347, 1);
  g.fillCircle(6, 6, 5);
  g.lineStyle(1.5, 0xfff3b0, 1);
  g.strokeCircle(6, 6, 5);
  g.generateTexture(TEX.shotBig, 12, 12);
  g.clear();

  g.fillStyle(0x3a2a1a, 1);
  g.fillCircle(6, 6, 5);
  g.lineStyle(2, 0xffa040, 1);
  g.strokeCircle(6, 6, 5);
  g.generateTexture(TEX.shell, 12, 12);

  g.destroy();
  createTileTextures(scene);
}

/**
 * Pre-rendered tiles (body + label), one per type and online state, so the
 * city draws as batched sprites instead of re-tessellated Graphics each frame.
 */
function createTileTextures(scene: Phaser.Scene): void {
  const size = TILE_TEX_PX;
  const g = scene.make.graphics({}, false);
  for (const type of Object.keys(TILES) as TileType[]) {
    for (const offline of [false, true]) {
      g.clear();
      drawTile(g, 0, 0, size, type, { offline });
      const body = offline ? COLORS.offline : TILES[type].color;
      drawIcon(g, type, size, offline ? 0x8a93a6 : 0xffffff, body);
      if (offline) drawOfflineMark(g, 0, 0, size);
      scene.textures.addDynamicTexture(TEX.tile(type, offline), size, size)?.draw(g);
    }
  }
  for (const type of BARREL_TYPES) {
    g.clear();
    drawBarrel(g, type, size);
    scene.textures.addDynamicTexture(TEX.barrel(type), size, size)?.draw(g);
  }
  g.clear();
  drawCracks(g, 0, 0, size, 0x0d0f14, 0.7);
  scene.textures.addDynamicTexture(TEX.cracks, size, size)?.draw(g);
  g.destroy();
}

/**
 * Enemy shapes (concept.md §6: dark fill, bright outline), centred at (c, c)
 * with radius r. Elites get a second, white ring.
 */
function drawEnemy(
  g: Phaser.GameObjects.Graphics,
  type: EnemyType,
  c: number,
  r: number,
  elite: boolean,
): void {
  const def = ENEMIES[type];
  g.fillStyle(def.color, 1);
  g.lineStyle(2, def.outline, 1);
  const poly = (xy: number[]) => {
    g.fillPoints(toPoints(xy), true);
    g.strokePoints(toPoints(xy), true);
  };
  const ngon = (sides: number, rot: number, rad = r) => {
    const xy: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      xy.push(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
    }
    poly(xy);
  };
  switch (type) {
    case 'runner':
      ngon(4, 0, r + 1);
      break;
    case 'brute':
      ngon(6, Math.PI / 6);
      g.lineStyle(2, def.outline, 0.6);
      g.strokeCircle(c, c, r * 0.45);
      break;
    case 'spitter':
      ngon(3, -Math.PI / 2, r + 1);
      g.fillStyle(def.outline, 1);
      g.fillCircle(c, c + r * 0.1, r * 0.25);
      break;
    case 'sapper':
      ngon(4, Math.PI / 4, r + 1);
      g.lineStyle(2, def.outline, 1);
      g.lineBetween(c - r * 0.5, c, c + r * 0.5, c);
      g.lineBetween(c, c - r * 0.5, c, c + r * 0.5);
      break;
    case 'bomber':
      g.fillCircle(c, c, r);
      g.strokeCircle(c, c, r);
      g.fillStyle(def.outline, 1);
      g.fillCircle(c, c, r * 0.4);
      break;
    default:
      g.fillCircle(c, c, r);
      g.strokeCircle(c, c, r);
  }
  if (elite) {
    g.lineStyle(2, ELITE.outline, 1);
    g.strokeCircle(c, c, r + 2);
  }
}

function toPoints(xy: number[]): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push(new Phaser.Math.Vector2(xy[i], xy[i + 1]));
  return out;
}
