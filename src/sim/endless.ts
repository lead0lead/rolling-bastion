import { ENDLESS } from '../config/endless';
import type { World } from './world';

/** Endless (concept-v2.md §2.11): the run goes on after the boss kill. */

/** True once the player chose "Keep going". */
export function isEndless(w: World): boolean {
  return w.endlessSince !== null;
}

/** After the boss kill: resume the run in endless. No effect otherwise. */
export function startEndless(w: World): void {
  if (!w.won || isEndless(w)) return;
  w.endlessSince = w.time;
  w.over = false;
}

/** Enemy HP and damage multiplier for enemies spawned now (1 before endless). */
export function endlessFactor(w: World): number {
  if (w.endlessSince === null) return 1;
  return ENDLESS.growthPerMinute ** ((w.time - w.endlessSince) / 60);
}

/** Game time the next Colossus returns at (null before endless); waits while one lives. */
export function nextBossAt(w: World): number | null {
  if (w.endlessSince === null) return null;
  return w.endlessSince + ENDLESS.bossEvery * (w.bossReturns + 1);
}
