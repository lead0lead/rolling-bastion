import { SPAWN } from '../config/balance';
import { BOSS, ELITE, ENEMIES, type EnemyType } from '../config/enemies';
import { SPAWN_GROUPS, SPIKES, WAVES, type SpawnGroupId, type WaveEntry } from '../config/waves';
import { xpToNext } from './progression';
import { cityCentre, type Enemy, type World } from './world';

/** Spawn budget per second at game time `t`, interpolated from the wave table. */
export function budgetRate(t: number): number {
  let prev = WAVES[0] as WaveEntry;
  for (const entry of WAVES) {
    if (entry.at > t) {
      const f = (t - prev.at) / (entry.at - prev.at);
      return prev.budgetPerSec + (entry.budgetPerSec - prev.budgetPerSec) * f;
    }
    prev = entry;
  }
  return prev.budgetPerSec;
}

function currentWave(t: number): WaveEntry {
  let current = WAVES[0] as WaveEntry;
  for (const entry of WAVES) if (entry.at <= t) current = entry;
  return current;
}

export function spawnRingRadius(w: World): number {
  return w.viewRadius + SPAWN.ringMargin;
}

export function updateSpawner(w: World, dt: number): void {
  if (w.time >= BOSS.at) {
    updateBossPhase(w, dt);
    relocateFarEnemies(w);
    return;
  }
  while (w.spawn.spikeIndex < SPIKES.length) {
    const spike = SPIKES[w.spawn.spikeIndex];
    if (!spike || spike.at > w.time) break;
    if (spike.elite) {
      let xp = 0;
      for (let i = 0; i < spike.elite.levels; i++) xp += xpToNext(w.level + i);
      const p = ringPoint(w, w.rng.next() * Math.PI * 2);
      spawnEnemy(w, spike.enemy, p.x, p.y, { hpMultiplier: spike.elite.hpMultiplier, xp });
    } else {
      spawnRing(w, spike.enemy, spike.count);
    }
    w.spawn.spikeIndex++;
  }

  w.spawn.budget = Math.min(SPAWN.maxBankedBudget, w.spawn.budget + budgetRate(w.time) * dt);
  w.spawn.next ??= pickGroup(w);
  const next = w.spawn.next;
  const def = SPAWN_GROUPS[next.id];
  const cost = ENEMIES[def.enemy].cost * next.count;
  if (w.spawn.budget >= cost) {
    if (w.enemies.length < SPAWN.maxEnemies) {
      spawnGroup(w, next.id, next.count);
    } else if (w.enemies.length < SPAWN.maxEnemies + ELITE.headroom) {
      // Above the soft cap the group arrives as one elite (concept.md §4.1).
      const p = ringPoint(w, w.rng.next() * Math.PI * 2);
      const mult = Math.max(ELITE.minMultiplier, next.count);
      spawnEnemy(w, def.enemy, p.x, p.y, {
        hpMultiplier: mult,
        xp: ENEMIES[def.enemy].xp * mult,
      });
    }
    w.spawn.budget -= cost;
    w.spawn.next = null;
  }

  relocateFarEnemies(w);
}

/** From BOSS.at: regular spawns stop, the boss arrives and summons Swarmer packs. */
function updateBossPhase(w: World, dt: number): void {
  if (!w.bossSpawned) {
    w.bossSpawned = true;
    const p = ringPoint(w, w.rng.next() * Math.PI * 2);
    spawnEnemy(w, BOSS.type, p.x, p.y);
    w.bossAddTimer = BOSS.addInterval;
    return;
  }
  const boss = w.boss;
  if (!boss) return;
  w.bossAddTimer -= dt;
  if (w.bossAddTimer > 0) return;
  w.bossAddTimer = BOSS.addInterval;
  for (let i = 0; i < BOSS.addCount; i++) {
    const a = (i / BOSS.addCount) * Math.PI * 2;
    const r = boss.radius + SPAWN.clusterScatter;
    spawnEnemy(w, 'swarmer', boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r);
  }
}

