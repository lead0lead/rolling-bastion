import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { ECONOMY } from '../config/economy';
import { UPGRADES } from '../config/balance';
import { FX } from '../config/fx';
import type { PieceDef } from '../config/pieces';
import { TILES, type TileType } from '../config/tiles';
import { DEBUG, SEED } from '../debug/flags';
import { barrelFor } from '../render/icons';
import { drawSynergyLines } from '../render/lines';
import { createTextures, TEX } from '../render/textures';
import { COLORS, css, FONT } from '../render/palette';
import { damageAlpha, showsCracks, SpritePool } from '../render/tiles';
import {
  cancelHeld,
  confirmStatus,
  debugDestroyAt,
  dropAt,
  pickUpAt,
  previewAt,
  rotate,
  scrapHeld,
  startBuild,
  type BuildSession,
} from '../sim/build';
import { findBridges, updateOnline } from '../sim/connectivity';
import {
  cellKey,
  coreTile,
  facingAngle,
  heldFromPiece,
  scrapGroup,
  tileAt,
  type CityState,
  type PlacedTile,
} from '../sim/grid';
import { repairCoreAmount } from '../sim/progression';
import { computeSynergies, type Synergies } from '../sim/synergies';
import { applyUpgrade, canUpgrade, typeLevel } from '../sim/upgrades';
import {
  inflation,
  piecePrice,
  repairPrice,
  rerollPrice,
  rollShop,
  scrapRefundFor,
  upgradePrice,
} from '../sim/waves';
import type { World } from '../sim/world';

/** Spike A: the shop between waves, which is also the build screen (concept-v2.md §2.8). */
export interface BuildSceneData {
  world: World;
  title: string;
  /** Shown in the status panel when the shop opens (e.g. a grid expansion). */
  note?: string;
  /** Label of the button that closes the shop. */
  nextLabel: string;
  done: () => void;
}

// Screen layout (1280×720).
const GRID_CENTRE = { x: 620, y: 390 };
const GRID_MAX_PX = 520;
const GRID_MAX_CELL = 64;
const PANEL_X = 905;
const COL_W = 176;
const COL_GAP = 8;
const CARDS = {
  y: 70,
  h: 128,
  gap: 8,
  /** Preview cell size, and the preview area below the card title. */
  cell: 18,
  previewTop: 44,
  /** Room at the bottom for the price line. */
  bottom: 24,
};
const UPGRADE_CARDS = { y: 346, h: 58 };
const REPAIR = { x: PANEL_X, y: 414, w: COL_W, h: 44 };
const REROLL = { x: PANEL_X + COL_W + COL_GAP, y: 414, w: COL_W, h: 44 };
const CONFIRM = { x: PANEL_X, y: 640, w: COL_W * 2 + COL_GAP, h: 56 };
const SCRAP = { x: 30, y: 590, w: 250, h: 106 };
const LOCK = { size: 22, inset: 6 };
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

function colX(col: number): number {
  return PANEL_X + col * (COL_W + COL_GAP);
}

function cardRect(i: number): Rect {
  return {
    x: colX(i % 2),
    y: CARDS.y + Math.floor(i / 2) * (CARDS.h + CARDS.gap),
    w: COL_W,
    h: CARDS.h,
  };
}

function upgradeRect(i: number): Rect {
  return { x: colX(i), y: UPGRADE_CARDS.y, w: COL_W, h: UPGRADE_CARDS.h };
}

function lockRect(r: Rect): Rect {
  return { x: r.x + r.w - LOCK.size - LOCK.inset, y: r.y + LOCK.inset, w: LOCK.size, h: LOCK.size };
}

