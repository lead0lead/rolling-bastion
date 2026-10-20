import { GRID, LEVEL_UP, XP } from '../config/balance';
import type { PieceDef } from '../config/pieces';
import type { TileType } from '../config/tiles';
import { coreTile } from './grid';
import type { Rng } from './rng';
import { applyUpgrade } from './upgrades';
import { cityCentre, cityChanged, gridTopLeft, tileAtCell, type World } from './world';

/** Weighted random pick of `count` distinct pieces from the pool. */
export function rollOffers(rng: Rng, pool: readonly PieceDef[], count: number): PieceDef[] {
  const remaining = [...pool];
  const offers: PieceDef[] = [];
  while (offers.length < count && remaining.length > 0) {
    const total = remaining.reduce((s, p) => s + p.weight, 0);
    let roll = rng.next() * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= (remaining[i] as PieceDef).weight;
      if (roll < 0) {
        index = i;
        break;
      }
    }
    offers.push(...remaining.splice(index, 1));
  }
  return offers;
}

/** XP needed to go from `level` to the next (concept.md §2.8). */
export function xpToNext(level: number): number {
  return XP.base + XP.perLevel * level;
}

/** Adds XP; each level gained queues one build pause. Excess carries over. */
export function addXp(w: World, amount: number): void {
  w.xp += amount;
  let need = xpToNext(w.level);
  while (w.xp >= need) {
    w.xp -= need;
    w.level++;
    w.pendingLevelUps++;
    w.events.push({ kind: 'levelUp', level: w.level });
    need = xpToNext(w.level);
  }
}

export function dropGem(w: World, x: number, y: number, value: number): void {
  if (w.gems.length >= XP.maxGems) {
    const gem = w.gems[w.rng.int(0, w.gems.length - 1)];
    if (gem) gem.value += value;
    return;
  }
  w.gems.push({ x, y, value });
}

/**
 * A gem is collected when it is within the pickup radius of any tile
 * (Magnets widen it). With Magnet L3, gems within a wider radius drift toward
 * the city; Magnet L5 periodically pulls in every gem on screen.
 */
export function collectGems(w: World, dt = 0): void {
  const syn = w.cache.syn;
  const cell = GRID.cellPx;
  const radius = XP.pickupRadius * syn.pickupFactor;
  const drift = syn.gemDrift ? radius * syn.gemDrift.radiusFactor : radius;
  const reach = Math.ceil(drift / cell);
  const { left, top } = gridTopLeft(w);
  const centre = cityCentre(w);

  if (syn.gemPull) {
    w.gemPullTimer -= dt;
    if (w.gemPullTimer <= 0) {
      w.gemPullTimer = syn.gemPull.intervalSec;
      for (const gem of w.gems) {
        if (Math.hypot(gem.x - centre.x, gem.y - centre.y) <= w.viewRadius) gem.pulled = true;
      }
    }
  }

  let gained = 0;
  let n = 0;
  for (const gem of w.gems) {
    const gx = Math.floor((gem.x - left) / cell);
    const gy = Math.floor((gem.y - top) / cell);
    let best2 = Infinity;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const t = tileAtCell(w, gx + dx, gy + dy);
        if (!t) continue;
        const minX = left + t.gx * cell;
        const minY = top + t.gy * cell;
        const qx = Math.min(Math.max(gem.x, minX), minX + cell);
        const qy = Math.min(Math.max(gem.y, minY), minY + cell);
        best2 = Math.min(best2, (gem.x - qx) ** 2 + (gem.y - qy) ** 2);
      }
    }
    if (best2 <= radius * radius) {
      gained += gem.value;
      continue;
    }
    const speed = gem.pulled
      ? (syn.gemPull?.speed ?? 0)
      : best2 <= drift * drift
        ? (syn.gemDrift?.speed ?? 0)
        : 0;
    if (speed > 0) {
      const d = Math.hypot(centre.x - gem.x, centre.y - gem.y) || 1;
      const step = Math.min(d, speed * dt);
      gem.x += ((centre.x - gem.x) / d) * step;
      gem.y += ((centre.y - gem.y) / d) * step;
    }
    w.gems[n++] = gem;
  }
  w.gems.length = n;
  if (gained > 0) addXp(w, gained);
}

/** XP refunded per placed piece scrapped during a build pause. */
export function scrapRefund(w: World): number {
  return Math.round(xpToNext(w.level) * LEVEL_UP.scrapRefund);
}

/** HP the Repair Core option would heal right now. */
export function repairCoreAmount(w: World): number {
  const core = coreTile(w.city);
  if (!core) return 0;
  return Math.min(core.maxHp - core.hp, core.maxHp * LEVEL_UP.repairCoreFraction);
}

export interface BuildResult {
  repair: boolean;
  /** Tile type levelled instead of placing a piece. */
  upgrade?: TileType | null;
  /** Placed pieces scrapped during the pause (each refunds XP). */
  scrapped: number;
}

/** Applies a finished build pause to the run; the build screen has already edited the city. */
export function applyBuildResult(w: World, result: BuildResult): void {
  if (result.upgrade) applyUpgrade(w.city, result.upgrade);
  cityChanged(w);
  if (result.repair) {
    const core = coreTile(w.city);
    if (core) core.hp += repairCoreAmount(w);
  }
  if (result.scrapped > 0) addXp(w, result.scrapped * scrapRefund(w));
}