function pickGroup(w: World): { id: SpawnGroupId; count: number } {
  const groups = Object.entries(currentWave(w.time).groups) as [SpawnGroupId, number][];
  const total = groups.reduce((s, [, weight]) => s + weight, 0);
  let roll = w.rng.next() * total;
  let id = groups[groups.length - 1]?.[0] ?? 'swarmer';
  for (const [gid, weight] of groups) {
    roll -= weight;
    if (roll < 0) {
      id = gid;
      break;
    }
  }
  const [min, max] = SPAWN_GROUPS[id].count;
  return { id, count: w.rng.int(min, max) };
}

export function spawnGroup(w: World, id: SpawnGroupId, count: number): void {
  const def = SPAWN_GROUPS[id];
  const angle = w.rng.next() * Math.PI * 2;
  const centre = ringPoint(w, angle);
  if (def.formation === 'line') {
    const tx = -Math.sin(angle);
    const ty = Math.cos(angle);
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * SPAWN.lineSpacing;
      spawnEnemy(w, def.enemy, centre.x + tx * offset, centre.y + ty * offset);
    }
    return;
  }
  for (let i = 0; i < count; i++) {
    const s = count > 1 ? SPAWN.clusterScatter : 0;
    spawnEnemy(
      w,
      def.enemy,
      centre.x + (w.rng.next() * 2 - 1) * s,
      centre.y + (w.rng.next() * 2 - 1) * s,
    );
  }
}

/** Spawns `count` enemies spread evenly around the spawn ring. */
export function spawnRing(w: World, type: EnemyType, count: number): void {
  const start = w.rng.next() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const p = ringPoint(w, start + (i / count) * Math.PI * 2);
    spawnEnemy(w, type, p.x, p.y);
  }
}

/** Makes a spawned enemy an elite: bigger, tougher, worth more XP. */
export interface EliteOptions {
  hpMultiplier: number;
  xp: number;
}

export function spawnEnemy(
  w: World,
  type: EnemyType,
  x: number,
  y: number,
  elite?: EliteOptions,
): Enemy {
  const def = ENEMIES[type];
  const growth = def.boss ? 1 : 1 + (SPAWN.hpGrowthPerMinute * w.time) / 60;
  const maxHp = def.maxHp * growth * (elite?.hpMultiplier ?? 1);
  const e = w.enemyPool.pop() ?? ({} as Enemy);
  e.type = type;
  e.x = e.px = x;
  e.y = e.py = y;
  e.hp = e.maxHp = maxHp;
  e.radius = def.radius * (elite ? ELITE.scale : 1);
  e.xp = elite?.xp ?? def.xp;
  e.elite = !!elite;
  e.cooldown = def.ranged ? w.rng.next() * def.ranged.interval : 0;
  e.noDrop = false;
  if (def.boss) w.boss = e;
  e.kvx = e.kvy = 0;
  e.hitTime = -Infinity;
  e.slow = 1;
  e.dead = false;
  w.enemies.push(e);
  return e;
}

function ringPoint(w: World, angle: number): { x: number; y: number } {
  const c = cityCentre(w);
  const r = spawnRingRadius(w);
  return { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r };
}

/** Enemies left far behind are moved back onto the ring, ahead of the city. */
function relocateFarEnemies(w: World): void {
  const c = cityCentre(w);
  const limit = spawnRingRadius(w) + SPAWN.relocateBeyond;
  const moving = Math.hypot(w.vx, w.vy) > 1;
  const heading = Math.atan2(w.vy, w.vx);
  for (const e of w.enemies) {
    const dx = e.x - c.x;
    const dy = e.y - c.y;
    if (dx * dx + dy * dy <= limit * limit) continue;
    const spread = (w.rng.next() * 2 - 1) * (Math.PI / 3);
    const angle = moving ? heading + spread : w.rng.next() * Math.PI * 2;
    const p = ringPoint(w, angle);
    e.x = e.px = p.x;
    e.y = e.py = p.y;
  }
}
