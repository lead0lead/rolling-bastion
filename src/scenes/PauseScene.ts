import Phaser from 'phaser';
import { MenuPanel, WAKE_KEY_GRACE_MS } from '../render/menu';
import { clearSavedRun } from '../saveGame';

/** How long a "click again to confirm" stays armed (ms). */
const CONFIRM_MS = 3000;

/**
 * Pause menu over a run (concept.md §8): Resume, Settings, Restart run and
 * Quit to title (the last two ask for a second click).
 */
export class PauseScene extends Phaser.Scene {
  private menu: MenuPanel | null = null;
  private armed: { which: 'restart' | 'quit'; until: number } | null = null;
  private wokeAt = -Infinity;

  constructor() {
    super('Pause');
  }

  create(): void {
    this.armed = null;
    this.openMenu();
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.time.now - this.wokeAt < WAKE_KEY_GRACE_MS) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.menu) this.resume();
    });
    // Coming back from the settings panel.
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.wokeAt = this.time.now;
      this.openMenu();
    });
  }

  private openMenu(): void {
    this.menu?.destroy();
    const armed = (which: 'restart' | 'quit') =>
      this.armed?.which === which && this.time.now < this.armed.until;
    this.menu = new MenuPanel(this, 'Paused', [
      { label: () => 'Resume', action: () => this.resume() },
      { label: () => 'Settings', action: () => this.openSettings() },
      {
        label: () => (armed('restart') ? 'Restart run? Click again' : 'Restart run'),
        action: () => this.confirm('restart', () => this.restart()),
      },
      {
        label: () => (armed('quit') ? 'Quit to title? Click again' : 'Quit to title'),
        action: () => this.confirm('quit', () => this.quit()),
      },
    ]);
  }

  private confirm(which: 'restart' | 'quit', then: () => void): void {
    if (this.armed?.which === which && this.time.now < this.armed.until) {
      then();
      return;
    }
    this.armed = { which, until: this.time.now + CONFIRM_MS };
  }

  private resume(): void {
    this.menu?.destroy();
    this.menu = null;
    this.scene.stop();
    this.scene.resume('Run');
  }

  private openSettings(): void {
    this.menu?.destroy();
    this.menu = null;
    this.scene.launch('Settings', { from: 'Pause' });
    this.scene.sleep();
  }

  private restart(): void {
    this.scene.stop('Hud');
    this.scene.stop('Run');
    this.scene.start('Run');
  }

  private quit(): void {
    clearSavedRun();
    this.scene.stop('Hud');
    this.scene.stop('Run');
    this.scene.start('Title');
  }
}
