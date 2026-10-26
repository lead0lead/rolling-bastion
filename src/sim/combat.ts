import { COMBAT } from '../config/balance';
import { STATUS, type StatusType } from '../config/statuses';
import { ELITE, ENEMIES } from '../config/enemies';
import { TILES, type TileType, type WeaponDef } from '../config/tiles';
import { destroyTile, facingAngle, type PlacedTile } from './grid';
import { spawnEnemy } from './spawner';
import { registerKill } from './streak';
import type { WeaponStats } from './synergies';
import {
  cityChanged,
  modsOf,
  tileAtCell,
  tileCentre,
  type Enemy,
  type EnemyShot,
  type Projectile,
  type World,
} from './world';

/** Largest enemy radius (an elite of the biggest type), for spatial hash queries. The boss is checked separately. */
export const MAX_ENEMY_RADIUS =
  Math.max(
    ...Object.values(ENEMIES)
      .filter((e) => !e.boss)
      .map((e) => e.radius),
  ) * ELITE.scale;

/** Firing arc as a unit facing vector and cos(half angle); null for 360°. */
export interface Arc {
  fx: number;
  fy: number;
  cosHalf: number;
}

export function weaponArc(t: PlacedTile, weapon: WeaponDef): Arc | null {
  if (weapon.arcDeg >= 360) return null;
  const a = facingAngle(t.facing);
  return { fx: Math.cos(a), fy: Math.sin(a), cosHalf: Math.cos((weapon.arcDeg * Math.PI) / 360) };
}

/** True if the offset (dx, dy) lies inside the arc (d2 = dx² + dy²). */
export function inArc(arc: Arc | null, dx: number, dy: number, d2: number): boolean {
  if (!arc) return true;
  const dot = dx * arc.fx + dy * arc.fy;
  const limit = arc.cosHalf;
  // dot ≥ |d|·cosHalf, without the square root.
  if (limit >= 0) return dot >= 0 && dot * dot >= d2 * limit * limit;
  return dot >= 0 || dot * dot <= d2 * limit * limit;
}

/** Nearest live enemy between `minRange` and `range` of (x, y) and inside `arc`, or undefined. */
export function nearestEnemy(
  w: World,
  x: number,
  y: number,
  range: number,
  arc: Arc | null = null,
  minRange = 0,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD2 = range * range;
  const min2 = minRange * minRange;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2 && d2 >= min2 && inArc(arc, dx, dy, d2)) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

/**
 * Live enemy within `range` of (x, y), inside `arc` and beyond `minRange`, that maximises `score`
 * (Bombers always beat everything else; ties go to the first found). Crossbow targeting.
 */
function bestEnemy(
  w: World,
  x: number,
  y: number,
  range: number,
  arc: Arc | null,
  minRange: number,
  score: (e: Enemy) => number,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestScore = -Infinity;
  const range2 = range * range;
  const min2 = minRange * minRange;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2 || d2 < min2 || !inArc(arc, dx, dy, d2)) continue;
    const sc = score(e) + (ENEMIES[e.type].bomb ? 1e9 : 0);
    if (sc > bestScore) {
      bestScore = sc;
      best = e;
    }
  }
  return best;
}

/** Bombers first, then the enemy with the most HP (Crossbow). */
export function strongestEnemy(
  w: World,
  x: number,
  y: number,
  range: number,
  arc: Arc | null = null,
): Enemy | undefined {
  return bestEnemy(w, x, y, range, arc, 0, (e) => e.hp);
}

/** Bombers first, then the enemy with the most others within `blastRadius` of it (Confetti Mortar, Black Hole). */
export function densestEnemy(
  w: World,
  x: number,
  y: number,
  range: number,
  arc: Arc | null,
  minRange: number,
  blastRadius: number,
): Enemy | undefined {
  const r2 = blastRadius * blastRadius;
  return bestEnemy(w, x, y, range, arc, minRange, (e) => {
    let n = 0;
    w.hash.query(e.x, e.y, blastRadius + MAX_ENEMY_RADIUS, (i) => {
      const o = w.enemies[i];
      if (o && !o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= r2) n++;
    });
    return n;
  });
}

