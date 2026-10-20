import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { ENEMIES, type EnemyType } from '../config/enemies';
import { FX } from '../config/fx';
import { TILES, type TileType } from '../config/tiles';
import { barrelFor } from '../render/icons';
import { COLORS, css, FONT } from '../render/palette';
import { motion, particleCount } from '../render/effects';
import { WAKE_KEY_GRACE_MS } from '../render/menu';
import { Particles } from '../render/particles';
import { BG_GRID_SIZE, createTextures, TEX } from '../render/textures';
import { outlineOf } from '../render/tiles';

/** Demo city on the title screen: rows of tile letters (see LEGEND), '.' empty. */
const DEMO_CITY = ['.g.g.', 'gegeg', 'hdCdh', 'gegeg', '.g.g.'];
const LEGEND: Record<string, TileType> = {
  C: 'core',
  h: 'hull',
  g: 'gatling',
  e: 'generator',
  d: 'shield',
};
const DEMO = {
  cell: 36,
  /** City centre and its slow drift (px, rad/s). */
  x: 640,
  y: 555,
  driftX: 150,
  driftY: 18,
  driftSpeed: 0.35,
  /** Blobs chasing the city: count, speed (px/s), pop distance from the centre, respawn delay (s). */
  blobs: 7,
  blobSpeed: 55,
  popAt: 150,
  respawn: 1.2,
  /** Blobs are drawn this much bigger than in a run. */
  blobScale: 2,
  /** Background scroll speed (px/s). */
  scroll: 25,
} as const;
const BLOB_TYPES: EnemyType[] = ['swarmer', 'runner', 'spitter', 'sapper', 'bomber', 'brute'];

/** Candy colours for the title letters, from the tile palette. */
const LETTER_COLORS: TileType[] = ['gatling', 'cannon', 'generator', 'shield', 'plating', 'repair'];
const TITLE = {
  text: 'Rolling Bastion',
  y: 150,
  size: 92,
  bounce: 7,
  bounceSpeed: 3.2,
  stagger: 0.45,
};

interface Blob {
  img: Phaser.GameObjects.Image;
  type: EnemyType;
  x: number;
  y: number;
  /** Seconds until it reappears after popping (0 = alive). */
  wait: number;
  phase: number;
}

