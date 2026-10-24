import type { EnemyType } from './enemies';

/** A spawn group: one pick from the wave table spawns `count` enemies together. */
export interface SpawnGroupDef {
  enemy: EnemyType;
  count: [min: number, max: number];
  /** 'cluster': scattered around one ring point. 'line': a row across the approach. */
  formation: 'cluster' | 'line';
}

export type SpawnGroupId =
  'swarmer' | 'swarmerPack' | 'runnerLine' | 'brute' | 'juggernaut' | 'spitterTrio' | 'sapperPair' | 'bomberPack';

export const SPAWN_GROUPS: Record<SpawnGroupId, SpawnGroupDef> = {
  swarmer: { enemy: 'swarmer', count: [1, 1], formation: 'cluster' },
  swarmerPack: { enemy: 'swarmer', count: [3, 5], formation: 'cluster' },
  runnerLine: { enemy: 'runner', count: [8, 12], formation: 'line' },
  brute: { enemy: 'brute', count: [1, 1], formation: 'cluster' },
  juggernaut: { enemy: 'juggernaut', count: [1, 1], formation: 'cluster' },
  spitterTrio: { enemy: 'spitter', count: [2, 3], formation: 'cluster' },
  sapperPair: { enemy: 'sapper', count: [2, 2], formation: 'cluster' },
  bomberPack: { enemy: 'bomber', count: [3, 4], formation: 'line' },
};

/**
 * The round-based run (concept-v2.md §2.16): the city fights one round at a
 * time and shops in between. A round spawns `roundBudget(round)` points of
 * enemies over `spawnSec`, then ends once all of them are dead. Starting
 * values to tune by playing.
 */
export const ROUNDS = {
  /** The Colossus arrives in this round; beating it wins the run. */
  bossRound: 12,
  /** The round's budget is spawned evenly over this many seconds. */
  spawnSec: 28,
  /** Budget of round 1; each round up to the boss round is this much dearer than the last. */
  baseBudget: 20,
  budgetGrowth: 1.18,
  /** In a boss round the regular budget is only this share (the Colossus brings adds of its own). */
  bossRoundShare: 0.4,
} as const;

/** Spawn group weights from `from` on, until a later entry takes over. */
export interface RoundEntry {
  from: number;
  groups: Partial<Record<SpawnGroupId, number>>;
}

export const ROUND_GROUPS: RoundEntry[] = [
  { from: 1, groups: { swarmer: 1 } },
  { from: 2, groups: { swarmer: 1, swarmerPack: 0.4 } },
  { from: 3, groups: { swarmer: 1, swarmerPack: 0.5, runnerLine: 0.2 } },
  { from: 4, groups: { swarmer: 1, swarmerPack: 0.5, runnerLine: 0.2, brute: 0.15 } },
  {
    from: 6,
    groups: { swarmer: 0.8, swarmerPack: 0.6, runnerLine: 0.25, brute: 0.15, spitterTrio: 0.2 },
  },
  {
    from: 7,
    groups: {
      swarmer: 0.8,
      swarmerPack: 0.6,
      runnerLine: 0.25,
      brute: 0.15,
      spitterTrio: 0.2,
      sapperPair: 0.2,
    },
  },
  {
    from: 8,
    groups: {
      swarmer: 0.7,
      swarmerPack: 0.7,
      runnerLine: 0.25,
      brute: 0.18,
      spitterTrio: 0.2,
      sapperPair: 0.2,
      bomberPack: 0.15,
    },
  },
  {
    from: 10,
    groups: {
      swarmer: 0.6,
      swarmerPack: 0.8,
      runnerLine: 0.3,
      brute: 0.2,
      juggernaut: 0.06,
      spitterTrio: 0.25,
      sapperPair: 0.25,
      bomberPack: 0.2,
    },
  },
  {
    from: 12,
    groups: {
      swarmer: 0.6,
      swarmerPack: 1,
      runnerLine: 0.35,
      brute: 0.25,
      juggernaut: 0.1,
      spitterTrio: 0.25,
      sapperPair: 0.25,
      bomberPack: 0.25,
    },
  },
];