/**
 * Online weapon tiles auto-target the nearest enemy (Crossbow: the toughest, Confetti Mortar and Black Hole: the densest group; both Bombers first) in range and inside their
 * firing arc (concept.md §2.6, §2.10). While cooling down they still re-aim
 * every `aimInterval` so barrels can track targets.
 */
export function updateWeapons(w: World, dt: number): void {
  for (const t of w.cache.weapons) {
    const weapon = w.cache.syn.weapons[t.type];
    if (!weapon) continue;
    const mods = modsOf(w, t);
    const interval = 1 / (weapon.fireRate * mods.fireRate);
    let st = w.weapons.get(t.id);
    if (!st) {
      st = { cooldown: w.rng.next() * interval, aim: facingAngle(t.facing), aimTimer: 0 };
      w.weapons.set(t.id, st);
    }
    st.cooldown -= dt;
    st.aimTimer -= dt;
    const ready = st.cooldown <= 0;
    if (!ready && st.aimTimer > 0) continue;

    const c = tileCentre(w, t);
    const arc = weaponArc(t, weapon);
    const target = weapon.targetsStrongest
      ? strongestEnemy(w, c.x, c.y, weapon.range, arc)
      : weapon.targetsDensest && weapon.blastRadius
        ? densestEnemy(w, c.x, c.y, weapon.range, arc, weapon.minRange ?? 0, weapon.blastRadius)
        : nearestEnemy(w, c.x, c.y, weapon.range, arc, weapon.minRange ?? 0);
    st.aimTimer = COMBAT.aimInterval;
    st.aim = target ? Math.atan2(target.y - c.y, target.x - c.x) : facingAngle(t.facing);
    if (!ready) continue;
    if (!target) {
      st.cooldown = COMBAT.retargetDelay;
      continue;
    }

    const damage = weapon.damage * mods.damage;
    st.firedAt = w.time;
    if (weapon.chain) {
      zapChain(w, t.type, weapon.chain, damage, target, c.x, c.y);
    } else if (weapon.hole) {
      const h = weapon.hole;
      w.holes.push({
        x: target.x,
        y: target.y,
        radius: h.radius,
        pull: h.pull,
        dps: damage,
        life: h.life,
        maxLife: h.life,
      });
    } else if (weapon.coneDeg) {
      sprayCone(w, t.type, weapon, damage, c.x, c.y, st.aim);
    } else if (weapon.blastRadius) {
      const aim = weapon.leadsTarget
        ? leadPoint(target, c.x, c.y, weapon.projectileSpeed, dt)
        : target;
      fireShell(w, t, weapon, damage, c.x, c.y, aim.x, aim.y);
    } else {
      for (let i = 0; i < weapon.projectiles; i++) {
        const spreadDeg = weapon.spreadDeg * (weapon.projectiles > 1 ? 2 : 1);
        const spread = ((w.rng.next() * 2 - 1) * spreadDeg * Math.PI) / 180;
        fireShot(w, t, weapon, damage, c.x, c.y, st.aim + spread);
      }
    }
    w.tally.shots[t.type] = (w.tally.shots[t.type] ?? 0) + 1;
    st.cooldown = Math.max(st.cooldown + interval, 0);
  }
}

/**
 * Where an enemy will be when a shot fired now from (x, y) at `speed`
 * arrives, from its movement over the last tick. Solves |P + V·t| = speed·t;
 * aims at the current position if the enemy is too fast to catch.
 */
export function leadPoint(
  e: Enemy,
  x: number,
  y: number,
  speed: number,
  dt: number,
): { x: number; y: number } {
  const vx = (e.x - e.px) / dt;
  const vy = (e.y - e.py) / dt;
  const rx = e.x - x;
  const ry = e.y - y;
  const a = vx * vx + vy * vy - speed * speed;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry;
  const disc = b * b - 4 * a * c;
  if (a >= 0 || disc < 0) return { x: e.x, y: e.y };
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return { x: e.x + vx * t, y: e.y + vy * t };
}

