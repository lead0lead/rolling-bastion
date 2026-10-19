import { SPAWN } from '../config/balance';
import { ENEMIES, type EnemyType } from '../config/enemies';
import { SPAWN_GROUPS, SPIKES, WAVES, type SpawnGroupId, type WaveEntry } from '../config/waves';
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
  while (w.spawn.spikeIndex < SPIKES.length) {
    const spike = SPIKES[w.spawn.spikeIndex];
    if (!spike || spike.at > w.time) break;
    spawnRing(w, spike.enemy, spike.count);
    w.spawn.spikeIndex++;
  }

  w.spawn.budget = Math.min(SPAWN.maxBankedBudget, w.spawn.budget + budgetRate(w.time) * dt);
  w.spawn.next ??= pickGroup(w);
  const next = w.spawn.next;
  const def = SPAWN_GROUPS[next.id];
  const cost = ENEMIES[def.enemy].cost * next.count;
  if (w.spawn.budget >= cost && w.enemies.length < SPAWN.maxEnemies) {
    spawnGroup(w, next.id, next.count);
    w.spawn.budget -= cost;
    w.spawn.next = null;
  }

  relocateFarEnemies(w);
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

export function spawnEnemy(w: World, type: EnemyType, x: number, y: number): Enemy {
  const def = ENEMIES[type];
  const maxHp = def.maxHp * (1 + (SPAWN.hpGrowthPerMinute * w.time) / 60);
  const e = w.enemyPool.pop() ?? ({} as Enemy);
  e.type = type;
  e.x = e.px = x;
  e.y = e.py = y;
  e.hp = e.maxHp = maxHp;
  e.kvx = e.kvy = 0;
  e.hitTime = -Infinity;
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
