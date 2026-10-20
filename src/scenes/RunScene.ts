import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { CAMERA, GRID, OFFERS, SIM } from '../config/balance';
import { ENEMIES, ENEMY_TYPES } from '../config/enemies';
import type { SoundKey } from '../config/audio';
import { FX } from '../config/fx';
import { PHASE3_POOL } from '../config/pieces';
import { TILES, type TileType } from '../config/tiles';
import { DEBUG, nextSeed } from '../debug/flags';
import { barrelFor } from '../render/icons';
import { drawSynergyLines } from '../render/lines';
import { COLORS } from '../render/palette';
import { Particles } from '../render/particles';
import { BG_GRID_SIZE, createTextures, TEX } from '../render/textures';
import { damageAlpha, outlineOf, showsCracks, SpritePool } from '../render/tiles';
import {
  debugAddTime,
  debugFillGrid,
  debugHurtBoss,
  debugKillAll,
  debugLayoutJson,
  debugLevelUp,
  debugSpawn,
} from '../sim/debugActions';
import { chargePath } from '../sim/boss';
import { expandGrid, facingAngle } from '../sim/grid';
import { applyBuildResult, repairCoreAmount, rollRunOffers, scrapRefund } from '../sim/progression';
import { step, type MoveInput } from '../sim/step';
import {
  bossEnraged,
  cityChanged,
  createWorld,
  type CityCache,
  type Enemy,
  type World,
} from '../sim/world';
import type { BuildSceneData } from './BuildScene';
import type { SummaryData } from './SummaryScene';

