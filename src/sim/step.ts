import { MOVE } from '../config/balance';
import { updateBoss } from './boss';
import { healTiles, removeDead, updateBurns, updateProjectiles, updateWeapons } from './combat';
import { updateEnemies } from './enemies';
import { healByRobots, updateGadgets } from './gadgets';
import { updatePressure } from './pressure';
import { updateSpawner } from './spawner';
import type { World } from './world';

/** Player steering input; each axis in −1…1. */
export interface MoveInput {
  x: number;
  y: number;
}

/** Advances the world by one fixed tick. */
export function step(w: World, input: MoveInput, dt: number): void {
  if (w.over || w.roundClear) return;
  w.time += dt;
  moveCity(w, input, dt);
  updateSpawner(w, dt);
  updateBoss(w, dt);
  updateEnemies(w, dt);
  if (w.over) return;
  updatePressure(w, dt);
  updateGadgets(w, dt);
  updateWeapons(w, dt);
  updateProjectiles(w, dt);
  updateBurns(w, dt);
  healTiles(w, dt);
  healByRobots(w, dt);
  removeDead(w);
  // Everything spawned and dead: the round is won, time to shop (the boss win ends the run first).
  if (w.spawn.done && w.enemies.length === 0 && !w.over) w.roundClear = true;
}

/** Free 8-direction driving with a short ease and the size penalty (concept.md §2.5). */
export function moveCity(w: World, input: MoveInput, dt: number): void {
  w.px = w.x;
  w.py = w.y;
  let ix = input.x;
  let iy = input.y;
  const len = Math.hypot(ix, iy);
  if (len > 1) {
    ix /= len;
    iy /= len;
  }
  const speed = MOVE.baseSpeed * w.cache.syn.speedFactor;
  const k = Math.min(1, dt / MOVE.ease);
  w.vx += (ix * speed - w.vx) * k;
  w.vy += (iy * speed - w.vy) * k;
  w.x += w.vx * dt;
  w.y += w.vy * dt;
}
