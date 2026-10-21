import { describe, expect, it } from 'vitest';
import { PHASE2_POOL } from '../src/config/pieces';
import { TILES } from '../src/config/tiles';
import { inArc, nearestEnemy, updateWeapons, weaponArc } from '../src/sim/combat';
import {
  createCity,
  facingAngle,
  heldFromPiece,
  rotateHeld,
  tileAt,
  turnFacing,
} from '../src/sim/grid';
import { spawnEnemy } from '../src/sim/spawner';
import { cityChanged, createWorld, tileCentre, type World } from '../src/sim/world';
import { cityFrom } from './helpers';

const DT = 1 / 60;

describe('facing', () => {
  it('turns clockwise and wraps', () => {
    expect(turnFacing(0, 1)).toBe(1);
    expect(turnFacing(3, 1)).toBe(0);
    expect(turnFacing(0, -1)).toBe(3);
    expect(facingAngle(0)).toBeCloseTo(-Math.PI / 2);
    expect(facingAngle(1)).toBeCloseTo(0);
  });

  it('pieces face up by default and rotate their facing with the piece', () => {
    const def = PHASE2_POOL.find((p) => p.id === 't-cannon');
    if (!def) throw new Error('missing piece');
    const held = heldFromPiece(createCity(), def);
    expect(held.tiles.every((t) => t.facing === 0)).toBe(true);
    const turned = rotateHeld(held, 1);
    expect(turned.tiles.every((t) => t.facing === 1)).toBe(true);
    expect(rotateHeld(turned, 3).tiles.every((t) => t.facing === 0)).toBe(true);
  });
});

describe('inArc', () => {
  const up = { fx: 0, fy: -1, cosHalf: Math.cos(Math.PI / 4) }; // 90° arc facing up
  const half = { fx: 0, fy: -1, cosHalf: 0 }; // 180° arc facing up

  it('accepts directions within half the arc of the facing', () => {
    expect(inArc(up, 0, -10, 100)).toBe(true);
    expect(inArc(up, 9, -10, 181)).toBe(true); // ~42° off
    expect(inArc(up, 11, -10, 221)).toBe(false); // ~48° off
    expect(inArc(up, 0, 10, 100)).toBe(false);
  });

  it('a 180° arc covers the whole front half', () => {
    expect(inArc(half, 10, -0.1, 100.01)).toBe(true);
    expect(inArc(half, 10, 0.1, 100.01)).toBe(false);
  });

  it('no arc means all around', () => {
    expect(inArc(null, 0, 10, 100)).toBe(true);
  });
});

/** World with the Core at the centre and one weapon tile right of it. */
function gunWorld(type: 'gatling' | 'cannon', facing: 0 | 1 | 2 | 3): World {
  const w = createWorld(1);
  w.city = cityFrom(['...', '.Ca', '...']);
  const gun = tileAt(w.city, 2, 1);
  if (!gun) throw new Error('missing tile');
  gun.type = type;
  gun.facing = facing;
  cityChanged(w);
  return w;
}

describe('arc targeting', () => {
  it('a Cannon facing right ignores enemies behind it and hits ones in front', () => {
    const w = gunWorld('cannon', 1);
    const gun = tileAt(w.city, 2, 1);
    if (!gun) throw new Error('missing tile');
    const c = tileCentre(w, gun);
    const weapon = TILES.cannon.weapon;
    if (!weapon) throw new Error('no weapon');
    const behind = spawnEnemy(w, 'swarmer', c.x - 100, c.y);
    expect(nearestEnemy(w, c.x, c.y, weapon.range, weaponArc(gun, weapon))).toBeUndefined();
    const front = spawnEnemy(w, 'swarmer', c.x + 300, c.y + 20);
    expect(nearestEnemy(w, c.x, c.y, weapon.range, weaponArc(gun, weapon))).toBe(front);
    expect(nearestEnemy(w, c.x, c.y, weapon.range)).toBe(behind);
  });

  it('uses the longer arc-weapon range', () => {
    const w = gunWorld('cannon', 1);
    const gun = tileAt(w.city, 2, 1);
    if (!gun) throw new Error('missing tile');
    const c = tileCentre(w, gun);
    const far = spawnEnemy(w, 'swarmer', c.x + 370, c.y);
    const weapon = TILES.cannon.weapon;
    if (!weapon) throw new Error('no weapon');
    expect(nearestEnemy(w, c.x, c.y, weapon.range, weaponArc(gun, weapon))).toBe(far);
  });

  it('aims weapon barrels at the target, and back along the facing when idle', () => {
    const w = gunWorld('gatling', 0);
    const gun = tileAt(w.city, 2, 1);
    if (!gun) throw new Error('missing tile');
    updateWeapons(w, DT);
    expect(w.weapons.get(gun.id)?.aim).toBeCloseTo(facingAngle(0));
    const c = tileCentre(w, gun);
    spawnEnemy(w, 'swarmer', c.x + 100, c.y - 100);
    for (let i = 0; i < 10; i++) updateWeapons(w, DT);
    expect(w.weapons.get(gun.id)?.aim).toBeCloseTo(-Math.PI / 4);
  });

  it('the Core pistol still fires all around', () => {
    const w = createWorld(1);
    const core = tileAt(w.city, 0, 0);
    if (!core) throw new Error('missing core');
    const c = tileCentre(w, core);
    spawnEnemy(w, 'swarmer', c.x, c.y + 150); // below; core faces up
    for (let i = 0; i < 120 && w.projectiles.length === 0; i++) updateWeapons(w, DT);
    expect(w.projectiles.length).toBeGreaterThan(0);
  });
});