/** Title screen (concept.md §6, decided 2026-10-20): a lively demo behind the title. */
export class TitleScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.TileSprite;
  private city: {
    img: Phaser.GameObjects.Image;
    barrel?: Phaser.GameObjects.Image;
    dx: number;
    dy: number;
  }[] = [];
  private blobs: Blob[] = [];
  private letters: Phaser.GameObjects.Text[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private particles!: Particles;
  private clock = 0;

  constructor() {
    super('Title');
  }

  create(): void {
    createTextures(this);
    const { width, height } = this.scale;
    this.clock = 0;
    this.bg = this.add.tileSprite(0, 0, width, height, TEX.bgGrid).setOrigin(0);

    // Demo city.
    this.city = [];
    const half = (DEMO_CITY.length - 1) / 2;
    DEMO_CITY.forEach((row, gy) =>
      [...row].forEach((ch, gx) => {
        const type = LEGEND[ch];
        if (!type) return;
        const img = this.add
          .image(0, 0, TEX.tile(type, false))
          .setDisplaySize(DEMO.cell, DEMO.cell);
        const b = barrelFor(type);
        const barrel = b
          ? this.add.image(0, 0, TEX.barrel(b)).setDisplaySize(DEMO.cell, DEMO.cell)
          : undefined;
        this.city.push({ img, barrel, dx: (gx - half) * DEMO.cell, dy: (gy - half) * DEMO.cell });
      }),
    );

    this.particles = new Particles(this, 4, TEX.particleDot, TEX.particleSquare);
    this.blobs = [];
    for (let i = 0; i < DEMO.blobs; i++) {
      const type = BLOB_TYPES[i % BLOB_TYPES.length] as EnemyType;
      const img = this.add.image(0, 0, TEX.enemy(type)).setDepth(3);
      const blob: Blob = { img, type, x: 0, y: 0, wait: i * 0.6, phase: Math.random() * 6 };
      this.blobs.push(blob);
    }

    // Title: one text per letter so each can bounce in its own candy colour.
    this.letters = [];
    const style = {
      fontFamily: FONT.family,
      fontStyle: FONT.bold,
      fontSize: `${TITLE.size}px`,
    };
    const measure = this.add.text(0, 0, TITLE.text, style).setVisible(false);
    let x = width / 2 - measure.width / 2;
    measure.destroy();
    [...TITLE.text].forEach((ch, i) => {
      const color = TILES[LETTER_COLORS[i % LETTER_COLORS.length] as TileType].color;
      const t = this.add
        .text(x, TITLE.y, ch, {
          ...style,
          color: css(color),
          stroke: css(outlineOf(color)),
          strokeThickness: 8,
        })
        .setOrigin(0, 0.5)
        .setDepth(10);
      x += t.width - 8;
      this.letters.push(t);
    });

    const text = { fontFamily: FONT.family, fontStyle: FONT.weight, color: COLORS.text };
    this.prompt = this.add
      .text(width / 2, 262, 'Click or press Enter to start', {
        ...text,
        fontStyle: FONT.bold,
        fontSize: '28px',
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.add
      .text(
        width / 2,
        318,
        [
          'Drive with WASD or the arrow keys — your guns fire by themselves',
          'Level up, then place pieces: keep every tile connected to the Core',
          'Build chains of guns and fill rows — or upgrade a tile type instead',
        ].join('\n'),
        { ...text, fontSize: '18px', color: COLORS.textDim, align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.add
      .text(width - 12, height - 8, `v${__APP_VERSION__}`, {
        ...text,
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 1)
      .setDepth(10);

    const settingsLink = this.add
      .text(width / 2, 418, 'Settings (S)', { ...text, fontStyle: FONT.bold, fontSize: '22px' })
      .setOrigin(0.5)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    settingsLink.on('pointerover', () => settingsLink.setColor(COLORS.textInfo));
    settingsLink.on('pointerout', () => settingsLink.setColor(COLORS.text));

    const start = () => {
      playSfx(this, 'ui-confirm');
      this.scene.start('Run');
    };
    const openSettings = () => {
      playSfx(this, 'ui-click');
      this.scene.launch('Settings', { from: 'Title' });
      this.scene.sleep();
    };
    let wokeAt = -Infinity;
    this.events.on(Phaser.Scenes.Events.WAKE, () => (wokeAt = this.time.now));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.time.now - wokeAt < WAKE_KEY_GRACE_MS) return;
      if (e.code === 'Enter' || e.code === 'Space') start();
      else if (e.code === 'KeyS') openSettings();
    });
    this.input.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.includes(settingsLink)) openSettings();
        else start();
      },
    );
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    this.clock += dt;
    const t = this.clock;
    const { width, height } = this.scale;
    this.bg.setTilePosition((t * DEMO.scroll) % BG_GRID_SIZE, 0);

    this.letters.forEach((l, i) => {
      l.setY(TITLE.y + Math.sin(t * TITLE.bounceSpeed - i * TITLE.stagger) * TITLE.bounce);
    });
    this.prompt.setAlpha(0.6 + 0.4 * Math.sin(t * 3));

    const cx = DEMO.x + Math.sin(t * DEMO.driftSpeed) * DEMO.driftX;
    const cy = DEMO.y + Math.sin(t * DEMO.driftSpeed * 2) * DEMO.driftY;

    // Blobs walk to the city and pop near it.
    let target: Blob | undefined;
    let best = Infinity;
    for (const b of this.blobs) {
      if (b.wait > 0) {
        b.wait -= dt;
        b.img.setVisible(false);
        if (b.wait <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.hypot(width, height) / 2 + 40;
          b.x = width / 2 + Math.cos(a) * r;
          b.y = height / 2 + Math.sin(a) * r;
        }
        continue;
      }
      const dx = cx - b.x;
      const dy = cy - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.x += (dx / d) * DEMO.blobSpeed * dt;
      b.y += (dy / d) * DEMO.blobSpeed * dt;
      if (d < DEMO.popAt) {
        const def = ENEMIES[b.type];
        const p = FX.enemyPop;
        const colors = [def.color, 0xffffff, COLORS.bridge, outlineOf(def.color)];
        this.particles.burst(
          b.x,
          b.y,
          particleCount(p.count + 4),
          colors,
          p.speed,
          def.radius * 1.4,
          p.life,
        );
        b.wait = DEMO.respawn;
        continue;
      }
      if (d < best) {
        best = d;
        target = b;
      }
      const wob = motion() * Math.sin(t * FX.wobbleSpeed + b.phase) * FX.wobbleAmount;
      const s = DEMO.blobScale / FX.enemyTexScale;
      b.img
        .setVisible(true)
        .setPosition(b.x, b.y)
        .setScale(s * (1 + wob), s * (1 - wob));
    }

    const coreScale = 1 + motion() * FX.corePulse.amount * Math.sin(t * FX.corePulse.speed);
    for (const c of this.city) {
      const x = cx + c.dx;
      const y = cy + c.dy;
      const isCore = c.img.texture.key === TEX.tile('core', false);
      c.img
        .setPosition(x, y)
        .setDisplaySize(DEMO.cell * (isCore ? coreScale : 1), DEMO.cell * (isCore ? coreScale : 1));
      if (c.barrel) {
        const aim = target ? Math.atan2(target.y - y, target.x - x) : -Math.PI / 2;
        c.barrel.setPosition(x, y).setRotation(aim);
      }
    }

    this.particles.update(dt);
    this.particles.draw();
  }
}
