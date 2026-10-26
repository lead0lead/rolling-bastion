import Phaser from 'phaser';
import { BOSS, ENEMIES } from '../config/enemies';
import { SIM } from '../config/balance';
import { COLORS, FONT } from '../render/palette';
import { coreTile } from '../sim/grid';
import { settings } from '../settings';
import { endlessFactor, roundBudget, roundsToBoss } from '../sim/endless';
import { bossEnraged, type World } from '../sim/world';
import type { RunUiState } from './RunScene';

/** Speed slider (top right): track start x, width, y, and the hit area around it. */
const SPEED = { x: 1090, w: 160, y: 22, hit: { x: 1010, y: 6, w: 258, h: 42 } };
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
  private speedText!: Phaser.GameObjects.Text;
  private speedLabels: Phaser.GameObjects.Text[] = [];
  private draggingSpeed = false;

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
      .text(1268, 54, '', { ...text, fontSize: '14px', color: COLORS.textDim, align: 'right' })
      .setOrigin(1, 0);
    this.coreText = this.add
      .text(640, CORE_BAR.y - 18, '', { ...text, fontSize: '13px' })
      .setOrigin(0.5, 1);
    this.speedText = this.add.text(SPEED.hit.x + 4, 12, 'Speed', { ...text, fontSize: '14px' });
    this.speedLabels = SIM.speeds.map((s, i) =>
      this.add
        .text(this.notchX(i), SPEED.y + 12, `${s}×`, {
          ...text,
          fontSize: '12px',
          color: COLORS.textDim,
        })
        .setOrigin(0.5, 0),
    );
    this.draggingSpeed = false;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.scene.isPaused('Run') || !this.inSlider(p.x, p.y)) return;
      this.draggingSpeed = true;
      this.pickSpeed(p.x);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.draggingSpeed) this.pickSpeed(p.x);
    });
    this.input.on('pointerup', () => (this.draggingSpeed = false));
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

  private notchX(i: number): number {
    return SPEED.x + (SPEED.w * i) / (SIM.speeds.length - 1);
  }

  private inSlider(x: number, y: number): boolean {
    const r = SPEED.hit;
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  }

  /** Sets the game speed to the notch nearest to screen x. */
  private pickSpeed(x: number): void {
    const ui = this.registry.get('run') as RunUiState | undefined;
    if (!ui) return;
    let best = 0;
    SIM.speeds.forEach((_, i) => {
      if (Math.abs(this.notchX(i) - x) < Math.abs(this.notchX(best) - x)) best = i;
    });
    ui.speed = SIM.speeds[best] ?? 1;
  }

  private drawSpeed(ui: RunUiState): void {
    const g = this.g;
    const active = Math.max(0, SIM.speeds.indexOf(ui.speed as (typeof SIM.speeds)[number]));
    g.lineStyle(4, COLORS.barBack, 1);
    g.lineBetween(SPEED.x, SPEED.y, SPEED.x + SPEED.w, SPEED.y);
    g.lineStyle(4, COLORS.xp, 1);
    g.lineBetween(SPEED.x, SPEED.y, this.notchX(active), SPEED.y);
    SIM.speeds.forEach((_, i) => {
      g.fillStyle(i <= active ? COLORS.xp : COLORS.barBack, 1);
      g.fillCircle(this.notchX(i), SPEED.y, 4);
      this.speedLabels[i]?.setColor(i === active ? COLORS.text : COLORS.textDim);
    });
    g.fillStyle(COLORS.xp, 1);
    g.fillCircle(this.notchX(active), SPEED.y, 9);
    g.lineStyle(2, COLORS.ink, 1);
    g.strokeCircle(this.notchX(active), SPEED.y, 9);
    this.speedText.setText(`Speed ${ui.speed}×`);
  }

  override update(): void {
    const ui = this.registry.get('run') as RunUiState | undefined;
    if (!ui) return;
    const w = ui.world;
    const g = this.g;
    g.clear();

    this.timer.setText(`Round ${w.round}`);
    this.level.setText(`Coins ${Math.floor(w.coins)}`);
    this.drawSpeed(ui);
    this.info.setText(
      `Kills ${w.kills}${endlessLine(w)}`,
    );

    const core = coreTile(w.city);
    const frac = core ? Math.max(0, core.hp / core.maxHp) : 0;
    const x = 640 - CORE_BAR.w / 2;
    g.fillStyle(COLORS.barBack, 1);
    g.fillRect(x, CORE_BAR.y - CORE_BAR.h, CORE_BAR.w, CORE_BAR.h);
    g.fillStyle(frac < 0.3 ? COLORS.coreLow : COLORS.core, 1);
    g.fillRect(x, CORE_BAR.y - CORE_BAR.h, CORE_BAR.w * frac, CORE_BAR.h);
    this.coreText.setText(`Core ${Math.ceil(core?.hp ?? 0)} / ${Math.round(core?.maxHp ?? 0)}`);

    // The Disco Robot gets the boss bar too (the first live one if there are several).
    const boss = w.boss ?? w.enemies.find((e) => !e.dead && ENEMIES[e.type].disco);
    this.bossText.setVisible(!!boss);
    if (boss) {
      const enraged = boss === w.boss && bossEnraged(w);
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
          `enemies ${w.enemies.length}  projectiles ${w.projectiles.length}`,
          `round ${w.round}: budget ${roundBudget(w.round).toFixed(0)}, unspawned ${w.spawn.left.toFixed(1)}  time ${w.time.toFixed(1)} s`,
          `N spawns: ${ui.debugEnemy}  ([ / ] to change)`,
          `god mode ${w.godMode ? 'ON' : 'off'} (I)`,
          'G +100 coins · K kill all · H hurt boss 35% · J kill boss · L layout',
          'F2 +1000 coins · F3 fill the board with Gatlings',
        ].join('\n'),
      );
    }
  }
}

/** Endless status (concept-v2.md §2.11): enemy strength and the next Colossus. */
function endlessLine(w: World): string {
  const next = roundsToBoss(w);
  if (next === null) return '';
  const strength = `Endless  ·  enemies ×${endlessFactor(w).toFixed(2)}`;
  if (w.boss) return `\n${strength}`;
  return `\n${strength}\nColossus ${next === 0 ? 'is here' : `in ${next} round${next === 1 ? '' : 's'}`}`;
}
