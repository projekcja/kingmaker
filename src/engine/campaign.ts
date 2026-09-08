/**
 * The campaign: setting one up, and running its turns.
 *
 * A turn is the same shape in both phases — everybody commits a spread of
 * ministries, the parties pick the best offer, then each player draws a card.
 * What changes is the clock (a week while forming, a year while governing) and
 * what the board does with the result.
 *
 * Bot commitments are computed from the state and the seeded RNG rather than
 * stored, so the action log only ever holds the moves people actually made and
 * a whole campaign still replays exactly.
 */

import { offerFor } from "../bots";
import { applyRound, applyWithdrawals, resolveRound } from "./allocation";
import { drawCard, expireRefusals } from "./deck";
import { MINISTRIES } from "./ministries";
import { ELECTORAL_THRESHOLD, MAJORITY, PARTY_PROFILES, TOTAL_SEATS } from "./parties";
import { Rng } from "./rng";
import type { GameState, Offer, Party, PlayerKind, TurnResult } from "./types";
import {
  FORMING_DEADLINE,
  YEARS_TO_WIN,
  blocSeats,
  isLedByPlayer,
  packageValue,
  playerOf,
  valueOf,
} from "./types";

export interface CampaignOptions {
  seed?: number;
  /** The party the human leads. Defaults to the largest. */
  humanParty?: string;
  /** Bot opponents, in order of size after the human's pick. */
  bots?: PlayerKind[];
}

const cloneState = (state: GameState): GameState =>
  typeof structuredClone === "function"
    ? structuredClone(state)
    : (JSON.parse(JSON.stringify(state)) as GameState);

const log = (state: GameState, kind: GameState["log"][number]["kind"], text: string): void => {
  state.log.push({ turn: state.turn, kind, text });
};

// ---------------------------------------------------------------------------
// Setting up
// ---------------------------------------------------------------------------

const buildParties = (seats: Record<string, number>): Record<string, Party> => {
  const parties: Record<string, Party> = {};
  for (const profile of PARTY_PROFILES) {
    const count = seats[profile.key] ?? 0;
    if (count <= 0) continue;
    parties[profile.key] = {
      key: profile.key,
      name: profile.name,
      seats: count,
      bloc: profile.bloc,
      leftRight: profile.leftRight,
      heldBy: null,
      package: [],
      refusals: [],
    };
  }
  return parties;
};

const baselineSeats = (): Record<string, number> =>
  Object.fromEntries(PARTY_PROFILES.map((profile) => [profile.key, profile.baseSeats]));

export const newCampaign = (options: CampaignOptions = {}): GameState => {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = new Rng(seed);
  const botKinds = options.bots ?? ["random", "greedy"];

  const ranked = [...PARTY_PROFILES].sort((a, b) => b.baseSeats - a.baseSeats);
  const humanParty = options.humanParty ?? ranked[0].key;
  const remaining = ranked.filter((profile) => profile.key !== humanParty);

  const parties = buildParties(baselineSeats());
  const players: GameState["players"] = [
    {
      key: "you",
      name: parties[humanParty]?.name ?? "You",
      kind: "human",
      partyKey: humanParty,
      yearsInPower: 0,
    },
    ...botKinds.map((kind, index) => ({
      key: `bot${index + 1}`,
      name: remaining[index]?.name ?? `Rival ${index + 1}`,
      kind,
      partyKey: remaining[index]?.key ?? ranked[index + 1].key,
      yearsInPower: 0,
    })),
  ];

  const state: GameState = {
    turn: 1,
    phase: "forming",
    week: 1,
    parliament: 1,
    players,
    parties,
    ministries: MINISTRIES.map((ministry) => ({ ...ministry })),
    primeMinister: null,
    governmentYears: 0,
    emergencyUntil: 0,
    repairing: false,
    offers: {},
    log: [],
    lastTurn: null,
    rngState: rng.state,
    seed,
    winner: null,
    epilogue: null,
  };

  log(
    state,
    "election",
    `The ${state.parliament}${ordinal(state.parliament)} Knesset is sworn in. ${MAJORITY} mandates form a government.`,
  );
  return state;
};

const ordinal = (value: number): string => {
  if (value % 100 >= 11 && value % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][value % 10] ?? "th";
};

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

export type Action = { type: "offer"; playerKey: string; offer: Offer };

