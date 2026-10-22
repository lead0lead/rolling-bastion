import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../src/config/balance';
import { TILES, type TileType } from '../src/config/tiles';
import {
  hasStatus,
  updateBurns,
  leadPoint,
  updateBlades,
  updateProjectiles,
  updateWeapons,
} from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { tileAt } from '../src/sim/grid';
import { spawnEnemy } from '../src/sim/spawner';
import { cityChanged, createWorld, tileCentre, type World } from '../src/sim/world';
import { typedCity } from './helpers';

const DT = 1 / 60;
const LEGEND: Record<string, TileType> = {
  C: 'core',
  m: 'mortar',
  c: 'cannon',
  h: 'hull',
  s: 'saw',
  x: 'crossbow',
  f: 'flamethrower',
};

function worldOf(rows: string[]): World {
  const w = createWorld(1);
  w.city = typedCity(rows, LEGEND);
  cityChanged(w);
  // Keep the Core's pistol quiet so only the tested weapon deals damage.
  const core = w.city.tiles.find((t) => t.type === 'core');
  if (core) w.weapons.set(core.id, { cooldown: Infinity, aim: 0, aimTimer: Infinity });
  return w;
}

/** Enemies, weapons and projectiles for `ticks`, tiles kept alive. */
function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    w.time += DT;
    updateEnemies(w, DT);
    updateWeapons(w, DT);
    updateBlades(w, DT);
    updateProjectiles(w, DT);
    for (const t of w.city.tiles) t.hp = t.maxHp;
  }
}

describe('Mortar', () => {
  it('leads a moving target', () => {
    const w = createWorld(1);
    const e = spawnEnemy(w, 'runner', 210, 0);
    e.px = e.x - 2; // moving right at 120 px/s
    const p = leadPoint(e, 0, 0, 420, DT);
    const flight = Math.hypot(p.x, p.y) / 420;
    expect(p.x).toBeCloseTo(210 + 120 * flight, 0);
    expect(p.y).toBe(0);
  });

  it('hits a Runner charging at it with its first shell, and staggers it', () => {
    const w = worldOf(['m..', 'C..', '...']);
    const c = tileCentre(w, tileAt(w.city, 0, 0) as NonNullable<ReturnType<typeof tileAt>>);
    const e = spawnEnemy(w, 'runner', c.x + 330, c.y);
    e.hp = e.maxHp = 1e6;
    const mortar = tileAt(w.city, 0, 0);
    if (mortar) w.weapons.set(mortar.id, { cooldown: 2 * DT, aim: 0, aimTimer: 0 });
    const flight = 330 / (TILES.mortar.weapon?.projectileSpeed ?? 1);
    let staggered = false;
    for (let i = 0; i < (flight + 0.5) / DT && !w.damageBy.mortar; i++) {
      run(w, 1);
      staggered ||= hasStatus(w, e, 'staggered');
    }
    expect(w.damageBy.mortar).toBeGreaterThan(0);
    expect(staggered).toBe(true);
  });
});

describe('Saw blade', () => {
  const blade = TILES.saw.blade;
  if (!blade) throw new Error('no blade');

  /** A Saw at (1, 1) with the Core below it, and a parked enemy at `dist` px from the Saw. */
  function sawWith(dist: number, type: 'runner' | 'brute' = 'brute') {
    const w = worldOf(['...', '.s.', '.C.']);
    const saw = tileAt(w.city, 1, 1);
    if (!saw) throw new Error('no saw');
    const c = tileCentre(w, saw);
    const e = spawnEnemy(w, type, c.x, c.y - dist);
    e.hp = e.maxHp = 1e6;
    return { w, e };
  }

  /** Blades only (enemies stay where they are). */
  function spin(w: World, seconds: number) {
    for (let i = 0; i < seconds / DT; i++) {
      w.time += DT;
      w.hash.clear();
      w.enemies.forEach((e, idx) => w.hash.insert(idx, e.x, e.y));
      updateBlades(w, DT);
    }
  }

  it('hits an enemy on its path once per pass, and snags it', () => {
    const { w, e } = sawWith(blade.orbit);
    spin(w, 2 / blade.turnsPerSec);
    expect(w.damageBy.saw).toBeCloseTo(2 * blade.damage);
    expect(hasStatus(w, e, 'snagged')).toBe(true);
  });

  it('reaches an enemy touching the Saw, but not one far outside the orbit', () => {
    const close = sawWith(16 + 6 + 1, 'runner');
    spin(close.w, 1 / blade.turnsPerSec);
    expect(close.w.damageBy.saw).toBeGreaterThan(0);
    const far = sawWith(blade.orbit + blade.radius + 40);
    spin(far.w, 1 / blade.turnsPerSec);
    expect(far.w.damageBy.saw ?? 0).toBe(0);
  });

  it('L3 adds a second blade; L5 lengthens the orbit', () => {
    const { w } = sawWith(blade.orbit);
    w.city.typeLevels.saw = 3;
    cityChanged(w);
    expect(w.cache.syn.blades.saw?.count).toBe(2);
    spin(w, 2 / blade.turnsPerSec);
    expect(w.damageBy.saw).toBeCloseTo(4 * blade.damage * (1 + 2 * UPGRADES.damagePerLevel));
    w.city.typeLevels.saw = 5;
    cityChanged(w);
    expect(w.cache.syn.blades.saw?.orbit).toBeGreaterThan(blade.orbit);
  });
});

