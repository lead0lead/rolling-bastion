import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { BUILD_VIEW, GRID, OFFERS, UPGRADES } from '../config/balance';
import { FX } from '../config/fx';
import { LAND_SHAPES, type LandShape } from '../config/land';
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
  clearSelection,
  confirmStatus,
  debugDestroyAt,
  dropAt,
  landPreviewAt,
  offerLand,
  pickLand,
  placeLandAt,
  pickOffer,
  pickUpAt,
  previewAt,
  redo,
  reroll,
  rotate,
  scrapAt,
  scrapHeld,
  scrapSelection,
  selectAll,
  selectBox,
  selectedGroups,
  startBuild,
  chosenUpgrade,
  toggleRepair,
  toggleSelectAt,
  toggleUpgrade,
  undo,
  type BuildSession,
} from '../sim/build';
import { findBridges } from '../sim/connectivity';
import {
  cellFromId,
  cellId,
  cellKey,
  heldGroupIds,
  createCity,
  facingAngle,
  tileAt,
  type CityState,
  type PlacedTile,
} from '../sim/grid';
import type { BuildResult } from '../sim/progression';
import { rollOffers } from '../sim/progression';
import { rollLand } from '../sim/land';
import { createRng, type Rng } from '../sim/rng';
import { computeSynergies, type Synergies } from '../sim/synergies';
import { typeLevel } from '../sim/upgrades';

/** Data for a build pause inside a run. Without it the scene runs as a sandbox. */
export interface BuildSceneData {
  city: CityState;
  offers: PieceDef[];
  /** Land shapes to place first (a land level-up, concept-v2.md §2.1), or null. */
  land: LandShape[] | null;
  title: string;
  /** HP Repair Core would heal now. */
  coreHeal: number;
  rerollsLeft: number;
  /** XP refunded per placed piece scrapped. */
  refundPerScrap: number;
  /** New offers for a reroll (the session counts rerolls used; the run charges them at the end). */
  reroll: () => PieceDef[];
  done: (result: BuildResult) => void;
}