export interface ActionResult {
  state: GameState;
  /** Set when this action completed the turn. */
  resolved: TurnResult | null;
}

export const humanPlayers = (state: GameState) =>
  state.players.filter((player) => player.kind === "human");

/** Whether everyone who has to press a button has pressed it. */
export const readyToResolve = (state: GameState): boolean =>
  humanPlayers(state).every((player) => state.offers[player.key] !== undefined);

export const applyAction = (input: GameState, action: Action): ActionResult => {
  const state = cloneState(input);
  if (state.phase === "over") return { state, resolved: null };

  state.offers[action.playerKey] = action.offer;
  if (!readyToResolve(state)) return { state, resolved: null };

  const resolved = resolveTurn(state);
  return { state, resolved };
};

/**
 * Run one whole turn: bids, cards, then whatever the board now implies.
 */
const resolveTurn = (state: GameState): TurnResult => {
  const rng = new Rng(state.rngState);

  // Bots decide with the same seeded stream, so nothing has to be stored.
  for (const player of state.players) {
    if (player.kind === "human") continue;
    state.offers[player.key] = offerFor(state, player.key, rng);
  }

  // Anyone walking away from a partner does so before the offers are opened,
  // which is what lets those portfolios fund this turn's bid.
  for (const [playerKey, offer] of Object.entries(state.offers)) {
    for (const partyKey of offer.withdrawFrom) {
      const party = state.parties[partyKey];
      if (party?.heldBy !== playerKey) continue;
      log(
        state,
        "trouble",
        `${playerOf(state, playerKey).name} pulls out of the ${party.name}, reclaiming ${valueOf(state, party.package)}bn of portfolios.`,
      );
    }
  }
  applyWithdrawals(state);

  const parties = resolveRound(state);
  applyRound(state, parties);

  for (const result of parties) {
    if (result.newHolder && result.newHolder !== result.previousHolder) {
      const party = state.parties[result.partyKey];
      const winner = playerOf(state, result.newHolder);
      const taken = result.previousHolder
        ? ` away from ${playerOf(state, result.previousHolder).name}`
        : "";
      log(
        state,
        "deal",
        `${winner.name} takes the ${party.name} (${party.seats})${taken} for ${packageValue(state, party.key)}bn.`,
      );
    }
  }

  // A year in office is served before anything can take it away.
  if (state.phase === "governing" || state.phase === "rebuilding") {
    state.governmentYears += 1;
    if (state.primeMinister) playerOf(state, state.primeMinister).yearsInPower += 1;
  }

  const cards: TurnResult["cards"] = [];
  for (const player of state.players) {
    const card = drawCard(state, rng, player.key);
    if (!card) continue;
    cards.push({ playerKey: player.key, title: card.title, text: card.text });
    log(state, "card", `${card.title} — ${card.text}`);
  }

  expireRefusals(state);
  advancePhase(state, rng);

  const result: TurnResult = { turn: state.turn, parties, cards };
  state.lastTurn = result;
  state.offers = {};
  state.turn += 1;
  if (state.phase === "forming") state.week += 1;
  state.rngState = rng.state;
  return result;
};

const advancePhase = (state: GameState, rng: Rng): void => {
  if (state.phase === "forming") {
    const contenders = state.players
      .map((player) => ({ player, seats: blocSeats(state, player.key) }))
      .filter((entry) => entry.seats >= MAJORITY)
      .sort((a, b) => b.seats - a.seats);

    if (contenders.length === 0) {
      // Nobody can put 61 together. The Knesset dissolves itself and the
      // voters get another go, which is the only thing that breaks a deadlock
      // once every portfolio is locked up.
      if (state.week >= FORMING_DEADLINE) {
        log(
          state,
          "trouble",
          `${FORMING_DEADLINE} weeks and no government. The Knesset dissolves itself.`,
        );
        runElection(state, rng);
      }
      checkWin(state);
      return;
    }

    {
      const winner = contenders[0].player;
      state.primeMinister = winner.key;
      state.phase = "governing";
      state.governmentYears = 0;
      state.repairing = false;
      state.week = 1;
      log(
        state,
        "deal",
        `${winner.name} forms a government with ${contenders[0].seats} mandates and is sworn in as prime minister.`,
      );
    }
    checkWin(state);
    return;
  }

  if (state.phase === "governing" || state.phase === "rebuilding") {
    const pmKey = state.primeMinister;
    if (!pmKey) {
      state.phase = "forming";
      return;
    }
    const seats = blocSeats(state, pmKey);
    const shielded = state.emergencyUntil > state.turn;

    if (seats >= MAJORITY) {
      if (state.phase === "rebuilding") {
        log(state, "deal", `${playerOf(state, pmKey).name} rebuilds the majority. The government survives.`);
      }
      state.phase = "governing";
      state.repairing = false;
    } else if (shielded) {
      log(state, "info", "The government is below 61, but the emergency holds it up.");
    } else if (state.phase === "governing") {
      state.phase = "rebuilding";
      state.repairing = true;
      log(
        state,
        "trouble",
        `${playerOf(state, pmKey).name} is down to ${seats} mandates. One turn to put it back together.`,
      );
    } else {
      runElection(state, rng);
    }
    checkWin(state);
  }
};

