import { ENEMY_PHYSICS, GRID } from '../config/balance';
import { ENEMIES, type EnemyDef, type RangedDef } from '../config/enemies';
import type { PlacedTile } from './grid';
import { bossContactFactor, bossMove } from './boss';
import { damageTile, fireEnemyShot, MAX_ENEMY_RADIUS, statusSpeed } from './combat';
import { domeCircle, domeUp, hitDome } from './gadgets';
import { spawnRingRadius } from './spawner';
import {
  cellOrigin,
  cityCentre,
  modsOf,
  tileAtCell,
  tileCentre,
  type Enemy,
  type World,
} from './world';

/** What an enemy touched this tick (reused, no allocation). */
interface Contact {
  /** The tile it attacks. */
  tile: PlacedTile | undefined;
  /** A touched bridge tile, if any (Sappers attack it first). */
  bridge: PlacedTile | undefined;
}

const contact: Contact = { tile: undefined, bridge: undefined };

/**
 * Enemy movement, ranged attacks, separation, collision with the city's
 * tiles and contact damage (concept.md §2.6, §4.3). Also rebuilds the enemy
 * spatial hash.
 */
export function updateEnemies(w: World, dt: number): void {
  const decay = Math.exp(-ENEMY_PHYSICS.knockbackDecay * dt);
  const target = { x: 0, y: 0 };

  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
    const def = ENEMIES[e.type];
    if (e === w.boss && bossMove(w, e, dt)) continue;
    if (e.fleeing) {
      flee(w, e, dt);
      continue;
    }
    if (def.disco) discoBeat(w, e, def.disco, dt);
    if (w.over) return;
    let mx = 0;
    let my = 0;
    const d2 =
      def.targetsBridges && w.cache.bridgeCentres.length > 0
        ? nearest(w, e, w.cache.bridgeCentres, target)
        : nearest(w, e, w.cache.centres, target);
    if (d2 < Infinity) {
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.sqrt(d2);
      if (def.ranged) rangedAttack(w, e, def.ranged, target, d, dt);
      const holds = def.ranged && d <= def.ranged.keepDistance;
      if (d > 0 && !holds) {
        const speed = def.speed * statusSpeed(w, e);
        mx = (dx / d) * speed;
        my = (dy / d) * speed;
      }
    }
    e.x += (mx + e.kvx) * dt;
    e.y += (my + e.kvy) * dt;
    e.kvx *= decay;
    e.kvy *= decay;
  }

  rebuildHash(w);
  separate(w);

  const dome = domeUp(w) ? domeCircle(w) : null;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const def = ENEMIES[e.type];
    // The dome stops everything but the Colossus before it reaches a tile.
    if (dome && e !== w.boss && domeUp(w) && domeContact(w, e, def, dome, dt)) continue;
    collideWithCity(w, e, contact);
    if (def.thief) {
      if (contact.tile && !e.fleeing) steal(w, e, def.thief);
      continue;
    }
    const t = (def.targetsBridges && contact.bridge) || contact.tile;
    if (!t) continue;
    if (def.bomb) {
      detonate(w, e, def, t);
      if (w.over) return;
      continue;
    }
    const mods = modsOf(w, t);
    const dps = def.contactDps * e.damageFactor * (e === w.boss ? bossContactFactor(w) : 1);
    damageTile(w, t, dps * mods.contactTaken * dt);
    if (w.over) return;
  }

  updateEnemyShots(w, dt);
}

function rebuildHash(w: World): void {
  w.hash.clear();
  w.enemies.forEach((e, i) => w.hash.insert(i, e.x, e.y));
}

/**
 * World position of the nearest of `points` (relative to the city origin),
 * written into `out`. Returns the squared distance (Infinity if none).
 */
function nearest(
  w: World,
  e: Enemy,
  points: readonly { rx: number; ry: number }[],
  out: { x: number; y: number },
): number {
  let bestD2 = Infinity;
  for (const c of points) {
    const x = w.x + c.rx;
    const y = w.y + c.ry;
    const d2 = (x - e.x) ** 2 + (y - e.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      out.x = x;
      out.y = y;
    }
  }
  return bestD2;
}

/** Spitters shoot at the nearest tile centre when in range. */
function rangedAttack(
  w: World,
  e: Enemy,
  r: RangedDef,
  target: { x: number; y: number },
  d: number,
  dt: number,
): void {
  e.cooldown -= dt;
  if (e.cooldown > 0 || d > r.range || d === 0) return;
  e.cooldown = r.interval;
  const angle = Math.atan2(target.y - e.y, target.x - e.x);
  // A little past the target, in case the city moves.
  fireEnemyShot(
    w,
    e.x,
    e.y,
    angle,
    r.shotSpeed,
    r.damage * e.damageFactor,
    (r.range / r.shotSpeed) * 1.5,
  );
}

