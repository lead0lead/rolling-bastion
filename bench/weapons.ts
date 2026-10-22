import { SIM } from '../src/config/balance';
import { TILES, type Facing, type TileType } from '../src/config/tiles';
import { cityChanged, createWorld } from '../src/sim/world';
import { step } from '../src/sim/step';

/**
 * Weapon measurement (concept-v2.md §2.12): the Core ringed by 8 tiles of one
 * weapon type (facing away from the Core), invulnerable, driving a slow
 * circle through the normal 12-minute spawns. Prints effective damage per
 * tile per second (overkill not counted) and, for lobbed shells, how many
 * land on nobody. Compare weapons with each other, not with real runs.
 * Run with `npm run sim:weapons`; the weapons are split over the
 * `weapons.shard<N>.sim.ts` files so they run on several cores.
 */

/** Number of weapon shard files; keep in sync with them. */
export const WEAPON_SHARDS = 4;

/** All weapon types, or the ones in SIM_WEAPONS (comma-separated tile types). */
const WEAPONS = (Object.keys(TILES) as TileType[]).filter(
  (t) =>
    TILES[t].family === 'weapon' &&
    (!import.meta.env.SIM_WEAPONS ||
      String(import.meta.env.SIM_WEAPONS)
        .split(',')
        .includes(t)),
);
const MINUTES = [0, 3, 6, 9];
const SEEDS = [1, 2];
/** Tiles are topped up to this every tick, so no single hit can destroy one. */
const INVULNERABLE_HP = 1e9;
/** Steering: a full circle every this many seconds. */
const CIRCLE_SEC = 20;

function ring(type: TileType, seed: number) {
  const w = createWorld(seed);
  const core = w.city.tiles[0];
  if (!core) throw new Error('no core');
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const facing = (dy === -1 ? 0 : dy === 1 ? 2 : dx === 1 ? 1 : 3) as Facing;
      w.city.tiles.push({
        id: w.city.nextTileId++,
        type,
        gx: dx,
        gy: dy,
        hp: TILES[type].maxHp,
        maxHp: TILES[type].maxHp,
        groupId: w.city.nextGroupId++,
        online: false,
        facing,
      });
    }
  }
  cityChanged(w);
  w.godMode = true;
  return w;
}

/** Measures this shard's share of the weapons and prints a block per weapon. */
export function measureWeaponShard(shard: number): void {
  const lines: string[] = [
    `Weapon measurement shard ${shard + 1}/${WEAPON_SHARDS} — 8 tiles around the Core, invulnerable, driving circles`,
  ];
  for (const [i, type] of WEAPONS.entries()) {
    if (i % WEAPON_SHARDS !== shard) continue;
    const perWindow = MINUTES.map(() => ({ dmg: 0, shells: 0, empty: 0, hits: 0 }));
    for (const seed of SEEDS) {
      const w = ring(type, seed);
      let window = 0;
      let before = 0;
      const end = (MINUTES[MINUTES.length - 1] as number) + 3;
      while (w.time < end * 60) {
        const minute = w.time / 60;
        while (window + 1 < MINUTES.length && minute >= (MINUTES[window + 1] as number)) {
          const dmg = w.damageBy[type] ?? 0;
          (perWindow[window] as { dmg: number }).dmg += dmg - before;
          before = dmg;
          window++;
        }
        // Shells landing this tick: count enemies inside the blast at landing.
        for (const p of w.projectiles) {
          if (p.dead || p.blast <= 0 || p.life > SIM.dt) continue;
          const x = p.x + p.vx * p.life;
          const y = p.y + p.vy * p.life;
          let n = 0;
          for (const e of w.enemies) {
            if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= (p.blast + e.radius) ** 2) n++;
          }
          const s = perWindow[window] as { shells: number; empty: number; hits: number };
          s.shells++;
          s.hits += n;
          if (n === 0) s.empty++;
        }
        const a = (w.time / CIRCLE_SEC) * Math.PI * 2;
        step(w, { x: Math.cos(a), y: Math.sin(a) }, SIM.dt);
        for (const t of w.city.tiles) t.hp = INVULNERABLE_HP;
        w.pendingLevelUps = 0;
        w.pendingLand = 0;
        w.over = false;
      }
      (perWindow[window] as { dmg: number }).dmg += (w.damageBy[type] ?? 0) - before;
    }
    lines.push('', TILES[type].name);
    MINUTES.forEach((m, i) => {
      const s = perWindow[i] as { dmg: number; shells: number; empty: number; hits: number };
      const dps = s.dmg / (180 * SEEDS.length) / 8;
      let line = `  ${m}–${m + 3} min: ${dps.toFixed(1)} effective dmg/s per tile`;
      if (s.shells > 0) {
        line += ` · shells ${s.shells}: ${((s.empty / s.shells) * 100).toFixed(0)}% hit nobody, ${(s.hits / s.shells).toFixed(2)} enemies per shell`;
      }
      lines.push(line);
    });
  }
  if (lines.length > 1) console.log(lines.join('\n'));
}