/**
 * A flame puff: hits every enemy within `range` and half the cone angle of
 * `aim`, setting it burning (burn scaled by the hit's damage multiplier and
 * the weapon's burn factor).
 */
function sprayCone(
  w: World,
  source: TileType,
  weapon: WeaponStats,
  damage: number,
  x: number,
  y: number,
  aim: number,
): void {
  const cosHalf = Math.cos(((weapon.coneDeg ?? 0) * Math.PI) / 360);
  const fx = Math.cos(aim);
  const fy = Math.sin(aim);
  const burn = (TILES[source].combo?.burnDps ?? 0) * (damage / weapon.damage) * weapon.burnFactor;
  const hit = (e: Enemy) => {
    if (e.dead) return;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = Math.hypot(dx, dy);
    if (d > weapon.range + e.radius) return;
    if (d > e.radius && (dx * fx + dy * fy) / d < cosHalf) return;
    hitEnemy(w, e, damage, 0, 0, 0, source, burn);
  };
  w.hash.query(x, y, weapon.range + MAX_ENEMY_RADIUS, (i) => {
    const e = w.enemies[i];
    if (e && e !== w.boss) hit(e);
  });
  if (w.boss) hit(w.boss);
}

/**
 * Lightning: hits `first`, then jumps to the nearest enemy not yet hit within
 * `chain.range`, each jump with `falloff` of the last damage. Reports the path
 * as a `zap` event for the renderer.
 */
function zapChain(
  w: World,
  source: TileType,
  chain: NonNullable<WeaponDef['chain']>,
  damage: number,
  first: Enemy,
  x: number,
  y: number,
): void {
  const pts = [x, y];
  const hit = new Set<Enemy>();
  let e: Enemy | undefined = first;
  let dmg = damage;
  for (let i = 0; e && i <= chain.jumps; i++) {
    hit.add(e);
    pts.push(e.x, e.y);
    hitEnemy(w, e, dmg, 0, 0, 0, source);
    dmg *= chain.falloff;
    let best: Enemy | undefined;
    let bestD2 = chain.range * chain.range;
    const from: Enemy = e;
    w.hash.query(from.x, from.y, chain.range + MAX_ENEMY_RADIUS, (j) => {
      const o = w.enemies[j];
      if (!o || o.dead || hit.has(o)) return;
      const d2 = (o.x - from.x) ** 2 + (o.y - from.y) ** 2;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = o;
      }
    });
    e = best;
  }
  w.events.push({ kind: 'zap', pts });
}

export function newProjectile(w: World, t: PlacedTile, x: number, y: number): Projectile {
  const p = w.projectilePool.pop() ?? ({ hits: [] } as unknown as Projectile);
  p.x = p.px = x;
  p.y = p.py = y;
  p.source = t.type;
  p.dead = false;
  p.hits.length = 0;
  w.projectiles.push(p);
  return p;
}

function fireShot(
  w: World,
  t: PlacedTile,
  weapon: WeaponStats,
  damage: number,
  x: number,
  y: number,
  angle: number,
): void {
  const p = newProjectile(w, t, x, y);
  p.vx = Math.cos(angle) * weapon.projectileSpeed;
  p.vy = Math.sin(angle) * weapon.projectileSpeed;
  p.damage = damage;
  p.radius = weapon.projectileRadius;
  p.knockback = weapon.knockback;
  p.blast = 0;
  p.pierce = weapon.pierce;
  p.life = (weapon.range / weapon.projectileSpeed) * COMBAT.projectileLifeFactor;
}

/** A lobbed shell: flies over everything and explodes at (tx, ty). */
function fireShell(
  w: World,
  t: PlacedTile,
  weapon: WeaponStats,
  damage: number,
  x: number,
  y: number,
  tx: number,
  ty: number,
): void {
  const p = newProjectile(w, t, x, y);
  const d = Math.hypot(tx - x, ty - y) || 1;
  p.vx = ((tx - x) / d) * weapon.projectileSpeed;
  p.vy = ((ty - y) / d) * weapon.projectileSpeed;
  p.damage = damage;
  p.radius = weapon.projectileRadius;
  p.knockback = weapon.knockback;
  p.blast = weapon.blastRadius ?? 0;
  p.pierce = 0;
  p.life = d / weapon.projectileSpeed;
}

