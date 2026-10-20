import { FX } from '../config/fx';
import { settings } from '../settings';

/** True when the player turned on "Reduce effects" (concept.md §8). */
export function reducedEffects(): boolean {
  return settings().reduceEffects;
}

/** Particle count for a burst, cut to a third with reduced effects. */
export function particleCount(n: number): number {
  return reducedEffects() ? Math.max(1, Math.round(n * FX.reducedParticleShare)) : n;
}

/** Strength of motion-only effects (wobble, pulses, shake): 0 with reduced effects. */
export function motion(): number {
  return reducedEffects() ? 0 : 1;
}
