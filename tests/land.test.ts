import { describe, expect, it } from 'vitest';
import { LAND, LAND_SHAPES, type LandShape } from '../src/config/land';
import type { PieceDef } from '../src/config/pieces';
import {
  cancelHeld,
  confirmStatus,
  landPreviewAt,
  offerLand,
  pickLand,
  pickOffer,
  pickUpAt,
  placeLandAt,
  rotate,
  startBuild,
  toggleRepair,
} from '../src/sim/build';
import { cellId, createCity, onBoard } from '../src/sim/grid';
import { addLand, isLandLevel, landCells, landProblems, rollLand } from '../src/sim/land';
import { addXp, xpToNext } from '../src/sim/progression';
import { createRng } from '../src/sim/rng';
import { createWorld } from '../src/sim/world';

const STRIP: LandShape = LAND_SHAPES.find((l) => l.id === 'strip') as LandShape; // 6×2
const MONO: PieceDef = {
  id: 'test-mono',
  weight: 1,
  cells: [{ x: 0, y: 0, tile: 'hull', facing: 0 }],
};

describe('land shapes', () => {
  it('all have the same cell count and distinct ids', () => {
    for (const l of LAND_SHAPES) expect(l.cells).toHaveLength(LAND.cells);
    expect(new Set(LAND_SHAPES.map((l) => l.id)).size).toBe(LAND_SHAPES.length);
  });

  it('offers distinct shapes', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const offer = rollLand(rng, LAND_SHAPES);
      expect(offer).toHaveLength(LAND.offers);
      expect(new Set(offer.map((l) => l.id)).size).toBe(LAND.offers);
    }
  });

  it('centres the (rotated) shape on the given cell', () => {
    // The 6×2 strip centred on (10, 0): x 7…12, y −1…0.
    const flat = landCells(STRIP, 0, 10, 0);
    expect(Math.min(...flat.map((c) => c.x))).toBe(7);
    expect(Math.max(...flat.map((c) => c.x))).toBe(12);
    expect(Math.min(...flat.map((c) => c.y))).toBe(-1);
    // A quarter turn makes it 2×6.
    const tall = landCells(STRIP, 1, 10, 0);
    expect(new Set(tall.map((c) => c.x)).size).toBe(2);
    expect(new Set(tall.map((c) => c.y)).size).toBe(6);
  });
});

describe('placing land', () => {
  it('must share an edge with the board and not overlap it', () => {
    const city = createCity(6); // board −3…2
    // Right next to the board's right edge (x = 3…8): valid.
    expect(landProblems(city, landCells(STRIP, 0, 6, 0)).size).toBe(0);
    // One column over the board (x = 2…7): the overlapping cells are reported.
    const over = landProblems(city, landCells(STRIP, 0, 5, 0));
    expect([...over].sort()).toEqual(['2,-1', '2,0']);
    // A gap of one column (x = 4…9): every cell is reported.
    expect(landProblems(city, landCells(STRIP, 0, 7, 0)).size).toBe(LAND.cells);
  });

  it('does not count touching only at a corner', () => {
    const city = createCity(6);
    // Strip at x 3…8, y 3…4: only its corner (3, 3) meets the board's corner (2, 2).
    expect(landProblems(city, landCells(STRIP, 0, 6, 4)).size).toBe(LAND.cells);
  });

  it('adds valid land to the board and refuses invalid land', () => {
    const city = createCity(6);
    expect(addLand(city, landCells(STRIP, 0, 7, 0))).toBe(false);
    expect(city.board.size).toBe(36);
    expect(addLand(city, landCells(STRIP, 0, 6, 0))).toBe(true);
    expect(city.board.size).toBe(36 + LAND.cells);
    expect(onBoard(city, 8, 0)).toBe(true);
    expect(city.board.has(cellId(9, 0))).toBe(false);
  });
});

describe('land levels', () => {
  it('queue land with the level-ups at the land levels only', () => {
    const w = createWorld(1);
    const first = LAND.atLevels[0];
    let xp = 0;
    for (let level = 1; level < first; level++) xp += xpToNext(level);
    addXp(w, xp - 1);
    expect(w.pendingLand).toBe(0);
    addXp(w, 1);
    expect(w.level).toBe(first);
    expect(w.pendingLand).toBe(1);
    expect(isLandLevel(first)).toBe(true);
    expect(isLandLevel(first + 1)).toBe(false);
  });
});

describe('build session: land step', () => {
  function session() {
    return startBuild(createCity(6), [MONO], [STRIP, LAND_SHAPES[0] as LandShape]);
  }

  it('comes first: blocks confirm, offers and the city until the land is placed', () => {
    const s = session();
    expect(confirmStatus(s)).toEqual({ ok: false, block: 'land' });
    expect(pickOffer(s, 0)).toBe(false);
    expect(toggleRepair(s)).toBe(false);
    expect(pickUpAt(s, 0, 0)).toBe(false);
    expect(pickLand(s, 0)).toBe(true);
    expect(placeLandAt(s, 6, 0)).toBe(true);
    expect(s.land).toBeNull();
    expect(s.city.board.size).toBe(36 + LAND.cells);
    expect(confirmStatus(s)).toMatchObject({ block: 'no_offer_taken' });
    expect(pickOffer(s, 0)).toBe(true);
  });

  it('rotates the held land and keeps it after an invalid placement', () => {
    const s = session();
    pickLand(s, 0);
    rotate(s);
    expect(landPreviewAt(s, 0, -6)?.cells.every((c) => c.y >= -9 && c.y <= -4)).toBe(true);
    expect(placeLandAt(s, 0, 0)).toBe(false); // overlaps the board
    expect(s.heldLand).toEqual({ index: 0, turns: 1 });
    expect(placeLandAt(s, 0, -6)).toBe(true); // a 2×6 column above the board
  });

  it('can add a land step to a running pause, but not while a group is held', () => {
    const s = startBuild(createCity(6), [MONO]);
    pickOffer(s, 0);
    expect(offerLand(s, [STRIP])).toBe(false);
    cancelHeld(s);
    expect(offerLand(s, [STRIP])).toBe(true);
    expect(confirmStatus(s)).toEqual({ ok: false, block: 'land' });
  });

  it('puts the land back with cancel, and a session without land skips the step', () => {
    const s = session();
    pickLand(s, 1);
    cancelHeld(s);
    expect(s.heldLand).toBeNull();
    expect(s.land).not.toBeNull();
    const plain = startBuild(createCity(6), [MONO]);
    expect(plain.land).toBeNull();
    expect(confirmStatus(plain)).toMatchObject({ block: 'no_offer_taken' });
  });
});
