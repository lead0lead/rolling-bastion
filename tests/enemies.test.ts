import { describe, expect, it } from 'vitest';
import { SPAWN } from '../src/config/balance';
import { ELITE, ENEMIES } from '../src/config/enemies';
import { SPAWN_GROUPS, SPIKES, WAVES } from '../src/config/waves';
import { TILES, type TileType } from '../src/config/tiles';
import { removeDead } from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { tileAt } from '../src/sim/grid';
import { xpToNext } from '../src/sim/progression';
import { spawnEnemy, spawnRing, updateSpawner } from '../src/sim/spawner';
import { cityChanged, createWorld, tileCentre, type World } from '../src/sim/world';
import { typedCity } from './helpers';

const DT = 1 / 60;
const LEGEND: Record<string, TileType> = { C: 'core', h: 'hull', d: 'shield', p: 'plating' };

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

  it('shots are reduced by Shield Emitters', () => {
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
    for (let i = 0; i < 30; i++) updateEnemies(w, DT);
    expect(core.hp).toBeCloseTo(core.maxHp - 10 * (1 - (TILES.shield.support?.amount ?? 0)));
    expect(w.enemyShots).toHaveLength(0);
  });
});

describe('Bomber', () => {
  it('damages every tile in a 3×3 square on contact, then dies without a gem', () => {
    // Plating survives the blast (Hull has exactly the bomb's damage in HP).
    const w = worldOf(['pppp', 'pCpp', 'pppp', 'pppp']);
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
    expect(w.gems).toHaveLength(0);
    expect(w.kills).toBe(0);
  });
});

describe('elites', () => {
  it('spawn groups above the enemy cap arrive as one elite', () => {
    const w = createWorld(1);
    spawnRing(w, 'swarmer', SPAWN.maxEnemies);
    w.time = 30;
    w.spawn.budget = 10;
    w.spawn.next = { id: 'swarmer', count: 1 };
    updateSpawner(w, DT);
    const elite = w.enemies.at(-1);
    expect(w.enemies).toHaveLength(SPAWN.maxEnemies + 1);
    expect(elite?.elite).toBe(true);
    expect(elite?.radius).toBeCloseTo(ENEMIES.swarmer.radius * ELITE.scale);
    expect(elite?.xp).toBe(ENEMIES.swarmer.xp * ELITE.minMultiplier);
  });

  it('the 7:00 Elite Brute is worth several level-ups', () => {
    const spike = SPIKES.find((s) => s.elite);
    if (!spike?.elite) throw new Error('no elite spike');
    const w = createWorld(1);
    w.level = 10;
    w.spawn.spikeIndex = SPIKES.indexOf(spike);
    w.time = spike.at;
    updateSpawner(w, DT);
    const brute = w.enemies.find((e) => e.elite);
    let xp = 0;
    for (let i = 0; i < spike.elite.levels; i++) xp += xpToNext(10 + i);
    expect(brute?.type).toBe(spike.enemy);
    expect(brute?.xp).toBe(xp);
  });
});

describe('wave table', () => {
  it('is sorted and introduces the new enemy types on schedule', () => {
    const times = WAVES.map((e) => e.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const firstAt = (enemy: string) =>
      WAVES.find((e) =>
        Object.keys(e.groups).some(
          (g) => SPAWN_GROUPS[g as keyof typeof SPAWN_GROUPS].enemy === enemy,
        ),
      )?.at;
    expect(firstAt('brute')).toBe(150);
    expect(firstAt('spitter')).toBe(240);
    expect(firstAt('sapper')).toBe(330);
    expect(firstAt('bomber')).toBe(420);
  });
});
