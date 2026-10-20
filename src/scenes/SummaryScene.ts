import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { TILES, type TileType } from '../config/tiles';
import { barrelFor } from '../render/icons';
import { COLORS, FONT } from '../render/palette';
import { createTextures, TEX } from '../render/textures';
import { outlineOf, showsCracks } from '../render/tiles';
import { facingAngle, type PlacedTile } from '../sim/grid';

export interface SummaryData {
  time: number;
  kills: number;
  level: number;
  /** The boss was defeated. */
  won: boolean;
  /** The city as the run ended. */
  gridSize: number;
  tiles: readonly PlacedTile[];
  /** Where the Core stood when it was destroyed (loss), else null. */
  coreLostAt: { gx: number; gy: number } | null;
  /** Damage dealt per tile type. */
  damageBy: Partial<Record<TileType, number>>;
}

// Layout (1280×720).
const CITY_BOX = { x: 130, y: 190, size: 380 };
const BARS = { x: 640, y: 215, w: 520, rowH: 46, barH: 18, labelW: 140, max: 7 };
const BUTTONS = [
  { label: 'Play again  (Enter)', x: 470, scene: 'Run' },
  { label: 'Title  (Esc)', x: 810, scene: 'Title' },
] as const;
const BUTTON = { y: 640, w: 300, h: 60 };

/** Win / lose screen (concept.md §8, decided 2026-10-20). */
export class SummaryScene extends Phaser.Scene {
  constructor() {
    super('Summary');
  }

  create(data: SummaryData): void {
    createTextures(this);
    const { width, height } = this.scale;
    const text = { fontFamily: FONT.family, fontStyle: FONT.weight, color: COLORS.text };
    this.add.tileSprite(0, 0, width, height, TEX.bgGrid).setOrigin(0);
    playSfx(this, data.won ? 'win' : 'lose');

    const mins = Math.floor(data.time / 60);
    const secs = Math.floor(data.time % 60)
      .toString()
      .padStart(2, '0');
    this.add
      .text(width / 2, 70, data.won ? 'The city rolls on.' : 'The Core has fallen.', {
        ...text,
        fontStyle: FONT.bold,
        fontSize: '44px',
        color: data.won ? COLORS.textInfo : COLORS.text,
      })
      .setOrigin(0.5);
    this.add
      .text(
        width / 2,
        125,
        `Survived ${mins}:${secs}   ·   Level ${data.level}   ·   Kills ${data.kills}`,
        { ...text, fontSize: '22px', color: COLORS.textDim },
      )
      .setOrigin(0.5);

    this.drawCity(data);
    this.drawDamage(data);
    this.makeButtons();
  }

