import { describe, expect, it } from 'vitest';
import { SPAWN } from '../src/config/balance';
import { ELITE, ENEMIES } from '../src/config/enemies';
import { ECONOMY } from '../src/config/economy';
import { ROUND_GROUPS, SPAWN_GROUPS } from '../src/config/waves';
import type { TileType } from '../src/config/tiles';
import { removeDead } from '../src/sim/combat';
import { updateGadgets } from '../src/sim/gadgets';
import { updateEnemies } from '../src/sim/enemies';
import { tileAt } from '../src/sim/grid';
import { spawnEnemy, spawnRing, updateSpawner } from '../src/sim/spawner';
import { cityChanged, createWorld, tileCentre, type World } from '../src/sim/world';
import { typedCity } from './helpers';

const DT = 1 / 60;
const LEGEND: Record<string, TileType> = { C: 'core', h: 'hull', d: 'dome', f: 'flamethrower' };

function worldOf(rows: string[]): World {
  const w = createWorld(1);
  w.city = typedCity(rows, LEGEND);
  cityChanged(w);
  return w;
}

function tile(w: World, x: number, y: number) {
  const t = tileAt(w.city, x, y);
  if (!t) throw new Error(`no tile at ${x},${y}`);
  return t;
}

describe('Sapper', () => {
  it('walks past other tiles to the nearest bridge and attacks it', () => {
    // The Hull at (1, 2) is the only bridge: it connects (1, 3)-(1, 4) to the Core.
    const w = worldOf(['.....', '.C...', '.h...', '.h...', '.h...']);
    const bridges = [...w.cache.bridges].map((id) => w.city.tiles.find((t) => t.id === id));
    expect(bridges.map((t) => [t?.gx, t?.gy])).toEqual(
      expect.arrayContaining([
        [1, 2],
        [1, 3],
      ]),
    );
    const target = tile(w, 1, 2);
    const c = tileCentre(w, target);
    spawnEnemy(w, 'sapper', c.x + 120, c.y);
    for (let i = 0; i < 120; i++) updateEnemies(w, DT);
    expect(target.hp).toBeLessThan(target.maxHp);
  });
});

describe('Spitter', () => {
  it('stops at its keep distance and hurts tiles with shots', () => {
    const w = worldOf(['...', '.C.', '...']);
    const core = tile(w, 1, 1);
    const c = tileCentre(w, core);
    const ranged = ENEMIES.spitter.ranged;
    if (!ranged) throw new Error('spitter has no ranged attack');
    const e = spawnEnemy(w, 'spitter', c.x + 400, c.y);
    for (let i = 0; i < 60 * 10; i++) updateEnemies(w, DT);
    expect(e.x - c.x).toBeGreaterThan(ranged.keepDistance - 5);
    expect(e.x - c.x).toBeLessThan(ranged.keepDistance + 5);
    expect(core.hp).toBeLessThan(core.maxHp);
  });

  it('shots are absorbed by the dome', () => {
    const w = worldOf(['...', 'dC.', '...']);
    const core = tile(w, 1, 1);
    const c = tileCentre(w, core);
    const ranged = ENEMIES.spitter.ranged;
    if (!ranged) throw new Error('spitter has no ranged attack');
    w.enemyShots.push({
      x: c.x + 40,
      y: c.y,
      px: c.x + 40,
      py: c.y,
      vx: -ranged.shotSpeed,
      vy: 0,
      damage: 10,
      life: 1,
      dead: false,
    });
    updateGadgets(w, DT);
    for (let i = 0; i < 30; i++) updateEnemies(w, DT);
    expect(core.hp).toBe(core.maxHp);
    expect(w.dome.hp).toBeCloseTo(w.dome.max - 10);
    expect(w.enemyShots).toHaveLength(0);
  });
});

describe('Bomber', () => {
  it('damages every tile in a 3×3 square on contact, then dies without paying coins', () => {
    // Flamethrowers survive the blast (a Hull has exactly the bomb's damage in HP).
    const w = worldOf(['ffff', 'fCff', 'ffff', 'ffff']);
    const centre = tile(w, 3, 1);
    const c = tileCentre(w, centre);
    spawnEnemy(w, 'bomber', c.x + 16 + ENEMIES.bomber.radius, c.y);
    updateEnemies(w, DT);
    removeDead(w);
    const bomb = ENEMIES.bomber.bomb?.damage ?? 0;
    expect(centre.hp).toBe(centre.maxHp - bomb);
    expect(tile(w, 2, 0).hp).toBe(tile(w, 2, 0).maxHp - bomb);
    expect(tile(w, 2, 2).hp).toBe(tile(w, 2, 2).maxHp - bomb);
    expect(tile(w, 1, 1).hp).toBe(tile(w, 1, 1).maxHp);
    expect(tile(w, 0, 0).hp).toBe(tile(w, 0, 0).maxHp);
    expect(w.enemies).toHaveLength(0);
    expect(w.coins).toBe(ECONOMY.startCoins);
    expect(w.kills).toBe(0);
  });
});

describe('elites', () => {
  it('spawn groups above the enemy cap arrive as one elite', () => {
    const w = createWorld(1);
    spawnRing(w, 'swarmer', SPAWN.maxEnemies);
    w.spawn.budget = 10;
    w.spawn.next = { id: 'swarmer', count: 1 };
    updateSpawner(w, DT);
    const elite = w.enemies.at(-1);
    expect(w.enemies).toHaveLength(SPAWN.maxEnemies + 1);
    expect(elite?.elite).toBe(true);
    expect(elite?.radius).toBeCloseTo(ENEMIES.swarmer.radius * ELITE.scale);
    expect(elite?.xp).toBe(ENEMIES.swarmer.xp * ELITE.minMultiplier);
  });
});

describe('round table', () => {
  it('is sorted and introduces the new enemy types on schedule', () => {
    const rounds = ROUND_GROUPS.map((e) => e.from);
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
    const firstAt = (enemy: string) =>
      ROUND_GROUPS.find((e) =>
        Object.keys(e.groups).some(
          (g) => SPAWN_GROUPS[g as keyof typeof SPAWN_GROUPS].enemy === enemy,
        ),
      )?.from;
    expect(firstAt('brute')).toBe(4);
    expect(firstAt('spitter')).toBe(6);
    expect(firstAt('sapper')).toBe(7);
    expect(firstAt('bomber')).toBe(8);
  });
});
