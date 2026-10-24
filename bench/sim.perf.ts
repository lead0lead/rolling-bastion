import { expect, it } from 'vitest';
import { SPAWN } from '../src/config/balance';
import type { Facing, TileType } from '../src/config/tiles';
import { spawnRing } from '../src/sim/spawner';
import { step } from '../src/sim/step';
import { cityChanged, createWorld, type World } from '../src/sim/world';

import { cityFrom } from '../tests/helpers';

/**
 * Performance check (concept.md §1): 600 enemies + ~300 projectiles at 60 fps.
 * A frame is 16.7 ms; the simulation should use only a small part of it.
 * Run with `npm run bench`; not part of `npm test`.
 */
function heavyWorld(): World {
  const w = createWorld(3);
  // 10×10 grid, 48 tiles, about half of them Gatlings.
  w.city = cityFrom([
    '..........',
    '..aaaaaa..',
    '..aaaaaa..',
    '..aaaaaa..',
    '..aaaCaa..',
    '..aaaaaa..',
    '..aaaaaa..',
    '..aaaaaa..',
    '..aaaaaa..',
    '..........',
  ]);
  w.city.tiles.forEach((t, i) => {
    if (t.type !== 'core' && i % 2 === 0) t.type = 'gatling';
  });
  cityChanged(w);
  w.godMode = true;
  // Spawn ring close to the city so most enemies are in weapon range.
  w.viewRadius = 150;
  return w;
}

const PROJECTILES = 300;

/** Keeps 600 enemies and 300 projectiles in play. */
function refill(w: World): void {
  const missing = SPAWN.maxEnemies - w.enemies.length;
  if (missing > 0) spawnRing(w, 'swarmer', missing);
  while (w.projectiles.length < PROJECTILES) {
    const a = w.rng.next() * Math.PI * 2;
    w.projectiles.push({
      x: w.x,
      y: w.y,
      px: w.x,
      py: w.y,
      vx: Math.cos(a) * 600,
      vy: Math.sin(a) * 600,
      damage: 0,
      radius: 3,
      knockback: 0,
      blast: 0,
      pierce: 0,
      hits: [],
      life: 0.6,
      source: 'gatling',
      dead: false,
    });
  }
}

it('simulation step stays well inside the frame budget', () => {
  measure(heavyWorld(), '48-tile city');
});

/** Every type but the Core, cycled over the endless city. */
const MIX: TileType[] = [
  'gatling',
  'hull',
  'cannon',
  'generator',
  'mortar',
  'crossbow',
  'shield',
  'repair',
  'flamethrower',
  'engine',
];

/**
 * An endless-sized city (concept-v2.md §11 Phase 5): 15×14 cells, 210 tiles
 * of every type, with tiles that can't be destroyed so the size holds.
 */
function endlessWorld(): World {
  const w = createWorld(5);
  const rows = Array.from({ length: 14 }, (_, y) =>
    Array.from({ length: 15 }, (_, x) => (x === 7 && y === 7 ? 'C' : 'a')).join(''),
  );
  w.city = cityFrom(rows);
  w.city.tiles.forEach((t, i) => {
    if (t.type === 'core') return;
    t.type = MIX[i % MIX.length] ?? 'hull';
    t.facing = (i % 4) as Facing;
  });
  cityChanged(w);
  for (const t of w.city.tiles) t.hp = t.maxHp = 1e9;
  w.godMode = true;
  w.viewRadius = 300;
  return w;
}

it('an endless-sized city of ~200 tiles stays inside the frame budget', () => {
  const w = endlessWorld();
  const n = 50;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) cityChanged(w);
  for (const t of w.city.tiles) t.hp = t.maxHp = 1e9;
  const recompute = (performance.now() - t0) / n;
  console.log(
    `${w.city.tiles.length} tiles: city recompute (synergies, bridges) ${recompute.toFixed(3)} ms`,
  );
  measure(w, `${w.city.tiles.length}-tile city`);
});

/** Warms up, then times 600 ticks with 600 enemies and 300 projectiles kept in play. */
function measure(w: World, label: string): void {
  for (let i = 0; i < 300; i++) {
    refill(w);
    step(w, { x: 0.3, y: 0.1 }, 1 / 60);
  }
  const ticks = 600;
  let enemies = 0;
  let projectiles = 0;
  const times: number[] = [];
  for (let i = 0; i < ticks; i++) {
    refill(w);
    enemies += w.enemies.length;
    projectiles += w.projectiles.length;
    const t0 = performance.now();
    step(w, { x: 0.3, y: 0.1 }, 1 / 60);
    const ms = performance.now() - t0;
    times.push(ms);
  }
  const avg = times.reduce((a, b) => a + b, 0) / ticks;
  times.sort((a, b) => a - b);
  const p99 = times[Math.floor(ticks * 0.99)] ?? 0;
  const worst = times[ticks - 1] ?? 0;
  console.log(
    `${label}: avg ${avg.toFixed(3)} ms/step, p99 ${p99.toFixed(3)} ms, worst ${worst.toFixed(3)} ms ` +
      `(${Math.round(enemies / ticks)} enemies, ${Math.round(projectiles / ticks)} projectiles)`,
  );
  expect(avg).toBeLessThan(8);
}
