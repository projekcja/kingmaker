/**
 * The turn loop: the moves a formateur can make, and what each one costs.
 *
 * Every action returns a brand-new state, so the UI can keep history and the
 * tests can drive a whole game without touching the DOM.
 */

import { runOvernightEvent } from "./events";
import { Rng } from "./rng";
import {
  baseLoyalty,
  coalitionCheck,
  evaluate,
  expectedMonths,
  signingProblems,
  stabilityScore,
} from "./negotiation";
import type { Evaluation, GameState, LogEntry, Offer } from "./types";
import { clamp, coalitionSeats, ideologyDistance, optionLabel, portfoliosOf } from "./types";

export type Action =
  /** Sit down with a party: reveals their demands, warms them slightly. */
  | { type: "meet"; partyKey: string }
  /** Put a package on the table. The main move of the game. */
  | { type: "offer"; offer: Offer }
  /** Write a position into the coalition agreement, in public. */
  | { type: "commit"; issueKey: string; position: number }
  /** Publicly squeeze a party to bring their price down. Risky. */
  | { type: "squeeze"; partyKey: string }
  /** Shore up your standing inside your own party. */
  | { type: "rally" }
  /** Throw a partner out and reclaim their ministries. Costs no time. */
  | { type: "dismiss"; partyKey: string }
  /** Take the agreement to the president. Ends the game. */
  | { type: "sign" };

export interface ActionResult {
  state: GameState;
  /** What to show the player about the move they just made. */
  message: string;
  /** Present for offers, so the UI can show the party's reasoning. */
  evaluation?: Evaluation;
  /** Anything that happened overnight. */
  events: LogEntry[];
}

const cloneState = (state: GameState): GameState =>
  typeof structuredClone === "function"
    ? structuredClone(state)
    : (JSON.parse(JSON.stringify(state)) as GameState);

const log = (state: GameState, kind: LogEntry["kind"], text: string): void => {
  state.log.push({ day: state.day, kind, text });
};

/**
 * Days an action costs. Hammering out a full package takes longer than a
 * courtesy call; throwing a partner out is brutal but instant.
 */
export const actionCost = (action: Action): number => {
  switch (action.type) {
    case "dismiss":
    case "sign":
      return 0;
    case "offer":
      return 2;
    default:
      return 1;
  }
};

export const isLegal = (state: GameState, action: Action): boolean => {
  if (state.finished) return false;
  switch (action.type) {
    case "meet":
    case "squeeze":
      return action.partyKey !== state.playerKey;
    case "dismiss":
      return state.coalition.members.includes(action.partyKey) && action.partyKey !== state.playerKey;
    case "offer":
      if (action.offer.partyKey === state.playerKey) return false;
      // You cannot promise a ministry you have already given away.
      return action.offer.portfolios.every((key) => {
        const holder = state.coalition.portfolios[key];
        return holder === undefined || holder === action.offer.partyKey;
      });
    default:
      return true;
  }
};

export const applyAction = (input: GameState, action: Action): ActionResult => {
  const state = cloneState(input);
  const rng = new Rng(state.rngState);
  let message = "";
  let evaluation: Evaluation | undefined;

  switch (action.type) {
    case "meet":
      message = doMeet(state, action.partyKey, rng);
      break;
    case "offer": {
      const result = doOffer(state, action.offer, rng);
      message = result.message;
      evaluation = result.evaluation;
      break;
    }
    case "commit":
      message = doCommit(state, action.issueKey, action.position);
      break;
    case "squeeze":
      message = doSqueeze(state, action.partyKey, rng);
      break;
    case "rally":
      message = doRally(state, rng);
      break;
    case "dismiss":
      message = doDismiss(state, action.partyKey);
      break;
    case "sign":
      message = doSign(state);
      break;
  }

  const events: LogEntry[] = [];
  const cost = actionCost(action);
  if (cost > 0 && !state.finished) {
    // A two-day negotiation begun on the last day still resolves, but the
    // mandate itself cannot run past its final day.
    state.day = Math.min(state.day + cost, state.daysTotal + 1);
    const event = runOvernightEvent(state, rng);
    if (event) {
      state.log.push(event);
      events.push(event);
    }
    checkEndOfMandate(state);
  }

  state.rngState = rng.state;
  return { state, message, evaluation, events };
};

