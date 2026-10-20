import { describe, expect, it } from 'vitest';
import { BOSS, ENEMIES } from '../src/config/enemies';
import { hitEnemy, removeDead, updateProjectiles } from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { coreTile } from '../src/sim/grid';
import { spawnEnemy, updateSpawner } from '../src/sim/spawner';
import { createWorld, tileCentre, type World } from '../src/sim/world';

const DT = 1 / 60;

function bossWorld(): World {
  const w = createWorld(1);
  w.time = BOSS.at;
  updateSpawner(w, DT);
  return w;
}

describe('boss', () => {
  it('arrives at its time, alone, with unscaled HP; regular spawns stop', () => {
    const w = bossWorld();
    expect(w.boss?.type).toBe(BOSS.type);
    expect(w.boss?.maxHp).toBe(ENEMIES[BOSS.type].maxHp);
    w.spawn.budget = 1000;
    for (let i = 0; i < 60; i++) updateSpawner(w, DT);
    expect(w.enemies).toHaveLength(1);
  });

  it('summons Swarmer packs', () => {
    const w = bossWorld();
    for (let i = 0; i < Math.ceil(BOSS.addInterval / DT) + 1; i++) updateSpawner(w, DT);
    expect(w.enemies.filter((e) => e.type === 'swarmer')).toHaveLength(BOSS.addCount);
  });

  it('ignores knockback and is hit by shots at its edge', () => {
    const w = bossWorld();
    const boss = w.boss;
    if (!boss) throw new Error('no boss');
    hitEnemy(w, boss, 1, 500, 1, 0);
    expect(boss.kvx).toBe(0);
    w.projectiles.push({
      x: boss.x + boss.radius + 2,
      y: boss.y,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      damage: 7,
      radius: 3,
      knockback: 0,
      blast: 0,
      pierce: 0,
      hits: [],
      life: 1,
      source: 'gatling',
      dead: false,
    });
    w.hash.clear();
    updateProjectiles(w, DT);
    expect(boss.hp).toBe(boss.maxHp - 8);
  });

  it('deals double contact damage once enraged', () => {
    const dealt = (time: number) => {
      const w = createWorld(1);
      w.time = time;
      const core = coreTile(w.city);
      if (!core) throw new Error('no core');
      const c = tileCentre(w, core);
      spawnEnemy(w, BOSS.type, c.x + 16 + ENEMIES[BOSS.type].radius, c.y);
      w.godMode = false;
      const before = core.hp;
      updateEnemies(w, DT);
      return before - core.hp;
    };
    expect(dealt(BOSS.enrageAt)).toBeCloseTo(dealt(BOSS.at) * BOSS.enrageDamage);
  });

  it('defeating it wins the run', () => {
    const w = bossWorld();
    const boss = w.boss;
    if (!boss) throw new Error('no boss');
    hitEnemy(w, boss, boss.hp, 0, 0, 0);
    removeDead(w);
    expect(w.won).toBe(true);
    expect(w.over).toBe(true);
    expect(w.boss).toBeNull();
  });
});
