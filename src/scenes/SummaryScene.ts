import Phaser from 'phaser';
import { COLORS } from '../render/tiles';

export interface SummaryData {
  time: number;
  kills: number;
  level: number;
  /** The boss was defeated. */
  won: boolean;
}

/** Win / lose screen (concept.md §8). The layout snapshot comes later. */
export class SummaryScene extends Phaser.Scene {
  constructor() {
    super('Summary');
  }

  create(data: SummaryData): void {
    const text = { fontFamily: 'monospace', color: COLORS.text };
    const mins = Math.floor(data.time / 60);
    const secs = Math.floor(data.time % 60)
      .toString()
      .padStart(2, '0');
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, COLORS.background).setOrigin(0);
    this.add
      .text(640, 240, data.won ? 'The city rolls on.' : 'The Core has fallen.', {
        ...text,
        fontSize: '36px',
        color: data.won ? '#9fe8ff' : COLORS.text,
      })
      .setOrigin(0.5);
    this.add
      .text(
        640,
        330,
        `Survived ${mins}:${secs}   ·   Level ${data.level}   ·   Kills ${data.kills}`,
        {
          ...text,
          fontSize: '18px',
          color: COLORS.textDim,
        },
      )
      .setOrigin(0.5);
    this.add
      .text(640, 440, 'Enter or click to drive again', { ...text, fontSize: '18px' })
      .setOrigin(0.5);

    const restart = () => this.scene.start('Run');
    this.input.keyboard?.once('keydown-ENTER', restart);
    this.input.keyboard?.once('keydown-SPACE', restart);
    this.input.once('pointerdown', restart);
  }
}