const DEBUG_SPAWN_COUNT = 50;
/** Share of the boss's max HP the H debug key takes. */
const DEBUG_BOSS_HURT = 0.35;
/** Barrel turn smoothing rate (1/s); barrels ease toward the weapon's aim. */
const BARREL_TURN_RATE = 18;
/** Tint for barrels of offline weapons. */
const OFFLINE_TINT = COLORS.offline;
/** Which sound a weapon type's volley makes. */
const SHOT_SOUND: Partial<Record<TileType, SoundKey>> = {
  core: 'shot-gatling',
  gatling: 'shot-gatling',
  cannon: 'shot-cannon',
  mortar: 'shot-mortar',
};
/** Colour of the boss charge telegraph. */
const CHARGE_COLOR = COLORS.charge;
/** Tint of the enraged boss. */
const ENRAGE_TINT = 0xff6060;
/** Shell blasts: fade time (s) and colour. */
const BLAST_FADE = 0.3;
const BLAST_COLOR = COLORS.blast;

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
  private pulseGfx!: Phaser.GameObjects.Graphics;
  private pulseClock = 0;
  private particles!: Particles;
  private blasts: { x: number; y: number; r: number; at: number }[] = [];
  /** Render-only wobble phase per (pooled) enemy object. */
  private wobblePhases = new WeakMap<Enemy, number>();
  /** Last tally values seen, to play a sound when they grow. */
  private seen = {
    shots: {} as Partial<Record<TileType, number>>,
    gems: 0,
    enemyShots: 0,
    boss: false,
    charge: 'walk' as string,
  };
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
    this.pulseGfx = this.add.graphics().setDepth(1.9);
    this.particles = new Particles(this, 3.6, TEX.particleDot, TEX.particleSquare);
    this.blasts = [];
    this.seen = { shots: {}, gems: 0, enemyShots: 0, boss: false, charge: 'walk' };

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
    if (kind === 'level') playSfx(this, 'level-up');
    const w = this.world;
    const data: BuildSceneData = {
      city: w.city,
      offers: kind === 'level' ? rollRunOffers(w.rng, PHASE3_POOL, OFFERS.count, w.time) : [],
      title:
        kind === 'level' ? `Salvage!  Level ${w.level - w.pendingLevelUps + 1}` : 'GRID EXPANDED',
      coreHeal: repairCoreAmount(w),
      rerollsLeft: w.rerolls,
      refundPerScrap: scrapRefund(w),
      reroll: () => {
        if (w.rerolls <= 0) return null;
        w.rerolls--;
        return rollRunOffers(w.rng, PHASE3_POOL, OFFERS.count, w.time);
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
      case 'KeyH':
        debugHurtBoss(w, DEBUG_BOSS_HURT);
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

  /** A random but stable wobble phase per enemy, so blobs don't pulse in sync. */
  private wobblePhase(e: Enemy): number {
    let phase = this.wobblePhases.get(e);
    if (phase === undefined) {
      phase = Math.random() * Math.PI * 2;
      this.wobblePhases.set(e, phase);
    }
    return phase;
  }

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
    const coreScale =
      1 + FX.corePulse.amount * Math.sin(this.time.now * 0.001 * FX.corePulse.speed);
    const pulse = (t: { type: string; online: boolean }) =>
      t.type === 'core' && t.online ? coreScale : 1;
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
        .setDisplaySize(cell * pulse(t), cell * pulse(t))
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
        e === w.boss ? TEX.boss(w.bossState.phase) : TEX.enemy(e.type, e.elite),
      );
      const sinceHit = w.time - e.hitTime;
      if (sinceHit < FX.hitFlash) img.setTintFill(0xffffff);
      else if (e === w.boss && bossEnraged(w)) img.setTint(ENRAGE_TINT);
      else img.clearTint();
      // Idle wobble plus a squash that springs back after a hit (concept.md §6).
      const wob = Math.sin(this.time.now * 0.001 * FX.wobbleSpeed + this.wobblePhase(e));
      const squash =
        sinceHit < FX.squashTime
          ? FX.squashAmount *
            (1 - sinceHit / FX.squashTime) *
            (e === w.boss ? FX.bossSquashFactor : 1)
          : 0;
      const base = 1 / FX.enemyTexScale;
      img.setScale(
        base * (1 + FX.wobbleAmount * wob + squash),
        base * (1 - FX.wobbleAmount * wob - squash),
      );
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
    const sparkle = this.time.now * 0.001 * FX.gemSparkle.speed;
    for (const gem of w.gems) {
      // Each gem twinkles on its own phase, taken from its position.
      const s = 1 + FX.gemSparkle.amount * Math.sin(sparkle + (gem.x + gem.y) * 0.05);
      this.gemSprites.add(gem.x, gem.y, TEX.gem).setScale(s);
    }
    this.gemSprites.end();

    for (const ev of w.events) {
      if (ev.kind === 'tileDestroyed') {
        camera.shake(FX.shakeTileLoss.ms, FX.shakeTileLoss.intensity);
        const b = FX.tileBurst;
        const color = TILES[ev.type].color;
        this.particles.burst(
          ev.x,
          ev.y,
          b.count,
          [color, outlineOf(color)],
          b.speed,
          b.size,
          b.life,
          true,
        );
        playSfx(this, 'tile-lost');
      } else if (ev.kind === 'enemyKilled') {
        const p = FX.enemyPop;
        const def = ENEMIES[ev.type];
        const colors = [def.color, 0xffffff, COLORS.bridge, outlineOf(def.color)];
        this.particles.burst(ev.x, ev.y, p.count, colors, p.speed, def.radius * p.size, p.life);
        playSfx(this, 'enemy-pop');
      } else if (ev.kind === 'blast') {
        this.blasts.push({ x: ev.x, y: ev.y, r: ev.radius, at: w.time });
        playSfx(this, ev.bomb ? 'bomb' : 'blast');
      } else if (ev.kind === 'bossPhase') {
        camera.shake(FX.shakeBossPhase.ms, FX.shakeBossPhase.intensity);
        playSfx(this, 'boss-phase');
      } else if (ev.kind === 'gridExpanded') {
        playSfx(this, 'grid-expand');
      }
    }
    w.events.length = 0;
    this.playTallySounds(w);
    this.particles.update(frameDt);
    this.particles.draw();
    this.drawPulses(w, ox, oy, frameDt);
  }

  /** Sounds for things the sim counts instead of reporting as events (concept.md §7). */
  private playTallySounds(w: World): void {
    const seen = this.seen;
    for (const [type, n] of Object.entries(w.tally.shots) as [TileType, number][]) {
      if (n > (seen.shots[type] ?? 0)) playSfx(this, SHOT_SOUND[type] ?? 'shot-gatling');
      seen.shots[type] = n;
    }
    if (w.tally.gems > seen.gems) playSfx(this, 'gem');
    if (w.tally.enemyShots > seen.enemyShots) playSfx(this, 'enemy-shot');
    seen.gems = w.tally.gems;
    seen.enemyShots = w.tally.enemyShots;
    // The boss arriving, and each charge telegraph starting.
    if (w.boss && !seen.boss) playSfx(this, 'boss-phase');
    seen.boss = !!w.boss;
    const charge = w.bossState.charge;
    if (charge === 'telegraph' && seen.charge !== 'telegraph') playSfx(this, 'boss-charge');
    seen.charge = charge;
  }

  /** Soft rings spreading from online Generators (concept.md §6 "generator pulse"). */
  private drawPulses(w: World, ox: number, oy: number, frameDt: number): void {
    const g = this.pulseGfx;
    g.clear();
    this.pulseClock += frameDt;
    const p = FX.generatorPulse;
    const f = (this.pulseClock % p.period) / p.period;
    const cell = GRID.cellPx;
    const left = ox - (w.city.gridSize * cell) / 2;
    const top = oy - (w.city.gridSize * cell) / 2;
    g.lineStyle(3, TILES.generator.color, p.alpha * (1 - f));
    for (const t of w.city.tiles) {
      if (t.type !== 'generator' || !t.online) continue;
      g.strokeCircle(
        left + (t.gx + 0.5) * cell,
        top + (t.gy + 0.5) * cell,
        cell * (0.5 + (p.radius - 0.5) * f),
      );
    }
  }

  /** Fading rings where shells landed (game time, so they freeze with the pause). */
  private drawBlasts(w: World): void {
    const g = this.blastGfx;
    g.clear();
    // The Colossus's charge telegraph: a red lane that fills up until it dashes.
    const path = chargePath(w);
    if (path) {
      const w2 = (w.boss?.radius ?? 0) * 2;
      g.lineStyle(w2, CHARGE_COLOR, 0.12 + 0.18 * path.progress);
      g.lineBetween(path.x0, path.y0, path.x1, path.y1);
      g.lineStyle(3, CHARGE_COLOR, 0.9);
      g.lineBetween(
        path.x0,
        path.y0,
        path.x0 + (path.x1 - path.x0) * path.progress,
        path.y0 + (path.y1 - path.y0) * path.progress,
      );
    }
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
