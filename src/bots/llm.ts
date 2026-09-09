/**
 * The language-model seat.
 *
 * Everything here is pure: it turns a position into a briefing, and a reply
 * back into a legal move. The network lives in `scripts/playtest.ts`, so this
 * module can be tested offline with a canned "model" and the engine never
 * learns that one of its players is a chat completion.
 *
 * A model is not trusted to produce a legal offer. Every reply goes through the
 * same `validateOffer` the interface uses, and an illegal one is handed back
 * with its complaints attached for another go. Anything still broken after the
 * last attempt becomes a pass, which is a legal move in this game and keeps a
 * bad reply from ending the campaign.
 */

import { validateOffer } from "../engine/allocation";
import type { OfferProblem } from "../engine/allocation";
import { MAJORITY } from "../engine/parties";
import type { Bid, GameState, Offer } from "../engine/types";
import {
  FORMING_DEADLINE,
  OFFERS_PER_TURN,
  TERM_LENGTH,
  YEARS_TO_WIN,
  biddableParties,
  blocSeats,
  emptyOffer,
  freeMinistries,
  ministryByKey,
  packageValue,
  playerOf,
  refusalsAgainst,
  valueOf,
} from "../engine/types";

/** The rules, as short as they will go and still be playable. */
export const RULES_BRIEF = `You are playing Kingmaker, a game about forming Israeli coalition governments.

THE BOARD
- The Knesset has 120 mandates. ${MAJORITY} of them form a government.
- You lead one party. Its mandates are always yours.
- Every other party that no player leads can be bought with ministries.
- You hold your own set of 18 ministries, worth 1 to 18 billion each (171bn in
  all). Every player holds the same 18, so a bid is only ever compared against a
  rival bid for the same party.

A TURN
- You may sit down with at most ${OFFERS_PER_TURN} parties, and put any ministries
  from your free hand in front of each.
- Every player commits at the same time, blind. Each party then goes to whoever
  offered it the most billions.
- Ministries only leave your hand if the bid WINS. A losing offer costs nothing.
- Ministries promised to a party you hold stay locked with it. To spend them
  again you must withdraw from that party, which loses you the party.
- A party you hold stays yours unless somebody outbids the package it is already
  sitting on. Topping it up stacks on that package. Ties go to the holder.
- Where nobody holds a party, a tie goes to whoever already has the most mandates.

THE CLOCK
- While forming: one turn is a week, and you get ${FORMING_DEADLINE} weeks. Reach
  ${MAJORITY} mandates and you are sworn in as prime minister. If nobody does, the
  Knesset dissolves, the mandates are re-drawn, and the bidding starts again --
  but every coalition agreement stays exactly where it was.
- While governing: one turn is a year, and you bank a year in power for each one.
  The opposition spends that year bidding your partners away from you. Drop below
  ${MAJORITY} and you have one turn to repair it before the government falls.
- A Knesset sits ${TERM_LENGTH} years. When the term is up the country votes whatever
  your majority looks like, the mandates are re-drawn, and the bidding starts again
  -- but the coalition agreements stay exactly where they were. Seats you bought in
  one parliament are still yours in the next.
- Every list is re-drawn around what it won at the last election, not around the
  board the game opened on. A bad result follows a party into the next parliament,
  and a list voted out of the Knesset does not come back.

WINNING
- ${YEARS_TO_WIN} years in power, across as many governments as it takes.

One card is drawn each turn, for one player. Cards split parties, invent or
abolish a ministry, move mandates, or make one party refuse to sit with another.
A refusal beats any amount of money.

Some refusals are not from cards and never lapse: lists at opposite ends of the
board will not serve together whatever they are offered, and an Arab list will
not sit with the right. The board below marks every party that refuses you.
Money cannot move one, so spend the turn on a party that will deal.`;

/** The shape a reply has to arrive in. */
export const REPLY_FORMAT = `Reply with JSON and nothing else:

{"thinking": "one or two sentences of reasoning",
 "withdrawFrom": ["party-key"],
 "bids": [{"party": "party-key", "ministries": ["ministry-key", "ministry-key"]}]}

Use the keys from the tables, not the display names. At most ${OFFERS_PER_TURN}
bids. "withdrawFrom" is usually empty. To pass the turn, send no bids.`;

const pad = (text: string, width: number): string =>
  text.length >= width ? text : text + " ".repeat(width - text.length);

