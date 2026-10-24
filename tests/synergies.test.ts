import { describe, expect, it } from 'vitest';
import { LINES, MOVE } from '../src/config/balance';
import { TILES, type TileType } from '../src/config/tiles';
import { damageTile, healTiles, updateProjectiles, updateWeapons } from '../src/sim/combat';
import { tileAt, turnFacing } from '../src/sim/grid';
import { buffsReceived } from '../src/sim/synergies';
import { spawnEnemy } from '../src/sim/spawner';
import { cityChanged, createWorld, modsOf, tileCentre, type World } from '../src/sim/world';
import { typedCity } from './helpers';

const DT = 1 / 60;

const LEGEND: Record<string, TileType> = {
  C: 'core',
  h: 'hull',
  g: 'gatling',
  c: 'cannon',
  m: 'mortar',
  x: 'crossbow',
  e: 'generator',
  d: 'shield',
  r: 'repair',
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
    const w = worldOf(['hx.', 'C..', '...'], { hull: 3 });
    const bow = tile(w, 1, 0);
    expect(bow.maxHp).toBeCloseTo(TILES.crossbow.maxHp * 1.1);
    expect(bow.hp).toBeCloseTo(bow.maxHp);
  });

  it('Engine L5 removes the size penalty', () => {
    const rows = ['Chhhhh', 'hhhhhh', 'hhhhhh', 'hhhhhn', '......', '......'];
    const w = worldOf(rows, { engine: 5 });
    expect(w.cache.syn.speedFactor).toBeCloseTo(1 + MOVE.engineBonus * 1.8);
  });
});

describe('weapon chains', () => {
  it('3+ identical weapons with the same facing in a line chain, bonus grows with length', () => {
    const w = worldOf(['gggg.', 'C....', '.....', '.....', '.....']);
    expect(w.cache.syn.chains).toEqual([
      { type: 'gatling', x0: 0, y0: 0, x1: 3, y1: 0, length: 4 },
    ]);
    expect(modsOf(w, tile(w, 2, 0)).damage).toBeCloseTo(1 + 2 * LINES.chainBonusStep);
    const three = worldOf(['ggg.', 'C...', '....', '....']);
    expect(modsOf(three, tile(three, 0, 0)).damage).toBeCloseTo(1 + LINES.chainBonusStep);
  });

  it('two in a line, mixed types or a gap do not chain', () => {
    expect(worldOf(['gg.g', 'C...', '....', '....']).cache.syn.chains).toEqual([]);
    expect(worldOf(['ggc.', 'C...', '....', '....']).cache.syn.chains).toEqual([]);
  });

  it('arc weapons need the same facing; Mortars chain whatever their facing', () => {
    const w = worldOf(['ggg.', 'mmm.', 'C...', '....']);
    tile(w, 1, 0).facing = turnFacing(0, 1);
    tile(w, 1, 1).facing = turnFacing(0, 2);
    cityChanged(w);
    expect(w.cache.syn.chains.map((c) => c.type)).toEqual(['mortar']);
  });

  it('a tile in two chains keeps the higher bonus', () => {
    const w = worldOf(['gggg.', 'g....', 'g....', 'C....', '.....']);
    expect(modsOf(w, tile(w, 0, 0)).damage).toBeCloseTo(1 + 2 * LINES.chainBonusStep);
    expect(w.cache.syn.chains).toHaveLength(2);
  });

  it('offline weapons break a chain', () => {
    const w = worldOf(['C..', '...', 'ggg']);
    expect(w.cache.syn.chains).toEqual([]);
  });
});

describe('buff links', () => {
  it('records each adjacency buff from an online support tile', () => {
    const w = worldOf(['ege.', 'Cd..', '....', '....']);
    const gun = tile(w, 1, 0);
    const got = buffsReceived(w.cache.syn, gun.id);
    expect(got.generator?.count).toBe(2);
    expect(got.generator?.total).toBeCloseTo(2 * (TILES.generator.support?.amount ?? 0));
    expect(got.shield).toEqual({ count: 1, total: TILES.shield.support?.amount });
    expect(got.repair).toBeUndefined();
    const fromShield = w.cache.syn.links.filter((l) => l.from === tile(w, 1, 1).id);
    expect(fromShield.map((l) => l.to).sort()).toEqual([tile(w, 0, 1).id, gun.id].sort());
  });

  it('diagonal perks add diagonal links; offline sources give none', () => {
    const w = worldOf(['h.h.', 'Cd..', 'h.h.', '....'], { shield: 3 });
    expect(w.cache.syn.links.filter((l) => l.type === 'shield')).toHaveLength(5);
    const off = worldOf(['C...', '....', '.dh.', '....']);
    expect(off.cache.syn.links).toEqual([]);
  });
});

describe('support chains', () => {
  const gen = TILES.generator.support?.amount ?? 0;

  it('3+ Generators in a line multiply the fire rate they give, facing ignored', () => {
    const w = worldOf(['eee.', 'Cg..', '....', '....']);
    tile(w, 1, 0).facing = turnFacing(0, 1);
    cityChanged(w);
    expect(w.cache.syn.chains).toEqual([
      { type: 'generator', x0: 0, y0: 0, x1: 2, y1: 0, length: 3 },
    ]);
    expect(modsOf(w, tile(w, 1, 1)).fireRate).toBeCloseTo(1 + gen * (1 + LINES.chainBonusStep));
    expect(modsOf(w, tile(w, 1, 1)).damage).toBe(1);
  });

  it('chained Generators still respect the receiving tile cap', () => {
    const w = worldOf(['eeee.', 'eg...', 'eC...', '.....', '.....']);
    const cap = TILES.generator.support?.cap ?? 0;
    expect(modsOf(w, tile(w, 1, 1)).fireRate).toBeCloseTo(1 + cap);
  });

  it('3+ Engines in a line multiply their speed bonus', () => {
    const chained = worldOf(['nnn.', 'C...', '....', '....']);
    expect(chained.cache.syn.speedFactor).toBeCloseTo(
      1 + 3 * MOVE.engineBonus * (1 + LINES.chainBonusStep),
    );
    const pair = worldOf(['nn..', 'C...', '....', '....']);
    expect(pair.cache.syn.speedFactor).toBeCloseTo(1 + 2 * MOVE.engineBonus);
  });

  it('other support tiles do not chain', () => {
    expect(worldOf(['ddd.', 'C...', '....', '....']).cache.syn.chains).toEqual([]);
    expect(worldOf(['rrr.', 'C...', '....', '....']).cache.syn.chains).toEqual([]);
  });
});

describe('filled rows and columns (removed in v2)', () => {
  it('a full row or column of online tiles gives no bonus', () => {
    const w = worldOf(['Chh', 'h..', 'h..']);
    expect(tile(w, 0, 0).maxHp).toBe(TILES.core.maxHp);
    expect(tile(w, 2, 0).maxHp).toBe(TILES.hull.maxHp);
    expect(modsOf(w, tile(w, 0, 0)).damage).toBe(1);
  });
});
