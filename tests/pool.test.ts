import { describe, expect, it } from 'vitest';
import { PHASE2_POOL, PHASE3_POOL } from '../src/config/pieces';
import { TILES, type TileType } from '../src/config/tiles';
import { rollRunOffers } from '../src/sim/progression';
import { createRng } from '../src/sim/rng';
import { upgradeType } from '../src/sim/upgrades';

describe('Phase 3 pool', () => {
  it('has unique ids and the Phase 4 pieces', () => {
    const ids = PHASE3_POOL.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'i4-gatling',
        'l4-cannon',
        'z4-shield',
        'j4-repair',
        'p5-gatling',
        'v5-plating',
        'y5-saw',
      ]),
    );
    expect(ids).toHaveLength(28);
  });

  it('contains every tile type except the Core', () => {
    const types = new Set(PHASE3_POOL.flatMap((p) => p.cells.map((c) => c.tile)));
    const all = (Object.keys(TILES) as TileType[]).filter((t) => t !== 'core');
    expect([...types].sort()).toEqual(all.sort());
  });

  it('support pieces are about a third of the offer weight before 4:00', () => {
    const early = PHASE3_POOL.filter((p) => (p.minTime ?? 0) === 0);
    const total = early.reduce((s, p) => s + p.weight, 0);
    const support = early
      .filter((p) => TILES[upgradeType(p)].family === 'support')
      .reduce((s, p) => s + p.weight, 0);
    expect(support / total).toBeGreaterThan(0.28);
    expect(support / total).toBeLessThan(0.38);
  });

  it('offers pentominoes only from their minimum time', () => {
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) {
      const offers = rollRunOffers(rng, PHASE3_POOL, 3, 100);
      expect(offers.every((p) => p.cells.length < 5)).toBe(true);
    }
    const late = Array.from({ length: 200 }, () => rollRunOffers(rng, PHASE3_POOL, 3, 300)).flat();
    expect(late.some((p) => p.cells.length === 5)).toBe(true);
  });

  it('never offers three cards of the same main tile type', () => {
    const rng = createRng(5);
    // Gatling-heavy pool with one way out.
    const pool = [
      ...PHASE2_POOL.filter((p) => upgradeType(p) === 'gatling'),
      ...PHASE2_POOL.filter((p) => p.id === 'mono-hull'),
    ];
    for (let i = 0; i < 300; i++) {
      const types = new Set(rollRunOffers(rng, pool, 3, 0).map(upgradeType));
      expect(types.size).toBeGreaterThan(1);
    }
  });
});
