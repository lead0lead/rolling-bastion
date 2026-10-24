import { loadWorld, saveWorld } from './sim/save';
import type { World } from './sim/world';

/** The run in progress, kept in localStorage so a reloaded tab picks it up again (concept-v2.md §2.15). */
const STORAGE_KEY = 'rolling-bastion:run';

export function writeSavedRun(w: World): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, saveWorld(w));
  } catch {
    // Storage full or blocked: the run just isn't saved.
  }
}

/** The saved run, or null if there is none or it can't be read. */
export function readSavedRun(): World | null {
  try {
    const json = globalThis.localStorage?.getItem(STORAGE_KEY);
    return json ? loadWorld(json) : null;
  } catch {
    return null;
  }
}

export function clearSavedRun(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
