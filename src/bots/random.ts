/**
 * The random bot.
 *
 * Scatters every ministry onto a party picked at random. It has no plan at all,
 * which is exactly the point: it is the baseline the greedy bot has to beat
 * decisively for the allocation game to be worth playing.
 */

import type { Rng } from "../engine/rng";
import type { Allocation, GameState } from "../engine/types";
import { biddableParties } from "../engine/types";

export const randomAllocation = (state: GameState, _playerKey: string, rng: Rng): Allocation => {
  const targets = biddableParties(state);
  const allocation: Allocation = {};
  if (targets.length === 0) return allocation;

  for (const ministry of state.ministries) {
    allocation[ministry.key] = rng.pick(targets).key;
  }
  return allocation;
};
