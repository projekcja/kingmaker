/**
 * The order paper.
 *
 * A government that has bought a majority then has to do something with it,
 * and until this file existed it did not: the governing phase was four years
 * of defending a coalition against a deck of accidents. A year in office now
 * carries one act of legislation — the prime minister picks one of three bills
 * or passes nothing at all, and nothing is the honest choice often enough to
 * be worth leaving on the table.
 *
 * A law is the only part of the game a player aims deliberately. Cards happen
 * to you; a law is chosen, and so it is the only lever through which a player
 * can act on the *board* rather than on the auction. Three kinds, and they are
 * deliberately different in when they pay:
 *
 *   - **Ballot laws** change what the country votes for, and pay at the next
 *     election. They are a bet on still being here to collect.
 *   - **Mood laws** change what your partners cost, and pay next turn. A
 *     pleased party is dearer to poach; an angry one is on the market at a
 *     discount, including to your rivals.
 *   - **Cabinet laws** change the ministries themselves, and pay for everyone.
 *     Creating an office hands every player a portfolio; abolishing one takes
 *     it out of every package on the board, including the ones holding your own
 *     coalition together. These are the laws that can go wrong.
 *
 * A law never touches seats directly. Everything it does goes through a
 * statute, a mood or the ministry list, all of which existing machinery already
 * reads — see {@link ./types.packageValue} and {@link ./campaign.rollSeats}.
 * Nothing in the auction has heard of legislation.
 */

import { EXTRA_MINISTRIES } from "./ministries";
import type { Bloc } from "./parties";
import { BLOC_LABEL } from "./parties";
import type { Rng } from "./rng";
import type { GameState, Party } from "./types";
import { TheList, blocParties, ministryByKey, playerOf, theList } from "./types";

/** How long a ballot law keeps tilting the vote, in turns. */
const STATUTE_LIFE = 6;

/** How long a party stays pleased or furious about something, in turns. */
const MOOD_LIFE = 3;

export interface Law {
  id: string;
  title: string;
  /** One line, in the game's own terms, of what passing it does. */
  effect: string;
  /** Which of the three kinds it is; the interface groups by this. */
  kind: "ballot" | "mood" | "cabinet";
  /**
   * Who it is good and bad for, declared rather than inferred.
   *
   * The effects themselves live in `enact` as closures, which no bot can read.
   * Rather than have the rivals legislate at random — a prime minister picking
   * a bill by coin toss is worse than one that never legislates — the politics
   * of each law is stated here for them to score against. Nothing else reads
   * these: they are not the effect, they are a summary of it, and they have to
   * be kept honest by hand.
   */
  favours?: Bloc[];
  harms?: Bloc[];
  /**
   * Whether it can be put on the order paper at all right now.
   *
   * A bill that would fizzle is worse than a bill that is merely a bad idea:
   * the player spends their one act of the year on it and nothing happens. So
   * anything whose subject might not exist — a bloc with no lists on the board,
   * two ministries to merge, a partner to please — checks for it here rather
   * than discovering it in `enact`.
   */
  available: (state: GameState, pmKey: string) => boolean;
  /** Pass it. Returns the line for the log. */
  enact: (state: GameState, rng: Rng, pmKey: string) => string;
}

// ---------------------------------------------------------------------------
// The machinery a law acts through
// ---------------------------------------------------------------------------

/** Every list on the board sitting in one of these blocs. */
const inBlocs = (state: GameState, blocs: Bloc[]): Party[] =>
  Object.values(state.parties).filter((party) => blocs.includes(party.bloc));

/** Put a statute on the books. */
const tilt = (
  state: GameState,
  law: Pick<Law, "id" | "title">,
  amounts: Partial<Record<Bloc, number>>,
): void => {
  state.statutes.push({
    lawId: law.id,
    title: law.title,
    tilt: amounts,
    until: state.turn + STATUTE_LIFE,
  });
};

/**
 * Set a party's mood.
 *
 * Later feelings replace earlier ones rather than stacking: a party that has
 * been given something and then legislated against is not neutral, it is
 * furious about the most recent thing, which is how politics actually works and
 * also keeps the multiplier inside a range the auction can survive.
 */
