import { GRID, MOVE } from '../config/balance';
import { updateBoss } from './boss';
import { healTiles, removeDead, updateProjectiles, updateWeapons } from './combat';
import { updateEnemies } from './enemies';
import { collectGems } from './progression';
import { updateSpawner } from './spawner';
import { expandGrid } from './grid';
import { updateWave } from './waves';
import { cityChanged, type World } from './world';

/** Player steering input; each axis in −1…1. */
export interface MoveInput {
  x: number;
  y: number;
}

/** Advances the world by one fixed tick. */
export function step(w: World, input: MoveInput, dt: number): void {
  if (w.over || w.waveCleared) return;
  w.time += dt;
  moveCity(w, input, dt);
  updateWave(w);
  if (w.waveCleared) return;
  updateSpawner(w, dt);
  updateBoss(w, dt);
  updateEnemies(w, dt);
  if (w.over) return;
  updateWeapons(w, dt);
  updateProjectiles(w, dt);
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

/** Grows the grid at the times in GRID.expandAt (concept.md §2.1); each queues a free build pause. */
export function updateTimeline(w: World): void {
  const at = GRID.expandAt[w.expansions];
  if (at === undefined || w.time < at) return;
  w.expansions++;
  if (!expandGrid(w.city)) return;
  cityChanged(w);
  w.pendingExpansions++;
  w.expandedAt = w.time;
  w.events.push({ kind: 'gridExpanded', size: w.city.gridSize });
}
