/** Bot opponents, dispatched by the kind recorded on the player. */

import type { Rng } from "../engine/rng";
import type { Allocation, GameState } from "../engine/types";
import { playerOf } from "../engine/types";
import { greedyAllocation } from "./greedy";
import { randomAllocation } from "./random";

export { greedyAllocation } from "./greedy";
export { randomAllocation } from "./random";

/**
 * Decide a bot's spread for this turn.
 *
 * Called during resolution with the campaign's own RNG, so bot play is part of
 * the deterministic replay and never needs to be written to the action log.
 */
export const allocateFor = (state: GameState, playerKey: string, rng: Rng): Allocation => {
  const player = playerOf(state, playerKey);
  switch (player.kind) {
    case "greedy":
      return greedyAllocation(state, playerKey, rng);
    case "random":
      return randomAllocation(state, playerKey, rng);
    case "human":
      return {};
  }
};
