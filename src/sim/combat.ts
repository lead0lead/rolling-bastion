import { COMBAT } from '../config/balance';
import { ELITE, ENEMIES } from '../config/enemies';
import type { TileType, WeaponDef } from '../config/tiles';
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
    if (weapon.blastRadius) {
      for (let i = 0; i < weapon.shells; i++) {
        const s = i === 0 ? 0 : weapon.shellScatter;
        const tx = target.x + (w.rng.next() * 2 - 1) * s;
        const ty = target.y + (w.rng.next() * 2 - 1) * s;
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

/** Damages an enemy; `source` is the tile type credited in `w.damageBy` (only damage up to its HP counts). */
export function hitEnemy(
  w: World,
  e: Enemy,
  damage: number,
  knockback: number,
  dirX: number,
  dirY: number,
  source?: TileType,
): void {
  if (source) w.damageBy[source] = (w.damageBy[source] ?? 0) + Math.min(damage, Math.max(0, e.hp));
  e.hp -= damage;
  e.hitTime = w.time;
  if (!ENEMIES[e.type].boss) {
    e.kvx += dirX * knockback;
    e.kvy += dirY * knockback;
  }
  if (e.hp <= 0) e.dead = true;
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
    if (e.xp > 0) dropGem(w, e.x, e.y, e.xp);
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
