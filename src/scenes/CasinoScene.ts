import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { CASINO } from '../config/casino';
import { COLORS, css, FONT } from '../render/palette';
import type { BuildSession } from '../sim/build';
import { canSpin, spin } from '../sim/casino';
import { createRng } from '../sim/rng';

export interface CasinoSceneData {
  session: BuildSession;
}

const CX = 640;
const CY = 330;
const R = 200;
const SEG = (Math.PI * 2) / CASINO.segments.length;
const FELT = 0x14532d;
const GOLD = 0xe9c46a;

/**
 * The shop's casino (concept-v2.md §2.18): a roulette wheel over the paused build screen.
 * The result is rolled up front (sim/casino.ts); the wheel then spins to it.
 */
export class CasinoScene extends Phaser.Scene {
  private session!: BuildSession;
  private rng = createRng((Date.now() ^ (performance.now() * 1000)) >>> 0);
  private wheel!: Phaser.GameObjects.Container;
  private bulbs: Phaser.GameObjects.Arc[] = [];
  private info!: Phaser.GameObjects.Text;
  private result!: Phaser.GameObjects.Text;
  private bet: number = CASINO.bets[0];
  private betBtns: Phaser.GameObjects.Text[] = [];
  private spinBtn!: Phaser.GameObjects.Text;
  private spinning = false;

  constructor() {
    super('Casino');
  }

