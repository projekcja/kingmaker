/**
 * The stack of cards.
 *
 * One card is drawn per player per turn, filtered to the phase in play. The
 * deck is the only part of the game that reads a party's politics: when a card
 * writes a red line it records a concrete party-to-party refusal, so the
 * bidding never has to consult ideology itself.
 *
 * Adding or removing the ideology-tagged cards is the dial for how much
 * politics matters, and it moves nothing else.
 */

import { EXTRA_MINISTRIES } from "./ministries";
import { BLOC_LABEL } from "./parties";
import type { Bloc } from "./parties";
import type { Rng } from "./rng";
import type { GameState, Party, Phase } from "./types";
import { biddableParties, blocParties, blocSeats, isLedByPlayer, playerOf } from "./types";

export interface Card {
  id: string;
  title: string;
  /** Phases in which this card can come up. */
  phases: Phase[];
  /** True when the card reads party politics; used by the deck-composition test. */
  ideological?: boolean;
  /** Relative likelihood; 0 means its preconditions are not met right now. */
  weight: (state: GameState, drawerKey: string) => number;
  /** Mutates the state and returns the line for the log, or null if it fizzled. */
  play: (state: GameState, rng: Rng, drawerKey: string) => string | null;
}

const SPLINTER_NAMES = [
  "Otzma Yehudit", "Noam", "New Hope", "Telem", "Derech Eretz",
  "Gesher", "Balad", "Tzomet", "Meretz", "Ahi",
];

const unaligned = (state: GameState): Party[] =>
  biddableParties(state).filter((party) => party.heldBy === null);

/**
 * Send a party back to the market.
 *
 * The portfolios it was holding return to whoever paid them, which matters now
 * that a package stays spent for as long as the party stays bought.
 */
const release = (party: Party): void => {
  party.heldBy = null;
  party.package = [];
};

const opposedBloc = (bloc: Bloc): Bloc[] => {
  switch (bloc) {
    case "right":
      return ["arab", "left"];
    case "haredi":
      return ["arab", "left"];
    case "left":
      return ["right"];
    case "arab":
      return ["right", "haredi"];
    case "centre":
      return [];
  }
};

/** Move seats between two parties without changing the size of the Knesset. */
const moveSeats = (from: Party, to: Party, count: number): number => {
  const moved = Math.max(0, Math.min(count, from.seats - 1));
  from.seats -= moved;
  to.seats += moved;
  return moved;
};

