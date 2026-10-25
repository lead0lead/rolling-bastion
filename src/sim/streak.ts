import { GADGETS } from '../config/gadgets';
import type { World } from './world';

/** Kill streaks (concept-v2.md §2.17). */

const S = GADGETS.streak;

/** Counts a kill; announces a streak tier the first time its length is reached. */
export function registerKill(w: World): void {
  const s = w.streak;
  if (w.time - s.at > S.window) {
    s.count = 0;
    s.tier = -1;
  }
  s.count++;
  s.at = w.time;
  for (let i = S.tiers.length - 1; i > s.tier; i--) {
    const [n, label] = S.tiers[i] as readonly [number, string];
    if (s.count >= n) {
      s.tier = i;
      w.events.push({ kind: 'streak', label, count: s.count });
      break;
    }
  }
}

/** Kills in a row right now (0 once the streak has lapsed). */
export function streakCount(w: World): number {
  return w.time - w.streak.at <= S.window ? w.streak.count : 0;
}
