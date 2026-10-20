import Phaser from 'phaser';
import { GRID } from '../config/balance';
import { COLORS } from '../render/tiles';
import { budgetRate } from '../sim/spawner';
import { coreTile } from '../sim/grid';
import { xpToNext } from '../sim/progression';
import type { RunUiState } from './RunScene';

const XP_BAR = { h: 8, color: 0x3ff0ff };
const CORE_BAR = { w: 360, h: 14, y: 690, color: 0xf4f6fb, low: 0xff4d5e };

/** Run HUD (concept.md §8), drawn unzoomed over the run. */
export class HudScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private timer!: Phaser.GameObjects.Text;
  private level!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private coreText!: Phaser.GameObjects.Text;
  private debug!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;

  constructor() {
    super('Hud');
  }

  create(): void {
    const text = { fontFamily: 'monospace', color: COLORS.text };
    this.g = this.add.graphics();
    this.timer = this.add.text(640, 16, '', { ...text, fontSize: '26px' }).setOrigin(0.5, 0);
    this.level = this.add.text(12, 16, '', { ...text, fontSize: '18px' });
    this.info = this.add
      .text(1268, 16, '', { ...text, fontSize: '14px', color: COLORS.textDim, align: 'right' })
      .setOrigin(1, 0);
    this.coreText = this.add
      .text(640, CORE_BAR.y - 18, '', { ...text, fontSize: '13px' })
      .setOrigin(0.5, 1);
    this.banner = this.add
      .text(640, 120, 'GRID EXPANDED', { ...text, fontSize: '32px', color: '#9fe8ff' })
      .setOrigin(0.5)
      .setVisible(false);
    this.debug = this.add.text(12, 50, '', {
      ...text,
      fontSize: '13px',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 6 },
    });
  }

  override update(): void {
    const ui = this.registry.get('run') as RunUiState | undefined;
    if (!ui) return;
    const w = ui.world;
    const { width } = this.scale;
    const g = this.g;
    g.clear();

    const need = xpToNext(w.level);
    g.fillStyle(0x1b2230, 1);
    g.fillRect(0, 0, width, XP_BAR.h);
    g.fillStyle(XP_BAR.color, 1);
    g.fillRect(0, 0, width * Math.min(1, w.xp / need), XP_BAR.h);

    const mins = Math.floor(w.time / 60);
    const secs = Math.floor(w.time % 60);
    this.timer.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
    this.level.setText(`Lv ${w.level}`);
    this.info.setText(
      `Grid ${w.city.gridSize}×${w.city.gridSize}\nRerolls ${w.rerolls}\nKills ${w.kills}`,
    );

    const core = coreTile(w.city);
    const frac = core ? Math.max(0, core.hp / core.maxHp) : 0;
    const x = 640 - CORE_BAR.w / 2;
    g.fillStyle(0x1b2230, 1);
    g.fillRect(x, CORE_BAR.y - CORE_BAR.h, CORE_BAR.w, CORE_BAR.h);
    g.fillStyle(frac < 0.3 ? CORE_BAR.low : CORE_BAR.color, 1);
    g.fillRect(x, CORE_BAR.y - CORE_BAR.h, CORE_BAR.w * frac, CORE_BAR.h);
    this.coreText.setText(`Core ${Math.ceil(core?.hp ?? 0)} / ${Math.round(core?.maxHp ?? 0)}`);

    const bannerAge = w.time - w.expandedAt;
    this.banner
      .setVisible(bannerAge < GRID.bannerSec)
      .setAlpha(Math.min(1, (GRID.bannerSec - bannerAge) / 0.5));

    this.debug.setVisible(ui.debugOverlay);
    if (ui.debugOverlay) {
      this.debug.setText(
        [
          `FPS ${this.game.loop.actualFps.toFixed(0)}  ·  sim ${ui.simMs.toFixed(2)} ms  ·  draw prep ${ui.drawMs.toFixed(2)} ms`,
          `enemies ${w.enemies.length}  projectiles ${w.projectiles.length}  gems ${w.gems.length}`,
          `spawn budget ${budgetRate(w.time).toFixed(2)}/s  time ${w.time.toFixed(1)} s`,
          `E spawns: ${ui.debugEnemy}  ([ / ] to change)`,
          `god mode ${w.godMode ? 'ON' : 'off'} (I)`,
          'G level · T +60 s · K kill all · P layout',
          'F2 grow grid · F3 fill grid with Gatlings',
        ].join('\n'),
      );
    }
  }
}