/** Moves projectiles and resolves hits. Uses the enemy hash built this tick. */
export function updateProjectiles(w: World, dt: number): void {
  for (const p of w.projectiles) {
    if (p.dead) continue;
    p.px = p.x;
    p.py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.blast > 0) {
      if (p.life <= 0) {
        // Land exactly on the target point.
        p.x += p.vx * p.life;
        p.y += p.vy * p.life;
        explode(w, p.x, p.y, p.blast, p.damage, p.source);
        p.dead = true;
      }
      continue;
    }
    if (p.life <= 0) {
      p.dead = true;
      continue;
    }
    let hit: Enemy | undefined;
    w.hash.query(p.x, p.y, p.radius + MAX_ENEMY_RADIUS, (i) => {
      if (hit) return;
      const e = w.enemies[i];
      if (!e || e.dead || p.hits.includes(e)) return;
      const r = p.radius + e.radius;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy <= r * r) hit = e;
    });
    const boss = w.boss;
    if (!hit && boss && !boss.dead && !p.hits.includes(boss)) {
      const r = p.radius + boss.radius;
      if ((boss.x - p.x) ** 2 + (boss.y - p.y) ** 2 <= r * r) hit = boss;
    }
    if (hit && ENEMIES[hit.type].mirror) {
      // A Mirror Knight bounces the shot away (it keeps flying and may hit something else) and takes a tenth.
      const nx = p.x - hit.x;
      const ny = p.y - hit.y;
      const n = Math.hypot(nx, ny) || 1;
      const dot = (p.vx * nx + p.vy * ny) / n;
      p.vx -= (2 * dot * nx) / n;
      p.vy -= (2 * dot * ny) / n;
      p.hits.push(hit);
      hitEnemy(w, hit, p.damage * 0.1, 0, 0, 0, p.source);
    } else if (hit) {
      const speed = Math.hypot(p.vx, p.vy) || 1;
      hitEnemy(w, hit, p.damage, p.knockback, p.vx / speed, p.vy / speed, p.source);
      if (p.pierce > 0) {
        p.pierce--;
        p.hits.push(hit);
      } else {
        p.dead = true;
      }
    }
  }
}

/** Damages every enemy within `radius` of (x, y). */
export function explode(
  w: World,
  x: number,
  y: number,
  radius: number,
  damage: number,
  source?: TileType,
): void {
  w.hash.query(x, y, radius + MAX_ENEMY_RADIUS, (i) => {
    const e = w.enemies[i];
    if (!e || e.dead || e === w.boss) return;
    const r = radius + e.radius;
    if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) hitEnemy(w, e, damage, 0, 0, 0, source);
  });
  const boss = w.boss;
  if (boss && !boss.dead && (boss.x - x) ** 2 + (boss.y - y) ** 2 <= (radius + boss.radius) ** 2) {
    hitEnemy(w, boss, damage, 0, 0, 0, source);
  }
  w.events.push({ kind: 'blast', x, y, radius, bomb: false, source });
}

/** True if the enemy has the status right now. */
export function hasStatus(w: World, e: Enemy, status: StatusType): boolean {
  const until =
    status === 'burning'
      ? e.burnUntil
      : status === 'snagged'
        ? e.snagUntil
        : status === 'staggered'
          ? e.staggerUntil
          : e.markUntil;
  return w.time < until;
}

/**
 * Puts a status on an enemy (refreshing it, never stacking). The Colossus
 * can't be snagged or staggered. `burnDps` sets the burn strength.
 */
