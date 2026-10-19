import type { EnemyType } from './enemies';

/** A spawn group: one pick from the wave table spawns `count` enemies together. */
export interface SpawnGroupDef {
  enemy: EnemyType;
  count: [min: number, max: number];
  /** 'cluster': scattered around one ring point. 'line': a row across the approach. */
  formation: 'cluster' | 'line';
}

export type SpawnGroupId = 'swarmer' | 'swarmerPack' | 'runnerLine';

export const SPAWN_GROUPS: Record<SpawnGroupId, SpawnGroupDef> = {
  swarmer: { enemy: 'swarmer', count: [1, 1], formation: 'cluster' },
  swarmerPack: { enemy: 'swarmer', count: [3, 5], formation: 'cluster' },
  runnerLine: { enemy: 'runner', count: [8, 12], formation: 'line' },
};

/**
 * Wave table (concept.md §4.1). Budget per second is interpolated linearly
 * between entries; group weights come from the latest entry reached.
 * Phase 2 covers Swarmers and Runners only. Starting values to tune.
 */
export interface WaveEntry {
  at: number;
  budgetPerSec: number;
  groups: Partial<Record<SpawnGroupId, number>>;
}

export const WAVES: WaveEntry[] = [
  { at: 0, budgetPerSec: 0.9, groups: { swarmer: 1 } },
  { at: 45, budgetPerSec: 1.4, groups: { swarmer: 1, swarmerPack: 0.3 } },
  { at: 60, budgetPerSec: 2.0, groups: { swarmer: 1, swarmerPack: 0.4, runnerLine: 0.15 } },
  { at: 240, budgetPerSec: 3.5, groups: { swarmer: 0.8, swarmerPack: 0.6, runnerLine: 0.25 } },
  { at: 480, budgetPerSec: 6, groups: { swarmer: 0.6, swarmerPack: 0.8, runnerLine: 0.3 } },
  { at: 600, budgetPerSec: 9, groups: { swarmer: 0.6, swarmerPack: 1, runnerLine: 0.35 } },
  { at: 720, budgetPerSec: 10, groups: { swarmer: 0.6, swarmerPack: 1, runnerLine: 0.35 } },
];

/** One-off spikes: `count` enemies spread evenly around the ring at time `at`. */
export interface WaveSpike {
  at: number;
  enemy: EnemyType;
  count: number;
}

export const SPIKES: WaveSpike[] = [{ at: 150, enemy: 'swarmer', count: 40 }];
