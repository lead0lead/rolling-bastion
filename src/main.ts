import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { BuildScene } from './scenes/BuildScene';

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
  scene: [BootScene, BuildScene],
});
