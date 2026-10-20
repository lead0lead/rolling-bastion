import Phaser from 'phaser';
import { CAMERA, GRID, OFFERS, SIM } from '../config/balance';
import { ENEMY_TYPES } from '../config/enemies';
import { PHASE2_POOL } from '../config/pieces';
import { DEBUG, nextSeed } from '../debug/flags';
import { barrelFor } from '../render/icons';
import { drawSynergyLines } from '../render/lines';
import { BG_GRID_SIZE, createTextures, TEX } from '../render/textures';
import { damageAlpha, showsCracks, SpritePool } from '../render/tiles';
import {
  debugAddTime,
  debugFillGrid,
  debugKillAll,
  debugLayoutJson,
  debugLevelUp,
  debugSpawn,
} from '../sim/debugActions';
import { expandGrid, facingAngle } from '../sim/grid';
import { applyBuildResult, repairCoreAmount, rollOffers, scrapRefund } from '../sim/progression';
import { step, type MoveInput } from '../sim/step';
import { bossEnraged, cityChanged, createWorld, type CityCache, type World } from '../sim/world';
import type { BuildSceneData } from './BuildScene';
import type { SummaryData } from './SummaryScene';

/** Screen shake when a tile is destroyed (duration ms, intensity). */
const TILE_LOSS_SHAKE = { ms: 120, intensity: 0.004 } as const;
/** How long an enemy flashes white after a hit (s). */
const HIT_FLASH = 0.05;
const DEBUG_SPAWN_COUNT = 50;
/** Barrel turn smoothing rate (1/s); barrels ease toward the weapon's aim. */
const BARREL_TURN_RATE = 18;
/** Tint for barrels of offline weapons. */
const OFFLINE_TINT = 0x8a93a6;
/** Tint of the enraged boss. */
const ENRAGE_TINT = 0xff6060;
/** Shell blasts: fade time (s) and colour. */
const BLAST_FADE = 0.3;
const BLAST_COLOR = 0xffa040;

/** Shared with the HUD scene through the registry. */
export interface RunUiState {
  world: World;
  debugOverlay: boolean;
  debugEnemy: string;
  /** Smoothed ms per frame spent in the simulation and in building the frame's draw data. */
  simMs: number;
  drawMs: number;
}

/** Smoothing factor for the overlay timings. */
const TIMING_SMOOTHING = 0.05;

type MoveKeys = Record<
  'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd',
  Phaser.Input.Keyboard.Key
>;

/** One run: driving, fighting, levelling (concept.md §2, Phase 2). */
export class RunScene extends Phaser.Scene {
  private world!: World;
  private ui!: RunUiState;
  private acc = 0;
  private buildOpen = false;
  private keys!: MoveKeys;
  private bg!: Phaser.GameObjects.TileSprite;
  private tileSprites!: SpritePool;
  private crackSprites!: SpritePool;
  private barrelSprites!: SpritePool;
  /** Chain links and filled lines, in grid-local coordinates; redrawn when the city changes. */
  private linesGfx!: Phaser.GameObjects.Graphics;
  private linesFor: CityCache | null = null;
  /** Current drawn barrel angle per weapon tile id. */
  private barrelAngles = new Map<number, number>();
  private enemySprites!: SpritePool;
  private shotSprites!: SpritePool;
  private gemSprites!: SpritePool;
  private blastGfx!: Phaser.GameObjects.Graphics;
  private blasts: { x: number; y: number; r: number; at: number }[] = [];
  private cam = { x: 0, y: 0, zoom: 1 };
  private debugEnemyIndex = 0;

  constructor() {
    super('Run');
  }

