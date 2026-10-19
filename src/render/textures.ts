import Phaser from 'phaser';
import { ENEMIES, ENEMY_TYPES } from '../config/enemies';
import { TILES, type TileType } from '../config/tiles';
import { COLORS, drawCracks, drawTile } from './tiles';

/** Procedural textures (concept.md §6: no external art in the prototype). */
export const TEX = {
  bgGrid: 'bg-grid',
  gem: 'gem',
  shotSmall: 'shot-small',
  shotBig: 'shot-big',
  enemy: (type: string) => `enemy-${type}`,
  tile: (type: TileType, offline: boolean) => `tile-${type}${offline ? '-off' : ''}`,
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
    const def = ENEMIES[type];
    const size = def.radius * 2 + 4;
    const c = size / 2;
    g.fillStyle(def.color, 1);
    g.lineStyle(2, def.outline, 1);
    if (type === 'runner') {
      const r = def.radius + 1;
      const pts = [c, c - r, c + r, c, c, c + r, c - r, c];
      g.fillPoints(toPoints(pts), true);
      g.strokePoints(toPoints(pts), true);
    } else {
      g.fillCircle(c, c, def.radius);
      g.strokeCircle(c, c, def.radius);
    }
    g.generateTexture(TEX.enemy(type), size, size);
    g.clear();
  }

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
  const label = scene.make.text({
    style: {
      fontFamily: 'monospace',
      fontStyle: 'bold',
      fontSize: `${Math.round(size * 0.45)}px`,
      stroke: '#0d0f14',
      strokeThickness: 5,
    },
    add: false,
  });
  label.setOrigin(0.5).setPosition(size / 2, size / 2);
  for (const type of Object.keys(TILES) as TileType[]) {
    for (const offline of [false, true]) {
      g.clear();
      drawTile(g, 0, 0, size, type, { offline });
      const tex = scene.textures.addDynamicTexture(TEX.tile(type, offline), size, size);
      if (!tex) continue;
      tex.draw(g);
      if (TILES[type].label) {
        label.setText(TILES[type].label).setColor(offline ? '#8a93a6' : '#ffffff');
        tex.draw(label);
      }
    }
  }
  g.clear();
  drawCracks(g, 0, 0, size, 0x0d0f14, 0.7);
  scene.textures.addDynamicTexture(TEX.cracks, size, size)?.draw(g);
  g.destroy();
  label.destroy();
}

function toPoints(xy: number[]): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push(new Phaser.Math.Vector2(xy[i], xy[i + 1]));
  return out;
}
