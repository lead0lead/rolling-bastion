import Phaser from 'phaser';
import { SANDBOX } from '../debug/flags';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // `?sandbox=1` opens the standalone build screen from Phase 1; otherwise the title screen.
    this.scene.start(SANDBOX ? 'Build' : 'Title');
  }
}
