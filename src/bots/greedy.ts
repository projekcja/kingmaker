/**
 * The greedy bot.
 *
 * It picks a target coalition — the parties it already holds, then the biggest
 * ones going, until they add up to a majority — and spends its two tables
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
import type { Bid, GameState, Offer, Party } from "../engine/types";
import {
  OFFERS_PER_TURN,
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

/** Mandates of headroom to aim past a bare majority. */
const BUFFER = 6;

/**
 * The cheapest handful of portfolios worth at least `target`.
 *
 * Small ones first, so the great offices stay in hand for the parties that will
 * actually demand them.
 */
const cheapestUpTo = (
  state: GameState,
  hand: readonly string[],
  target: number,
): string[] | null => {
  const sorted = [...hand].sort(
    (a, b) => (ministryByKey(state, a)?.budget ?? 0) - (ministryByKey(state, b)?.budget ?? 0),
  );
  const chosen: string[] = [];
  let total = 0;
  for (const key of sorted) {
    if (total >= target) break;
    chosen.push(key);
    total += ministryByKey(state, key)?.budget ?? 0;
  }
  return total >= target ? chosen : null;
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

  const wanted = Math.max(0, 61 - own) + BUFFER;
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

  // A government already stands: both tables go on keeping it standing.
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
      // Beat what it is already being paid, and put a real share of the purse
      // behind it — a rival is bidding blind against you this same turn.
      const price = Math.max(packageValue(state, party.key) + 1, Math.ceil(budget * share * 0.85));
      const ministries = cheapestUpTo(state, hand, price);
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
    bids.push(...defend(state, held.filter((party) => !covered.has(party.key)), hand, 1));
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
    const share = Math.ceil(valueOf(state, remaining) * 0.3);
    const topUp = cheapestUpTo(state, remaining, share) ?? [...remaining];
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
    const ministries = cheapestUpTo(state, freed, packageValue(state, party.key) + 1);
    if (!ministries) continue;
    return { bids: [{ partyKey: party.key, ministries }], withdrawFrom: [worst.key] };
  }
  return emptyOffer();
};

/** Exposed for the balance probe. */
export const gapToMajority = (state: GameState, playerKey: string): number =>
  Math.max(0, 61 - blocSeats(state, playerKey));
