import { describe, expect, it } from 'vitest';
import type { PieceDef } from '../src/config/pieces';
import {
  cancelHeld,
  confirmStatus,
  debugDestroyAt,
  dropAt,
  pickOffer,
  pickUpAt,
  previewAt,
  reroll,
  rotate,
  scrapAt,
  scrapHeld,
  startBuild,
  toggleRepair,
} from '../src/sim/build';
import { createCity, tileAt } from '../src/sim/grid';

const DOMINO: PieceDef = {
  id: 'test-domino',
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

function session() {
  return startBuild(createCity(6), [DOMINO, MONO]); // Core at 0,0; board −3…2
}

describe('build session', () => {
  it('requires taking an offer before confirming', () => {
    const s = session();
    expect(confirmStatus(s)).toMatchObject({ ok: false, block: 'no_offer_taken' });
    pickOffer(s, 1);
    expect(confirmStatus(s)).toMatchObject({ ok: false, block: 'holding' });
    expect(dropAt(s, 0, -1)).toBe(true);
    expect(confirmStatus(s)).toEqual({ ok: true });
  });

  it('allows only one offer per pause', () => {
    const s = session();
    pickOffer(s, 1);
    dropAt(s, 0, -1);
    expect(pickOffer(s, 0)).toBe(false);
  });

  it('returns a cancelled offer to the tray so another can be picked', () => {
    const s = session();
    pickOffer(s, 0);
    cancelHeld(s);
    expect(s.offerTaken).toBe(false);
    expect(pickOffer(s, 1)).toBe(true);
  });

  it('blocks confirm while tiles are disconnected', () => {
    const s = session();
    pickOffer(s, 1);
    dropAt(s, -3, -3);
    expect(confirmStatus(s)).toEqual({ ok: false, block: 'disconnected', offline: 1 });
  });

  it('keeps the held piece when a drop is invalid, and previews the problem', () => {
    const s = session();
    pickOffer(s, 1);
    expect(previewAt(s, 0, 0)?.problems.get('0,0')).toBe('overlap');
    expect(previewAt(s, 3, 0)?.problems.get('3,0')).toBe('off_board');
    expect(dropAt(s, 0, 0)).toBe(false);
    expect(dropAt(s, 3, 0)).toBe(false);
    expect(s.held).not.toBeNull();
  });

  it('moves and rotates a placed group, and cancel restores it', () => {
    const s = session();
    pickOffer(s, 0); // anchor on the gatling (0,0)
    dropAt(s, 0, -1); // gatling 0,-1 · hull 1,-1
    expect(pickUpAt(s, 0, -1)).toBe(true);
    rotate(s); // now vertical: gatling above hull
    expect(dropAt(s, -1, -2)).toBe(true);
    expect(tileAt(s.city, -1, -2)?.type).toBe('gatling');
    expect(tileAt(s.city, -1, -1)?.type).toBe('hull');
    expect(confirmStatus(s).block).toBe('disconnected');

    pickUpAt(s, -1, -2);
    cancelHeld(s);
    expect(tileAt(s.city, -1, -2)?.type).toBe('gatling');
  });

  it('keeps the Core fixed: it can be neither moved nor scrapped', () => {
    const s = session();
    expect(scrapAt(s, 0, 0)).toBe(false);
    expect(pickUpAt(s, 0, 0)).toBe(false);
    expect(s.held).toBeNull();
    expect(tileAt(s.city, 0, 0)?.type).toBe('core');
  });

  it('scraps placed groups for good', () => {
    const s = session();
    pickOffer(s, 0);
    dropAt(s, 0, -1);
    expect(scrapAt(s, 1, -1)).toBe(true);
    expect(s.city.tiles).toHaveLength(1);
  });

  it('counts scrapping a fresh offer as taking it', () => {
    const s = session();
    pickOffer(s, 0);
    expect(scrapHeld(s)).toBe(true);
    expect(confirmStatus(s)).toEqual({ ok: true });
  });

  it('turns tiles offline when a debug-destroyed bridge splits the city', () => {
    const s = startBuild(createCity(6), []);
    s.offers = [DOMINO];
    s.offerTaken = false;
    pickOffer(s, 0);
    dropAt(s, 1, 0); // gatling 1,0 · hull 2,0
    expect(debugDestroyAt(s, 1, 0)).toBe(true);
    expect(tileAt(s.city, 2, 0)?.online).toBe(false);
    expect(confirmStatus(s)).toMatchObject({ block: 'disconnected', offline: 1 });
  });
});

describe('build session: run options', () => {
  it('Repair Core counts as taking the offer', () => {
    const s = session();
    expect(toggleRepair(s)).toBe(true);
    expect(s.repairChosen).toBe(true);
    expect(pickOffer(s, 0)).toBe(false);
    expect(confirmStatus(s)).toEqual({ ok: true });
    expect(toggleRepair(s)).toBe(true);
    expect(s.repairChosen).toBe(false);
    expect(pickOffer(s, 0)).toBe(true);
  });

  it('rerolls only before an offer is taken or held', () => {
    const s = session();
    expect(reroll(s, [MONO])).toBe(true);
    expect(s.offers).toEqual([MONO]);
    pickOffer(s, 0);
    expect(reroll(s, [DOMINO])).toBe(false);
    dropAt(s, 0, -1);
    expect(reroll(s, [DOMINO])).toBe(false);
  });

  it('counts scrapped placed pieces but not scrapped fresh offers', () => {
    const s = session();
    pickOffer(s, 0);
    dropAt(s, 0, -1);
    scrapAt(s, 0, -1);
    expect(s.scrapped).toBe(1);
    const t = startBuild(createCity(6), [MONO]);
    pickOffer(t, 0);
    scrapHeld(t);
    expect(t.scrapped).toBe(0);
  });
});
