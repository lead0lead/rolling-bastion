import Phaser from 'phaser';
import { OFFERS } from '../config/balance';
import { SANDBOX_POOL, type PieceDef } from '../config/pieces';
import { TILES, type TileType } from '../config/tiles';
import { DEBUG, SEED } from '../debug/flags';
import { COLORS, drawTile, LabelPool } from '../render/tiles';
import {
  cancelHeld,
  confirmStatus,
  debugDestroyAt,
  dropAt,
  expand,
  pickOffer,
  pickUpAt,
  previewAt,
  rotate,
  scrapAt,
  scrapHeld,
  startBuild,
  type BuildSession,
} from '../sim/build';
import { findBridges } from '../sim/connectivity';
import { cellKey, createCity, tileAt, type CityState, type PlacedTile } from '../sim/grid';
import { rollOffers } from '../sim/progression';
import { createRng, type Rng } from '../sim/rng';

// Screen layout (1280×720).
const GRID_CENTRE = { x: 620, y: 390 };
const GRID_MAX_PX = 540;
const GRID_MAX_CELL = 64;
const CARDS = { x: 1010, y: 90, w: 240, h: 150, gap: 15, cell: 22 };
const CONFIRM = { x: 1010, y: 610, w: 240, h: 56 };
const SCRAP = { x: 30, y: 560, w: 250, h: 106 };
/** Pointer travel (px) that turns a click into a drag. */
const DRAG_THRESHOLD = 6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

function cardRect(i: number): Rect {
  return { x: CARDS.x, y: CARDS.y + i * (CARDS.h + CARDS.gap), w: CARDS.w, h: CARDS.h };
}

/**
 * Build pause (concept.md §2.3), here as a standalone sandbox: confirm rolls
 * a fresh offer and the same city carries on.
 */
export class BuildScene extends Phaser.Scene {
  private rng!: Rng;
  private city!: CityState;
  private session!: BuildSession;
  private g!: Phaser.GameObjects.Graphics;
  private labels!: LabelPool;
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private confirmText!: Phaser.GameObjects.Text;
  private reasonText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Text;
  private showBridges = false;
  private pointer = { x: 0, y: 0 };
  private press: { x: number; y: number; picked: boolean } | null = null;
  private flash: { text: string; until: number } | null = null;
  private pauseStartedAt = 0;
  private pauseDurations: number[] = [];

  constructor() {
    super('Build');
  }

