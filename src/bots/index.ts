/** Bot opponents, dispatched by the kind recorded on the player. */

import type { Rng } from "../engine/rng";
import type { GameState, Offer } from "../engine/types";
import { emptyOffer, playerOf } from "../engine/types";
import { greedyOffer } from "./greedy";
import { randomOffer } from "./random";

export { greedyOffer } from "./greedy";
export { randomOffer } from "./random";

/**
 * Decide a bot's move for this turn.
 *
 * Called during resolution with the campaign's own RNG, so bot play is part of
 * the deterministic replay and never needs to be written to the action log.
 */
export const offerFor = (state: GameState, playerKey: string, rng: Rng): Offer => {
  const player = playerOf(state, playerKey);
  switch (player.kind) {
    case "greedy":
      return greedyOffer(state, playerKey, rng);
    case "random":
      return randomOffer(state, playerKey, rng);
    case "human":
      return emptyOffer();
  }
};
