import { describe, expect, it } from 'vitest';
import { MOVE, XP } from '../src/config/balance';
import { ENEMIES } from '../src/config/enemies';
import { TILES, type TileType } from '../src/config/tiles';
import { damageTile, healTiles, updateProjectiles, updateWeapons } from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { tileAt } from '../src/sim/grid';
import { collectGems } from '../src/sim/progression';
import { spawnEnemy } from '../src/sim/spawner';
import { cityChanged, createWorld, modsOf, tileCentre, type World } from '../src/sim/world';
import { typedCity } from './helpers';

const DT = 1 / 60;

const LEGEND: Record<string, TileType> = {
  C: 'core',
  h: 'hull',
  p: 'plating',
  g: 'gatling',
  c: 'cannon',
  m: 'mortar',
  s: 'saw',
  e: 'generator',
  d: 'shield',
  r: 'repair',
  u: 'magnet',
  n: 'engine',
};

function worldOf(rows: string[], levels: Partial<Record<TileType, number>> = {}): World {
  const w = createWorld(1);
  w.city = typedCity(rows, LEGEND);
  Object.assign(w.city.typeLevels, levels);
  cityChanged(w);
  return w;
}

function tile(w: World, x: number, y: number) {
  const t = tileAt(w.city, x, y);
  if (!t) throw new Error(`no tile at ${x},${y}`);
  return t;
}

/** Keeps the weapon at (x, y) from firing (e.g. the Core pistol). */
function silence(w: World, x: number, y: number): void {
  w.weapons.set(tile(w, x, y).id, { cooldown: Infinity, aim: 0, aimTimer: Infinity });
}

/** Makes the weapon at (x, y) fire on the next tick. */
function ready(w: World, x: number, y: number): void {
  w.weapons.set(tile(w, x, y).id, { cooldown: 0, aim: 0, aimTimer: 0 });
}

/** Runs weapons and projectiles for `ticks`, with the enemy hash rebuilt each tick. */
function fight(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    w.hash.clear();
    w.enemies.forEach((e, idx) => w.hash.insert(idx, e.x, e.y));
    updateWeapons(w, DT);
    updateProjectiles(w, DT);
  }
}

describe('adjacency buffs', () => {
  it('Generators speed up orthogonal neighbours, stack and cap', () => {
    const w = worldOf(['.e.', 'egC', '.e.']);
    const gun = modsOf(w, tile(w, 1, 1));
    expect(gun.fireRate).toBeCloseTo(1 + (TILES.generator.support?.cap ?? 0));
    const one = worldOf(['eg.', 'C..', '...']);
    expect(modsOf(one, tile(one, 1, 0)).fireRate).toBeCloseTo(1.25);
    expect(modsOf(one, tile(one, 0, 1)).fireRate).toBeCloseTo(1.25);
  });

  it('offline support tiles give no buffs', () => {
    const w = worldOf(['C..', '...', '.ge']);
    expect(tile(w, 2, 2).online).toBe(false);
    expect(modsOf(w, tile(w, 1, 2)).fireRate).toBe(1);
  });

  it('Shield Emitters reduce damage taken by neighbours, capped', () => {
    const w = worldOf(['dhd', 'C..', '...']);
    const hull = tile(w, 1, 0);
    expect(modsOf(w, hull).damageTaken).toBeCloseTo(1 - (TILES.shield.support?.cap ?? 0));
    const one = worldOf(['dh.', 'C..', '...']);
    const h = tile(one, 1, 0);
    damageTile(one, h, 10);
    expect(h.hp).toBeCloseTo(TILES.hull.maxHp - 6);
  });

  it('Repair Bays heal damaged neighbours up to max HP', () => {
    const w = worldOf(['rh.', 'C..', '...']);
    const hull = tile(w, 1, 0);
    hull.hp = 10;
    for (let i = 0; i < 60; i++) healTiles(w, DT);
    expect(hull.hp).toBeCloseTo(10 + (TILES.repair.support?.amount ?? 0));
    for (let i = 0; i < 60 * 60; i++) healTiles(w, DT);
    expect(hull.hp).toBe(hull.maxHp);
  });

  it('Magnets widen the pickup radius city-wide', () => {
    const w = worldOf(['u..', 'C..', '...']);
    const c = tileCentre(w, tile(w, 0, 1));
    const edge = c.x + 16;
    w.gems.push({ x: edge + XP.pickupRadius * 1.2, y: c.y, value: 2 });
    collectGems(w);
    expect(w.xp).toBe(2);
  });

  it('Engines add speed after the size penalty', () => {
    const w = worldOf(['nn.', 'C..', '...']);
    expect(w.cache.syn.speedFactor).toBeCloseTo(1 + 2 * MOVE.engineBonus);
  });
});

describe('new weapons', () => {
  it('Mortar shells ignore close enemies and blast everything at the target', () => {
    const w = worldOf(['m..', 'C..', '...']);
    silence(w, 0, 1);
    ready(w, 0, 0);
    const c = tileCentre(w, tile(w, 0, 0));
    const near = spawnEnemy(w, 'swarmer', c.x + 40, c.y);
    const a = spawnEnemy(w, 'swarmer', c.x, c.y - 200);
    const b = spawnEnemy(w, 'swarmer', c.x + 20, c.y - 200);
    fight(w, 60 * 4);
    expect(near.hp).toBe(near.maxHp);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(w.events).toContainEqual(expect.objectContaining({ kind: 'blast' }));
  });

  it('Saws damage touching enemies', () => {
    const w = worldOf(['s..', 'C..', '...']);
    const c = tileCentre(w, tile(w, 0, 0));
    const e = spawnEnemy(w, 'swarmer', c.x, c.y - 16 - ENEMIES.swarmer.radius);
    updateEnemies(w, DT);
    updateEnemies(w, DT);
    expect(e.hp).toBeLessThan(e.maxHp);
  });
});

describe('perks', () => {
  it('Gatling L3 fires an extra projectile', () => {
    const w = worldOf(['g..', 'C..', '...'], { gatling: 3 });
    const c = tileCentre(w, tile(w, 0, 0));
    spawnEnemy(w, 'swarmer', c.x, c.y - 100);
    ready(w, 0, 0);
    silence(w, 0, 1);
    updateWeapons(w, DT);
    expect(w.projectiles).toHaveLength(2);
  });

  it('Cannon L5 shots pierce', () => {
    const w = worldOf(['c..', 'C..', '...'], { cannon: 5 });
    const c = tileCentre(w, tile(w, 0, 0));
    silence(w, 0, 1);
    ready(w, 0, 0);
    const hit = [60, 90, 120].map((d) => spawnEnemy(w, 'swarmer', c.x, c.y - d));
    for (const e of hit) e.hp = e.maxHp = 1000;
    fight(w, 30);
    expect(hit.every((e) => e.hp < 1000)).toBe(true);
  });

  it('Hull L3 raises neighbour max HP and the gain is added as HP', () => {
    const w = worldOf(['hp.', 'C..', '...'], { hull: 3 });
    const plating = tile(w, 1, 0);
    expect(plating.maxHp).toBeCloseTo(TILES.plating.maxHp * 1.1);
    expect(plating.hp).toBeCloseTo(plating.maxHp);
  });

  it('Engine L5 removes the size penalty', () => {
    const rows = ['Chhhhh', 'hhhhhh', 'hhhhhh', 'hhhhhn', '......', '......'];
    const w = worldOf(rows, { engine: 5 });
    expect(w.cache.syn.speedFactor).toBeCloseTo(1 + MOVE.engineBonus * 1.8);
  });
});
