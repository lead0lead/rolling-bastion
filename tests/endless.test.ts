import { describe, expect, it } from 'vitest';
import { SPAWN } from '../src/config/balance';
import { ENDLESS } from '../src/config/endless';
import { BOSS, ENEMIES } from '../src/config/enemies';
import { LAND } from '../src/config/land';
import { ROUNDS } from '../src/config/waves';
import { removeDead } from '../src/sim/combat';
import { endlessFactor, isBossRound, roundsToBoss } from '../src/sim/endless';
import { isLandLevel } from '../src/sim/land';
import { spawnEnemy, startRound, updateSpawner } from '../src/sim/spawner';
import { bossEnraged, createWorld, type World } from '../src/sim/world';

const DT = 1 / 60;

/** A world in the boss round, with the Colossus just arrived. */
function bossRoundWorld(): World {
  const w = createWorld(1);
  w.round = ROUNDS.bossRound - 1;
  startRound(w);
  return w;
}

/** A world right after the first boss kill, the player having chosen "Keep going". */
function endlessWorld(): World {
  const w = bossRoundWorld();
  const boss = w.boss;
  if (!boss) throw new Error('no boss');
  boss.dead = true;
  removeDead(w);
  return w;
}

describe('endless', () => {
  it('the first boss kill does not end the run; endless scaling starts', () => {
    const w = bossRoundWorld();
    const boss = w.boss;
    if (!boss) throw new Error('no boss');
    boss.dead = true;
    removeDead(w);
    expect(w.won).toBe(true);
    expect(w.over).toBe(false);
    expect(w.bossKills).toBe(1);
    expect(w.endlessSince).toBe(ROUNDS.bossRound);
  });

  it('normal spawns go on after the boss round', () => {
    const w = endlessWorld();
    w.roundClear = true;
    startRound(w);
    for (let i = 0; i < 120; i++) updateSpawner(w, DT);
    expect(w.enemies.length).toBeGreaterThan(0);
    expect(w.enemies.every((e) => e.type !== BOSS.type)).toBe(true);
  });

  it('enemy HP and damage grow by the endless factor per round, compounding', () => {
    const w = endlessWorld();
    expect(endlessFactor(w)).toBe(1);
    w.round += 2;
    const f = ENDLESS.growthPerRound ** 2;
    expect(endlessFactor(w)).toBeCloseTo(f);
    const e = spawnEnemy(w, 'swarmer', 0, 0);
    const growth = 1 + SPAWN.hpGrowthPerRound * (w.round - 1);
    expect(e.maxHp).toBeCloseTo(ENEMIES.swarmer.maxHp * growth * f);
    expect(e.damageFactor).toBeCloseTo(f);
  });

  it('no growth before endless', () => {
    const w = createWorld(1);
    w.round = 5;
    expect(spawnEnemy(w, 'brute', 0, 0).damageFactor).toBe(1);
  });

  it('the Colossus returns every few rounds with more HP each time, and does not end the run', () => {
    const w = endlessWorld();
    expect(roundsToBoss(w)).toBe(0);
    for (let i = 1; i < ENDLESS.bossEvery; i++) {
      w.roundClear = true;
      startRound(w);
      expect(w.boss).toBeNull();
      expect(isBossRound(w.round)).toBe(false);
    }
    expect(roundsToBoss(w)).toBe(1);
    w.roundClear = true;
    startRound(w);
    const boss = w.boss;
    if (!boss) throw new Error('no returning boss');
    expect(boss.maxHp).toBeCloseTo(ENEMIES[BOSS.type].maxHp * ENDLESS.bossHpPerReturn);
    expect(w.bossState.phase).toBe(1);
    expect(bossEnraged(w)).toBe(false);
    w.time += BOSS.enrageAfter;
    expect(bossEnraged(w)).toBe(true);
    boss.dead = true;
    removeDead(w);
    expect(w.over).toBe(false);
    expect(w.bossKills).toBe(2);
  });

  it('a killed Brute pops into Swarmers; an elite does not', () => {
    const w = createWorld(1);
    const e = spawnEnemy(w, 'brute', 0, 0);
    e.dead = true;
    removeDead(w);
    expect(w.enemies.map((x) => x.type)).toEqual(['swarmer', 'swarmer', 'swarmer']);
    const elite = spawnEnemy(w, 'brute', 0, 0, { hpMultiplier: 2, xp: 1 });
    elite.dead = true;
    w.enemies.length = 0;
    w.enemies.push(elite);
    removeDead(w);
    expect(w.enemies).toHaveLength(0);
  });

  it('spawning never stalls on a group dearer than the budget bank', () => {
    const w = createWorld(1);
    w.round = 10;
    startRound(w);
    w.spawn.next = { id: 'juggernaut', count: 1 };
    for (let i = 0; i < 60 * 60; i++) updateSpawner(w, DT);
    expect(w.enemies.some((e) => e.type === 'juggernaut')).toBe(true);
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
