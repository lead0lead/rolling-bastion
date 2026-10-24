import Phaser from 'phaser';
import { ELITE, ENEMIES, ENEMY_TYPES, type EnemyType } from '../config/enemies';
import { FX } from '../config/fx';
import { TILES, type TileType } from '../config/tiles';
import { BARREL_TYPES, drawBarrel, drawIcon, type BarrelType } from './icons';
import { COLORS } from './palette';
import { drawCracks, drawOfflineMark, drawTile, outlineOf } from './tiles';

/** Procedural textures (concept.md §6: no external art in the prototype). */
export const TEX = {
  bgGrid: 'bg-grid',
  shotSmall: 'shot-small',
  shotBig: 'shot-big',
  shell: 'shell',
  /** Crossbow bolt, drawn pointing right (rotated to its flight direction). */
  bolt: 'bolt',
  enemy: (type: string, elite = false) => `enemy-${type}${elite ? '-elite' : ''}`,
  /** Colossus look per phase (1 = the plain enemy texture). */
  boss: (phase: number) => (phase <= 1 ? 'enemy-colossus' : `enemy-colossus-p${phase}`),
  enemyShot: 'enemy-shot',
  tile: (type: TileType, offline: boolean) => `tile-${type}${offline ? '-off' : ''}`,
  barrel: (type: BarrelType) => `barrel-${type}`,
  cracks: 'tile-cracks',
  particleDot: 'particle-dot',
  particleSquare: 'particle-square',
} as const;

/** Tile textures are drawn at this size and scaled to the cell size. */
const TILE_TEX_PX = 64;

export const BG_GRID_SIZE = 64;