/** Shop + build screen (Spike A). Edits the run's city and coins directly. */
export class BuildScene extends Phaser.Scene {
  private run!: BuildSceneData;
  private world!: World;
  private city!: CityState;
  private session!: BuildSession;
  /** Rerolls bought during this visit (each costs one more). */
  private rerolls = 0;
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
  private priceTexts: Phaser.GameObjects.Text[] = [];
  private upgradeTexts: Phaser.GameObjects.Text[] = [];
  private coinsText!: Phaser.GameObjects.Text;
  private confirmText!: Phaser.GameObjects.Text;
  private repairText!: Phaser.GameObjects.Text;
  private rerollText!: Phaser.GameObjects.Text;
  private scrapText!: Phaser.GameObjects.Text;
  private reasonText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Text;
  private showBridges = false;
  private showArcs = false;
  private pointer = { x: 0, y: 0 };
  private press: { x: number; y: number; picked: boolean } | null = null;
  private flash: { text: string; until: number; error: boolean } | null = null;
  private openedAt = 0;
  /** The group placed last and when (ms), for its bounce. */
  private placed: { groupId: number; at: number } | null = null;

  constructor() {
    super('Build');
  }

  init(data: BuildSceneData): void {
    this.run = data;
  }

  create(): void {
    this.world = this.run.world;
    this.city = this.world.city;
    this.rerolls = 0;
    this.press = null;
    this.flash = null;
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, COLORS.background, 0.94).setOrigin(0);
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
      .text(GRID_CENTRE.x, 28, this.run.title, { ...text, fontStyle: FONT.bold, fontSize: '28px' })
      .setOrigin(0.5, 0);
    this.coinsText = this.add.text(PANEL_X, 22, '', {
      ...text,
      fontStyle: FONT.bold,
      fontSize: '24px',
    });
    this.add
      .text(
        30,
        90,
        [
          'Buy piece: click or 1–4 (goes to your hand)',
          'Upgrade: click or Shift+1/2',
          'Repair Core: 5 · Reroll: 6',
          'Lock a slot: its lock, or hover + L',
          'Move: drag (or click, then click)',
          'Rotate: R / right-click',
          'Put back: Esc',
          'Scrap: drag onto SCRAP, or hover + X',
          'Bridges: B · Arcs: V',
          'Next wave: Enter',
          ...(DEBUG ? ['', 'Debug: Del destroys hovered tile'] : []),
        ].join('\n'),
        { ...text, fontSize: '14px', color: COLORS.textDim, lineSpacing: 6 },
      )
      .setOrigin(0, 0);
    this.statusText = this.add.text(30, 400, '', {
      ...text,
      fontSize: '14px',
      color: COLORS.textDim,
      lineSpacing: 6,
      wordWrap: { width: 290 },
    });
    this.scrapText = this.add
      .text(SCRAP.x + SCRAP.w / 2, SCRAP.y + SCRAP.h / 2, 'SCRAP', {
        ...text,
        fontSize: '20px',
        align: 'center',
      })
      .setOrigin(0.5);
    this.confirmText = this.add
      .text(CONFIRM.x + CONFIRM.w / 2, CONFIRM.y + CONFIRM.h / 2, this.run.nextLabel, {
        ...text,
        fontSize: '20px',
      })
      .setOrigin(0.5);
    this.repairText = this.add
      .text(REPAIR.x + REPAIR.w / 2, REPAIR.y + REPAIR.h / 2, '', {
        ...text,
        fontSize: '13px',
        align: 'center',
      })
      .setOrigin(0.5);
    this.rerollText = this.add
      .text(REROLL.x + REROLL.w / 2, REROLL.y + REROLL.h / 2, '', {
        ...text,
        fontSize: '13px',
        align: 'center',
      })
      .setOrigin(0.5);
    this.reasonText = this.add
      .text(CONFIRM.x + CONFIRM.w, CONFIRM.y - 8, '', {
        ...text,
        fontSize: '13px',
        color: COLORS.textWarn,
        align: 'right',
        wordWrap: { width: CONFIRM.w },
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
      .text(1268, 4, `v${__APP_VERSION__}  seed ${SEED}`, {
        ...text,
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 0);

    this.session = startBuild(this.city, []);
    // The scene clock is stale until its first update; the game loop's time is current.
    this.openedAt = this.game.loop.time;
    this.showSlots();
    if (this.run.note) {
      this.flash = { text: this.run.note, until: this.openedAt + 4000, error: false };
    }
    this.bindInput();
  }

  /** (Re)creates the slot texts; call after anything changes which items the slots hold. */
  private showSlots(): void {
    for (const t of [...this.cardTexts, ...this.priceTexts, ...this.upgradeTexts]) t.destroy();
    const style = {
      fontFamily: FONT.family,
      fontStyle: FONT.weight,
      fontSize: '12px',
      color: COLORS.text,
    };
    const shop = this.world.shop;
    this.cardTexts = [];
    this.priceTexts = [];
    for (let i = 0; i < ECONOMY.pieceSlots; i++) {
      const r = cardRect(i);
      const slot = shop.pieces[i];
      this.cardTexts.push(
        this.add.text(r.x + 8, r.y + 8, slot ? `${i + 1}  ${pieceSummary(slot.def)}` : 'Sold', {
          ...style,
          color: slot ? COLORS.text : COLORS.textDim,
          wordWrap: { width: COL_W - 16 - LOCK.size - LOCK.inset },
        }),
      );
      this.priceTexts.push(
        this.add
          .text(r.x + r.w / 2, r.y + r.h - 8, '', style)
          .setOrigin(0.5, 1)
          .setDepth(2),
      );
    }
    this.upgradeTexts = [];
    for (let i = 0; i < ECONOMY.upgradeSlots; i++) {
      const r = upgradeRect(i);
      const slot = shop.upgrades[i];
      const next = slot ? typeLevel(this.city, slot.type) + 1 : 0;
      const label = slot
        ? `⇧${i + 1}  ${TILES[slot.type].name} → L${next}${perkAt(slot.type, next) ? ' ★' : ''}`
        : 'Sold';
      this.upgradeTexts.push(
        this.add
          .text(r.x + 8, r.y + 8, label, {
            ...style,
            color: slot ? COLORS.text : COLORS.textDim,
            wordWrap: { width: COL_W - 16 - LOCK.size - LOCK.inset },
          })
          .setDepth(2),
      );
    }
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
    for (let i = 0; i < ECONOMY.pieceSlots; i++) if (inRect(cardRect(i), x, y)) return i;
    return -1;
  }

  private upgradeAt(x: number, y: number): number {
    for (let i = 0; i < ECONOMY.upgradeSlots; i++) if (inRect(upgradeRect(i), x, y)) return i;
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
        this.rotateHeld();
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
      if (inRect(REPAIR, p.x, p.y)) {
        this.tryRepair();
        return;
      }
      if (inRect(REROLL, p.x, p.y)) {
        this.tryReroll();
        return;
      }
      const up = this.upgradeAt(p.x, p.y);
      if (up >= 0) {
        if (inRect(lockRect(upgradeRect(up)), p.x, p.y)) this.toggleLock('upgrade', up);
        else this.buyUpgrade(up);
        return;
      }
      const card = this.cardAt(p.x, p.y);
      if (card >= 0 && inRect(lockRect(cardRect(card)), p.x, p.y)) {
        this.toggleLock('piece', card);
        return;
      }
      let picked: boolean;
      if (card >= 0) {
        picked = this.takeSlot(card);
      } else {
        const cell = this.cellAt(p.x, p.y);
        picked = pickUpAt(this.session, cell.x, cell.y);
        if (picked) playSfx(this, 'ui-pick');
      }
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

  /** Buys the piece in slot i if needed, then puts it in the hand. */
  private takeSlot(i: number): boolean {
    const s = this.session;
    const w = this.world;
    const slot = w.shop.pieces[i];
    if (!slot) return false;
    if (s.held) {
      if (s.heldOrigin?.kind !== 'offer') return false;
      cancelHeld(s);
    }
    if (slot.paid === null) {
      const price = piecePrice(w, slot.def);
      if (w.coins < price) {
        this.showFlash('Not enough coins');
        return false;
      }
      w.coins -= price;
      slot.paid = price;
      slot.locked = false;
      playSfx(this, 'gem');
      this.showSlots();
    } else {
      playSfx(this, 'ui-pick');
    }
    const held = heldFromPiece(this.city, slot.def);
    for (const t of held.tiles) t.paid = slot.paid / held.tiles.length;
    s.held = held;
    s.heldOrigin = { kind: 'offer', index: i };
    return true;
  }

  private releaseHeld(x: number, y: number): void {
    if (inRect(SCRAP, x, y)) {
      this.scrapHeldPiece();
      return;
    }
    const s = this.session;
    if (inRect(this.gridRect(), x, y)) {
      const cell = this.cellAt(x, y);
      const groupId = s.held?.groupId;
      const origin = s.heldOrigin;
      if (!dropAt(s, cell.x, cell.y)) {
        this.showFlash('Does not fit there');
      } else {
        playSfx(this, 'ui-place');
        if (origin?.kind === 'offer') {
          this.world.shop.pieces[origin.index] = null;
          this.showSlots();
        }
        if (groupId !== undefined) this.placed = { groupId, at: this.time.now };
      }
      return;
    }
    cancelHeld(s);
  }

  /** Scraps the held group, refunding a share of what was paid for it. */
  private scrapHeldPiece(): void {
    const s = this.session;
    const origin = s.heldOrigin;
    const refund = s.held ? scrapRefundFor(s.held.tiles) : 0;
    if (!scrapHeld(s)) {
      this.showFlash('The Core cannot be scrapped');
      cancelHeld(s);
      return;
    }
    this.world.coins += refund;
    if (origin?.kind === 'offer') {
      this.world.shop.pieces[origin.index] = null;
      this.showSlots();
    }
    playSfx(this, 'ui-scrap');
  }

  private scrapHovered(): void {
    const cell = this.cellAt(this.pointer.x, this.pointer.y);
    const tile = tileAt(this.city, cell.x, cell.y);
    if (!tile) return;
    if (tile.type === 'core') {
      this.showFlash('The Core cannot be scrapped');
      return;
    }
    const group = this.city.tiles.filter((t) => t.groupId === tile.groupId);
    this.world.coins += scrapRefundFor(group);
    scrapGroup(this.city, tile.groupId);
    updateOnline(this.city);
    playSfx(this, 'ui-scrap');
  }

  private onKey(e: KeyboardEvent): void {
    const s = this.session;
    const cell = this.cellAt(this.pointer.x, this.pointer.y);
    switch (e.code) {
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4': {
        const index = Number(e.code.slice(-1)) - 1;
        if (e.shiftKey) {
          if (index < ECONOMY.upgradeSlots) this.buyUpgrade(index);
          break;
        }
        this.takeSlot(index);
        break;
      }
      case 'Digit5':
        this.tryRepair();
        break;
      case 'Digit6':
        this.tryReroll();
        break;
      case 'KeyL': {
        const card = this.cardAt(this.pointer.x, this.pointer.y);
        const up = this.upgradeAt(this.pointer.x, this.pointer.y);
        if (card >= 0) this.toggleLock('piece', card);
        else if (up >= 0) this.toggleLock('upgrade', up);
        break;
      }
      case 'KeyR':
        this.rotateHeld();
        break;
      case 'Escape':
        cancelHeld(s);
        break;
      case 'KeyX':
        if (s.held) this.scrapHeldPiece();
        else this.scrapHovered();
        break;
      case 'KeyB':
        this.showBridges = !this.showBridges;
        playSfx(this, 'ui-toggle');
        break;
      case 'KeyV':
        this.showArcs = !this.showArcs;
        playSfx(this, 'ui-toggle');
        break;
      case 'Enter':
      case 'NumpadEnter':
        this.tryConfirm();
        break;
      case 'Delete':
        if (DEBUG) debugDestroyAt(s, cell.x, cell.y);
        break;
    }
  }

  private toggleLock(kind: 'piece' | 'upgrade', i: number): void {
    const slot = kind === 'piece' ? this.world.shop.pieces[i] : this.world.shop.upgrades[i];
    if (!slot || ('paid' in slot && slot.paid !== null)) return;
    slot.locked = !slot.locked;
    playSfx(this, 'ui-toggle');
  }

  private buyUpgrade(i: number): void {
    const w = this.world;
    const slot = w.shop.upgrades[i];
    if (!slot) return;
    if (!canUpgrade(this.city, slot.type)) {
      this.showFlash('Nothing to upgrade');
      return;
    }
    const price = upgradePrice(w, slot.type);
    if (w.coins < price) {
      this.showFlash('Not enough coins');
      return;
    }
    w.coins -= price;
    applyUpgrade(this.city, slot.type);
    w.shop.upgrades[i] = null;
    this.showSlots();
    playSfx(this, 'upgrade');
  }

  private tryRepair(): void {
    const w = this.world;
    const core = coreTile(this.city);
    const heal = repairCoreAmount(w);
    if (!core || heal <= 0) {
      this.showFlash('The Core is at full HP');
      return;
    }
    const price = repairPrice(w);
    if (w.coins < price) {
      this.showFlash('Not enough coins');
      return;
    }
    w.coins -= price;
    core.hp += heal;
    playSfx(this, 'gem');
  }

  private tryReroll(): void {
    const w = this.world;
    const price = rerollPrice(w, this.rerolls);
    if (w.coins < price) {
      this.showFlash('Not enough coins');
      return;
    }
    w.coins -= price;
    this.rerolls++;
    rollShop(w);
    this.showSlots();
    playSfx(this, 'ui-toggle');
  }

  private rotateHeld(): void {
    if (!this.session.held) return;
    rotate(this.session);
    playSfx(this, 'ui-rotate');
  }

  /** Why "Next wave" is disabled, or '' if it is enabled. */
  private blockReason(): string {
    const status = confirmStatus(this.session);
    if (status.block === 'holding') return 'Place the held piece (Esc puts it back in its slot)';
    const unplaced = this.world.shop.pieces.filter((p) => p && p.paid !== null).length;
    if (unplaced > 0) return 'Place or scrap the pieces you bought';
    if (status.block === 'disconnected') {
      return `${status.offline} tile${status.offline === 1 ? ' is' : 's are'} not connected to the Core — reconnect or scrap`;
    }
    return '';
  }

  private tryConfirm(): void {
    if (this.blockReason()) {
      playSfx(this, 'ui-error');
      return;
    }
    playSfx(this, 'ui-confirm');
    const durations = (this.registry.get('pauseDurations') as number[] | undefined) ?? [];
    durations.push((this.time.now - this.openedAt) / 1000);
    this.registry.set('pauseDurations', durations);
    this.run.done();
  }

  /** A short message in the status panel. */
  private showFlash(text: string): void {
    this.flash = { text, until: this.time.now + 1200, error: true };
    playSfx(this, 'ui-error');
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
    scale = 1,
  ): void {
    const hpFrac = t.hp !== undefined && t.maxHp ? t.hp / t.maxHp : 1;
    const a = alpha * damageAlpha(hpFrac, this.time.now);
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    const ds = cs * scale;
    this.tileImgs.add(cx, cy, TEX.tile(t.type, !t.online)).setDisplaySize(ds, ds).setAlpha(a);
    if (showsCracks(hpFrac)) {
      this.crackImgs.add(cx, cy, TEX.cracks).setDisplaySize(ds, ds).setAlpha(a);
    }
    const barrel = barrelFor(t.type);
    if (barrel) {
      const img = this.barrelImgs
        .add(cx, cy, TEX.barrel(barrel))
        .setDisplaySize(ds, ds)
        .setRotation(facingAngle(t.facing))
        .setAlpha(a);
      if (t.online) img.clearTint();
      else img.setTint(OFFLINE_TINT);
    }
  }

  /** Scale of a just-placed group: a quick overshoot that settles (concept.md §6). */
  private bounceScale(groupId: number): number {
    if (!this.placed || this.placed.groupId !== groupId) return 1;
    const f = (this.time.now - this.placed.at) / 1000 / FX.placeBounce.time;
    if (f >= 1) return 1;
    return 1 + FX.placeBounce.amount * Math.sin(f * Math.PI) * (1 - f);
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
      this.drawTileImage(px, py, cs, t, 1, this.bounceScale(t.groupId));
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
    const w = this.world;
    const shop = w.shop;
    for (let i = 0; i < ECONOMY.pieceSlots; i++) {
      const r = cardRect(i);
      const slot = shop.pieces[i];
      const inHand = s.heldOrigin?.kind === 'offer' && s.heldOrigin.index === i;
      const owned = !!slot && slot.paid !== null;
      const price = slot ? piecePrice(w, slot.def) : 0;
      const affordable = owned || w.coins >= price;
      const alpha = !slot || inHand ? 0.3 : affordable ? 1 : 0.55;
      this.cardTexts[i]?.setAlpha(alpha);
      const hovered = !s.held && !!slot && inRect(r, this.pointer.x, this.pointer.y);
      g.fillStyle(owned ? COLORS.selected : COLORS.panel, slot ? 1 : 0.5);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
      g.lineStyle(2, hovered ? COLORS.hover : owned ? COLORS.valid : COLORS.panelBorder, 1);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
      const priceText = this.priceTexts[i];
      if (!slot) {
        priceText?.setText('');
        continue;
      }
      if (!owned) this.drawLock(lockRect(r), slot.locked);
      if (priceText) {
        priceText
          .setText(owned ? (inHand ? 'In hand' : 'Owned · click to place') : `${price} coins`)
          .setAlpha(inHand ? 0.5 : 1);
        setColor(priceText, owned ? css(COLORS.valid) : affordable ? COLORS.text : COLORS.textWarn);
      }

      const def = slot.def;
      const pw = Math.max(...def.cells.map((c) => c.x)) + 1;
      const ph = Math.max(...def.cells.map((c) => c.y)) + 1;
      const room = r.h - CARDS.previewTop - CARDS.bottom;
      const cs = Math.min(CARDS.cell, Math.floor(room / ph));
      const ox = r.x + (r.w - pw * cs) / 2;
      const oy = r.y + CARDS.previewTop + (room - ph * cs) / 2;
      for (const c of def.cells) {
        this.drawTileImage(
          ox + c.x * cs,
          oy + c.y * cs,
          cs,
          { ...c, type: c.tile, online: true },
          alpha,
        );
      }
    }

    for (let i = 0; i < ECONOMY.upgradeSlots; i++) {
      const r = upgradeRect(i);
      const slot = shop.upgrades[i];
      const price = slot ? upgradePrice(w, slot.type) : 0;
      const on = !!slot && w.coins >= price && !s.held;
      this.drawButton(r, on, false);
      this.upgradeTexts[i]?.setAlpha(!slot ? 0.4 : on ? 1 : 0.55);
      if (!slot) continue;
      this.drawLock(lockRect(r), slot.locked);
      // The price is the label's second line.
      const label = this.upgradeTexts[i];
      const next = typeLevel(this.city, slot.type) + 1;
      label?.setText(
        `⇧${i + 1}  ${TILES[slot.type].name} → L${next}${perkAt(slot.type, next) ? ' ★' : ''}\n${price} coins`,
      );
      if (label) setColor(label, w.coins >= price ? COLORS.text : COLORS.textWarn);
    }
  }

  /** A small padlock: closed and dark when locked, open and faint when not. */
  private drawLock(r: Rect, locked: boolean): void {
    const g = this.fg;
    const hovered = inRect(r, this.pointer.x, this.pointer.y);
    const color = locked ? COLORS.ink : COLORS.panelBorder;
    const alpha = locked || hovered ? 1 : 0.9;
    g.fillStyle(locked ? COLORS.bridge : COLORS.panel, 1);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, 5);
    g.lineStyle(hovered ? 2 : 1.5, hovered ? COLORS.hover : color, alpha);
    g.strokeRoundedRect(r.x, r.y, r.w, r.h, 5);
    const cx = r.x + r.w / 2;
    g.fillStyle(locked ? COLORS.ink : COLORS.offline, 1);
    g.fillRect(cx - 5, r.y + 10, 10, 8);
    g.lineStyle(2, locked ? COLORS.ink : COLORS.offline, 1);
    g.beginPath();
    g.arc(cx + (locked ? 0 : 3), r.y + 10, 3.5, Math.PI, 0, false);
    g.strokePath();
  }

  private drawPanels(): void {
    const g = this.g;
    const w = this.world;
    const s = this.session;
    const hold = s.held;
    const scrapRefund = hold ? scrapRefundFor(hold.tiles) : 0;
    g.lineStyle(2, COLORS.panelBorder, 1);
    g.strokeRoundedRect(SCRAP.x, SCRAP.y, SCRAP.w, SCRAP.h, 8);
    this.scrapText.setText(hold ? `SCRAP\n+${scrapRefund} coins` : 'SCRAP');

    this.coinsText.setText(`${w.coins} coins   ·   prices ×${inflation(w).toFixed(1)}`);

    const heal = repairCoreAmount(w);
    const repairCost = repairPrice(w);
    const repairOn = heal > 0 && w.coins >= repairCost && !hold;
    this.drawButton(REPAIR, repairOn, false);
    this.repairText
      .setText(
        heal > 0
          ? `5  Repair Core +${Math.round(heal)}\n${repairCost} coins`
          : '5  Core at full HP',
      )
      .setAlpha(repairOn ? 1 : 0.4);
    const rerollCost = rerollPrice(w, this.rerolls);
    const rerollOn = w.coins >= rerollCost;
    this.drawButton(REROLL, rerollOn, false);
    this.rerollText.setText(`6  Reroll\n${rerollCost} coins`).setAlpha(rerollOn ? 1 : 0.4);

    const reason = this.blockReason();
    const ok = !reason;
    const hovered = ok && inRect(CONFIRM, this.pointer.x, this.pointer.y);
    g.fillStyle(ok ? (hovered ? COLORS.confirmHover : COLORS.confirm) : COLORS.disabled, 1);
    g.fillRoundedRect(CONFIRM.x, CONFIRM.y, CONFIRM.w, CONFIRM.h, 8);
    this.confirmText.setAlpha(ok ? 1 : 0.4);
    this.reasonText.setText(reason);
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
    const { x, y } = this.pointer;
    const card = s.held ? -1 : this.cardAt(x, y);
    const up = s.held ? -1 : this.upgradeAt(x, y);
    const pieceSlot = this.world.shop.pieces[card];
    const upSlot = this.world.shop.upgrades[up];
    let text = '';
    let r: Rect | null = null;
    if (pieceSlot) {
      text = pieceDetails(pieceSlot.def, this.city);
      r = cardRect(card);
    } else if (upSlot) {
      text = upgradeDetails(upSlot.type, this.city);
      r = upgradeRect(up);
    }
    if (!r) {
      this.tooltip.setVisible(false);
      return;
    }
    this.tooltip.setText(text).setVisible(true);
    this.tooltip.setPosition(
      PANEL_X - this.tooltip.width - 10,
      Math.min(r.y, 700 - this.tooltip.height),
    );
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
      `Scrap refunds ${ECONOMY.scrapRefund * 100}% of the price paid`,
      d.length ? `Shop time: last ${d.at(-1)?.toFixed(1)} s · avg ${avg.toFixed(1)} s` : '',
    ];
    const flash = this.flash;
    if (flash && this.time.now < flash.until) lines.push('', flash.text);
    this.statusText.setText(lines.join('\n'));
  }
}

