import Phaser from 'phaser';
import { TILES, type TileType } from '../config/tiles';

export const COLORS = {
  background: 0x0d0f14,
  gridCell: 0x161a22,
  gridLine: 0x232936,
  offline: 0x3a3f4a,
  invalid: 0xff4d5e,
  valid: 0x7dffb0,
  bridge: 0xffd166,
  groupOutline: 0xffffff,
  hover: 0xffffff,
  panel: 0x161a22,
  panelBorder: 0x2c3342,
  text: '#e6e9ef',
  textDim: '#8a93a6',
  textWarn: '#ff8a95',
} as const;

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

/** Rounded square with a darker 2 px border (concept.md §6, placeholder look). */
export function drawTile(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  type: TileType,
  opts: TileDrawOptions = {},
): void {
  const hpFrac = opts.hpFrac ?? 1;
  const blinking =
    hpFrac < DAMAGE.blink && Math.floor((opts.time ?? 0) / (DAMAGE.blinkPeriodMs / 2)) % 2 === 1;
  const alpha = (opts.alpha ?? 1) * (blinking ? DAMAGE.blinkAlpha : 1);
  const fill = opts.offline ? COLORS.offline : TILES[type].color;
  const inset = Math.max(1, Math.round(size * 0.04));
  const radius = Math.max(2, Math.round(size * 0.15));
  const border = Phaser.Display.Color.ValueToColor(fill).darken(35).color;
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset, radius);
  g.lineStyle(2, border, alpha);
  g.strokeRoundedRect(
    x + inset + 1,
    y + inset + 1,
    size - 2 * inset - 2,
    size - 2 * inset - 2,
    radius,
  );
  if (hpFrac < DAMAGE.cracks) drawCracks(g, x, y, size, border, alpha);
  if (opts.offline) drawBrokenLink(g, x + size * 0.72, y + size * 0.28, size * 0.16, alpha);
}

function drawCracks(
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

/** Small broken-chain mark for offline tiles. */
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

/** Reusable text objects for per-frame tile labels. */
export class LabelPool {
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private used = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  begin(): void {
    this.used = 0;
  }

  add(x: number, y: number, text: string, size: number, color: string, alpha = 1): void {
    let t = this.texts[this.used];
    if (!t) {
      t = this.scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        stroke: '#0d0f14',
        strokeThickness: 3,
      });
      t.setOrigin(0.5).setDepth(10);
      this.texts.push(t);
    }
    this.used++;
    t.setPosition(x, y)
      .setText(text)
      .setFontSize(size)
      .setColor(color)
      .setAlpha(alpha)
      .setVisible(true);
  }

  end(): void {
    for (let i = this.used; i < this.texts.length; i++) this.texts[i]?.setVisible(false);
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
