import { describe, expect, it } from 'vitest';
import type { PieceDef } from '../src/config/pieces';
import {
  createCity,
  destroyTile,
  dropGroup,
  expandGrid,
  heldFromPiece,
  liftGroup,
  placementProblems,
  rotateCells,
  rotateHeld,
  tileAt,
} from '../src/sim/grid';
import { cityFrom, groupPicture } from './helpers';

const L_PIECE: PieceDef = {
  id: 'test-l',
  weight: 1,
  cells: [
    { x: 0, y: 0, tile: 'gatling' },
    { x: 0, y: 1, tile: 'hull' },
    { x: 1, y: 1, tile: 'cannon' },
  ],
};

describe('createCity', () => {
  it('starts with only the Core at the grid centre', () => {
    const city = createCity(6);
    expect(city.tiles).toHaveLength(1);
    expect(city.tiles[0]).toMatchObject({ type: 'core', gx: 3, gy: 3, hp: 250 });
  });
});

describe('rotateCells', () => {
  it('rotates clockwise and normalizes to the origin', () => {
    // I3 horizontal → vertical
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(rotateCells(cells, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
    ]);
  });

  it('returns to the start after four turns', () => {
    const cells = L_PIECE.cells;
    expect(rotateCells(cells, 4)).toEqual(cells);
    expect(rotateCells(cells, -1)).toEqual(rotateCells(cells, 3));
  });

  it('keeps tile data attached to the rotated cell', () => {
    // L:  g.     rotated cw:  hg
    //     hc                  c.
    const r = rotateCells(L_PIECE.cells, 1);
    expect(r).toContainEqual({ x: 1, y: 0, tile: 'gatling' });
    expect(r).toContainEqual({ x: 0, y: 0, tile: 'hull' });
    expect(r).toContainEqual({ x: 0, y: 1, tile: 'cannon' });
  });
});

describe('placementProblems', () => {
  it('reports out-of-bounds and overlapping cells', () => {
    const city = createCity(6); // core at 3,3
    const problems = placementProblems(city, [
      { x: 3, y: 3 },
      { x: 6, y: 0 },
      { x: -1, y: 2 },
      { x: 2, y: 2 },
    ]);
    expect(problems.get('3,3')).toBe('overlap');
    expect(problems.get('6,0')).toBe('out_of_bounds');
    expect(problems.get('-1,2')).toBe('out_of_bounds');
    expect(problems.has('2,2')).toBe(false);
  });
});

describe('held groups', () => {
  it('places a fresh piece with full HP and a new group id', () => {
    const city = createCity(6);
    const held = heldFromPiece(city, L_PIECE);
    expect(dropGroup(city, held, 0, 0)).toBe(true);
    expect(tileAt(city, 0, 0)).toMatchObject({ type: 'gatling', hp: 35, groupId: held.groupId });
    expect(tileAt(city, 1, 1)?.type).toBe('cannon');
    expect(held.groupId).not.toBe(tileAt(city, 3, 3)?.groupId);
  });

  it('refuses an invalid drop without changing the city', () => {
    const city = createCity(6);
    const held = heldFromPiece(city, L_PIECE);
    expect(dropGroup(city, held, 5, 5)).toBe(false);
    expect(dropGroup(city, held, 3, 2)).toBe(false); // hull would land on the core
    expect(city.tiles).toHaveLength(1);
  });

  it('lifts a group keeping ids and HP, and anchors it at the grabbed cell', () => {
    const city = createCity(6);
    const fresh = heldFromPiece(city, L_PIECE);
    dropGroup(city, fresh, 1, 1);
    const cannon = tileAt(city, 2, 2);
    if (!cannon) throw new Error('missing cannon');
    cannon.hp = 7;
    const lifted = liftGroup(city, fresh.groupId, { x: 2, y: 2 });
    expect(city.tiles).toHaveLength(1);
    expect(lifted?.anchor).toEqual({ x: 1, y: 1 });
    expect(lifted?.tiles.find((t) => t.type === 'cannon')).toMatchObject({ id: cannon.id, hp: 7 });
  });

  it('rotates a held group with the anchor following its tile', () => {
    const city = createCity(6);
    const held = { ...heldFromPiece(city, L_PIECE), anchor: { x: 1, y: 1 } }; // on the cannon
    const r = rotateHeld(held, 1);
    const cannon = r.tiles.find((t) => t.type === 'cannon');
    expect({ x: cannon?.gx, y: cannon?.gy }).toEqual(r.anchor);
  });
});

describe('expandGrid', () => {
  it('adds a ring and keeps the layout centred', () => {
    const city = createCity(6);
    expect(expandGrid(city)).toBe(true);
    expect(city.gridSize).toBe(8);
    expect(tileAt(city, 4, 4)?.type).toBe('core');
    expandGrid(city);
    expect(city.gridSize).toBe(10);
    expect(tileAt(city, 5, 5)?.type).toBe('core');
    expect(expandGrid(city)).toBe(false);
    expect(city.gridSize).toBe(10);
  });
});

describe('destroyTile', () => {
  it('splits a group into separate groups when a middle tile is lost', () => {
    const city = cityFrom(['aaa', '.C.', '...']);
    const middle = tileAt(city, 1, 0);
    if (!middle) throw new Error('missing tile');
    destroyTile(city, middle.id);
    expect(groupPicture(city)).toEqual(['a.b', '.C.', '...']);
    expect(tileAt(city, 0, 0)?.groupId).not.toBe(tileAt(city, 2, 0)?.groupId);
  });

  it('keeps a group whole when the rest stays connected', () => {
    const city = cityFrom(['aaa', '.C.', '...']);
    const end = tileAt(city, 0, 0);
    if (!end) throw new Error('missing tile');
    const groupId = tileAt(city, 1, 0)?.groupId;
    destroyTile(city, end.id);
    expect(groupPicture(city)).toEqual(['.aa', '.C.', '...']);
    expect(tileAt(city, 2, 0)?.groupId).toBe(groupId);
  });
});
