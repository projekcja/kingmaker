/**
 * Core data model for the coalition-building game.
 *
 * Everything is a plain serialisable object: a whole game can be cloned,
 * snapshotted, replayed from a seed, or driven headlessly by a bot in tests.
 */

/** The three axes every party and every policy issue lives on, each -10..+10. */
export const AXES = ["economy", "society", "security"] as const;
export type Axis = (typeof AXES)[number];

/** Pole labels, from the negative end of an axis to the positive end. */
export const AXIS_POLES: Record<Axis, [string, string]> = {
  economy: ["state", "market"],
  society: ["secular", "traditional"],
  security: ["dove", "hawk"],
};

export const AXIS_LABEL: Record<Axis, string> = {
  economy: "Economy",
  society: "Society",
  security: "Security",
};

/** A position in the three-dimensional political space. */
export type Ideology = Record<Axis, number>;

/** A ministry that can be traded away in negotiations. */
export interface Portfolio {
  key: string;
  name: string;
  /** 1 (minor) .. 10 (great office of state). */
  prestige: number;
  /** Which axis a party judges this ministry on. */
  axis: Axis;
}

/** A policy question the coalition agreement has to answer. */
export interface Issue {
  key: string;
  name: string;
  axis: Axis;
  /** Ordered options, from the negative pole of the axis to the positive one. */
  options: Array<{ label: string; position: number }>;
}

export interface Party {
  key: string;
  name: string;
  leader: string;
  seats: number;
  ideology: Ideology;
  /** 0 = purist, 1 = will sell anything for a ministry. */
  pragmatism: number;
  /** Baseline appetite for spoils, scaled by seats at negotiation time. */
  ambition: number;
  /** Ordered wish list of portfolio keys. */
  portfolioWants: string[];
  /** Issue key -> how much this party cares (0.3 - 2.1). */
  issueSalience: Record<string, number>;
  /** Parties this one flatly refuses to sit with. */
  vetoes: string[];
  /** Running relationship with the player, -50 (hostile) .. +50 (warm). */
  mood: number;
  /** Event-driven multiplier on their asking price. */
  priceModifier: number;
  /** Set once the player has actually sat down with them. */
  revealed: boolean;
  /** Cosmetic one-liner used in the party list. */
  blurb: string;
}

/** The deal as it currently stands on paper. */
export interface Coalition {
  members: string[];
  /** Portfolio key -> party key. */
  portfolios: Record<string, string>;
  /** Issue key -> committed position on that issue's axis. */
  commitments: Record<string, number>;
}

export interface Parliament {
  name: string;
  parties: Record<string, Party>;
  portfolios: Record<string, Portfolio>;
  issues: Record<string, Issue>;
  totalSeats: number;
  majority: number;
}

/** A package put on the table for a single party. */
export interface Offer {
  partyKey: string;
  portfolios: string[];
  /** Issue key -> position the player promises to write into the agreement. */
  commitments: Record<string, number>;
}

export type LogKind = "info" | "press" | "deal" | "trouble";

export interface LogEntry {
  day: number;
  kind: LogKind;
  text: string;
}

export type Outcome = "government" | "collapsed" | "expired" | "deposed";

/**
 * Bumped whenever a rule or a tuned number changes.
 *
 * A stored game is only a seed plus a list of actions, so it is replayed
 * against whatever code is running now. Different rules replay to a different
 * game, which is why a saved game records the version that produced it.
 */
export const RULES_VERSION = 1;

/**
 * Who sits behind each party: a player id, or absent for one the engine plays.
 *
 * An empty map is the single-player game, so multiplayer is a superset of it
 * rather than a separate mode.
 */
export type Seats = Record<string, string>;

/**
 * A package tabled with a human-run party, waiting on their answer.
 *
 * While this is set the formateur cannot act: the game belongs to whoever
 * holds that seat.
 */
export interface PendingOffer {
  offer: Offer;
  /** The day it was tabled; time only passes once it is answered. */
  tabledOn: number;
}

export interface GameState {
  parliament: Parliament;
  playerKey: string;
  coalition: Coalition;
  day: number;
  daysTotal: number;
  /** Event-driven adjustment to the player's standing in their own party. */
  baseModifier: number;
  log: LogEntry[];
  /** Serialisable PRNG cursor, so a game is fully reproducible from its seed. */
  rngState: number;
  seed: number;
  /** Party key -> player id. Parties absent from this map are played by the engine. */
  seats: Seats;
  /** Set while a human-run party owes the formateur an answer. */
  pending: PendingOffer | null;
  finished: boolean;
  outcome: Outcome | null;
  /** Set when the game ends, for the summary screen. */
  epilogue: string | null;
}

export const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

export const ideologyDistance = (a: Ideology, b: Ideology): number => {
  let raw = 0;
  for (const axis of AXES) raw += Math.abs(a[axis] - b[axis]);
  return raw / (20 * AXES.length);
};

export const describeIdeology = (ideology: Ideology): string =>
  AXES.map((axis) => {
    const value = ideology[axis];
    const [low, high] = AXIS_POLES[axis];
    return `${value >= 0 ? high : low} ${Math.abs(value).toFixed(0)}`;
  }).join(" · ");

export const optionLabel = (issue: Issue, position: number): string => {
  let best = issue.options[0];
  for (const option of issue.options) {
    if (Math.abs(option.position - position) < Math.abs(best.position - position)) best = option;
  }
  return best.label;
};

export const portfoliosOf = (coalition: Coalition, partyKey: string): string[] =>
  Object.keys(coalition.portfolios).filter((key) => coalition.portfolios[key] === partyKey);

export const coalitionSeats = (state: GameState): number =>
  state.coalition.members.reduce((total, key) => total + state.parliament.parties[key].seats, 0);

export const daysLeft = (state: GameState): number =>
  Math.max(0, state.daysTotal - state.day + 1);

/** A party's read on a specific package, with the breakdown behind the verdict. */
export interface Evaluation {
  partyKey: string;
  portfolioValue: number;
  policyValue: number;
  partnerFriction: number;
  goodwill: number;
  price: number;
  /** Coalition members this party has a standing red line against. */
  vetoedBy: string[];
  /** Human-readable reasons, ready to be quoted back to the player. */
  complaints: string[];
  satisfaction: number;
  /** satisfaction - price. Non-negative means they sign. */
  margin: number;
  accepted: boolean;
}


/** The player behind a party, or null when the engine plays it. */
export const seatHolder = (state: GameState, partyKey: string): string | null =>
  state.seats[partyKey] ?? null;

export const isHumanSeat = (state: GameState, partyKey: string): boolean =>
  state.seats[partyKey] !== undefined;

/**
 * Whose move it is: the party whose seat may act, and the player in it.
 *
 * With a package on the table the turn belongs to the party answering it;
 * otherwise it belongs to the formateur.
 */
export const whoseTurn = (
  state: GameState,
): { partyKey: string; playerId: string | null; awaitingAnswer: boolean } => {
  const partyKey = state.pending ? state.pending.offer.partyKey : state.playerKey;
  return {
    partyKey,
    playerId: seatHolder(state, partyKey),
    awaitingAnswer: state.pending !== null,
  };
};