const feel = (state: GameState, party: Party, delta: number, because: string): void => {
  state.moods[party.key] = { delta, until: state.turn + MOOD_LIFE, because };
};

/** Everything in the prime minister's coalition except their own list. */
const partners = (state: GameState, pmKey: string): Party[] => {
  const pm = playerOf(state, pmKey);
  return blocParties(state, pmKey).filter((party) => party.key !== pm.partyKey);
};

/** A phrase for a set of lists: "Shas", "Shas and Ra'am", "four partners". */
const listOf = (parties: Party[]): string => {
  if (parties.length === 0) return "nobody";
  if (parties.length === 1) return parties[0].name;
  if (parties.length === 2) return `${parties[0].name} and ${parties[1].name}`;
  return `${parties.slice(0, -1).map((party) => party.name).join(", ")} and ${parties[parties.length - 1].name}`;
};

/**
 * Rewrite every package that mentions these portfolios.
 *
 * The one dangerous operation in the file. Ministries are referenced by key
 * from inside coalition agreements, so removing one without sweeping the
 * packages leaves parties held by portfolios that no longer exist — worth
 * nothing, and therefore silently free for anyone to take. Merging redirects to
 * the new office; abolishing drops it and leaves the partner on a thinner deal
 * than it agreed to, which is exactly the risk of voting for one.
 */
const rewritePackages = (state: GameState, from: string[], to: string | null): void => {
  const gone = new Set(from);
  const touched = Object.values(state.parties).filter((party) =>
    party.package.some((key) => gone.has(key)),
  );

  /*
   * A merger maps two keys onto one, and that is where a portfolio can end up
   * promised twice.
   *
   * Abolition is safe: it maps to nothing, and a portfolio that was in one
   * package is now in none. But if a player has paid one partner with Tourism
   * and another with Science, and the two are merged, then redirecting both
   * packages puts the single merged office inside both of them — the same
   * portfolio holding up two parties at once, which is the one thing the whole
   * budget is built to prevent, and worth a great deal more than it cost.
   *
   * There is one merged ministry, so one package gets it: whichever held the
   * senior half, `from[0]` by construction at both call sites. Everyone else
   * loses the portfolio outright and is left on a thinner deal, which is the
   * ordinary risk of voting for a cabinet law.
   */
  const senior =
    touched.find((party) => party.package.includes(from[0])) ?? touched[0] ?? null;

  for (const party of touched) {
    const kept = party.package.filter((key) => !gone.has(key));
    if (to && party === senior && !kept.includes(to)) kept.push(to);
    party.package = kept;
  }
};

/** Two ministries nobody would miss individually, for a merger. */
const mergeable = (state: GameState): [string, string] | null => {
  const ladder = [...state.ministries].sort((a, b) => a.budget - b.budget);
  if (ladder.length < 4) return null;
  return [ladder[0].key, ladder[1].key];
};

// ---------------------------------------------------------------------------
// The pool
// ---------------------------------------------------------------------------

