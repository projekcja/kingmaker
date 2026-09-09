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

export const randomOffer = (state: GameState, playerKey: string, rng: Rng): Offer => {
  const targets = biddableParties(state).filter((party) => party.heldBy !== playerKey);
  let hand = freeMinistries(state, playerKey);
  if (targets.length === 0 || hand.length === 0) return emptyOffer();

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

  return { bids, withdrawFrom: [] };
};
