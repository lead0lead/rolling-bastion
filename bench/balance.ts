import { SIM, UPGRADES } from '../src/config/balance';
import { BOSS } from '../src/config/enemies';
import { TILES, type Facing, type TileType } from '../src/config/tiles';
import { LAND_SHAPES } from '../src/config/land';
import { cellFromId, cellId, coreTile, type CityState } from '../src/sim/grid';
import { startEndless } from '../src/sim/endless';
import { addLand, landCells, landProblems, rollLand } from '../src/sim/land';
import { addXp, applyBuildResult } from '../src/sim/progression';
import { step } from '../src/sim/step';
import { canUpgrade, typeLevel } from '../src/sim/upgrades';
import { cityCentre, createWorld, type World } from '../src/sim/world';

/**
 * Balance check (concept.md §11 Phase 4): plays the same seeds with a few
 * archetype builds and a fixed steering script, and prints how each fared.
 * Run with `npm run sim:balance` (seeds: SIM_SEEDS=1,2,3); the runs are split
 * over the `balance.shard<N>.sim.ts` files so they use several cores. Not
 * part of `npm test`.
 *
 * A build is a rule giving the tile for each cell of an n×n grid. At each
 * level-up the bot repairs the Core when it is low, takes an upgrade every
 * few levels (or when the layout is complete), and otherwise grows the city
 * by a piece's worth of tiles: weapons and support first, Hull/Plating
 * along the shortest path to them. On grid expansion it rearranges the
 * city into the bigger layout. It collects all XP automatically and only
 * steers to dodge, so builds are compared on fighting strength. The bot is
 * crude; compare builds with each other, not with a human player.
 */

/** Where a cell sits: ring from the grid edge (0 = outer ring), on the Core's row/column, a grid corner. */
interface Cell {
  edge: number;
  cross: boolean;
  corner: boolean;
  dx: number;
  dy: number;
}

interface Archetype {
  name: string;
  rule: (c: Cell) => TileType | null;
  /** Types to level up, in turn. */
  upgrades: TileType[];
  /** Short-range build: drives into the boss instead of fleeing it (as a player would). */
  melee?: boolean;
}

const ARCHETYPES: Archetype[] = [
  {
    name: 'Gatling batteries',
    rule: (c) =>
      c.edge === 0 ? (c.corner ? null : 'gatling') : c.edge === 1 && c.cross ? 'generator' : 'hull',
    upgrades: ['gatling', 'generator'],
  },
  {
    name: 'Cannon lines',
    rule: (c) =>
      c.edge === 0
        ? c.corner
          ? 'plating'
          : 'cannon'
        : c.edge === 1 && c.cross
          ? 'shield'
          : 'hull',
    upgrades: ['cannon', 'shield'],
  },
  {
    name: 'Mortar core',
    rule: (c) =>
      c.edge === 0 ? 'plating' : c.edge === 1 ? (c.cross ? 'shield' : 'hull') : 'mortar',
    upgrades: ['mortar', 'plating'],
  },
  {
    name: 'Saw wall',
    rule: (c) =>
      c.edge === 0 ? (c.corner ? 'plating' : 'saw') : c.edge === 1 && c.cross ? 'repair' : 'hull',
    upgrades: ['saw', 'repair'],
    melee: true,
  },
  {
    name: 'Saw grinder',
    rule: (c) => (c.edge === 0 ? 'plating' : c.edge === 1 ? 'saw' : c.cross ? 'repair' : 'hull'),
    upgrades: ['saw', 'plating'],
    melee: true,
  },
  {
    name: 'Crossbow lines',
    rule: (c) =>
      c.edge === 0
        ? c.corner
          ? 'plating'
          : 'crossbow'
        : c.edge === 1 && c.cross
          ? 'generator'
          : 'hull',
    upgrades: ['crossbow', 'generator'],
  },
  {
    name: 'Flame ring',
    rule: (c) =>
      c.edge === 0
        ? c.corner
          ? 'plating'
          : 'flamethrower'
        : c.edge === 1 && c.cross
          ? 'repair'
          : 'hull',
    upgrades: ['flamethrower', 'repair'],
    melee: true,
  },
  {
    name: 'Spear wall',
    rule: (c) =>
      c.edge === 0 ? 'plating' : c.edge === 1 ? 'spear' : c.cross ? 'generator' : 'hull',
    upgrades: ['spear', 'generator'],
    melee: true,
  },
  {
    name: 'Combo mix',
    rule: (c) => {
      if (c.edge === 0) {
        if (c.corner) return 'cannon';
        return (c.dx + c.dy) % 2 === 0 ? 'flamethrower' : 'gatling';
      }
      if (c.edge === 1) return c.cross ? 'generator' : 'crossbow';
      return 'mortar';
    },
    upgrades: ['gatling', 'flamethrower', 'crossbow', 'mortar'],
  },
  {
    name: 'Mixed cluster',
    rule: (c) => {
      if (c.edge === 0) {
        if (c.corner) return 'plating';
        return Math.abs(c.dy) >= Math.abs(c.dx) ? 'gatling' : 'cannon';
      }
      if (c.edge === 1)
        return c.cross ? 'generator' : Math.abs(c.dx) === Math.abs(c.dy) ? 'shield' : 'hull';
      return (c.dx + c.dy) % 2 === 0 ? 'repair' : 'mortar';
    },
    upgrades: ['gatling', 'generator', 'cannon'],
  },
];

