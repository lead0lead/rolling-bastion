import Phaser from 'phaser';
import { TILES, type TileType } from '../config/tiles';
import { COLORS, FONT } from './palette';

export interface TileDrawOptions {
  offline?: boolean;
  alpha?: number;
  /** Current HP / max HP. Below 50% shows cracks, below 25% blinks (concept.md §3). */
  hpFrac?: number;
  /** Time in ms, drives the low-HP blink. */
  time?: number;
}

/** Low-HP thresholds and blink period (concept.md §3). */
const DAMAGE = { cracks: 0.5, blink: 0.25, blinkPeriodMs: 700, blinkAlpha: 0.45 } as const;

/** Alpha multiplier for the low-HP blink. */
export function damageAlpha(hpFrac: number, timeMs: number): number {
  const off = hpFrac < DAMAGE.blink && Math.floor(timeMs / (DAMAGE.blinkPeriodMs / 2)) % 2 === 1;
  return off ? DAMAGE.blinkAlpha : 1;
}

export function showsCracks(hpFrac: number): boolean {
  return hpFrac < DAMAGE.cracks;
}

/** Outline darkness (Phaser darken %) and widths relative to the tile size (concept.md §6: agar.io-like). */
const TILE_LOOK = { outlineDarken: 28, outline: 0.085, radius: 0.24, inset: 0.035 } as const;

/** A colour's darker outline shade (same hue). */
export function outlineOf(color: number, darken: number = TILE_LOOK.outlineDarken): number {
  return Phaser.Display.Color.ValueToColor(color).darken(darken).color;
}

/** Rounded square with a thick darker outline of the same hue (concept.md §6). */
export function drawTile(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  type: TileType,
  opts: TileDrawOptions = {},
): void {
  const hpFrac = opts.hpFrac ?? 1;
  const alpha = (opts.alpha ?? 1) * damageAlpha(hpFrac, opts.time ?? 0);
  const fill = opts.offline ? COLORS.offline : TILES[type].color;
  const lw = Math.max(2, size * TILE_LOOK.outline);
  const inset = lw / 2 + size * TILE_LOOK.inset;
  const radius = size * TILE_LOOK.radius;
  const border = outlineOf(fill);
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset, radius);
  g.lineStyle(lw, border, alpha);
  g.strokeRoundedRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset, radius);
  if (showsCracks(hpFrac)) drawCracks(g, x, y, size, border, alpha);
}

export function drawCracks(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  s: number,
  color: number,
  alpha: number,
): void {
  g.lineStyle(Math.max(1.5, s * 0.05), color, alpha);
  g.beginPath();
  g.moveTo(x + s * 0.18, y + s * 0.2);
  g.lineTo(x + s * 0.42, y + s * 0.45);
  g.lineTo(x + s * 0.36, y + s * 0.62);
  g.lineTo(x + s * 0.55, y + s * 0.82);
  g.moveTo(x + s * 0.42, y + s * 0.45);
  g.lineTo(x + s * 0.7, y + s * 0.38);
  g.strokePath();
}

/** Broken-link mark for offline tiles, in the tile's top-right corner. */
export function drawOfflineMark(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  alpha = 1,
): void {
  drawBrokenLink(g, x + size * 0.76, y + size * 0.24, size * 0.14, alpha);
}

function drawBrokenLink(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  alpha: number,
): void {
  g.lineStyle(2, COLORS.invalid, alpha);
  g.strokeCircle(cx - r * 0.7, cy + r * 0.7, r * 0.55);
  g.strokeCircle(cx + r * 0.7, cy - r * 0.7, r * 0.55);
  g.lineBetween(cx - r * 0.3, cy - r * 1.1, cx + r * 0.3, cy + r * 1.1);
}

/**
 * Reusable text objects for per-frame tile labels. Phaser redraws a text's
 * texture on every style change (even to the same value), so properties are
 * only set when they actually differ from last frame.
 */
export class LabelPool {
  private readonly texts: {
    obj: Phaser.GameObjects.Text;
    text: string;
    size: number;
    color: string;
  }[] = [];
  private used = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  begin(): void {
    this.used = 0;
  }

  add(x: number, y: number, text: string, size: number, color: string, alpha = 1): void {
    let entry = this.texts[this.used];
    if (!entry) {
      const obj = this.scene.add.text(0, 0, text, {
        fontFamily: FONT.family,
        fontStyle: FONT.bold,
        fontSize: `${size}px`,
        color,
        stroke: '#0d0f14',
        strokeThickness: 3,
      });
      obj.setOrigin(0.5).setDepth(10);
      entry = { obj, text, size, color };
      this.texts.push(entry);
    }
    this.used++;
    const { obj } = entry;
    if (entry.text !== text) {
      obj.setText(text);
      entry.text = text;
    }
    if (entry.size !== size) {
      obj.setFontSize(size);
      entry.size = size;
    }
    if (entry.color !== color) {
      obj.setColor(color);
      entry.color = color;
    }
    obj.setPosition(x, y).setAlpha(alpha).setVisible(true);
  }

  end(): void {
    for (let i = this.used; i < this.texts.length; i++) this.texts[i]?.obj.setVisible(false);
  }
}

/** Reusable images for per-frame sprites (enemies, projectiles, gems). */
export class SpritePool {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  begin(): void {
    this.used = 0;
  }

  add(x: number, y: number, key: string): Phaser.GameObjects.Image {
    let img = this.images[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, key).setDepth(this.depth);
      this.images.push(img);
    }
    this.used++;
    if (img.texture.key !== key) img.setTexture(key);
    return img.setPosition(x, y).setVisible(true);
  }

  end(): void {
    for (let i = this.used; i < this.images.length; i++) this.images[i]?.setVisible(false);
  }
}
