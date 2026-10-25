import Phaser from 'phaser';
import { announce, playSfx } from '../audio/sfx';
import { CAMERA, GRID, SIM } from '../config/balance';
import { BOSS, ELITE, ENEMIES, ENEMY_TYPES } from '../config/enemies';
import type { SoundKey } from '../config/audio';
import { FX } from '../config/fx';
import { SHOP_PIECES } from '../config/pieces';
import { TILES, type TileType } from '../config/tiles';
import { DEBUG, nextSeed } from '../debug/flags';
import { clearSavedRun, writeSavedRun } from '../saveGame';
import { saveWorld } from '../sim/save';
import { barrelFor } from '../render/icons';
import { drawBuffPips, drawPieceOutlines, drawSynergyLines } from '../render/lines';
import { COLORS, FONT } from '../render/palette';
import { motion, particleCount } from '../render/effects';
import { Particles } from '../render/particles';
import { BG_GRID_SIZE, createTextures, TEX } from '../render/textures';
import { damageAlpha, outlineOf, showsCracks, SpritePool } from '../render/tiles';
import {
  debugFillGrid,
  debugFillWeapons,
  debugHurtBoss,
  debugKillBoss,
  debugKillAll,
  debugLayoutJson,
  debugAddCoins,
  debugSpawn,
} from '../sim/debugActions';
import { chargePath } from '../sim/boss';
import { domeCircle, robotTarget } from '../sim/gadgets';
import { streakCount } from '../sim/streak';
import { facingAngle } from '../sim/grid';
import { applyShopResult } from '../sim/progression';
import { startRound } from '../sim/spawner';
import { step, type MoveInput } from '../sim/step';
import {
  bossEnraged,
  createWorld,
  tileCentre,
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
  flamethrower: 'shot-flame',
  crossbow: 'shot-crossbow',
  tesla: 'shot-tesla',
  confetti: 'shot-confetti',
  blackhole: 'shot-hole',
  hangar: 'shot-hangar',
};
/** Look of the party update's effects (concept-v2.md §2.17). */
const PARTY_LOOK = {
  zapLife: 0.3,
  zapHop: 0.09,
  zapColor: 0xffe600,
  holeColor: 0x6c6fd1,
  domeColor: 0x4895ef,
  domeEdge: 0x9fd0ff,
  confetti: [0xff6b6b, 0x4cc9f0, 0xffe94d, 0x80ed99, 0xcdb4db, 0xf4a261],
  strike: 0xf0405a,
};
/** Colour of the boss charge telegraph. */
const CHARGE_COLOR = COLORS.charge;
/** Tint of the enraged boss. */
const ENRAGE_TINT = 0xff6060;
/** Redraw piece outlines once the zoom has drifted this much (fraction) since the last draw. */
const OUTLINE_REDRAW_ZOOM = 0.05;
/**
 * Flame cone look: shown this long (s) after a puff, random reach flicker,
 * and layers [colour, reach fraction, alpha] from the outside in.
 */
const FLAME_LOOK = {
  linger: 0.15,
  flicker: 0.15,
  layers: [
    [0xff5e3a, 1, 0.45],
    [0xffa53a, 0.75, 0.55],
    [0xffe08a, 0.45, 0.7],
  ] as const,
};

/** Status marks: gap from the enemy's edge, ring width, reticle tick length (px), ring alpha. */
const STATUS_LOOK = { gap: 2, ring: 2, tick: 4, alpha: 0.9 };

/** Size of a damaged tile's HP bar (px, in world units). */
const HP_BAR = { w: 24, h: 4, ok: 0x6bd36b };

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
  /** Game speed picked on the HUD slider (one of `SIM.speeds`). */
  speed: number;
}

