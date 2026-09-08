/**
 * The bargaining maths: what a party is worth, what it costs, and what it takes.
 *
 * Every number a party reacts to is returned as a breakdown, so the interface
 * can always explain *why* a deal was refused instead of just saying no.
 */

import { hasVetoConflict, viableCoalitions } from "./generator";
import type { Evaluation, GameState, Offer, Party } from "./types";
import { clamp, coalitionSeats, daysLeft, ideologyDistance, optionLabel, portfoliosOf } from "./types";

/** How much more a ministry is worth when it sits high on a party's wish list. */
const WANT_BONUS = [1.9, 1.55, 1.3, 1.15];

/**
 * A policy commitment within this many points of a party's own position reads
 * as a win for them; beyond it, as a betrayal.
 */
export const POLICY_TOLERANCE = 6;

export const wantMultiplier = (party: Party, portfolioKey: string): number => {
  const rank = party.portfolioWants.indexOf(portfolioKey);
  if (rank < 0) return 1;
  return WANT_BONUS[Math.min(rank, WANT_BONUS.length - 1)];
};

/** Spoils are worth more to a pragmatist, and more when they were asked for. */
export const portfolioValue = (
  state: GameState,
  party: Party,
  portfolioKeys: readonly string[],
): number => {
  let raw = 0;
  for (const key of portfolioKeys) {
    const portfolio = state.parliament.portfolios[key];
    if (!portfolio) continue;
    raw += portfolio.prestige * wantMultiplier(party, key);
  }
  return raw * (0.35 + 0.55 * party.pragmatism);
};

/** Policy cuts both ways: close to their line it pays, far from it it hurts. */
export const policyValue = (
  state: GameState,
  party: Party,
  commitments: Record<string, number>,
): number => {
  let total = 0;
  for (const [issueKey, position] of Object.entries(commitments)) {
    const issue = state.parliament.issues[issueKey];
    if (!issue) continue;
    const delta = Math.abs(party.ideology[issue.axis] - position);
    const salience = party.issueSalience[issueKey] ?? 0.5;
    total += salience * (POLICY_TOLERANCE - delta) * 0.45;
  }
  return total * (1.7 - party.pragmatism);
};

/** The cost of the company a party would be keeping. */
export const partnerFriction = (
  state: GameState,
  party: Party,
  members: readonly string[],
): number => {
  let total = 0;
  for (const key of members) {
    if (key === party.key) continue;
    const other = state.parliament.parties[key];
    total += ideologyDistance(party.ideology, other.ideology) * 13 * (1.25 - party.pragmatism);
  }
  return total;
};

/** Majority combinations still reachable from the coalition as it stands. */
export const openRoutes = (state: GameState): string[][] => {
  const current = state.coalition.members;
  return viableCoalitions(state.parliament, state.playerKey).filter((route) =>
    current.every((key) => route.includes(key)),
  );
};

/**
 * The fraction of the player's remaining routes to a majority that need this
 * party.
 *
 * This is the leverage dial, and the reason courting a party's rivals works:
 * every alternative route you open lowers their price without a word being
 * said to them.
 */
export const pivotShare = (state: GameState, partyKey: string): number => {
  const routes = openRoutes(state);
  if (routes.length === 0) return 1;
  return routes.filter((route) => route.includes(partyKey)).length / routes.length;
};

/** What this party thinks it is worth today. */
export const askingPrice = (state: GameState, party: Party): number => {
  const leverage = party.seats / Math.max(1, state.parliament.majority);
  let price = party.ambition * (10 + 62 * leverage);
  price *= 0.8 + 0.5 * pivotShare(state, party.key);
  price *= party.priceModifier;
  // Nobody wants to explain a failed mandate to their voters; prices soften as
  // the clock runs down.
  price *= 0.72 + 0.28 * (daysLeft(state) / Math.max(1, state.daysTotal));
  price -= party.mood * 0.35;
  return Math.max(4, price);
};

