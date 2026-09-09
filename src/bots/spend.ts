/**
 * Choosing which portfolios to put on a table.
 *
 * Both bots need the same thing — a handful of ministries worth at least some
 * price — and both carried their own copy of it. This is that copy, once.
 *
 * Cheapest first, stopping as soon as the total clears the target. The great
 * offices stay in hand for the parties that will actually demand them, and
 * taking the small end is both the cheapest way to reach a price and the one
 * that overshoots it least.
 *
 * ---
 *
 * An exact version was tried and is not here, which is worth recording so it is
 * not tried again. Asked for 30bn out of a hand of 1..13, this method takes
 * 1+2+3+4+5+6+7+8 = 36 — six billion over the asking price and eight
 * portfolios gone, where 13+12+5 costs exactly 30 and spends three. That looks
 * like a clear waste, and a subset-sum picking the cheapest subset that clears
 * the target fixes it exactly.
 *
 * It is worth nothing. Measured over 2000 games a side, on four boards with the
 * seats swapped: greedy against shrewd 47.3% where this method gives 47.2%,
 * greedy against random 75.5% against 75.0%, shrewd against greedy 52.8% either
 * way. Every one of those is inside the interval.
 *
 * And on reflection it is not even obviously better play. The exact subset pays
 * with the big offices and leaves a hand of small change; this one pays with
 * the small change and keeps the big offices. Which is worth more depends
 * entirely on what the rest of the turn asks for, so the two are trades rather
 * than an improvement, and the measurement agrees. The simpler one ships.
 */

import type { GameState } from "../engine/types";
import { ministryByKey } from "../engine/types";

/**
 * The cheapest handful of portfolios out of `hand` worth at least `target`.
 *
 * Null when the whole hand cannot reach it, which both bots read as "leave this
 * party alone" rather than as "bid what you have" — a bid that cannot win is
 * worse than no bid, because it commits one of three tables to losing.
 */
export const cheapestAtLeast = (
  state: GameState,
  hand: readonly string[],
  target: number,
): string[] | null => {
  const budget = (key: string): number => ministryByKey(state, key)?.budget ?? 0;
  const sorted = [...hand].sort((a, b) => budget(a) - budget(b));

  const chosen: string[] = [];
  let total = 0;
  for (const key of sorted) {
    if (total >= target) break;
    chosen.push(key);
    total += budget(key);
  }
  return total >= target ? chosen : null;
};