export function createTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.shotSmall)) return;
  const g = scene.make.graphics({}, false);

  g.fillStyle(COLORS.background, 1);
  g.fillRect(0, 0, BG_GRID_SIZE, BG_GRID_SIZE);
  g.lineStyle(1, COLORS.bgGridLine, 1);
  g.strokeRect(0.5, 0.5, BG_GRID_SIZE, BG_GRID_SIZE);
  g.generateTexture(TEX.bgGrid, BG_GRID_SIZE, BG_GRID_SIZE);
  g.clear();

  // Enemies are drawn at FX.enemyTexScale × their world size (sprites scale back down).
  const k = FX.enemyTexScale;
  const enemyTex = (key: string, type: EnemyType, r: number, elite: boolean, phase = 1) => {
    const size = Math.ceil(r * k * 2.7);
    drawEnemy(g, type, size / 2, r * k, elite, phase);
    g.generateTexture(key, size, size);
    g.clear();
  };
  for (const type of ENEMY_TYPES) {
    enemyTex(TEX.enemy(type), type, ENEMIES[type].radius, false);
    enemyTex(TEX.enemy(type, true), type, ENEMIES[type].radius * ELITE.scale, true);
  }
  for (const phase of [2, 3]) {
    enemyTex(TEX.boss(phase), 'colossus', ENEMIES.colossus.radius, false, phase);
  }

  // Shiny round dots (concept.md §6: like agar.io food), each in its own colour family.
  for (const [key, color, r] of [
    [TEX.enemyShot, COLORS.enemyShot, 4.5],
    [TEX.shotSmall, COLORS.shot, 3.5],
    [TEX.shotBig, COLORS.shotBig, 5.5],
    [TEX.shell, COLORS.shell, 5.5],
  ] as const) {
    const size = Math.ceil(r * 2 + 4);
    drawDot(g, size / 2, r, color);
    g.generateTexture(key, size, size);
    g.clear();
  }

  // Crossbow bolt: a dark shaft with a light head, pointing right.
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(0, 3, 18, 3);
  g.fillStyle(COLORS.shot, 1);
  g.lineStyle(1.5, COLORS.ink, 1);
  g.fillTriangle(16, 0, 24, 4.5, 16, 9);
  g.strokeTriangle(16, 0, 24, 4.5, 16, 9);
  g.generateTexture(TEX.bolt, 25, 9);
  g.clear();

  // White particle shapes, tinted per particle.
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 8);
  g.generateTexture(TEX.particleDot, 16, 16);
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(0, 0, 12, 12, 3);
  g.generateTexture(TEX.particleSquare, 12, 12);
  g.clear();

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
 * Enemy blobs (concept.md §6): a bright circle with a thick darker outline
 * and a simple angry face, centred at (c, c) with radius r. Each type's face
 * differs a little; elites get a gold ring; the Colossus's face changes per phase.
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
  const ink = COLORS.ink;
  if (type === 'colossus' && bossPhase >= 3) {
    // Red glow behind the body.
    g.fillStyle(COLORS.charge, 0.3);
    g.fillCircle(c, c, r * 1.12);
  }
  g.fillStyle(def.color, 1);
  g.fillCircle(c, c, r);
  g.lineStyle(r * 0.16, outlineOf(def.color), 1);
  g.strokeCircle(c, c, r);
  if (elite) {
    g.lineStyle(r * 0.12, ELITE.ring, 1);
    g.strokeCircle(c, c, r * 1.12);
  }

  // Eyes: white, dark pupils looking slightly inward; angled brows.
  const eyeY = c - r * 0.08;
  const eyeX = r * 0.34;
  const eyeR = r * (type === 'colossus' ? 0.2 : 0.24);
  const narrow = type === 'runner';
  for (const side of [-1, 1]) {
    const ex = c + side * eyeX;
    g.fillStyle(0xffffff, 1);
    if (narrow) g.fillEllipse(ex, eyeY, eyeR * 2.1, eyeR * 1.1);
    else g.fillCircle(ex, eyeY, eyeR);
    const pupil = type === 'colossus' && bossPhase >= 3 ? COLORS.charge : ink;
    g.fillStyle(pupil, 1);
    g.fillCircle(ex - side * eyeR * 0.25, eyeY + eyeR * 0.15, eyeR * (narrow ? 0.45 : 0.55));
    // Brow: outer end high, inner end low (angry).
    const browW = type === 'brute' || type === 'colossus' ? r * 0.16 : r * 0.1;
    g.lineStyle(browW, ink, 1);
    g.lineBetween(c + side * r * 0.62, eyeY - eyeR * 1.7, c + side * r * 0.12, eyeY - eyeR * 1.05);
  }

  switch (type) {
    case 'spitter':
      // O-mouth.
      g.fillStyle(ink, 1);
      g.fillCircle(c, c + r * 0.45, r * 0.16);
      break;
    case 'sapper':
      // Hard hat in the bridge colour.
      g.fillStyle(COLORS.bridge, 1);
      g.slice(c, c - r * 0.42, r * 0.62, Math.PI, 0, false);
      g.fillPath();
      g.fillRect(c - r * 0.8, c - r * 0.46, r * 1.6, r * 0.14);
      break;
    case 'bomber': {
      // Fuse with a spark.
      g.lineStyle(r * 0.14, ink, 1);
      g.lineBetween(c + r * 0.35, c - r * 0.9, c + r * 0.55, c - r * 1.2);
      g.fillStyle(COLORS.bridge, 1);
      g.fillCircle(c + r * 0.58, c - r * 1.25, r * 0.2);
      break;
    }
    case 'colossus': {
      // Jagged mouth.
      g.fillStyle(ink, 1);
      const xs = [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45];
      const pts: number[] = [];
      xs.forEach((x, i) => pts.push(c + x * r, c + r * (i % 2 === 0 ? 0.42 : 0.3)));
      pts.push(c + 0.45 * r, c + r * 0.6, c - 0.45 * r, c + r * 0.6);
      g.fillPoints(toPoints(pts), true);
      if (bossPhase >= 2) {
        // Cracks.
        g.lineStyle(r * 0.06, outlineOf(def.color, 45), 1);
        g.beginPath();
        g.moveTo(c - r * 0.85, c - r * 0.2);
        g.lineTo(c - r * 0.6, c + r * 0.05);
        g.lineTo(c - r * 0.7, c + r * 0.35);
        g.moveTo(c + r * 0.35, c - r * 0.85);
        g.lineTo(c + r * 0.5, c - r * 0.55);
        g.lineTo(c + r * 0.8, c - r * 0.45);
        g.strokePath();
      }
      break;
    }
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
