import type Phaser from 'phaser';
import { FX } from '../config/fx';
import { SpritePool } from './tiles';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left, and the total, for fading and shrinking. */
  life: number;
  maxLife: number;
  size: number;
  color: number;
  /** Squares tumble (tile debris); dots don't. */
  square: boolean;
  spin: number;
  angle: number;
}

/**
 * Confetti pops and debris bursts (concept.md §6). Render-only, frame time,
 * capped at FX.maxParticles (the oldest make room). Draws with pooled
 * sprites from two white textures, tinted per particle.
 */
export class Particles {
  private readonly list: Particle[] = [];
  private readonly pool: Particle[] = [];
  private readonly sprites: SpritePool;

  constructor(
    scene: Phaser.Scene,
    depth: number,
    private readonly dotKey: string,
    private readonly squareKey: string,
  ) {
    this.sprites = new SpritePool(scene, depth);
  }

  /** `count` particles flying out from (x, y) at up to `speed` px/s. */
  burst(
    x: number,
    y: number,
    count: number,
    colors: readonly number[],
    speed: number,
    size: number,
    life: number,
    square = false,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.list.length >= FX.maxParticles) this.pool.push(this.list.shift() as Particle);
      const p = this.pool.pop() ?? ({} as Particle);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + 0.6 * Math.random());
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.maxLife = p.life = life * (0.7 + 0.3 * Math.random());
      p.size = size * (0.7 + 0.6 * Math.random());
      p.color = colors[i % colors.length] ?? 0xffffff;
      p.square = square;
      p.spin = (Math.random() * 2 - 1) * 10;
      p.angle = Math.random() * Math.PI;
      this.list.push(p);
    }
  }

  update(dt: number): void {
    const drag = Math.exp(-FX.particleDrag * dt);
    let n = 0;
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.push(p);
        continue;
      }
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      this.list[n++] = p;
    }
    this.list.length = n;
  }

  draw(): void {
    this.sprites.begin();
    for (const p of this.list) {
      const f = p.life / p.maxLife;
      const s = p.size * (0.4 + 0.6 * f);
      this.sprites
        .add(p.x, p.y, p.square ? this.squareKey : this.dotKey)
        .setDisplaySize(s, s)
        .setRotation(p.square ? p.angle : 0)
        .setTint(p.color)
        .setAlpha(Math.min(1, f * 1.5));
    }
    this.sprites.end();
  }

  clear(): void {
    this.pool.push(...this.list);
    this.list.length = 0;
  }
}
