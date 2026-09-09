/**
 * The bidding round.
 *
 * Each player sits down with at most three parties a turn, and puts as many of
 * their free ministries in front of each as they care to. That restriction is
 * what makes the negotiation a negotiation: money is plentiful, turns are not,
 * and a coalition has to be assembled a few partners at a time while rivals do
 * the same.
 *
 * Ministries stay locked with a party for as long as it stays bought, so every
 * partner you add leaves you less to buy the next one with. The only way to
 * move a portfolio is to withdraw it, which costs you the party it was holding.
 *
 * Nothing here reads a party's politics. Red lines are consulted, but those are
 * concrete party-to-party facts written by the deck, not inferences from
 * ideology, so the auction stays blind to it.
 */

import type { GameState, Offer, PartyResult, Withdrawal } from "./types";
import {
  OFFERS_PER_TURN,
  bidFor,
  biddableParties,
  blocSeats,
  freeMinistries,
  isLedByPlayer,
  offeredMinistries,
  packageValue,
  refusalsAgainst,
  valueOf,
} from "./types";

const playerIndex = (state: GameState, playerKey: string): number =>
  state.players.findIndex((player) => player.key === playerKey);

export interface OfferProblem {
  code:
    | "unknown-ministry"
    | "unknown-party"
    | "own-party"
    | "led-party"
    | "not-in-hand"
    | "not-yours"
    | "withdraw-target"
    | "too-many"
    | "duplicate"
    | "empty";
  message: string;
}

/** Everything this player could put on the table this turn. */
export const availableMinistries = (state: GameState, playerKey: string, offer: Offer): string[] => {
  const freed = offer.withdrawFrom.flatMap((partyKey) =>
    state.parties[partyKey]?.heldBy === playerKey ? state.parties[partyKey].package : [],
  );
  return [...freeMinistries(state, playerKey), ...freed];
};

/**
 * Check an offer before it is sealed.
 *
 * Ministries have to be in hand — or freed this turn by walking away from a
 * party — and the target has to be a party that is actually for sale.
 */
export const validateOffer = (
  state: GameState,
  playerKey: string,
  offer: Offer,
): OfferProblem[] => {
  const problems: OfferProblem[] = [];
  const player = state.players.find((candidate) => candidate.key === playerKey);

  for (const partyKey of offer.withdrawFrom) {
    if (state.parties[partyKey]?.heldBy !== playerKey) {
      problems.push({
        code: "not-yours",
        message: "You cannot withdraw from a party you do not hold.",
      });
    }
    if (offer.bids.some((bid) => bid.partyKey === partyKey)) {
      problems.push({
        code: "withdraw-target",
        message: "Walking out on a party and courting it in the same breath is not a move.",
      });
    }
  }

  if (offer.bids.length > OFFERS_PER_TURN) {
    problems.push({
      code: "too-many",
      message: `You can only sit down with ${OFFERS_PER_TURN} parties a week.`,
    });
  }

  const seen = new Set<string>();
  for (const bid of offer.bids) {
    if (seen.has(bid.partyKey)) {
      problems.push({ code: "duplicate", message: "One offer per party, please." });
    }
    seen.add(bid.partyKey);

    const party = state.parties[bid.partyKey];
    if (!party) {
      problems.push({ code: "unknown-party", message: "There is no such party." });
      continue;
    }
    if (player && bid.partyKey === player.partyKey) {
      problems.push({ code: "own-party", message: "You cannot bid for your own party." });
    } else if (isLedByPlayer(state, bid.partyKey)) {
      problems.push({
        code: "led-party",
        message: `The ${party.name} is led by a rival and is not for sale.`,
      });
    }
    if (bid.ministries.length === 0 && party.heldBy !== playerKey) {
      problems.push({ code: "empty", message: "An offer of nothing at all is not an offer." });
    }
  }

  // A portfolio can only be promised to one party, and only if it is in hand.
  const available = new Set(availableMinistries(state, playerKey, offer));
  const used = new Set<string>();
  for (const key of offeredMinistries(offer)) {
    if (!state.ministries.some((ministry) => ministry.key === key)) {
      problems.push({ code: "unknown-ministry", message: `There is no ${key} ministry.` });
      continue;
    }
    if (used.has(key)) {
      problems.push({
        code: "duplicate",
        message: "The same portfolio cannot be promised twice.",
      });
    }
    used.add(key);
    if (!available.has(key)) {
      problems.push({
        code: "not-in-hand",
        message: "That portfolio is already promised elsewhere.",
      });
    }
  }

  return problems;
};

