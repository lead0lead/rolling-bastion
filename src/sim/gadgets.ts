import { GRID } from '../config/balance';
import { GADGETS } from '../config/gadgets';
import { damageEnemy, explode, MAX_ENEMY_RADIUS, nearestEnemy, newProjectile } from './combat';
import type { PlacedTile } from './grid';
import { levelEffect } from './upgrades';
import { cityCentre, modsOf, tileCentre, type World } from './world';

/** The party update's gadget tiles (concept-v2.md §2.17): drones, holes, dome, robots. */

/** Runs all gadgets for one tick. */
export function updateGadgets(w: World, dt: number): void {
  updateDome(w, dt);
  updateHangars(w, dt);
  updateHoles(w, dt);
}

// ------------------------------------------------------------------ drones

function updateHangars(w: World, dt: number): void {
  const G = GADGETS.hangar;
  const hangars = w.cache.online.hangar ?? [];
  // Drones of a destroyed or offline hangar are lost with it.
  let n = 0;
  for (const d of w.drones) if (hangars.some((t) => t.id === d.home)) w.drones[n++] = d;
  w.drones.length = n;

  for (const t of hangars) {
    const mods = modsOf(w, t);
    const c = tileCentre(w, t);
    const mine = w.drones.filter((d) => d.home === t.id);
    const timer = (w.hangarTimers[t.id] ?? G.launchEvery) - dt * mods.fireRate;
    if (timer <= 0 && mine.length < G.maxDrones) {
      const angle = w.rng.next() * Math.PI * 2;
      const d = { home: t.id, x: c.x, y: c.y, px: c.x, py: c.y, angle, cooldown: 0.3 };
      w.drones.push(d);
      mine.push(d);
      w.events.push({ kind: 'droneLaunch' });
    }
    w.hangarTimers[t.id] = timer <= 0 ? G.launchEvery : timer;

    const target = nearestEnemy(w, c.x, c.y, G.reach);
    mine.forEach((d, i) => {
      d.px = d.x;
      d.py = d.y;
      d.angle += dt * (target ? 2.5 : 1.4);
      // Hover close to the target (spread around it), or circle the hangar.
      const around = d.angle + (i * Math.PI * 2) / G.maxDrones;
      const ring = target ? 40 : G.orbit;
      const cx = target ? target.x : c.x;
      const cy = target ? target.y : c.y;
      const gx = cx + Math.cos(around) * ring;
      const gy = cy + Math.sin(around) * ring;
      const dx = gx - d.x;
      const dy = gy - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      const step = Math.min(dist, Math.max(G.speed, dist * 5) * dt);
      d.x += (dx / dist) * step;
      d.y += (dy / dist) * step;
      d.cooldown -= dt;
      if (!target || d.cooldown > 0 || Math.hypot(target.x - d.x, target.y - d.y) > G.fireDist)
        return;
      d.cooldown = 1 / (G.fireRate * mods.fireRate);
      const p = newProjectile(w, t, d.x, d.y);
      const a = Math.atan2(target.y - d.y, target.x - d.x);
      p.vx = Math.cos(a) * G.bulletSpeed;
      p.vy = Math.sin(a) * G.bulletSpeed;
      p.damage = G.damage * mods.damage;
      p.radius = 3;
      p.knockback = 0;
      p.blast = 0;
      p.pierce = 0;
      p.life = G.fireDist / G.bulletSpeed + 0.3;
      w.tally.shots.hangar = (w.tally.shots.hangar ?? 0) + 1;
    });
  }
}

// ------------------------------------------------------------- black holes

function updateHoles(w: World, dt: number): void {
  let n = 0;
  for (const h of w.holes) {
    h.life -= dt;
    if (h.life <= 0) continue;
    w.holes[n++] = h;
    w.hash.query(h.x, h.y, h.radius + MAX_ENEMY_RADIUS, (i) => {
      const e = w.enemies[i];
      if (!e || e.dead || e === w.boss) return;
      const dx = h.x - e.x;
      const dy = h.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > h.radius) return;
      const step = Math.min(d, h.pull * dt);
      if (d > 0) {
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
      }
      damageEnemy(w, e, h.dps * dt, 'blackhole');
    });
  }
  w.holes.length = n;
}

// -------------------------------------------------------------------- dome

/** The dome's circle: the city's middle and the reach of its outermost tile plus a margin. */
export function domeCircle(w: World): { x: number; y: number; r: number } {
  const c = cityCentre(w);
  return { x: c.x, y: c.y, r: w.cache.reach + GADGETS.dome.margin + GRID.cellPx * 0.71 };
}

/** True while there is a dome that is standing. */
export function domeUp(w: World): boolean {
  return w.dome.max > 0 && w.dome.hp > 0;
}

function updateDome(w: World, dt: number): void {
  const G = GADGETS.dome;
  const d = w.dome;
  let max = 0;
  for (const t of w.cache.online.dome ?? []) max += G.hp * levelEffect(w.city, t.type);
  // A new emitter arrives charged.
  if (max > d.max) d.hp += max - d.max;
  d.max = max;
  if (max === 0) {
    d.hp = 0;
    d.downUntil = 0;
    return;
  }
  d.hp = Math.min(d.hp, max);
  if (d.downUntil > 0) {
    if (w.time >= d.downUntil) {
      d.downUntil = 0;
      d.hp = max;
    }
    return;
  }
  if (w.time - d.hitAt > G.regenAfter) d.hp = Math.min(max, d.hp + max * G.regenPerSec * dt);
}

/** The dome takes a hit; when it breaks it throws a shockwave and stays down for a while. */
export function hitDome(w: World, amount: number): void {
  const d = w.dome;
  d.hp -= amount;
  d.hitAt = w.time;
  if (d.hp > 0) return;
  const G = GADGETS.dome;
  d.hp = 0;
  d.downUntil = w.time + G.rebuild;
  const c = domeCircle(w);
  const radius = c.r * 1.5;
  explode(w, c.x, c.y, radius, G.damage);
  w.hash.query(c.x, c.y, radius + MAX_ENEMY_RADIUS, (i) => {
    const e = w.enemies[i];
    if (!e || e.dead || e === w.boss) return;
    const dx = e.x - c.x;
    const dy = e.y - c.y;
    const dist = Math.hypot(dx, dy) || 1;
    e.kvx += (dx / dist) * G.push;
    e.kvy += (dy / dist) * G.push;
  });
  w.events.push({ kind: 'domeBreak', x: c.x, y: c.y, radius: c.r });
}

// ------------------------------------------------------------------- robots

/** The tile a Repair Robot works on: the most damaged one in the city (lowest HP share), if any is hurt. */
export function robotTarget(w: World): PlacedTile | undefined {
  let best: PlacedTile | undefined;
  let bestFrac = 1;
  for (const t of w.city.tiles) {
    const frac = t.hp / t.maxHp;
    if (frac < bestFrac) {
      bestFrac = frac;
      best = t;
    }
  }
  return best;
}

/** Repair Robots patch the most damaged tile, each its own. */
export function healByRobots(w: World, dt: number): void {
  const bots = w.cache.online.robot;
  if (!bots) return;
  for (const bot of bots) {
    const t = robotTarget(w);
    if (t) t.hp = Math.min(t.maxHp, t.hp + GADGETS.robot.hps * levelEffect(w.city, bot.type) * dt);
  }
}
