import { describe, expect, it } from 'vitest';
import { BOSS, ENEMIES } from '../src/config/enemies';
import { ROUNDS } from '../src/config/waves';
import { hitEnemy, removeDead, updateProjectiles } from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { coreTile } from '../src/sim/grid';
import { roundBudget } from '../src/sim/endless';
import { spawnEnemy, startRound } from '../src/sim/spawner';
import { bossContactFactor, bossMove, chargePath, updateBoss } from '../src/sim/boss';
import { cityCentre, createWorld, tileCentre, type World } from '../src/sim/world';

const DT = 1 / 60;

function bossWorld(): World {
  const w = createWorld(1);
  w.round = ROUNDS.bossRound - 1;
  startRound(w);
  return w;
}

describe('boss', () => {
  it('arrives in the boss round with unscaled HP and a reduced regular budget', () => {
    const w = bossWorld();
    expect(w.boss?.type).toBe(BOSS.type);
    expect(w.boss?.maxHp).toBe(ENEMIES[BOSS.type].maxHp);
    expect(w.spawn.total).toBe(roundBudget(ROUNDS.bossRound));
    expect(w.spawn.total).toBeLessThan(roundBudget(ROUNDS.bossRound - 1) * 2);
  });

  it('summons Swarmer rings in phase 1', () => {
    const w = bossWorld();
    for (let i = 0; i < Math.ceil(BOSS.addInterval[0] / DT) + 1; i++) updateBoss(w, DT);
    expect(w.enemies.filter((e) => e.type === 'swarmer')).toHaveLength(BOSS.addCount);
  });

  it('changes phase by HP with a banner event and a shockwave', () => {
    const w = bossWorld();
    const boss = w.boss;
    if (!boss) throw new Error('no boss');
    const c = cityCentre(w);
    const near = spawnEnemy(w, 'swarmer', c.x + 100, c.y);
    boss.hp = boss.maxHp * (BOSS.phaseAt[0] - 0.01);
    updateBoss(w, DT);
    expect(w.bossState.phase).toBe(2);
    expect(w.events).toContainEqual({ kind: 'bossPhase', phase: 2 });
    expect(near.kvx).toBeGreaterThan(0);
    boss.hp = boss.maxHp * (BOSS.phaseAt[1] - 0.01);
    updateBoss(w, DT);
    expect(w.bossState.phase).toBe(3);
  });

  it('fires shot fans at the city from phase 2', () => {
    const w = bossWorld();
    const boss = w.boss;
    if (!boss) throw new Error('no boss');
    boss.hp = boss.maxHp * 0.5;
    for (let i = 0; i < Math.ceil(BOSS.volley.interval / DT) + 1; i++) updateBoss(w, DT);
    expect(w.enemyShots).toHaveLength(BOSS.volley.count);
  });

  it('phase 3 charges: telegraph, straight dash with extra damage, then walks again', () => {
    const w = bossWorld();
    const boss = w.boss;
    if (!boss) throw new Error('no boss');
    boss.hp = boss.maxHp * 0.1;
    updateBoss(w, DT);
    const ticks = (s: number) => Math.ceil(s / DT) + 1;
    for (let i = 0; i < ticks(BOSS.charge.rest); i++) updateBoss(w, DT);
    expect(w.bossState.charge).toBe('telegraph');
    expect(chargePath(w)).not.toBeNull();
    const x0 = boss.x;
    const y0 = boss.y;
    expect(bossMove(w, boss, DT)).toBe(true);
    expect([boss.x, boss.y]).toEqual([x0, y0]);
    for (let i = 0; i < ticks(BOSS.charge.telegraph); i++) updateBoss(w, DT);
    expect(w.bossState.charge).toBe('dash');
    expect(bossContactFactor(w)).toBe(BOSS.charge.damage);
    bossMove(w, boss, 0.1);
    expect(Math.hypot(boss.x - x0, boss.y - y0)).toBeCloseTo(BOSS.charge.speed * 0.1);
    for (let i = 0; i < ticks(BOSS.charge.distance / BOSS.charge.speed); i++) updateBoss(w, DT);
    expect(w.bossState.charge).toBe('walk');
    expect(bossMove(w, boss, DT)).toBe(false);
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
    expect(dealt(BOSS.enrageAfter)).toBeCloseTo(dealt(0) * BOSS.enrageDamage);
  });

  it('defeating it marks the win but the run goes on', () => {
    const w = bossWorld();
    const boss = w.boss;
    if (!boss) throw new Error('no boss');
    hitEnemy(w, boss, boss.hp, 0, 0, 0);
    removeDead(w);
    expect(w.won).toBe(true);
    expect(w.over).toBe(false);
    expect(w.boss).toBeNull();
  });
});
