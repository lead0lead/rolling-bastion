import type { PieceDef } from '../config/pieces';
import type { Rng } from './rng';

/** Weighted random pick of `count` distinct pieces from the pool. */
export function rollOffers(rng: Rng, pool: readonly PieceDef[], count: number): PieceDef[] {
  const remaining = [...pool];
  const offers: PieceDef[] = [];
  while (offers.length < count && remaining.length > 0) {
    const total = remaining.reduce((s, p) => s + p.weight, 0);
    let roll = rng.next() * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= (remaining[i] as PieceDef).weight;
      if (roll < 0) {
        index = i;
        break;
      }
    }
    offers.push(...remaining.splice(index, 1));
  }
  return offers;
}
