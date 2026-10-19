/**
 * Uniform spatial hash over point entities, stored as linked lists in typed
 * arrays so a rebuild every tick allocates nothing. Entities are referred to
 * by their index in the caller's array.
 */
export class SpatialHash {
  private readonly heads: Int32Array;
  private next: Int32Array;
  private readonly mask: number;
  private readonly visited: number[] = [];

  constructor(
    readonly cellSize: number,
    tableBits = 12,
    capacity = 1024,
  ) {
    this.heads = new Int32Array(1 << tableBits).fill(-1);
    this.next = new Int32Array(capacity);
    this.mask = (1 << tableBits) - 1;
  }

  clear(): void {
    this.heads.fill(-1);
  }

  insert(index: number, x: number, y: number): void {
    if (index >= this.next.length) {
      const grown = new Int32Array(Math.max(index + 1, this.next.length * 2));
      grown.set(this.next);
      this.next = grown;
    }
    const b = this.bucket(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    this.next[index] = this.heads[b] as number;
    this.heads[b] = index;
  }

  /**
   * Calls `visit` for every entity in the cells overlapping the square around
   * (x, y) with half-size `radius`. Callers must still check the real distance.
   * Each entity is visited at most once.
   */
  query(x: number, y: number, radius: number, visit: (index: number) => void): void {
    const cs = this.cellSize;
    const x0 = Math.floor((x - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const y0 = Math.floor((y - radius) / cs);
    const y1 = Math.floor((y + radius) / cs);
    const visited = this.visited;
    visited.length = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.bucket(cx, cy);
        // Different cells can share a bucket; walk each bucket once.
        if (visited.includes(b)) continue;
        visited.push(b);
        for (let i = this.heads[b] as number; i !== -1; i = this.next[i] as number) visit(i);
      }
    }
  }

  private bucket(cx: number, cy: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.mask;
  }
}