/** Enemy shots fly straight and hit the first tile they enter. */
function updateEnemyShots(w: World, dt: number): void {
  const cell = GRID.cellPx;
  const { left, top } = cellOrigin(w);
  const dome = domeUp(w) ? domeCircle(w) : null;
  let n = 0;
  for (const s of w.enemyShots) {
    s.px = s.x;
    s.py = s.y;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) s.dead = true;
    if (!s.dead && dome && domeUp(w) && (s.x - dome.x) ** 2 + (s.y - dome.y) ** 2 <= dome.r ** 2) {
      hitDome(w, s.damage);
      s.dead = true;
    }
    if (!s.dead && !w.over) {
      const t = tileAtCell(w, Math.floor((s.x - left) / cell), Math.floor((s.y - top) / cell));
      if (t) {
        damageTile(w, t, s.damage);
        s.dead = true;
      }
    }
    if (s.dead) w.enemyShotPool.push(s);
    else w.enemyShots[n++] = s;
  }
  w.enemyShots.length = n;
}

/** A Bomber blows up on contact: damages every tile in a square around `t`, then dies. */
function detonate(w: World, e: Enemy, def: EnemyDef, t: PlacedTile): void {
  const bomb = def.bomb;
  if (!bomb) return;
  const hit: PlacedTile[] = [];
  for (let dy = -bomb.radiusCells; dy <= bomb.radiusCells; dy++) {
    for (let dx = -bomb.radiusCells; dx <= bomb.radiusCells; dx++) {
      const o = tileAtCell(w, t.gx + dx, t.gy + dy);
      if (o) hit.push(o);
    }
  }
  const { left, top } = cellOrigin(w);
  w.events.push({
    kind: 'blast',
    x: left + (t.gx + 0.5) * GRID.cellPx,
    y: top + (t.gy + 0.5) * GRID.cellPx,
    radius: (bomb.radiusCells + 0.5) * GRID.cellPx,
    bomb: true,
  });
  e.dead = true;
  e.noDrop = true;
  for (const o of hit) {
    damageTile(w, o, bomb.damage * e.damageFactor);
    if (w.over) return;
  }
}

/** Dome contact: the enemy is held at the dome's edge and wears it down (a bomb goes off against it). True if it touched. */
function domeContact(
  w: World,
  e: Enemy,
  def: EnemyDef,
  dome: { x: number; y: number; r: number },
  dt: number,
): boolean {
  const dx = e.x - dome.x;
  const dy = e.y - dome.y;
  const reach = dome.r + e.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return false;
  const d = Math.sqrt(d2) || 1;
  e.x = dome.x + (dx / d) * reach;
  e.y = dome.y + (dy / d) * reach;
  if (def.bomb) {
    e.dead = true;
    e.noDrop = true;
    w.events.push({ kind: 'blast', x: e.x, y: e.y, radius: 40, bomb: true });
    hitDome(w, def.bomb.damage * e.damageFactor);
  } else {
    hitDome(w, def.contactDps * e.damageFactor * dt);
  }
  return true;
}

/** A Thief grabs coins from the account and runs for it. */
function steal(w: World, e: Enemy, thief: NonNullable<EnemyDef['thief']>): void {
  e.loot = Math.min(w.coins, thief.steal);
  w.coins -= e.loot;
  e.fleeing = true;
  w.events.push({ kind: 'steal', x: e.x, y: e.y, amount: e.loot });
}

/** A fleeing Thief runs straight away from the city and is gone (with the loot) once it leaves the spawn ring. */
function flee(w: World, e: Enemy, dt: number): void {
  const c = cityCentre(w);
  const dx = e.x - c.x;
  const dy = e.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const speed = ENEMIES[e.type].thief?.fleeSpeed ?? 0;
  e.x += ((dx / d) * speed + e.kvx) * dt;
  e.y += ((dy / d) * speed + e.kvy) * dt;
  e.kvx *= Math.exp(-ENEMY_PHYSICS.knockbackDecay * dt);
  e.kvy *= Math.exp(-ENEMY_PHYSICS.knockbackDecay * dt);
  if (d > spawnRingRadius(w)) {
    e.dead = true;
    e.noDrop = true;
  }
}

