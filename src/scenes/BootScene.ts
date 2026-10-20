import Phaser from 'phaser';
import { loadSounds } from '../audio/sfx';
import { SANDBOX } from '../debug/flags';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    loadSounds(this);
  }

  create(): void {
    // `?sandbox=1` opens the standalone build screen from Phase 1; otherwise the title screen.
    this.scene.start(SANDBOX ? 'Build' : 'Title');
  }
}