// Screen layout (1280×720).
const TITLE_X = 620;
/** The board view between the side panels: its own camera pans and zooms (concept-v2.md §3.2). */
const VIEW = { x: 300, y: 70, w: 695, h: 650 };
/** World px per cell in the board view (the zoom scales it). */
const CELL = GRID.cellPx;
/** Key codes of the pan keys, by name. */
const PAN_KEYS = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  w: 'KeyW',
  a: 'KeyA',
  s: 'KeyS',
  d: 'KeyD',
} as const;
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
  /**
   * The board view is drawn by `boardCam` (main camera, limited to VIEW,
   * panned and zoomed) from `boardLayer`; everything else by a full-screen
   * UI camera from `uiLayer`. Each camera ignores the other's layer.
   */
  private boardLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private boardCam!: Phaser.Cameras.Scene2D.Camera;
  /** UI graphics: cards, buttons, panels. */
  private g!: Phaser.GameObjects.Graphics;
  /** UI overlay: the scrap zone frame. */
  private uiFg!: Phaser.GameObjects.Graphics;
  /** Board view: cells and the board outline. */
  private boardG!: Phaser.GameObjects.Graphics;
  /** Board view overlay (outlines, frames) above the tile sprites. */
  private fg!: Phaser.GameObjects.Graphics;
  /** Tile images on the cards and of a held group outside the board view. */
  private cardImgs!: SpritePool;
  private cardCrackImgs!: SpritePool;
  private cardBarrelImgs!: SpritePool;
  private panKeys: Partial<Record<keyof typeof PAN_KEYS, Phaser.Input.Keyboard.Key>> = {};
  /**
   * Keys pressed fresh (not auto-repeat) during this pause. A pan key still
   * held from driving only sends repeats, so it doesn't pan until pressed
   * again (user feedback, 2026-10-21).
   */
  private freshKeys = new Set<string>();
  private midDrag: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  /** Box select in progress: where the drag started (screen), and whether it adds (Shift). */
  private box: { x: number; y: number; add: boolean } | null = null;
  private scrapText!: Phaser.GameObjects.Text;
  /** Arc wedges, between the grid and the tile sprites so tiles stay readable. */
  private arcs!: Phaser.GameObjects.Graphics;
  /** Chain links, between tile bodies and barrels. */
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
  /** The group placed last and when (ms), for its bounce. */
  private placed: { groupId: number; at: number } | null = null;

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
    this.midDrag = null;
    this.box = null;
    const { width, height } = this.scale;
    this.boardLayer = this.add.layer();
    this.uiLayer = this.add.layer().setDepth(1);
    this.boardCam = this.cameras.main
      .setViewport(VIEW.x, VIEW.y, VIEW.w, VIEW.h)
      .setBackgroundColor(COLORS.background);
    const uiCam = this.cameras.add(0, 0, width, height);
    this.boardCam.ignore(this.uiLayer);
    uiCam.ignore(this.boardLayer);
    createTextures(this);
    // Background around the board view (the view has its own camera background).
    const bgAlpha = this.run ? 0.94 : 1;
    for (const [x, y, w, h] of [
      [0, 0, width, VIEW.y],
      [0, VIEW.y + VIEW.h, width, height - VIEW.y - VIEW.h],
      [0, VIEW.y, VIEW.x, VIEW.h],
      [VIEW.x + VIEW.w, VIEW.y, width - VIEW.x - VIEW.w, VIEW.h],
    ] as const) {
      this.ui(this.add.rectangle(x, y, w, h, COLORS.background, bgAlpha).setOrigin(0).setDepth(-1));
    }
    this.g = this.ui(this.add.graphics());
    this.uiFg = this.ui(this.add.graphics().setDepth(3));
    this.cardImgs = new SpritePool(this, 1, this.uiLayer);
    this.cardCrackImgs = new SpritePool(this, 1.1, this.uiLayer);
    this.cardBarrelImgs = new SpritePool(this, 1.2, this.uiLayer);
    this.boardG = this.add.graphics();
    this.tileImgs = new SpritePool(this, 1, this.boardLayer);
    this.crackImgs = new SpritePool(this, 1.1, this.boardLayer);
    this.barrelImgs = new SpritePool(this, 1.2, this.boardLayer);
    this.fg = this.add.graphics().setDepth(3);
    this.arcs = this.add.graphics().setDepth(0.5);
    this.lines = this.add.graphics().setDepth(1.15);
    this.boardLayer.add([this.boardG, this.arcs, this.lines, this.fg]);
    const text = { fontFamily: FONT.family, fontStyle: FONT.weight, color: COLORS.text };

    this.add
      .text(TITLE_X, 28, this.run?.title ?? 'Salvage!', {
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
          'New land: pick 1/2/3, R rotates, click places',
          'Pick a piece: click or 1/2/3',
          ...(this.run ? ['Repair Core: 4 · Reroll: 5', 'Upgrade instead: Shift+1/2/3'] : []),
          'Move: drag (or click, then click)',
          'Select: Shift+click · drag on empty space · Ctrl+A',
          'Undo / redo: Ctrl+Z / Ctrl+Shift+Z',
          'Rotate: R / right-click · Put back: Esc',
          'Scrap: drag onto SCRAP, or X (selection or hovered)',
          'Bridges: B · Arcs: V · Confirm: Enter',
          'Pan: WASD / arrows / middle-drag',
          'Zoom: wheel · Fit: F or Home',
          ...(DEBUG ? ['Debug: K destroys hovered tile · F2 offers land'] : []),
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
    this.scrapText = this.add
      .text(SCRAP.x + SCRAP.w / 2, SCRAP.y + SCRAP.h / 2, 'SCRAP', {
        ...text,
        fontSize: '20px',
        align: 'center',
      })
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

    this.adoptUi();
    this.newPause(
      this.run?.offers ?? rollOffers(this.rng, SANDBOX_POOL, OFFERS.count),
      this.run?.land ?? null,
    );
    this.bindInput();
  }

  /** Puts a UI object into the UI layer (drawn by the UI camera only). */
  private ui<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.uiLayer.add(obj);
    return obj;
  }

  /** Moves every object created directly on the scene into the UI layer. */
  private adoptUi(): void {
    for (const obj of [...this.children.list]) {
      if (obj !== (this.boardLayer as unknown) && obj !== (this.uiLayer as unknown)) this.ui(obj);
    }
  }

  private newPause(offers: PieceDef[], land: LandShape[] | null = null): void {
    this.session = startBuild(this.city, offers, land);
    this.pauseStartedAt = this.time.now;
    this.fitView();
    this.showOffers();
  }

  private showOffers(): void {
    for (const t of [...this.cardTexts, ...this.upgradeTexts]) t.destroy();
    const land = this.session.land;
    if (land) {
      // The land step comes first; the piece cards replace these once it is placed.
      this.upgradeTexts = [];
      this.cardTexts = land.map((shape, i) => {
        const r = cardRect(i);
        return this.add.text(r.x + 12, r.y + 10, `${i + 1}  Land: ${shape.name}`, {
          fontFamily: FONT.family,
          fontStyle: FONT.weight,
          fontSize: '13px',
          color: COLORS.text,
        });
      });
      this.adoptUi();
      return;
    }
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
    this.adoptUi();
  }

  /** Run-only options (upgrades, Repair Core, reroll) show once any land step is done. */
  private hasRunOptions(): boolean {
    return this.run !== null && this.session.offers.length > 0 && !this.session.land;
  }

  /** Clicks during the land step: pick a land card, place the held land, or let go of it. */
  private landPointerDown(p: Phaser.Input.Pointer): void {
    const s = this.session;
    if (s.heldLand && this.inView(p.x, p.y)) {
      const c = this.cellAt(p.x, p.y);
      if (placeLandAt(s, c.x, c.y)) {
        playSfx(this, 'grid-expand');
        this.showOffers();
      } else {
        this.showFlash('Land must touch the board without overlapping it');
      }
      return;
    }
    const card = this.cardAt(p.x, p.y);
    if (card >= 0 && pickLand(s, card)) playSfx(this, 'ui-pick');
    else cancelHeld(s);
  }

  // ---------------------------------------------------------------- layout

  // The board view's transform is computed here rather than read from the
  // camera matrix, which only updates when the camera renders.

  /** World point under a screen point, through the board camera. */
  private toWorld(x: number, y: number): { x: number; y: number } {
    const c = this.boardCam;
    return {
      x: c.scrollX + VIEW.w / 2 + (x - VIEW.x - VIEW.w / 2) / c.zoom,
      y: c.scrollY + VIEW.h / 2 + (y - VIEW.y - VIEW.h / 2) / c.zoom,
    };
  }

  private inView(x: number, y: number): boolean {
    return inRect(VIEW, x, y);
  }

  /** Grid cell under a screen point; NaN outside the board view. */
  private cellAt(x: number, y: number): { x: number; y: number } {
    if (!this.inView(x, y)) return { x: NaN, y: NaN };
    const p = this.toWorld(x, y);
    return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
  }

  /** Zooms the board view by `factor`, keeping the world point under (x, y) in place. */
  private zoomAt(x: number, y: number, factor: number): void {
    const c = this.boardCam;
    const before = this.toWorld(x, y);
    c.setZoom(Phaser.Math.Clamp(c.zoom * factor, BUILD_VIEW.minZoom, BUILD_VIEW.maxZoom));
    const after = this.toWorld(x, y);
    c.setScroll(c.scrollX + before.x - after.x, c.scrollY + before.y - after.y);
  }

  /** Fits the whole board, plus a margin of empty cells, into the view. */
  private fitView(): void {
    const cells = [...this.city.board].map(cellFromId);
    const m = BUILD_VIEW.fitMarginCells;
    const minX = Math.min(...cells.map((c) => c.x)) - m;
    const minY = Math.min(...cells.map((c) => c.y)) - m;
    const maxX = Math.max(...cells.map((c) => c.x)) + 1 + m;
    const maxY = Math.max(...cells.map((c) => c.y)) + 1 + m;
    const c = this.boardCam;
    const fit = Math.min(VIEW.w / ((maxX - minX) * CELL), VIEW.h / ((maxY - minY) * CELL));
    c.setZoom(Phaser.Math.Clamp(fit, BUILD_VIEW.minZoom, BUILD_VIEW.maxZoom));
    c.setScroll(((minX + maxX) / 2) * CELL - VIEW.w / 2, ((minY + maxY) / 2) * CELL - VIEW.h / 2);
  }

  /** WASD / arrows pan the board view, once pressed fresh in this pause. */
  private updatePan(dt: number): void {
    const down = (name: keyof typeof PAN_KEYS) =>
      !!this.panKeys[name]?.isDown && this.freshKeys.has(PAN_KEYS[name]);
    const dx = (down('right') || down('d') ? 1 : 0) - (down('left') || down('a') ? 1 : 0);
    const dy = (down('down') || down('s') ? 1 : 0) - (down('up') || down('w') ? 1 : 0);
    if (!dx && !dy) return;
    const c = this.boardCam;
    const step = (BUILD_VIEW.panPxPerSec * dt) / c.zoom;
    c.setScroll(c.scrollX + dx * step, c.scrollY + dy * step);
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
    const kb = this.input.keyboard;
    this.freshKeys = new Set();
    this.panKeys = {};
    for (const [name, code] of Object.entries(PAN_KEYS) as [keyof typeof PAN_KEYS, string][]) {
      const key = kb?.addKey(
        code
          .replace(/^Key/, '')
          .replace(/^Arrow/, '')
          .toUpperCase(),
      );
      if (key) this.panKeys[name] = key;
    }
    kb?.on('keydown', (e: KeyboardEvent) => {
      // Ctrl+A (select all) and other shortcuts must not start panning.
      if (!e.repeat && !e.ctrlKey && !e.metaKey) this.freshKeys.add(e.code);
    });
    kb?.on('keyup', (e: KeyboardEvent) => this.freshKeys.delete(e.code));

    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.inView(p.x, p.y) && dy !== 0) {
        this.zoomAt(p.x, p.y, dy < 0 ? BUILD_VIEW.wheelStep : 1 / BUILD_VIEW.wheelStep);
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointer = { x: p.x, y: p.y };
      const drag = this.midDrag;
      if (drag) {
        const z = this.boardCam.zoom;
        this.boardCam.setScroll(
          drag.scrollX - (p.x - drag.x) / z,
          drag.scrollY - (p.y - drag.y) / z,
        );
      }
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointer = { x: p.x, y: p.y };
      if (p.middleButtonDown()) {
        const c = this.boardCam;
        this.midDrag = { x: p.x, y: p.y, scrollX: c.scrollX, scrollY: c.scrollY };
        return;
      }
      if (p.rightButtonDown()) {
        this.rotateHeld();
        return;
      }
      if (this.session.land && !inRect(CONFIRM, p.x, p.y)) {
        this.landPointerDown(p);
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
        if (toggleUpgrade(this.session, up)) playSfx(this, 'ui-toggle');
        return;
      }
      const card = this.cardAt(p.x, p.y);
      const cell = this.cellAt(p.x, p.y);
      const tile = tileAt(this.city, cell.x, cell.y);
      if (card < 0 && tile && p.event.shiftKey) {
        // Shift+click adds the group to the selection or removes it.
        if (toggleSelectAt(this.session, cell.x, cell.y)) playSfx(this, 'ui-toggle');
        return;
      }
      if (card < 0 && !tile && this.inView(p.x, p.y)) {
        // Empty board space: start a box select (a plain click clears the selection).
        this.box = { x: p.x, y: p.y, add: p.event.shiftKey };
        return;
      }
      const picked =
        card >= 0 ? pickOffer(this.session, card) : pickUpAt(this.session, cell.x, cell.y);
      if (picked) playSfx(this, 'ui-pick');
      this.press = { x: p.x, y: p.y, picked };
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.midDrag && !p.middleButtonDown()) {
        this.midDrag = null;
        return;
      }
      const box = this.box;
      this.box = null;
      if (box) {
        this.finishBox(box, p.x, p.y);
        return;
      }
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

  /** Ends a box select: a drag selects the groups in the box, a plain click clears the selection. */
  private finishBox(box: { x: number; y: number; add: boolean }, x: number, y: number): void {
    const s = this.session;
    if (Math.hypot(x - box.x, y - box.y) <= DRAG_THRESHOLD) {
      if (!box.add) clearSelection(s);
      return;
    }
    const a = this.boxCell(box.x, box.y);
    const b = this.boxCell(x, y);
    selectBox(s, a.x, a.y, b.x, b.y, box.add);
    if (selectedGroups(s).length > 0) playSfx(this, 'ui-toggle');
  }

  /** The cell under a screen point for box select, clamped into the board view. */
  private boxCell(x: number, y: number): { x: number; y: number } {
    const cx = Phaser.Math.Clamp(x, VIEW.x, VIEW.x + VIEW.w - 1);
    const cy = Phaser.Math.Clamp(y, VIEW.y, VIEW.y + VIEW.h - 1);
    return this.cellAt(cx, cy);
  }

  private releaseHeld(x: number, y: number): void {
    const s = this.session;
    if (inRect(SCRAP, x, y)) {
      if (scrapHeld(s)) {
        playSfx(this, 'ui-scrap');
      } else {
        this.showFlash('The Core cannot be scrapped');
        cancelHeld(s);
      }
      return;
    }
    if (this.inView(x, y)) {
      const cell = this.cellAt(x, y);
      const groupId = s.held?.groupId;
      if (!dropAt(s, cell.x, cell.y)) {
        this.showFlash('Does not fit there');
      } else {
        playSfx(this, 'ui-place');
        if (groupId !== undefined) this.placed = { groupId, at: this.time.now };
      }
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
        if (s.land) {
          if (pickLand(s, index)) playSfx(this, 'ui-pick');
          break;
        }
        if (e.shiftKey) {
          if (this.hasRunOptions() && toggleUpgrade(s, index)) playSfx(this, 'ui-toggle');
          break;
        }
        if (s.heldOrigin?.kind === 'offer') cancelHeld(s);
        if (pickOffer(s, index)) playSfx(this, 'ui-pick');
        break;
      }
      case 'Digit4':
        if (this.hasRunOptions()) this.tryRepair();
        break;
      case 'Digit5':
        if (this.hasRunOptions()) this.tryReroll();
        break;
      case 'KeyR':
        this.rotateHeld();
        break;
      case 'KeyF':
      case 'Home':
        this.fitView();
        break;
      case 'Escape':
        if (s.held || s.heldLand) cancelHeld(s);
        else clearSelection(s);
        break;
      case 'KeyZ':
      case 'KeyY':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.undoRedo(e.code === 'KeyZ' && !e.shiftKey);
        }
        break;
      case 'KeyA':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          selectAll(s);
          playSfx(this, 'ui-toggle');
        }
        break;
      case 'KeyX':
      case 'Delete':
        this.scrapKey();
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
      case 'F2':
        // Debug: offer land in this pause.
        if (!DEBUG) break;
        e.preventDefault();
        if (offerLand(s, rollLand(this.rng, LAND_SHAPES))) this.showOffers();
        break;
      case 'KeyK':
        // Debug: destroy the hovered tile, as if enemies had.
        if (DEBUG) debugDestroyAt(s, cell.x, cell.y);
        break;
    }
  }

  /** Ctrl+Z undoes, Ctrl+Shift+Z / Ctrl+Y redoes a change of this pause (concept-v2.md §3.1). */
  private undoRedo(isUndo: boolean): void {
    const s = this.session;
    if (!(isUndo ? undo(s) : redo(s))) {
      this.showFlash(isUndo ? 'Nothing to undo' : 'Nothing to redo');
      return;
    }
    playSfx(this, 'ui-toggle');
    // Undo can bring back the land step or other offers.
    this.showOffers();
  }

  /** X / Delete: scrap the held group, else the selection, else the hovered group. */
  private scrapKey(): void {
    const s = this.session;
    const cell = this.cellAt(this.pointer.x, this.pointer.y);
    const done = s.held
      ? scrapHeld(s)
      : selectedGroups(s).length > 0
        ? scrapSelection(s) > 0
        : scrapAt(s, cell.x, cell.y);
    if (done) playSfx(this, 'ui-scrap');
    else if (s.held || tileAt(this.city, cell.x, cell.y)) {
      this.showFlash('The Core cannot be scrapped');
    }
  }

  /** Repair Core is pointless (and disabled) while the Core is at full HP. */
  private canRepair(): boolean {
    return (this.run?.coreHeal ?? 0) > 0 || this.session.repairChosen;
  }

  private tryRepair(): void {
    if (this.canRepair()) {
      if (toggleRepair(this.session)) playSfx(this, 'ui-toggle');
    } else {
      this.showFlash('The Core is at full HP');
    }
  }

  /** Rerolls left in the run, minus those spent (and not undone) this pause. */
  private rerollsLeftNow(): number {
    return this.rerollsLeft - this.session.rerollsUsed;
  }

  private tryReroll(): void {
    if (!this.run || !canReroll(this.session)) return;
    if (this.rerollsLeftNow() <= 0) {
      this.showFlash('No rerolls left');
      return;
    }
    reroll(this.session, this.run.reroll());
    this.showOffers();
    playSfx(this, 'ui-toggle');
  }

  private rotateHeld(): void {
    if (!this.session.held && !this.session.heldLand) return;
    rotate(this.session);
    playSfx(this, 'ui-rotate');
  }

  private tryConfirm(): void {
    const s = this.session;
    if (!confirmStatus(s).ok) {
      playSfx(this, 'ui-error');
      return;
    }
    playSfx(this, chosenUpgrade(s) ? 'upgrade' : 'ui-confirm');
    const durations = (this.registry.get('pauseDurations') as number[] | undefined) ?? [];
    durations.push((this.time.now - this.pauseStartedAt) / 1000);
    this.registry.set('pauseDurations', durations);
    if (this.run) {
      this.run.done({
        repair: s.repairChosen,
        scrapped: s.scrapped,
        upgrade: chosenUpgrade(s),
        rerollsUsed: s.rerollsUsed,
      });
      return;
    }
    this.newPause(rollOffers(this.rng, SANDBOX_POOL, OFFERS.count));
  }

  /** A short message in the status panel; every one of them reports a refused action. */
  private showFlash(text: string): void {
    this.flash = { text, until: this.time.now + 1200 };
    playSfx(this, 'ui-error');
  }

  // ---------------------------------------------------------------- render

  override update(_time: number, delta: number): void {
    this.updatePan(delta / 1000);
    for (const g of [this.g, this.uiFg, this.boardG, this.fg, this.arcs, this.lines]) g.clear();
    this.syn = computeSynergies(this.city);
    const pools = [
      this.tileImgs,
      this.crackImgs,
      this.barrelImgs,
      this.cardImgs,
      this.cardCrackImgs,
      this.cardBarrelImgs,
    ];
    for (const pool of pools) pool.begin();
    this.drawGrid();
    this.drawCards();
    this.drawPanels();
    this.drawHeld();
    this.drawHeldLand();
    for (const pool of pools) pool.end();
    this.updateTooltip();
    this.updateStatus();
  }

  /**
   * One tile from the shared textures: body + icon, cracks, barrel along its
   * facing. In the board view (world coordinates) or, with `ui`, on screen.
   */
  private drawTileImage(
    x: number,
    y: number,
    cs: number,
    t: Pick<PlacedTile, 'type' | 'facing' | 'online'> & { hp?: number; maxHp?: number },
    alpha = 1,
    scale = 1,
    ui = false,
  ): void {
    const [tileImgs, crackImgs, barrelImgs] = ui
      ? [this.cardImgs, this.cardCrackImgs, this.cardBarrelImgs]
      : [this.tileImgs, this.crackImgs, this.barrelImgs];
    const hpFrac = t.hp !== undefined && t.maxHp ? t.hp / t.maxHp : 1;
    const a = alpha * damageAlpha(hpFrac, this.time.now);
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    const ds = cs * scale;
    tileImgs.add(cx, cy, TEX.tile(t.type, !t.online)).setDisplaySize(ds, ds).setAlpha(a);
    if (showsCracks(hpFrac)) {
      crackImgs.add(cx, cy, TEX.cracks).setDisplaySize(ds, ds).setAlpha(a);
    }
    const barrel = barrelFor(t.type);
    if (barrel) {
      const img = barrelImgs
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
    g.lineStyle(2 * this.px(), TILES[t.type].color, ARC_LINE_ALPHA);
    g.slice(cx, cy, r, mid - half, mid + half, false);
    g.strokePath();
  }

  /** One screen pixel in board-view world units (line widths stay constant on screen). */
  private px(): number {
    return 1 / this.boardCam.zoom;
  }

  /**
   * The board (filled cells, strong outline) over faint lines across the
   * visible area, then the tiles (concept-v2.md §3.3).
   */
  private drawBoard(): void {
    const g = this.boardG;
    const cs = CELL;
    const px = this.px();
    const tl = this.toWorld(VIEW.x, VIEW.y);
    const br = this.toWorld(VIEW.x + VIEW.w, VIEW.y + VIEW.h);
    const x0 = Math.floor(tl.x / cs);
    const y0 = Math.floor(tl.y / cs);
    const x1 = Math.ceil(br.x / cs);
    const y1 = Math.ceil(br.y / cs);
    g.lineStyle(px, COLORS.bgGridLine, 1);
    for (let x = x0; x <= x1; x++) g.lineBetween(x * cs, y0 * cs, x * cs, y1 * cs);
    for (let y = y0; y <= y1; y++) g.lineBetween(x0 * cs, y * cs, x1 * cs, y * cs);
    const board = this.city.board;
    g.fillStyle(COLORS.gridCell, 1);
    g.lineStyle(px, COLORS.gridLine, 1);
    for (const id of board) {
      const { x, y } = cellFromId(id);
      if (x < x0 - 1 || x > x1 || y < y0 - 1 || y > y1) continue;
      g.fillRect(x * cs, y * cs, cs, cs);
      g.strokeRect(x * cs, y * cs, cs, cs);
    }
    g.lineStyle(3 * px, COLORS.boardEdge, 1);
    for (const id of board) {
      const { x, y } = cellFromId(id);
      const off = (dx: number, dy: number) => !board.has(cellId(x + dx, y + dy));
      if (off(0, -1)) g.lineBetween(x * cs, y * cs, (x + 1) * cs, y * cs);
      if (off(0, 1)) g.lineBetween(x * cs, (y + 1) * cs, (x + 1) * cs, (y + 1) * cs);
      if (off(-1, 0)) g.lineBetween(x * cs, y * cs, x * cs, (y + 1) * cs);
      if (off(1, 0)) g.lineBetween((x + 1) * cs, y * cs, (x + 1) * cs, (y + 1) * cs);
    }
  }

  private drawGrid(): void {
    const fg = this.fg;
    const r = { x: 0, y: 0 };
    const cs = CELL;
    const px = this.px();
    const city = this.city;
    this.drawBoard();

    // Hovered group: what a click would pick up; its arcs are shown too.
    let hoveredGroup = -1;
    if (!this.session.held) {
      const c = this.cellAt(this.pointer.x, this.pointer.y);
      hoveredGroup = tileAt(city, c.x, c.y)?.groupId ?? -1;
    }

    const bridges = this.showBridges ? findBridges(city) : new Set<number>();
    for (const t of city.tiles) {
      const tx = r.x + t.gx * cs;
      const ty = r.y + t.gy * cs;
      this.drawTileImage(tx, ty, cs, t, 1, this.bounceScale(t.groupId));
      if (this.showArcs || t.groupId === hoveredGroup)
        this.drawArc(tx + cs / 2, ty + cs / 2, cs, t);
      if (!t.online) {
        fg.lineStyle(2 * px, COLORS.invalid, 1);
        fg.strokeRect(tx + px, ty + px, cs - 2 * px, cs - 2 * px);
      }
      if (bridges.has(t.id)) {
        fg.lineStyle(3 * px, COLORS.bridge, 1);
        fg.strokeCircle(tx + cs / 2, ty + cs / 2, cs * 0.34);
      }
    }
    drawSynergyLines(this.lines, this.syn, cs, r.x, r.y);
    this.drawGroupOutlines(city.tiles, r.x, r.y, cs, COLORS.groupOutline, 0.45, 2 * px);
    const selected = new Set(selectedGroups(this.session));
    if (selected.size > 0) {
      const tiles = city.tiles.filter((t) => selected.has(t.groupId));
      this.drawGroupOutlines(tiles, r.x, r.y, cs, COLORS.selection, 1, 4 * px);
    }
    this.drawBox();
    if (hoveredGroup >= 0) {
      const group = city.tiles.filter((t) => t.groupId === hoveredGroup);
      this.drawGroupOutlines(group, r.x, r.y, cs, COLORS.hover, 1, 3 * px);
    }
  }

  /** The box select rectangle, while dragging on empty space. */
  private drawBox(): void {
    if (!this.box) return;
    const a = this.toWorld(this.box.x, this.box.y);
    const b = this.toWorld(
      Phaser.Math.Clamp(this.pointer.x, VIEW.x, VIEW.x + VIEW.w),
      Phaser.Math.Clamp(this.pointer.y, VIEW.y, VIEW.y + VIEW.h),
    );
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    this.fg.fillStyle(COLORS.selection, 0.12);
    this.fg.fillRect(x, y, w, h);
    this.fg.lineStyle(2 * this.px(), COLORS.selection, 0.9);
    this.fg.strokeRect(x, y, w, h);
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
    const cs = CELL;
    const w = this.px();
    const { x: px, y: py } = this.pointer;

    if (this.inView(px, py)) {
      const c = this.cellAt(px, py);
      const preview = previewAt(s, c.x, c.y);
      if (!preview) return;
      // A soft shadow under the held tiles, so they read as lifted.
      this.boardG.fillStyle(COLORS.ink, 0.15);
      for (const cell of preview.cells) {
        this.boardG.fillRect(cell.x * cs + 4 * w, cell.y * cs + 4 * w, cs, cs);
      }
      s.held.tiles.forEach((t, i) => {
        const cell = preview.cells[i];
        if (!cell) return;
        const x = cell.x * cs;
        const y = cell.y * cs;
        this.drawTileImage(x, y, cs, { ...t, online: true }, 0.75);
        this.drawArc(x + cs / 2, y + cs / 2, cs, t);
        const bad = preview.problems.has(cellKey(cell.x, cell.y));
        fg.lineStyle(3 * w, bad ? COLORS.invalid : COLORS.valid, 1);
        fg.strokeRect(x + 2 * w, y + 2 * w, cs - 4 * w, cs - 4 * w);
      });
      return;
    }

    // Outside the board view: follow the pointer on screen, at the view's scale.
    const ucs = cs * this.boardCam.zoom;
    const ox = px - (s.held.anchor.x + 0.5) * ucs;
    const oy = py - (s.held.anchor.y + 0.5) * ucs;
    for (const t of s.held.tiles) {
      this.drawTileImage(
        ox + t.gx * ucs,
        oy + t.gy * ucs,
        ucs,
        { ...t, online: true },
        0.6,
        1,
        true,
      );
    }
    if (inRect(SCRAP, px, py)) {
      this.uiFg.lineStyle(3, COLORS.invalid, 1);
      this.uiFg.strokeRect(SCRAP.x, SCRAP.y, SCRAP.w, SCRAP.h);
    }
  }

  private drawCards(): void {
    const g = this.g;
    const s = this.session;
    if (s.land) {
      this.drawLandCards(s.land);
      return;
    }
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
          1,
          true,
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

  /** The land shapes on offer, drawn as board cells; the held one highlighted. */
  private drawLandCards(land: readonly LandShape[]): void {
    const g = this.g;
    land.forEach((shape, i) => {
      const r = cardRect(i);
      const held = this.session.heldLand?.index === i;
      const hovered = inRect(r, this.pointer.x, this.pointer.y);
      g.fillStyle(held ? COLORS.selected : COLORS.panel, 1);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
      g.lineStyle(2, held ? COLORS.valid : hovered ? COLORS.hover : COLORS.panelBorder, 1);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
      const w = Math.max(...shape.cells.map((c) => c.x)) + 1;
      const h = Math.max(...shape.cells.map((c) => c.y)) + 1;
      const room = r.h - CARDS.previewTop - CARDS.previewPad;
      const cs = Math.min(CARDS.cell, Math.floor(room / h));
      const ox = r.x + (r.w - w * cs) / 2;
      const oy = r.y + CARDS.previewTop + (room - h * cs) / 2;
      g.fillStyle(COLORS.gridCell, 1);
      g.lineStyle(1, COLORS.boardEdge, 1);
      for (const c of shape.cells) {
        g.fillRect(ox + c.x * cs, oy + c.y * cs, cs, cs);
        g.strokeRect(ox + c.x * cs, oy + c.y * cs, cs, cs);
      }
    });
  }

  /** The held land over the board view: green where it fits, all red where not. */
  private drawHeldLand(): void {
    const s = this.session;
    if (!s.heldLand || !this.inView(this.pointer.x, this.pointer.y)) return;
    const c = this.cellAt(this.pointer.x, this.pointer.y);
    const preview = landPreviewAt(s, c.x, c.y);
    if (!preview) return;
    const g = this.fg;
    const px = this.px();
    const ok = preview.problems.size === 0;
    const color = ok ? COLORS.valid : COLORS.invalid;
    for (const cell of preview.cells) {
      const strong = preview.problems.has(cellKey(cell.x, cell.y));
      g.fillStyle(color, strong ? 0.6 : 0.3);
      g.fillRect(cell.x * CELL, cell.y * CELL, CELL, CELL);
      g.lineStyle(2 * px, color, 1);
      g.strokeRect(cell.x * CELL + px, cell.y * CELL + px, CELL - 2 * px, CELL - 2 * px);
    }
  }

  private drawPanels(): void {
    const g = this.g;
    const s = this.session;
    const scrapCount = s.held
      ? s.heldOrigin?.kind === 'grid'
        ? heldGroupIds(s.held).length
        : 1
      : selectedGroups(s).length;
    this.scrapText.setText(scrapCount > 1 ? `SCRAP\n${scrapCount} pieces` : 'SCRAP');
    g.lineStyle(2, COLORS.panelBorder, 1);
    g.strokeRoundedRect(SCRAP.x, SCRAP.y, SCRAP.w, SCRAP.h, 8);

    const runOptions = this.hasRunOptions();
    this.repairText.setVisible(runOptions);
    this.rerollText.setVisible(runOptions);
    if (runOptions && this.run) {
      const repairOn = (!s.offerTaken || s.repairChosen) && !s.held && this.canRepair();
      const rerollOn = canReroll(s) && this.rerollsLeftNow() > 0;
      this.drawButton(REPAIR, repairOn, s.repairChosen);
      this.drawButton(REROLL, rerollOn, false);
      this.repairText
        .setText(`4  Repair Core  +${Math.round(this.run.coreHeal)} HP`)
        .setAlpha(repairOn ? 1 : 0.4);
      this.rerollText
        .setText(`5  Reroll  (${this.rerollsLeftNow()} left)`)
        .setAlpha(rerollOn ? 1 : 0.4);
    }

    const status = confirmStatus(s);
    const hovered = status.ok && inRect(CONFIRM, this.pointer.x, this.pointer.y);
    g.fillStyle(status.ok ? (hovered ? COLORS.confirmHover : COLORS.confirm) : COLORS.disabled, 1);
    g.fillRoundedRect(CONFIRM.x, CONFIRM.y, CONFIRM.w, CONFIRM.h, 8);
    this.confirmText.setAlpha(status.ok ? 1 : 0.4);
    this.reasonText.setText(
      status.block === 'land'
        ? 'Place the new land first: it must touch the board'
        : status.block === 'holding'
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
    const i = s.held || s.land ? -1 : this.cardAt(this.pointer.x, this.pointer.y);
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
      `Board ${city.board.size} cells  ·  ${city.tiles.length} tiles  ·  speed ${Math.round(this.syn.speedFactor * 100)}%`,
      `Undo ${this.session.history.length} · Redo ${this.session.future.length}`,
      `Bridges view: ${this.showBridges ? 'ON' : 'off'}  ·  Arcs: ${this.showArcs ? 'ON' : 'off'}`,
      levelSummary(city),
      `Chains: ${this.syn.chains.length}`,
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
