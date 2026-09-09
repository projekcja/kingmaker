/**
 * The greedy bot.
 *
 * It picks a target coalition — the parties it already holds, then the biggest
 * ones going, until they add up to a majority — and spends its three tables
 * buying its way into it.
 *
 * Acquisition comes first and defence gets whatever table is left over. That
 * ordering matters: a two-billion top-up on a party you already hold looks
 * wonderfully efficient next to buying anything, so a bot that ranks the two
 * together will polish its existing coalition forever and never grow it.
 *
 * When nothing in hand buys anything worth having, it walks out on its worst
 * partner and re-spends the proceeds, which is the only way to break a
 * stalemate once every portfolio is locked up.
 */

import type { Rng } from "../engine/rng";
import { cheapestAtLeast } from "./spend";
import type { Bid, GameState, Offer, Party } from "../engine/types";
import {
  OFFERS_PER_TURN,
  biddableParties,
  blocSeats,
  emptyOffer,
  freeMinistries,
  packageValue,
  playerOf,
  refusalsAgainst,
  valueOf,
} from "../engine/types";

/**
 * The dials, in one mutable object so `scripts/tune.ts` can sweep them.
 *
 * Every one of these is a measured number rather than a preference, and the
 * numbers moved when the home party started keeping a share of the cabinet:
 * the purse a bid is priced against is roughly half what it used to be, so
 * anything expressed as a fraction of the purse was quietly re-scaled. They
 * were re-swept after that change rather than reasoned about.
 */
export const GREEDY_TUNING = {
  /**
   * Mandates of headroom to aim past a bare majority.
   *
   * Higher than it looks like it should be. A coalition assembled to exactly 61
   * is one card away from not being one, and the parties that would repair it
   * have all been bought by then. Aiming at 75 costs nothing when the money
   * runs out first anyway, and it is worth about five points a game.
   */
  buffer: 14,

  /**
   * How far past the standing package this bot bids.
   *
   * A rival is bidding blind against it this same turn, so the minimum winning
   * offer wins nothing very often. This is the dial between paying the going
   * rate and paying to be sure, as a fraction of what the party is worth.
   *
   * This was 0.3, measured when a player had the whole cabinet to spend. The
   * home party's claim took half of it, and because the bid is a fraction of
   * the purse rather than a sum, that quietly halved every offer the bot made
   * — it was not being thrifty, it was being priced out. Re-swept against a
   * bot that actually competes for the same lists, the optimum came back at
   * 0.7, worth six points a game against shrewd and nothing at all against
   * random, which never bids for anything it holds.
   */
  aggression: 0.7,

  /**
   * Share of what is left in hand that a defensive top-up costs.
   *
   * Zero measures beautifully against random — 80% against 76% — and is a
   * trap. Random almost never poaches a partner, so against it every shekel
   * spent defending is wasted by construction. Against a bot that does poach,
   * dropping defence costs eight points. It is the clearest case in this file
   * of a dial that must not be tuned against a weak opponent.
   */
  defenceShare: 0.3,
};


const reachable = (state: GameState, playerKey: string): Party[] =>
  biddableParties(state).filter((party) => refusalsAgainst(state, party, playerKey).length === 0);

/** The coalition this bot is trying to build: what it holds, then the biggest. */
const targetCoalition = (state: GameState, playerKey: string): Party[] => {
  const own = state.parties[playerOf(state, playerKey).partyKey]?.seats ?? 0;
  const ranked = [...reachable(state, playerKey)].sort((a, b) => {
    const mine = Number(b.heldBy === playerKey) - Number(a.heldBy === playerKey);
    if (mine !== 0) return mine;
    return b.seats - a.seats;
  });

  const wanted = Math.max(0, 61 - own) + GREEDY_TUNING.buffer;
  const targets: Party[] = [];
  let running = 0;
  for (const party of ranked) {
    if (running >= wanted) break;
    targets.push(party);
    running += party.seats;
  }
  return targets;
};