/** Tiles added per level-up (about one piece). */
const TILES_PER_LEVEL = 3;
/** Every this many levels the bot upgrades instead of growing. */
const UPGRADE_EVERY = 4;
/** The bot takes Repair Core below this share of Core HP. */
const REPAIR_BELOW = 0.4;
/** Steering: enemies within this radius (px) push the city away; the boss counts this much more. */
const FLEE_RADIUS = 260;
const BOSS_FEAR = 20;
const WANDER_WEIGHT = 0.35;
/** Stop a run here (s) if neither side has won: boss enrage + 2 min. */
const TIME_LIMIT = BOSS.enrageAt + 120;

type Layout = Map<string, { type: TileType; facing: Facing }>;

const key = (x: number, y: number) => `${x},${y}`;
/** Rings counted inward from the board edge stop here (deeper cells all count as interior). */
const BOARD_DEPTH_LIMIT = 4;
/** Land centres are tried this many cells around the board. */
const LAND_REACH = 4;

/**
 * The archetype's full layout for the city's board (concept-v2.md §2.1).
 * `edge` counts rings in from the board's edge; weapons face away from the Core.
 */
function layoutFor(arch: Archetype, city: CityState): Layout {
  const core = coreTile(city);
  const cx = core?.gx ?? 0;
  const cy = core?.gy ?? 0;
  const on = (x: number, y: number) => city.board.has(cellId(x, y));
  const out: Layout = new Map();
  for (const id of city.board) {
    const { x, y } = cellFromId(id);
    if (x === cx && y === cy) continue;
    let edge = 0;
    while (edge < BOARD_DEPTH_LIMIT) {
      const r = edge + 1;
      let inside = true;
      for (let d = -r; d <= r && inside; d++) {
        inside = on(x + d, y - r) && on(x + d, y + r) && on(x - r, y + d) && on(x + r, y + d);
      }
      if (!inside) break;
      edge++;
    }
    const corner = (!on(x - 1, y) || !on(x + 1, y)) && (!on(x, y - 1) || !on(x, y + 1));
    const dx = x - cx;
    const dy = y - cy;
    const type = arch.rule({ edge, cross: dx === 0 || dy === 0, corner, dx, dy });
    if (!type) continue;
    const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    out.set(key(x, y), { type, facing });
  }
  return out;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Adds up to `count` tiles from the layout, each orthogonally connected to the city. */
function grow(w: World, arch: Archetype, count: number): number {
  const city = w.city;
  const layout = layoutFor(arch, city);
  let added = 0;
  for (let i = 0; i < count; i++) {
    const taken = new Set(city.tiles.map((t) => key(t.gx, t.gy)));
    const remaining = [...layout.keys()].filter((k) => !taken.has(k));
    if (remaining.length === 0) break;
    // Distance (through unbuilt layout cells) from each cell to the nearest unbuilt weapon/support cell.
    const dist = new Map<string, number>();
    const queue: string[] = [];
    for (const k of remaining) {
      const fam = TILES[(layout.get(k) as { type: TileType }).type].family;
      if (fam === 'weapon' || fam === 'support') {
        dist.set(k, 0);
        queue.push(k);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q] as string;
      const [x, y] = k.split(',').map(Number) as [number, number];
      for (const [dx, dy] of NEIGHBOURS) {
        const nk = key(x + dx, y + dy);
        if (dist.has(nk) || !layout.has(nk) || taken.has(nk)) continue;
        dist.set(nk, (dist.get(k) ?? 0) + 1);
        queue.push(nk);
      }
    }
    const core = coreTile(city);
    let best: string | undefined;
    let bestScore = Infinity;
    for (const k of remaining) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (!NEIGHBOURS.some(([dx, dy]) => taken.has(key(x + dx, y + dy)))) continue;
      const toCore = core ? Math.abs(x - core.gx) + Math.abs(y - core.gy) : 0;
      const score = (dist.get(k) ?? 99) * 100 + toCore;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (!best) break;
    const [gx, gy] = best.split(',').map(Number) as [number, number];
    const cell = layout.get(best) as { type: TileType; facing: Facing };
    city.tiles.push({
      id: city.nextTileId++,
      type: cell.type,
      gx,
      gy,
      hp: TILES[cell.type].maxHp,
      maxHp: TILES[cell.type].maxHp,
      groupId: city.nextGroupId++,
      online: true,
      facing: cell.facing,
    });
    added++;
  }
  return added;
}

/**
 * Land (concept-v2.md §2.1): of the offered shapes, rotations and spots
 * touching the board, take the one sharing the most edges with it (a
 * compact board), then the one closest to the Core. Simple on purpose;
 * Phase 4 gives the bots real land plans.
 */
function placeLand(w: World): void {
  const city = w.city;
  const cells = [...city.board].map(cellFromId);
  const minX = Math.min(...cells.map((c) => c.x)) - LAND_REACH;
  const maxX = Math.max(...cells.map((c) => c.x)) + LAND_REACH;
  const minY = Math.min(...cells.map((c) => c.y)) - LAND_REACH;
  const maxY = Math.max(...cells.map((c) => c.y)) + LAND_REACH;
  let best: { cells: { x: number; y: number }[]; score: number } | null = null;
  for (const shape of rollLand(w.rng, LAND_SHAPES)) {
    for (let turns = 0; turns < 4; turns++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const land = landCells(shape, turns, x, y);
          if (landProblems(city, land).size > 0) continue;
          let shared = 0;
          let dist = 0;
          for (const c of land) {
            dist += Math.abs(c.x) + Math.abs(c.y);
            for (const [dx, dy] of NEIGHBOURS) {
              if (city.board.has(cellId(c.x + dx, c.y + dy))) shared++;
            }
          }
          const score = shared * 1000 - dist;
          if (!best || score > best.score) best = { cells: land, score };
        }
      }
    }
  }
  if (best) addLand(city, best.cells);
}