/** How often the run is saved while playing (ms). */
const SAVE_EVERY_MS = 5000;

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
  /** The shop before round 1 is still to open. */
  private prepShop = false;
  /** The run loaded from a save, if this scene was started with one. */
  private resumed: World | null = null;
  /** The restarted round: the world is the one saved at its start and runs at once. */
  private restart = false;
  /** The world as the current round began (saved), for "Restart round" on the summary. */
  private roundStart: string | null = null;
  /** Open the pause menu on the first frame (a resumed run waits for the player). */
  private pauseFirst = false;
  /** Real ms since the run was last saved. */
  private sinceSave = 0;
  private keys!: MoveKeys;
  private bg!: Phaser.GameObjects.TileSprite;
  private tileSprites!: SpritePool;
  private crackSprites!: SpritePool;
  private barrelSprites!: SpritePool;
  /** Chain links, in grid-local coordinates; redrawn when the city changes. */
  private linesGfx!: Phaser.GameObjects.Graphics;
  private linesFor: CityCache | null = null;
  /** Camera zoom the lines were drawn for (outline widths stay constant on screen). */
  private linesZoom = 0;
  /** Current drawn barrel angle per weapon tile id. */
  private barrelAngles = new Map<number, number>();
  private enemySprites!: SpritePool;
  private shotSprites!: SpritePool;
  private blastGfx!: Phaser.GameObjects.Graphics;
  private pulseGfx!: Phaser.GameObjects.Graphics;
  private flameGfx!: Phaser.GameObjects.Graphics;
  private statusGfx!: Phaser.GameObjects.Graphics;
  /** HP bars under damaged tiles. */
  private hpGfx!: Phaser.GameObjects.Graphics;
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
    domeHit: -Infinity,
  };
  private droneSprites!: SpritePool;
  private botSprites!: SpritePool;
  /** Holes, dome, lightning, disco rings, repair beams. */
  private fxGfx!: Phaser.GameObjects.Graphics;
  private zaps: { pts: number[]; at: number }[] = [];
  /** Drawn position of each Repair Robot (it rolls to its patient), by tile id. */
  private botPos = new Map<number, { x: number; y: number }>();
  private cam = { x: 0, y: 0, zoom: 1 };
  private debugEnemyIndex = 0;

  constructor() {
    super('Run');
  }

  init(data: { world?: World; restart?: boolean }): void {
    this.resumed = data.world ?? null;
    this.restart = data.restart ?? false;
    // Phaser keeps the data of the last start when the next one has none: without this a
    // new run would reload the world the first start came with (the saved, finished one).
    this.sys.settings.data = {};
  }

  create(): void {
    createTextures(this);
    // A reloaded tab resumes the saved run, paused (concept-v2.md §2.15); anything else starts afresh.
    this.world = this.resumed ?? createWorld(nextSeed());
    this.pauseFirst = this.resumed !== null && !this.restart;
    this.roundStart = this.restart ? saveWorld(this.world) : null;
    // A fresh run opens the shop before round 1; a resumed one only if its round was over.
    this.prepShop = this.resumed === null;
    if (!this.resumed) clearSavedRun();
    this.sinceSave = 0;
    const saveNow = () => this.saveRun();
    const onHidden = () => document.hidden && this.saveRun();
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', onHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('beforeunload', saveNow);
      document.removeEventListener('visibilitychange', onHidden);
    });
    this.ui = {
      world: this.world,
      debugOverlay: false,
      debugEnemy: ENEMY_TYPES[0] ?? '',
      simMs: 0,
      drawMs: 0,
      speed: 1,
    };
    this.registry.set('run', this.ui);
    this.acc = 0;
    this.buildOpen = false;

    this.bg = this.add.tileSprite(0, 0, 10, 10, TEX.bgGrid).setOrigin(0).setDepth(-10);
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
    this.flameGfx = this.add.graphics().setDepth(2.65);
    this.statusGfx = this.add.graphics().setDepth(3.4);
    this.hpGfx = this.add.graphics().setDepth(2.7);
    this.particles = new Particles(this, 3.6, TEX.particleDot, TEX.particleSquare);
    this.blasts = [];
    this.zaps = [];
    this.botPos.clear();
    this.droneSprites = new SpritePool(this, 3.3);
    this.botSprites = new SpritePool(this, 2.8);
    this.fxGfx = this.add.graphics().setDepth(3.45);
    this.seen = {
      shots: {},
      gems: 0,
      enemyShots: 0,
      boss: false,
      charge: 'walk',
      domeHit: -Infinity,
    };

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
    kb.on('keydown', (e: KeyboardEvent) => {
      if ((e.code === 'Escape' || e.code === 'KeyP') && !this.buildOpen && !this.world.over) {
        this.openPause();
        return;
      }
      this.onDebugKey(e);
    });

    this.scene.launch('Hud');
  }

  /** Writes the run to localStorage, unless the shop is open (its edits aren't in the world yet) or the run is over. */
  private saveRun(): void {
    if (this.buildOpen || this.world.over) return;
    this.sinceSave = 0;
    writeSavedRun(this.world);
  }

  override update(_time: number, delta: number): void {
    const w = this.world;
    if (this.pauseFirst) {
      this.pauseFirst = false;
      this.render(0, 0);
      this.openPause();
      return;
    }
    this.sinceSave += delta;
    if (this.sinceSave >= SAVE_EVERY_MS) this.saveRun();
    if (w.over) {
      this.endRun();
      return;
    }
    // The shop is for the break between rounds only (concept-v2.md §2.16).
    if (this.prepShop || w.roundClear) {
      this.prepShop = false;
      this.saveRun();
      this.openShop();
      return;
    }
    const speed = this.ui.speed;
    this.acc += Math.min(delta / 1000, SIM.maxFrame) * speed;
    const input = this.moveInput();
    const t0 = performance.now();
    while (this.acc >= SIM.dt) {
      step(w, input, SIM.dt);
      this.acc -= SIM.dt;
      if (w.over) {
        this.acc = 0;
        break;
      }
      // A fast game that can't keep up falls behind instead of freezing the page.
      if (speed > 1 && performance.now() - t0 > SIM.frameBudgetMs) {
        this.acc = 0;
        break;
      }
    }
    const t1 = performance.now();
    this.render(this.acc / SIM.dt, delta / 1000);
    const t2 = performance.now();
    this.ui.simMs += (t1 - t0 - this.ui.simMs) * TIMING_SMOOTHING;
    this.ui.drawMs += (t2 - t1 - this.ui.drawMs) * TIMING_SMOOTHING;
  }

  private moveInput(): MoveInput {
    const k = this.keys;
    return {
      x: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      y: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
    };
  }

  // ------------------------------------------------------------ build pause

  /** The shop (concept-v2.md §2.13, §2.16): the build screen with prices; opens between rounds, the run freezes meanwhile. */
  private openShop(): void {
    if (this.buildOpen) return;
    this.buildOpen = true;
    playSfx(this, 'ui-toggle');
    const w = this.world;
    const data: BuildSceneData = {
      city: w.city,
      offers: SHOP_PIECES,
      shop: {
        coins: w.coins,
        landsBought: w.landsBought,
      },
      title: w.roundClear ? `Round ${w.round} cleared` : 'Get ready',
      closeLabel: `Start round ${w.round + (w.roundClear ? 1 : 0)}`,
      done: (shop) => {
        applyShopResult(w, shop);
        if (w.roundClear) startRound(w);
        this.roundStart = saveWorld(w);
        this.scene.stop('Build');
        this.input.keyboard?.resetKeys();
        this.buildOpen = false;
        this.scene.resume();
      },
    };
    this.input.keyboard?.resetKeys();
    this.scene.pause();
    this.scene.launch('Build', data);
    this.scene.bringToTop('Build');
  }

  /** The Colossus bursts: confetti waves in its colours, a flash and a long shake. */
  private bossDeath(x: number, y: number): void {
    const d = FX.bossDeath;
    const colors = [ENEMIES[BOSS.type].color, 0xffffff, COLORS.bossEnraged, COLORS.xp];
    for (let i = 0; i < d.waves; i++) {
      const f = 1 - i / (d.waves + 1);
      this.particles.burst(
        x,
        y,
        particleCount(d.count),
        colors,
        d.speed * f,
        d.size,
        d.life,
        i > 0,
      );
    }
    const camera = this.cameras.main;
    if (motion()) {
      camera.flash(d.flashMs, 255, 255, 255);
      camera.shake(d.shake.ms, d.shake.intensity);
    }
  }

  /** Pause menu (concept.md §8); the run freezes until it closes. */
  private openPause(): void {
    playSfx(this, 'ui-click');
    this.input.keyboard?.resetKeys();
    this.scene.pause();
    this.scene.launch('Pause');
    this.scene.bringToTop('Pause');
  }

  private endRun(): void {
    const w = this.world;
    clearSavedRun();
    const summary: SummaryData = {
      round: w.round,
      kills: w.kills,
      coins: w.coinsEarned,
      won: w.won,
      bossKills: w.bossKills,
      board: [...w.city.board],
      tiles: w.city.tiles.map((t) => ({ ...t })),
      coreLostAt: w.coreLostAt,
      damageBy: { ...w.damageBy },
      roundStart: this.roundStart,
    };
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
        debugAddCoins(w, 1000);
        break;
      case 'F3':
        e.preventDefault();
        debugFillGrid(w, 'gatling');
        break;
      case 'F4':
        e.preventDefault();
        debugFillWeapons(w);
        break;
      case 'KeyG':
        debugAddCoins(w, 100);
        break;
      case 'KeyN':
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
      case 'KeyJ':
        debugKillBoss(w);
        break;
      case 'KeyL':
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

  /** A small HP bar along the bottom of a damaged tile, so wear shows on every tile type. */
  private drawHpBar(x: number, y: number, frac: number): void {
    const { w, h } = HP_BAR;
    const left = x - w / 2;
    const top = y + GRID.cellPx / 2 - h - 2;
    const g = this.hpGfx;
    g.fillStyle(COLORS.ink, 0.85);
    g.fillRect(left - 1, top - 1, w + 2, h + 2);
    g.fillStyle(frac < 0.3 ? COLORS.coreLow : HP_BAR.ok, 1);
    g.fillRect(left, top, w * Math.max(0, frac), h);
  }

  /** Eases a barrel's drawn angle toward `target` along the shorter way round. */
  private turnBarrel(id: number, target: number, frameDt: number): number {
    const current = this.barrelAngles.get(id) ?? target;
    const diff = Phaser.Math.Angle.Wrap(target - current);
    const next = current + diff * (1 - Math.exp(-BARREL_TURN_RATE * frameDt));
    this.barrelAngles.set(id, next);
    return next;
  }

  /** The city's bounding box takes at most CAMERA.cityFrame of the view (concept-v2.md §3.2). */
  private targetZoom(): number {
    const c = this.world.cache;
    const w = c.maxRx - c.minRx + GRID.cellPx;
    const h = c.maxRy - c.minRy + GRID.cellPx;
    const fit = Math.min(
      (this.scale.width * CAMERA.cityFrame) / w,
      (this.scale.height * CAMERA.cityFrame) / h,
    );
    return Phaser.Math.Clamp(fit, CAMERA.minZoom, CAMERA.maxZoom);
  }

  private render(alpha: number, frameDt: number): void {
    const w = this.world;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const ox = lerp(w.px, w.x);
    const oy = lerp(w.py, w.y);

    // Camera: follow the Core with light smoothing; zoom to frame the city.
    const tx = ox;
    const ty = oy;
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
    // (ox, oy) is the centre of cell (0, 0).
    const left = ox - cell / 2;
    const top = oy - cell / 2;
    const coreScale =
      1 + motion() * FX.corePulse.amount * Math.sin(this.time.now * 0.001 * FX.corePulse.speed);
    const pulse = (t: { type: string; online: boolean }) =>
      t.type === 'core' && t.online ? coreScale : 1;
    this.tileSprites.begin();
    this.crackSprites.begin();
    this.barrelSprites.begin();
    this.hpGfx.clear();
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
      if (hpFrac < 1) this.drawHpBar(x, y, hpFrac);
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
    const zoomDrift = Math.abs(this.cam.zoom / this.linesZoom - 1);
    if (this.linesFor !== w.cache || zoomDrift > OUTLINE_REDRAW_ZOOM) {
      this.linesFor = w.cache;
      this.linesZoom = this.cam.zoom;
      this.linesGfx.clear();
      drawPieceOutlines(this.linesGfx, w.city.tiles, cell, 0, 0, 1 / this.cam.zoom);
      drawSynergyLines(this.linesGfx, w.cache.syn.chains, cell, 0, 0);
      drawBuffPips(this.linesGfx, w.city.tiles, w.cache.syn, cell, 0, 0);
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
      else if (w.time < e.burnUntil) img.setTint(COLORS.burning);
      else img.clearTint();
      // Idle wobble plus a squash that springs back after a hit (concept.md §6).
      const wob = Math.sin(this.time.now * 0.001 * FX.wobbleSpeed + this.wobblePhase(e));
      const squash =
        sinceHit < FX.squashTime
          ? FX.squashAmount *
            (1 - sinceHit / FX.squashTime) *
            (e === w.boss ? FX.bossSquashFactor : 1)
          : 0;
      // Blob halves are smaller than the texture they share with their parent.
      const def = ENEMIES[e.type];
      const base = (1 / FX.enemyTexScale) * (e.radius / (def.radius * (e.elite ? ELITE.scale : 1)));
      img.setScale(
        base * (1 + motion() * FX.wobbleAmount * wob + squash),
        base * (1 - motion() * FX.wobbleAmount * wob - squash),
      );
    }
    this.enemySprites.end();
    this.drawStatuses(w, lerp);
    this.drawGadgets(w, lerp, ox - w.x, oy - w.y, frameDt);

    this.shotSprites.begin();
    for (const p of w.projectiles) {
      const key = p.blast > 0 ? TEX.shell : p.source === 'crossbow' ? TEX.bolt : TEX.shotSmall;
      this.shotSprites
        .add(lerp(p.px, p.x), lerp(p.py, p.y), key)
        .setRotation(key === TEX.bolt ? Math.atan2(p.vy, p.vx) : 0);
    }
    for (const s of w.enemyShots) {
      this.shotSprites.add(lerp(s.px, s.x), lerp(s.py, s.y), TEX.enemyShot);
    }
    this.shotSprites.end();
    this.drawBlasts(w);

    for (const ev of w.events) {
      if (ev.kind === 'tileDestroyed') {
        if (motion()) camera.shake(FX.shakeTileLoss.ms, FX.shakeTileLoss.intensity);
        const b = FX.tileBurst;
        const color = TILES[ev.type].color;
        this.particles.burst(
          ev.x,
          ev.y,
          particleCount(b.count),
          [color, outlineOf(color)],
          b.speed,
          b.size,
          b.life,
          true,
        );
        playSfx(this, 'tile-lost');
        if (ev.brokeOff) this.floatText('Broke off!', ev.x, ev.y, '#e0344b', 22);
      } else if (ev.kind === 'enemyKilled' && ENEMIES[ev.type].boss) {
        this.bossDeath(ev.x, ev.y);
      } else if (ev.kind === 'enemyKilled') {
        const p = FX.enemyPop;
        const def = ENEMIES[ev.type];
        const colors = [def.color, 0xffffff, COLORS.bridge, outlineOf(def.color)];
        this.particles.burst(
          ev.x,
          ev.y,
          particleCount(p.count),
          colors,
          p.speed,
          def.radius * p.size,
          p.life,
        );
        playSfx(this, 'enemy-pop');
      } else if (ev.kind === 'blast') {
        this.blasts.push({ x: ev.x, y: ev.y, r: ev.radius, at: w.time });
        playSfx(this, ev.bomb ? 'bomb' : 'blast');
        if (ev.source === 'confetti') {
          this.particles.burst(
            ev.x,
            ev.y,
            particleCount(26),
            PARTY_LOOK.confetti,
            280,
            6,
            0.8,
            true,
          );
        }
      } else if (ev.kind === 'bossPhase') {
        if (motion()) camera.shake(FX.shakeBossPhase.ms, FX.shakeBossPhase.intensity);
        playSfx(this, 'boss-phase');
      } else if (ev.kind === 'zap') {
        this.zaps.push({ pts: ev.pts, at: w.time });
      } else if (ev.kind === 'streak') {
        this.floatText(ev.label, this.cam.x, this.cam.y - 120 / this.cam.zoom, '#ff6b00', 56);
        playSfx(this, 'streak');
        announce(ev.label);
      } else if (ev.kind === 'domeBreak') {
        this.particles.burst(
          ev.x,
          ev.y,
          particleCount(40),
          [PARTY_LOOK.domeColor, PARTY_LOOK.domeEdge, 0xffffff],
          520,
          8,
          0.9,
          true,
        );
        this.blasts.push({ x: ev.x, y: ev.y, r: ev.radius * 1.5, at: w.time });
        if (motion()) camera.shake(FX.shakeBossPhase.ms, FX.shakeBossPhase.intensity);
        playSfx(this, 'dome-break');
      } else if (ev.kind === 'steal') {
        this.floatText(
          ev.amount > 0 ? `-${ev.amount} coins!` : 'Nothing to steal',
          ev.x,
          ev.y,
          '#e0344b',
          26,
        );
        playSfx(this, 'steal');
      } else if (ev.kind === 'discoBeat') {
        playSfx(this, ev.strike ? 'disco-strike' : 'disco-beat');
      } else if (ev.kind === 'droneLaunch') {
        playSfx(this, 'drone-launch');
      }
    }
    w.events.length = 0;
    this.playTallySounds(w);
    this.particles.update(frameDt);
    this.particles.draw();
    this.drawPulses(w, ox, oy, frameDt);
    this.drawFlames(w, ox - w.x, oy - w.y);
  }

  /** Text that pops up at a world position, drifts up and fades (sized for the current zoom). */
  private floatText(text: string, x: number, y: number, color: string, size: number): void {
    const z = this.cam.zoom;
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT.family,
        fontStyle: 'bold',
        fontSize: `${size / z}px`,
        color,
        stroke: '#ffffff',
        strokeThickness: 5 / z,
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({
      targets: t,
      y: y - 70 / z,
      alpha: 0,
      scale: 1.25,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /**
   * The party update's gadgets (concept-v2.md §2.17): drones and Repair Robots
   * as sprites; black holes, the dome, lightning, disco rings and repair
   * beams on one graphics layer. (dx, dy) is the city's interpolation offset.
   */
  private drawGadgets(
    w: World,
    lerp: (a: number, b: number) => number,
    dx: number,
    dy: number,
    frameDt: number,
  ): void {
    const g = this.fxGfx;
    g.clear();

    this.droneSprites.begin();
    for (const d of w.drones) {
      this.droneSprites.add(lerp(d.px, d.x), lerp(d.py, d.y), TEX.drone);
    }
    this.droneSprites.end();

    // Repair Robots roll to the most damaged tile and patch it.
    this.botSprites.begin();
    const bots = w.cache.online.robot;
    if (bots) {
      const patient = robotTarget(w);
      const follow = 1 - Math.exp(-6 * frameDt);
      for (const bot of bots) {
        const home = tileCentre(w, bot);
        const goal = patient ? tileCentre(w, patient) : home;
        const pos = this.botPos.get(bot.id) ?? { x: home.x, y: home.y };
        this.botPos.set(bot.id, pos);
        pos.x += (goal.x + dx - pos.x) * follow;
        pos.y += (goal.y + dy - pos.y) * follow;
        this.botSprites.add(pos.x, pos.y, TEX.robot);
        if (patient && Math.hypot(goal.x + dx - pos.x, goal.y + dy - pos.y) < GRID.cellPx) {
          g.lineStyle(3, 0x80ed99, 0.8);
          g.strokeCircle(
            goal.x + dx,
            goal.y + dy,
            GRID.cellPx * (0.35 + 0.15 * Math.sin(w.time * 12)),
          );
        }
      }
    }
    this.botSprites.end();

    for (const h of w.holes) {
      const open = Math.min(1, (h.maxLife - h.life) / 0.3, h.life / 0.3);
      g.fillStyle(0x14152b, 0.6 * open);
      g.fillCircle(h.x, h.y, h.radius * 0.4 * open);
      g.lineStyle(2, PARTY_LOOK.holeColor, 0.25 * open);
      g.strokeCircle(h.x, h.y, h.radius);
      for (let i = 0; i < 4; i++) {
        g.lineStyle(3, PARTY_LOOK.holeColor, 0.6 * open);
        g.beginPath();
        const a = w.time * (3 + i) + i * 1.6;
        g.arc(h.x, h.y, h.radius * (0.35 + 0.17 * i), a, a + 1.2, false);
        g.strokePath();
      }
    }

    if (w.dome.max > 0) {
      const c = domeCircle(w);
      const x = c.x + dx;
      const y = c.y + dy;
      if (w.dome.hp > 0) {
        const flash = Math.max(0, 1 - (w.time - w.dome.hitAt) / 0.25);
        g.fillStyle(PARTY_LOOK.domeColor, 0.07 + 0.2 * flash);
        g.fillCircle(x, y, c.r);
        g.lineStyle(3, PARTY_LOOK.domeColor, 0.35 + 0.5 * flash);
        g.strokeCircle(x, y, c.r);
        // The brighter arc is the charge left.
        g.lineStyle(5, PARTY_LOOK.domeEdge, 0.85);
        g.beginPath();
        g.arc(
          x,
          y,
          c.r,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * (w.dome.hp / w.dome.max),
          false,
        );
        g.strokePath();
      } else {
        g.lineStyle(2, PARTY_LOOK.domeColor, 0.12);
        g.strokeCircle(x, y, c.r);
      }
    }

    // Disco rings: a dance floor around the robot that turns red before it strikes.
    for (const e of w.enemies) {
      const disco = ENEMIES[e.type].disco;
      if (!disco) continue;
      const phase = 1 - Math.min(1, Math.max(0, e.cooldown / disco.beat));
      const strikeNext = (e.gen + 1) % 2 === 0;
      const x = lerp(e.px, e.x);
      const y = lerp(e.py, e.y);
      const floor = Phaser.Display.Color.HSVToRGB((w.time * 0.6) % 1, 0.6, 1) as { color: number };
      const color = strikeNext ? PARTY_LOOK.strike : floor.color;
      g.fillStyle(color, strikeNext ? 0.06 + 0.2 * phase : 0.08);
      g.fillCircle(x, y, disco.radius);
      g.lineStyle(3, color, 0.7);
      g.strokeCircle(x, y, disco.radius);
      if (strikeNext) {
        g.lineStyle(2, color, 0.9);
        g.strokeCircle(x, y, disco.radius * phase);
      }
    }

    // Lightning: the bolt leaps segment by segment (coil -> enemy -> enemy ...), each segment flashing briefly.
    let n = 0;
    for (const z of this.zaps) {
      const age = w.time - z.at;
      const segs = z.pts.length / 2 - 1;
      if (age >= (segs - 1) * PARTY_LOOK.zapHop + PARTY_LOOK.zapLife) continue;
      this.zaps[n++] = z;
      for (let s = 0; s < segs; s++) {
        const segAge = age - s * PARTY_LOOK.zapHop;
        if (segAge < 0 || segAge >= PARTY_LOOK.zapLife) continue;
        const fade = 1 - segAge / PARTY_LOOK.zapLife;
        const x0 = z.pts[s * 2] ?? 0;
        const y0 = z.pts[s * 2 + 1] ?? 0;
        const x1 = z.pts[s * 2 + 2] ?? 0;
        const y1 = z.pts[s * 2 + 3] ?? 0;
        for (const [width, color, alpha] of [
          [14, PARTY_LOOK.zapColor, 0.45],
          [7, PARTY_LOOK.zapColor, 1],
          [3, 0xfffbd0, 1],
        ] as const) {
          g.lineStyle(width / this.cam.zoom, color, alpha * fade);
          g.beginPath();
          g.moveTo(x0, y0);
          for (let k = 1; k <= 4; k++) {
            const f = k / 4;
            const jitter = k === 4 ? 0 : (Math.random() - 0.5) * 30;
            g.lineTo(
              x0 + (x1 - x0) * f - (y1 - y0) * 0.03 * jitter,
              y0 + (y1 - y0) * f + (x1 - x0) * 0.03 * jitter,
            );
          }
          g.strokePath();
        }
        g.fillStyle(PARTY_LOOK.zapColor, 0.8 * fade);
        g.fillCircle(x1, y1, (16 * fade + 4) / this.cam.zoom);
      }
    }
    this.zaps.length = n;
  }

  /**
   * Status marks around enemies (concept-v2.md §2.12): burning shows as the
   * sprite tint; snagged a blue ring, staggered a white ring, marked a red
   * reticle.
   */
  private drawStatuses(w: World, lerp: (a: number, b: number) => number): void {
    const g = this.statusGfx;
    g.clear();
    const look = STATUS_LOOK;
    for (const e of w.enemies) {
      const snag = w.time < e.snagUntil;
      const stagger = w.time < e.staggerUntil;
      const mark = w.time < e.markUntil;
      if (!snag && !stagger && !mark) continue;
      const x = lerp(e.px, e.x);
      const y = lerp(e.py, e.y);
      const r = e.radius + look.gap;
      if (snag) {
        g.lineStyle(look.ring, COLORS.snagged, look.alpha);
        g.strokeCircle(x, y, r);
      }
      if (stagger) {
        g.lineStyle(look.ring + 1, COLORS.staggered, 1);
        g.strokeCircle(x, y, r + look.ring);
      }
      if (mark) {
        const m = r + look.ring * 2;
        g.lineStyle(look.ring, COLORS.marked, look.alpha);
        g.strokeCircle(x, y, m);
        g.lineBetween(x - m - look.tick, y, x - m + look.tick, y);
        g.lineBetween(x + m - look.tick, y, x + m + look.tick, y);
        g.lineBetween(x, y - m - look.tick, x, y - m + look.tick);
        g.lineBetween(x, y + m - look.tick, x, y + m + look.tick);
      }
    }
  }

  /** Flame cones of Flamethrowers that fired in the last moment (concept-v2.md §2.12). */
  private drawFlames(w: World, dx: number, dy: number): void {
    const g = this.flameGfx;
    g.clear();
    for (const t of w.cache.weapons) {
      const weapon = w.cache.syn.weapons[t.type];
      const st = w.weapons.get(t.id);
      if (!weapon?.coneDeg || st?.firedAt === undefined) continue;
      const age = w.time - st.firedAt;
      if (age > FLAME_LOOK.linger) continue;
      const c = tileCentre(w, t);
      const half = (weapon.coneDeg * Math.PI) / 360;
      const flicker = 1 - FLAME_LOOK.flicker * motion() * Math.random();
      const fade = 1 - age / FLAME_LOOK.linger;
      for (const [color, reach, alpha] of FLAME_LOOK.layers) {
        g.fillStyle(color, alpha * fade);
        g.slice(c.x + dx, c.y + dy, weapon.range * reach * flicker, st.aim - half, st.aim + half);
        g.fillPath();
      }
    }
  }

  /** Sounds for things the sim counts instead of reporting as events (concept.md §7). */
  private playTallySounds(w: World): void {
    const seen = this.seen;
    for (const [type, n] of Object.entries(w.tally.shots) as [TileType, number][]) {
      if (n > (seen.shots[type] ?? 0)) playSfx(this, SHOT_SOUND[type] ?? 'shot-gatling');
      seen.shots[type] = n;
    }
    // Coins ring higher the longer the kill streak (the Mario coin trick).
    if (w.tally.gems > seen.gems) playSfx(this, 'gem', Math.min(1200, streakCount(w) * 15));
    if (w.dome.hitAt > seen.domeHit) playSfx(this, 'dome-hit');
    seen.domeHit = w.dome.hitAt;
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
    if (!motion()) return;
    this.pulseClock += frameDt;
    const p = FX.generatorPulse;
    const f = (this.pulseClock % p.period) / p.period;
    const cell = GRID.cellPx;
    // (ox, oy) is the centre of cell (0, 0).
    const left = ox - cell / 2;
    const top = oy - cell / 2;
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
