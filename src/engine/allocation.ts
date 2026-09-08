/**
 * The bidding round.
 *
 * Every turn each player spreads all of their ministries across the parties
 * they want; the bids are sealed until everyone has committed, and then each
 * party simply joins whoever offered it the most. There is no reserve price —
 * competition is the price, and the real constraint is that a ministry spent
 * on one party is a ministry not spent on another.
 *
 * Nothing here reads a party's politics. Red lines are consulted, but those are
 * concrete party-to-party facts written by the deck, not inferences from
 * ideology, so the auction stays blind to it.
 */

import type { Allocation, GameState, PartyResult } from "./types";
import { bidValue, biddableParties, blocSeats, isLedByPlayer, refusalsAgainst } from "./types";

const playerIndex = (state: GameState, playerKey: string): number =>
  state.players.findIndex((player) => player.key === playerKey);

export interface AllocationProblem {
  code: "unknown-ministry" | "unknown-party" | "unallocated" | "own-party" | "led-party";
  message: string;
}

/**
 * Check a player's spread before it is sealed.
 *
 * Every ministry must be placed, and only parties that are actually for sale
 * can receive one: a player's own party is theirs already, and the parties the
 * other players lead are never on the market.
 */
export const validateAllocation = (
  state: GameState,
  playerKey: string,
  allocation: Allocation,
): AllocationProblem[] => {
  const problems: AllocationProblem[] = [];
  const player = state.players.find((candidate) => candidate.key === playerKey);

  for (const [ministryKey, partyKey] of Object.entries(allocation)) {
    if (!state.ministries.some((ministry) => ministry.key === ministryKey)) {
      problems.push({
        code: "unknown-ministry",
        message: `There is no ${ministryKey} ministry.`,
      });
      continue;
    }
    const party = state.parties[partyKey];
    if (!party) {
      problems.push({ code: "unknown-party", message: `There is no party ${partyKey}.` });
      continue;
    }
    if (player && partyKey === player.partyKey) {
      problems.push({
        code: "own-party",
        message: `You cannot bid for your own party.`,
      });
      continue;
    }
    if (isLedByPlayer(state, partyKey)) {
      problems.push({
        code: "led-party",
        message: `The ${party.name} is led by a rival and is not for sale.`,
      });
    }
  }

  const unplaced = state.ministries.filter((ministry) => !allocation[ministry.key]);
  if (unplaced.length > 0) {
    problems.push({
      code: "unallocated",
      message: `${unplaced.length} ministries are still on your desk. Every one must be offered.`,
    });
  }

  return problems;
};

export const isValidAllocation = (
  state: GameState,
  playerKey: string,
  allocation: Allocation,
): boolean => validateAllocation(state, playerKey, allocation).length === 0;

/**
 * Work out where every party lands, given the sealed bids.
 *
 * Ties are broken twice over. An incumbent defends: it only has to match a
 * challenger, not beat it. Where nobody holds the party — the opening turn,
 * most obviously — a tie goes to the bidder with the most mandates already
 * behind them, because a seat in the government most likely to actually form
 * is worth more than the same seat in one that never will. Only then does it
 * fall back on seating order.
 *
 * A party nobody bids for goes back on the market: a bloc has to be paid for
 * again every single turn.
 */
export const resolveRound = (state: GameState): PartyResult[] => {
  const results: PartyResult[] = [];

  for (const party of biddableParties(state)) {
    const bids: Record<string, number> = {};
    const blocked: string[] = [];

    for (const player of state.players) {
      const allocation = state.commitments[player.key];
      if (!allocation) continue;
      const value = bidValue(state, allocation, party.key);
      if (value > 0) bids[player.key] = value;
    }

    // A red line beats any amount of money.
    for (const playerKey of Object.keys(bids)) {
      if (refusalsAgainst(state, party, playerKey).length > 0) {
        blocked.push(playerKey);
        delete bids[playerKey];
      }
    }

    const best = Object.values(bids).reduce((top, value) => Math.max(top, value), 0);
    const tied = Object.entries(bids)
      .filter(([, value]) => value === best)
      .map(([playerKey]) => playerKey);

    let winner: string | null = null;
    if (best > 0 && tied.length === 1) {
      winner = tied[0];
    } else if (best > 0) {
      if (party.heldBy && tied.includes(party.heldBy)) {
        // The sitting holder defends a tie.
        winner = party.heldBy;
      } else {
        // Nobody holds it, so the party goes to whoever is closest to a
        // majority: the offer worth most is the one most likely to be worth
        // anything at all.
        winner = [...tied].sort((a, b) => {
          const byBloc = blocSeats(state, b) - blocSeats(state, a);
          if (byBloc !== 0) return byBloc;
          return playerIndex(state, a) - playerIndex(state, b);
        })[0];
      }
    }

    results.push({
      partyKey: party.key,
      bids,
      previousHolder: party.heldBy,
      newHolder: winner,
      blocked,
    });
  }

  return results;
};

/** Write a resolved round onto the board. */
export const applyRound = (state: GameState, results: PartyResult[]): void => {
  for (const result of results) {
    state.parties[result.partyKey].heldBy = result.newHolder;
  }
};

/**
 * Everything a player currently pays for, with what it cost them.
 *
 * Used by the interface and by the greedy bot, which needs to know what it is
 * about to stop defending.
 */
export const holdings = (
  state: GameState,
  playerKey: string,
): Array<{ partyKey: string; seats: number; spent: number }> => {
  const allocation = state.commitments[playerKey] ?? {};
  return Object.values(state.parties)
    .filter((party) => party.heldBy === playerKey)
    .map((party) => ({
      partyKey: party.key,
      seats: party.seats,
      spent: bidValue(state, allocation, party.key),
    }));
};