function levelUp(w: World, arch: Archetype): void {
  // Offline tiles must be reconnected or scrapped; the bot scraps them (and may rebuild them later).
  w.city.tiles = w.city.tiles.filter((t) => t.online);
  const core = coreTile(w.city);
  if (core && core.hp < core.maxHp * REPAIR_BELOW) {
    applyBuildResult(w, { repair: true, scrapped: 0 });
    return;
  }
  const upgrade = arch.upgrades
    .filter((t) => canUpgrade(w.city, t))
    .sort((a, b) => typeLevel(w.city, a) - typeLevel(w.city, b))[0];
  const grown = w.level % UPGRADE_EVERY === 0 && upgrade ? 0 : grow(w, arch, TILES_PER_LEVEL);
  applyBuildResult(w, { repair: false, scrapped: 0, upgrade: grown === 0 ? upgrade : null });
}

/**
 * Steering: away from enemies that get close (the boss counts more), otherwise
 * a slow wander. Melee builds drive straight at the boss once it is there.
 */
function steer(w: World, arch: Archetype): { x: number; y: number } {
  const c = cityCentre(w);
  if (arch.melee && w.boss) {
    const dx = w.boss.x - c.x;
    const dy = w.boss.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }
  let fx = 0;
  let fy = 0;
  for (const e of w.enemies) {
    const dx = c.x - e.x;
    const dy = c.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > FLEE_RADIUS * FLEE_RADIUS || d2 === 0) continue;
    const weight = (e === w.boss ? BOSS_FEAR : 1) / d2;
    fx += dx * weight;
    fy += dy * weight;
  }
  const len = Math.hypot(fx, fy);
  const wx = Math.sin(w.time / 7) * WANDER_WEIGHT;
  const wy = Math.cos(w.time / 11) * WANDER_WEIGHT;
  return len > 0 ? { x: fx / len + wx, y: fy / len + wy } : { x: wx, y: wy };
}

/**
 * The bot collects every gem at once, scaled by `share` (SIM_XP, default 1 =
 * a perfect collector), so XP depends on kills, not on how well the crude
 * steering drives over gems. This compares build strength, not driving.
 */
function collectAll(w: World, share: number): void {
  const xp = w.gems.reduce((s, g) => s + g.value, 0) * share;
  w.gems.length = 0;
  if (xp > 0) addXp(w, xp);
}

interface Result {
  seed: number;
  time: number;
  won: boolean;
  bossHp: number | null;
  level: number;
  kills: number;
  tiles: number;
  damage: Partial<Record<TileType, number>>;
  /** Seconds from the boss's first damage to the end of the run, and the highest boss phase seen. */
  bossFight: number | null;
  bossPhase: number;
  /** Endless (SIM_ENDLESS): when the first boss fell, and Colossi defeated in all. */
  wonAt: number | null;
  bossKills: number;
  coreLost: boolean;
}