/**
 * The Disco Robot's beat (concept-v2.md §2.17): every beat it pulses; every
 * other beat it strikes everything within its ring — the dome if there is one, else the tiles.
 * `gen` counts the beats, `cooldown` is the time to the next.
 */
function discoBeat(w: World, e: Enemy, disco: NonNullable<EnemyDef['disco']>, dt: number): void {
  e.cooldown -= dt;
  if (e.cooldown > 0) return;
  e.cooldown += disco.beat;
  e.gen++;
  const strike = e.gen % 2 === 0;
  w.events.push({ kind: 'discoBeat', x: e.x, y: e.y, strike });
  if (!strike) return;
  const damage = disco.damage * e.damageFactor;
  if (domeUp(w)) {
    const dome = domeCircle(w);
    if (Math.hypot(e.x - dome.x, e.y - dome.y) <= dome.r + disco.radius) {
      hitDome(w, damage * 4);
      return;
    }
  }
  const reach = disco.radius + GRID.cellPx / 2;
  const hit = w.city.tiles.filter((t) => {
    const c = tileCentre(w, t);
    return Math.hypot(c.x - e.x, c.y - e.y) <= reach;
  });
  for (const t of hit) {
    damageTile(w, t, damage);
    if (w.over) return;
  }
}

/** Pushes overlapping enemies apart. The boss shoves others out of its way without moving. */
function separate(w: World): void {
  const enemies = w.enemies;
  const strength = ENEMY_PHYSICS.separation;
  const boss = w.boss;
  enemies.forEach((a, i) => {
    if (a === boss) return;
    const ra = a.radius;
    w.hash.query(a.x, a.y, ra + MAX_ENEMY_RADIUS, (j) => {
      if (j <= i) return;
      const b = enemies[j];
      if (!b || b === boss) return;
      const r = ra + b.radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) return;
      const d = Math.sqrt(d2);
      // Exactly stacked enemies get pushed apart along a fixed axis.
      const nx = d > 0 ? dx / d : 1;
      const ny = d > 0 ? dy / d : 0;
      const push = ((r - d) * strength) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    });
  });
  if (!boss) return;
  w.hash.query(boss.x, boss.y, boss.radius + MAX_ENEMY_RADIUS, (j) => {
    const e = enemies[j];
    if (!e || e === boss) return;
    const r = boss.radius + e.radius;
    const dx = e.x - boss.x;
    const dy = e.y - boss.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    e.x = boss.x + (d > 0 ? dx / d : 1) * r;
    e.y = boss.y + (d > 0 ? dy / d : 0) * r;
  });
}

/**
 * Pushes the enemy out of any tile it overlaps (tiles are solid squares) and
 * records what it touches in `out`: the first tile (the one it attacks), a
 * touched bridge.
 */
function collideWithCity(w: World, e: Enemy, out: Contact): void {
  const cell = GRID.cellPx;
  const r = e.radius;
  const reach = r + ENEMY_PHYSICS.contactSlack;
  const { left, top } = cellOrigin(w);
  const gx = Math.floor((e.x - left) / cell);
  const gy = Math.floor((e.y - top) / cell);
  const span = Math.ceil(reach / cell);
  out.tile = undefined;
  out.bridge = undefined;
  for (let dy = -span; dy <= span; dy++) {
    for (let dx = -span; dx <= span; dx++) {
      const t = tileAtCell(w, gx + dx, gy + dy);
      if (!t) continue;
      const minX = left + t.gx * cell;
      const minY = top + t.gy * cell;
      const maxX = minX + cell;
      const maxY = minY + cell;
      const qx = Math.min(Math.max(e.x, minX), maxX);
      const qy = Math.min(Math.max(e.y, minY), maxY);
      const ox = e.x - qx;
      const oy = e.y - qy;
      const d2 = ox * ox + oy * oy;
      if (d2 > reach * reach) continue;
      out.tile ??= t;
      if (!out.bridge && w.cache.bridges.has(t.id)) out.bridge = t;
      if (d2 >= r * r) continue;
      if (d2 > 0) {
        const d = Math.sqrt(d2);
        e.x += (ox / d) * (r - d);
        e.y += (oy / d) * (r - d);
      } else {
        // Centre inside the tile: leave along the shortest axis.
        const exits = [e.x - minX, maxX - e.x, e.y - minY, maxY - e.y];
        const m = Math.min(...exits);
        if (m === exits[0]) e.x = minX - r;
        else if (m === exits[1]) e.x = maxX + r;
        else if (m === exits[2]) e.y = minY - r;
        else e.y = maxY + r;
      }
    }
  }
}
