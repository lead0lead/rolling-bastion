import Phaser from 'phaser';
import { MenuPanel } from '../render/menu';
import { settings, SETTINGS_LIMITS, updateSettings } from '../settings';

const onOff = (on: boolean) => (on ? 'on' : 'off');

/**
 * Settings panel (concept.md §8), opened from the pause menu or the title
 * screen. `from` is the scene to wake again when it closes.
 */
export class SettingsScene extends Phaser.Scene {
  private menu: MenuPanel | null = null;
  private from = 'Title';

  constructor() {
    super('Settings');
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? 'Title';
  }

  create(): void {
    const step = SETTINGS_LIMITS.volumeStep;
    const setVolume = (v: number) => updateSettings({ volume: v });
    this.menu = new MenuPanel(this, 'Settings', [
      {
        label: () => `◀  Volume ${Math.round(settings().volume * 100)}%  ▶`,
        left: () => setVolume(settings().volume - step),
        right: () => setVolume(settings().volume + step),
      },
      {
        label: () => `Sound: ${settings().muted ? 'muted' : 'on'}  (M)`,
        action: () => updateSettings({ muted: !settings().muted }),
      },
      {
        label: () => `Reduce effects: ${onOff(settings().reduceEffects)}`,
        action: () => updateSettings({ reduceEffects: !settings().reduceEffects }),
      },
      {
        label: () => `Show FPS: ${onOff(settings().showFps)}`,
        action: () => updateSettings({ showFps: !settings().showFps }),
      },
      { label: () => 'Back', action: () => this.close() },
    ]);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.close();
      // M mutes anywhere (main.ts); refresh so the row shows it.
      if (e.code === 'KeyM') this.time.delayedCall(0, () => this.menu?.refresh());
    });
  }

  private close(): void {
    this.menu?.destroy();
    this.menu = null;
    this.scene.stop();
    this.scene.wake(this.from);
  }
}
