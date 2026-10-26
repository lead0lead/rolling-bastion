import { ECONOMY } from '../src/config/economy';
import { ENEMIES, type EnemyType } from '../src/config/enemies';
import { TILES, type TileType } from '../src/config/tiles';
import { ROUNDS } from '../src/config/waves';
import { createRng } from '../src/sim/rng';
import { ARCHETYPES, play, type Result } from './balance';

/**
 * Balance fuzzer: a hill-climber over the numbers that shape cost, damage and
 * the enemy economy. Each step nudges a few knobs (tile cost, weapon damage and
 * fire rate, enemy HP / coin drop / contact damage / speed, round budget),
 * replays every bot build from `balance.ts`, and keeps the change if the
 * flow loss drops. Prints the best knob set found per shard; apply it to the
 * config by hand, then check with `npm run sim:balance` on other seeds.
 * Run with `npm run sim:fuzz`; shards are separate files (own RNG, own cores).
 * Env: FUZZ_MINUTES (default 5), FUZZ_SEEDS (default 1,2), FUZZ_ARCH (as SIM_ARCH).
 *
 * Flow loss (lower is better; all terms 0..~1):
 *  - win rate near TARGET_WIN (not a walkover, not a wall);
 *  - won runs should dip the Core to about TARGET_DIP of its HP (tension);
 *  - lost runs should die late (early deaths are the frustrating ones);
 *  - builds should be comparable: spread of progress across builds (weapon parity);
 *  - coins should be spent: about TARGET_IDLE left unspent per shop visit.
 * The bot is crude, so these are heuristics: treat the output as a direction.
 */

/** Number of fuzz shard files; keep in sync with them. */
export const FUZZ_SHARDS = 4;

const TARGET_WIN = 0.2;
const TARGET_DIP = 0.4;
const TARGET_IDLE = 0.2;
/** A knob never leaves this band around its original value, so the fuzzer can't wreck the game's identity. */
const MIN_FACTOR = 0.4;
const MAX_FACTOR = 2.5;
/** Std-dev of the log-factor of one nudge. */
const STEP = 0.2;

interface Knob {
  label: string;
  obj: Record<string, number>;
  key: string;
  base: number;
  integer: boolean;
}