  create(data: CasinoSceneData): void {
    this.session = data.session;
    this.spinning = false;
    this.bet = CASINO.bets[0];
    this.bulbs = [];
    this.betBtns = [];
    const font = { fontFamily: FONT.family, fontStyle: FONT.bold, color: '#ffffff' };

    this.add.rectangle(640, 360, 1280, 720, FELT, 0.94).setInteractive();
    this.add
      .text(CX, 36, 'CASINO', { ...font, fontSize: '44px', color: css(GOLD) })
      .setOrigin(0.5, 0);
    this.add.circle(CX, CY, R + 18, 0x3d2b1f).setStrokeStyle(6, GOLD);

    // The wheel: wedges and multiplier labels in one container that turns.
    const g = this.add.graphics();
    this.wheel = this.add.container(CX, CY, [g]);
    CASINO.segments.forEach(([mult, color], i) => {
      const a0 = i * SEG - Math.PI / 2 - SEG / 2;
      g.fillStyle(color, 1)
        .slice(0, 0, R, a0, a0 + SEG, false)
        .fillPath();
      g.lineStyle(2, 0xffffff, 0.35)
        .slice(0, 0, R, a0, a0 + SEG, false)
        .strokePath();
      const a = a0 + SEG / 2;
      this.wheel.add(
        this.add
          .text(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, mult ? `×${mult}` : '✕', {
            ...font,
            fontSize: mult >= 3 ? '24px' : '19px',
          })
          .setOrigin(0.5)
          .setRotation(a + Math.PI / 2),
      );
    });
    this.add.circle(CX, CY, 34, 0x3d2b1f).setStrokeStyle(4, GOLD);

    // Marquee lights around the rim, and the pointer at the top.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.bulbs.push(
        this.add.circle(CX + Math.cos(a) * (R + 12), CY + Math.sin(a) * (R + 12), 5, GOLD),
      );
    }
    this.add
      .triangle(CX, CY - R - 14, -16, -22, 16, -22, 0, 12, 0xffffff)
      .setStrokeStyle(3, 0x000000);

    this.info = this.add.text(CX, 565, '', { ...font, fontSize: '20px' }).setOrigin(0.5);
    this.result = this.add
      .text(CX, CY, '', { ...font, fontSize: '72px', stroke: '#000000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(10);

    CASINO.bets.forEach((b, i) => {
      this.betBtns.push(
        this.button(CX - 225 + i * 100, 610, `${b}`, 80, () => {
          if (!this.spinning) this.bet = b;
          this.refresh();
        }),
      );
    });
    this.spinBtn = this.button(CX + 200, 610, 'SPIN', 140, () => this.doSpin());
    this.button(CX, 668, 'Leave (Esc)', 160, () => this.close());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.close();
      else if (e.code === 'Enter' || e.code === 'Space') this.doSpin();
    });
    // Idle shimmer on the rim.
    this.time.addEvent({
      delay: 160,
      loop: true,
      callback: () =>
        this.bulbs.forEach((l, i) =>
          l.setAlpha((i + Math.floor(this.time.now / 160)) % 2 ? 1 : 0.35),
        ),
    });
    this.refresh();
  }

  private button(x: number, y: number, label: string, w: number, action: () => void) {
    return this.add
      .text(x, y, label, {
        fontFamily: FONT.family,
        fontStyle: FONT.bold,
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#2b2f3a',
        fixedWidth: w,
        align: 'center',
        padding: { y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        playSfx(this, 'ui-click');
        action();
      });
  }

  private refresh(): void {
    const s = this.session;
    const left = CASINO.maxSpins - (s.shop?.spins ?? 0);
    this.info.setText(
      `Coins ${Math.floor(s.shop?.coins ?? 0)}   ·   Bet ${this.bet}   ·   Spins left ${left}`,
    );
    this.betBtns.forEach((b, i) => {
      const bet = CASINO.bets[i] ?? 0;
      b.setBackgroundColor(bet === this.bet ? css(COLORS.confirm) : '#2b2f3a');
      b.setAlpha((s.shop?.coins ?? 0) >= bet ? 1 : 0.4);
    });
    this.spinBtn.setAlpha(!this.spinning && canSpin(s, this.bet) ? 1 : 0.4);
  }

  private doSpin(): void {
    if (this.spinning) return;
    const res = spin(this.session, this.rng, this.bet);
    if (!res) {
      playSfx(this, 'ui-error');
      return;
    }
    this.spinning = true;
    this.result.setAlpha(0);
    this.refresh();
    // The wheel turns clockwise, so the winning wedge ends up under the pointer at the top.
    const target =
      this.wheel.rotation +
      Math.PI * 2 * CASINO.turns -
      (this.wheel.rotation % (Math.PI * 2)) -
      res.segment * SEG;
    let lastTick = -1;
    this.tweens.add({
      targets: this.wheel,
      rotation: target,
      duration: CASINO.spinMs,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const tick = Math.floor((this.wheel.rotation + SEG / 2) / SEG);
        if (tick !== lastTick) {
          lastTick = tick;
          playSfx(this, 'casino-tick', (Math.random() - 0.5) * 200);
        }
      },
      onComplete: () => this.reveal(res.payout),
    });
    // Lights chase faster while it spins.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: CASINO.spinMs,
      onUpdate: (t) =>
        this.bulbs.forEach((l, i) =>
          l.setAlpha((i + Math.floor((t.getValue() ?? 0) * 90)) % 3 ? 0.3 : 1),
        ),
    });
  }

  private reveal(payout: number): void {
    const gain = payout - this.bet;
    const big = payout >= this.bet * 3;
    this.spinning = false;
    this.result
      .setText(payout === 0 ? 'BUST' : gain > 0 ? `+${gain}` : gain === 0 ? 'PUSH' : `${gain}`)
      .setColor(gain > 0 ? css(GOLD) : '#ffffff')
      .setAlpha(1)
      .setScale(0.3);
    this.tweens.add({
      targets: this.result,
      scale: big ? 1.5 : 1,
      duration: 350,
      ease: 'Back.easeOut',
    });
    this.tweens.add({ targets: this.result, alpha: 0, delay: 1400, duration: 400 });
    playSfx(this, big ? 'casino-big' : gain > 0 ? 'casino-win' : 'casino-lose');
    if (gain > 0) this.coinBurst(big ? 40 : 16);
    if (big) this.cameras.main.shake(400, 0.01).flash(300, 255, 230, 120);
    this.refresh();
  }

  private coinBurst(n: number): void {
    for (let i = 0; i < n; i++) {
      const coin = this.add
        .circle(CX, CY, Phaser.Math.Between(5, 9), GOLD)
        .setStrokeStyle(2, 0xb8860b);
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(180, 420);
      this.tweens.add({
        targets: coin,
        x: CX + Math.cos(a) * d,
        y: CY + Math.sin(a) * d + 120,
        alpha: 0,
        duration: Phaser.Math.Between(700, 1200),
        ease: 'Quad.easeOut',
        onComplete: () => coin.destroy(),
      });
    }
  }

  private close(): void {
    if (this.spinning) return;
    this.scene.stop();
    this.scene.resume('Build');
  }
}
