import { ENEMY_PHYSICS, GRID } from '../config/balance';
import { ENEMIES, type EnemyDef, type RangedDef } from '../config/enemies';
import type { PlacedTile } from './grid';
import { bossContactFactor, bossMove } from './boss';
import { damageTile, fireEnemyShot, hitEnemy, MAX_ENEMY_RADIUS } from './combat';
import { gridTopLeft, modsOf, tileAtCell, type Enemy, type World } from './world';

/** What an enemy touched this tick (reused, no allocation). */
interface Contact {
  /** The tile it attacks. */
  tile: PlacedTile | undefined;
  /** A touched bridge tile, if any (Sappers attack it first). */
  bridge: PlacedTile | undefined;
  /** Summed damage/s from touching Saws, and from touching spiked Plating. */
  thorns: number;
  plating: number;
  /** Lowest speed factor among touched tiles. */
  slow: number;
}

const contact: Contact = { tile: undefined, bridge: undefined, thorns: 0, plating: 0, slow: 1 };

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
        mx = (dx / d) * def.speed * e.slow;
        my = (dy / d) * def.speed * e.slow;
      }
    }
    e.slow = 1;
    e.x += (mx + e.kvx) * dt;
    e.y += (my + e.kvy) * dt;
    e.kvx *= decay;
    e.kvy *= decay;
  }

  rebuildHash(w);
  separate(w);

  for (const e of w.enemies) {
    if (e.dead) continue;
    collideWithCity(w, e, contact);
    const def = ENEMIES[e.type];
    const t = (def.targetsBridges && contact.bridge) || contact.tile;
    if (!t) continue;
    if (def.bomb) {
      detonate(w, e, def, t);
      if (w.over) return;
      continue;
    }
    const mods = modsOf(w, t);
    const dps = def.contactDps * (e === w.boss ? bossContactFactor(w) : 1);
    damageTile(w, t, dps * mods.contactTaken * dt);
    if (w.over) return;
    if (contact.thorns > 0) hitEnemy(w, e, contact.thorns * dt, 0, 0, 0, 'saw');
    if (contact.plating > 0) hitEnemy(w, e, contact.plating * dt, 0, 0, 0, 'plating');
    if (mods.reflect > 0) hitEnemy(w, e, dps * mods.reflect * dt, 0, 0, 0, 'shield');
    e.slow = contact.slow;
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
  fireEnemyShot(w, e.x, e.y, angle, r.shotSpeed, r.damage, (r.range / r.shotSpeed) * 1.5);
}

/** Enemy shots fly straight and hit the first tile they enter. */
function updateEnemyShots(w: World, dt: number): void {
  const cell = GRID.cellPx;
  const { left, top } = gridTopLeft(w);
  let n = 0;
  for (const s of w.enemyShots) {
    s.px = s.x;
    s.py = s.y;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) s.dead = true;
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
  const { left, top } = gridTopLeft(w);
  w.events.push({
    kind: 'blast',
    x: left + (t.gx + 0.5) * GRID.cellPx,
    y: top + (t.gy + 0.5) * GRID.cellPx,
    radius: (bomb.radiusCells + 0.5) * GRID.cellPx,
  });
  e.dead = true;
  e.noDrop = true;
  for (const o of hit) {
    damageTile(w, o, bomb.damage);
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
 * touched bridge, plus thorns and slow from all touched tiles.
 */
function collideWithCity(w: World, e: Enemy, out: Contact): void {
  const cell = GRID.cellPx;
  const r = e.radius;
  const reach = r + ENEMY_PHYSICS.contactSlack;
  const { left, top } = gridTopLeft(w);
  const gx = Math.floor((e.x - left) / cell);
  const gy = Math.floor((e.y - top) / cell);
  const span = Math.ceil(reach / cell);
  out.tile = undefined;
  out.bridge = undefined;
  out.thorns = 0;
  out.plating = 0;
  out.slow = 1;
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
      const m = modsOf(w, t);
      if (t.type === 'plating') out.plating += m.thorns;
      else out.thorns += m.thorns;
      out.slow = Math.min(out.slow, m.slow);
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
