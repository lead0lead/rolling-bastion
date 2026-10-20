import Phaser from 'phaser';
import { ELITE, ENEMIES, ENEMY_TYPES, type EnemyType } from '../config/enemies';
import { TILES, type TileType } from '../config/tiles';
import { BARREL_TYPES, drawBarrel, drawIcon, type BarrelType } from './icons';
import { COLORS } from './palette';
import { drawCracks, drawOfflineMark, drawTile, outlineOf } from './tiles';

/** Procedural textures (concept.md §6: no external art in the prototype). */
export const TEX = {
  bgGrid: 'bg-grid',
  gem: 'gem',
  shotSmall: 'shot-small',
  shotBig: 'shot-big',
  shell: 'shell',
  enemy: (type: string, elite = false) => `enemy-${type}${elite ? '-elite' : ''}`,
  /** Colossus look per phase (1 = the plain enemy texture). */
  boss: (phase: number) => (phase <= 1 ? 'enemy-colossus' : `enemy-colossus-p${phase}`),
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
  g.lineStyle(1, COLORS.bgGridLine, 1);
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

  for (const phase of [2, 3]) {
    const r = ENEMIES.colossus.radius;
    const size = Math.ceil(r * 2 + 10);
    drawEnemy(g, 'colossus', size / 2, r, false, phase);
    g.generateTexture(TEX.boss(phase), size, size);
    g.clear();
  }

  // Shiny round dots (concept.md §6: like agar.io food), each in its own colour family.
  for (const [key, color, r] of [
    [TEX.enemyShot, COLORS.enemyShot, 4.5],
    [TEX.gem, COLORS.gem, 5],
    [TEX.shotSmall, COLORS.shot, 3.5],
    [TEX.shotBig, COLORS.shotBig, 5.5],
    [TEX.shell, COLORS.shell, 5.5],
  ] as const) {
    const size = Math.ceil(r * 2 + 4);
    drawDot(g, size / 2, r, color);
    g.generateTexture(key, size, size);
    g.clear();
  }

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
      drawIcon(g, type, size, offline ? COLORS.offlineInk : 0xffffff, body);
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
  drawCracks(g, 0, 0, size, COLORS.ink, 0.6);
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
  bossPhase = 1,
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
    case 'colossus':
      if (bossPhase >= 3) {
        // Red glow behind the body.
        g.fillStyle(0xff2020, 0.35);
        g.fillCircle(c, c, r + 4);
        g.fillStyle(def.color, 1);
      }
      ngon(6, Math.PI / 6);
      g.lineStyle(3, def.outline, 0.7);
      g.strokeCircle(c, c, r * 0.55);
      g.fillStyle(bossPhase >= 3 ? 0xff5050 : def.outline, 1);
      g.fillCircle(c, c, r * (bossPhase >= 3 ? 0.3 : 0.2));
      if (bossPhase >= 2) {
        // Cracks.
        g.lineStyle(2, def.outline, 0.9);
        g.beginPath();
        g.moveTo(c - r * 0.75, c - r * 0.3);
        g.lineTo(c - r * 0.35, c - r * 0.1);
        g.lineTo(c - r * 0.45, c + r * 0.35);
        g.moveTo(c + r * 0.2, c - r * 0.8);
        g.lineTo(c + r * 0.4, c - r * 0.4);
        g.lineTo(c + r * 0.75, c - r * 0.3);
        g.moveTo(c + r * 0.3, c + r * 0.85);
        g.lineTo(c + r * 0.2, c + r * 0.5);
        g.strokePath();
      }
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

/** A flat dot with a darker outline and a small highlight, centred at (c, c). */
function drawDot(g: Phaser.GameObjects.Graphics, c: number, r: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillCircle(c, c, r);
  g.lineStyle(Math.max(1.5, r * 0.35), outlineOf(color), 1);
  g.strokeCircle(c, c, r);
  g.fillStyle(0xffffff, 0.75);
  g.fillCircle(c - r * 0.35, c - r * 0.35, r * 0.28);
}

function toPoints(xy: number[]): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push(new Phaser.Math.Vector2(xy[i], xy[i + 1]));
  return out;
}
