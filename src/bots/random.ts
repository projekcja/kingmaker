/**
 * The random bot.
 *
 * Courts a few parties at random and throws a random handful of portfolios at
 * each. It has no plan, which is the point: it is the baseline the greedy bot
 * has to beat decisively for the game to be worth playing.
 */

import type { Rng } from "../engine/rng";
import type { Bid, GameState, Offer } from "../engine/types";
import { OFFERS_PER_TURN, biddableParties, emptyOffer, freeMinistries } from "../engine/types";

/**
 * Whatever is on the paper, or nothing, with no thought behind it.
 *
 * Not `preferredLaw`: this bot is the baseline, and a baseline that legislates
 * as well as the good bots does is not measuring what it is for. It still has
 * to answer, though — a seat that names no law forfeits the government's one
 * act of the year, and that is a handicap rather than a strategy.
 */
const randomLaw = (state: GameState, playerKey: string, rng: Rng): string | null => {
  const bill = state.bill;
  if (!bill || bill.playerKey !== playerKey || bill.options.length === 0) return null;
  return rng.pick([...bill.options, null]);
};

export const randomOffer = (state: GameState, playerKey: string, rng: Rng): Offer => {
  const law = randomLaw(state, playerKey, rng);
  const targets = biddableParties(state).filter((party) => party.heldBy !== playerKey);
  let hand = freeMinistries(state, playerKey);
  if (targets.length === 0 || hand.length === 0) return { ...emptyOffer(), law };

  const chosen = rng.sample(targets, Math.min(OFFERS_PER_TURN, targets.length));
  const bids: Bid[] = [];

  for (const party of chosen) {
    if (hand.length === 0) break;
    const count = rng.int(1, Math.min(hand.length, 4));
    const ministries = rng.sample(hand, count);
    // A portfolio promised here cannot also be promised next door.
    hand = hand.filter((key) => !ministries.includes(key));
    bids.push({ partyKey: party.key, ministries });
  }

  return { bids, withdrawFrom: [], law };
};
