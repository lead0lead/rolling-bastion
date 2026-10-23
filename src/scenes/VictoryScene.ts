import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { FX } from '../config/fx';
import { TILES } from '../config/tiles';
import { motion, particleCount } from '../render/effects';
import { MenuPanel } from '../render/menu';
import { COLORS, FONT } from '../render/palette';
import { Particles } from '../render/particles';
import { TEX } from '../render/textures';

export interface VictorySceneData {
  /** The run so far, for the stat line. */
  time: number;
  level: number;
  kills: number;
  keepGoing: () => void;
  endRun: () => void;
}

const LAYOUT = { titleY: 140, statsY: 206, confettiSpread: 330 } as const;

/** Confetti in the city's colours. */
const CONFETTI = [
  TILES.gatling.color,
  TILES.cannon.color,
  TILES.generator.color,
  TILES.shield.color,
  TILES.flamethrower.color,
  0xffffff,
];

/**
 * After the boss kill (concept-v2.md §2.11): a big title with the run's
 * stats and confetti, then "Keep going" resumes the run in endless, "End
 * run" goes to the end screen. No Esc: the player picks one.
 */
export class VictoryScene extends Phaser.Scene {
  private menu: MenuPanel | null = null;
  private particles: Particles | null = null;

  constructor() {
    super('Victory');
  }

  create(data: VictorySceneData): void {
    playSfx(this, 'win');
    const { width } = this.scale;
    const pick = (then: () => void) => () => {
      this.menu?.destroy();
      this.menu = null;
      this.scene.stop();
      then();
    };
    this.menu = new MenuPanel(this, 'What now?', [
      { label: () => 'Keep going', action: pick(data.keepGoing) },
      { label: () => 'End run', action: pick(data.endRun) },
    ]);

    const text = { fontFamily: FONT.family, stroke: '#ffffff' };
    const title = this.add
      .text(width / 2, LAYOUT.titleY, 'COLOSSUS DEFEATED!', {
        ...text,
        fontStyle: FONT.bold,
        fontSize: '68px',
        color: COLORS.textBoss,
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    const mins = Math.floor(data.time / 60);
    const secs = Math.floor(data.time % 60)
      .toString()
      .padStart(2, '0');
    const stats = this.add
      .text(
        width / 2,
        LAYOUT.statsY,
        `Beaten at ${mins}:${secs}   ·   Level ${data.level}   ·   ${data.kills} kills`,
        {
          ...text,
          fontStyle: FONT.weight,
          fontSize: '24px',
          color: COLORS.text,
          strokeThickness: 6,
        },
      )
      .setOrigin(0.5)
      .setAlpha(0);

    const v = FX.victory;
    if (motion()) {
      title.setScale(0.3).setAlpha(0);
      this.tweens.add({
        targets: title,
        scale: 1,
        alpha: 1,
        duration: v.popMs,
        ease: 'Back.easeOut',
      });
    }
    this.tweens.add({ targets: stats, alpha: 1, delay: v.statsDelayMs, duration: 300 });

    this.particles = new Particles(this, 5, TEX.particleDot, TEX.particleSquare);
    for (const side of [-1, 1]) {
      this.particles.burst(
        width / 2 + side * LAYOUT.confettiSpread,
        LAYOUT.titleY,
        particleCount(v.confetti.count),
        CONFETTI,
        v.confetti.speed,
        v.confetti.size,
        v.confetti.life,
        true,
      );
    }
  }

  override update(_time: number, delta: number): void {
    if (!this.particles) return;
    this.particles.update(delta / 1000);
    this.particles.draw();
  }
}
