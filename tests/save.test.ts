import { describe, expect, it } from 'vitest';
import { loadWorld, saveWorld } from '../src/sim/save';
import { step } from '../src/sim/step';
import { createWorld } from '../src/sim/world';

const DT = 1 / 60;
const IDLE = { x: 0, y: 0 };

function play(w: ReturnType<typeof createWorld>, seconds: number) {
  for (let i = 0; i < seconds / DT; i++) step(w, IDLE, DT);
}

describe('saving a run', () => {
  it('a loaded run carries on exactly as the original would have', () => {
    const w = createWorld(7);
    w.city.typeLevels.gatling = 3;
    play(w, 40);
    expect(w.enemies.length).toBeGreaterThan(0);
    const copy = loadWorld(saveWorld(w));
    if (!copy) throw new Error('save did not load');
    expect(copy.time).toBe(w.time);
    expect(copy.coins).toBe(w.coins);
    expect(copy.enemies).toHaveLength(w.enemies.length);
    expect(copy.city.board.size).toBe(w.city.board.size);
    expect(copy.city.typeLevels.gatling).toBe(3);

    play(w, 20);
    play(copy, 20);
    expect(copy.time).toBeCloseTo(w.time);
    expect(copy.kills).toBe(w.kills);
    expect(copy.enemies).toHaveLength(w.enemies.length);
    expect(copy.coins).toBeCloseTo(w.coins);
    expect(copy.pressure).toBeCloseTo(w.pressure);
    expect(copy.rng.state()).toBe(w.rng.state());
  });

  it('keeps the boss as the same enemy and the infinite status timers', () => {
    const w = createWorld(3);
    w.time = 700;
    w.godMode = true;
    play(w, 100);
    const copy = loadWorld(saveWorld(w));
    if (!copy) throw new Error('save did not load');
    expect(!!copy.boss).toBe(!!w.boss);
    if (copy.boss) expect(copy.enemies).toContain(copy.boss);
    for (const e of copy.enemies) expect(e.burnUntil).toBe(-Infinity);
  });

  it('refuses garbage and other versions', () => {
    expect(loadWorld('not json')).toBeNull();
    expect(loadWorld('{"version":0}')).toBeNull();
    expect(loadWorld('{}')).toBeNull();
  });
});