const checkWin = (state: GameState): void => {
  const winner = state.players.find((player) => player.yearsInPower >= YEARS_TO_WIN);
  if (!winner) return;
  state.winner = winner.key;
  state.phase = "over";
  state.epilogue =
    `${winner.name} has governed for ${winner.yearsInPower} years across ${state.parliament} ` +
    `parliament${state.parliament === 1 ? "" : "s"}. That is a career, and the record books will call it an era.`;
  log(state, "deal", `${winner.name} reaches ${YEARS_TO_WIN} years in power.`);
};

// ---------------------------------------------------------------------------
// Elections
// ---------------------------------------------------------------------------

/** Re-roll the Knesset around the real baseline and start bidding again. */
export const runElection = (state: GameState, rng: Rng): void => {
  const protectedKeys = new Set(state.players.map((player) => player.partyKey));
  const seats = rollSeats(rng, protectedKeys);

  state.parties = buildParties(seats);
  state.primeMinister = null;
  state.governmentYears = 0;
  state.emergencyUntil = 0;
  state.repairing = false;
  state.phase = "forming";
  // The turn is still being wound up, and its last act is to advance the week,
  // so the new Knesset starts counting from zero here to land on week one.
  state.week = 0;
  state.parliament += 1;

  log(
    state,
    "election",
    `The government falls. The ${state.parliament}${ordinal(state.parliament)} Knesset is elected, and the bidding starts again.`,
  );
};

/**
 * A fresh result: every list swings around its baseline, anything under the
 * threshold drops out, and the survivors are scaled back to 120.
 *
 * The parties players lead always survive — a campaign cannot strand somebody
 * with no party to lead.
 */
export const rollSeats = (rng: Rng, protectedKeys: Set<string>): Record<string, number> => {
  const weights = PARTY_PROFILES.map((profile) => ({
    key: profile.key,
    weight: profile.baseSeats * rng.range(0.6, 1.45),
  }));

  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const survivors = weights.filter(
    (entry) =>
      protectedKeys.has(entry.key) || (entry.weight / total) * TOTAL_SEATS >= ELECTORAL_THRESHOLD,
  );

  const survivingTotal = survivors.reduce((sum, entry) => sum + entry.weight, 0);
  const seats: Record<string, number> = {};
  for (const entry of survivors) {
    seats[entry.key] = Math.max(
      ELECTORAL_THRESHOLD,
      Math.round((entry.weight / survivingTotal) * TOTAL_SEATS),
    );
  }

  // Reconcile rounding against the fixed size of the Knesset.
  const keys = Object.keys(seats);
  let guard = 0;
  while (keys.reduce((sum, key) => sum + seats[key], 0) !== TOTAL_SEATS && guard < 5000) {
    guard += 1;
    const drift = TOTAL_SEATS - keys.reduce((sum, key) => sum + seats[key], 0);
    const key = keys[rng.int(0, keys.length - 1)];
    if (drift > 0) seats[key] += 1;
    else if (seats[key] > ELECTORAL_THRESHOLD) seats[key] -= 1;
  }
  return seats;
};

// ---------------------------------------------------------------------------
// Read-only helpers for the interface
// ---------------------------------------------------------------------------

export const standings = (state: GameState) =>
  state.players
    .map((player) => ({
      player,
      seats: blocSeats(state, player.key),
      years: player.yearsInPower,
    }))
    .sort((a, b) => b.seats - a.seats);

export const isTurnClock = (state: GameState): "week" | "year" =>
  state.phase === "forming" ? "week" : "year";

export { MAJORITY, isLedByPlayer };