export const LAWS: Law[] = [
  // ------------------------------------------------------------- ballot laws
  {
    id: "conscription",
    title: "The Conscription Law",
    kind: "ballot",
    favours: ["centre", "right"],
    harms: ["haredi"],
    effect: "Haredi lists lose ground at the next elections; the centre and the right gain. Your haredi partners will not forgive it.",
    available: (state) => inBlocs(state, ["haredi"]).length > 0,
    enact: (state, _rng, pmKey) => {
      const law = { id: "conscription", title: "The Conscription Law" };
      tilt(state, law, { haredi: 0.78, centre: 1.12, right: 1.06 });
      const hit = inBlocs(state, ["haredi"]);
      for (const party of hit) feel(state, party, -0.4, "the Conscription Law");
      const mine = hit.filter((party) => party.heldBy === pmKey);
      return (
        `The Conscription Law passes. Yeshiva exemptions are written out of the statute book, and ${listOf(hit)} ` +
        `${hit.length === 1 ? "calls" : "call"} it a decree of religious persecution.` +
        (mine.length > 0 ? ` ${listOf(mine)} ${mine.length === 1 ? "is" : "are"} in your own coalition.` : "")
      );
    },
  },
  {
    id: "yeshiva-funding",
    title: "The Yeshiva Stipends Act",
    kind: "ballot",
    favours: ["haredi"],
    harms: ["centre"],
    effect: "Haredi lists gain at the next elections and are delighted with you; the centre loses and is not.",
    available: (state) => inBlocs(state, ["haredi"]).length > 0,
    enact: (state) => {
      const law = { id: "yeshiva-funding", title: "The Yeshiva Stipends Act" };
      tilt(state, law, { haredi: 1.22, centre: 0.92 });
      const pleased = inBlocs(state, ["haredi"]);
      for (const party of pleased) feel(state, party, 0.32, "the Yeshiva Stipends Act");
      for (const party of inBlocs(state, ["centre"])) feel(state, party, -0.18, "the Yeshiva Stipends Act");
      return `The Yeshiva Stipends Act passes. ${listOf(pleased)} ${pleased.length === 1 ? "gets" : "get"} the budget line restored in full, and the papers spend a week counting it.`;
    },
  },
  {
    id: "regularisation",
    title: "The Regularisation Law",
    kind: "ballot",
    favours: ["right"],
    harms: ["left", "arab"],
    effect: "The right gains at the next elections; the left and the Arab lists lose, and are furious.",
    available: (state) => inBlocs(state, ["right"]).length > 0,
    enact: (state) => {
      tilt(state, { id: "regularisation", title: "The Regularisation Law" }, { right: 1.16, left: 0.88, arab: 0.9 });
      const angry = inBlocs(state, ["arab", "left"]);
      for (const party of angry) feel(state, party, -0.35, "the Regularisation Law");
      for (const party of inBlocs(state, ["right"])) feel(state, party, 0.22, "the Regularisation Law");
      return "The Regularisation Law passes on its third reading. The outposts are legalised retroactively, the attorney general declines to defend it in court, and it is on the docket before the week is out.";
    },
  },
  {
    id: "arab-towns",
    title: "The Five-Year Plan for the Arab Towns",
    kind: "ballot",
    favours: ["arab"],
    harms: ["right"],
    effect: "The Arab lists gain at the next elections and are delighted; the hard right loses ground.",
    available: (state) => inBlocs(state, ["arab"]).length > 0,
    enact: (state) => {
      tilt(state, { id: "arab-towns", title: "The Five-Year Plan for the Arab Towns" }, { arab: 1.2, right: 0.94 });
      const pleased = inBlocs(state, ["arab"]);
      for (const party of pleased) feel(state, party, 0.34, "the Five-Year Plan");
      return `Fifteen billion over five years for infrastructure, policing and planning in the Arab towns. ${listOf(pleased)} can point at something, which is the thing ${pleased.length === 1 ? "it has" : "they have"} never been able to do.`;
    },
  },
  {
    id: "nation-state",
    title: "The Nation-State Basic Law",
    kind: "ballot",
    favours: ["right", "haredi"],
    harms: ["arab", "left"],
    effect: "The right and the religious gain at the next elections; the Arab lists lose, and will not sit with you afterwards.",
    available: (state) => inBlocs(state, ["right"]).length > 0 && inBlocs(state, ["arab"]).length > 0,
    enact: (state) => {
      tilt(state, { id: "nation-state", title: "The Nation-State Basic Law" }, { right: 1.14, haredi: 1.08, arab: 0.86, left: 0.94 });
      const angry = inBlocs(state, ["arab"]);
      for (const party of angry) feel(state, party, -0.45, "the Nation-State Basic Law");
      return `A basic law defines the state's character and demotes Arabic from an official language. ${listOf(angry)} ${angry.length === 1 ? "walks" : "walk"} out of the chamber before the vote is called.`;
    },
  },
  {
    id: "override",
    title: "The Override Clause",
    kind: "ballot",
    favours: ["right"],
    harms: ["centre"],
    effect: "The right gains at the next elections; the centre loses. Every centre party on the board turns against the government.",
    available: (state) => inBlocs(state, ["centre"]).length > 0,
    enact: (state) => {
      tilt(state, { id: "override", title: "The Override Clause" }, { right: 1.12, centre: 0.86 });
      const angry = inBlocs(state, ["centre"]);
      for (const party of angry) feel(state, party, -0.38, "the Override Clause");
      return "The Knesset takes the power to re-pass any law the court strikes down, by sixty-one votes. There are a quarter of a million people on the roads by the weekend.";
    },
  },
  {
    id: "cost-of-living",
    title: "The Cost of Living Act",
    kind: "ballot",
    favours: ["centre", "left"],
    harms: ["right"],
    effect: "The centre and the left gain at the next elections. Nobody is angry, and nobody is grateful either.",
    available: () => true,
    enact: (state) => {
      tilt(state, { id: "cost-of-living", title: "The Cost of Living Act" }, { centre: 1.14, left: 1.1, right: 0.96 });
      return "Import barriers on food and appliances come down, the standards institute loses its veto, and the price of everything in a supermarket falls about nine per cent. It is the most popular thing the government does and nobody remembers who did it.";
    },
  },
  {
    id: "security-budget",
    title: "The Defence Supplement",
    kind: "ballot",
    favours: ["right"],
    harms: ["left"],
    effect: "The right gains at the next elections and every right-wing partner is pleased; the left loses.",
    available: (state) => inBlocs(state, ["right"]).length > 0,
    enact: (state) => {
      tilt(state, { id: "security-budget", title: "The Defence Supplement" }, { right: 1.13, left: 0.92 });
      for (const party of inBlocs(state, ["right"])) feel(state, party, 0.2, "the Defence Supplement");
      return "A supplementary defence budget passes outside the ordinary framework, as supplementary defence budgets always do. Nobody votes against it and nobody says where it came from.";
    },
  },
  {
    id: "civil-marriage",
    title: "The Civil Union Law",
    kind: "ballot",
    favours: ["centre", "left"],
    harms: ["haredi"],
    effect: "The centre and the left gain heavily at the next elections. The haredi lists will be unbuyable for a while.",
    available: (state) => inBlocs(state, ["haredi"]).length > 0,
    enact: (state) => {
      tilt(state, { id: "civil-marriage", title: "The Civil Union Law" }, { centre: 1.18, left: 1.14, haredi: 0.84 });
      const angry = inBlocs(state, ["haredi"]);
      for (const party of angry) feel(state, party, -0.5, "the Civil Union Law");
      return `Civil unions are recognised for the first time and the rabbinate's monopoly on marriage ends. ${listOf(angry)} ${angry.length === 1 ? "declares" : "declare"} the government illegitimate from the podium.`;
    },
  },

  // --------------------------------------------------------------- mood laws
  {
    id: "coalition-funds",
    title: "The Coalition Funds Bill",
    kind: "mood",
    effect: "Every partner in your coalition is pleased, and gets markedly dearer for anyone to poach.",
    available: (state, pmKey) => partners(state, pmKey).length > 0,
    enact: (state, _rng, pmKey) => {
      const paid = partners(state, pmKey);
      for (const party of paid) feel(state, party, 0.35, "the coalition funds");
      return `Three hundred million in discretionary coalition funds is voted through in a single line of the budget. ${listOf(paid)} ${paid.length === 1 ? "signs" : "sign"} for it without reading it, and would be embarrassed to leave now.`;
    },
  },
  {
    id: "austerity",
    title: "The Arrangements Law",
    kind: "mood",
    effect: "Every party on the board is annoyed — yours, theirs, everyone's — and every coalition gets cheaper to raid.",
    available: () => true,
    enact: (state) => {
      for (const party of Object.values(state.parties)) feel(state, party, -0.22, "the Arrangements Law");
      return "The Arrangements Law goes through attached to the budget, as it does every year, carrying two hundred pages of unrelated cuts that nobody has read. Every ministry loses something and every party has a grievance.";
    },
  },
  {
    id: "sectoral-budget",
    title: "A sectoral budget",
    kind: "mood",
    effect: "Your largest partner is delighted and becomes very expensive to take. Everyone else in the coalition resents it.",
    available: (state, pmKey) => partners(state, pmKey).length > 1,
    enact: (state, _rng, pmKey) => {
      const paid = [...partners(state, pmKey)].sort((a, b) => b.seats - a.seats);
      const [favoured, ...rest] = paid;
      if (!favoured) return "The sectoral budget is withdrawn before the vote.";
      feel(state, favoured, 0.55, "a sectoral budget written for them");
      for (const party of rest) feel(state, party, -0.2, "a sectoral budget written for somebody else");
      return `A sectoral budget is written more or less to ${theList(favoured.name)}'s dictation. ${TheList(favoured.name)} is now very hard to buy away from you, and ${listOf(rest)} ${rest.length === 1 ? "has" : "have"} noticed what a coalition agreement is worth.`;
    },
  },
  {
    id: "opposition-funds",
    title: "The Party Financing Amendment",
    kind: "mood",
    effect: "Every list nobody holds is pleased, and gets dearer for your rivals to pick up as well as you.",
    available: (state) => Object.values(state.parties).some((party) => party.heldBy === null),
    enact: (state) => {
      const loose = Object.values(state.parties).filter((party) => party.heldBy === null);
      for (const party of loose) feel(state, party, 0.3, "the financing amendment");
      return `Per-mandate party financing is raised for every list in the house. The lists nobody has bought can afford to hold out, and ${listOf(loose)} ${loose.length === 1 ? "does" : "do"} exactly that.`;
    },
  },
  {
    id: "recall-inquiry",
    title: "A commission of inquiry",
    kind: "mood",
    effect: "One list outside your coalition is put under investigation and becomes cheap for anybody to buy — including you.",
    available: (state, pmKey) =>
      Object.values(state.parties).some((party) => party.heldBy !== pmKey && !party.heldBy),
    enact: (state, rng, pmKey) => {
      const outside = Object.values(state.parties).filter(
        (party) => party.heldBy !== pmKey && !party.heldBy,
      );
      if (outside.length === 0) return "The commission of inquiry is voted down.";
      const target = rng.pick(outside);
      feel(state, target, -0.5, "the commission of inquiry");
      return `A state commission of inquiry is voted into being, and its terms of reference happen to describe ${theList(target.name)} precisely. ${TheList(target.name)} is going cheap while it sits — to everyone, not only to you.`;
    },
  },

  // ------------------------------------------------------------- cabinet laws
  {
    id: "new-office",
    title: "A new ministry is created",
    kind: "cabinet",
    effect: "A nineteenth portfolio, in everybody's hand. More to spend, for you and for every rival.",
    available: (state) =>
      state.ministries.length < 21 &&
      EXTRA_MINISTRIES.some((extra) => !state.ministries.some((m) => m.key === extra.key)),
    enact: (state, rng) => {
      const candidates = EXTRA_MINISTRIES.filter(
        (extra) => !state.ministries.some((ministry) => ministry.key === extra.key),
      );
      const created = rng.pick(candidates);
      state.ministries.push({ ...created });
      return `A ministry of ${created.name} is legislated into existence at ${created.budget}bn, for a coalition partner who wanted the title. It is in everyone's hand from now on, including your rivals'.`;
    },
  },
  {
    id: "merge-offices",
    title: "Two ministries are merged",
    kind: "cabinet",
    effect: "The two smallest offices become one, worth slightly less than the pair. Every package holding either one now holds the merger.",
    available: (state) => mergeable(state) !== null,
    enact: (state) => {
      const pair = mergeable(state);
      if (!pair) return "The merger fails in committee.";
      const [aKey, bKey] = pair;
      const a = ministryByKey(state, aKey);
      const b = ministryByKey(state, bKey);
      if (!a || !b) return "The merger fails in committee.";

      // Slightly less than the sum: an amalgamated ministry is a smaller job
      // than the two it replaces, and a merger that lost nothing would be a
      // free upgrade for whoever happened to hold one of the halves.
      const budget = Math.max(1, Math.round((a.budget + b.budget) * 0.85));
      const key = `${a.key}-${b.key}`;
      const name = `${a.name} & ${b.name}`;
      state.ministries = state.ministries.filter(
        (ministry) => ministry.key !== a.key && ministry.key !== b.key,
      );
      state.ministries.push({ key, name, budget });
      rewritePackages(state, [a.key, b.key], key);
      return `${a.name} and ${b.name} are merged into a single ministry of ${name}, worth ${budget}bn where the two were worth ${a.budget + b.budget}bn between them. Every coalition agreement in the house that named either one now names the merger.`;
    },
  },
  {
    id: "abolish-office",
    title: "A ministry is abolished",
    kind: "cabinet",
    effect: "One office is closed and struck out of every coalition agreement on the board — yours included. Partners paid with it get cheaper.",
    available: (state) => state.ministries.length > 12,
    enact: (state, rng) => {
      // Never the top of the ladder: abolishing Defense would decide the game
      // on one card, and no cabinet has ever done it.
      const candidates = [...state.ministries]
        .sort((a, b) => a.budget - b.budget)
        .slice(0, Math.max(1, Math.floor(state.ministries.length / 2)));
      const closed = rng.pick(candidates);
      const orphaned = Object.values(state.parties).filter((party) =>
        party.package.includes(closed.key),
      );
      state.ministries = state.ministries.filter((ministry) => ministry.key !== closed.key);
      rewritePackages(state, [closed.key], null);
      return (
        `The ministry of ${closed.name} is wound up and its functions moved into another building. ` +
        (orphaned.length === 0
          ? "Nobody was being paid with it, and nobody objects."
          : `${listOf(orphaned)} ${orphaned.length === 1 ? "was" : "were"} being held with it, and ${orphaned.length === 1 ? "is" : "are"} now on a cheaper deal than ${orphaned.length === 1 ? "it" : "they"} agreed to.`)
      );
    },
  },
  {
    id: "split-office",
    title: "A ministry is split in two",
    kind: "cabinet",
    effect: "One large office becomes two middling ones. More portfolios to go round, each worth less.",
    available: (state) =>
      state.ministries.length < 22 && state.ministries.some((ministry) => ministry.budget >= 10),
    enact: (state, rng) => {
      const big = rng.pick(state.ministries.filter((ministry) => ministry.budget >= 10));
      const half = Math.floor(big.budget / 2);
      const rest = big.budget - half;
      const holders = Object.values(state.parties).filter((party) =>
        party.package.includes(big.key),
      );
      state.ministries = state.ministries.filter((ministry) => ministry.key !== big.key);
      state.ministries.push({ key: `${big.key}-a`, name: `${big.name} (Portfolio)`, budget: rest });
      state.ministries.push({ key: `${big.key}-b`, name: `${big.name} (Deputy)`, budget: half });
      // Whoever held it keeps the senior half; the junior one goes on the market.
      rewritePackages(state, [big.key], `${big.key}-a`);
      return (
        `${big.name} is split into a senior portfolio and a deputy ministry, ${rest}bn and ${half}bn. ` +
        (holders.length > 0
          ? `${listOf(holders)} ${holders.length === 1 ? "keeps" : "keep"} the senior half, and the deputy post is on everybody's table.`
          : "Both halves are on everybody's table.")
      );
    },
  },
  {
    id: "cabinet-cap",
    title: "The Cabinet Size Law",
    kind: "cabinet",
    effect: "The two smallest ministries are abolished outright, everywhere, and stripped out of every agreement in the house.",
    available: (state) => state.ministries.length > 14,
    enact: (state) => {
      const doomed = [...state.ministries].sort((a, b) => a.budget - b.budget).slice(0, 2);
      const keys = doomed.map((ministry) => ministry.key);
      const orphaned = Object.values(state.parties).filter((party) =>
        party.package.some((key) => keys.includes(key)),
      );
      state.ministries = state.ministries.filter((ministry) => !keys.includes(ministry.key));
      rewritePackages(state, keys, null);
      return (
        `A statutory cap on the size of the cabinet passes, to loud approval and quiet horror. ${doomed[0].name} and ${doomed[1].name} cease to exist. ` +
        (orphaned.length === 0
          ? "By luck, nobody was holding a coalition together with either of them."
          : `${listOf(orphaned)} ${orphaned.length === 1 ? "was" : "were"} paid with one of them.`)
      );
    },
  },
  {
    id: "term-extension",
    title: "A postponement of the elections",
    kind: "cabinet",
    effect: "One year is put back on the clock. The term runs longer and the reckoning is further off.",
    available: (state) => state.governmentYears >= 1,
    enact: (state) => {
      state.governmentYears = Math.max(0, state.governmentYears - 1);
      return "A one-line amendment to the Basic Law postpones the elections by a year, passed at two in the morning by sixty-two votes. It is the least popular thing this government does and the most useful.";
    },
  },
];

