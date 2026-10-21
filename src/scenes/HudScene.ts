import Phaser from 'phaser';
import { WAVE_PLAN } from '../config/economy';
import { BOSS, ENEMIES } from '../config/enemies';
import { COLORS, FONT } from '../render/palette';
import { budgetRate } from '../sim/spawner';
import { coreTile } from '../sim/grid';
import { isBossWave, spawnClock, waveTimeLeft } from '../sim/waves';
import { settings } from '../settings';
import { bossEnraged } from '../sim/world';
import type { RunUiState } from './RunScene';

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
  private bannerMode = '';
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
        color: COLORS.textInfo,
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
    const g = this.g;
    g.clear();

    // Spike A: wave and its countdown instead of the run timer; coins instead of level and XP.
    const boss = isBossWave(w);
    const left = Math.ceil(waveTimeLeft(w));
    this.timer.setText(
      boss
        ? 'BOSS WAVE'
        : `Wave ${w.wave}/${WAVE_PLAN.count}   ${Math.floor(left / 60)}:${(left % 60).toString().padStart(2, '0')}`,
    );
    this.level.setText(`${w.coins} coins`);
    this.info.setText(`Grid ${w.city.gridSize}×${w.city.gridSize}\nKills ${w.kills}`);

    const core = coreTile(w.city);
    const frac = core ? Math.max(0, core.hp / core.maxHp) : 0;
    const x = 640 - CORE_BAR.w / 2;
    g.fillStyle(COLORS.barBack, 1);
    g.fillRect(x, CORE_BAR.y - CORE_BAR.h, CORE_BAR.w, CORE_BAR.h);
    g.fillStyle(frac < 0.3 ? COLORS.coreLow : COLORS.core, 1);
    g.fillRect(x, CORE_BAR.y - CORE_BAR.h, CORE_BAR.w * frac, CORE_BAR.h);
    this.coreText.setText(`Core ${Math.ceil(core?.hp ?? 0)} / ${Math.round(core?.maxHp ?? 0)}`);

    const bossEnemy = w.boss;
    this.bossText.setVisible(!!bossEnemy);
    if (bossEnemy) {
      const enraged = bossEnraged(w);
      const bx = 640 - BOSS_BAR.w / 2;
      g.fillStyle(COLORS.barBack, 1);
      g.fillRect(bx, BOSS_BAR.y, BOSS_BAR.w, BOSS_BAR.h);
      g.fillStyle(enraged ? COLORS.bossEnraged : COLORS.boss, 1);
      g.fillRect(
        bx,
        BOSS_BAR.y,
        BOSS_BAR.w * Math.max(0, bossEnemy.hp / bossEnemy.maxHp),
        BOSS_BAR.h,
      );
      this.bossText.setText(`${ENEMIES[bossEnemy.type].name}${enraged ? '  —  ENRAGED' : ''}`);
    }

    // Banners: boss phase, "WAVE n CLEARED", or the wave start.
    const phaseAge = w.time - w.bossState.phaseAt;
    const startAge = w.time - w.waveStart;
    let mode = '';
    let alpha = 1;
    let color: string = COLORS.textInfo;
    if (phaseAge < BOSS.bannerSec) {
      mode = `PHASE ${w.bossState.phase}`;
      color = COLORS.textBoss;
      alpha = Math.min(1, (BOSS.bannerSec - phaseAge) / 0.5);
    } else if (w.waveCleared) {
      mode = `WAVE ${w.wave} CLEARED`;
    } else if (startAge < WAVE_PLAN.startBannerSec) {
      mode = boss ? 'BOSS WAVE' : `WAVE ${w.wave}`;
      if (boss) color = COLORS.textBoss;
      alpha = Math.min(1, (WAVE_PLAN.startBannerSec - startAge) / 0.5);
    }
    if (mode !== this.bannerMode) {
      // Text style changes re-render the texture, so only change them when needed.
      this.bannerMode = mode;
      this.banner.setText(mode).setColor(color);
    }
    this.banner.setVisible(mode !== '').setAlpha(alpha);

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
          `spawn budget ${budgetRate(spawnClock(w)).toFixed(2)}/s  combat ${w.time.toFixed(1)} s  v1 clock ${spawnClock(w).toFixed(0)} s`,
          `E spawns: ${ui.debugEnemy}  ([ / ] to change)`,
          `god mode ${w.godMode ? 'ON' : 'off'} (I)`,
          'G +50 coins · T end wave · J jump to boss · K kill all · H hurt boss 35% · L layout',
          'F3 fill grid with Gatlings',
        ].join('\n'),
      );
    }
  }
}
