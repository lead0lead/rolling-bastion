import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { MenuPanel } from '../render/menu';

export interface VictorySceneData {
  keepGoing: () => void;
  endRun: () => void;
}

/**
 * After the boss kill (concept-v2.md §2.11): "Keep going" resumes the run in
 * endless, "End run" goes to the end screen. No Esc: the player picks one.
 */
export class VictoryScene extends Phaser.Scene {
  private menu: MenuPanel | null = null;

  constructor() {
    super('Victory');
  }

  create(data: VictorySceneData): void {
    playSfx(this, 'win');
    const pick = (then: () => void) => () => {
      this.menu?.destroy();
      this.menu = null;
      this.scene.stop();
      then();
    };
    this.menu = new MenuPanel(this, 'Colossus defeated!', [
      { label: () => 'Keep going', action: pick(data.keepGoing) },
      { label: () => 'End run', action: pick(data.endRun) },
    ]);
  }
}
