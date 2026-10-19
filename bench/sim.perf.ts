import { expect, it } from 'vitest';
import { SPAWN } from '../src/config/balance';
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
      life: 0.6,
      source: 'gatling',
      dead: false,
    });
  }
}

it('simulation step stays well inside the frame budget', () => {
  const w = heavyWorld();
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
    `avg ${avg.toFixed(3)} ms/step, p99 ${p99.toFixed(3)} ms, worst ${worst.toFixed(3)} ms ` +
      `(${Math.round(enemies / ticks)} enemies, ${Math.round(projectiles / ticks)} projectiles)`,
  );
  expect(avg).toBeLessThan(8);
});
