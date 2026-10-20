/**
 * Player settings (concept.md §8, decided 2026-10-20), saved in
 * localStorage. The only thing the game saves.
 */
export interface Settings {
  /** Master volume 0–1, in steps of SETTINGS_LIMITS.volumeStep. */
  volume: number;
  muted: boolean;
  /** No shake, no wobble, fewer particles, no pulses. */
  reduceEffects: boolean;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  volume: 0.7,
  muted: false,
  reduceEffects: false,
  showFps: false,
};

export const SETTINGS_LIMITS = { volumeStep: 0.1 } as const;

const STORAGE_KEY = 'rolling-bastion:settings';

/** Reads saved settings; anything missing or invalid falls back to the default. */
export function parseSettings(json: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!json) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return out;
  }
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.volume === 'number' && Number.isFinite(r.volume)) out.volume = clampVolume(r.volume);
  if (typeof r.muted === 'boolean') out.muted = r.muted;
  if (typeof r.reduceEffects === 'boolean') out.reduceEffects = r.reduceEffects;
  if (typeof r.showFps === 'boolean') out.showFps = r.showFps;
  return out;
}

/** Clamps to 0–1 and rounds to the volume step. */
export function clampVolume(v: number): number {
  // Divide by a whole number of steps so 0.3 stays exactly 0.3.
  const steps = Math.round(1 / SETTINGS_LIMITS.volumeStep);
  return Math.round(Math.min(1, Math.max(0, v)) * steps) / steps;
}

function readStorage(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(s: Settings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or blocked storage: settings just aren't remembered.
  }
}

let current: Settings = parseSettings(readStorage());
const listeners = new Set<(s: Readonly<Settings>) => void>();

export function settings(): Readonly<Settings> {
  return current;
}

/** Changes settings, saves them and notifies listeners. */
export function updateSettings(patch: Partial<Settings>): void {
  current = parseSettings(JSON.stringify({ ...current, ...patch }));
  writeStorage(current);
  for (const fn of listeners) fn(current);
}

/** Calls `fn` on every change; returns a function that unsubscribes. */
export function onSettingsChange(fn: (s: Readonly<Settings>) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
