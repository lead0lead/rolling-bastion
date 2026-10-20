import { ENEMY_PHYSICS, GRID } from '../config/balance';
import { ENEMIES } from '../config/enemies';
import type { PlacedTile } from './grid';
import { damageTile, hitEnemy, MAX_ENEMY_RADIUS } from './combat';
import { gridTopLeft, modsOf, tileAtCell, type Enemy, type World } from './world';

/** What an enemy touched this tick (reused, no allocation). */
interface Contact {
  /** The tile it attacks. */
  tile: PlacedTile | undefined;
  /** Summed damage/s from touching Saws and spiked Plating. */
  thorns: number;
  /** Lowest speed factor among touched tiles. */
  slow: number;
}

const contact: Contact = { tile: undefined, thorns: 0, slow: 1 };

/**
 * Enemy movement, separation, collision with the city's tiles and contact
 * damage (concept.md §2.6). Also rebuilds the enemy spatial hash.
 */
export function updateEnemies(w: World, dt: number): void {
  const decay = Math.exp(-ENEMY_PHYSICS.knockbackDecay * dt);
  const target = { x: 0, y: 0 };

  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
    const def = ENEMIES[e.type];
    let mx = 0;
    let my = 0;
    if (nearestTileCentre(w, e, target)) {
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > 0) {
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
    collideWithCity(w, e, contact);
    const t = contact.tile;
    if (!t) continue;
    const mods = modsOf(w, t);
    const dps = ENEMIES[e.type].contactDps;
    damageTile(w, t, dps * mods.contactTaken * dt);
    if (w.over) return;
    const back = contact.thorns + dps * mods.reflect;
    if (back > 0) hitEnemy(w, e, back * dt, 0, 0, 0);
    e.slow = contact.slow;
  }
}

function rebuildHash(w: World): void {
  w.hash.clear();
  w.enemies.forEach((e, i) => w.hash.insert(i, e.x, e.y));
}

/** World centre of the tile nearest to the enemy, written into `out`. False if no tiles. */
function nearestTileCentre(w: World, e: Enemy, out: { x: number; y: number }): boolean {
  let bestD2 = Infinity;
  for (const c of w.cache.centres) {
    const x = w.x + c.rx;
    const y = w.y + c.ry;
    const d2 = (x - e.x) ** 2 + (y - e.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      out.x = x;
      out.y = y;
    }
  }
  return bestD2 < Infinity;
}

/** Pushes overlapping enemies apart. */
function separate(w: World): void {
  const enemies = w.enemies;
  const strength = ENEMY_PHYSICS.separation;
  enemies.forEach((a, i) => {
    const ra = ENEMIES[a.type].radius;
    w.hash.query(a.x, a.y, ra + MAX_ENEMY_RADIUS, (j) => {
      if (j <= i) return;
      const b = enemies[j];
      if (!b) return;
      const r = ra + ENEMIES[b.type].radius;
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
}

/**
 * Pushes the enemy out of any tile it overlaps (tiles are solid squares) and
 * records what it touches in `out`: the first tile (the one it attacks), plus
 * thorns and slow from all touched tiles.
 */
function collideWithCity(w: World, e: Enemy, out: Contact): void {
  const cell = GRID.cellPx;
  const r = ENEMIES[e.type].radius;
  const reach = r + ENEMY_PHYSICS.contactSlack;
  const { left, top } = gridTopLeft(w);
  const gx = Math.floor((e.x - left) / cell);
  const gy = Math.floor((e.y - top) / cell);
  out.tile = undefined;
  out.thorns = 0;
  out.slow = 1;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
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
      const m = modsOf(w, t);
      out.thorns += m.thorns;
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
