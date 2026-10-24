import { PRESSURE } from '../config/pressure';
import type { World } from './world';

/** Builds pressure while the city is untouched and drains it while it is hit (concept-v2.md §2.14). */
export function updatePressure(w: World, dt: number): void {
  const untouched = w.time - w.lastHitAt >= PRESSURE.graceSec;
  const rate = untouched ? PRESSURE.growthPerSec : -PRESSURE.decayPerSec;
  w.pressure = Math.min(PRESSURE.max, Math.max(0, w.pressure + rate * dt));
}

/** Multiplier on the spawn budget. */
export function pressureBudget(w: World): number {
  return 1 + PRESSURE.budgetPerPoint * w.pressure;
}

/** Multiplier on the HP of enemies spawned now. */
export function pressureHp(w: World): number {
  return 1 + PRESSURE.hpPerPoint * w.pressure;
}

/** Multiplier on the damage of enemies spawned now. */
export function pressureDamage(w: World): number {
  return 1 + PRESSURE.damagePerPoint * w.pressure;
}
