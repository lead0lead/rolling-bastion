import { ECONOMY, WAVE_PLAN } from '../config/economy';
import { PHASE3_POOL, type PieceDef } from '../config/pieces';
import { TILES, type TileType } from '../config/tiles';
import { coreTile, type CityState, type PlacedTile } from './grid';
import { rollOffers } from './progression';
import { canUpgrade, typeLevel, upgradeType } from './upgrades';
import type { World } from './world';

/**
 * Spike A (concept-v2.md §2.8, §11): waves, coins and shop prices. Quick and
 * throwaway: the kept ideas get rebuilt with tests in Phase 2.
 */

export function waveDuration(n: number): number {
  return WAVE_PLAN.firstSec + WAVE_PLAN.stepSec * (n - 1);
}

/** Combat time at which wave n starts. */
export function waveStartTime(n: number): number {
  let t = 0;
  for (let i = 1; i < n; i++) t += waveDuration(i);
  return t;
}

export function isBossWave(w: World): boolean {
  return w.wave > WAVE_PLAN.count;
}

/** Seconds left in the current wave (Infinity in the boss wave). */
export function waveTimeLeft(w: World): number {
  if (isBossWave(w)) return Infinity;
  return Math.max(0, waveDuration(w.wave) - (w.time - w.waveStart));
}

/** The v1 game time the spawner, spikes and piece pool run on (see WAVE_PLAN.v1Clock). */
export function spawnClock(w: World): number {
  const anchors = WAVE_PLAN.v1Clock.map(([wave, v1]) => [waveStartTime(wave), v1] as const);
  const t = w.time;
  let prev = anchors[0] ?? ([0, 0] as const);
  for (const a of anchors) {
    if (a[0] > t) {
      const f = (t - prev[0]) / (a[0] - prev[0] || 1);
      return prev[1] + (a[1] - prev[1]) * f;
    }
    prev = a;
  }
  return prev[1] + (t - prev[0]);
}

/** Ends the wave when its timer runs out (no timer in the boss wave). */
export function updateWave(w: World): void {
  if (w.waveCleared || isBossWave(w)) return;
  if (w.time - w.waveStart >= waveDuration(w.wave)) endWave(w);
}

/** Wave end: leftover coins are collected at a share; the field is cleared when the shop opens. */
export function endWave(w: World): void {
  w.waveCleared = true;
  let left = 0;
  for (const gem of w.gems) left += gem.value;
  w.gems.length = 0;
  addCoins(w, Math.floor(left * ECONOMY.leftoverShare));
}

export function addCoins(w: World, n: number): void {
  w.coins += n;
  w.coinsEarned += n;
}

/** Removes every enemy (no coins), shot and projectile; resets the spawn budget. */
export function clearField(w: World): void {
  const boss = w.boss;
  for (const e of w.enemies) if (e !== boss) w.enemyPool.push(e);
  w.enemies.length = 0;
  if (boss) w.enemies.push(boss);
  w.projectilePool.push(...w.projectiles);
  w.projectiles.length = 0;
  w.enemyShotPool.push(...w.enemyShots);
  w.enemyShots.length = 0;
  w.spawn.budget = 0;
  w.spawn.next = null;
}

export function startNextWave(w: World): void {
  w.wave++;
  w.waveStart = w.time;
  w.waveCleared = false;
}

/** The free starter piece: Gatling facing up above the Core, Hull to its left. Refunds nothing. */
export function addStarterPiece(city: CityState): void {
  const core = coreTile(city);
  if (!core) return;
  const groupId = city.nextGroupId++;
  const make = (type: TileType, gx: number, gy: number): PlacedTile => ({
    id: city.nextTileId++,
    type,
    gx,
    gy,
    hp: TILES[type].maxHp,
    maxHp: TILES[type].maxHp,
    groupId,
    online: true,
    facing: 0,
  });
  city.tiles.push(make('gatling', core.gx, core.gy - 1), make('hull', core.gx - 1, core.gy - 1));
  city.typeLevels.gatling = Math.max(1, city.typeLevels.gatling);
  city.typeLevels.hull = Math.max(1, city.typeLevels.hull);
}

// ------------------------------------------------------------------ prices

/** Price multiplier in the shop after wave `w.wave` (the wave just cleared). */
export function inflation(w: World): number {
  return 1 + ECONOMY.inflationPerWave * (Math.min(w.wave, WAVE_PLAN.count) - 1);
}

function priced(w: World, base: number): number {
  return Math.max(1, Math.round(base * inflation(w)));
}

export function piecePrice(w: World, def: PieceDef): number {
  let base = 0;
  for (const c of def.cells) {
    base += TILES[c.tile].family === 'structure' ? ECONOMY.pieceCellCheap : ECONOMY.pieceCell;
  }
  return priced(w, base);
}

export function upgradePrice(w: World, type: TileType): number {
  return priced(w, ECONOMY.upgradePerLevel * (typeLevel(w.city, type) + 1));
}

export function repairPrice(w: World): number {
  return priced(w, ECONOMY.repairCore);
}

export function rerollPrice(w: World, rerollsThisVisit: number): number {
  return priced(w, ECONOMY.rerollBase + ECONOMY.rerollStep * rerollsThisVisit);
}

/** Coins refunded for scrapping these tiles: a share of what was paid for them. */
export function scrapRefundFor(tiles: readonly PlacedTile[]): number {
  const paid = tiles.reduce((s, t) => s + (t.paid ?? 0), 0);
  return Math.floor(paid * ECONOMY.scrapRefund);
}

// ------------------------------------------------------------------- slots

/** Fills every unlocked piece and upgrade slot (owned, unplaced pieces stay). */
export function rollShop(w: World): void {
  const shop = w.shop;
  const time = spawnClock(w);
  const pool = PHASE3_POOL.filter((p) => (p.minTime ?? 0) <= time);
  for (let i = 0; i < ECONOMY.pieceSlots; i++) {
    const slot = shop.pieces[i];
    if (slot && (slot.locked || slot.paid !== null)) continue;
    shop.pieces[i] = null;
  }
  // Never three cards with the same main tile type (concept-v2.md §2.8).
  for (let i = 0; i < ECONOMY.pieceSlots; i++) {
    if (shop.pieces[i]) continue;
    const counts = new Map<TileType, number>();
    for (const s of shop.pieces) {
      if (s) counts.set(upgradeType(s.def), (counts.get(upgradeType(s.def)) ?? 0) + 1);
    }
    const allowed = pool.filter((p) => (counts.get(upgradeType(p)) ?? 0) < 2);
    const def = rollOffers(w.rng, allowed.length ? allowed : pool, 1)[0];
    shop.pieces[i] = def ? { def, locked: false, paid: null } : null;
  }

  for (let i = 0; i < ECONOMY.upgradeSlots; i++) {
    const slot = shop.upgrades[i];
    if (slot?.locked && canUpgrade(w.city, slot.type)) continue;
    shop.upgrades[i] = null;
  }
  for (let i = 0; i < ECONOMY.upgradeSlots; i++) {
    if (shop.upgrades[i]) continue;
    const taken = new Set(shop.upgrades.map((s) => s?.type));
    const owned = [...new Set(w.city.tiles.map((t) => t.type))].filter(
      (t) => canUpgrade(w.city, t) && !taken.has(t),
    );
    const type = owned.length ? owned[w.rng.int(0, owned.length - 1)] : undefined;
    shop.upgrades[i] = type ? { type, locked: false } : null;
  }
}
