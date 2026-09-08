/**
 * The greedy bot.
 *
 * Picks the smallest set of parties that would carry it past 61 with a little
 * room to spare, then spreads its whole budget across exactly those, in
 * proportion to the mandates each one brings.
 *
 * Two cheap instincts do most of the work. It prefers parties it already holds,
 * because a tie is won by the incumbent and defending is therefore cheaper than
 * capturing. And it refuses to spread thin: every billion sent to a party
 * outside the plan is a billion not defending one inside it.
 */

import type { Rng } from "../engine/rng";
import type { Allocation, GameState, Party } from "../engine/types";
import { biddableParties, blocSeats, playerOf, refusalsAgainst } from "../engine/types";

/** Seats of headroom to buy above a bare majority, against being outbid. */
const BUFFER = 8;

export const greedyAllocation = (state: GameState, playerKey: string, _rng: Rng): Allocation => {
  const allocation: Allocation = {};
  const player = playerOf(state, playerKey);
  const ownSeats = state.parties[player.partyKey]?.seats ?? 0;

  const candidates = biddableParties(state).filter(
    (party) => refusalsAgainst(state, party, playerKey).length === 0,
  );
  if (candidates.length === 0) {
    // Nothing legal to bid on; dump everything on whatever exists.
    const fallback = biddableParties(state)[0];
    if (fallback) for (const ministry of state.ministries) allocation[ministry.key] = fallback.key;
    return allocation;
  }

  // Defend first, then buy the biggest blocks available.
  const ranked = [...candidates].sort((a, b) => {
    const mine = Number(b.heldBy === playerKey) - Number(a.heldBy === playerKey);
    if (mine !== 0) return mine;
    return b.seats - a.seats;
  });

  const needed = Math.max(0, 61 - ownSeats) + BUFFER;
  const targets: Party[] = [];
  let running = 0;
  for (const party of ranked) {
    if (running >= needed) break;
    targets.push(party);
    running += party.seats;
  }
  if (targets.length === 0) targets.push(ranked[0]);

  // Spread the budget in proportion to what each target is worth.
  const totalSeats = targets.reduce((sum, party) => sum + party.seats, 0) || 1;
  const totalBudget = state.ministries.reduce((sum, ministry) => sum + ministry.budget, 0);
  const wanted = new Map<string, number>();
  const given = new Map<string, number>();
  for (const party of targets) {
    wanted.set(party.key, (party.seats / totalSeats) * totalBudget);
    given.set(party.key, 0);
  }

  // Largest ministries first, each to whichever target is furthest behind.
  const ministries = [...state.ministries].sort((a, b) => b.budget - a.budget);
  for (const ministry of ministries) {
    let best = targets[0];
    let bestDeficit = -Infinity;
    for (const party of targets) {
      const deficit = (wanted.get(party.key) ?? 0) - (given.get(party.key) ?? 0);
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = party;
      }
    }
    allocation[ministry.key] = best.key;
    given.set(best.key, (given.get(best.key) ?? 0) + ministry.budget);
  }

  return allocation;
};

/** Exposed for the balance probe, which reports how close bots get. */
export const gapToMajority = (state: GameState, playerKey: string): number =>
  Math.max(0, 61 - blocSeats(state, playerKey));
