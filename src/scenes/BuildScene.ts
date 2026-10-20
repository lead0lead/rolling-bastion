import Phaser from 'phaser';
import { OFFERS, UPGRADES } from '../config/balance';
import { SANDBOX_POOL, type PieceDef } from '../config/pieces';
import { TILES, type TileType } from '../config/tiles';
import { DEBUG, SEED } from '../debug/flags';
import { barrelFor } from '../render/icons';
import { drawSynergyLines } from '../render/lines';
import { createTextures, TEX } from '../render/textures';
import { COLORS, css, FONT } from '../render/palette';
import { damageAlpha, showsCracks, SpritePool } from '../render/tiles';
import {
  canReroll,
  cancelHeld,
  confirmStatus,
  debugDestroyAt,
  dropAt,
  expand,
  pickOffer,
  pickUpAt,
  previewAt,
  reroll,
  rotate,
  scrapAt,
  scrapHeld,
  startBuild,
  chosenUpgrade,
  toggleRepair,
  toggleUpgrade,
  type BuildSession,
} from '../sim/build';
import { findBridges } from '../sim/connectivity';
import {
  cellKey,
  createCity,
  facingAngle,
  tileAt,
  type CityState,
  type PlacedTile,
} from '../sim/grid';
import type { BuildResult } from '../sim/progression';
import { rollOffers } from '../sim/progression';
import { createRng, type Rng } from '../sim/rng';
import { computeSynergies, type Synergies } from '../sim/synergies';
import { typeLevel } from '../sim/upgrades';

/** Data for a build pause inside a run. Without it the scene runs as a sandbox. */
export interface BuildSceneData {
  city: CityState;
  offers: PieceDef[];
  title: string;
  /** HP Repair Core would heal now. */
  coreHeal: number;
  rerollsLeft: number;
  /** XP refunded per placed piece scrapped. */
  refundPerScrap: number;
  /** New offers, spending one reroll; null if none left. */
  reroll: () => PieceDef[] | null;
  done: (result: BuildResult) => void;
}

// Screen layout (1280×720).
const GRID_CENTRE = { x: 620, y: 390 };
const GRID_MAX_PX = 540;
const GRID_MAX_CELL = 64;
const CARDS = {
  x: 1010,
  y: 80,
  w: 240,
  h: 130,
  gap: 12,
  /** Preview cell size, and the preview area below the card title. */
  cell: 20,
  previewTop: 44,
  previewPad: 4,
};
/** "Upgrade <type>" strip at the bottom of a card (inset, height). */
const UPGRADE_STRIP = { inset: 8, h: 24 };
const REPAIR = { x: 1010, y: 508, w: 240, h: 40 };
const REROLL = { x: 1010, y: 556, w: 240, h: 40 };
const CONFIRM = { x: 1010, y: 640, w: 240, h: 56 };
const SCRAP = { x: 30, y: 590, w: 250, h: 106 };
/** Arc wedges in the build screen: radius in cells and opacity (direction and width only, not range). */
const ARC_PREVIEW_CELLS = 1.6;
const ARC_FILL_ALPHA = 0.18;
const ARC_LINE_ALPHA = 0.55;
const OFFLINE_TINT = COLORS.offline;
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

function upgradeRect(i: number): Rect {
  const r = cardRect(i);
  const { inset, h } = UPGRADE_STRIP;
  return { x: r.x + inset, y: r.y + r.h - h - inset, w: r.w - 2 * inset, h };
}

/**
 * Build pause (concept.md §2.3). In a run it edits the run's city and reports
 * back through `done`; without data it is the Phase 1 sandbox, where confirm
 * rolls a fresh offer and the same city carries on.
 */
export class BuildScene extends Phaser.Scene {
  private run: BuildSceneData | null = null;
  private rng!: Rng;
  private city!: CityState;
  private session!: BuildSession;
  private rerollsLeft = 0;
  private g!: Phaser.GameObjects.Graphics;
  /** Overlay graphics (outlines, arcs, frames) above the tile sprites. */
  private fg!: Phaser.GameObjects.Graphics;
  /** Arc wedges, between the grid and the tile sprites so tiles stay readable. */
  private arcs!: Phaser.GameObjects.Graphics;
  /** Chain links and filled lines, between tile bodies and barrels. */
  private lines!: Phaser.GameObjects.Graphics;
  private syn!: Synergies;
  private tileImgs!: SpritePool;
  private crackImgs!: SpritePool;
  private barrelImgs!: SpritePool;
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private upgradeTexts: Phaser.GameObjects.Text[] = [];
  private confirmText!: Phaser.GameObjects.Text;
  private repairText!: Phaser.GameObjects.Text;
  private rerollText!: Phaser.GameObjects.Text;
  private reasonText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Text;
  private showBridges = false;
  private showArcs = false;
  private pointer = { x: 0, y: 0 };
  private press: { x: number; y: number; picked: boolean } | null = null;
  private flash: { text: string; until: number } | null = null;
  private pauseStartedAt = 0;

