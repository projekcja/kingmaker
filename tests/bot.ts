/**
 * A headless greedy formateur.
 *
 * Used by the tests to play thousands of full games: it proves the rules
 * terminate, never throw, and leave a scenario that a competent player can
 * actually win.
 */

import { applyAction, isLegal, suggestedTargets } from "../src/engine/actions";
import type { Action } from "../src/engine/actions";
import { baseLoyalty, canSign, evaluate } from "../src/engine/negotiation";
import type { GameState, Offer } from "../src/engine/types";
import { coalitionSeats, portfoliosOf } from "../src/engine/types";

/** Cheapest package that this party would actually sign, or null. */
export const cheapestAcceptableOffer = (state: GameState, partyKey: string): Offer | null => {
  const party = state.parliament.parties[partyKey];
  const held = portfoliosOf(state.coalition, partyKey);

  const available = Object.values(state.parliament.portfolios)
    .filter((portfolio) => {
      const holder = state.coalition.portfolios[portfolio.key];
      return holder === undefined || holder === partyKey;
    })
    // Hand over what they asked for first, and cheap things before dear ones.
    .sort((a, b) => {
      const rankA = party.portfolioWants.indexOf(a.key);
      const rankB = party.portfolioWants.indexOf(b.key);
      if (rankA !== rankB) return (rankA < 0 ? 99 : rankA) - (rankB < 0 ? 99 : rankB);
      return a.prestige - b.prestige;
    })
    .map((portfolio) => portfolio.key);

  const offer: Offer = { partyKey, portfolios: [...held], commitments: {} };
  if (evaluate(state, offer).accepted) return offer;

  // Policy is the cheaper currency: promise the uncommitted issues this party
  // cares most about, at the position closest to its own line.
  const openIssues = Object.values(state.parliament.issues)
    .filter((issue) => state.coalition.commitments[issue.key] === undefined)
    .sort((a, b) => (party.issueSalience[b.key] ?? 0) - (party.issueSalience[a.key] ?? 0));

  for (const issue of openIssues) {
    let best = issue.options[0];
    for (const option of issue.options) {
      const target = party.ideology[issue.axis];
      if (Math.abs(option.position - target) < Math.abs(best.position - target)) best = option;
    }
    offer.commitments[issue.key] = best.position;
    if (evaluate(state, offer).accepted) return offer;
  }

  for (const key of available) {
    if (offer.portfolios.includes(key)) continue;
    offer.portfolios.push(key);
    if (evaluate(state, offer).accepted) return offer;
  }
  return null;
};

/** One move of greedy play: sign if possible, else buy the best-value partner. */
export const chooseAction = (state: GameState): Action => {
  if (canSign(state)) return { type: "sign" };

  const targets = suggestedTargets(state).filter(
    (key) => !state.coalition.members.includes(key),
  );

  let best: { action: Action; value: number } | null = null;
  for (const key of targets) {
    const offer = cheapestAcceptableOffer(state, key);
    if (!offer) continue;
    const cost = offer.portfolios.reduce(
      (sum, portfolioKey) => sum + state.parliament.portfolios[portfolioKey].prestige,
      0,
    );
    const seats = state.parliament.parties[key].seats;
    const value = seats / Math.max(1, cost);
    if (!best || value > best.value) best = { action: { type: "offer", offer }, value };
  }
  if (best) return best.action;

  // Nothing is affordable today: gather information, or lean on somebody.
  const unrevealed = targets.find((key) => !state.parliament.parties[key].revealed);
  if (unrevealed) return { type: "meet", partyKey: unrevealed };

  if (baseLoyalty(state) < 35) return { type: "rally" };

  const priciest = targets
    .map((key) => state.parliament.parties[key])
    .sort((a, b) => b.priceModifier * b.seats - a.priceModifier * a.seats)[0];
  if (priciest) return { type: "squeeze", partyKey: priciest.key };

  return { type: "rally" };
};

export interface PlayResult {
  state: GameState;
  turns: number;
  won: boolean;
}

/** Play a game to its end. Throws only if the engine itself misbehaves. */
export const playOut = (start: GameState, maxTurns = 400): PlayResult => {
  let state = start;
  let turns = 0;

  while (!state.finished && turns < maxTurns) {
    turns += 1;
    const action = chooseAction(state);
    if (!isLegal(state, action)) {
      // The bot proposed something the rules forbid; burn a day rather than spin.
      state = applyAction(state, { type: "rally" }).state;
      continue;
    }
    const before = state;
    state = applyAction(state, action).state;

    // Signing is a no-op when the deal is not ready; never loop on it forever.
    if (action.type === "sign" && !state.finished && state.day === before.day) {
      state = applyAction(state, { type: "rally" }).state;
    }
  }

  return {
    state,
    turns,
    won: state.outcome === "government" && coalitionSeats(state) >= state.parliament.majority,
  };
};
