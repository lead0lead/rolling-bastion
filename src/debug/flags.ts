const params = new URLSearchParams(window.location.search);

/** Debug keys/overlay: on in dev builds, or with `?debug=1` (concept.md §8). */
export const DEBUG = import.meta.env.DEV || params.get('debug') === '1';

/** `?seed=<n>` fixes the gameplay RNG seed; otherwise a random one is chosen. */
export const SEED = ((): number => {
  const raw = params.get('seed');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : Math.floor(Math.random() * 2 ** 31);
})();