  create(): void {
    this.rng = createRng(SEED);
    this.city = createCity();
    this.g = this.add.graphics();
    this.labels = new LabelPool(this);
    const text = { fontFamily: 'monospace', color: COLORS.text };

    this.add.text(GRID_CENTRE.x, 28, 'Salvage!', { ...text, fontSize: '28px' }).setOrigin(0.5, 0);
    this.add
      .text(
        30,
        90,
        [
          'Pick a piece: click or 1/2/3',
          'Move: drag (or click, then click)',
          'Rotate: R / right-click',
          'Put back: Esc',
          'Scrap: drag onto SCRAP, or hover + X',
          'Bridges: B',
          'Confirm: Enter',
          ...(DEBUG ? ['', 'Debug:', 'F2  expand grid', 'Del destroy hovered tile'] : []),
        ].join('\n'),
        { ...text, fontSize: '14px', color: COLORS.textDim, lineSpacing: 6 },
      )
      .setOrigin(0, 0);
    this.statusText = this.add.text(30, 420, '', {
      ...text,
      fontSize: '14px',
      color: COLORS.textDim,
      lineSpacing: 6,
    });
    this.add
      .text(SCRAP.x + SCRAP.w / 2, SCRAP.y + SCRAP.h / 2, 'SCRAP', { ...text, fontSize: '20px' })
      .setOrigin(0.5);
    this.confirmText = this.add
      .text(CONFIRM.x + CONFIRM.w / 2, CONFIRM.y + CONFIRM.h / 2, 'CONFIRM', {
        ...text,
        fontSize: '20px',
      })
      .setOrigin(0.5);
    this.reasonText = this.add
      .text(CONFIRM.x + CONFIRM.w, CONFIRM.y - 8, '', {
        ...text,
        fontSize: '13px',
        color: COLORS.textWarn,
        align: 'right',
        wordWrap: { width: CONFIRM.w + 60 },
      })
      .setOrigin(1, 1);
    this.tooltip = this.add
      .text(0, 0, '', {
        ...text,
        fontSize: '13px',
        backgroundColor: '#0b0d12',
        padding: { x: 10, y: 8 },
        lineSpacing: 4,
        wordWrap: { width: 300 },
      })
      .setDepth(20)
      .setVisible(false);
    this.add
      .text(1268, 8, `v${__APP_VERSION__}  seed ${SEED}`, {
        ...text,
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 0);

    this.newPause();
    this.bindInput();
  }

  private newPause(): void {
    const offers = rollOffers(this.rng, SANDBOX_POOL, OFFERS.count);
    this.session = startBuild(this.city, offers);
    this.pauseStartedAt = this.time.now;
    for (const t of this.cardTexts) t.destroy();
    this.cardTexts = offers.map((def, i) => {
      const r = cardRect(i);
      return this.add.text(r.x + 12, r.y + 10, `${i + 1}  ${pieceSummary(def)}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.text,
        wordWrap: { width: CARDS.w - 24 },
      });
    });
  }

  // ---------------------------------------------------------------- layout

  private cellPx(): number {
    return Math.min(GRID_MAX_CELL, Math.floor(GRID_MAX_PX / this.city.gridSize));
  }

  private gridRect(): Rect {
    const size = this.cellPx() * this.city.gridSize;
    return { x: GRID_CENTRE.x - size / 2, y: GRID_CENTRE.y - size / 2, w: size, h: size };
  }

  /** Grid cell under a screen point (may be outside the grid). */
  private cellAt(x: number, y: number): { x: number; y: number } {
    const r = this.gridRect();
    const cs = this.cellPx();
    return { x: Math.floor((x - r.x) / cs), y: Math.floor((y - r.y) / cs) };
  }

  private cardAt(x: number, y: number): number {
    for (let i = 0; i < this.session.offers.length; i++) if (inRect(cardRect(i), x, y)) return i;
    return -1;
  }

  // ----------------------------------------------------------------- input

  private bindInput(): void {
    this.input.mouse?.disableContextMenu();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointer = { x: p.x, y: p.y };
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointer = { x: p.x, y: p.y };
      if (p.rightButtonDown()) {
        rotate(this.session);
        return;
      }
      if (this.session.held) {
        this.press = { x: p.x, y: p.y, picked: false };
        return;
      }
      if (inRect(CONFIRM, p.x, p.y)) {
        this.tryConfirm();
        return;
      }
      const card = this.cardAt(p.x, p.y);
      const cell = this.cellAt(p.x, p.y);
      const picked =
        card >= 0 ? pickOffer(this.session, card) : pickUpAt(this.session, cell.x, cell.y);
      this.press = { x: p.x, y: p.y, picked };
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const press = this.press;
      this.press = null;
      if (!press || !this.session.held || p.rightButtonReleased()) return;
      const dragged = Math.hypot(p.x - press.x, p.y - press.y) > DRAG_THRESHOLD;
      // A plain click that just picked something up keeps carrying it.
      if (press.picked && !dragged) return;
      this.releaseHeld(p.x, p.y);
    });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  private releaseHeld(x: number, y: number): void {
    const s = this.session;
    if (inRect(SCRAP, x, y)) {
      if (!scrapHeld(s)) {
        this.showFlash('The Core cannot be scrapped');
        cancelHeld(s);
      }
      return;
    }
    if (inRect(this.gridRect(), x, y)) {
      const cell = this.cellAt(x, y);
      if (!dropAt(s, cell.x, cell.y)) this.showFlash('Does not fit there');
      return;
    }
    cancelHeld(s);
  }

  private onKey(e: KeyboardEvent): void {
    const s = this.session;
    const cell = this.cellAt(this.pointer.x, this.pointer.y);
    switch (e.code) {
      case 'Digit1':
      case 'Digit2':
      case 'Digit3': {
        const index = Number(e.code.slice(-1)) - 1;
        if (s.heldOrigin?.kind === 'offer') cancelHeld(s);
        pickOffer(s, index);
        break;
      }
      case 'KeyR':
        rotate(s);
        break;
      case 'Escape':
        cancelHeld(s);
        break;
      case 'KeyX':
        if (s.held) {
          if (!scrapHeld(s)) this.showFlash('The Core cannot be scrapped');
        } else if (!scrapAt(s, cell.x, cell.y) && tileAt(this.city, cell.x, cell.y)) {
          this.showFlash('The Core cannot be scrapped');
        }
        break;
      case 'KeyB':
        this.showBridges = !this.showBridges;
        break;
      case 'Enter':
      case 'NumpadEnter':
        this.tryConfirm();
        break;
      case 'F2':
        if (!DEBUG) break;
        e.preventDefault();
        if (expand(s)) this.showFlash('GRID EXPANDED');
        else this.showFlash(s.held ? 'Put the held piece down first' : 'Grid is at max size');
        break;
      case 'Delete':
        if (DEBUG) debugDestroyAt(s, cell.x, cell.y);
        break;
    }
  }

  private tryConfirm(): void {
    if (!confirmStatus(this.session).ok) return;
    this.pauseDurations.push((this.time.now - this.pauseStartedAt) / 1000);
    this.newPause();
  }

  private showFlash(text: string): void {
    this.flash = { text, until: this.time.now + 1200 };
  }

  // ---------------------------------------------------------------- render

  override update(): void {
    const g = this.g;
    g.clear();
    this.labels.begin();
    this.drawGrid();
    this.drawCards();
    this.drawPanels();
    this.drawHeld();
    this.labels.end();
    this.updateTooltip();
    this.updateStatus();
  }

  private drawGrid(): void {
    const g = this.g;
    const r = this.gridRect();
    const cs = this.cellPx();
    const city = this.city;
    for (let y = 0; y < city.gridSize; y++) {
      for (let x = 0; x < city.gridSize; x++) {
        g.fillStyle(COLORS.gridCell, 1);
        g.fillRect(r.x + x * cs, r.y + y * cs, cs, cs);
        g.lineStyle(1, COLORS.gridLine, 1);
        g.strokeRect(r.x + x * cs, r.y + y * cs, cs, cs);
      }
    }

    const bridges = this.showBridges ? findBridges(city) : new Set<number>();
    for (const t of city.tiles) {
      const px = r.x + t.gx * cs;
      const py = r.y + t.gy * cs;
      drawTile(g, px, py, cs, t.type, { offline: !t.online });
      this.label(t.type, px + cs / 2, py + cs / 2, cs, !t.online);
      if (!t.online) {
        g.lineStyle(2, COLORS.invalid, 1);
        g.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
      }
      if (bridges.has(t.id)) {
        g.lineStyle(3, COLORS.bridge, 1);
        g.strokeCircle(px + cs / 2, py + cs / 2, cs * 0.34);
      }
    }
    this.drawGroupOutlines(city.tiles, r.x, r.y, cs, COLORS.groupOutline, 0.45);

    // Hovered group (what a click would pick up).
    if (!this.session.held && inRect(r, this.pointer.x, this.pointer.y)) {
      const c = this.cellAt(this.pointer.x, this.pointer.y);
      const hovered = tileAt(city, c.x, c.y);
      if (hovered) {
        const group = city.tiles.filter((t) => t.groupId === hovered.groupId);
        this.drawGroupOutlines(group, r.x, r.y, cs, COLORS.hover, 1, 3);
      }
    }
  }

  /** Lines along every cell edge where the neighbour is not in the same group. */
  private drawGroupOutlines(
    tiles: readonly PlacedTile[],
    ox: number,
    oy: number,
    cs: number,
    color: number,
    alpha: number,
    width = 2,
  ): void {
    const g = this.g;
    const group = new Map(tiles.map((t) => [cellKey(t.gx, t.gy), t.groupId]));
    g.lineStyle(width, color, alpha);
    for (const t of tiles) {
      const x = ox + t.gx * cs;
      const y = oy + t.gy * cs;
      const same = (dx: number, dy: number) =>
        group.get(cellKey(t.gx + dx, t.gy + dy)) === t.groupId;
      if (!same(0, -1)) g.lineBetween(x, y, x + cs, y);
      if (!same(0, 1)) g.lineBetween(x, y + cs, x + cs, y + cs);
      if (!same(-1, 0)) g.lineBetween(x, y, x, y + cs);
      if (!same(1, 0)) g.lineBetween(x + cs, y, x + cs, y + cs);
    }
  }

  private drawHeld(): void {
    const s = this.session;
    if (!s.held) return;
    const g = this.g;
    const r = this.gridRect();
    const cs = this.cellPx();
    const { x: px, y: py } = this.pointer;

    if (inRect(r, px, py)) {
      const c = this.cellAt(px, py);
      const preview = previewAt(s, c.x, c.y);
      if (!preview) return;
      s.held.tiles.forEach((t, i) => {
        const cell = preview.cells[i];
        if (!cell) return;
        const x = r.x + cell.x * cs;
        const y = r.y + cell.y * cs;
        drawTile(g, x, y, cs, t.type, { alpha: 0.75 });
        this.label(t.type, x + cs / 2, y + cs / 2, cs, false, 0.75);
        const bad = preview.problems.has(cellKey(cell.x, cell.y));
        g.lineStyle(3, bad ? COLORS.invalid : COLORS.valid, 1);
        g.strokeRect(x + 2, y + 2, cs - 4, cs - 4);
      });
      return;
    }

    // Off-grid: follow the pointer freely.
    const ox = px - (s.held.anchor.x + 0.5) * cs;
    const oy = py - (s.held.anchor.y + 0.5) * cs;
    for (const t of s.held.tiles) {
      const x = ox + t.gx * cs;
      const y = oy + t.gy * cs;
      drawTile(g, x, y, cs, t.type, { alpha: 0.6 });
      this.label(t.type, x + cs / 2, y + cs / 2, cs, false, 0.6);
    }
    if (inRect(SCRAP, px, py)) {
      g.lineStyle(3, COLORS.invalid, 1);
      g.strokeRect(SCRAP.x, SCRAP.y, SCRAP.w, SCRAP.h);
    }
  }

  private drawCards(): void {
    const g = this.g;
    const s = this.session;
    s.offers.forEach((def, i) => {
      const r = cardRect(i);
      const taken = s.offerTaken || (s.heldOrigin?.kind === 'offer' && s.heldOrigin.index === i);
      const alpha = taken ? 0.3 : 1;
      this.cardTexts[i]?.setAlpha(alpha);
      const hovered = !s.held && !s.offerTaken && inRect(r, this.pointer.x, this.pointer.y);
      g.fillStyle(COLORS.panel, 1);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
      g.lineStyle(2, hovered ? COLORS.hover : COLORS.panelBorder, 1);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);

      const cs = CARDS.cell;
      const w = Math.max(...def.cells.map((c) => c.x)) + 1;
      const h = Math.max(...def.cells.map((c) => c.y)) + 1;
      const ox = r.x + (r.w - w * cs) / 2;
      const oy = r.y + 52 + (r.h - 52 - h * cs) / 2;
      for (const c of def.cells) {
        drawTile(g, ox + c.x * cs, oy + c.y * cs, cs, c.tile, { alpha });
        this.label(c.tile, ox + c.x * cs + cs / 2, oy + c.y * cs + cs / 2, cs, false, alpha);
      }
    });
  }

  private drawPanels(): void {
    const g = this.g;
    g.lineStyle(2, COLORS.panelBorder, 1);
    g.strokeRoundedRect(SCRAP.x, SCRAP.y, SCRAP.w, SCRAP.h, 8);

    const status = confirmStatus(this.session);
    const hovered = status.ok && inRect(CONFIRM, this.pointer.x, this.pointer.y);
    g.fillStyle(status.ok ? (hovered ? 0x4fd18b : 0x3ab577) : 0x2a2f3a, 1);
    g.fillRoundedRect(CONFIRM.x, CONFIRM.y, CONFIRM.w, CONFIRM.h, 8);
    this.confirmText.setAlpha(status.ok ? 1 : 0.4);
    this.reasonText.setText(
      status.block === 'holding'
        ? 'Place the held piece (Esc puts it back)'
        : status.block === 'no_offer_taken'
          ? 'Pick one of the offered pieces'
          : status.block === 'disconnected'
            ? `${status.offline} tile${status.offline === 1 ? ' is' : 's are'} not connected to the Core — reconnect or scrap`
            : '',
    );
  }

  private label(type: TileType, x: number, y: number, cs: number, offline: boolean, alpha = 1) {
    const text = TILES[type].label;
    if (!text) return;
    this.labels.add(x, y, text, Math.round(cs * 0.45), offline ? '#8a93a6' : '#ffffff', alpha);
  }

  private updateTooltip(): void {
    const s = this.session;
    const i = s.held ? -1 : this.cardAt(this.pointer.x, this.pointer.y);
    const def = s.offers[i];
    if (!def) {
      this.tooltip.setVisible(false);
      return;
    }
    const r = cardRect(i);
    this.tooltip.setText(pieceDetails(def)).setVisible(true);
    this.tooltip.setPosition(r.x - this.tooltip.width - 10, r.y);
  }

  private updateStatus(): void {
    const city = this.city;
    const d = this.pauseDurations;
    const avg = d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
    const lines = [
      `Grid ${city.gridSize}×${city.gridSize}  ·  ${city.tiles.length} tiles`,
      `Bridges view: ${this.showBridges ? 'ON' : 'off'}`,
      d.length ? `Pause: last ${d.at(-1)?.toFixed(1)} s · avg ${avg.toFixed(1)} s` : '',
    ];
    if (this.flash && this.time.now < this.flash.until) lines.push('', this.flash.text);
    this.statusText.setText(lines.join('\n'));
  }
}

/** "2× Gatling, Hull" style summary of a piece's tiles. */
function pieceSummary(def: PieceDef): string {
  return countTiles(def)
    .map(([type, n]) => (n > 1 ? `${n}× ${TILES[type].name}` : TILES[type].name))
    .join(', ');
}

function pieceDetails(def: PieceDef): string {
  return countTiles(def)
    .map(([type, n]) => {
      const t = TILES[type];
      return `${n}× ${t.name} — ${t.maxHp} HP\n   ${t.description}`;
    })
    .join('\n');
}

function countTiles(def: PieceDef): [TileType, number][] {
  const counts = new Map<TileType, number>();
  for (const c of def.cells) counts.set(c.tile, (counts.get(c.tile) ?? 0) + 1);
  return [...counts.entries()];
}
