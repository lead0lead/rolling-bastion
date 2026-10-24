import Phaser from 'phaser';
import { loadSounds } from '../audio/sfx';
import { SANDBOX } from '../debug/flags';
import { readSavedRun } from '../saveGame';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    loadSounds(this);
  }

  create(): void {
    // `?sandbox=1` opens the standalone build screen from Phase 1; otherwise the title screen.
    if (SANDBOX) {
      this.scene.start('Build');
      return;
    }
    // A run saved before the tab was reloaded picks up where it was (concept-v2.md §2.15).
    const saved = readSavedRun();
    if (saved) this.scene.start('Run', { world: saved });
    else this.scene.start('Title');
  }
}
