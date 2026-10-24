import { describe, expect, it } from 'vitest';
import { TILES, type TileType } from '../src/config/tiles';
import {
  hasStatus,
  updateBurns,
  leadPoint,
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

describe('Crossbow', () => {
  const bow = TILES.crossbow.weapon;
  if (!bow) throw new Error('no weapon');

  /** A Crossbow at (0, 0) whose first shot is due now. */
  function bowWorld() {
    const w = worldOf(['x..', 'C..', '...']);
    const tile = tileAt(w.city, 0, 0);
    if (!tile) throw new Error('no crossbow');
    w.weapons.set(tile.id, { cooldown: 0, aim: 0, aimTimer: 0 });
    return { w, c: tileCentre(w, tile) };
  }

  it('shoots the enemy with the most HP in range, not the nearest, in any direction', () => {
    const { w, c } = bowWorld();
    spawnEnemy(w, 'swarmer', c.x + 60, c.y);
    const tough = spawnEnemy(w, 'brute', c.x - 300, c.y - 100);
    updateWeapons(w, DT);
    const shot = w.projectiles[0];
    if (!shot) throw new Error('no shot');
    expect(Math.atan2(shot.vy, shot.vx)).toBeCloseTo(Math.atan2(tough.y - c.y, tough.x - c.x));
    expect(shot.damage).toBe(bow.damage);
  });

  it('ignores enemies beyond its range, however tough', () => {
    const { w, c } = bowWorld();
    const near = spawnEnemy(w, 'swarmer', c.x + 100, c.y);
    spawnEnemy(w, 'juggernaut', c.x + bow.range + 50, c.y);
    updateWeapons(w, DT);
    const shot = w.projectiles[0];
    if (!shot) throw new Error('no shot');
    expect(Math.atan2(shot.vy, shot.vx)).toBeCloseTo(Math.atan2(near.y - c.y, near.x - c.x));
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
