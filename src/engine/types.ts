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
export const RULES_VERSION = 5;

export const YEARS_TO_WIN = 10;

/**
 * Weeks a formateur gets before the Knesset is dissolved.
 *
 * The real thing: 28 days to form a government, and a further 14 if the
 * president grants the extension, which they usually do. Six weeks in all.
 *
 * It also happens to be the rule that keeps the game from deadlocking.
 * Portfolios stay locked with the partners that bought them, so without a
 * deadline well-funded players can each hold part of the board with none of
 * them able to afford the rest. The country's answer to that is another
 * election, and so is this game's.
 */
export const FORMING_DEADLINE = 6;

/**
 * Years a Knesset sits before the country votes again.
 *
 * The real term, and the clock a prime minister cannot bid their way out of.
 * Without it a government that holds 61 governs until it has won: the
 * opposition has no date to aim at, and a comfortable majority has no reason
 * to spend another shekel. Four years is what makes the seats bought in one
 * parliament worth defending in the next.
 */
export const TERM_LENGTH = 4;

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
   * Ministries handed over to keep this party, by whoever holds it.
   *
   * They stay spent for as long as the party stays: every partner you add
   * leaves you less to buy the next one with. Losing the party, or pulling the
   * ministries back, returns them to their owner's hand.
   */
  package: string[];
  /**
   * Parties this one refuses to sit beside, with the turn the refusal lapses.
   *
   * Written by cards, which is how ideology reaches the board without the
   * auction itself ever consulting it.
   */
  refusals: Array<{ partyKey: string; until: number }>;
}

/**
 * How many parties one player may sit down with in a single turn.
 *
 * This is the dial that sets the pace of the whole game. Money is plentiful;
 * turns are not, so a coalition has to be assembled a few partners at a time
 * while rivals do the same. What goes on each table is unlimited: the scarce
 * thing is the diary, not the purse.
 */
export const OFFERS_PER_TURN = 3;

/** One party courted, and what is being put in front of it. */
export interface Bid {
  partyKey: string;
  /** Ministries on the table, drawn from the player's free hand. */
  ministries: string[];
}

/** One turn's move. */
export interface Offer {
  /** Up to {@link OFFERS_PER_TURN} parties courted this turn, with anything in hand. */
  bids: Bid[];
  /**
   * Parties abandoned this turn to free up the ministries locked with them.
   *
   * Withdrawing costs you the party but funds the offer, which is the only way
   * to move a portfolio once it has been promised.
   */
  withdrawFrom: string[];
}

export const emptyOffer = (): Offer => ({ bids: [], withdrawFrom: [] });

/** Every ministry this player is putting on a table this turn. */
export const offeredMinistries = (offer: Offer): string[] =>
  offer.bids.flatMap((bid) => bid.ministries);

export const bidFor = (offer: Offer, partyKey: string): Bid | undefined =>
  offer.bids.find((bid) => bid.partyKey === partyKey);

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
  /** Mandates the party was holding when the offers were opened. */
  seats: number;
  /** Player key -> billions offered. */
  bids: Record<string, number>;
  /**
   * Player key -> the portfolios that player actually put on the table.
   *
   * The billions in {@link bids} are what the party weighed, but they are not
   * what the player did: a holder standing pat scores its existing package
   * without offering anything, and two different hands can add up to the same
   * number. The reveal has to name the portfolios or it is not showing the move.
   */
  offered: Record<string, string[]>;
  previousHolder: string | null;
  newHolder: string | null;
  /** Players whose winning bid was refused on a red line written by a card. */
  blocked: string[];
}

/** A player walking away from a partner, and what it freed up. */
export interface Withdrawal {
  playerKey: string;
  partyKey: string;
  /** The portfolios that went back into their hand, in time to fund this turn. */
  ministries: string[];
}

export interface TurnResult {
  turn: number;
  parties: PartyResult[];
  /** Partners abandoned before the offers were opened. */
  withdrawals: Withdrawal[];
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

  /** Sealed offers for the turn in progress, keyed by player. */
  offers: Record<string, Offer>;

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

/**
 * A party's name with its article, for dropping into a sentence.
 *
 * Most lists take one -- "the Likud", "the Shas" -- but a few carry their own,
 * and "the The Democrats" is how you can tell a game was written before anybody
 * named a party that way. Chambers back to 1949 and the splinter-name pool both
 * contain such names, so this is not a hypothetical.
 */
export const theList = (name: string): string =>
  /^(the|ha)\s/i.test(name) ? name : `the ${name}`;

/** The same, starting a sentence. */
export const TheList = (name: string): string => {
  const text = theList(name);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

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

/** What a set of ministries is worth, in billions. */
export const valueOf = (state: GameState, ministries: readonly string[]): number =>
  ministries.reduce((sum, key) => sum + (ministryByKey(state, key)?.budget ?? 0), 0);

/** What the party is currently being paid to stay where it is. */
export const packageValue = (state: GameState, partyKey: string): number =>
  valueOf(state, state.parties[partyKey]?.package ?? []);

/**
 * The ministries a player still has to spend.
 *
 * Everything they own, minus whatever is locked with the parties they hold.
 */
export const freeMinistries = (state: GameState, playerKey: string): string[] => {
  const locked = new Set(
    Object.values(state.parties)
      .filter((party) => party.heldBy === playerKey)
      .flatMap((party) => party.package),
  );
  return state.ministries
    .filter((ministry) => !locked.has(ministry.key))
    .map((ministry) => ministry.key);
};

export const freeBudget = (state: GameState, playerKey: string): number =>
  valueOf(state, freeMinistries(state, playerKey));

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
