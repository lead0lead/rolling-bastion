import { describe, expect, it } from 'vitest';
import type { PieceDef } from '../src/config/pieces';
import {
  cellFromId,
  cellId,
  createCity,
  onBoard,
  destroyTile,
  dropGroup,
  heldFromPiece,
  heldGroupIds,
  liftGroup,
  liftGroups,
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
    { x: 0, y: 0, tile: 'gatling', facing: 0 },
    { x: 0, y: 1, tile: 'hull', facing: 0 },
    { x: 1, y: 1, tile: 'crossbow', facing: 0 },
  ],
};

describe('createCity', () => {
  it('starts with only the Core, fixed at (0, 0), on a 6×6 board around it', () => {
    const city = createCity(6);
    expect(city.tiles).toHaveLength(1);
    expect(city.tiles[0]).toMatchObject({ type: 'core', gx: 0, gy: 0, hp: 250 });
    expect(city.board.size).toBe(36);
    expect(onBoard(city, -3, -3)).toBe(true);
    expect(onBoard(city, 2, 2)).toBe(true);
    expect(onBoard(city, 3, 0)).toBe(false);
    expect(onBoard(city, 0, -4)).toBe(false);
  });
});

describe('cellId', () => {
  it('gives every cell its own id, negative coordinates included, and maps back', () => {
    const cells = [
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: -5, y: 7 },
      { x: 7, y: -5 },
      { x: 1000, y: -1000 },
    ];
    const ids = cells.map((c) => cellId(c.x, c.y));
    expect(new Set(ids).size).toBe(cells.length);
    expect(ids.map(cellFromId)).toEqual(cells);
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
    expect(r).toContainEqual({ x: 1, y: 0, tile: 'gatling', facing: 0 });
    expect(r).toContainEqual({ x: 0, y: 0, tile: 'hull', facing: 0 });
    expect(r).toContainEqual({ x: 0, y: 1, tile: 'crossbow', facing: 0 });
  });
});

describe('placementProblems', () => {
  it('reports cells off the board and overlapping cells', () => {
    const city = createCity(6); // Core at 0,0; board −3…2
    const problems = placementProblems(city, [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: -4, y: 2 },
      { x: -1, y: -1 },
    ]);
    expect(problems.get('0,0')).toBe('overlap');
    expect(problems.get('3,0')).toBe('off_board');
    expect(problems.get('-4,2')).toBe('off_board');
    expect(problems.has('-1,-1')).toBe(false);
  });
});

describe('held groups', () => {
  it('places a fresh piece with full HP and a new group id', () => {
    const city = createCity(6);
    const held = heldFromPiece(city, L_PIECE);
    expect(dropGroup(city, held, -3, -3)).toBe(true);
    expect(tileAt(city, -3, -3)).toMatchObject({ type: 'gatling', hp: 35, groupId: held.groupId });
    expect(tileAt(city, -2, -2)?.type).toBe('crossbow');
    expect(held.groupId).not.toBe(tileAt(city, 0, 0)?.groupId);
  });

  it('refuses an invalid drop without changing the city', () => {
    const city = createCity(6);
    const held = heldFromPiece(city, L_PIECE);
    expect(dropGroup(city, held, 2, 2)).toBe(false); // partly off the board
    expect(dropGroup(city, held, 0, -1)).toBe(false); // hull would land on the core
    expect(city.tiles).toHaveLength(1);
  });

  it('lifts a group keeping ids and HP, and anchors it at the grabbed cell', () => {
    const city = createCity(6);
    const fresh = heldFromPiece(city, L_PIECE);
    dropGroup(city, fresh, -2, -2);
    const crossbow = tileAt(city, -1, -1);
    if (!crossbow) throw new Error('missing crossbow');
    crossbow.hp = 7;
    const lifted = liftGroup(city, fresh.groupId, { x: -1, y: -1 });
    expect(city.tiles).toHaveLength(1);
    expect(lifted?.anchor).toEqual({ x: 1, y: 1 });
    expect(lifted?.tiles.find((t) => t.type === 'crossbow')).toMatchObject({ id: crossbow.id, hp: 7 });
  });

  it('rotates a held group with the anchor following its tile', () => {
    const city = createCity(6);
    const held = { ...heldFromPiece(city, L_PIECE), anchor: { x: 1, y: 1 } }; // on the crossbow
    const r = rotateHeld(held, 1);
    const crossbow = r.tiles.find((t) => t.type === 'crossbow');
    expect({ x: crossbow?.gx, y: crossbow?.gy }).toEqual(r.anchor);
  });
});

describe('held selections of several groups', () => {
  it('lift, rotate and drop together, keeping relative positions and groups', () => {
    const city = cityFrom(['.....', '.aCb.', '.....']); // a (1,1), Core (2,1), b (3,1)
    const a = tileAt(city, 1, 1)?.groupId as number;
    const b = tileAt(city, 3, 1)?.groupId as number;
    const held = liftGroups(city, [a, b], { x: 1, y: 1 });
    if (!held) throw new Error('nothing lifted');
    expect(held.groupId).toBe(a);
    expect(heldGroupIds(held).sort()).toEqual([a, b].sort());
    expect(held.tiles.map((t) => [t.gx, t.gy])).toEqual([
      [0, 0],
      [2, 0],
    ]);
    // A quarter turn stands the pair on end around the grabbed tile.
    const turned = rotateHeld(held, 1);
    expect(dropGroup(city, turned, 0, 0)).toBe(true);
    expect(tileAt(city, 0, 0)?.groupId).toBe(a);
    expect(tileAt(city, 0, 2)?.groupId).toBe(b);
  });

  it('refuse a drop when any tile of any group is blocked', () => {
    const city = cityFrom(['.....', '.aCb.', '.....']);
    const a = tileAt(city, 1, 1)?.groupId as number;
    const b = tileAt(city, 3, 1)?.groupId as number;
    const held = liftGroups(city, [a, b], { x: 1, y: 1 });
    if (!held) throw new Error('nothing lifted');
    expect(dropGroup(city, held, 3, 0)).toBe(false); // b would be off the board (x 5)
    expect(dropGroup(city, held, 0, 1)).toBe(false); // b would sit on the Core
    expect(city.tiles).toHaveLength(1);
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
