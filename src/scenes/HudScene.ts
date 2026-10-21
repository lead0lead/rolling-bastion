import Phaser from 'phaser';
import { BOSS, ENEMIES } from '../config/enemies';
import { COLORS, FONT } from '../render/palette';
import { budgetRate } from '../sim/spawner';
import { coreTile } from '../sim/grid';
import { xpToNext } from '../sim/progression';
import { settings } from '../settings';
import { bossEnraged } from '../sim/world';
import type { RunUiState } from './RunScene';

const XP_BAR = { h: 8 };
const CORE_BAR = { w: 360, h: 14, y: 690 };
const BOSS_BAR = { w: 560, h: 12, y: 74 };
const FPS_REFRESH_MS = 250;

/** Run HUD (concept.md §8), drawn unzoomed over the run. */
export class HudScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private timer!: Phaser.GameObjects.Text;
  private level!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private coreText!: Phaser.GameObjects.Text;
  private debug!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private fps!: Phaser.GameObjects.Text;
  private fpsAt = 0;
  private bossText!: Phaser.GameObjects.Text;

  constructor() {
    super('Hud');
  }

  create(): void {
    // White outline keeps HUD text readable over crowds of enemies.
    const text = {
      fontFamily: FONT.family,
      fontStyle: FONT.weight,
      color: COLORS.text,
      stroke: '#ffffff',
      strokeThickness: 4,
    };
    this.g = this.add.graphics();
    this.timer = this.add
      .text(640, 16, '', { ...text, fontStyle: FONT.bold, fontSize: '26px' })
      .setOrigin(0.5, 0);
    this.level = this.add.text(12, 16, '', { ...text, fontSize: '18px' });
    this.info = this.add
      .text(1268, 16, '', { ...text, fontSize: '14px', color: COLORS.textDim, align: 'right' })
      .setOrigin(1, 0);
    this.coreText = this.add
      .text(640, CORE_BAR.y - 18, '', { ...text, fontSize: '13px' })
      .setOrigin(0.5, 1);
    this.bossText = this.add
      .text(640, BOSS_BAR.y - 4, '', { ...text, fontSize: '13px' })
      .setOrigin(0.5, 1);
    this.fps = this.add
      .text(12, 44, '', { ...text, fontSize: '14px', color: COLORS.textDim })
      .setVisible(false);
    this.banner = this.add
      .text(640, 120, '', {
        ...text,
        fontStyle: FONT.bold,
        fontSize: '32px',
        color: COLORS.textBoss,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.debug = this.add.text(12, 50, '', {
      ...text,
      fontSize: '13px',
      backgroundColor: '#ffffffdd',
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
    g.fillStyle(COLORS.barBack, 1);
    g.fillRect(0, 0, width, XP_BAR.h);
    g.fillStyle(COLORS.xp, 1);
    g.fillRect(0, 0, width * Math.min(1, w.xp / need), XP_BAR.h);

    const mins = Math.floor(w.time / 60);
    const secs = Math.floor(w.time % 60);
    this.timer.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
    this.level.setText(`Lv ${w.level}`);
    this.info.setText(
      `Board ${w.city.board.size}  ·  Tiles ${w.city.tiles.length}  ·  Speed ${Math.round(w.cache.syn.speedFactor * 100)}%\nRerolls ${w.rerolls}\nKills ${w.kills}`,
    );

    const core = coreTile(w.city);
    const frac = core ? Math.max(0, core.hp / core.maxHp) : 0;
    const x = 640 - CORE_BAR.w / 2;
    g.fillStyle(COLORS.barBack, 1);
    g.fillRect(x, CORE_BAR.y - CORE_BAR.h, CORE_BAR.w, CORE_BAR.h);
    g.fillStyle(frac < 0.3 ? COLORS.coreLow : COLORS.core, 1);
    g.fillRect(x, CORE_BAR.y - CORE_BAR.h, CORE_BAR.w * frac, CORE_BAR.h);
    this.coreText.setText(`Core ${Math.ceil(core?.hp ?? 0)} / ${Math.round(core?.maxHp ?? 0)}`);

    const boss = w.boss;
    this.bossText.setVisible(!!boss);
    if (boss) {
      const enraged = bossEnraged(w);
      const bx = 640 - BOSS_BAR.w / 2;
      g.fillStyle(COLORS.barBack, 1);
      g.fillRect(bx, BOSS_BAR.y, BOSS_BAR.w, BOSS_BAR.h);
      g.fillStyle(enraged ? COLORS.bossEnraged : COLORS.boss, 1);
      g.fillRect(bx, BOSS_BAR.y, BOSS_BAR.w * Math.max(0, boss.hp / boss.maxHp), BOSS_BAR.h);
      this.bossText.setText(`${ENEMIES[boss.type].name}${enraged ? '  —  ENRAGED' : ''}`);
    }

    // Boss phase banner.
    const phaseAge = w.time - w.bossState.phaseAt;
    const phaseBanner = phaseAge < BOSS.bannerSec;
    this.banner
      .setVisible(phaseBanner)
      .setText(`PHASE ${w.bossState.phase}`)
      .setAlpha(Math.min(1, (BOSS.bannerSec - phaseAge) / 0.5));

    // Settings → Show FPS (concept.md §8); refreshed a few times a second.
    const showFps = settings().showFps && !ui.debugOverlay;
    this.fps.setVisible(showFps);
    if (showFps && this.time.now - this.fpsAt > FPS_REFRESH_MS) {
      this.fpsAt = this.time.now;
      this.fps.setText(`${this.game.loop.actualFps.toFixed(0)} fps`);
    }

    this.debug.setVisible(ui.debugOverlay);
    if (ui.debugOverlay) {
      this.debug.setText(
        [
          `FPS ${this.game.loop.actualFps.toFixed(0)}  ·  sim ${ui.simMs.toFixed(2)} ms  ·  draw prep ${ui.drawMs.toFixed(2)} ms`,
          `enemies ${w.enemies.length}  projectiles ${w.projectiles.length}  gems ${w.gems.length}`,
          `spawn budget ${budgetRate(w.time).toFixed(2)}/s  time ${w.time.toFixed(1)} s`,
          `E spawns: ${ui.debugEnemy}  ([ / ] to change)`,
          `god mode ${w.godMode ? 'ON' : 'off'} (I)`,
          'G level · T +60 s · K kill all · H hurt boss 35% · L layout',
          'F2 level-up with land · F3 fill the board with Gatlings',
        ].join('\n'),
      );
    }
  }
}