// ---------------------------------------------------------------------------
// Individual moves
// ---------------------------------------------------------------------------

const doMeet = (state: GameState, partyKey: string, rng: Rng): string => {
  const party = state.parliament.parties[partyKey];
  const first = !party.revealed;
  party.revealed = true;
  party.mood = clamp(party.mood + rng.range(2, 5), -50, 50);
  log(state, "info", `You meet ${party.leader} of the ${party.name}.`);
  return first
    ? `${party.leader} lays out what the ${party.name} would need. Their demands are now on your desk.`
    : `A second conversation with ${party.leader}. Warmer, but nothing new.`;
};

const doOffer = (
  state: GameState,
  offer: Offer,
  rng: Rng,
): { message: string; evaluation: Evaluation } => {
  const party = state.parliament.parties[offer.partyKey];
  const evaluation = evaluate(state, offer);

  if (evaluation.accepted) {
    if (!state.coalition.members.includes(party.key)) state.coalition.members.push(party.key);

    // Ministries in the package move to them; anything they held and is no
    // longer in the package goes back into the pool.
    for (const key of portfoliosOf(state.coalition, party.key)) {
      if (!offer.portfolios.includes(key)) delete state.coalition.portfolios[key];
    }
    for (const key of offer.portfolios) state.coalition.portfolios[key] = party.key;

    Object.assign(state.coalition.commitments, offer.commitments);
    party.mood = clamp(party.mood + 4, -50, 50);

    log(
      state,
      "deal",
      `The ${party.name} (${party.seats} seats) joins the coalition. Total: ${coalitionSeats(state)} of ${state.parliament.majority} needed.`,
    );
    applyCommitmentMood(state, offer.commitments);
    return {
      message: `${party.leader} shakes your hand. The ${party.name} is in.`,
      evaluation,
    };
  }

  // A serious lowball is remembered.
  const insult = evaluation.margin < -evaluation.price * 0.5;
  party.mood = clamp(party.mood - (insult ? rng.range(4, 8) : rng.range(1, 3)), -50, 50);
  log(state, "info", `The ${party.name} rejects your offer.`);
  return {
    message: evaluation.complaints[0] ?? `${party.leader} declines, without explaining why.`,
    evaluation,
  };
};

const doCommit = (state: GameState, issueKey: string, position: number): string => {
  const issue = state.parliament.issues[issueKey];
  state.coalition.commitments[issueKey] = position;
  applyCommitmentMood(state, { [issueKey]: position });
  const label = optionLabel(issue, position);
  log(state, "press", `You commit the coalition agreement to "${label}" on ${issue.name.toLowerCase()}.`);
  return `It is in the agreement now, and on every front page: ${issue.name.toLowerCase()} — ${label}.`;
};

/** Public positions move everyone: allies warm, opponents cool. */
const applyCommitmentMood = (state: GameState, commitments: Record<string, number>): void => {
  for (const [issueKey, position] of Object.entries(commitments)) {
    const issue = state.parliament.issues[issueKey];
    if (!issue) continue;
    for (const party of Object.values(state.parliament.parties)) {
      if (party.key === state.playerKey) continue;
      const delta = Math.abs(party.ideology[issue.axis] - position);
      const salience = party.issueSalience[issueKey] ?? 0.5;
      party.mood = clamp(party.mood + salience * (6 - delta) * 0.25, -50, 50);
    }
  }
};

const doSqueeze = (state: GameState, partyKey: string, rng: Rng): string => {
  const party = state.parliament.parties[partyKey];
  // Pressure works on parties that need the government more than it needs them.
  const exposure = clamp(0.35 + (12 - party.seats) * 0.03 + party.mood * 0.004, 0.15, 0.75);

  if (rng.chance(exposure)) {
    party.priceModifier = Number(Math.max(0.5, party.priceModifier * rng.range(0.76, 0.88)).toFixed(3));
    party.mood = clamp(party.mood - rng.range(2, 5), -50, 50);
    log(state, "press", `You go public against the ${party.name}. Their demands look greedy in print.`);
    return `It lands. The ${party.name} spends the day explaining itself, and quietly trims its price.`;
  }

  party.mood = clamp(party.mood - rng.range(7, 13), -50, 50);
  party.priceModifier = Number(Math.min(1.9, party.priceModifier * rng.range(1.05, 1.15)).toFixed(3));
  log(state, "trouble", `Your attack on the ${party.name} backfires.`);
  return `${party.leader} was waiting for that. The ${party.name} plays the victim all evening, and raises its price.`;
};

