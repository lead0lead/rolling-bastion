import { CASINO } from '../config/casino';
import type { BuildSession } from './build';
import type { Rng } from './rng';

export interface SpinResult {
  /** Index into CASINO.segments the wheel stops on. */
  segment: number;
  /** Coins paid out (0 on a bust). */
  payout: number;
}

/** Whether a bet can be placed right now. */
export function canSpin(s: BuildSession, bet: number): boolean {
  return (
    !!s.shop && !s.held && !s.land && (s.shop.spins ?? 0) < CASINO.maxSpins && s.shop.coins >= bet
  );
}

/** Takes the bet, rolls the wheel and pays out at once; the animation only shows the result. */
export function spin(s: BuildSession, rng: Rng, bet: number): SpinResult | null {
  if (!canSpin(s, bet) || !s.shop) return null;
  const segment = rng.int(0, CASINO.segments.length - 1);
  const payout = Math.round(bet * (CASINO.segments[segment]?.[0] ?? 0));
  s.shop.coins += payout - bet;
  s.shop.spins = (s.shop.spins ?? 0) + 1;
  // A spin is final: undoing an earlier step would otherwise restore the lost bet.
  s.history.length = 0;
  s.future.length = 0;
  s.pending = null;
  return { segment, payout };
}