export function applyStatus(w: World, e: Enemy, status: StatusType, burnDps = 0): void {
  const boss = ENEMIES[e.type].boss;
  switch (status) {
    case 'burning':
      // A refresh keeps the stronger burn.
      e.burnDps = w.time < e.burnUntil ? Math.max(e.burnDps, burnDps) : burnDps;
      e.burnUntil = w.time + STATUS.burning.duration;
      break;
    case 'snagged':
      if (!boss) e.snagUntil = w.time + STATUS.snagged.duration;
      break;
    case 'staggered':
      if (!boss) e.staggerUntil = w.time + STATUS.staggered.duration;
      break;
    case 'marked':
      e.markUntil = w.time + STATUS.marked.duration;
      break;
  }
}

/** Damage multiplier for a hit from `source` on `e`: the combo bonus if it has a status the source profits from. */
export function comboFactor(w: World, e: Enemy, source: TileType | undefined): number {
  const profits = source && TILES[source].combo?.profitsFrom;
  if (!profits) return 1;
  for (const s of profits) if (hasStatus(w, e, s)) return 1 + STATUS.comboBonus;
  return 1;
}

/**
 * A weapon hit: applies the combo bonus, deals the damage, then puts the
 * source's status on the enemy (concept-v2.md §2.12). `source` is the tile
 * type credited in `w.damageBy`.
 */
export function hitEnemy(
  w: World,
  e: Enemy,
  damage: number,
  knockback: number,
  dirX: number,
  dirY: number,
  source?: TileType,
  burnDps?: number,
): void {
  const combo = source && TILES[source].combo;
  damageEnemy(w, e, damage * comboFactor(w, e, source), source);
  if (source && combo?.applies && !e.dead) {
    // Burn strength follows the hit's damage multiplier (levels, buffs), not the combo bonus.
    const base = TILES[source].weapon?.damage ?? 0;
    const burn = burnDps ?? (combo.burnDps ?? 0) * (base > 0 ? damage / base : 1);
    applyStatus(w, e, combo.applies, burn);
  }
  if (!ENEMIES[e.type].boss) {
    e.kvx += dirX * knockback;
    e.kvy += dirY * knockback;
  }
  if (!e.dead) splitOnHit(w, e);
}

/** A Blob that survives a hit splits in two: each half has half the HP and 80% of the size. */
function splitOnHit(w: World, e: Enemy): void {
  const rule = ENEMIES[e.type].splitsOnHit;
  if (!rule || e.elite || e.gen >= rule.maxGen || e.hp < rule.minHp * 2) return;
  const half = spawnEnemy(w, e.type, e.x + e.radius * 0.5, e.y);
  e.gen = half.gen = e.gen + 1;
  e.hp = half.hp = e.hp / 2;
  e.maxHp = half.maxHp = e.maxHp / 2;
  e.radius = half.radius = e.radius * 0.8;
  e.xp = half.xp = e.xp / 2;
  half.damageFactor = e.damageFactor;
  half.hitTime = e.hitTime;
  half.kvx = e.kvx;
  half.kvy = e.kvy;
}

/** Plain damage, no combos or statuses (burn ticks); credits `source` with damage up to the enemy's HP. */
export function damageEnemy(w: World, e: Enemy, damage: number, source?: TileType): void {
  if (source) w.damageBy[source] = (w.damageBy[source] ?? 0) + Math.min(damage, Math.max(0, e.hp));
  e.hp -= damage;
  e.hitTime = w.time;
  if (e.hp <= 0) e.dead = true;
}

/** The tile type whose hits set enemies burning; burn damage is credited to it. */
const BURN_SOURCE = (Object.keys(TILES) as TileType[]).find(
  (t) => TILES[t].combo?.applies === 'burning',
);

/** Burning enemies take their burn damage (concept-v2.md §2.12). */
export function updateBurns(w: World, dt: number): void {
  for (const e of w.enemies) {
    if (!e.dead && w.time < e.burnUntil) damageEnemy(w, e, e.burnDps * dt, BURN_SOURCE);
  }
}

/** Movement speed factor from statuses: 0 while staggered, slower while snagged. */
export function statusSpeed(w: World, e: Enemy): number {
  if (w.time < e.staggerUntil) return 0;
  return w.time < e.snagUntil ? STATUS.snagged.speedFactor : 1;
}

