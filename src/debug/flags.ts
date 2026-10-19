const params = new URLSearchParams(window.location.search);

/** Debug keys/overlay: on in dev builds, or with `?debug=1` (concept.md §8). */
export const DEBUG = import.meta.env.DEV || params.get('debug') === '1';

const seedParam = Number(params.get('seed') ?? NaN);

/** `?seed=<n>` fixes the gameplay RNG seed; otherwise a random one is chosen. */
export const SEED = Number.isFinite(seedParam) ? seedParam : randomSeed();

/** Seed for a new run: the fixed one if given, else a fresh random one. */
export function nextSeed(): number {
  return Number.isFinite(seedParam) ? seedParam : randomSeed();
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** `?sandbox=1` opens the Phase 1 build-screen sandbox instead of a run. */
export const SANDBOX = params.get('sandbox') === '1';