export const lawById = (id: string): Law | undefined => LAWS.find((law) => law.id === id);

/**
 * The three bills on this year's order paper.
 *
 * Drawn from what is actually available on this board, so a bill about the
 * haredi parties is not offered in a chamber that has none. Sampling without
 * replacement, and if fewer than three are available the paper is simply
 * shorter — that is a real state of a small board, not a bug to pad around.
 */
export const drawBill = (state: GameState, rng: Rng, pmKey: string): string[] => {
  const open = LAWS.filter((law) => law.available(state, pmKey));
  if (open.length === 0) return [];
  return rng.sample(open, Math.min(3, open.length)).map((law) => law.id);
};

/**
 * Pass one, and record it.
 *
 * Returns the line for the log, or null when the id is not on this year's
 * paper — which is the check that stops a replayed action from legislating
 * something that was never offered.
 */
export const enactLaw = (
  state: GameState,
  rng: Rng,
  pmKey: string,
  lawId: string,
): string | null => {
  if (!state.bill || state.bill.playerKey !== pmKey) return null;
  if (!state.bill.options.includes(lawId)) return null;
  const law = lawById(lawId);
  if (!law) return null;

  /*
   * A bill is drawn at the end of one turn and moved at the end of the next,
   * and a great deal happens in between: a card releases a partner, the
   * coalition breaks, a merger takes a list off the board. So the precondition
   * has to hold when the law is *passed*, not only when it was tabled — a
   * sectoral budget written for the largest partner has nobody to write it for
   * once the last partner has walked, and `enact` would reach for a party that
   * is not there.
   *
   * A bill that has been overtaken by events simply does not pass. That is what
   * happens to real ones, and the turn reports it as a year with no
   * legislation rather than pretending something went through.
   */
  if (!law.available(state, pmKey)) return null;

  const text = law.enact(state, rng, pmKey);
  state.lawsPassed.push({
    id: law.id,
    title: law.title,
    turn: state.turn,
    parliament: state.parliament,
    by: pmKey,
  });
  return text;
};

