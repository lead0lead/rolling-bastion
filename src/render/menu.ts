import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { COLORS, FONT } from './palette';

/** One menu row. `label` is re-read on refresh (for values like the volume). */
export interface MenuItem {
  label: () => string;
  /** Enter or click. */
  action?: () => void;
  /** Left/Right arrows (e.g. volume down/up). */
  left?: () => void;
  right?: () => void;
}

/**
 * After a scene wakes from under a closed panel, ignore keys this long (ms):
 * the key that closed the panel may still be queued for the woken scene.
 */
export const WAKE_KEY_GRACE_MS = 150;

const LOOK = {
  width: 420,
  rowH: 52,
  gap: 12,
  pad: 28,
  titleH: 78,
  radius: 18,
  border: 4,
} as const;

/**
 * A light, rounded menu panel (concept.md §6, §8): mouse hover and click,
 * Up/Down to select, Enter to activate, Left/Right for adjustable rows.
 * The owning scene handles Esc.
 */
export class MenuPanel {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly rowsGfx: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private selected = 0;
  /** Scene time the panel opened; keys right after that are ignored (see WAKE_KEY_GRACE_MS). */
  private readonly openedAt: number;
  private readonly top: number;
  private readonly left: number;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly onMove: (p: Phaser.Input.Pointer) => void;
  private readonly onDown: (p: Phaser.Input.Pointer) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    title: string,
    private readonly items: MenuItem[],
  ) {
    const { width, height } = scene.scale;
    this.openedAt = scene.time.now;
    const h = LOOK.titleH + items.length * (LOOK.rowH + LOOK.gap) + LOOK.pad;
    this.left = width / 2 - LOOK.width / 2;
    this.top = height / 2 - h / 2;

    const dim = scene.add.rectangle(0, 0, width, height, COLORS.background, 0.7).setOrigin(0);
    this.g = scene.add.graphics();
    this.g.fillStyle(COLORS.panel, 1);
    this.g.fillRoundedRect(this.left, this.top, LOOK.width, h, LOOK.radius);
    this.g.lineStyle(LOOK.border, COLORS.panelBorder, 1);
    this.g.strokeRoundedRect(this.left, this.top, LOOK.width, h, LOOK.radius);
    const rows = scene.add.graphics();
    const heading = scene.add
      .text(width / 2, this.top + LOOK.titleH / 2 + 6, title, {
        fontFamily: FONT.family,
        fontStyle: FONT.bold,
        fontSize: '34px',
        color: COLORS.text,
      })
      .setOrigin(0.5);
    this.objects.push(dim, this.g, rows, heading);
    this.rowsGfx = rows;

    items.forEach((item, i) => {
      const r = this.rowRect(i);
      const t = scene.add
        .text(r.x + r.w / 2, r.y + r.h / 2, item.label(), {
          fontFamily: FONT.family,
          fontStyle: FONT.weight,
          fontSize: '22px',
          color: COLORS.text,
        })
        .setOrigin(0.5);
      this.texts.push(t);
      this.objects.push(t);
    });

    this.onKey = (e) => this.handleKey(e);
    this.onMove = (p) => {
      const i = this.rowAt(p.x, p.y);
      if (i >= 0 && i !== this.selected) {
        this.selected = i;
        this.draw();
      }
    };
    this.onDown = (p) => {
      const i = this.rowAt(p.x, p.y);
      if (i < 0) return;
      this.selected = i;
      // Clicking the left or right third of an adjustable row adjusts it.
      const item = this.items[i];
      const r = this.rowRect(i);
      if (item?.left && p.x < r.x + r.w / 3) this.adjust(item.left);
      else if (item?.right && p.x > r.x + (r.w * 2) / 3) this.adjust(item.right);
      else this.activate();
    };
    scene.input.keyboard?.on('keydown', this.onKey);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerdown', this.onDown);
    this.draw();
  }

  private rowRect(i: number): { x: number; y: number; w: number; h: number } {
    return {
      x: this.left + LOOK.pad,
      y: this.top + LOOK.titleH + i * (LOOK.rowH + LOOK.gap),
      w: LOOK.width - 2 * LOOK.pad,
      h: LOOK.rowH,
    };
  }

  private rowAt(x: number, y: number): number {
    return this.items.findIndex((_, i) => {
      const r = this.rowRect(i);
      return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    });
  }

  private handleKey(e: KeyboardEvent): void {
    if (this.scene.time.now - this.openedAt < WAKE_KEY_GRACE_MS) return;
    const n = this.items.length;
    const item = this.items[this.selected];
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.selected = (this.selected + n - 1) % n;
        playSfx(this.scene, 'ui-click');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.selected = (this.selected + 1) % n;
        playSfx(this.scene, 'ui-click');
        break;
      case 'ArrowLeft':
      case 'KeyA':
        if (item?.left) this.adjust(item.left);
        break;
      case 'ArrowRight':
      case 'KeyD':
        if (item?.right) this.adjust(item.right);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.activate();
        return;
      default:
        return;
    }
    this.draw();
  }

  private adjust(fn: () => void): void {
    fn();
    playSfx(this.scene, 'ui-toggle');
    this.refresh();
  }

  private activate(): void {
    const item = this.items[this.selected];
    if (!item?.action) return;
    playSfx(this.scene, 'ui-click');
    item.action();
    if (this.texts.length) this.refresh();
  }

  /** Re-reads every label and redraws the rows. */
  refresh(): void {
    this.items.forEach((item, i) => {
      const t = this.texts[i];
      const label = item.label();
      if (t && t.text !== label) t.setText(label);
    });
    this.draw();
  }

  private draw(): void {
    const g = this.rowsGfx;
    g.clear();
    this.items.forEach((_, i) => {
      const r = this.rowRect(i);
      const sel = i === this.selected;
      g.fillStyle(sel ? COLORS.selected : COLORS.panel, 1);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 12);
      g.lineStyle(3, sel ? COLORS.confirm : COLORS.panelBorder, 1);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 12);
    });
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.onKey);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerdown', this.onDown);
    for (const o of this.objects) o.destroy();
    this.texts.length = 0;
  }
}
