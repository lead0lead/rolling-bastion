import { cellId, coreTile, type CityState, type PlacedTile } from './grid';

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
 * least one other tile offline. These are the articulation points of the
 * Core's component, found in linear time with Tarjan's low-link DFS rooted at
 * the Core (concept-v2.md §2.4). Iterative, so big cities can't overflow
 * the stack.
 */
export function findBridges(city: CityState): Set<number> {
  const bridges = new Set<number>();
  const core = coreTile(city);
  if (!core) return bridges;
  const byCell = new Map(city.tiles.map((t) => [cellId(t.gx, t.gy), t]));
  const disc = new Map<number, number>();
  const low = new Map<number, number>();
  let time = 0;
  // Each frame: the tile, its DFS parent, and which neighbour to look at next.
  const stack: { t: PlacedTile; parent: PlacedTile | null; next: number }[] = [];
  disc.set(core.id, time);
  low.set(core.id, time++);
  stack.push({ t: core, parent: null, next: 0 });
  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as (typeof stack)[number];
    const { t } = frame;
    const dir = NEIGHBOURS[frame.next++];
    if (dir) {
      const n = byCell.get(cellId(t.gx + dir[0], t.gy + dir[1]));
      if (!n || n === frame.parent) continue;
      const seen = disc.get(n.id);
      if (seen === undefined) {
        disc.set(n.id, time);
        low.set(n.id, time++);
        stack.push({ t: n, parent: t, next: 0 });
      } else {
        low.set(t.id, Math.min(low.get(t.id) as number, seen));
      }
      continue;
    }
    // All neighbours done: report to the parent.
    stack.pop();
    const parent = frame.parent;
    if (!parent) continue;
    const childLow = low.get(t.id) as number;
    low.set(parent.id, Math.min(low.get(parent.id) as number, childLow));
    // The child's subtree can't reach above the parent: losing the parent cuts it off.
    if (parent !== core && childLow >= (disc.get(parent.id) as number)) bridges.add(parent.id);
  }
  return bridges;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
