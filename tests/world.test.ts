import { describe, expect, it } from 'vitest';
import { GRID, LEVEL_UP, MOVE, SPAWN } from '../src/config/balance';
import { ECONOMY } from '../src/config/economy';
import { ROUNDS } from '../src/config/waves';
import { ENEMIES } from '../src/config/enemies';
import { TILES } from '../src/config/tiles';
import { damageTile, removeDead, updateProjectiles, updateWeapons } from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { cellId, coreTile, tileAt, type PlacedTile } from '../src/sim/grid';
import { addXp, applyBuildResult, xpToNext } from '../src/sim/progression';
import { roundBudget } from '../src/sim/endless';
import { spawnEnemy } from '../src/sim/spawner';
import { SpatialHash } from '../src/sim/spatialHash';
import { moveCity, step } from '../src/sim/step';
import { cityChanged, createWorld, tileAtCell, tileCentre, type World } from '../src/sim/world';
import { cityFrom } from './helpers';

const DT = 1 / 60;

/** World whose city is the given ASCII picture (see helpers.cityFrom). */
function worldWith(rows: string[]): World {
  const w = createWorld(1);
  w.city = cityFrom(rows);
  cityChanged(w);
  return w;
}

describe('movement', () => {
  it('reaches base speed with a small city and normalizes diagonals', () => {
    const w = createWorld(1);
    for (let i = 0; i < 60; i++) moveCity(w, { x: 1, y: 1 }, DT);
    expect(Math.hypot(w.vx, w.vy)).toBeCloseTo(MOVE.baseSpeed, 3);
  });

  it('applies the size penalty, its floor, and engines after it', () => {
    const w = worldWith(['Caaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', '......', '......']); // 24 tiles
    expect(w.cache.syn.speedFactor).toBeCloseTo(1 - 14 * MOVE.penaltyPerTile);
    const big = worldWith(
      Array.from({ length: 10 }, (_, i) => (i === 0 ? 'Caaaaaaaaa' : 'aaaaaaaaaa')),
    );
    expect(big.cache.syn.speedFactor).toBeCloseTo(MOVE.minSpeedFactor);
    const engine = big.city.tiles.find((t) => t.type === 'hull');
    if (!engine) throw new Error('no hull');
    engine.type = 'engine';
    cityChanged(big);
    expect(big.cache.syn.speedFactor).toBeCloseTo(MOVE.minSpeedFactor + MOVE.engineBonus);
  });

  it('stops quickly when input is released', () => {
    const w = createWorld(1);
    for (let i = 0; i < 60; i++) moveCity(w, { x: 1, y: 0 }, DT);
    for (let i = 0; i < 30; i++) moveCity(w, { x: 0, y: 0 }, DT);
    expect(Math.abs(w.vx)).toBeLessThan(1);
  });
});

describe('spawner', () => {
  it('round budgets grow each round up to the boss round, then linearly', () => {
    expect(roundBudget(1)).toBe(ROUNDS.baseBudget);
    for (let r = 2; r < ROUNDS.bossRound; r++) {
      expect(roundBudget(r)).toBeCloseTo(roundBudget(r - 1) * ROUNDS.budgetGrowth);
    }
    expect(roundBudget(ROUNDS.bossRound + 1)).toBeGreaterThan(roundBudget(ROUNDS.bossRound - 1));
  });

  it('is deterministic for a seed', () => {
    const a = createWorld(9);
    const b = createWorld(9);
    for (let i = 0; i < 60 * 20; i++) {
      step(a, { x: 0, y: 0 }, DT);
      step(b, { x: 0, y: 0 }, DT);
    }
    expect(a.enemies.length).toBeGreaterThan(0);
    expect(a.enemies.map((e) => [e.x, e.y])).toEqual(b.enemies.map((e) => [e.x, e.y]));
    expect(a.kills).toBe(b.kills);
  });

  it('scales enemy HP with the round', () => {
    const w = createWorld(1);
    w.round = 7;
    const e = spawnEnemy(w, 'swarmer', 0, 0);
    expect(e.maxHp).toBeCloseTo(ENEMIES.swarmer.maxHp * (1 + 6 * SPAWN.hpGrowthPerRound));
  });
});

describe('enemies vs city', () => {
  it('walk to the nearest tile, stop at its edge and deal contact damage', () => {
    const w = createWorld(1);
    const core = coreTile(w.city);
    if (!core) throw new Error('no core');
    const c = tileCentre(w, core);
    const e = spawnEnemy(w, 'swarmer', c.x + 100, c.y);
    for (let i = 0; i < 120; i++) updateEnemies(w, DT);
    const edge = c.x + GRID.cellPx / 2;
    expect(e.x).toBeGreaterThanOrEqual(edge + ENEMIES.swarmer.radius - 0.01);
    expect(e.x).toBeLessThan(edge + ENEMIES.swarmer.radius + 1);
    expect(core.hp).toBeLessThan(TILES.core.maxHp);
  });

  it('push stacked enemies apart', () => {
    const w = createWorld(1);
    const a = spawnEnemy(w, 'swarmer', 500, 500);
    const b = spawnEnemy(w, 'swarmer', 500, 500);
    for (let i = 0; i < 10; i++) updateEnemies(w, DT);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(ENEMIES.swarmer.radius);
  });
});