  create(): void {
    createTextures(this);
    this.world = createWorld(nextSeed());
    this.ui = {
      world: this.world,
      debugOverlay: false,
      debugEnemy: ENEMY_TYPES[0] ?? '',
      simMs: 0,
      drawMs: 0,
    };
    this.registry.set('run', this.ui);
    this.acc = 0;
    this.buildOpen = false;

    this.bg = this.add.tileSprite(0, 0, 10, 10, TEX.bgGrid).setOrigin(0).setDepth(-10);
    this.gemSprites = new SpritePool(this, 1);
    this.tileSprites = new SpritePool(this, 2);
    this.crackSprites = new SpritePool(this, 2.5);
    this.barrelSprites = new SpritePool(this, 2.6);
    this.linesGfx = this.add.graphics().setDepth(2.55);
    this.linesFor = null;
    this.barrelAngles.clear();
    this.enemySprites = new SpritePool(this, 3);
    this.shotSprites = new SpritePool(this, 4);
    this.blastGfx = this.add.graphics().setDepth(3.5);
    this.blasts = [];

    this.cam = { x: this.world.x, y: this.world.y, zoom: this.targetZoom() };
    this.cameras.main.setZoom(this.cam.zoom).centerOn(this.cam.x, this.cam.y);

    const kb = this.input.keyboard;
    if (!kb) throw new Error('keyboard input unavailable');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.UP,
      down: K.DOWN,
      left: K.LEFT,
      right: K.RIGHT,
      w: K.W,
      a: K.A,
      s: K.S,
      d: K.D,
    }) as MoveKeys;
    kb.on('keydown', (e: KeyboardEvent) => this.onDebugKey(e));

    this.scene.launch('Hud');
  }

  override update(_time: number, delta: number): void {
    const w = this.world;
    if (w.over) {
      this.endRun();
      return;
    }
    this.acc += Math.min(delta / 1000, SIM.maxFrame);
    const input = this.moveInput();
    const t0 = performance.now();
    while (this.acc >= SIM.dt) {
      step(w, input, SIM.dt);
      this.acc -= SIM.dt;
      // Stop at a level-up or expansion so the build pause opens on this exact tick.
      if (w.pendingLevelUps > 0 || w.pendingExpansions > 0 || w.over) {
        this.acc = 0;
        break;
      }
    }
    const t1 = performance.now();
    this.render(this.acc / SIM.dt, delta / 1000);
    const t2 = performance.now();
    this.ui.simMs += (t1 - t0 - this.ui.simMs) * TIMING_SMOOTHING;
    this.ui.drawMs += (t2 - t1 - this.ui.drawMs) * TIMING_SMOOTHING;
    if (w.over) return;
    if (w.pendingExpansions > 0) this.openBuild('expand');
    else if (w.pendingLevelUps > 0) this.openBuild('level');
  }

  private moveInput(): MoveInput {
    const k = this.keys;
    return {
      x: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      y: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
    };
  }

  // ------------------------------------------------------------ build pause

  private openBuild(kind: 'level' | 'expand'): void {
    if (this.buildOpen) return;
    this.buildOpen = true;
    const w = this.world;
    const data: BuildSceneData = {
      city: w.city,
      offers: kind === 'level' ? rollOffers(w.rng, PHASE2_POOL, OFFERS.count) : [],
      title:
        kind === 'level' ? `Salvage!  Level ${w.level - w.pendingLevelUps + 1}` : 'GRID EXPANDED',
      coreHeal: repairCoreAmount(w),
      rerollsLeft: w.rerolls,
      refundPerScrap: scrapRefund(w),
      reroll: () => {
        if (w.rerolls <= 0) return null;
        w.rerolls--;
        return rollOffers(w.rng, PHASE2_POOL, OFFERS.count);
      },
      done: (result) => {
        if (kind === 'level') w.pendingLevelUps--;
        else w.pendingExpansions = Math.max(0, w.pendingExpansions - 1);
        applyBuildResult(w, result);
        this.scene.stop('Build');
        this.input.keyboard?.resetKeys();
        this.buildOpen = false;
        this.scene.resume();
      },
    };
    this.scene.pause();
    this.scene.launch('Build', data);
    this.scene.bringToTop('Build');
  }

  private endRun(): void {
    const w = this.world;
    const summary: SummaryData = { time: w.time, kills: w.kills, level: w.level, won: w.won };
    this.scene.stop('Hud');
    this.scene.start('Summary', summary);
  }

  // ------------------------------------------------------------------ debug

  private onDebugKey(e: KeyboardEvent): void {
    if (!DEBUG || this.buildOpen) return;
    const w = this.world;
    switch (e.code) {
      case 'F1':
        e.preventDefault();
        this.ui.debugOverlay = !this.ui.debugOverlay;
        break;
      case 'F2':
        e.preventDefault();
        if (expandGrid(w.city)) {
          cityChanged(w);
          w.pendingExpansions++;
          w.expandedAt = w.time;
        }
        break;
      case 'F3':
        e.preventDefault();
        debugFillGrid(w, 'gatling');
        break;
      case 'KeyG':
        debugLevelUp(w);
        break;
      case 'KeyT':
        debugAddTime(w, 60);
        break;
      case 'KeyE':
        debugSpawn(w, this.ui.debugEnemy as (typeof ENEMY_TYPES)[number], DEBUG_SPAWN_COUNT);
        break;
      case 'BracketLeft':
      case 'BracketRight': {
        const n = ENEMY_TYPES.length;
        this.debugEnemyIndex = (this.debugEnemyIndex + (e.code === 'BracketLeft' ? n - 1 : 1)) % n;
        this.ui.debugEnemy = ENEMY_TYPES[this.debugEnemyIndex] ?? this.ui.debugEnemy;
        break;
      }
      case 'KeyI':
        w.godMode = !w.godMode;
        break;
      case 'KeyK':
        debugKillAll(w);
        break;
      case 'KeyP':
        console.log(debugLayoutJson(w));
        break;
    }
  }

  // ----------------------------------------------------------------- render

  /** Eases a barrel's drawn angle toward `target` along the shorter way round. */
  private turnBarrel(id: number, target: number, frameDt: number): number {
    const current = this.barrelAngles.get(id) ?? target;
    const diff = Phaser.Math.Angle.Wrap(target - current);
    const next = current + diff * (1 - Math.exp(-BARREL_TURN_RATE * frameDt));
    this.barrelAngles.set(id, next);
    return next;
  }

  private targetZoom(): number {
    const citySpan = this.world.city.gridSize * GRID.cellPx + 2 * CAMERA.marginPx;
    return Math.min(CAMERA.maxZoom, this.scale.height / citySpan);
  }

  private render(alpha: number, frameDt: number): void {
    const w = this.world;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const ox = lerp(w.px, w.x);
    const oy = lerp(w.py, w.y);

    // Camera: follow the city centre with light smoothing; zoom out with the grid.
    const c = w.cache;
    const tx = ox + (c.minRx + c.maxRx) / 2;
    const ty = oy + (c.minRy + c.maxRy) / 2;
    const follow = 1 - Math.exp(-CAMERA.followRate * frameDt);
    const zoomK = 1 - Math.exp(-CAMERA.zoomRate * frameDt);
    this.cam.x += (tx - this.cam.x) * follow;
    this.cam.y += (ty - this.cam.y) * follow;
    this.cam.zoom += (this.targetZoom() - this.cam.zoom) * zoomK;
    const camera = this.cameras.main;
    camera.setZoom(this.cam.zoom).centerOn(this.cam.x, this.cam.y);
    w.viewRadius = Math.hypot(this.scale.width, this.scale.height) / 2 / this.cam.zoom;

    const view = camera.worldView;
    const pad = BG_GRID_SIZE * 2;
    this.bg
      .setPosition(view.x - pad, view.y - pad)
      .setSize(view.width + pad * 2, view.height + pad * 2)
      .setTilePosition(view.x - pad, view.y - pad);

    // City tiles: pre-rendered textures as pooled sprites.
    const cell = GRID.cellPx;
    const left = ox - (w.city.gridSize * cell) / 2;
    const top = oy - (w.city.gridSize * cell) / 2;
    this.tileSprites.begin();
    this.crackSprites.begin();
    this.barrelSprites.begin();
    for (const t of w.city.tiles) {
      const x = left + (t.gx + 0.5) * cell;
      const y = top + (t.gy + 0.5) * cell;
      const hpFrac = t.hp / t.maxHp;
      const alpha = damageAlpha(hpFrac, this.time.now);
      this.tileSprites
        .add(x, y, TEX.tile(t.type, !t.online))
        .setDisplaySize(cell, cell)
        .setAlpha(alpha);
      if (showsCracks(hpFrac)) {
        this.crackSprites.add(x, y, TEX.cracks).setDisplaySize(cell, cell).setAlpha(alpha);
      }
      const barrel = barrelFor(t.type);
      if (barrel) {
        const rest = facingAngle(t.facing);
        const aim = t.online ? (w.weapons.get(t.id)?.aim ?? rest) : rest;
        const img = this.barrelSprites
          .add(x, y, TEX.barrel(barrel))
          .setDisplaySize(cell, cell)
          .setRotation(this.turnBarrel(t.id, aim, frameDt))
          .setAlpha(alpha);
        if (t.online) img.clearTint();
        else img.setTint(OFFLINE_TINT);
      }
    }
    this.barrelSprites.end();
    this.tileSprites.end();
    this.crackSprites.end();
    if (this.linesFor !== w.cache) {
      this.linesFor = w.cache;
      this.linesGfx.clear();
      drawSynergyLines(this.linesGfx, w.cache.syn, w.city.gridSize, cell, 0, 0);
    }
    this.linesGfx.setPosition(left, top);

    // Enemies, projectiles, gems.
    this.enemySprites.begin();
    for (const e of w.enemies) {
      const img = this.enemySprites.add(
        lerp(e.px, e.x),
        lerp(e.py, e.y),
        TEX.enemy(e.type, e.elite),
      );
      if (w.time - e.hitTime < HIT_FLASH) img.setTintFill(0xffffff);
      else if (e === w.boss && bossEnraged(w)) img.setTint(ENRAGE_TINT);
      else img.clearTint();
    }
    this.enemySprites.end();

    this.shotSprites.begin();
    for (const p of w.projectiles) {
      const key = p.blast > 0 ? TEX.shell : p.source === 'cannon' ? TEX.shotBig : TEX.shotSmall;
      this.shotSprites.add(lerp(p.px, p.x), lerp(p.py, p.y), key);
    }
    for (const s of w.enemyShots) {
      this.shotSprites.add(lerp(s.px, s.x), lerp(s.py, s.y), TEX.enemyShot);
    }
    this.shotSprites.end();
    this.drawBlasts(w);

    this.gemSprites.begin();
    for (const gem of w.gems) this.gemSprites.add(gem.x, gem.y, TEX.gem);
    this.gemSprites.end();

    for (const ev of w.events) {
      if (ev.kind === 'tileDestroyed') camera.shake(TILE_LOSS_SHAKE.ms, TILE_LOSS_SHAKE.intensity);
      if (ev.kind === 'blast') this.blasts.push({ x: ev.x, y: ev.y, r: ev.radius, at: w.time });
    }
    w.events.length = 0;
  }

  /** Fading rings where shells landed (game time, so they freeze with the pause). */
  private drawBlasts(w: World): void {
    const g = this.blastGfx;
    g.clear();
    let n = 0;
    for (const b of this.blasts) {
      const age = (w.time - b.at) / BLAST_FADE;
      if (age >= 1) continue;
      this.blasts[n++] = b;
      g.fillStyle(BLAST_COLOR, 0.35 * (1 - age));
      g.fillCircle(b.x, b.y, b.r * (0.6 + 0.4 * age));
      g.lineStyle(2, BLAST_COLOR, 0.8 * (1 - age));
      g.strokeCircle(b.x, b.y, b.r);
    }
    this.blasts.length = n;
  }
}
