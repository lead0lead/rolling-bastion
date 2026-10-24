import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../src/config/balance';
import { PHASE2_POOL, type PieceDef } from '../src/config/pieces';
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
  const def = PHASE2_POOL.find((p) => p.id === id);
  if (!def) throw new Error(`missing piece ${id}`);
  return def;
}

describe('upgrade type of a piece', () => {
  it('is the function tile, not the Hull filler', () => {
    expect(upgradeType(pieceById('t-cannon'))).toBe('cannon');
    expect(upgradeType(pieceById('i4-gatling'))).toBe('gatling');
    expect(upgradeType(pieceById('o-hull'))).toBe('hull');
  });
});

describe('levels and perks', () => {
  it('levels need an owned tile and have no cap', () => {
    const city = typedCity(['Cg', '..'], { C: 'core', g: 'gatling' });
    expect(canUpgrade(city, 'cannon')).toBe(false);
    expect(canUpgrade(city, 'core')).toBe(false);
    for (let i = 0; i < 10; i++) applyUpgrade(city, 'gatling');
    expect(typeLevel(city, 'gatling')).toBe(11);
  });

  it('perks unlock at level 3 and 5', () => {
    const city = typedCity(['Cc', '..'], { C: 'core', c: 'cannon' });
    city.typeLevels.cannon = 2;
    expect(perk(city, 'cannon', 'arc')).toBeUndefined();
    city.typeLevels.cannon = 3;
    expect(perk(city, 'cannon', 'arc')?.deg).toBe(135);
    expect(perk(city, 'cannon', 'pierce')).toBeUndefined();
    city.typeLevels.cannon = 5;
    expect(perk(city, 'cannon', 'pierce')?.count).toBe(3);
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
    const city = typedCity(['Cc.', '...', '...'], { C: 'core', c: 'cannon' });
    const s = startBuild(city, [pieceById('t-cannon'), pieceById('i4-gatling')]);
    expect(s.upgrades).toEqual(['cannon', null]);
    expect(toggleUpgrade(s, 1)).toBe(false);
    expect(toggleUpgrade(s, 0)).toBe(true);
    expect(chosenUpgrade(s)).toBe('cannon');
    expect(pickOffer(s, 1)).toBe(false);
    expect(toggleRepair(s)).toBe(false);
    expect(toggleUpgrade(s, 0)).toBe(true);
    expect(chosenUpgrade(s)).toBeNull();
    expect(s.offerTaken).toBe(false);
  });

  it('applying the result levels the type and refreshes the city stats', () => {
    const w = createWorld(1);
    w.city = typedCity(['Cc.', '...', '...'], { C: 'core', c: 'cannon' });
    cityChanged(w);
    applyBuildResult(w, { repair: false, scrapped: 0, upgrade: 'cannon' });
    expect(typeLevel(w.city, 'cannon')).toBe(2);
    const cannon = w.city.tiles.find((t) => t.type === 'cannon');
    if (!cannon) throw new Error('no cannon');
    expect(w.cache.syn.mods.get(cannon.id)?.damage).toBeCloseTo(1 + UPGRADES.damagePerLevel);
  });
});
