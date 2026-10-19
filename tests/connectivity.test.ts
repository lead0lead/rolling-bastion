import { describe, expect, it } from 'vitest';
import { findBridges, updateOnline } from '../src/sim/connectivity';
import { tileAt, type CityState } from '../src/sim/grid';
import { cityFrom } from './helpers';

function offlineCells(city: CityState): string[] {
  return city.tiles.filter((t) => !t.online).map((t) => `${t.gx},${t.gy}`);
}

function bridgeCells(city: CityState): string[] {
  const ids = findBridges(city);
  return city.tiles
    .filter((t) => ids.has(t.id))
    .map((t) => `${t.gx},${t.gy}`)
    .sort();
}

describe('updateOnline', () => {
  it('marks tiles connected orthogonally to the Core as online', () => {
    const city = cityFrom(['aa..', '.Cb.', '...c', '....']);
    updateOnline(city);
    // c only touches b diagonally
    expect(offlineCells(city)).toEqual(['3,2']);
  });

  it('works across groups and goes offline when a link is removed', () => {
    const city = cityFrom(['.....', '.Cab.', '.....', '.....', '.....']);
    updateOnline(city);
    expect(offlineCells(city)).toEqual([]);
    city.tiles = city.tiles.filter((t) => !(t.gx === 2 && t.gy === 1));
    updateOnline(city);
    expect(offlineCells(city)).toEqual(['3,1']);
  });

  it('marks everything offline without a Core', () => {
    const city = cityFrom(['aa', '..']);
    updateOnline(city);
    expect(offlineCells(city)).toHaveLength(2);
  });
});

describe('findBridges', () => {
  it('finds tiles in a chain whose loss disconnects others', () => {
    const city = cityFrom(['Caaa', '....', '....', '....']);
    expect(bridgeCells(city)).toEqual(['1,0', '2,0']);
  });

  it('finds no bridges in a loop', () => {
    const city = cityFrom(['Ca.', 'aa.', '...']);
    expect(bridgeCells(city)).toEqual([]);
  });

  it('never counts the Core or offline tiles', () => {
    const city = cityFrom(['Ca..', '....', '..bb', '..b.']);
    expect(bridgeCells(city)).toEqual([]);
    expect(tileAt(city, 0, 0)?.type).toBe('core');
  });
});
