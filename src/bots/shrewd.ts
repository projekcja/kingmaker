/**
 * The shrewd bot.
 *
 * Greedy plays solitaire: it picks the biggest parties going and buys its way
 * into them, and nothing it does depends on there being anybody else at the
 * table. That is the gap this one closes. Three differences, all of them in
 * what a party is judged to be worth rather than in how the turn is shaped:
 *
 * 1. **Seats it does not need are worth less.** Greedy ranks by mandates per
 *    billion, so a 33-seat list is always the prize — even when the shortfall
 *    is four and twenty-nine of those mandates buy nothing at all.
 *
 * 2. **Taking a party off a rival is worth something.** A list the leading
 *    rival could have used is worth its seats to them as well as to you, and
 *    the closer they are to 61 the more that matters.
 *
 * 3. **An uncontested party is bought at the going rate.** Greedy bids a share
 *    of its purse at every table. Where no rival can reach a list at all —
 *    priced out, or held off by a red line — there is nobody to outbid, and the
 *    floor takes it.
 *
 * The *shape* of the turn is deliberately greedy's, because that shape is a
 * measured result rather than a preference: acquisition is settled before
 * defence gets a table, since a two-billion top-up on a party already held
 * looks wonderfully efficient beside buying anything, and a bot that ranks the
 * two together polishes its coalition forever and never grows it.
 */

import { MAJORITY } from "../engine/parties";
import { preferredLaw } from "../engine/laws";
import type { Rng } from "../engine/rng";
import { cheapestAtLeast } from "./spend";
import type { Bid, GameState, Offer, Party } from "../engine/types";
import {
  OFFERS_PER_TURN,
  biddableParties,
  blocSeats,
  emptyOffer,
  freeBudget,
  freeMinistries,
  packageValue,
  playerOf,
  refusalsAgainst,
  valueOf,
} from "../engine/types";

/**
 * The dials, in one mutable object so `scripts/tune.ts` can sweep them.
 *
 * Re-swept after the home party started keeping a share of the cabinet, which
 * halved the purse every fraction here is taken of.
 */
export const SHREWD_TUNING = {
  /** Mandates of headroom to aim past a bare majority. */
  buffer: 6,

  /**
   * How far past the standing package to bid, where somebody is competing.
   *
   * Re-swept against greedy after greedy's own aggression was fixed, which is
   * the only honest way to read this number: it is a best response to a
   * particular opponent, not a property of the game, and it moved from 0.3 to
   * 0.55 the moment the opponent stopped underbidding. Worth nine points.
   */
  aggression: 0.55,

  /**
   * What a mandate denied to the leading rival is worth against one gained.
   *
   * Below 1 on purpose: a seat in your own bloc counts toward your 61, and a
   * seat merely kept from somebody else does not.
   *
   * And it does nothing. Swept from 0 to 2.5 the win rate moves between 61.4%
   * and 62.5%, which is the width of the noise — turning the whole idea off is
   * indistinguishable from turning it up fourfold. That is a finding about one
   * of this bot's three headline ideas and it is left here rather than tidied
   * away: denial is not what makes shrewd better than greedy, and anyone
   * looking for another few points should not look here. Kept at the documented
   * value because there is no evidence for moving it either.
   */
  denial: 0.6,

  /** Share of what is left in hand that a defensive top-up costs. */
  defenceShare: 0.3,
};


const reachable = (state: GameState, playerKey: string): Party[] =>
  biddableParties(state).filter((party) => refusalsAgainst(state, party, playerKey).length === 0);

/** The rival closest to a majority — the only one worth playing against. */
const chiefRival = (
  state: GameState,
  playerKey: string,
): { key: string; seats: number } | null =>
  state.players
    .filter((player) => player.key !== playerKey)
    .map((player) => ({ key: player.key, seats: blocSeats(state, player.key) }))
    .sort((a, b) => b.seats - a.seats)[0] ?? null;

/**
 * Whether a rival could actually take this party if they wanted it.
 *
 * Both halves matter. A red line means no amount of money moves them, and a
 * purse too small to beat the standing package means the same thing for this
 * turn. Either way there is nobody to outbid, and paying to be sure is paying
 * for nothing.
 */
const contestedBy = (state: GameState, party: Party, rivalKey: string | null): boolean => {
  if (!rivalKey) return false;
  // Already theirs: taking it means outbidding a holder, which is the most
  // contested a party gets.
  if (party.heldBy === rivalKey) return true;
  if (refusalsAgainst(state, party, rivalKey).length > 0) return false;
  return freeBudget(state, rivalKey) > packageValue(state, party.key);
};