/** What a package is, written out, so the model can see what it would cost. */
const describePackage = (state: GameState, ministries: readonly string[]): string =>
  ministries.length === 0
    ? "nothing"
    : ministries
        .map((key) => {
          const ministry = ministryByKey(state, key);
          return `${ministry?.name ?? key} ${ministry?.budget ?? 0}`;
        })
        .join(", ");

/**
 * The whole position as one player can see it.
 *
 * Everything they are entitled to know and nothing they are not: this turn is
 * sealed, so no rival offer appears here.
 */
export const describePosition = (state: GameState, playerKey: string): string => {
  const lines: string[] = [];

  const clock =
    state.phase === "forming"
      ? `Week ${state.week} of ${FORMING_DEADLINE} -- nobody has a government yet.`
      : state.phase === "rebuilding"
        ? `The government has slipped below ${MAJORITY}. One turn to put it back together.`
        : `Year ${state.governmentYears + 1} of ${TERM_LENGTH} -- the country votes when the term is up.`;

  lines.push(`TURN ${state.turn} - Knesset number ${state.parliament}`);
  lines.push(clock);
  if (state.primeMinister) {
    lines.push(
      state.primeMinister === playerKey
        ? "You are the prime minister."
        : `${playerOf(state, state.primeMinister).name} is the prime minister.`,
    );
  }
  lines.push("");

  lines.push("PLAYERS");
  for (const player of state.players) {
    const who = player.key === playerKey ? "you" : "rival";
    lines.push(
      `  ${pad(player.name, 22)} ${pad(who, 6)} bloc ${pad(String(blocSeats(state, player.key)), 4)} of ${MAJORITY}   ${player.yearsInPower} of ${YEARS_TO_WIN} years in power`,
    );
  }
  lines.push("");

  lines.push("PARTIES FOR SALE");
  for (const party of biddableParties(state)) {
    const holder = !party.heldBy
      ? "unaligned"
      : party.heldBy === playerKey
        ? `yours, on ${packageValue(state, party.key)}bn (${describePackage(state, party.package)})`
        : `held by ${playerOf(state, party.heldBy).name} on ${packageValue(state, party.key)}bn -- beat that to take it`;
    const blocked =
      refusalsAgainst(state, party, playerKey).length > 0
        ? "  REFUSES YOU (a red line: no amount of money works)"
        : "";
    lines.push(
      `  ${pad(party.key, 18)} ${pad(party.name, 22)} ${pad(`${party.seats} mandates`, 13)} ${holder}${blocked}`,
    );
  }
  lines.push("");

  const hand = freeMinistries(state, playerKey);
  lines.push(`YOUR FREE HAND -- ${valueOf(state, hand)}bn`);
  for (const key of [...hand].sort(
    (a, b) => (ministryByKey(state, b)?.budget ?? 0) - (ministryByKey(state, a)?.budget ?? 0),
  )) {
    const ministry = ministryByKey(state, key);
    lines.push(`  ${pad(key, 18)} ${pad(ministry?.name ?? key, 24)} ${ministry?.budget ?? 0}bn`);
  }

  const locked = Object.values(state.parties).filter(
    (party) => party.heldBy === playerKey && party.package.length > 0,
  );
  if (locked.length > 0) {
    lines.push("");
    lines.push("LOCKED WITH YOUR PARTNERS -- only withdrawing frees these");
    for (const party of locked) {
      lines.push(`  ${pad(party.name, 22)} ${describePackage(state, party.package)}`);
    }
  }

  const recent = state.log.slice(-6);
  if (recent.length > 0) {
    lines.push("");
    lines.push("LATELY");
    for (const entry of recent) lines.push(`  ${entry.text}`);
  }

  lines.push("");
  lines.push(`You lead the ${playerOf(state, playerKey).name}. What is your move?`);
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Reading a reply
// ---------------------------------------------------------------------------

/** Pull the first balanced JSON object out of whatever the model wrapped it in. */
export const extractJson = (reply: string): string | null => {
  const start = reply.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < reply.length; i += 1) {
    const char = reply[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return reply.slice(start, i + 1);
    }
  }
  return null;
};

const normalise = (text: string): string => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Match a party by key or by name, since a model writes Shas as often as shas. */
const resolveParty = (state: GameState, given: unknown): string | null => {
  if (typeof given !== "string") return null;
  const wanted = normalise(given);
  for (const party of Object.values(state.parties)) {
    if (normalise(party.key) === wanted || normalise(party.name) === wanted) return party.key;
  }
  return null;
};

