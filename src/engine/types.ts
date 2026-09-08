/**
 * The campaign model.
 *
 * Everything is plain serialisable data: a whole campaign is a seed plus an
 * ordered list of actions, replayed deterministically. Elections draw from the
 * RNG cursor held in the state, so even a game that runs through three
 * parliaments rebuilds exactly.
 */

import type { Ministry } from "./ministries";
import type { Bloc } from "./parties";

/**
 * Bumped whenever a rule or a tuned number changes.
 *
 * A stored campaign is only a seed and a list of moves, replayed against
 * whatever code is running now, so a mismatch has to be refused rather than
 * silently producing a different game.
 */
export const RULES_VERSION = 2;

export const YEARS_TO_WIN = 10;

export type PlayerKind = "human" | "random" | "greedy";

export interface Player {
  key: string;
  name: string;
  kind: PlayerKind;
  /** The party this player leads. Its seats always count toward their bloc. */
  partyKey: string;
  /** Banked years in office, across every government they have led. */
  yearsInPower: number;
}

export interface Party {
  key: string;
  name: string;
  seats: number;
  /** Real politics. Never read by the bidding — only by the deck. */
  bloc: Bloc;
  leftRight: number;
  /** The player whose bloc this party currently sits in, or null. */
  heldBy: string | null;
  /**
   * Parties this one refuses to sit beside, with the turn the refusal lapses.
   *
   * Written by cards, which is how ideology reaches the board without the
   * auction itself ever consulting it.
   */
  refusals: Array<{ partyKey: string; until: number }>;
}

/** Which ministry each player is putting where. Ministry key -> party key. */
export type Allocation = Record<string, string>;

export type Phase =
  /** Bidding for a majority. One turn is a week. */
  | "forming"
  /** A government sits. One turn is a year. */
  | "governing"
  /** The government has slipped below 61 and has one turn to repair it. */
  | "rebuilding"
  /** Somebody has banked ten years. */
  | "over";

export type LogKind = "info" | "card" | "deal" | "trouble" | "election";

export interface LogEntry {
  turn: number;
  kind: LogKind;
  text: string;
}

/** What happened to one party at the end of a turn, for the reveal. */
export interface PartyResult {
  partyKey: string;
  /** Player key -> billions offered. */
  bids: Record<string, number>;
  previousHolder: string | null;
  newHolder: string | null;
  /** Players whose winning bid was refused on a red line written by a card. */
  blocked: string[];
}

export interface TurnResult {
  turn: number;
  parties: PartyResult[];
  cards: Array<{ playerKey: string; title: string; text: string }>;
}

export interface GameState {
  /** Turn number, counting every turn of the campaign. */
  turn: number;
  phase: Phase;
  /** Weeks spent in the current coalition negotiation. */
  week: number;
  /** Which parliament we are in; 1 is the opening one. */
  parliament: number;

  players: Player[];
  parties: Record<string, Party>;
  /** The live ministry list; cards may add to or remove from it. */
  ministries: Ministry[];

  /** The sitting prime minister, or null while forming. */
  primeMinister: string | null;
  /** Years the current government has run; reset at every election. */
  governmentYears: number;
  /** While above the current turn, the government cannot fall. */
  emergencyUntil: number;
  /** True when the government slipped below 61 and is on its repair turn. */
  repairing: boolean;

  /** Sealed bids for the turn in progress, keyed by player. */
  commitments: Record<string, Allocation>;

  log: LogEntry[];
  /** The most recent resolution, kept so the interface can show the reveal. */
  lastTurn: TurnResult | null;

  rngState: number;
  seed: number;
  winner: string | null;
  epilogue: string | null;
}

export const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

export const playerOf = (state: GameState, playerKey: string): Player => {
  const player = state.players.find((candidate) => candidate.key === playerKey);
  if (!player) throw new Error(`no such player: ${playerKey}`);
  return player;
};

export const isLedByPlayer = (state: GameState, partyKey: string): boolean =>
  state.players.some((player) => player.partyKey === partyKey);

/** Parties that can be bid for: everything nobody is leading. */
export const biddableParties = (state: GameState): Party[] =>
  Object.values(state.parties)
    .filter((party) => !isLedByPlayer(state, party.key))
    .sort((a, b) => b.seats - a.seats);

/** A player's own party plus everyone they currently hold. */
export const blocParties = (state: GameState, playerKey: string): Party[] => {
  const player = playerOf(state, playerKey);
  return Object.values(state.parties).filter(
    (party) => party.key === player.partyKey || party.heldBy === playerKey,
  );
};

export const blocSeats = (state: GameState, playerKey: string): number =>
  blocParties(state, playerKey).reduce((sum, party) => sum + party.seats, 0);

export const ministryByKey = (state: GameState, key: string): Ministry | undefined =>
  state.ministries.find((ministry) => ministry.key === key);

/** Billions a player has committed to one party this turn. */
export const bidValue = (
  state: GameState,
  allocation: Allocation,
  partyKey: string,
): number =>
  state.ministries.reduce(
    (sum, ministry) => (allocation[ministry.key] === partyKey ? sum + ministry.budget : sum),
    0,
  );

/**
 * Red lines standing between a party and a player's bloc.
 *
 * The refusals themselves were written by cards; resolution reads only this
 * list, never the party's politics, which is what keeps ideology out of the
 * auction.
 */
export const refusalsAgainst = (state: GameState, party: Party, playerKey: string): string[] => {
  const bloc = new Set(blocParties(state, playerKey).map((member) => member.key));
  return party.refusals
    .filter((refusal) => refusal.until > state.turn && bloc.has(refusal.partyKey))
    .map((refusal) => refusal.partyKey);
};