/** Score a package from the point of view of the party being offered it. */
export const evaluate = (
  state: GameState,
  offer: Offer,
  prospectiveMembers?: readonly string[],
): Evaluation => {
  const party = state.parliament.parties[offer.partyKey];
  const members = [...(prospectiveMembers ?? state.coalition.members)];
  if (!members.includes(party.key)) members.push(party.key);

  const commitments = { ...state.coalition.commitments, ...offer.commitments };

  const evaluation: Evaluation = {
    partyKey: party.key,
    portfolioValue: portfolioValue(state, party, offer.portfolios),
    policyValue: policyValue(state, party, commitments),
    partnerFriction: partnerFriction(state, party, members),
    goodwill: party.mood * 0.4,
    price: askingPrice(state, party),
    vetoedBy: members.filter((key) => key !== party.key && party.vetoes.includes(key)),
    complaints: [],
    satisfaction: 0,
    margin: 0,
    accepted: false,
  };

  evaluation.satisfaction =
    evaluation.portfolioValue +
    evaluation.policyValue -
    evaluation.partnerFriction +
    evaluation.goodwill;
  evaluation.margin = evaluation.satisfaction - evaluation.price;
  evaluation.accepted = evaluation.vetoedBy.length === 0 && evaluation.margin >= 0;

  addComplaints(state, party, offer, evaluation, members, commitments);
  return evaluation;
};

/** Turn the numbers into the sentence a negotiator would actually say. */
const addComplaints = (
  state: GameState,
  party: Party,
  offer: Offer,
  evaluation: Evaluation,
  members: readonly string[],
  commitments: Record<string, number>,
): void => {
  const { parliament } = state;

  for (const key of evaluation.vetoedBy) {
    evaluation.complaints.push(
      `We will not sit at a table with the ${parliament.parties[key].name}. That is final.`,
    );
  }
  if (evaluation.vetoedBy.length > 0) return;

  // Which unmet demand would close the gap fastest?
  if (evaluation.margin < 0) {
    const unmet = party.portfolioWants.filter((key) => !offer.portfolios.includes(key));
    const stillFree = unmet.filter((key) => {
      const holder = state.coalition.portfolios[key];
      return holder === undefined || holder === party.key;
    });
    if (stillFree.length > 0) {
      evaluation.complaints.push(
        `We came here for ${parliament.portfolios[stillFree[0]].name}, and you are sending us home without it.`,
      );
    } else if (unmet.length > 0) {
      const holder = state.coalition.portfolios[unmet[0]];
      const holderName = holder ? parliament.parties[holder].name : "somebody else";
      evaluation.complaints.push(
        `You have already promised ${parliament.portfolios[unmet[0]].name} to the ${holderName}.`,
      );
    } else {
      evaluation.complaints.push("The offer on the table is simply too thin.");
    }
  }

  // The policy commitment that hurts them most.
  let worst: { pain: number; issueKey: string } | null = null;
  for (const [issueKey, position] of Object.entries(commitments)) {
    const issue = parliament.issues[issueKey];
    if (!issue) continue;
    const delta = Math.abs(party.ideology[issue.axis] - position);
    const pain = (party.issueSalience[issueKey] ?? 0.5) * (delta - POLICY_TOLERANCE);
    if (pain > 2 && (worst === null || pain > worst.pain)) worst = { pain, issueKey };
  }
  if (worst) {
    const issue = parliament.issues[worst.issueKey];
    evaluation.complaints.push(
      `Our voters will never forgive us for "${optionLabel(issue, commitments[worst.issueKey])}" on ${issue.name.toLowerCase()}.`,
    );
  }

  // The partner they can least stomach.
  if (members.length > 2) {
    let furthest: { distance: number; key: string } | null = null;
    for (const key of members) {
      if (key === party.key) continue;
      const distance = ideologyDistance(party.ideology, parliament.parties[key].ideology);
      if (furthest === null || distance > furthest.distance) furthest = { distance, key };
    }
    if (furthest && furthest.distance > 0.5) {
      evaluation.complaints.push(
        `Sitting alongside the ${parliament.parties[furthest.key].name} costs us more than the ministries are worth.`,
      );
    }
  }
};

/**
 * A qualitative read on an offer, shown instead of raw numbers.
 *
 * The player only gets this once they have actually met the party; probing
 * blind is part of the cost of doing business.
 */
export type Temperature = "insulted" | "cold" | "tempted" | "ready" | "eager";

export const temperature = (evaluation: Evaluation): Temperature => {
  if (evaluation.vetoedBy.length > 0) return "insulted";
  const ratio = evaluation.margin / Math.max(8, evaluation.price);
  if (ratio < -0.5) return "insulted";
  if (ratio < -0.12) return "cold";
  if (ratio < 0) return "tempted";
  if (ratio < 0.35) return "ready";
  return "eager";
};

