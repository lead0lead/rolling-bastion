import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import { SHOP_PIECES, type PieceDef } from '../src/config/pieces';
import { TILES } from '../src/config/tiles';
import {
  buyLand,
  buyRepair,
  buyUpgrade,
  cancelHeld,
  confirmStatus,
  dropAt,
  offerIndexAt,
  pickOffer,
  scrapAt,
  swapAt,
  startBuild,
  undo,
  type ShopState,
} from '../src/sim/build';
import { landPrice, pieceCost, scrapValue, upgradePrice } from '../src/sim/economy';
import { coreTile, createCity, tileAt } from '../src/sim/grid';
import { typeLevel } from '../src/sim/upgrades';

const GUN: PieceDef = {
  id: 'test-gun',
  weight: 1,
  cells: [
    { x: 0, y: 0, tile: 'gatling', facing: 0 },
    { x: 1, y: 0, tile: 'hull', facing: 0 },
  ],
};
const MONO: PieceDef = {
  id: 'test-mono',
  weight: 1,
  cells: [{ x: 0, y: 0, tile: 'hull', facing: 0 }],
};
const GUN_COST = ECONOMY.cost.gatling + ECONOMY.cost.hull;

function shop(coins: number, landsBought = 0): ShopState {
  return {
    coins,
    landsBought,
  };
}

function open(coins: number) {
  return startBuild(createCity(6), [GUN, MONO], null, shop(coins));
}

describe('stock', () => {
  it('sells every tile type except the Core, one cell each', () => {
    const types = SHOP_PIECES.map((p) => p.cells[0]?.tile);
    expect(SHOP_PIECES.every((p) => p.cells.length === 1)).toBe(true);
    expect(new Set(types)).toEqual(new Set(Object.keys(TILES).filter((t) => t !== 'core')));
  });
});

describe('prices', () => {
  it('a piece costs the sum of its cells, the stronger tile the more', () => {
    expect(pieceCost(GUN)).toBe(GUN_COST);
  });

  it('land and upgrades get dearer with every purchase', () => {
    expect(landPrice(1)).toBeGreaterThan(landPrice(0));
    const city = createCity(6);
    const first = upgradePrice(city, 'gatling');
    city.typeLevels.gatling = 2;
    expect(upgradePrice(city, 'gatling')).toBe(Math.round(first * 2 * ECONOMY.upgradePriceGrowth));
  });

  it('scrapping pays back half', () => {
    expect(scrapValue([{ type: 'gatling' }, { type: 'hull' }])).toBe(
      Math.round(GUN_COST * ECONOMY.scrapRefund),
    );
  });
});

