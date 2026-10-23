import { describe, expect, it } from 'vitest';
import { SPAWN } from '../src/config/balance';
import { ENDLESS } from '../src/config/endless';
import { BOSS, ENEMIES } from '../src/config/enemies';
import { LAND } from '../src/config/land';
import { removeDead } from '../src/sim/combat';
import { endlessFactor, nextBossAt, startEndless } from '../src/sim/endless';
import { isLandLevel } from '../src/sim/land';
import { spawnEnemy, updateSpawner } from '../src/sim/spawner';
import { bossEnraged, createWorld, type World } from '../src/sim/world';

const DT = 1 / 60;

/** A world right after the first boss kill, the player having chosen "Keep going". */
function endlessWorld(): World {
  const w = createWorld(1);
  w.time = BOSS.at;
  updateSpawner(w, DT);
  const boss = w.boss;
  if (!boss) throw new Error('no boss');
  w.time = BOSS.at + 100;
  boss.dead = true;
  removeDead(w);
  startEndless(w);
  return w;
}

describe('endless', () => {
  it('the first boss kill wins and ends the run; "Keep going" resumes it', () => {
    const w = createWorld(1);
    w.time = BOSS.at;
    updateSpawner(w, DT);
    const boss = w.boss;
    if (!boss) throw new Error('no boss');
    boss.dead = true;
    removeDead(w);
    expect(w.won).toBe(true);
    expect(w.over).toBe(true);
    expect(w.bossKills).toBe(1);
    startEndless(w);
    expect(w.over).toBe(false);
    expect(w.endlessSince).toBe(BOSS.at);
  });

  it('cannot start before the boss is beaten', () => {
    const w = createWorld(1);
    w.over = true;
    startEndless(w);
    expect(w.endlessSince).toBeNull();
    expect(w.over).toBe(true);
  });

  it('normal spawns resume at the last wave budget', () => {
    const w = endlessWorld();
    for (let i = 0; i < 120; i++) updateSpawner(w, DT);
    expect(w.enemies.length).toBeGreaterThan(0);
    expect(w.enemies.every((e) => e.type !== BOSS.type)).toBe(true);
  });

  it('enemy HP and damage grow by the endless factor per minute, compounding', () => {
    const w = endlessWorld();
    expect(endlessFactor(w)).toBe(1);
    w.time += 120;
    const f = ENDLESS.growthPerMinute ** 2;
    expect(endlessFactor(w)).toBeCloseTo(f);
    const e = spawnEnemy(w, 'swarmer', 0, 0);
    const growth = 1 + (SPAWN.hpGrowthPerMinute * w.time) / 60;
    expect(e.maxHp).toBeCloseTo(ENEMIES.swarmer.maxHp * growth * f);
    expect(e.damageFactor).toBeCloseTo(f);
  });

  it('no growth before endless', () => {
    const w = createWorld(1);
    w.time = 300;
    expect(spawnEnemy(w, 'brute', 0, 0).damageFactor).toBe(1);
  });

  it('the Colossus returns on schedule with more HP each time, and does not end the run', () => {
    const w = endlessWorld();
    const since = w.endlessSince ?? 0;
    expect(nextBossAt(w)).toBe(since + ENDLESS.bossEvery);
    w.time = since + ENDLESS.bossEvery - 1;
    updateSpawner(w, DT);
    expect(w.boss).toBeNull();
    w.time = since + ENDLESS.bossEvery;
    updateSpawner(w, DT);
    const boss = w.boss;
    if (!boss) throw new Error('no returning boss');
    expect(boss.maxHp).toBeCloseTo(ENEMIES[BOSS.type].maxHp * ENDLESS.bossHpPerReturn);
    expect(w.bossState.phase).toBe(1);
    expect(bossEnraged(w)).toBe(false);
    w.time += BOSS.enrageAt - BOSS.at;
    expect(bossEnraged(w)).toBe(true);
    boss.dead = true;
    removeDead(w);
    expect(w.over).toBe(false);
    expect(w.bossKills).toBe(2);
    expect(nextBossAt(w)).toBe(since + 2 * ENDLESS.bossEvery);
  });

  it('a return waits while a Colossus still lives', () => {
    const w = endlessWorld();
    const since = w.endlessSince ?? 0;
    w.time = since + ENDLESS.bossEvery;
    updateSpawner(w, DT);
    const first = w.boss;
    w.time = since + 2 * ENDLESS.bossEvery + 10;
    updateSpawner(w, DT);
    expect(w.boss).toBe(first);
    expect(w.bossReturns).toBe(1);
  });

  it('land keeps coming every few levels after the last set land level', () => {
    const last = LAND.atLevels[LAND.atLevels.length - 1] ?? 0;
    expect(isLandLevel(last)).toBe(true);
    expect(isLandLevel(last + 1)).toBe(false);
    expect(isLandLevel(last + LAND.thenEvery)).toBe(true);
    expect(isLandLevel(last + 2 * LAND.thenEvery)).toBe(true);
    expect(isLandLevel(last + LAND.thenEvery - 1)).toBe(false);
  });
});
