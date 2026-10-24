import { SPAWN } from '../config/balance';
import { BOSS, ELITE, ENEMIES, type EnemyType } from '../config/enemies';
import { ENDLESS } from '../config/endless';
import {
  ROUND_GROUPS,
  ROUNDS,
  SPAWN_GROUPS,
  type RoundEntry,
  type SpawnGroupId,
} from '../config/waves';
import { endlessFactor, isBossRound, roundBudget } from './endless';
import { pressureBudget, pressureDamage, pressureHp } from './pressure';
import { cityCentre, newBossState, type Enemy, type World } from './world';

function groupsFor(round: number): RoundEntry['groups'] {
  let current = ROUND_GROUPS[0] as RoundEntry;
  for (const entry of ROUND_GROUPS) if (entry.from <= round) current = entry;
  return current.groups;
}

export function spawnRingRadius(w: World): number {
  return w.viewRadius + SPAWN.ringMargin;
}

/** Starts the next round (after the shop): fresh budget, and the Colossus if it is due. */
export function startRound(w: World): void {
  w.round++;
  w.roundClear = false;
  const total = roundBudget(w.round);
  w.spawn = { budget: 0, total, left: total, next: null, done: false };
  if (isBossRound(w.round)) {
    if (w.round > ROUNDS.bossRound) w.bossReturns++;
    spawnBoss(w, ENDLESS.bossHpPerReturn ** w.bossReturns);
  }
}

export function updateSpawner(w: World, dt: number): void {
  const sp = w.spawn;
  if (!sp.done) {
    sp.next ??= pickGroup(w);
    const def = SPAWN_GROUPS[sp.next.id];
    const cost = ENEMIES[def.enemy].cost * sp.next.count;
    // The round's remaining budget can't pay for another group: nothing more comes.
    if (cost > sp.left) {
      sp.done = true;
    } else {
      // The bank cap must never be below the next group's price, or spawning stalls for good.
      sp.budget = Math.min(
        Math.max(SPAWN.maxBankedBudget, cost),
        sp.budget + (sp.total / ROUNDS.spawnSec) * pressureBudget(w) * dt,
      );
      if (sp.budget >= cost) {
        if (w.enemies.length < SPAWN.maxEnemies) {
          spawnGroup(w, sp.next.id, sp.next.count);
        } else if (w.enemies.length < SPAWN.maxEnemies + ELITE.headroom) {
          // Above the soft cap the group arrives as one elite (concept.md §4.1).
          const p = ringPoint(w, w.rng.next() * Math.PI * 2);
          const mult = Math.max(ELITE.minMultiplier, sp.next.count);
          spawnEnemy(w, def.enemy, p.x, p.y, {
            hpMultiplier: mult,
            xp: ENEMIES[def.enemy].xp * mult,
          });
        }
        sp.budget -= cost;
        // Pressure makes a round bring more enemies: they cost less of its budget.
        sp.left -= cost / pressureBudget(w);
        sp.next = null;
      }
    }
  }
  relocateFarEnemies(w);
}

/** The Colossus arrives on the spawn ring with fresh phases and its HP times `hpMultiplier`. */
function spawnBoss(w: World, hpMultiplier: number): void {
  w.bossState = newBossState();
  w.bossSpawnedAt = w.time;
  const p = ringPoint(w, w.rng.next() * Math.PI * 2);
  const boss = spawnEnemy(w, BOSS.type, p.x, p.y);
  boss.hp = boss.maxHp *= hpMultiplier;
}

function pickGroup(w: World): { id: SpawnGroupId; count: number } {
  const groups = Object.entries(groupsFor(w.round)) as [SpawnGroupId, number][];
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

/** Makes a spawned enemy an elite: bigger, tougher, worth more coins. */
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
  const endless = endlessFactor(w);
  const growth = def.boss
    ? 1
    : (1 + SPAWN.hpGrowthPerRound * (w.round - 1)) * endless * pressureHp(w);
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
  e.burnUntil = e.snagUntil = e.staggerUntil = e.markUntil = -Infinity;
  e.burnDps = 0;
  e.damageFactor = endless * (def.boss ? 1 : pressureDamage(w));
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
