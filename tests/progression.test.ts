import { describe, expect, it } from 'vitest';
import { SANDBOX_POOL } from '../src/config/pieces';
import { rollOffers } from '../src/sim/progression';
import { createRng } from '../src/sim/rng';

describe('rollOffers', () => {
  it('returns distinct pieces, deterministic per seed', () => {
    const a = rollOffers(createRng(5), SANDBOX_POOL, 3);
    const b = rollOffers(createRng(5), SANDBOX_POOL, 3);
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
    expect(new Set(a.map((p) => p.id)).size).toBe(3);
  });

  it('respects weights', () => {
    const pool = [
      { id: 'common', weight: 99, cells: [{ x: 0, y: 0, tile: 'hull' as const }] },
      { id: 'rare', weight: 1, cells: [{ x: 0, y: 0, tile: 'hull' as const }] },
    ];
    const rng = createRng(1);
    let common = 0;
    for (let i = 0; i < 1000; i++) if (rollOffers(rng, pool, 1)[0]?.id === 'common') common++;
    expect(common).toBeGreaterThan(950);
  });

  it('returns fewer offers when the pool is small', () => {
    expect(rollOffers(createRng(1), SANDBOX_POOL.slice(0, 2), 3)).toHaveLength(2);
  });
});
