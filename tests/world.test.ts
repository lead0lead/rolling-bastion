import { describe, expect, it } from 'vitest';
import { GRID, LEVEL_UP, MOVE, XP } from '../src/config/balance';
import { ENEMIES } from '../src/config/enemies';
import { TILES } from '../src/config/tiles';
import { damageTile, removeDead, updateProjectiles, updateWeapons } from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { coreTile, tileAt } from '../src/sim/grid';
import { addXp, applyBuildResult, collectGems, xpToNext } from '../src/sim/progression';
import { budgetRate, spawnEnemy } from '../src/sim/spawner';
import { SpatialHash } from '../src/sim/spatialHash';
import { moveCity, step, updateTimeline } from '../src/sim/step';
import { cityChanged, createWorld, tileCentre, type World } from '../src/sim/world';
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
  it('interpolates the budget between wave entries', () => {
    expect(budgetRate(0)).toBeCloseTo(0.9);
    expect(budgetRate(22.5)).toBeCloseTo(1.15);
    expect(budgetRate(10_000)).toBeCloseTo(10);
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

  it('scales enemy HP with game time', () => {
    const w = createWorld(1);
    w.time = 600;
    const e = spawnEnemy(w, 'swarmer', 0, 0);
    expect(e.maxHp).toBeCloseTo(ENEMIES.swarmer.maxHp * 1.6);
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
  it('destroys tiles for good and takes cut-off tiles offline', () => {
    const w = worldWith(['Cab', '...', '...']);
    const bridge = tileAt(w.city, 1, 0);
    if (!bridge) throw new Error('no tile');
    damageTile(w, bridge, 1000);
    expect(tileAt(w.city, 1, 0)).toBeUndefined();
    expect(tileAt(w.city, 2, 0)?.online).toBe(false);
    expect(w.events).toContainEqual(expect.objectContaining({ kind: 'tileDestroyed' }));
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

describe('weapons, kills and XP', () => {
  it('the Core pistol kills a swarmer in range, which drops a gem worth XP', () => {
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
    expect(w.gems).toHaveLength(1);
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

  it('collects gems within the pickup radius of any tile', () => {
    const w = createWorld(1);
    const core = coreTile(w.city);
    if (!core) throw new Error('no core');
    const c = tileCentre(w, core);
    const edge = c.x + GRID.cellPx / 2;
    w.gems.push({ x: edge + XP.pickupRadius - 1, y: c.y, value: 3 });
    w.gems.push({ x: edge + XP.pickupRadius + 5, y: c.y, value: 3 });
    collectGems(w);
    expect(w.xp).toBe(3);
    expect(w.gems).toHaveLength(1);
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

describe('timed grid expansion', () => {
  it('grows the grid at the configured times, each with a free build pause', () => {
    const w = createWorld(1);
    const [first, second] = GRID.expandAt;
    w.time = first - 1;
    updateTimeline(w);
    expect(w.city.gridSize).toBe(GRID.startSize);
    w.time = first;
    updateTimeline(w);
    expect(w.city.gridSize).toBe(GRID.startSize + GRID.expansionGrowth);
    expect(w.pendingExpansions).toBe(1);
    w.time = second;
    updateTimeline(w);
    updateTimeline(w);
    expect(w.city.gridSize).toBe(GRID.maxSize);
    expect(w.pendingExpansions).toBe(2);
    w.time = 10_000;
    updateTimeline(w);
    expect(w.pendingExpansions).toBe(2);
  });
});
