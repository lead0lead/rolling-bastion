import { COMBAT, UPGRADES } from '../config/balance';
import { ENEMIES } from '../config/enemies';
import { TILES, type WeaponDef } from '../config/tiles';
import { destroyTile, facingAngle, type PlacedTile } from './grid';
import { dropGem } from './progression';
import { cityChanged, tileCentre, type Enemy, type Projectile, type World } from './world';

export const MAX_ENEMY_RADIUS = Math.max(...Object.values(ENEMIES).map((e) => e.radius));

/** Damage multiplier from a tile type's upgrade level (level 1 = ×1). */
export function damageMultiplier(w: World, t: PlacedTile): number {
  const level = Math.max(1, w.city.typeLevels[t.type]);
  return 1 + UPGRADES.damagePerLevel * (level - 1);
}

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

/** Nearest live enemy within `range` of (x, y) and inside `arc`, or undefined. */
export function nearestEnemy(
  w: World,
  x: number,
  y: number,
  range: number,
  arc: Arc | null = null,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD2 = range * range;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2 && inArc(arc, dx, dy, d2)) {
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
    const weapon = TILES[t.type].weapon;
    if (!weapon) continue;
    const interval = 1 / weapon.fireRate;
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
    const target = nearestEnemy(w, c.x, c.y, weapon.range, weaponArc(t, weapon));
    st.aimTimer = COMBAT.aimInterval;
    st.aim = target ? Math.atan2(target.y - c.y, target.x - c.x) : facingAngle(t.facing);
    if (!ready) continue;
    if (!target) {
      st.cooldown = COMBAT.retargetDelay;
      continue;
    }

    const spread = ((w.rng.next() * 2 - 1) * weapon.spreadDeg * Math.PI) / 180;
    const angle = st.aim + spread;
    const p = w.projectilePool.pop() ?? ({} as Projectile);
    p.x = p.px = c.x;
    p.y = p.py = c.y;
    p.vx = Math.cos(angle) * weapon.projectileSpeed;
    p.vy = Math.sin(angle) * weapon.projectileSpeed;
    p.damage = weapon.damage * damageMultiplier(w, t);
    p.radius = weapon.projectileRadius;
    p.knockback = weapon.knockback;
    p.life = (weapon.range / weapon.projectileSpeed) * COMBAT.projectileLifeFactor;
    p.source = t.type;
    p.dead = false;
    w.projectiles.push(p);
    st.cooldown = Math.max(st.cooldown + interval, 0);
  }
}

/** Moves projectiles and resolves hits. Uses the enemy hash built this tick. */
export function updateProjectiles(w: World, dt: number): void {
  for (const p of w.projectiles) {
    p.px = p.x;
    p.py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      p.dead = true;
      continue;
    }
    let hit: Enemy | undefined;
    w.hash.query(p.x, p.y, p.radius + MAX_ENEMY_RADIUS, (i) => {
      if (hit) return;
      const e = w.enemies[i];
      if (!e || e.dead) return;
      const r = p.radius + ENEMIES[e.type].radius;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy <= r * r) hit = e;
    });
    if (hit) {
      const speed = Math.hypot(p.vx, p.vy) || 1;
      hitEnemy(w, hit, p.damage, p.knockback, p.vx / speed, p.vy / speed);
      p.dead = true;
    }
  }
}

export function hitEnemy(
  w: World,
  e: Enemy,
  damage: number,
  knockback: number,
  dirX: number,
  dirY: number,
): void {
  e.hp -= damage;
  e.hitTime = w.time;
  e.kvx += dirX * knockback;
  e.kvy += dirY * knockback;
  if (e.hp <= 0) e.dead = true;
}

/**
 * Damages a tile; at 0 HP it is destroyed for good and connectivity is
 * recomputed. Losing the Core ends the run.
 */
export function damageTile(w: World, t: PlacedTile, amount: number): void {
  if (t.type === 'core' && w.godMode) return;
  t.hp -= amount;
  if (t.hp > 0) return;
  const c = tileCentre(w, t);
  destroyTile(w.city, t.id);
  w.weapons.delete(t.id);
  cityChanged(w);
  w.events.push({ kind: 'tileDestroyed', x: c.x, y: c.y, type: t.type });
  if (t.type === 'core') w.over = true;
}

/** Removes dead enemies (dropping gems) and spent projectiles, returning them to their pools. */
export function removeDead(w: World): void {
  let n = 0;
  for (const e of w.enemies) {
    if (!e.dead) {
      w.enemies[n++] = e;
      continue;
    }
    w.kills++;
    dropGem(w, e.x, e.y, ENEMIES[e.type].xp);
    w.events.push({ kind: 'enemyKilled', x: e.x, y: e.y, type: e.type });
    w.enemyPool.push(e);
  }
  w.enemies.length = n;

  n = 0;
  for (const p of w.projectiles) {
    if (!p.dead) w.projectiles[n++] = p;
    else w.projectilePool.push(p);
  }
  w.projectiles.length = n;
}
