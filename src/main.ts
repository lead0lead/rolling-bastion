import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { BuildScene } from './scenes/BuildScene';
import { HudScene } from './scenes/HudScene';
import { RunScene } from './scenes/RunScene';
import { SummaryScene } from './scenes/SummaryScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d0f14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [BootScene, RunScene, HudScene, BuildScene, SummaryScene],
});