describe('shop session', () => {
  it('can be left without buying anything', () => {
    expect(confirmStatus(open(0))).toEqual({ ok: true });
  });

  it('buying a piece costs coins and the stock never runs out', () => {
    const s = open(100);
    expect(pickOffer(s, 0)).toBe(true);
    expect(s.shop?.coins).toBe(100 - GUN_COST);
    expect(dropAt(s, 0, -1)).toBe(true);
    expect(s.offers[0]).toBe(GUN);
    expect(s.shop?.coins).toBe(100 - GUN_COST);
    // Always on sale: the same piece can be bought again.
    expect(pickOffer(s, 0)).toBe(true);
  });

  it('refuses a piece that costs more than the coins left', () => {
    const s = open(GUN_COST - 1);
    expect(pickOffer(s, 0)).toBe(false);
    expect(s.held).toBeNull();
  });

  it('putting a bought piece back, or undoing its purchase, gives the coins back', () => {
    const s = open(100);
    pickOffer(s, 0);
    cancelHeld(s);
    expect(s.shop?.coins).toBe(100);
    pickOffer(s, 0);
    dropAt(s, 0, -1);
    expect(undo(s)).toBe(true);
    expect(s.shop?.coins).toBe(100);
    expect(s.offers[0]).toBe(GUN);
    expect(tileAt(s.city, 0, -1)).toBeUndefined();
  });

  it('scrapping a placed piece pays half its cost, undo takes it back', () => {
    const s = open(100);
    pickOffer(s, 0);
    dropAt(s, 0, -1);
    const after = s.shop?.coins ?? 0;
    expect(scrapAt(s, 0, -1)).toBe(true);
    expect(s.shop?.coins).toBe(after + Math.round(GUN_COST * ECONOMY.scrapRefund));
    undo(s);
    expect(s.shop?.coins).toBe(after);
  });

  it('upgrades only types the city owns, and undo gives the level back', () => {
    const s = open(1000);
    expect(buyUpgrade(s, 'gatling')).toBe(false);
    pickOffer(s, 0);
    dropAt(s, 0, -1);
    const coins = s.shop?.coins ?? 0;
    const level = s.city.typeLevels.gatling;
    const price = upgradePrice(s.city, 'gatling');
    expect(buyUpgrade(s, 'gatling')).toBe(true);
    expect(typeLevel(s.city, 'gatling')).toBe(2);
    expect(s.shop?.coins).toBe(coins - price);
    undo(s);
    expect(s.city.typeLevels.gatling).toBe(level);
    expect(s.shop?.coins).toBe(coins);
  });

  it('repairs the Core only when it is hurt', () => {
    const s = open(100);
    expect(buyRepair(s)).toBe(false);
    const core = coreTile(s.city);
    if (!core) throw new Error('no core');
    core.hp = 10;
    expect(buyRepair(s)).toBe(true);
    expect(core.hp).toBeGreaterThan(10);
    expect(s.shop?.coins).toBe(100 - ECONOMY.repairPrice);
  });

  it('land costs more each time and grows the board by one cell on every side', () => {
    const s = startBuild(createCity(6), [GUN], null, shop(1000, 2));
    expect(buyLand(s)).toBe(true);
    expect(s.shop?.coins).toBe(1000 - landPrice(2));
    expect(s.shop?.landsBought).toBe(3);
    expect(s.city.board.size).toBe(8 * 8);
    expect(confirmStatus(s)).toEqual({ ok: true });
  });

  it('undoing a land purchase refunds it', () => {
    const s = open(1000);
    buyLand(s);
    undo(s);
    expect(s.land).toBeNull();
    expect(s.shop?.coins).toBe(1000);
    expect(s.shop?.landsBought).toBe(0);
  });

  it('refuses purchases it cannot pay', () => {
    const s = open(landPrice(0) - 1);
    expect(buyLand(s)).toBe(false);
    expect(s.land).toBeNull();
  });
});

describe('swapping', () => {
  it('dropping a held part onto a placed one swaps them; putting the old one away sells it', () => {
    const s = open(1000);
    const core = coreTile(s.city);
    if (!core) throw new Error('no core');
    const x = core.gx + 1;
    const y = core.gy;
    pickOffer(s, 1);
    expect(dropAt(s, x, y)).toBe(true);
    pickOffer(s, 0);
    // Gatling (anchored on its Gatling cell) onto the Hull.
    expect(dropAt(s, x, y)).toBe(false);
    expect(swapAt(s, x, y)).toBe(true);
    expect(tileAt(s.city, x, y)?.type).not.toBe('hull');
    expect(s.held?.tiles[0]?.type).toBe('hull');
    const coins = s.shop?.coins ?? 0;
    cancelHeld(s);
    expect(s.shop?.coins).toBe(coins + scrapValue([{ type: 'hull' }]));
  });

  it('never swaps out the Core', () => {
    const s = open(1000);
    const core = coreTile(s.city);
    if (!core) throw new Error('no core');
    pickOffer(s, 1);
    expect(swapAt(s, core.gx, core.gy)).toBe(false);
  });
});

describe('right-click re-pick', () => {
  it('finds the shop offer matching a placed part', () => {
    const s = open(1000);
    pickOffer(s, 0);
    dropAt(s, 1, 1);
    expect(offerIndexAt(s, 1, 1)).toBe(0);
    expect(offerIndexAt(s, 5, 5)).toBe(-1);
  });
});
