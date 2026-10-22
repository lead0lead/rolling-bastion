import { MOVE } from '../config/balance';
import { updateBoss } from './boss';
import {
  healTiles,
  removeDead,
  updateBlades,
  updateThrusts,
  updateBurns,
  updateProjectiles,
  updateWeapons,
} from './combat';
import { updateEnemies } from './enemies';
import { collectGems } from './progression';
import { updateSpawner } from './spawner';
import type { World } from './world';

/** Player steering input; each axis in −1…1. */
export interface MoveInput {
  x: number;
  y: number;
}

/** Advances the world by one fixed tick. */
export function step(w: World, input: MoveInput, dt: number): void {
  if (w.over) return;
  w.time += dt;
  moveCity(w, input, dt);
  updateSpawner(w, dt);
  updateBoss(w, dt);
  updateEnemies(w, dt);
  if (w.over) return;
  updateWeapons(w, dt);
  updateBlades(w, dt);
  updateThrusts(w, dt);
  updateProjectiles(w, dt);
  updateBurns(w, dt);
  healTiles(w, dt);
  removeDead(w);
  collectGems(w, dt);
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