/** Changing a text's colour re-renders it, so only do it when the colour changes. */
function setColor(t: Phaser.GameObjects.Text, color: string): void {
  if (t.style.color !== color) t.setColor(color);
}

/** "2× Gatling, Hull" style summary of a piece's tiles. */
function pieceSummary(def: PieceDef): string {
  return countTiles(def)
    .map(([type, n]) => (n > 1 ? `${n}× ${TILES[type].name}` : TILES[type].name))
    .join(', ');
}

function pieceDetails(def: PieceDef, city: CityState): string {
  const lines = countTiles(def).map(([type, n]) => {
    const t = TILES[type];
    const level = typeLevel(city, type);
    return `${n}× ${t.name} L${level} — ${t.maxHp} HP\n   ${t.description}`;
  });
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

function upgradeDetails(type: TileType, city: CityState): string {
  const next = typeLevel(city, type) + 1;
  const family = TILES[type].family;
  const gain =
    family === 'weapon'
      ? `+${UPGRADES.damagePerLevel * 100}% damage`
      : family === 'structure'
        ? `+${UPGRADES.hpPerLevel * 100}% max HP`
        : `+${UPGRADES.effectPerLevel * 100}% effect`;
  const perk = perkAt(type, next);
  const perks = TILES[type].perks;
  return [
    `All ${TILES[type].name} tiles → L${next}: ${gain}`,
    ...(perk ? [`★ L${next} perk: ${perk}`] : []),
    ...(perks ? ['', `Perks: L3 ${perks.l3.name} · L5 ${perks.l5.name}`] : []),
  ].join('\n');
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
