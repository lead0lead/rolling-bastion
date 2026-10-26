import { LEVEL_UP, XP } from '../config/balance';
import type { PieceDef } from '../config/pieces';
import type { TileType } from '../config/tiles';
import { repairAmount } from './economy';
import { coreTile } from './grid';
import type { Rng } from './rng';
import { isLandLevel } from './land';
import { applyUpgrade, upgradeType } from './upgrades';
import { cityChanged, type World } from './world';

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

/**
 * Level-up offers for a run (concept.md §4.2): only pieces whose `minTime`
 * has passed, and never every card with the same main tile type.
 */
export function rollRunOffers(
  rng: Rng,
  pool: readonly PieceDef[],
  count: number,
  time: number,
): PieceDef[] {
  const available = pool.filter((p) => (p.minTime ?? 0) <= time);
  const offers = rollOffers(rng, available, count);
  const type = offers[0] && upgradeType(offers[0]);
  if (offers.length < 3 || !offers.every((p) => upgradeType(p) === type)) return offers;
  const others = available.filter((p) => upgradeType(p) !== type);
  const swap = rollOffers(rng, others, 1)[0];
  if (swap) offers[offers.length - 1] = swap;
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
    if (isLandLevel(w.level)) w.pendingLand++;
    w.events.push({ kind: 'levelUp', level: w.level });
    need = xpToNext(w.level);
  }
}

/** XP refunded per placed piece scrapped during a build pause (legacy level-up flow, used by the sim bots). */
export function scrapRefund(w: World): number {
  return Math.round(xpToNext(w.level) * LEVEL_UP.scrapRefund);
}

/** HP the Repair Core option would heal right now. */
export function repairCoreAmount(w: World): number {
  return repairAmount(w.city);
}

/** Takes over what a shop visit left: coins and lands bought (the city was edited in place). */
export function applyShopResult(w: World, shop: { coins: number; landsBought: number }): void {
  w.coins = shop.coins;
  w.landsBought = shop.landsBought;
  cityChanged(w);
}

export interface BuildResult {
  repair: boolean;
  /** Tile type levelled instead of placing a piece. */
  upgrade?: TileType | null;
  /** Placed pieces scrapped during the pause (each refunds XP). */
  scrapped: number;
  /** Rerolls spent during the pause (undone ones don't count). */
  rerollsUsed?: number;
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
  w.rerolls = Math.max(0, w.rerolls - (result.rerollsUsed ?? 0));
}