/**
 * Damages a tile; at 0 HP it is destroyed for
 * good and connectivity is recomputed. Losing the Core ends the run.
 */
export function damageTile(w: World, t: PlacedTile, amount: number): void {
  if (t.type === 'core' && w.godMode) return;
  // Already gone this tick (destroyed or broken off): nothing left to hit.
  if (tileAtCell(w, t.gx, t.gy) !== t) return;
  if (amount > 0) w.lastHitAt = w.time;
  t.hp -= amount;
  if (t.hp > 0) return;
  const c = tileCentre(w, t);
  const connected = w.city.tiles.filter((o) => o.online && o !== t);
  destroyTile(w.city, t.id);
  w.weapons.delete(t.id);
  cityChanged(w);
  w.events.push({ kind: 'tileDestroyed', x: c.x, y: c.y, type: t.type });
  if (t.type === 'core') {
    w.coreLostAt = { gx: t.gx, gy: t.gy };
    w.over = true;
    return;
  }
  breakOff(w, connected);
}

/** Tiles that were connected to the Core before a loss and no longer are break off and are gone for good. */
function breakOff(w: World, wereConnected: readonly PlacedTile[]): void {
  const lost = wereConnected.filter((o) => !o.online);
  if (lost.length === 0) return;
  for (const o of lost) {
    const c = tileCentre(w, o);
    destroyTile(w.city, o.id);
    w.weapons.delete(o.id);
    w.events.push({ kind: 'tileDestroyed', x: c.x, y: c.y, type: o.type, brokeOff: true });
  }
  cityChanged(w);
}

/** Hull L5 regenerates (concept.md §2.6: nothing else heals except Repair Robots). */
export function healTiles(w: World, dt: number): void {
  for (const t of w.city.tiles) {
    const m = modsOf(w, t);
    if (m.regen === 0 || t.hp >= t.maxHp) continue;
    t.hp = Math.min(t.maxHp, t.hp + m.regen * dt);
  }
}

/** Removes dead enemies (paying their coins) and spent projectiles, returning them to their pools. */
export function removeDead(w: World): void {
  let n = 0;
  for (const e of w.enemies) {
    if (!e.dead) {
      w.enemies[n++] = e;
      continue;
    }
    w.enemyPool.push(e);
    if (e === w.boss) {
      w.boss = null;
      w.bossKills++;
      // The first kill only starts endless scaling; the run goes on until the Core falls.
      w.won = true;
      w.endlessSince ??= w.round;
    }
    if (e.noDrop) continue;
    w.kills++;
    // The kill pays straight into the account (no orbs to pick up); a Thief's loot comes back doubled.
    const pay = e.xp + e.loot * 2;
    w.coins += pay;
    w.coinsEarned += pay;
    w.tally.gems++;
    registerKill(w);
    const split = ENEMIES[e.type].split;
    if (split && !e.elite) {
      for (let i = 0; i < split.count; i++) {
        const a = w.rng.next() * Math.PI * 2;
        spawnEnemy(w, split.into, e.x + Math.cos(a) * e.radius, e.y + Math.sin(a) * e.radius);
      }
    }
    w.events.push({ kind: 'enemyKilled', x: e.x, y: e.y, type: e.type });
  }
  w.enemies.length = n;

  n = 0;
  for (const p of w.projectiles) {
    if (!p.dead) w.projectiles[n++] = p;
    else w.projectilePool.push(p);
  }
  w.projectiles.length = n;
}

/** Fires an enemy shot (Spitters, the Colossus) that hits the first tile it enters. */
export function fireEnemyShot(
  w: World,
  x: number,
  y: number,
  angle: number,
  speed: number,
  damage: number,
  life: number,
): void {
  const s = w.enemyShotPool.pop() ?? ({} as EnemyShot);
  s.x = s.px = x;
  s.y = s.py = y;
  s.vx = Math.cos(angle) * speed;
  s.vy = Math.sin(angle) * speed;
  s.damage = damage;
  s.life = life;
  s.dead = false;
  w.enemyShots.push(s);
  w.tally.enemyShots++;
}
