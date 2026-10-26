import Phaser from 'phaser';
import { COLORS, css, FONT } from './render/palette';
import { settings, updateSettings } from './settings';
import { BootScene } from './scenes/BootScene';
import { BuildScene } from './scenes/BuildScene';
import { CasinoScene } from './scenes/CasinoScene';
import { HudScene } from './scenes/HudScene';
import { PauseScene } from './scenes/PauseScene';
import { RunScene } from './scenes/RunScene';
import { SettingsScene } from './scenes/SettingsScene';
import { SummaryScene } from './scenes/SummaryScene';
import { TitleScene } from './scenes/TitleScene';

// Phaser draws text to canvases, so the bundled font must be loaded first (concept.md §6).
async function loadFonts(): Promise<void> {
  try {
    await Promise.all(
      [FONT.weight, FONT.bold].map((w) => document.fonts.load(`${w} 16px Fredoka`)),
    );
  } catch {
    console.warn('Fredoka font failed to load; using fallback fonts');
  }
}

await loadFonts();

// M toggles mute anywhere (concept.md §8).
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) updateSettings({ muted: !settings().muted });
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: css(COLORS.background),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [
    BootScene,
    TitleScene,
    RunScene,
    HudScene,
    BuildScene,
    CasinoScene,
    PauseScene,
    SettingsScene,
    SummaryScene,
  ],
});
