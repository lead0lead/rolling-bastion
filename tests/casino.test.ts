import { describe, expect, it } from 'vitest';
import { CASINO } from '../src/config/casino';
import { SHOP_PIECES } from '../src/config/pieces';
import { startBuild } from '../src/sim/build';
import { spin } from '../src/sim/casino';
import { createCity } from '../src/sim/grid';
import { createRng } from '../src/sim/rng';

const session = (coins: number) => {
  const shop = { coins, landsBought: 0 };
  return { s: startBuild(createCity(), SHOP_PIECES, null, shop), shop };
};

describe('casino', () => {
  it('has a house edge but is not stingy', () => {
    const ev = CASINO.segments.reduce((s, [m]) => s + m, 0) / CASINO.segments.length;
    expect(ev).toBeGreaterThan(0.8);
    expect(ev).toBeLessThan(0.95);
  });

  it('takes the bet, pays out and limits the spins per visit', () => {
    const { s, shop } = session(1000);
    const rng = createRng(1);
    for (let i = 0; i < CASINO.maxSpins; i++) {
      const before = shop.coins;
      const r = spin(s, rng, 10);
      expect(shop.coins).toBe(before - 10 + (r?.payout ?? 0));
    }
    expect(spin(s, rng, 10)).toBeNull();
  });

  it('refuses a bet the player cannot pay and cannot be undone afterwards', () => {
    const { s, shop } = session(4);
    expect(spin(s, createRng(1), 5)).toBeNull();
    shop.coins = 50;
    s.history.push({} as never);
    spin(s, createRng(1), 5);
    expect(s.history).toHaveLength(0);
  });
});
