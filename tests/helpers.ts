import { TILES } from '../src/config/tiles';
import { createCity, type CityState } from '../src/sim/grid';

/**
 * Builds a city from an ASCII picture. 'C' is the Core, '.' empty, and every
 * other character is a Hull tile whose group is named by that character.
 */
export function cityFrom(rows: string[]): CityState {
  const city = createCity(rows.length);
  city.tiles = [];
  const groups = new Map<string, number>();
  rows.forEach((row, gy) => {
    [...row].forEach((ch, gx) => {
      if (ch === '.') return;
      const type = ch === 'C' ? 'core' : 'hull';
      let groupId = groups.get(ch);
      if (groupId === undefined) {
        groupId = city.nextGroupId++;
        groups.set(ch, groupId);
      }
      city.tiles.push({
        id: city.nextTileId++,
        type,
        gx,
        gy,
        hp: TILES[type].maxHp,
        groupId,
        online: false,
      });
    });
  });
  return city;
}

/** Renders the city back to ASCII using one character per group (Core = 'C'). */
export function groupPicture(city: CityState): string[] {
  const names = new Map<number, string>();
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const rows: string[][] = Array.from({ length: city.gridSize }, () =>
    Array<string>(city.gridSize).fill('.'),
  );
  for (const t of [...city.tiles].sort((a, b) => a.gy - b.gy || a.gx - b.gx)) {
    let name = t.type === 'core' ? 'C' : names.get(t.groupId);
    if (!name) {
      name = letters[names.size] as string;
      names.set(t.groupId, name);
    }
    (rows[t.gy] as string[])[t.gx] = name;
  }
  return rows.map((r) => r.join(''));
}
