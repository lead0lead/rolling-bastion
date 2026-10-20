import Phaser from 'phaser';
import { COLORS, css, FONT } from './render/palette';
import { BootScene } from './scenes/BootScene';
import { BuildScene } from './scenes/BuildScene';
import { HudScene } from './scenes/HudScene';
import { RunScene } from './scenes/RunScene';
import { SummaryScene } from './scenes/SummaryScene';

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
  scene: [BootScene, RunScene, HudScene, BuildScene, SummaryScene],
});
