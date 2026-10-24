import { ENDLESS } from '../config/endless';
import { ROUNDS } from '../config/waves';
import type { World } from './world';

/** Round pacing and endless (concept-v2.md §2.11, §2.16): the run goes on after the boss kill, until the Core falls. */

/** The Colossus comes in the boss round, and again every `ENDLESS.bossEvery` rounds after it. */
export function isBossRound(round: number): boolean {
  return round >= ROUNDS.bossRound && (round - ROUNDS.bossRound) % ENDLESS.bossEvery === 0;
}

/** Spawn budget of a round: grows steadily up to the boss round, then linearly (endless). */
export function roundBudget(round: number): number {
  const early = ROUNDS.baseBudget * ROUNDS.budgetGrowth ** (Math.min(round, ROUNDS.bossRound) - 1);
  const late = 1 + ENDLESS.budgetPerRound * Math.max(0, round - ROUNDS.bossRound);
  return early * late * (isBossRound(round) ? ROUNDS.bossRoundShare : 1);
}

/** Enemy HP and damage multiplier for enemies spawned now (1 before endless). */
export function endlessFactor(w: World): number {
  if (w.endlessSince === null) return 1;
  return ENDLESS.growthPerRound ** (w.round - w.endlessSince);
}

/** Rounds until the next Colossus (0 = this round); null before endless. */
export function roundsToBoss(w: World): number | null {
  if (w.endlessSince === null) return null;
  return (ENDLESS.bossEvery - ((w.round - ROUNDS.bossRound) % ENDLESS.bossEvery)) % ENDLESS.bossEvery;
}