  /** The final city, drawn with the tile textures, scaled to fit the box. */
  private drawCity(data: SummaryData): void {
    const box = CITY_BOX;
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 1);
    g.fillRoundedRect(box.x - 16, box.y - 16, box.size + 32, box.size + 32, 18);
    g.lineStyle(4, COLORS.panelBorder, 1);
    g.strokeRoundedRect(box.x - 16, box.y - 16, box.size + 32, box.size + 32, 18);
    const cs = box.size / data.gridSize;
    for (let y = 0; y < data.gridSize; y++) {
      for (let x = 0; x < data.gridSize; x++) {
        g.lineStyle(1, COLORS.gridLine, 1);
        g.strokeRect(box.x + x * cs, box.y + y * cs, cs, cs);
      }
    }
    for (const t of data.tiles) {
      const cx = box.x + (t.gx + 0.5) * cs;
      const cy = box.y + (t.gy + 0.5) * cs;
      this.add.image(cx, cy, TEX.tile(t.type, !t.online)).setDisplaySize(cs, cs);
      if (showsCracks(t.hp / t.maxHp)) this.add.image(cx, cy, TEX.cracks).setDisplaySize(cs, cs);
      const barrel = barrelFor(t.type);
      if (barrel) {
        this.add
          .image(cx, cy, TEX.barrel(barrel))
          .setDisplaySize(cs, cs)
          .setRotation(facingAngle(t.facing));
      }
    }
    if (data.coreLostAt) {
      const { gx, gy } = data.coreLostAt;
      const inset = cs * 0.1;
      g.lineStyle(Math.max(2, cs * 0.08), COLORS.invalid, 1);
      g.strokeRoundedRect(
        box.x + gx * cs + inset,
        box.y + gy * cs + inset,
        cs - 2 * inset,
        cs - 2 * inset,
        cs * 0.2,
      );
    }
  }

  /** Damage share per tile type as coloured bars (largest first). */
  private drawDamage(data: SummaryData): void {
    const entries = (Object.entries(data.damageBy) as [TileType, number][])
      .filter(([, d]) => d > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, BARS.max);
    const total = entries.reduce((s, [, d]) => s + d, 0) || 1;
    const text = { fontFamily: FONT.family, fontStyle: FONT.weight, color: COLORS.text };
    this.add.text(BARS.x, BARS.y - 44, 'Damage by weapon', {
      ...text,
      fontStyle: FONT.bold,
      fontSize: '24px',
    });
    const g = this.add.graphics();
    const barW = BARS.w - BARS.labelW - 70;
    entries.forEach(([type, d], i) => {
      const y = BARS.y + i * BARS.rowH;
      const share = d / total;
      this.add
        .text(BARS.x, y + BARS.barH / 2, TILES[type].name, { ...text, fontSize: '20px' })
        .setOrigin(0, 0.5);
      const bx = BARS.x + BARS.labelW;
      g.fillStyle(COLORS.barBack, 1);
      g.fillRoundedRect(bx, y, barW, BARS.barH, BARS.barH / 2);
      const w = Math.max(BARS.barH, barW * share);
      g.fillStyle(TILES[type].color, 1);
      g.fillRoundedRect(bx, y, w, BARS.barH, BARS.barH / 2);
      g.lineStyle(2, outlineOf(TILES[type].color), 1);
      g.strokeRoundedRect(bx, y, w, BARS.barH, BARS.barH / 2);
      this.add
        .text(bx + barW + 12, y + BARS.barH / 2, `${Math.round(share * 100)}%`, {
          ...text,
          fontSize: '20px',
          color: COLORS.textDim,
        })
        .setOrigin(0, 0.5);
    });
    if (entries.length === 0) {
      this.add.text(BARS.x, BARS.y, 'No damage dealt.', {
        ...text,
        fontSize: '20px',
        color: COLORS.textDim,
      });
    }
  }

  private makeButtons(): void {
    const go = (scene: string) => {
      playSfx(this, 'ui-confirm');
      this.scene.start(scene);
    };
    for (const b of BUTTONS) {
      const g = this.add.graphics();
      const draw = (hover: boolean) => {
        g.clear();
        g.fillStyle(
          b.scene === 'Run' ? (hover ? COLORS.confirmHover : COLORS.confirm) : COLORS.panel,
          1,
        );
        g.fillRoundedRect(b.x - BUTTON.w / 2, BUTTON.y - BUTTON.h / 2, BUTTON.w, BUTTON.h, 16);
        g.lineStyle(3, hover ? COLORS.hover : COLORS.panelBorder, 1);
        g.strokeRoundedRect(b.x - BUTTON.w / 2, BUTTON.y - BUTTON.h / 2, BUTTON.w, BUTTON.h, 16);
      };
      draw(false);
      this.add
        .text(b.x, BUTTON.y, b.label, {
          fontFamily: FONT.family,
          fontStyle: FONT.bold,
          fontSize: '22px',
          color: b.scene === 'Run' ? '#ffffff' : COLORS.text,
        })
        .setOrigin(0.5);
      const zone = this.add
        .zone(b.x, BUTTON.y, BUTTON.w, BUTTON.h)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => draw(true));
      zone.on('pointerout', () => draw(false));
      zone.on('pointerdown', () => go(b.scene));
    }
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') go('Run');
      else if (e.code === 'Escape') go('Title');
    });
  }
}