const doRally = (state: GameState, rng: Rng): string => {
  const player = state.parliament.parties[state.playerKey];
  state.baseModifier += rng.range(6, 11);
  for (const key of state.coalition.members) {
    if (key === state.playerKey) continue;
    state.parliament.parties[key].mood = clamp(
      state.parliament.parties[key].mood - rng.range(1, 3),
      -50,
      50,
    );
  }
  log(state, "info", `You spend the day with the ${player.name} faithful.`);
  return "Your own people are steadied. Your partners noticed the speech, and did not love it.";
};

const doDismiss = (state: GameState, partyKey: string): string => {
  const party = state.parliament.parties[partyKey];
  state.coalition.members = state.coalition.members.filter((key) => key !== partyKey);
  for (const key of portfoliosOf(state.coalition, partyKey)) delete state.coalition.portfolios[key];
  party.mood = clamp(party.mood - 15, -50, 50);
  party.priceModifier = Number(Math.min(1.9, party.priceModifier * 1.1).toFixed(3));
  log(state, "trouble", `You break off talks with the ${party.name}. Their ministries return to the pool.`);
  return `${party.leader} leaves without a handshake. You will not get that offer back cheaply.`;
};

const doSign = (state: GameState): string => {
  const problems = signingProblems(state);
  if (problems.length > 0) {
    return `You cannot present this to the president. ${problems[0]}`;
  }

  state.finished = true;
  state.outcome = "government";
  const months = expectedMonths(state);
  const stability = Math.round(stabilityScore(state));
  const player = state.parliament.parties[state.playerKey];

  log(state, "deal", `The coalition agreement is signed. ${coalitionSeats(state)} seats.`);
  state.epilogue =
    `${player.leader} is sworn in at the head of a ${coalitionSeats(state)}-seat coalition. ` +
    `Cohesion rates it at ${stability}/100; the press gives it ${months} months.`;
  return "It is done. You have a government.";
};

// ---------------------------------------------------------------------------
// End of the mandate
// ---------------------------------------------------------------------------

const checkEndOfMandate = (state: GameState): void => {
  if (state.finished) return;

  if (baseLoyalty(state) <= 0) {
    state.finished = true;
    state.outcome = "deposed";
    const player = state.parliament.parties[state.playerKey];
    log(state, "trouble", `The ${player.name} removes you as leader.`);
    state.epilogue =
      `Your own party got there before the voters did. The ${player.name} central committee ` +
      "votes you out, and hands the mandate to somebody with fewer promises to keep.";
    return;
  }

  // A partner whose price has risen past what they were given walks out.
  for (const [key, evaluation] of Object.entries(coalitionCheck(state))) {
    if (evaluation.accepted) continue;
    const party = state.parliament.parties[key];
    state.coalition.members = state.coalition.members.filter((member) => member !== key);
    for (const portfolioKey of portfoliosOf(state.coalition, key)) {
      delete state.coalition.portfolios[portfolioKey];
    }
    log(
      state,
      "trouble",
      `The ${party.name} walks out of the coalition: ${evaluation.complaints[0] ?? "the deal no longer suits them."}`,
    );
  }

  if (state.day > state.daysTotal) {
    state.finished = true;
    state.outcome = "expired";
    state.epilogue =
      `The mandate expires with ${coalitionSeats(state)} seats behind you, ` +
      `${state.parliament.majority} required. The country goes back to the polls, ` +
      "and the next parliament will look much like this one.";
  }
};

// ---------------------------------------------------------------------------
// Hints for the interface
// ---------------------------------------------------------------------------

/** The ideologically closest parties the player has not yet brought in. */
export const suggestedTargets = (state: GameState): string[] => {
  const player = state.parliament.parties[state.playerKey];
  return Object.values(state.parliament.parties)
    .filter(
      (party) =>
        party.key !== state.playerKey &&
        !state.coalition.members.includes(party.key) &&
        !party.vetoes.some((veto) => state.coalition.members.includes(veto)),
    )
    .sort(
      (a, b) =>
        ideologyDistance(player.ideology, a.ideology) - ideologyDistance(player.ideology, b.ideology),
    )
    .map((party) => party.key);
};
