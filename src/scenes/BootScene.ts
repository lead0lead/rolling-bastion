import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, 'ROLLING BASTION', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#e6e9ef',
      })
      .setOrigin(0.5);

    this.add
      .text(width - 12, height - 12, `v${__APP_VERSION__}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#6b7280',
      })
      .setOrigin(1, 1);
  }
}
