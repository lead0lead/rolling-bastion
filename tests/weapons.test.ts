import { describe, expect, it } from 'vitest';
import { TILES, type TileType } from '../src/config/tiles';
import { hasStatus, leadPoint, updateProjectiles, updateWeapons } from '../src/sim/combat';
import { updateEnemies } from '../src/sim/enemies';
import { tileAt } from '../src/sim/grid';
import { spawnEnemy } from '../src/sim/spawner';
import { cityChanged, createWorld, tileCentre, type World } from '../src/sim/world';
import { typedCity } from './helpers';

const DT = 1 / 60;
const LEGEND: Record<string, TileType> = { C: 'core', m: 'mortar', c: 'cannon', h: 'hull' };

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
