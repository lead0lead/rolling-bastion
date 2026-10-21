import { ELITE_BRUTE_COINS } from './economy';
import type { EnemyType } from './enemies';

/** A spawn group: one pick from the wave table spawns `count` enemies together. */
export interface SpawnGroupDef {
  enemy: EnemyType;
  count: [min: number, max: number];
  /** 'cluster': scattered around one ring point. 'line': a row across the approach. */
  formation: 'cluster' | 'line';
}

export type SpawnGroupId =
  'swarmer' | 'swarmerPack' | 'runnerLine' | 'brute' | 'spitterTrio' | 'sapperPair' | 'bomberPack';

export const SPAWN_GROUPS: Record<SpawnGroupId, SpawnGroupDef> = {
  swarmer: { enemy: 'swarmer', count: [1, 1], formation: 'cluster' },
  swarmerPack: { enemy: 'swarmer', count: [3, 5], formation: 'cluster' },
  runnerLine: { enemy: 'runner', count: [8, 12], formation: 'line' },
  brute: { enemy: 'brute', count: [1, 1], formation: 'cluster' },
  spitterTrio: { enemy: 'spitter', count: [2, 3], formation: 'cluster' },
  sapperPair: { enemy: 'sapper', count: [2, 2], formation: 'cluster' },
  bomberPack: { enemy: 'bomber', count: [3, 4], formation: 'line' },
};

/**
 * Wave table (concept.md §4.1). Budget per second is interpolated linearly
 * between entries; group weights come from the latest entry reached.
 * Starting values to tune.
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
  {
    at: 150,
    budgetPerSec: 2.75,
    groups: { swarmer: 1, swarmerPack: 0.5, runnerLine: 0.2, brute: 0.12 },
  },
  {
    at: 240,
    budgetPerSec: 3.5,
    groups: { swarmer: 0.8, swarmerPack: 0.6, runnerLine: 0.25, brute: 0.15, spitterTrio: 0.2 },
  },
  {
    at: 330,
    budgetPerSec: 4.45,
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
    at: 420,
    budgetPerSec: 5.4,
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
    at: 480,
    budgetPerSec: 6,
    groups: {
      swarmer: 0.6,
      swarmerPack: 0.8,
      runnerLine: 0.3,
      brute: 0.2,
      spitterTrio: 0.25,
      sapperPair: 0.25,
      bomberPack: 0.2,
    },
  },
  {
    at: 600,
    budgetPerSec: 9,
    groups: {
      swarmer: 0.6,
      swarmerPack: 1,
      runnerLine: 0.35,
      brute: 0.25,
      spitterTrio: 0.25,
      sapperPair: 0.25,
      bomberPack: 0.25,
    },
  },
  {
    at: 720,
    budgetPerSec: 10,
    groups: {
      swarmer: 0.6,
      swarmerPack: 1,
      runnerLine: 0.35,
      brute: 0.25,
      spitterTrio: 0.25,
      sapperPair: 0.25,
      bomberPack: 0.25,
    },
  },
];

/** One-off spikes: `count` enemies spread evenly around the ring at time `at`. */
export interface WaveSpike {
  at: number;
  enemy: EnemyType;
  count: number;
  /**
   * Spawn as one elite with this HP multiplier that drops the XP of
   * `levels` level-ups (the 7:00 Elite Brute).
   */
  elite?: { hpMultiplier: number; levels: number; coins?: number };
}

export const SPIKES: WaveSpike[] = [
  { at: 150, enemy: 'swarmer', count: 40 },
  {
    at: 420,
    enemy: 'brute',
    count: 1,
    elite: { hpMultiplier: 12, levels: 3, coins: ELITE_BRUTE_COINS },
  },
];
