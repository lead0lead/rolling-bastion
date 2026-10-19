import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // Phase 1: the build screen runs as a standalone sandbox.
    this.scene.start('Build');
  }
}
