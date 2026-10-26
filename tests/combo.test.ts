import { describe, expect, it } from 'vitest';
import { STATUS } from '../src/config/statuses';
import { ENEMIES } from '../src/config/enemies';
import {
  applyStatus,
  comboFactor,
  hasStatus,
  hitEnemy,
  statusSpeed,
  updateBurns,
} from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { spawnEnemy } from '../src/sim/spawner';
import { createWorld } from '../src/sim/world';

const DT = 1 / 60;

/** A world with one Swarmer far from the city (so it only walks). */
function oneEnemy(type: 'swarmer' | 'brute' | 'colossus' = 'swarmer') {
  const w = createWorld(1);
  const e = spawnEnemy(w, type, 2000, 0);
  return { w, e };
}

describe('enemy statuses', () => {
  it('last their duration and refresh instead of stacking', () => {
    const { w, e } = oneEnemy();
    applyStatus(w, e, 'marked');
    expect(hasStatus(w, e, 'marked')).toBe(true);
    w.time += STATUS.marked.duration - 0.1;
    applyStatus(w, e, 'marked');
    w.time += STATUS.marked.duration - 0.1;
    expect(hasStatus(w, e, 'marked')).toBe(true);
    w.time += 0.2;
    expect(hasStatus(w, e, 'marked')).toBe(false);
  });

  it('staggered enemies stop, snagged ones slow down; the Colossus ignores both', () => {
    const { w, e } = oneEnemy();
    applyStatus(w, e, 'snagged');
    expect(statusSpeed(w, e)).toBe(STATUS.snagged.speedFactor);
    applyStatus(w, e, 'staggered');
    expect(statusSpeed(w, e)).toBe(0);
    const x = e.x;
    updateEnemies(w, DT);
    expect(e.x).toBe(x);
    w.time += STATUS.snagged.duration + 0.01;
    expect(statusSpeed(w, e)).toBe(1);

    const boss = oneEnemy('colossus');
    applyStatus(boss.w, boss.e, 'staggered');
    applyStatus(boss.w, boss.e, 'snagged');
    expect(hasStatus(boss.w, boss.e, 'staggered')).toBe(false);
    expect(hasStatus(boss.w, boss.e, 'snagged')).toBe(false);
  });

  it('burning deals damage over time; a refresh keeps the stronger burn', () => {
    const { w, e } = oneEnemy('brute');
    applyStatus(w, e, 'burning', 10);
    applyStatus(w, e, 'burning', 4);
    for (let i = 0; i < 60; i++) updateBurns(w, DT);
    expect(e.hp).toBeCloseTo(ENEMIES.brute.maxHp - 10);
    w.time += STATUS.burning.duration;
    updateBurns(w, DT);
    expect(e.hp).toBeCloseTo(ENEMIES.brute.maxHp - 10);
  });
});

describe('combos', () => {
  it('a weapon deals the combo bonus to enemies with a status it profits from', () => {
    const { w, e } = oneEnemy('brute');
    expect(comboFactor(w, e, 'gatling')).toBe(1);
    applyStatus(w, e, 'snagged');
    expect(comboFactor(w, e, 'gatling')).toBe(1);
    applyStatus(w, e, 'burning', 1);
    expect(comboFactor(w, e, 'gatling')).toBe(1 + STATUS.comboBonus);
    hitEnemy(w, e, 10, 0, 0, 0, 'gatling');
    expect(w.damageBy.gatling).toBeCloseTo(10 * (1 + STATUS.comboBonus));
  });

  it("hits put the source's status on the enemy", () => {
    const { w, e } = oneEnemy('brute');
    hitEnemy(w, e, 1, 0, 0, 0, 'confetti');
    expect(hasStatus(w, e, 'staggered')).toBe(true);
    hitEnemy(w, e, 1, 0, 0, 0, 'gatling');
    expect(hasStatus(w, e, 'marked')).toBe(false);
  });
});
