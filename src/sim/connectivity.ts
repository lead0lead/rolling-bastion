import { coreTile, type CityState, type PlacedTile } from './grid';

/** Ids of all tiles with an orthogonal path through occupied tiles to the Core. */
export function connectedToCore(
  city: CityState,
  tiles: readonly PlacedTile[] = city.tiles,
): Set<number> {
  const connected = new Set<number>();
  const core = tiles.find((t) => t.type === 'core');
  if (!core) return connected;
  const byCell = new Map(tiles.map((t) => [`${t.gx},${t.gy}`, t]));
  const stack = [core];
  connected.add(core.id);
  while (stack.length > 0) {
    const t = stack.pop() as PlacedTile;
    for (const [dx, dy] of NEIGHBOURS) {
      const n = byCell.get(`${t.gx + dx},${t.gy + dy}`);
      if (n && !connected.has(n.id)) {
        connected.add(n.id);
        stack.push(n);
      }
    }
  }
  return connected;
}

/** Recomputes every tile's `online` flag. Call whenever the city changes. */
export function updateOnline(city: CityState): void {
  const connected = connectedToCore(city);
  for (const t of city.tiles) t.online = connected.has(t.id);
}

/**
 * Bridge tiles: online tiles (other than the Core) whose loss would take at
 * least one other tile offline. Brute force is fine at ≤100 tiles.
 */
export function findBridges(city: CityState): Set<number> {
  const bridges = new Set<number>();
  const core = coreTile(city);
  if (!core) return bridges;
  const connected = connectedToCore(city);
  for (const t of city.tiles) {
    if (t.id === core.id || !connected.has(t.id)) continue;
    const without = city.tiles.filter((o) => o.id !== t.id);
    if (connectedToCore(city, without).size < connected.size - 1) bridges.add(t.id);
  }
  return bridges;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