describe('tile damage', () => {
  it('destroys tiles for good and breaks cut-off tiles off for good too', () => {
    const w = worldWith(['Cab', '...', '...']);
    const bridge = tileAt(w.city, 1, 0);
    if (!bridge) throw new Error('no tile');
    damageTile(w, bridge, 1000);
    expect(tileAt(w.city, 1, 0)).toBeUndefined();
    expect(tileAt(w.city, 2, 0)).toBeUndefined();
    expect(w.events).toContainEqual(expect.objectContaining({ kind: 'tileDestroyed' }));
    expect(w.events).toContainEqual(
      expect.objectContaining({ kind: 'tileDestroyed', brokeOff: true }),
    );
    expect(w.over).toBe(false);
  });

  it('ends the run when the Core is destroyed, unless in god mode', () => {
    const w = createWorld(1);
    const core = coreTile(w.city);
    if (!core) throw new Error('no core');
    w.godMode = true;
    damageTile(w, core, 1000);
    expect(w.over).toBe(false);
    w.godMode = false;
    damageTile(w, core, 1000);
    expect(w.over).toBe(true);
    expect(w.coreLostAt).toEqual({ gx: core.gx, gy: core.gy });
  });
});

describe('weapons, kills and coins', () => {
  it('the Core pistol kills a swarmer in range, which pays its coins at once', () => {
    const w = createWorld(1);
    const core = coreTile(w.city);
    if (!core) throw new Error('no core');
    const c = tileCentre(w, core);
    spawnEnemy(w, 'swarmer', c.x + 150, c.y);
    for (let i = 0; i < 120 && w.kills === 0; i++) {
      w.enemies.forEach((e, idx) => {
        w.hash.clear();
        w.hash.insert(idx, e.x, e.y);
      });
      updateWeapons(w, DT);
      updateProjectiles(w, DT);
      removeDead(w);
    }
    expect(w.kills).toBe(1);
    expect(w.coins).toBe(ECONOMY.startCoins + ENEMIES.swarmer.xp);
    expect(w.coinsEarned).toBe(ENEMIES.swarmer.xp);
    // Credited to the Core, counting only damage up to the enemy's HP.
    expect(w.damageBy.core).toBeCloseTo(ENEMIES.swarmer.maxHp);
  });

  it('offline weapons do not fire', () => {
    const w = worldWith(['C..', '...', '..a']);
    const gun = tileAt(w.city, 2, 2);
    if (!gun) throw new Error('no tile');
    gun.type = 'gatling';
    cityChanged(w);
    expect(w.cache.weapons.map((t) => t.type)).toEqual(['core']);
  });

  it('chains level-ups and carries excess XP over', () => {
    const w = createWorld(1);
    addXp(w, xpToNext(1) + xpToNext(2) + 2);
    expect(w.level).toBe(3);
    expect(w.pendingLevelUps).toBe(2);
    expect(w.xp).toBe(2);
  });
});

describe('build results', () => {
  it('Repair Core heals a share of max HP, capped at max', () => {
    const w = createWorld(1);
    const core = coreTile(w.city);
    if (!core) throw new Error('no core');
    core.hp = 50;
    applyBuildResult(w, { repair: true, scrapped: 0 });
    expect(core.hp).toBeCloseTo(50 + TILES.core.maxHp * LEVEL_UP.repairCoreFraction);
    applyBuildResult(w, { repair: true, scrapped: 0 });
    applyBuildResult(w, { repair: true, scrapped: 0 });
    expect(core.hp).toBe(TILES.core.maxHp);
  });

  it('scrapping refunds a share of the current level requirement', () => {
    const w = createWorld(1);
    applyBuildResult(w, { repair: false, scrapped: 1 });
    expect(w.xp).toBe(Math.round(xpToNext(1) * LEVEL_UP.scrapRefund));
  });
});

describe('SpatialHash', () => {
  it('finds nearby entities once each, including across negative cells', () => {
    const h = new SpatialHash(32, 4); // tiny table forces bucket collisions
    const points = [
      [0, 0],
      [-40, -40],
      [500, 500],
      [10, -5],
    ] as const;
    points.forEach(([x, y], i) => h.insert(i, x, y));
    const seen: number[] = [];
    h.query(0, 0, 50, (i) => seen.push(i));
    expect(seen.sort()).toEqual(expect.arrayContaining([0, 1, 3]));
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('open-ended grid', () => {
  it('places the world origin on the Core and finds tiles at negative cells', () => {
    const w = createWorld(1);
    const core = coreTile(w.city);
    if (!core) throw new Error('missing core');
    expect(tileCentre(w, core)).toEqual({ x: w.x, y: w.y });
    w.city.board.add(cellId(-7, -2));
    w.city.tiles.push({ ...core, id: 99, type: 'hull', gx: -7, gy: -2, groupId: 99 });
    cityChanged(w);
    const far = tileAtCell(w, -7, -2);
    expect(far?.id).toBe(99);
    expect(tileCentre(w, far as PlacedTile)).toEqual({
      x: w.x - 7 * GRID.cellPx,
      y: w.y - 2 * GRID.cellPx,
    });
    expect(tileAtCell(w, -7, -3)).toBeUndefined();
  });
});

describe('build results', () => {
  it('charge the rerolls used in the pause', () => {
    const w = createWorld(1);
    const before = w.rerolls;
    applyBuildResult(w, { repair: false, scrapped: 0, rerollsUsed: 1 });
    expect(w.rerolls).toBe(before - 1);
  });
});