export const isValidOffer = (state: GameState, playerKey: string, offer: Offer): boolean =>
  validateOffer(state, playerKey, offer).length === 0;

/**
 * Hand back everything locked with the parties a player is walking away from.
 *
 * Returns what was given up rather than only which parties, because walking out
 * is a move like any other and the reveal has to be able to show it.
 */
export const applyWithdrawals = (state: GameState): Withdrawal[] => {
  const withdrawals: Withdrawal[] = [];
  for (const [playerKey, offer] of Object.entries(state.offers)) {
    for (const partyKey of offer.withdrawFrom) {
      const party = state.parties[partyKey];
      if (!party || party.heldBy !== playerKey) continue;
      withdrawals.push({ playerKey, partyKey, ministries: [...party.package] });
      party.heldBy = null;
      party.package = [];
    }
  }
  return withdrawals;
};

/**
 * Work out where every courted party lands.
 *
 * A party weighs what it is being offered against what it is already getting.
 * The holder's own top-up stacks on the package it has already paid, so
 * defending is cheaper than capturing — as is the tie rule, which lets an
 * incumbent hold by matching rather than beating.
 *
 * Where nobody holds the party, a tie goes to the bidder with the most mandates
 * already behind them: a seat in the government most likely to actually form is
 * worth more than the same seat in one that never will.
 */
export const resolveRound = (state: GameState): PartyResult[] => {
  const results: PartyResult[] = [];

  for (const party of biddableParties(state)) {
    const bids: Record<string, number> = {};
    const offered: Record<string, string[]> = {};
    const blocked: string[] = [];
    let courted = false;

    for (const player of state.players) {
      const offer = state.offers[player.key];
      const bid = offer ? bidFor(offer, party.key) : undefined;
      if (!bid) continue;
      courted = true;
      const fresh = valueOf(state, bid.ministries);
      offered[player.key] = [...bid.ministries];
      // The holder's new portfolios stack on what it is already paying.
      bids[player.key] = party.heldBy === player.key ? packageValue(state, party.key) + fresh : fresh;
    }

    // The incumbent is always in the running, even on a turn it does nothing.
    if (party.heldBy && bids[party.heldBy] === undefined) {
      bids[party.heldBy] = packageValue(state, party.key);
    }

    if (!courted) {
      results.push({
        partyKey: party.key,
        seats: party.seats,
        bids: {},
        offered: {},
        previousHolder: party.heldBy,
        newHolder: party.heldBy,
        blocked: [],
      });
      continue;
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
        winner = party.heldBy;
      } else {
        winner = [...tied].sort((a, b) => {
          const byBloc = blocSeats(state, b) - blocSeats(state, a);
          if (byBloc !== 0) return byBloc;
          return playerIndex(state, a) - playerIndex(state, b);
        })[0];
      }
    }

    results.push({
      partyKey: party.key,
      seats: party.seats,
      bids,
      offered,
      previousHolder: party.heldBy,
      newHolder: winner,
      blocked,
    });
  }

  return results;
};

/**
 * Write a resolved round onto the board.
 *
 * Only a successful offer costs anything: ministries put behind a bid that
 * lost go straight back into their owner's hand.
 */
export const applyRound = (state: GameState, results: PartyResult[]): void => {
  for (const result of results) {
    const party = state.parties[result.partyKey];
    if (!party) continue;

    const winner = result.newHolder;
    if (winner === null) {
      party.heldBy = null;
      party.package = [];
      continue;
    }

    const offer = state.offers[winner];
    const winnersOffer = offer ? (bidFor(offer, result.partyKey)?.ministries ?? []) : [];

    if (winner === result.previousHolder) {
      // Held it. Any top-up joins the package already in place.
      party.package = [...new Set([...party.package, ...winnersOffer])];
    } else {
      // Taken. The old holder's portfolios go home; the new package is the bid.
      party.heldBy = winner;
      party.package = [...winnersOffer];
    }
  }
};