const resolveMinistry = (state: GameState, given: unknown): string | null => {
  if (typeof given !== "string") return null;
  const wanted = normalise(given);
  for (const ministry of state.ministries) {
    if (normalise(ministry.key) === wanted || normalise(ministry.name) === wanted) {
      return ministry.key;
    }
  }
  return null;
};

export interface ParsedReply {
  offer: Offer;
  /** The model account of what it is doing, if it gave one. */
  thinking: string;
  /** Why the reply could not be read, or could not be played. */
  problems: OfferProblem[];
}

/**
 * Turn a reply into a legal offer, or into a list of complaints.
 *
 * Names are matched loosely and unknown fields ignored -- the point of the
 * exercise is the judgement, not whether a model can copy a key exactly.
 * Anything that would actually break a rule is reported rather than repaired.
 */
export const parseReply = (state: GameState, playerKey: string, reply: string): ParsedReply => {
  const json = extractJson(reply);
  if (!json) {
    return {
      offer: emptyOffer(),
      thinking: "",
      problems: [{ code: "empty", message: "No JSON object in the reply." }],
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch (error) {
    return {
      offer: emptyOffer(),
      thinking: "",
      problems: [{ code: "empty", message: `The JSON did not parse: ${String(error)}` }],
    };
  }

  const problems: OfferProblem[] = [];
  const bids: Bid[] = [];

  for (const entry of Array.isArray(parsed.bids) ? parsed.bids : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const partyKey = resolveParty(state, row.party ?? row.partyKey ?? row.key);
    if (!partyKey) {
      problems.push({ code: "unknown-party", message: `There is no party called ${String(row.party)}.` });
      continue;
    }
    const ministries: string[] = [];
    for (const given of Array.isArray(row.ministries) ? row.ministries : []) {
      const key = resolveMinistry(state, given);
      if (!key) {
        problems.push({
          code: "unknown-ministry",
          message: `There is no ministry called ${String(given)}.`,
        });
        continue;
      }
      ministries.push(key);
    }
    bids.push({ partyKey, ministries });
  }

  const withdrawFrom: string[] = [];
  for (const given of Array.isArray(parsed.withdrawFrom) ? parsed.withdrawFrom : []) {
    const partyKey = resolveParty(state, given);
    if (!partyKey) {
      problems.push({ code: "unknown-party", message: `There is no party called ${String(given)}.` });
      continue;
    }
    withdrawFrom.push(partyKey);
  }

  const offer: Offer = { bids, withdrawFrom };
  problems.push(...validateOffer(state, playerKey, offer));
  return {
    offer,
    thinking: typeof parsed.thinking === "string" ? parsed.thinking : "",
    problems,
  };
};

// ---------------------------------------------------------------------------
// The seat itself
// ---------------------------------------------------------------------------

/** One turn of conversation, so the caller can read it back and price it. */
export interface LlmMove {
  offer: Offer;
  thinking: string;
  /** How many replies it took to get a legal move. */
  attempts: number;
  /** Set when no attempt produced one and the turn was passed instead. */
  gaveUp: boolean;
  problems: OfferProblem[];
}

/** Ask a model something and get its reply. Implemented by the playtest script. */
export type Ask = (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>;

export const promptFor = (state: GameState, playerKey: string) => [
  { role: "system" as const, content: `${RULES_BRIEF}\n\n${REPLY_FORMAT}` },
  { role: "user" as const, content: describePosition(state, playerKey) },
];

/**
 * Drive one seat with a model.
 *
 * An illegal offer is not silently repaired: the complaints go back with the
 * position and the model tries again, which is also the cheapest way to find
 * out which of our rules are hard to follow from the briefing alone.
 */
export const createLlmStrategy = (ask: Ask, attempts = 3) => {
  return async (state: GameState, playerKey: string): Promise<LlmMove> => {
    const messages = promptFor(state, playerKey);
    let last: ParsedReply = { offer: emptyOffer(), thinking: "", problems: [] };

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const reply = await ask(messages);
      last = parseReply(state, playerKey, reply);
      if (last.problems.length === 0) {
        return {
          offer: last.offer,
          thinking: last.thinking,
          attempts: attempt,
          gaveUp: false,
          problems: [],
        };
      }
      messages.push({
        role: "user",
        content:
          `That move is not legal:\n${last.problems.map((problem) => `- ${problem.message}`).join("\n")}\n\n` +
          "Send a corrected JSON move.",
      });
    }

    // Out of tries. Passing is always legal, and the campaign carries on.
    return {
      offer: emptyOffer(),
      thinking: last.thinking,
      attempts,
      gaveUp: true,
      problems: last.problems,
    };
  };
};