export const greedyOffer = (state: GameState, playerKey: string, _rng: Rng): Offer => {
  let hand = freeMinistries(state, playerKey);
  if (hand.length === 0) return withdrawToRegroup(state, playerKey);

  const targets = targetCoalition(state, playerKey);
  if (targets.length === 0) return emptyOffer();

  const own = playerOf(state, playerKey).partyKey;
  const held = Object.values(state.parties).filter(
    (party) => party.heldBy === playerKey && party.key !== own,
  );
  const bids: Bid[] = [];

  // A government already stands: every table goes on keeping it standing.
  if (blocSeats(state, playerKey) >= 61) {
    return { bids: defend(state, held, hand, OFFERS_PER_TURN), withdrawFrom: [] };
  }

  // Otherwise, take ground. Cheap top-ups always look efficient next to a
  // purchase, so they never get to compete with one for the first table.
  const shortfall = Math.max(1, 61 - blocSeats(state, playerKey));
  for (let round = 0; round < OFFERS_PER_TURN; round += 1) {
    const budget = valueOf(state, hand);
    if (budget === 0) break;

    const taken = new Set(bids.map((bid) => bid.partyKey));
    let best: { party: Party; ministries: string[]; cost: number } | null = null;

    for (const party of targets) {
      if (party.heldBy === playerKey || taken.has(party.key)) continue;
      const share = Math.min(1, party.seats / shortfall);
      // What the party is worth: its share of the mandates still needed, priced
      // against the whole purse. Then bid a fraction of that, but never less
      // than it takes to beat the package the party is already sitting on.
      const floor = packageValue(state, party.key) + 1;
      const price = Math.max(floor, Math.ceil(budget * share * GREEDY_TUNING.aggression));
      // A party it cannot afford to bid properly for is one to leave alone.
      // Falling back to the minimum that would take it looks thrifty and is
      // fatal: the ranking below is seats per billion, so a bare-minimum bid
      // outranks every real one and the bot spends the campaign being outbid.
      const ministries = cheapestAtLeast(state, hand, price);
      if (!ministries) continue;
      const cost = valueOf(state, ministries);
      if (!best || party.seats / cost > best.party.seats / best.cost) {
        best = { party, ministries, cost };
      }
    }
    if (!best) break;

    const chosen = best;
    bids.push({ partyKey: chosen.party.key, ministries: chosen.ministries });
    hand = hand.filter((key) => !chosen.ministries.includes(key));
  }

  // A spare table is worth spending on the partner that looks cheapest to poach.
  if (bids.length > 0 && bids.length < OFFERS_PER_TURN) {
    const covered = new Set(bids.map((bid) => bid.partyKey));
    bids.push(
      ...defend(
        state,
        held.filter((party) => !covered.has(party.key)),
        hand,
        OFFERS_PER_TURN - bids.length,
      ),
    );
  }

  if (bids.length > 0) return { bids, withdrawFrom: [] };
  return withdrawToRegroup(state, playerKey);
};

/** Top up whichever partners are being paid least for what they bring. */
const defend = (
  state: GameState,
  held: readonly Party[],
  hand: readonly string[],
  slots: number,
): Bid[] => {
  let remaining = [...hand];
  const bids: Bid[] = [];
  const weakest = [...held].sort(
    (a, b) => packageValue(state, a.key) / a.seats - packageValue(state, b.key) / b.seats,
  );

  for (const party of weakest.slice(0, slots)) {
    if (remaining.length === 0) break;
    const share = Math.ceil(valueOf(state, remaining) * GREEDY_TUNING.defenceShare);
    const topUp = cheapestAtLeast(state, remaining, share) ?? [...remaining];
    if (topUp.length === 0) break;
    remaining = remaining.filter((key) => !topUp.includes(key));
    bids.push({ partyKey: party.key, ministries: topUp });
  }
  return bids;
};

/**
 * Nothing in hand buys anything worth having.
 *
 * Walk out on the partner giving the fewest mandates per billion and put the
 * proceeds behind a bigger one — the only way to move a portfolio once it has
 * been promised.
 */
const withdrawToRegroup = (state: GameState, playerKey: string): Offer => {
  const own = playerOf(state, playerKey).partyKey;
  const held = Object.values(state.parties).filter(
    (party) => party.heldBy === playerKey && party.key !== own,
  );
  if (held.length === 0) return emptyOffer();

  const worst = [...held].sort(
    (a, b) =>
      a.seats / Math.max(1, packageValue(state, a.key)) -
      b.seats / Math.max(1, packageValue(state, b.key)),
  )[0];

  const freed = [...freeMinistries(state, playerKey), ...worst.package];
  for (const party of [...reachable(state, playerKey)].sort((a, b) => b.seats - a.seats)) {
    if (party.key === worst.key || party.seats <= worst.seats) continue;
    const ministries = cheapestAtLeast(state, freed, packageValue(state, party.key) + 1);
    if (!ministries) continue;
    return { bids: [{ partyKey: party.key, ministries }], withdrawFrom: [worst.key] };
  }
  return emptyOffer();
};

/** Exposed for the balance probe. */
export const gapToMajority = (state: GameState, playerKey: string): number =>
  Math.max(0, 61 - blocSeats(state, playerKey));
