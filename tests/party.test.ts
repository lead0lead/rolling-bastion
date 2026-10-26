import { describe, expect, it } from 'vitest';
import { GRID } from '../src/config/balance';
import { ENEMIES } from '../src/config/enemies';
import { GADGETS } from '../src/config/gadgets';
import type { TileType } from '../src/config/tiles';
import {
  damageEnemy,
  hitEnemy,
  newProjectile,
  removeDead,
  updateProjectiles,
  updateWeapons,
} from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { domeCircle, hitDome, updateGadgets } from '../src/sim/gadgets';
import { tileAt } from '../src/sim/grid';
import { spawnEnemy } from '../src/sim/spawner';
import { registerKill } from '../src/sim/streak';
import { cityChanged, createWorld, tileCentre, type World } from '../src/sim/world';
import { typedCity } from './helpers';

const DT = 1 / 60;
const LEGEND: Record<string, TileType> = {
  C: 'core',
  h: 'hull',
  t: 'tesla',
  y: 'dome',
  a: 'hangar',
};

function worldOf(rows: string[]): World {
  const w = createWorld(1);
  w.city = typedCity(rows, LEGEND);
  cityChanged(w);
  // Keep the Core's pistol quiet so only the tested thing deals damage.
  const core = w.city.tiles.find((t) => t.type === 'core');
  if (core) w.weapons.set(core.id, { cooldown: Infinity, aim: 0, aimTimer: Infinity });
  return w;
}

function tile(w: World, x: number, y: number) {
  const t = tileAt(w.city, x, y);
  if (!t) throw new Error(`no tile at ${x},${y}`);
  return t;
}

function rehash(w: World): void {
  w.hash.clear();
  w.enemies.forEach((e, i) => w.hash.insert(i, e.x, e.y));
}

describe('Tesla Coil', () => {
  it('zaps the target and jumps on to its neighbours, weaker each time', () => {
    const w = worldOf(['Ct']);
    const tesla = tile(w, 1, 0);
    w.weapons.set(tesla.id, { cooldown: 0, aim: 0, aimTimer: 0 });
    const c = tileCentre(w, tesla);
    // The third is out of the coil's own range but within a jump of the second.
    const es = [c.x + 150, c.x + 210, c.x + 270].map((x) => spawnEnemy(w, 'brute', x, c.y));
    rehash(w);
    updateWeapons(w, DT);
    const hp = es.map((e) => e.maxHp - e.hp);
    expect(hp.every((d) => d > 0)).toBe(true);
    expect(hp[0]).toBeGreaterThan(hp[1] as number);
    expect(hp[1]).toBeGreaterThan(hp[2] as number);
    expect(w.events).toContainEqual(expect.objectContaining({ kind: 'zap' }));
  });
});

describe('Dome Emitter', () => {
  it('holds enemies at its edge and takes the damage instead of the city', () => {
    const w = worldOf(['Cy']);
    updateGadgets(w, DT);
    expect(w.dome.hp).toBe(GADGETS.dome.hp);
    const c = domeCircle(w);
    const e = spawnEnemy(w, 'brute', c.x + c.r + ENEMIES.brute.radius + 5, c.y);
    const core = tile(w, 0, 0);
    for (let i = 0; i < 60; i++) {
      w.time += DT;
      updateEnemies(w, DT);
    }
    expect(core.hp).toBe(core.maxHp);
    expect(w.dome.hp).toBeLessThan(w.dome.max);
    expect(Math.hypot(e.x - c.x, e.y - c.y)).toBeGreaterThanOrEqual(c.r);
  });

  it('breaks with a shockwave and is back at full strength after the rebuild time', () => {
    const w = worldOf(['Cy']);
    updateGadgets(w, DT);
    const c = domeCircle(w);
    const e = spawnEnemy(w, 'brute', c.x + c.r, c.y);
    rehash(w);
    hitDome(w, 1e6);
    expect(w.dome.hp).toBe(0);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(w.events).toContainEqual(expect.objectContaining({ kind: 'domeBreak' }));
    w.time += GADGETS.dome.rebuild + 0.1;
    updateGadgets(w, DT);
    expect(w.dome.hp).toBe(w.dome.max);
  });
});

