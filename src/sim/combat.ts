import { COMBAT } from '../config/balance';
import { STATUS, type StatusType } from '../config/statuses';
import { ELITE, ENEMIES } from '../config/enemies';
import { TILES, type TileType, type WeaponDef } from '../config/tiles';
import { destroyTile, facingAngle, type PlacedTile } from './grid';
import { dropGem } from './progression';
import type { WeaponStats } from './synergies';
import {
  cityChanged,
  modsOf,
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
 * Online weapon tiles auto-target the nearest enemy in range and inside their
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
    const target = nearestEnemy(
      w,
      c.x,
      c.y,
      weapon.range,
      weaponArc(t, weapon),
      weapon.minRange ?? 0,
    );
    st.aimTimer = COMBAT.aimInterval;
    st.aim = target ? Math.atan2(target.y - c.y, target.x - c.x) : facingAngle(t.facing);
    if (!ready) continue;
    if (!target) {
      st.cooldown = COMBAT.retargetDelay;
      continue;
    }

    const damage = weapon.damage * mods.damage;
    st.firedAt = w.time;
    if (weapon.coneDeg) {
      sprayCone(w, t.type, weapon, damage, c.x, c.y, st.aim);
    } else if (weapon.blastRadius) {
      const aim = weapon.leadsTarget
        ? leadPoint(target, c.x, c.y, weapon.projectileSpeed, dt)
        : target;
      for (let i = 0; i < weapon.shells; i++) {
        const s = i === 0 ? 0 : weapon.shellScatter;
        const tx = aim.x + (w.rng.next() * 2 - 1) * s;
        const ty = aim.y + (w.rng.next() * 2 - 1) * s;
        fireShell(w, t, weapon, damage, c.x, c.y, tx, ty);
      }
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
 * Spears (concept-v2.md §2.12): each online Spear thrusts along its facing
 * every `interval` (Generators shorten it), with `jabs` jabs `jabGap` apart
 * per cycle, hitting every enemy within the line. `WeaponState.cooldown`
 * counts down to the next jab, `aimTimer` holds the jabs left in the cycle,
 * `firedAt` the last jab (for the drawn shaft).
 */
export function updateThrusts(w: World, dt: number): void {
  for (const t of w.cache.thrusters) {
    const thrust = w.cache.syn.thrusts[t.type];
    if (!thrust) continue;
    const mods = modsOf(w, t);
    const interval = thrust.interval / mods.fireRate;
    const aim = facingAngle(t.facing);
    let st = w.weapons.get(t.id);
    if (!st) {
      st = { cooldown: w.rng.next() * interval, aim, aimTimer: 0 };
      w.weapons.set(t.id, st);
    }
    st.aim = aim;
    st.cooldown -= dt;
    if (st.cooldown > 0) continue;
    st.firedAt = w.time;
    if (st.aimTimer <= 0) st.aimTimer = thrust.jabs;
    st.aimTimer--;
    const gap = Math.min(thrust.jabGap, interval / thrust.jabs);
    st.cooldown += st.aimTimer > 0 ? gap : interval - gap * (thrust.jabs - 1);
    const c = tileCentre(w, t);
    const fx = Math.cos(aim);
    const fy = Math.sin(aim);
    const damage = thrust.damage * mods.damage;
    const midX = c.x + (fx * thrust.reach) / 2;
    const midY = c.y + (fy * thrust.reach) / 2;
    const stab = (e: Enemy) => {
      if (e.dead) return;
      const dx = e.x - c.x;
      const dy = e.y - c.y;
      const along = dx * fx + dy * fy;
      const across = Math.abs(dx * fy - dy * fx);
      if (along < -e.radius || along > thrust.reach + e.radius) return;
      if (across > thrust.width / 2 + e.radius) return;
      hitEnemy(w, e, damage, 0, 0, 0, t.type);
    };
    w.hash.query(midX, midY, thrust.reach / 2 + MAX_ENEMY_RADIUS, (i) => {
      const e = w.enemies[i];
      if (e && e !== w.boss) stab(e);
    });
    if (w.boss) stab(w.boss);
    w.tally.shots[t.type] = (w.tally.shots[t.type] ?? 0) + 1;
  }
}

/** Blades per tile id, for unique blade ids (`tile id × this + blade index`). */
const BLADE_ID_STRIDE = 8;

/**
 * Saw blades (concept-v2.md §2.12): each online Saw's blades circle its
 * centre (Generators speed the spin up) and hit every enemy they pass, each
 * blade at most once per `hitCooldown` per enemy. The angle lives in the
 * tile's `WeaponState.aim` for the renderer. Uses the enemy hash built this tick.
 */
export function updateBlades(w: World, dt: number): void {
  for (const t of w.cache.blades) {
    const blade = w.cache.syn.blades[t.type];
    if (!blade) continue;
    const mods = modsOf(w, t);
    let st = w.weapons.get(t.id);
    if (!st) {
      st = { cooldown: 0, aim: w.rng.next() * Math.PI * 2, aimTimer: 0 };
      w.weapons.set(t.id, st);
    }
    st.aim = (st.aim + Math.PI * 2 * blade.turnsPerSec * mods.fireRate * dt) % (Math.PI * 2);
    const c = tileCentre(w, t);
    const damage = blade.damage * mods.damage;
    let hits = 0;
    for (let b = 0; b < blade.count; b++) {
      const a = st.aim + (b * Math.PI * 2) / blade.count;
      const bx = c.x + Math.cos(a) * blade.orbit;
      const by = c.y + Math.sin(a) * blade.orbit;
      const id = t.id * BLADE_ID_STRIDE + b;
      const strike = (e: Enemy) => {
        if (e.dead) return;
        const r = blade.radius + e.radius;
        if ((e.x - bx) ** 2 + (e.y - by) ** 2 > r * r) return;
        if (e.bladeHitBy === id && w.time - e.bladeHitAt < blade.hitCooldown) return;
        e.bladeHitBy = id;
        e.bladeHitAt = w.time;
        hitEnemy(w, e, damage, 0, 0, 0, t.type);
        hits++;
      };
      w.hash.query(bx, by, blade.radius + MAX_ENEMY_RADIUS, (i) => {
        const e = w.enemies[i];
        if (e && e !== w.boss) strike(e);
      });
      if (w.boss) strike(w.boss);
    }
    if (hits > 0) w.tally.shots[t.type] = (w.tally.shots[t.type] ?? 0) + 1;
  }
}

function newProjectile(w: World, t: PlacedTile, x: number, y: number): Projectile {
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
    if (hit) {
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
  w.events.push({ kind: 'blast', x, y, radius, bomb: false });
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
 * Damages a tile (after its Shield reduction); at 0 HP it is destroyed for
 * good and connectivity is recomputed. Losing the Core ends the run.
 */
export function damageTile(w: World, t: PlacedTile, amount: number): void {
  if (t.type === 'core' && w.godMode) return;
  t.hp -= amount * modsOf(w, t).damageTaken;
  if (t.hp > 0) return;
  const c = tileCentre(w, t);
  destroyTile(w.city, t.id);
  w.weapons.delete(t.id);
  cityChanged(w);
  w.events.push({ kind: 'tileDestroyed', x: c.x, y: c.y, type: t.type });
  if (t.type === 'core') {
    w.coreLostAt = { gx: t.gx, gy: t.gy };
    w.over = true;
  }
}

/** Repair Bays heal their neighbours; Hull L5 regenerates (concept.md §2.6: nothing else heals). */
export function healTiles(w: World, dt: number): void {
  const boost = w.cache.syn.lowHpHealBoost;
  for (const t of w.city.tiles) {
    const m = modsOf(w, t);
    if (m.heal === 0 && m.regen === 0) continue;
    if (t.hp >= t.maxHp) continue;
    const heal = boost && t.hp < t.maxHp * boost.belowFrac ? m.heal * boost.factor : m.heal;
    t.hp = Math.min(t.maxHp, t.hp + (heal + m.regen) * dt);
  }
}

/** Removes dead enemies (dropping gems) and spent projectiles, returning them to their pools. */
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
      w.won = true;
      w.over = true;
    }
    if (e.noDrop) continue;
    w.kills++;
    dropGem(w, e.x, e.y, e.xp);
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
