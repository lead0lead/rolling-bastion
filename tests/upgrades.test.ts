import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../src/config/balance';
import { PHASE3_POOL, type PieceDef } from '../src/config/pieces';
import {
  chosenUpgrade,
  pickOffer,
  startBuild,
  toggleRepair,
  toggleUpgrade,
} from '../src/sim/build';
import { applyBuildResult } from '../src/sim/progression';
import { applyUpgrade, canUpgrade, perk, typeLevel, upgradeType } from '../src/sim/upgrades';
import { cityChanged, createWorld } from '../src/sim/world';
import { typedCity } from './helpers';

function pieceById(id: string): PieceDef {
  const def = PHASE3_POOL.find((p) => p.id === id);
  if (!def) throw new Error(`missing piece ${id}`);
  return def;
}

describe('upgrade type of a piece', () => {
  it('is the function tile, not the Hull filler', () => {
    expect(upgradeType(pieceById('domino-flamer'))).toBe('flamethrower');
    expect(upgradeType(pieceById('i4-gatling'))).toBe('gatling');
    expect(upgradeType(pieceById('o-hull'))).toBe('hull');
  });
});

describe('levels and perks', () => {
  it('levels need an owned tile and have no cap', () => {
    const city = typedCity(['Cg', '..'], { C: 'core', g: 'gatling' });
    expect(canUpgrade(city, 'flamethrower')).toBe(false);
    expect(canUpgrade(city, 'core')).toBe(false);
    for (let i = 0; i < 10; i++) applyUpgrade(city, 'gatling');
    expect(typeLevel(city, 'gatling')).toBe(11);
  });

  it('perks unlock at level 3 and 5', () => {
    const city = typedCity(['Cx', '..'], { C: 'core', x: 'crossbow' });
    city.typeLevels.crossbow = 2;
    expect(perk(city, 'crossbow', 'pierce')).toBeUndefined();
    city.typeLevels.crossbow = 5;
    expect(perk(city, 'crossbow', 'pierce')?.count).toBe(3);
  });

  it('the L5 perk wins over an L3 perk of the same kind', () => {
    const city = typedCity(['Cn', '..'], { C: 'core', n: 'engine' });
    city.typeLevels.engine = 3;
    expect(perk(city, 'engine', 'sizePenalty')?.factor).toBe(0.5);
    city.typeLevels.engine = 5;
    expect(perk(city, 'engine', 'sizePenalty')?.factor).toBe(0);
  });
});

describe('upgrade in the build pause', () => {
  it('is offered for owned types and replaces placing a piece', () => {
    const city = typedCity(['Cc.', '...', '...'], { C: 'core', c: 'flamethrower' });
    const s = startBuild(city, [pieceById('domino-flamer'), pieceById('i4-gatling')]);
    expect(s.upgrades).toEqual(['flamethrower', null]);
    expect(toggleUpgrade(s, 1)).toBe(false);
    expect(toggleUpgrade(s, 0)).toBe(true);
    expect(chosenUpgrade(s)).toBe('flamethrower');
    expect(pickOffer(s, 1)).toBe(false);
    expect(toggleRepair(s)).toBe(false);
    expect(toggleUpgrade(s, 0)).toBe(true);
    expect(chosenUpgrade(s)).toBeNull();
    expect(s.offerTaken).toBe(false);
  });

  it('applying the result levels the type and refreshes the city stats', () => {
    const w = createWorld(1);
    w.city = typedCity(['Cc.', '...', '...'], { C: 'core', c: 'flamethrower' });
    cityChanged(w);
    applyBuildResult(w, { repair: false, scrapped: 0, upgrade: 'flamethrower' });
    expect(typeLevel(w.city, 'flamethrower')).toBe(2);
    const flamer = w.city.tiles.find((t) => t.type === 'flamethrower');
    if (!flamer) throw new Error('no flamer');
    expect(w.cache.syn.mods.get(flamer.id)?.damage).toBeCloseTo(1 + UPGRADES.damagePerLevel);
  });
});