describe('Drone Hangar', () => {
  it('launches drones that shoot nearby enemies', () => {
    const w = worldOf(['Ca']);
    const hangar = tile(w, 1, 0);
    const c = tileCentre(w, hangar);
    const e = spawnEnemy(w, 'juggernaut', c.x + 150, c.y);
    for (let i = 0; i < 60 * 12; i++) {
      w.time += DT;
      rehash(w);
      updateGadgets(w, DT);
      updateProjectiles(w, DT);
    }
    expect(w.drones.length).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(e.maxHp);
    // Losing the hangar takes its drones with it.
    w.city.tiles = w.city.tiles.filter((t) => t.type !== 'hangar');
    cityChanged(w);
    updateGadgets(w, DT);
    expect(w.drones).toHaveLength(0);
  });
});

describe('Thief', () => {
  it('steals coins on touching the city, runs, and pays the loot back doubled when killed', () => {
    const w = worldOf(['C']);
    w.coins = 100;
    const core = tile(w, 0, 0);
    const c = tileCentre(w, core);
    const e = spawnEnemy(w, 'thief', c.x + GRID.cellPx / 2 + ENEMIES.thief.radius, c.y);
    updateEnemies(w, DT);
    expect(e.fleeing).toBe(true);
    expect(e.loot).toBe(ENEMIES.thief.thief?.steal);
    expect(w.coins).toBe(100 - e.loot);
    const before = w.coins;
    damageEnemy(w, e, 1e6);
    removeDead(w);
    expect(w.coins).toBe(before + ENEMIES.thief.xp + e.loot * 2);
  });
});

describe('Blob', () => {
  it('splits into two halves on a hit that does not kill it', () => {
    const w = worldOf(['C']);
    const e = spawnEnemy(w, 'blob', 500, 500);
    const hp = e.hp;
    hitEnemy(w, e, 4, 0, 0, 0);
    expect(w.enemies).toHaveLength(2);
    expect(e.hp).toBeCloseTo((hp - 4) / 2);
    expect(w.enemies[1]?.hp).toBeCloseTo(e.hp);
    expect(e.radius).toBeLessThan(ENEMIES.blob.radius);
  });
});

describe('Mirror Knight', () => {
  it('bounces shots back and takes a tenth of the damage', () => {
    const w = worldOf(['Ch']);
    const m = spawnEnemy(w, 'mirror', 400, 0);
    const p = newProjectile(w, tile(w, 1, 0), 380, 0);
    Object.assign(p, {
      vx: 600,
      vy: 0,
      damage: 20,
      radius: 3,
      knockback: 0,
      blast: 0,
      pierce: 0,
      life: 1,
    });
    rehash(w);
    updateProjectiles(w, DT);
    expect(p.vx).toBeLessThan(0);
    expect(p.dead).toBe(false);
    expect(m.maxHp - m.hp).toBeCloseTo(2);
  });
});

describe('Disco Robot', () => {
  it('strikes the tiles in its ring on every other beat', () => {
    const w = worldOf(['C']);
    const core = tile(w, 0, 0);
    const c = tileCentre(w, core);
    const e = spawnEnemy(w, 'disco', c.x + 100, c.y);
    e.cooldown = 0;
    e.gen = 1; // the next beat is the second: a strike
    updateEnemies(w, DT);
    expect(core.hp).toBeLessThan(core.maxHp);
    expect(w.events).toContainEqual(expect.objectContaining({ kind: 'discoBeat', strike: true }));
  });
});

describe('kill streaks', () => {
  it('announces a tier once when the streak reaches it, and starts over after a pause', () => {
    const w = worldOf(['C']);
    for (let i = 0; i < 12; i++) registerKill(w);
    expect(w.events.filter((e) => e.kind === 'streak')).toHaveLength(1);
    w.time += GADGETS.streak.window + 1;
    registerKill(w);
    expect(w.streak.count).toBe(1);
  });
});