const shrewdBids = (state: GameState, playerKey: string, _rng: Rng): Offer => {
  let hand = freeMinistries(state, playerKey);
  if (hand.length === 0) return regroup(state, playerKey);

  const own = playerOf(state, playerKey).partyKey;
  const mine = blocSeats(state, playerKey);
  const shortfall = Math.max(0, MAJORITY - mine);
  const rival = chiefRival(state, playerKey);
  const rivalShortfall = rival ? Math.max(0, MAJORITY - rival.seats) : MAJORITY;

  const held = Object.values(state.parties).filter(
    (party) => party.heldBy === playerKey && party.key !== own,
  );
  const bids: Bid[] = [];

  // A government already stands. Defend what actually holds it up, then spend
  // anything left denying the opposition the seats they would need to replace
  // it -- a partner nobody is bidding for does not need topping up.
  if (mine >= MAJORITY) {
    const keeping = defend(state, held, hand, playerKey, mine, OFFERS_PER_TURN);
    const spent = new Set(keeping.flatMap((bid) => bid.ministries));
    const left = hand.filter((key) => !spent.has(key));
    const spare = OFFERS_PER_TURN - keeping.length;
    if (spare <= 0 || left.length === 0) return { bids: keeping, withdrawFrom: [] };
    return {
      bids: [
        ...keeping,
        ...take(state, playerKey, left, spare, new Set(keeping.map((b) => b.partyKey)), {
          shortfall,
          rival,
          rivalShortfall,
        }),
      ],
      withdrawFrom: [],
    };
  }

  bids.push(
    ...take(state, playerKey, hand, OFFERS_PER_TURN, new Set(), {
      shortfall,
      rival,
      rivalShortfall,
    }),
  );

  // Whatever is left over goes on holding what has already been bought.
  const spentKeys = new Set(bids.flatMap((bid) => bid.ministries));
  hand = hand.filter((key) => !spentKeys.has(key));
  if (bids.length > 0 && bids.length < OFFERS_PER_TURN) {
    const covered = new Set(bids.map((bid) => bid.partyKey));
    bids.push(
      ...defend(
        state,
        held.filter((party) => !covered.has(party.key)),
        hand,
        playerKey,
        mine,
        OFFERS_PER_TURN - bids.length,
      ),
    );
  }

  if (bids.length > 0) return { bids, withdrawFrom: [] };
  return regroup(state, playerKey);
};

/** Court up to `slots` parties, best value for money first. */
const take = (
  state: GameState,
  playerKey: string,
  startingHand: readonly string[],
  slots: number,
  already: Set<string>,
  position: {
    shortfall: number;
    rival: { key: string; seats: number } | null;
    rivalShortfall: number;
  },
): Bid[] => {
  let hand = [...startingHand];
  const bids: Bid[] = [];
  const targets = reachable(state, playerKey);

  for (let table = 0; table < slots; table += 1) {
    const purse = valueOf(state, hand);
    if (purse === 0) break;

    let best: { party: Party; ministries: string[]; cost: number; worth: number } | null = null;

    for (const party of targets) {
      if (party.heldBy === playerKey || already.has(party.key)) continue;
      if (bids.some((bid) => bid.partyKey === party.key)) continue;

      // Seats past what a comfortable majority needs buy nothing, so they are
      // not counted. This is the whole of what greedy gets wrong about a very
      // large list when the gap is small.
      const gain = Math.min(party.seats, position.shortfall + SHREWD_TUNING.buffer);
      const contested = contestedBy(state, party, position.rival?.key ?? null);
      const denial = contested ? Math.min(party.seats, position.rivalShortfall) : 0;
      const worth = gain + SHREWD_TUNING.denial * denial;
      if (worth <= 0) continue;

      const floor = packageValue(state, party.key) + 1;
      const share = Math.min(1, party.seats / Math.max(1, position.shortfall));
      // Nobody to outbid means nothing to outbid them with.
      const price = contested
        ? Math.max(floor, Math.ceil(purse * share * SHREWD_TUNING.aggression))
        : floor;

      const ministries = cheapestAtLeast(state, hand, price);
      if (!ministries) continue;
      const cost = valueOf(state, ministries);
      if (!best || worth / cost > best.worth / best.cost) {
        best = { party, ministries, cost, worth };
      }
    }

    if (!best) break;
    const chosen = best;
    bids.push({ partyKey: chosen.party.key, ministries: chosen.ministries });
    hand = hand.filter((key) => !chosen.ministries.includes(key));
  }
  return bids;
};

/**
 * Hold the coalition up.
 *
 * Pivotal first: a partner whose loss drops the bloc under 61 is the government,
 * and one that could go without costing the majority is furniture. Within that,
 * the ones a rival could actually take, and then the ones being paid least for
 * what they bring.
 */
const defend = (
  state: GameState,
  held: readonly Party[],
  hand: readonly string[],
  playerKey: string,
  mine: number,
  slots: number,
): Bid[] => {
  const rival = chiefRival(state, playerKey);
  const rank = (party: Party): number => {
    const pivotal = mine - party.seats < MAJORITY ? 1 : 0;
    const atRisk = contestedBy(state, party, rival?.key ?? null) ? 1 : 0;
    // Paid least for what it brings is the tie-break, not the sort.
    const thin = 1 / (1 + packageValue(state, party.key) / Math.max(1, party.seats));
    return pivotal * 4 + atRisk * 2 + thin;
  };

  let remaining = [...hand];
  const bids: Bid[] = [];
  for (const party of [...held].sort((a, b) => rank(b) - rank(a)).slice(0, slots)) {
    if (remaining.length === 0) break;
    // A partner nobody is bidding for keeps itself; an incumbent only has to
    // match, so there is nothing to defend against.
    if (!contestedBy(state, party, rival?.key ?? null)) continue;
    const topUp = cheapestAtLeast(
      state,
      remaining,
      Math.ceil(valueOf(state, remaining) * SHREWD_TUNING.defenceShare),
    );
    if (!topUp || topUp.length === 0) break;
    remaining = remaining.filter((key) => !topUp.includes(key));
    bids.push({ partyKey: party.key, ministries: topUp });
  }
  return bids;
};

/** Nothing in hand buys anything: walk out on the worst partner and re-spend. */
const regroup = (state: GameState, playerKey: string): Offer => {
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

/**
 * The bidding, plus the year's legislation.
 *
 * A strategy answers for the whole move or it is not answering for the seat:
 * the same function drives a rival here and the player's own seat in every
 * headless run, and a seat that names no law forfeits the government's one act
 * of the year.
 */
export const shrewdOffer = (state: GameState, playerKey: string, rng: Rng): Offer => ({
  ...shrewdBids(state, playerKey, rng),
  law: preferredLaw(state, rng, playerKey),
});