export const CARDS: Card[] = [
  // ----------------------------------------------------------------- forming
  {
    id: "new-ministry",
    title: "A portfolio is invented",
    phases: ["forming"],
    weight: (state) => (state.ministries.length < 21 ? 2 : 0),
    play: (state, rng) => {
      const candidates = EXTRA_MINISTRIES.filter(
        (extra) => !state.ministries.some((ministry) => ministry.key === extra.key),
      );
      if (candidates.length === 0) return null;
      const ministry = rng.pick(candidates);
      state.ministries.push({ ...ministry });
      return `A ${ministry.name} portfolio is carved out of thin air. Every player now has one more chip, worth ${ministry.budget}bn.`;
    },
  },
  {
    id: "abolish-ministry",
    title: "A ministry is folded",
    phases: ["forming", "governing"],
    weight: (state) => (state.ministries.length > 12 ? 1.5 : 0),
    play: (state, rng) => {
      const doomed = rng.pick(state.ministries.filter((ministry) => ministry.budget <= 10));
      if (!doomed) return null;
      state.ministries = state.ministries.filter((ministry) => ministry.key !== doomed.key);
      for (const party of Object.values(state.parties)) {
        party.package = party.package.filter((key) => key !== doomed.key);
      }
      return `${doomed.name} is folded into another office. Everyone loses that chip, including the coalitions already built on it.`;
    },
  },
  {
    id: "merger",
    title: "Two lists run together",
    phases: ["forming"],
    ideological: true,
    weight: (state) => (mergeCandidates(state).length > 0 ? 1.5 : 0),
    play: (state, rng) => {
      const pairs = mergeCandidates(state);
      if (pairs.length === 0) return null;
      const [keeper, absorbed] = rng.pick(pairs);
      keeper.seats += absorbed.seats;
      delete state.parties[absorbed.key];
      return `The ${absorbed.name} folds into the ${keeper.name}. One list, ${keeper.seats} mandates, same ${BLOC_LABEL[keeper.bloc].toLowerCase()} politics.`;
    },
  },

  // --------------------------------------------------------------- governing
  {
    id: "partner-walks",
    title: "A partner walks",
    phases: ["governing", "rebuilding"],
    weight: (state) => (state.primeMinister && partnersOf(state).length > 0 ? 3 : 0),
    play: (state, rng) => {
      const partners = partnersOf(state);
      if (partners.length === 0) return null;
      const leaving = rng.pick(partners);
      release(leaving);
      return `The ${leaving.name} walks out of the coalition over a cabinet row. ${leaving.seats} mandates gone.`;
    },
  },
  {
    id: "budget-crisis",
    title: "The budget fails",
    phases: ["governing"],
    weight: (state) => (state.primeMinister && partnersOf(state).length > 1 ? 2 : 0),
    play: (state, rng) => {
      const partners = partnersOf(state);
      if (partners.length < 2) return null;
      const [first, second] = rng.sample(partners, 2);
      release(first);
      release(second);
      return `The budget fails its second reading. The ${first.name} and the ${second.name} both leave the government.`;
    },
  },
  {
    id: "law-passes",
    title: "A landmark law passes",
    phases: ["governing"],
    weight: (state) => (state.primeMinister ? 2 : 0),
    play: (state) => {
      if (!state.primeMinister) return null;
      const pm = playerOf(state, state.primeMinister);
      pm.yearsInPower += 1;
      state.governmentYears += 1;
      return `A landmark law passes and the government rides the credit. ${pm.name} banks an extra year.`;
    },
  },
  {
    id: "emergency",
    title: "National emergency",
    phases: ["governing", "rebuilding"],
    weight: (state) => (state.primeMinister && state.emergencyUntil <= state.turn ? 1.5 : 0),
    play: (state) => {
      if (!state.primeMinister) return null;
      state.emergencyUntil = state.turn + 2;
      return "A national emergency freezes the politics. The government cannot fall for two years.";
    },
  },
  {
    id: "corruption",
    title: "A corruption probe",
    phases: ["governing", "rebuilding"],
    weight: (state) => (partnersOf(state).length > 0 ? 2 : 0),
    play: (state, rng) => {
      const partners = partnersOf(state);
      if (partners.length === 0) return null;
      const accused = rng.pick(partners);
      release(accused);
      return `A corruption probe reaches the ${accused.name}. They resign from the coalition rather than answer for it.`;
    },
  },

  // -------------------------------------------------------------------- both
  {
    id: "floor-crossing",
    title: "A member crosses the floor",
    phases: ["forming", "governing", "rebuilding"],
    weight: (state) => (Object.keys(state.parties).length > 1 ? 3 : 0),
    play: (state, rng) => {
      const parties = Object.values(state.parties).filter((party) => party.seats > 1);
      if (parties.length < 2) return null;
      const [from, to] = rng.sample(parties, 2);
      const moved = moveSeats(from, to, rng.int(1, 2));
      if (moved === 0) return null;
      return `${moved === 1 ? "A member" : `${moved} members`} of the ${from.name} cross the floor to the ${to.name}.`;
    },
  },
  {
    id: "scandal",
    title: "A scandal breaks",
    phases: ["forming", "governing", "rebuilding"],
    weight: (state) => (biddableParties(state).some((party) => party.heldBy) ? 2 : 0),
    play: (state, rng) => {
      const held = biddableParties(state).filter((party) => party.heldBy);
      if (held.length === 0) return null;
      const party = rng.pick(held);
      release(party);
      return `A recording surfaces. The ${party.name} suspends its agreement and returns to the market.`;
    },
  },
  {
    id: "quiet",
    title: "A quiet stretch",
    phases: ["forming", "governing", "rebuilding"],
    weight: () => 5,
    play: (state) =>
      state.phase === "forming"
        ? "A quiet week. Nothing but position papers and leaks about position papers."
        : "A quiet year. The government governs, which nobody reports.",
  },

  // ------------------------------------------------------------- ideological
  {
    id: "split",
    title: "A list splits",
    phases: ["forming", "governing"],
    ideological: true,
    weight: (state) => (splitCandidates(state).length > 0 ? 2 : 0),
    play: (state, rng) => {
      const candidates = splitCandidates(state);
      if (candidates.length === 0) return null;
      const party = rng.pick(candidates);
      const breakaway = Math.max(2, Math.floor(party.seats * rng.range(0.25, 0.45)));
      party.seats -= breakaway;

      const name = rng.pick(
        SPLINTER_NAMES.filter(
          (candidate) =>
            !Object.values(state.parties).some((existing) => existing.name === candidate),
        ),
      );
      if (!name) return null;

      // Keyed by the breakaway's own name, which is drawn from the names not
      // already in use. Keying by turn collided when two lists split at once,
      // and the second splinter overwrote the first.
      const key = `split-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      // The breakaway sits further out than the list it left.
      const drift = party.leftRight >= 0 ? 2 : -2;
      state.parties[key] = {
        key,
        name,
        seats: breakaway,
        bloc: party.bloc,
        leftRight: Math.max(-10, Math.min(10, party.leftRight + drift)),
        heldBy: null,
        package: [],
        refusals: [],
      };
      return `The ${party.name} splits. ${name} breaks away with ${breakaway} mandates, and sits further ${drift > 0 ? "right" : "left"} than the list it left.`;
    },
  },
  {
    id: "bloc-red-line",
    title: "A red line is drawn",
    phases: ["forming", "governing"],
    ideological: true,
    weight: (state) => (redLineCandidates(state).length > 0 ? 2.5 : 0),
    play: (state, rng) => {
      const pairs = redLineCandidates(state);
      if (pairs.length === 0) return null;
      const [refuser, target] = rng.pick(pairs);
      const turns = rng.int(3, 6);
      refuser.refusals.push({ partyKey: target.key, until: state.turn + turns });
      return `${refuser.name} rules it out on the record: they will not sit in any government with the ${target.name}. That holds for ${turns} turns.`;
    },
  },
  {
    id: "rules-out-drawer",
    title: "Ruled out on air",
    phases: ["forming"],
    ideological: true,
    weight: (state, drawerKey) => (rulesOutTargets(state, drawerKey).length > 0 ? 2 : 0),
    play: (state, rng, drawerKey) => {
      const targets = rulesOutTargets(state, drawerKey);
      if (targets.length === 0) return null;
      const refuser = rng.pick(targets);
      const drawer = playerOf(state, drawerKey);
      const own = state.parties[drawer.partyKey];
      const turns = rng.int(2, 5);
      refuser.refusals.push({ partyKey: own.key, until: state.turn + turns });
      return `${refuser.name} rules out sitting under ${own.name} — "not in this parliament, not at any price." ${turns} turns.`;
    },
  },
  {
    id: "bloc-swing",
    title: "The country moves",
    phases: ["forming", "governing"],
    ideological: true,
    weight: (state) => (swingPairs(state).length > 0 ? 1.5 : 0),
    play: (state, rng) => {
      const pairs = swingPairs(state);
      if (pairs.length === 0) return null;
      const [gaining, losing] = rng.pick(pairs);
      let moved = 0;
      for (const donor of losing) {
        if (moved >= 4) break;
        const beneficiary = gaining[moved % gaining.length];
        moved += moveSeats(donor, beneficiary, rng.int(1, 2));
      }
      if (moved === 0) return null;
      const gainingBloc = BLOC_LABEL[gaining[0].bloc];
      return `The mood shifts. ${moved} mandates move toward the ${gainingBloc.toLowerCase()}.`;
    },
  },
  {
    id: "religious-demand",
    title: "A rabbinical ruling",
    phases: ["forming", "governing"],
    ideological: true,
    weight: (state) => (religiousDemandTargets(state).length > 0 ? 1.5 : 0),
    play: (state, rng) => {
      const targets = religiousDemandTargets(state);
      if (targets.length === 0) return null;
      const party = rng.pick(targets);
      const opposed = Object.values(state.parties).filter((candidate) =>
        opposedBloc(party.bloc).includes(candidate.bloc),
      );
      if (opposed.length === 0) return null;
      const turns = rng.int(3, 6);
      for (const other of opposed) {
        party.refusals.push({ partyKey: other.key, until: state.turn + turns });
      }
      return `A rabbinical ruling binds ${party.name}: no government alongside ${opposed.map((p) => p.name).join(" or ")}, for ${turns} turns.`;
    },
  },
];

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

const partnersOf = (state: GameState): Party[] =>
  state.primeMinister
    ? blocParties(state, state.primeMinister).filter((party) =>
        state.primeMinister ? party.key !== playerOf(state, state.primeMinister).partyKey : false,
      )
    : [];

const splitCandidates = (state: GameState): Party[] =>
  Object.values(state.parties).filter(
    (party) => party.seats >= 8 && !isLedByPlayer(state, party.key),
  );

const mergeCandidates = (state: GameState): Array<[Party, Party]> => {
  const pairs: Array<[Party, Party]> = [];
  const pool = unaligned(state);
  for (const a of pool) {
    for (const b of pool) {
      if (a.key === b.key || a.bloc !== b.bloc) continue;
      if (a.seats >= b.seats) pairs.push([a, b]);
    }
  }
  return pairs;
};

const redLineCandidates = (state: GameState): Array<[Party, Party]> => {
  const pairs: Array<[Party, Party]> = [];
  for (const refuser of Object.values(state.parties)) {
    if (isLedByPlayer(state, refuser.key)) continue;
    for (const target of Object.values(state.parties)) {
      if (target.key === refuser.key) continue;
      if (!opposedBloc(refuser.bloc).includes(target.bloc)) continue;
      if (refuser.refusals.some((refusal) => refusal.partyKey === target.key)) continue;
      pairs.push([refuser, target]);
    }
  }
  return pairs;
};

const rulesOutTargets = (state: GameState, drawerKey: string): Party[] => {
  const drawer = state.players.find((player) => player.key === drawerKey);
  if (!drawer) return [];
  const own = state.parties[drawer.partyKey];
  if (!own) return [];
  return biddableParties(state).filter(
    (party) =>
      opposedBloc(party.bloc).includes(own.bloc) &&
      !party.refusals.some((refusal) => refusal.partyKey === own.key),
  );
};

const religiousDemandTargets = (state: GameState): Party[] =>
  Object.values(state.parties).filter(
    (party) => party.bloc === "haredi" && !isLedByPlayer(state, party.key),
  );

const swingPairs = (state: GameState): Array<[Party[], Party[]]> => {
  const byBloc = new Map<Bloc, Party[]>();
  for (const party of Object.values(state.parties)) {
    byBloc.set(party.bloc, [...(byBloc.get(party.bloc) ?? []), party]);
  }
  const pairs: Array<[Party[], Party[]]> = [];
  for (const [bloc, gaining] of byBloc) {
    const losing = Object.values(state.parties).filter(
      (party) => opposedBloc(bloc).includes(party.bloc) && party.seats > 2,
    );
    if (gaining.length > 0 && losing.length > 0) pairs.push([gaining, losing]);
  }
  return pairs;
};

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Draw and resolve one card for a player.
 *
 * Anything that would leave the board unplayable — no parties left to bid for —
 * is rolled back and treated as a quiet turn instead.
 */
export const drawCard = (
  state: GameState,
  rng: Rng,
  drawerKey: string,
): { title: string; text: string } | null => {
  const playable = CARDS.filter(
    (card) => card.phases.includes(state.phase) && card.weight(state, drawerKey) > 0,
  );
  if (playable.length === 0) return null;

  const snapshot = JSON.stringify({
    parties: state.parties,
    ministries: state.ministries,
    players: state.players,
    emergencyUntil: state.emergencyUntil,
    governmentYears: state.governmentYears,
  });

  const card = rng.weighted(playable, (candidate) => candidate.weight(state, drawerKey));
  const text = card.play(state, rng, drawerKey);

  const stillPlayable =
    biddableParties(state).length > 0 &&
    state.ministries.length > 0 &&
    Object.values(state.parties).reduce((sum, party) => sum + party.seats, 0) > 0;

  if (text === null || !stillPlayable) {
    const restored = JSON.parse(snapshot) as Pick<
      GameState,
      "parties" | "ministries" | "players" | "emergencyUntil" | "governmentYears"
    >;
    state.parties = restored.parties;
    state.ministries = restored.ministries;
    state.players = restored.players;
    state.emergencyUntil = restored.emergencyUntil;
    state.governmentYears = restored.governmentYears;
    return null;
  }

  return { title: card.title, text };
};

/** Drop refusals that have run their course, so red lines really do lapse. */
export const expireRefusals = (state: GameState): void => {
  for (const party of Object.values(state.parties)) {
    party.refusals = party.refusals.filter((refusal) => refusal.until > state.turn);
  }
};

/** Exported for the balance probe: how close a player is to a majority. */
export const majorityGap = (state: GameState, playerKey: string): number =>
  Math.max(0, 61 - blocSeats(state, playerKey));