  constructor() {
    super('Build');
  }

  init(data: Partial<BuildSceneData>): void {
    this.run = data.city ? (data as BuildSceneData) : null;
  }

  create(): void {
    this.rng = createRng(SEED);
    this.city = this.run?.city ?? createCity();
    this.rerollsLeft = this.run?.rerollsLeft ?? 0;
    this.press = null;
    this.flash = null;
    this.cardTexts = [];
    this.upgradeTexts = [];
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, COLORS.background, this.run ? 0.94 : 1).setOrigin(0);
    createTextures(this);
    this.g = this.add.graphics();
    this.tileImgs = new SpritePool(this, 1);
    this.crackImgs = new SpritePool(this, 1.1);
    this.barrelImgs = new SpritePool(this, 1.2);
    this.fg = this.add.graphics().setDepth(3);
    this.arcs = this.add.graphics().setDepth(0.5);
    this.lines = this.add.graphics().setDepth(1.15);
    const text = { fontFamily: FONT.family, fontStyle: FONT.weight, color: COLORS.text };

    this.add
      .text(GRID_CENTRE.x, 28, this.run?.title ?? 'Salvage!', {
        ...text,
        fontStyle: FONT.bold,
        fontSize: '28px',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(
        30,
        90,
        [
          'Pick a piece: click or 1/2/3',
          ...(this.run ? ['Repair Core: 4 · Reroll: 5', 'Upgrade instead: Shift+1/2/3'] : []),
          'Move: drag (or click, then click)',
          'Rotate: R / right-click',
          'Put back: Esc',
          'Scrap: drag onto SCRAP, or hover + X',
          'Bridges: B · Arcs: V',
          'Confirm: Enter',
          ...(DEBUG ? ['', 'Debug:', 'F2  expand grid', 'Del destroy hovered tile'] : []),
        ].join('\n'),
        { ...text, fontSize: '14px', color: COLORS.textDim, lineSpacing: 6 },
      )
      .setOrigin(0, 0);
    this.statusText = this.add.text(30, 440, '', {
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
    this.repairText = this.add
      .text(REPAIR.x + REPAIR.w / 2, REPAIR.y + REPAIR.h / 2, '', { ...text, fontSize: '14px' })
      .setOrigin(0.5);
    this.rerollText = this.add
      .text(REROLL.x + REROLL.w / 2, REROLL.y + REROLL.h / 2, '', { ...text, fontSize: '14px' })
      .setOrigin(0.5);
    this.reasonText = this.add
      .text(CONFIRM.x + CONFIRM.w, CONFIRM.y - 8, '', {
        ...text,
        fontSize: '13px',
        color: COLORS.textWarn,
        align: 'right',
        wordWrap: { width: CONFIRM.w + 180 },
      })
      .setOrigin(1, 1);
    this.tooltip = this.add
      .text(0, 0, '', {
        ...text,
        fontSize: '13px',
        backgroundColor: css(COLORS.panel),
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

    this.newPause(this.run?.offers ?? rollOffers(this.rng, SANDBOX_POOL, OFFERS.count));
    this.bindInput();
  }

  private newPause(offers: PieceDef[]): void {
    this.session = startBuild(this.city, offers);
    this.pauseStartedAt = this.time.now;
    this.showOffers();
  }

  private showOffers(): void {
    for (const t of [...this.cardTexts, ...this.upgradeTexts]) t.destroy();
    this.cardTexts = this.session.offers.map((def, i) => {
      const r = cardRect(i);
      return this.add.text(r.x + 12, r.y + 10, `${i + 1}  ${pieceSummary(def)}`, {
        fontFamily: FONT.family,
        fontStyle: FONT.weight,
        fontSize: '13px',
        color: COLORS.text,
        wordWrap: { width: CARDS.w - 24 },
      });
    });
    this.upgradeTexts = this.session.upgrades.map((type, i) => {
      const r = upgradeRect(i);
      const label = type
        ? `⇧${i + 1}  Upgrade ${TILES[type].name} → L${typeLevel(this.city, type) + 1}` +
          (perkAt(type, typeLevel(this.city, type) + 1) ? ' ★' : '')
        : '';
      return this.add
        .text(r.x + r.w / 2, r.y + r.h / 2, label, {
          fontFamily: FONT.family,
          fontStyle: FONT.weight,
          fontSize: '12px',
          color: COLORS.text,
        })
        .setOrigin(0.5)
        .setDepth(2)
        .setVisible(!!type);
    });
  }

  /** Run-only options are shown when the pause has offers (not for a grid expansion). */
  private hasRunOptions(): boolean {
    return this.run !== null && this.session.offers.length > 0;
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

  /** Index of the offer whose (available) upgrade strip is under the point, or -1. */
  private upgradeAt(x: number, y: number): number {
    if (!this.hasRunOptions()) return -1;
    for (let i = 0; i < this.session.offers.length; i++) {
      if (this.session.upgrades[i] && inRect(upgradeRect(i), x, y)) return i;
    }
    return -1;
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
      if (this.hasRunOptions() && inRect(REPAIR, p.x, p.y)) {
        this.tryRepair();
        return;
      }
      if (this.hasRunOptions() && inRect(REROLL, p.x, p.y)) {
        this.tryReroll();
        return;
      }
      const up = this.upgradeAt(p.x, p.y);
      if (up >= 0) {
        toggleUpgrade(this.session, up);
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
        if (e.shiftKey) {
          if (this.hasRunOptions()) toggleUpgrade(s, index);
          break;
        }
        if (s.heldOrigin?.kind === 'offer') cancelHeld(s);
        pickOffer(s, index);
        break;
      }
      case 'Digit4':
        if (this.hasRunOptions()) this.tryRepair();
        break;
      case 'Digit5':
        if (this.hasRunOptions()) this.tryReroll();
        break;
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
      case 'KeyV':
        this.showArcs = !this.showArcs;
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

  /** Repair Core is pointless (and disabled) while the Core is at full HP. */
  private canRepair(): boolean {
    return (this.run?.coreHeal ?? 0) > 0 || this.session.repairChosen;
  }

  private tryRepair(): void {
    if (this.canRepair()) toggleRepair(this.session);
    else this.showFlash('The Core is at full HP');
  }

  private tryReroll(): void {
    if (!this.run || !canReroll(this.session)) return;
    const offers = this.run.reroll();
    if (!offers) {
      this.showFlash('No rerolls left');
      return;
    }
    this.rerollsLeft--;
    reroll(this.session, offers);
    this.showOffers();
  }

  private tryConfirm(): void {
    const s = this.session;
    if (!confirmStatus(s).ok) return;
    const durations = (this.registry.get('pauseDurations') as number[] | undefined) ?? [];
    durations.push((this.time.now - this.pauseStartedAt) / 1000);
    this.registry.set('pauseDurations', durations);
    if (this.run) {
      this.run.done({ repair: s.repairChosen, scrapped: s.scrapped, upgrade: chosenUpgrade(s) });
      return;
    }
    this.newPause(rollOffers(this.rng, SANDBOX_POOL, OFFERS.count));
  }

  private showFlash(text: string): void {
    this.flash = { text, until: this.time.now + 1200 };
  }

  // ---------------------------------------------------------------- render

  override update(): void {
    this.g.clear();
    this.fg.clear();
    this.arcs.clear();
    this.lines.clear();
    this.syn = computeSynergies(this.city);
    for (const pool of [this.tileImgs, this.crackImgs, this.barrelImgs]) pool.begin();
    this.drawGrid();
    this.drawCards();
    this.drawPanels();
    this.drawHeld();
    for (const pool of [this.tileImgs, this.crackImgs, this.barrelImgs]) pool.end();
    this.updateTooltip();
    this.updateStatus();
  }

  /** One tile from the shared textures: body + icon, cracks, barrel along its facing. */
  private drawTileImage(
    x: number,
    y: number,
    cs: number,
    t: Pick<PlacedTile, 'type' | 'facing' | 'online'> & { hp?: number; maxHp?: number },
    alpha = 1,
  ): void {
    const hpFrac = t.hp !== undefined && t.maxHp ? t.hp / t.maxHp : 1;
    const a = alpha * damageAlpha(hpFrac, this.time.now);
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    this.tileImgs.add(cx, cy, TEX.tile(t.type, !t.online)).setDisplaySize(cs, cs).setAlpha(a);
    if (showsCracks(hpFrac)) {
      this.crackImgs.add(cx, cy, TEX.cracks).setDisplaySize(cs, cs).setAlpha(a);
    }
    const barrel = barrelFor(t.type);
    if (barrel) {
      const img = this.barrelImgs
        .add(cx, cy, TEX.barrel(barrel))
        .setDisplaySize(cs, cs)
        .setRotation(facingAngle(t.facing))
        .setAlpha(a);
      if (t.online) img.clearTint();
      else img.setTint(OFFLINE_TINT);
    }
  }

  /** Faint wedge showing an arc weapon's facing and arc width (concept.md §2.10). */
  private drawArc(cx: number, cy: number, cs: number, t: Pick<PlacedTile, 'type' | 'facing'>) {
    const weapon = TILES[t.type].weapon;
    if (!weapon || weapon.arcDeg >= 360) return;
    const half = (weapon.arcDeg * Math.PI) / 360;
    const mid = facingAngle(t.facing);
    const r = cs * ARC_PREVIEW_CELLS;
    const g = this.arcs;
    g.fillStyle(TILES[t.type].color, ARC_FILL_ALPHA);
    g.slice(cx, cy, r, mid - half, mid + half, false);
    g.fillPath();
    g.lineStyle(2, TILES[t.type].color, ARC_LINE_ALPHA);
    g.slice(cx, cy, r, mid - half, mid + half, false);
    g.strokePath();
  }

  private drawGrid(): void {
    const g = this.g;
    const fg = this.fg;
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

    // Hovered group: what a click would pick up; its arcs are shown too.
    let hoveredGroup = -1;
    if (!this.session.held && inRect(r, this.pointer.x, this.pointer.y)) {
      const c = this.cellAt(this.pointer.x, this.pointer.y);
      hoveredGroup = tileAt(city, c.x, c.y)?.groupId ?? -1;
    }

    const bridges = this.showBridges ? findBridges(city) : new Set<number>();
    for (const t of city.tiles) {
      const px = r.x + t.gx * cs;
      const py = r.y + t.gy * cs;
      this.drawTileImage(px, py, cs, t);
      if (this.showArcs || t.groupId === hoveredGroup)
        this.drawArc(px + cs / 2, py + cs / 2, cs, t);
      if (!t.online) {
        fg.lineStyle(2, COLORS.invalid, 1);
        fg.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
      }
      if (bridges.has(t.id)) {
        fg.lineStyle(3, COLORS.bridge, 1);
        fg.strokeCircle(px + cs / 2, py + cs / 2, cs * 0.34);
      }
    }
    drawSynergyLines(this.lines, this.syn, city.gridSize, cs, r.x, r.y);
    this.drawGroupOutlines(city.tiles, r.x, r.y, cs, COLORS.groupOutline, 0.45);
    if (hoveredGroup >= 0) {
      const group = city.tiles.filter((t) => t.groupId === hoveredGroup);
      this.drawGroupOutlines(group, r.x, r.y, cs, COLORS.hover, 1, 3);
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
    const fg = this.fg;
    const group = new Map(tiles.map((t) => [cellKey(t.gx, t.gy), t.groupId]));
    fg.lineStyle(width, color, alpha);
    for (const t of tiles) {
      const x = ox + t.gx * cs;
      const y = oy + t.gy * cs;
      const same = (dx: number, dy: number) =>
        group.get(cellKey(t.gx + dx, t.gy + dy)) === t.groupId;
      if (!same(0, -1)) fg.lineBetween(x, y, x + cs, y);
      if (!same(0, 1)) fg.lineBetween(x, y + cs, x + cs, y + cs);
      if (!same(-1, 0)) fg.lineBetween(x, y, x, y + cs);
      if (!same(1, 0)) fg.lineBetween(x + cs, y, x + cs, y + cs);
    }
  }

  private drawHeld(): void {
    const s = this.session;
    if (!s.held) return;
    const fg = this.fg;
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
        this.drawTileImage(x, y, cs, { ...t, online: true }, 0.75);
        this.drawArc(x + cs / 2, y + cs / 2, cs, t);
        const bad = preview.problems.has(cellKey(cell.x, cell.y));
        fg.lineStyle(3, bad ? COLORS.invalid : COLORS.valid, 1);
        fg.strokeRect(x + 2, y + 2, cs - 4, cs - 4);
      });
      return;
    }

    // Off-grid: follow the pointer freely.
    const ox = px - (s.held.anchor.x + 0.5) * cs;
    const oy = py - (s.held.anchor.y + 0.5) * cs;
    for (const t of s.held.tiles) {
      const x = ox + t.gx * cs;
      const y = oy + t.gy * cs;
      this.drawTileImage(x, y, cs, { ...t, online: true }, 0.6);
      this.drawArc(x + cs / 2, y + cs / 2, cs, t);
    }
    if (inRect(SCRAP, px, py)) {
      fg.lineStyle(3, COLORS.invalid, 1);
      fg.strokeRect(SCRAP.x, SCRAP.y, SCRAP.w, SCRAP.h);
    }
  }

  private drawCards(): void {
    const g = this.g;
    const s = this.session;
    s.offers.forEach((def, i) => {
      const r = cardRect(i);
      const upgraded = s.upgradeChosen === i;
      const taken =
        (s.offerTaken && !upgraded) || (s.heldOrigin?.kind === 'offer' && s.heldOrigin.index === i);
      const alpha = taken ? 0.3 : 1;
      this.cardTexts[i]?.setAlpha(alpha);
      const hovered = !s.held && !s.offerTaken && inRect(r, this.pointer.x, this.pointer.y);
      g.fillStyle(COLORS.panel, 1);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
      g.lineStyle(2, hovered ? COLORS.hover : COLORS.panelBorder, 1);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);

      const w = Math.max(...def.cells.map((c) => c.x)) + 1;
      const h = Math.max(...def.cells.map((c) => c.y)) + 1;
      const strip =
        s.upgrades[i] && this.hasRunOptions() ? UPGRADE_STRIP.h + UPGRADE_STRIP.inset : 0;
      // Shrink tall pieces so the preview never runs into the upgrade strip.
      const room = r.h - CARDS.previewTop - strip - CARDS.previewPad;
      const cs = Math.min(CARDS.cell, Math.floor(room / h));
      const ox = r.x + (r.w - w * cs) / 2;
      const oy = r.y + CARDS.previewTop + (room - h * cs) / 2;
      for (const c of def.cells) {
        this.drawTileImage(
          ox + c.x * cs,
          oy + c.y * cs,
          cs,
          { ...c, type: c.tile, online: true },
          alpha,
        );
      }

      const up = this.upgradeTexts[i];
      const showUp = !!s.upgrades[i] && this.hasRunOptions();
      up?.setVisible(showUp);
      if (showUp) {
        const enabled = upgraded || (!s.offerTaken && !s.held);
        this.drawButton(upgradeRect(i), enabled, upgraded);
        up?.setAlpha(enabled ? 1 : 0.4);
      }
    });
  }

  private drawPanels(): void {
    const g = this.g;
    const s = this.session;
    g.lineStyle(2, COLORS.panelBorder, 1);
    g.strokeRoundedRect(SCRAP.x, SCRAP.y, SCRAP.w, SCRAP.h, 8);

    const runOptions = this.hasRunOptions();
    this.repairText.setVisible(runOptions);
    this.rerollText.setVisible(runOptions);
    if (runOptions && this.run) {
      const repairOn = (!s.offerTaken || s.repairChosen) && !s.held && this.canRepair();
      const rerollOn = canReroll(s) && this.rerollsLeft > 0;
      this.drawButton(REPAIR, repairOn, s.repairChosen);
      this.drawButton(REROLL, rerollOn, false);
      this.repairText
        .setText(`4  Repair Core  +${Math.round(this.run.coreHeal)} HP`)
        .setAlpha(repairOn ? 1 : 0.4);
      this.rerollText.setText(`5  Reroll  (${this.rerollsLeft} left)`).setAlpha(rerollOn ? 1 : 0.4);
    }

    const status = confirmStatus(s);
    const hovered = status.ok && inRect(CONFIRM, this.pointer.x, this.pointer.y);
    g.fillStyle(status.ok ? (hovered ? COLORS.confirmHover : COLORS.confirm) : COLORS.disabled, 1);
    g.fillRoundedRect(CONFIRM.x, CONFIRM.y, CONFIRM.w, CONFIRM.h, 8);
    this.confirmText.setAlpha(status.ok ? 1 : 0.4);
    this.reasonText.setText(
      status.block === 'holding'
        ? 'Place the held piece (Esc puts it back)'
        : status.block === 'no_offer_taken'
          ? this.run
            ? 'Pick a piece, an upgrade or Repair Core'
            : 'Pick one of the offered pieces'
          : status.block === 'disconnected'
            ? `${status.offline} tile${status.offline === 1 ? ' is' : 's are'} not connected to the Core — reconnect or scrap`
            : '',
    );
  }

  private drawButton(r: Rect, enabled: boolean, selected: boolean): void {
    const g = this.g;
    const hovered = enabled && !selected && inRect(r, this.pointer.x, this.pointer.y);
    g.fillStyle(selected ? COLORS.selected : COLORS.panel, 1);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
    g.lineStyle(2, hovered ? COLORS.hover : selected ? COLORS.valid : COLORS.panelBorder, 1);
    g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
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
    this.tooltip.setText(pieceDetails(def, this.city, s.upgrades[i] ?? null)).setVisible(true);
    this.tooltip.setPosition(r.x - this.tooltip.width - 10, r.y);
  }

  private updateStatus(): void {
    const city = this.city;
    const d = (this.registry.get('pauseDurations') as number[] | undefined) ?? [];
    const avg = d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
    const lines = [
      `Grid ${city.gridSize}×${city.gridSize}  ·  ${city.tiles.length} tiles`,
      `Bridges view: ${this.showBridges ? 'ON' : 'off'}  ·  Arcs: ${this.showArcs ? 'ON' : 'off'}`,
      levelSummary(city),
      `Chains: ${this.syn.chains.length}  ·  Filled lines: ${this.syn.filledRows.length + this.syn.filledCols.length}`,
      this.run && this.run.refundPerScrap > 0
        ? `Scrap refund: ${this.run.refundPerScrap} XP per piece` +
          (this.session.scrapped ? ` (${this.session.scrapped} scrapped)` : '')
        : '',
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

function pieceDetails(def: PieceDef, city: CityState, upgrade: TileType | null): string {
  const lines = countTiles(def).map(([type, n]) => {
    const t = TILES[type];
    const level = typeLevel(city, type);
    return `${n}× ${t.name} L${level} — ${t.maxHp} HP\n   ${t.description}`;
  });
  if (upgrade) {
    const next = typeLevel(city, upgrade) + 1;
    const family = TILES[upgrade].family;
    const gain =
      family === 'weapon'
        ? `+${UPGRADES.damagePerLevel * 100}% damage`
        : family === 'structure'
          ? `+${UPGRADES.hpPerLevel * 100}% max HP`
          : `+${UPGRADES.effectPerLevel * 100}% effect`;
    const perk = perkAt(upgrade, next);
    lines.push(
      '',
      `Upgrade instead: all ${TILES[upgrade].name} tiles → L${next}, ${gain}`,
      ...(perk ? [`★ L${next} perk: ${perk}`] : []),
    );
  }
  const perks = countTiles(def)
    .map(
      ([type]) =>
        TILES[type].perks &&
        `${TILES[type].name}: L3 ${TILES[type].perks?.l3.name} · L5 ${TILES[type].perks?.l5.name}`,
    )
    .filter(Boolean);
  if (perks.length) lines.push('', 'Perks:', ...perks.map((p) => `   ${p}`));
  return lines.join('\n');
}

/** "Levels: Gatling 3 · Cannon 2" for every type above level 1, or ''. */
function levelSummary(city: CityState): string {
  const up = (Object.keys(TILES) as TileType[]).filter((t) => typeLevel(city, t) > 1);
  return up.length
    ? `Levels: ${up.map((t) => `${TILES[t].name} ${typeLevel(city, t)}`).join(' · ')}`
    : '';
}

/** Name of the perk a type unlocks at `level` (3 or 5), if any. */
function perkAt(type: TileType, level: number): string | undefined {
  const perks = TILES[type].perks;
  if (!perks) return undefined;
  return level === 3 ? perks.l3.name : level === 5 ? perks.l5.name : undefined;
}

function countTiles(def: PieceDef): [TileType, number][] {
  const counts = new Map<TileType, number>();
  for (const c of def.cells) counts.set(c.tile, (counts.get(c.tile) ?? 0) + 1);
  return [...counts.entries()];
}