export const TEMPERATURE_TEXT: Record<Temperature, string> = {
  insulted: "They are insulted. This is not a serious proposal.",
  cold: "Cold. Their delegation is looking at the door.",
  tempted: "Tempted, but not there yet. A little more would do it.",
  ready: "They are ready to sign this.",
  eager: "They would bite your hand off. You may be paying too much.",
};

// ---------------------------------------------------------------------------
// The player's own party
// ---------------------------------------------------------------------------

/** What the deal being cut in their name costs the player inside their party. */
export const betrayalCost = (state: GameState): number => {
  const player = state.parliament.parties[state.playerKey];
  let cost = 0;

  for (const [issueKey, position] of Object.entries(state.coalition.commitments)) {
    const issue = state.parliament.issues[issueKey];
    if (!issue) continue;
    const delta = Math.abs(player.ideology[issue.axis] - position);
    cost += Math.max(0, delta - 5) * (player.issueSalience[issueKey] ?? 0.5) * 0.55;
  }

  for (const [portfolioKey, holder] of Object.entries(state.coalition.portfolios)) {
    if (holder === state.playerKey) continue;
    const portfolio = state.parliament.portfolios[portfolioKey];
    cost += portfolio.prestige >= 8 ? portfolio.prestige * 0.75 : portfolio.prestige * 0.2;
  }

  for (const key of state.coalition.members) {
    if (key === state.playerKey) continue;
    cost += ideologyDistance(player.ideology, state.parliament.parties[key].ideology) * 10;
  }

  return cost;
};

/** How the player's own party feels, 0 - 100. Hit zero and they replace you. */
export const baseLoyalty = (state: GameState): number =>
  clamp(100 - betrayalCost(state) + state.baseModifier, 0, 100);

// ---------------------------------------------------------------------------
// Sealing the deal
// ---------------------------------------------------------------------------

/** Re-run every partner's arithmetic against the deal as it stands today. */
export const coalitionCheck = (state: GameState): Record<string, Evaluation> => {
  const results: Record<string, Evaluation> = {};
  for (const key of state.coalition.members) {
    if (key === state.playerKey) continue;
    results[key] = evaluate(state, {
      partyKey: key,
      portfolios: portfoliosOf(state.coalition, key),
      commitments: {},
    });
  }
  return results;
};

/** A 0-100 guess at whether this government survives contact with reality. */
export const stabilityScore = (state: GameState): number => {
  const checks = Object.values(coalitionCheck(state));
  if (checks.length === 0) return 0;

  const thinnest = Math.min(...checks.map((check) => check.margin));
  const average = checks.reduce((sum, check) => sum + check.margin, 0) / checks.length;

  const members = state.coalition.members.map((key) => state.parliament.parties[key]);
  let cohesion = 0;
  let pairs = 0;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      cohesion += ideologyDistance(members[i].ideology, members[j].ideology);
      pairs += 1;
    }
  }
  cohesion = pairs > 0 ? cohesion / pairs : 0;

  const surplus = coalitionSeats(state) - state.parliament.majority;

  let score = 45;
  score += clamp(thinnest, -25, 18) * 1.1;
  score += clamp(average, -10, 20) * 0.5;
  score -= cohesion * 45;
  score += clamp(surplus, 0, 12) * 1.2;
  score += (baseLoyalty(state) - 55) * 0.35;
  return clamp(score, 0, 100);
};

/** Flavour: how long the press gives this government. */
export const expectedMonths = (state: GameState): number =>
  Math.round(4 + stabilityScore(state) * 0.44);

/** Whether the agreement would actually hold together at the signing table. */
export const signingProblems = (state: GameState): string[] => {
  const problems: string[] = [];
  const seats = coalitionSeats(state);
  if (seats < state.parliament.majority) {
    problems.push(`You have ${seats} seats. You need ${state.parliament.majority}.`);
  }
  if (hasVetoConflict(state.parliament, state.coalition.members)) {
    problems.push("Two of your partners have sworn never to sit together.");
  }
  for (const [key, evaluation] of Object.entries(coalitionCheck(state))) {
    if (!evaluation.accepted) {
      problems.push(`The ${state.parliament.parties[key].name} would walk out before the signing.`);
    }
  }
  if (baseLoyalty(state) < 20) {
    problems.push("Your own party would refuse to ratify this agreement.");
  }
  return problems;
};

export const canSign = (state: GameState): boolean => signingProblems(state).length === 0;
