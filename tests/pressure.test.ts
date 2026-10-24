import { describe, expect, it } from 'vitest';
import { PRESSURE } from '../src/config/pressure';
import { damageTile } from '../src/sim/combat';
import { coreTile } from '../src/sim/grid';
import { pressureBudget, pressureHp, updatePressure } from '../src/sim/pressure';
import { spawnEnemy } from '../src/sim/spawner';
import { createWorld } from '../src/sim/world';

const DT = 1 / 60;

function run(w: ReturnType<typeof createWorld>, seconds: number) {
  for (let i = 0; i < seconds / DT; i++) {
    w.time += DT;
    updatePressure(w, DT);
  }
}

describe('adaptive pressure', () => {
  it('builds while the city takes no damage, up to the cap', () => {
    const w = createWorld(1);
    run(w, PRESSURE.graceSec);
    expect(w.pressure).toBeCloseTo(0, 1);
    run(w, 90);
    expect(w.pressure).toBeGreaterThan(1);
    run(w, 1000);
    expect(w.pressure).toBe(PRESSURE.max);
  });

  it('drains while the city is being hit', () => {
    const w = createWorld(1);
    const core = coreTile(w.city);
    if (!core) throw new Error('no core');
    run(w, 200);
    const before = w.pressure;
    for (let i = 0; i < 10 / DT; i++) {
      w.time += DT;
      damageTile(w, core, 0.01);
      updatePressure(w, DT);
    }
    expect(w.pressure).toBeLessThan(before);
  });

  it('makes more and tougher enemies', () => {
    const w = createWorld(1);
    const calm = spawnEnemy(w, 'swarmer', 0, 0).maxHp;
    w.pressure = PRESSURE.max;
    expect(pressureBudget(w)).toBeGreaterThan(1);
    expect(pressureHp(w)).toBeGreaterThan(1);
    expect(spawnEnemy(w, 'swarmer', 0, 0).maxHp).toBeCloseTo(calm * pressureHp(w));
  });
});
