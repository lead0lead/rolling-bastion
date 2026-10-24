import { describe, expect, it } from 'vitest';
import { removeDead } from '../src/sim/combat';
import { roundBudget } from '../src/sim/endless';
import { startRound } from '../src/sim/spawner';
import { step } from '../src/sim/step';
import { createWorld, type World } from '../src/sim/world';

const DT = 1 / 60;
const STILL = { x: 0, y: 0 };

/** Steps until the round is over (or `maxSec` passes), killing every enemy at once. */
function playRound(w: World, maxSec = 120): void {
  for (let i = 0; i < maxSec / DT && !w.roundClear && !w.over; i++) {
    step(w, STILL, DT);
    for (const e of w.enemies) e.dead = true;
    removeDead(w);
  }
}

describe('rounds', () => {
  it('a round spawns about its budget, then clears once everything is dead', () => {
    const w = createWorld(1);
    expect(w.roundClear).toBe(false);
    playRound(w);
    expect(w.roundClear).toBe(true);
    expect(w.spawn.done).toBe(true);
    // Everything spawned was paid from the round's budget, and only a group's worth is left over.
    expect(w.spawn.left).toBeLessThan(roundBudget(1));
    expect(w.kills).toBeGreaterThan(0);
    expect(w.coinsEarned).toBeGreaterThan(0);
  });

  it('the world stands still between rounds; the next round starts fresh and harder', () => {
    const w = createWorld(1);
    playRound(w);
    const time = w.time;
    step(w, STILL, DT);
    expect(w.time).toBe(time);
    startRound(w);
    expect(w.round).toBe(2);
    expect(w.roundClear).toBe(false);
    expect(w.spawn.done).toBe(false);
    expect(w.spawn.total).toBeGreaterThan(roundBudget(1));
  });

  it('a round is not over while enemies live', () => {
    const w = createWorld(1);
    for (let i = 0; i < 60 * 40; i++) step(w, STILL, DT);
    expect(w.spawn.done).toBe(true);
    expect(w.enemies.length).toBeGreaterThan(0);
    expect(w.roundClear).toBe(false);
  });
});