/** Drop statutes and moods that have run out, so the state stays readable. */
export const expireLegislation = (state: GameState): void => {
  state.statutes = state.statutes.filter((statute) => statute.until > state.turn);
  for (const [key, mood] of Object.entries(state.moods)) {
    if (mood.until <= state.turn) delete state.moods[key];
  }
};

/**
 * The multiplier every list's vote is scaled by, from the statutes in force.
 *
 * Multiplied rather than summed, so two laws pulling the same way compound and
 * two pulling opposite ways cancel out to roughly nothing, which is the honest
 * result of a government that legislated in both directions.
 */
export const ballotTilt = (state: GameState): Record<string, number> => {
  const tilts: Record<string, number> = {};
  for (const party of Object.values(state.parties)) {
    let factor = 1;
    for (const statute of state.statutes) {
      if (statute.until <= state.turn) continue;
      factor *= statute.tilt[party.bloc] ?? 1;
    }
    if (factor !== 1) tilts[party.key] = factor;
  }
  return tilts;
};

/** What the statutes in force are doing, per bloc, for the interface. */
export const statuteSummary = (
  state: GameState,
): Array<{ bloc: Bloc; label: string; factor: number }> => {
  const byBloc = new Map<Bloc, number>();
  for (const statute of state.statutes) {
    if (statute.until <= state.turn) continue;
    for (const [bloc, factor] of Object.entries(statute.tilt) as Array<[Bloc, number]>) {
      byBloc.set(bloc, (byBloc.get(bloc) ?? 1) * factor);
    }
  }
  return [...byBloc.entries()]
    .filter(([, factor]) => Math.abs(factor - 1) > 0.01)
    .map(([bloc, factor]) => ({ bloc, label: BLOC_LABEL[bloc], factor }))
    .sort((a, b) => b.factor - a.factor);
};