function play(arch: Archetype, seed: number, xpShare: number, endlessSec: number): Result {
  const w = createWorld(seed);
  let bossHitAt: number | null = null;
  let bossPhase = 0;
  let wonAt: number | null = null;
  while (!w.over && w.time < (wonAt === null ? TIME_LIMIT : wonAt + endlessSec)) {
    step(w, steer(w, arch), SIM.dt);
    if (w.over && w.won && wonAt === null && endlessSec > 0) {
      wonAt = w.time;
      startEndless(w);
    }
    if (w.boss || w.won) bossPhase = Math.max(bossPhase, w.bossState.phase);
    if (bossHitAt === null && (w.won || (w.boss && w.boss.hp < w.boss.maxHp))) bossHitAt = w.time;
    collectAll(w, xpShare);
    w.events.length = 0;
    while (w.pendingLevelUps > 0 && !w.over) {
      if (w.pendingLand > 0) {
        w.pendingLand--;
        placeLand(w);
      }
      w.pendingLevelUps--;
      levelUp(w, arch);
    }
  }
  return {
    seed,
    time: w.time,
    won: w.won,
    bossHp: w.boss ? w.boss.hp / w.boss.maxHp : null,
    level: w.level,
    kills: w.kills,
    tiles: w.city.tiles.length,
    damage: w.damageBy,
    bossFight: bossHitAt === null ? null : (wonAt ?? w.time) - bossHitAt,
    bossPhase,
    wonAt,
    bossKills: w.bossKills,
    coreLost: w.coreLostAt !== null,
  };
}

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Number of balance shard files (`bench/balance.shard<N>.sim.ts`); keep in sync with them. */
export const BALANCE_SHARDS = 6;

function report(arch: Archetype, r: Result): string {
  const fight =
    r.bossFight === null ? '' : ` (boss fight ${r.bossFight.toFixed(1)} s, phase ${r.bossPhase})`;
  const boss = r.bossHp === null ? '' : ` vs boss (${Math.round(r.bossHp * 100)}% HP left)`;
  const endless =
    r.wonAt === null
      ? ''
      : ` · endless: ${r.coreLost ? 'died' : 'alive'} at ${clock(r.time)} (+${clock(r.time - r.wonAt)}), Colossus ×${r.bossKills}`;
  const outcome = r.won
    ? `WON at ${clock(r.wonAt ?? r.time)}${fight}${endless}`
    : r.time >= TIME_LIMIT
      ? `alive at ${clock(r.time)}, time limit${boss}`
      : `died at ${clock(r.time)}${boss}`;
  const total = Object.values(r.damage).reduce((a: number, b) => a + (b ?? 0), 0) || 1;
  const shares = Object.entries(r.damage)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([t, d]) => `${t} ${Math.round(((d ?? 0) / total) * 100)}%`)
    .join(', ');
  return `${arch.name} · seed ${r.seed}: ${outcome} · level ${r.level} · kills ${r.kills} · ${r.tiles} tiles · damage: ${shares}`;
}

/**
 * Plays this shard's share of the (build, seed) runs and prints one line per
 * run. Each shard is its own test file, so Vitest runs them in parallel on
 * separate cores. SIM_SEEDS: seeds (default 1,2); SIM_XP: XP share; SIM_ARCH:
 * comma-separated parts of build names to run (default: all); SIM_ENDLESS:
 * minutes to keep going after the boss kill (default 0: the run ends there).
 */
export function runBalanceShard(shard: number): void {
  const seeds = String(import.meta.env.SIM_SEEDS ?? '1,2')
    .split(',')
    .map(Number);
  const xpShare = Number(import.meta.env.SIM_XP ?? 1);
  const only = import.meta.env.SIM_ARCH ? String(import.meta.env.SIM_ARCH).split(',') : null;
  const endlessSec = Number(import.meta.env.SIM_ENDLESS ?? 0) * 60;
  const jobs = ARCHETYPES.filter(
    (a) => !only || only.some((n) => a.name.toLowerCase().includes(n.toLowerCase())),
  ).flatMap((arch) => seeds.map((seed) => ({ arch, seed })));
  const lines = [
    `Balance sim shard ${shard + 1}/${BALANCE_SHARDS} — XP share ${xpShare}; bot: ${TILES_PER_LEVEL} tiles/level, upgrade every ${UPGRADE_EVERY} levels (max L${UPGRADES.maxLevel})`,
  ];
  jobs.forEach((job, i) => {
    if (i % BALANCE_SHARDS !== shard) return;
    lines.push(report(job.arch, play(job.arch, job.seed, xpShare, endlessSec)));
  });
  if (lines.length > 1) console.log(lines.join('\n'));
}