describe('Crossbow', () => {
  it('fires a bolt through every enemy in a line and marks them', () => {
    const w = worldOf(['x..', 'C..', '...']);
    const bow = tileAt(w.city, 0, 0);
    if (!bow) throw new Error('no crossbow');
    w.weapons.set(bow.id, { cooldown: 0, aim: 0, aimTimer: 0 });
    const c = tileCentre(w, bow);
    const line = [100, 150, 200, 250].map((d) => {
      const e = spawnEnemy(w, 'brute', c.x, c.y - d);
      e.hp = e.maxHp = 1e6;
      return e;
    });
    for (let i = 0; i < 0.5 / DT; i++) {
      w.time += DT;
      w.hash.clear();
      w.enemies.forEach((e, idx) => w.hash.insert(idx, e.x, e.y));
      updateWeapons(w, DT);
      updateProjectiles(w, DT);
    }
    const dmg = TILES.crossbow.weapon?.damage ?? 0;
    for (const e of line) {
      expect(e.maxHp - e.hp).toBeCloseTo(dmg);
      expect(hasStatus(w, e, 'marked')).toBe(true);
    }
  });
});

describe('Flamethrower', () => {
  it('burns every enemy in its cone, not the ones beside or behind it', () => {
    const w = worldOf(['...', 'f..', 'C..']);
    const flamer = tileAt(w.city, 0, 1);
    if (!flamer) throw new Error('no flamethrower');
    const c = tileCentre(w, flamer);
    const spawn = (dx: number, dy: number) => {
      const e = spawnEnemy(w, 'brute', c.x + dx, c.y + dy);
      e.hp = e.maxHp = 1e6;
      return e;
    };
    // Facing up: the cone opens upward toward the nearest enemy.
    const near = spawn(0, -40);
    const inCone = spawn(10, -70);
    const beside = spawn(70, -10);
    for (let i = 0; i < 1 / DT; i++) {
      w.time += DT;
      w.hash.clear();
      w.enemies.forEach((e, idx) => w.hash.insert(idx, e.x, e.y));
      updateWeapons(w, DT);
      updateBurns(w, DT);
    }
    for (const e of [near, inCone]) {
      expect(e.hp).toBeLessThan(e.maxHp);
      expect(hasStatus(w, e, 'burning')).toBe(true);
    }
    expect(beside.hp).toBe(beside.maxHp);
    expect(w.damageBy.flamethrower).toBeGreaterThan(0);
  });

  it('keeps burning enemies after they leave the cone', () => {
    const w = worldOf(['f..', 'C..', '...']);
    const flamer = tileAt(w.city, 0, 0);
    if (!flamer) throw new Error('no flamethrower');
    const c = tileCentre(w, flamer);
    const e = spawnEnemy(w, 'brute', c.x, c.y - 40);
    e.hp = e.maxHp = 1e6;
    w.weapons.set(flamer.id, { cooldown: 0, aim: 0, aimTimer: 0 });
    w.hash.insert(0, e.x, e.y);
    updateWeapons(w, DT);
    e.x += 1000;
    const before = e.hp;
    for (let i = 0; i < 1 / DT; i++) {
      w.time += DT;
      updateBurns(w, DT);
    }
    expect(before - e.hp).toBeCloseTo(TILES.flamethrower.combo?.burnDps ?? 0, 0);
  });
});