function knobs(): Knob[] {
  const out: Knob[] = [];
  const add = (label: string, obj: object, key: string, integer = false) => {
    const o = obj as Record<string, number>;
    out.push({ label, obj: o, key, base: o[key] as number, integer });
  };
  for (const t of Object.keys(TILES) as TileType[]) {
    if (t === 'core') continue;
    add(`cost.${t}`, ECONOMY.cost, t, true);
    const weapon = TILES[t].weapon;
    if (weapon) {
      add(`${t}.damage`, weapon, 'damage');
      add(`${t}.fireRate`, weapon, 'fireRate');
    }
  }
  for (const e of Object.keys(ENEMIES) as EnemyType[]) {
    const def = ENEMIES[e];
    if (def.boss) continue;
    add(`${e}.maxHp`, def, 'maxHp');
    add(`${e}.xp`, def, 'xp', true);
    add(`${e}.contactDps`, def, 'contactDps');
    add(`${e}.speed`, def, 'speed');
  }
  add('startCoins', ECONOMY, 'startCoins', true);
  add('baseBudget', ROUNDS, 'baseBudget');
  add('budgetGrowth', ROUNDS, 'budgetGrowth');
  return out.filter((k) => k.base > 0);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sq = (x: number) => x * x;

interface Score {
  loss: number;
  win: number;
  dip: number;
  death: number;
  spread: number;
  idle: number;
}

function score(runs: { name: string; r: Result }[]): Score {
  const won = runs.filter((x) => x.r.won);
  const lost = runs.filter((x) => !x.r.won);
  const win = won.length / runs.length;
  const dip = won.length ? mean(won.map((x) => Math.abs(x.r.coreMin - TARGET_DIP))) : TARGET_DIP;
  const progress = (r: Result) => (r.won ? 1 : Math.min(1, (r.round - 1) / ROUNDS.bossRound));
  // Early deaths hurt most: 0 = died at the boss, 1 = died in round 1.
  const death = lost.length ? mean(lost.map((x) => 1 - progress(x.r))) : 0;
  const byBuild = new Map<string, number[]>();
  for (const x of runs) byBuild.set(x.name, [...(byBuild.get(x.name) ?? []), progress(x.r)]);
  const means = [...byBuild.values()].map(mean);
  const mu = mean(means);
  const spread = Math.sqrt(mean(means.map((m) => sq(m - mu))));
  const idle = mean(runs.map((x) => x.r.idle));
  const loss = 4 * sq(win - TARGET_WIN) + 2 * dip + death + 3 * spread + 2 * sq(idle - TARGET_IDLE);
  return { loss, win, dip, death, spread, idle };
}

const fmt = (s: Score) =>
  `loss ${s.loss.toFixed(3)} · win ${(s.win * 100).toFixed(0)}% · dip err ${s.dip.toFixed(2)} · early-death ${s.death.toFixed(2)} · build spread ${s.spread.toFixed(2)} · idle coins ${(s.idle * 100).toFixed(0)}%`;

export function runFuzzShard(shard: number): void {
  const seeds = String(import.meta.env.FUZZ_SEEDS ?? '1,2')
    .split(',')
    .map(Number);
  const only = import.meta.env.FUZZ_ARCH ? String(import.meta.env.FUZZ_ARCH).split(',') : null;
  const archs = ARCHETYPES.filter(
    (a) => !only || only.some((n) => a.name.toLowerCase().includes(n.toLowerCase())),
  );
  const deadline = Date.now() + Number(import.meta.env.FUZZ_MINUTES ?? 5) * 60_000;
  const rng = createRng(1000 + shard);
  const all = knobs();
  // ponytail: fixed seeds make a candidate comparable with the best so far but can overfit them;
  // re-check any result with other seeds in `npm run sim:balance` (SIM_SEEDS).
  const evaluate = () =>
    score(
      archs.flatMap((arch) => seeds.map((seed) => ({ name: arch.name, r: play(arch, seed, 0) }))),
    );

  const set = (k: Knob, factor: number) => {
    const v = k.base * factor;
    k.obj[k.key] = k.integer ? Math.max(1, Math.round(v)) : v;
  };
  const factors = new Map<Knob, number>(all.map((k) => [k, 1]));
  let best = evaluate();
  const baseline = best;
  let tried = 0;
  while (Date.now() < deadline) {
    tried++;
    const changed = new Map<Knob, number>();
    for (let n = rng.int(1, 3); n > 0; n--) {
      const k = all[rng.int(0, all.length - 1)] as Knob;
      // Box-Muller step in log space, clamped to the allowed band.
      const g = Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
      const f = Math.min(
        MAX_FACTOR,
        Math.max(MIN_FACTOR, (factors.get(k) as number) * Math.exp(STEP * g)),
      );
      changed.set(k, f);
    }
    const before = new Map([...changed.keys()].map((k) => [k, factors.get(k) as number]));
    for (const [k, f] of changed) set(k, f);
    const s = evaluate();
    if (s.loss < best.loss) {
      best = s;
      for (const [k, f] of changed) factors.set(k, f);
    } else {
      for (const [k, f] of before) set(k, f);
    }
  }

  const dist = (k: Knob) => Math.abs(Math.log((k.obj[k.key] as number) / k.base));
  const rows = all
    .filter((k) => k.obj[k.key] !== k.base)
    .sort((a, b) => dist(b) - dist(a))
    .map((k) => {
      const v = k.obj[k.key] as number;
      return `  ${k.label}: ${+k.base.toFixed(3)} → ${+v.toFixed(3)} (${v >= k.base ? '+' : ''}${Math.round((v / k.base - 1) * 100)}%)`;
    });
  console.log(
    [
      `Fuzz shard ${shard + 1}/${FUZZ_SHARDS} — ${tried} candidates, ${archs.length} builds × ${seeds.length} seeds`,
      `baseline: ${fmt(baseline)}`,
      `best:     ${fmt(best)}`,
      ...rows,
    ].join('\n'),
  );
}
