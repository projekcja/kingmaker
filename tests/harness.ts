/**
 * Headless campaign runner.
 *
 * The human seat is driven by whichever strategy is handed in, so the same
 * harness proves the rules terminate and measures greedy against random on
 * identical boards.
 */

import { greedyAllocation, randomAllocation } from "../src/bots";
import { applyAction, newCampaign } from "../src/engine/campaign";
import type { CampaignOptions } from "../src/engine/campaign";
import { Rng } from "../src/engine/rng";
import type { Allocation, GameState } from "../src/engine/types";

export type Strategy = (state: GameState, playerKey: string, rng: Rng) => Allocation;

export const STRATEGIES: Record<string, Strategy> = {
  greedy: greedyAllocation,
  random: randomAllocation,
};

export interface CampaignOutcome {
  state: GameState;
  turns: number;
  /** True when the human seat banked ten years first. */
  humanWon: boolean;
  finished: boolean;
  /** Turns spent bidding for a majority, as opposed to governing. */
  formingTurns: number;
  /** Weeks the longest single coalition negotiation took. */
  longestFormation: number;
}

/**
 * Play a campaign to its end, or until the cap.
 *
 * The strategy driving the human seat gets its own RNG so that it cannot
 * disturb the campaign's own stream — the bots and the deck must stay exactly
 * where they would have been.
 */
export const playCampaign = (
  options: CampaignOptions & { strategy?: Strategy; maxTurns?: number } = {},
): CampaignOutcome => {
  const { strategy = greedyAllocation, maxTurns = 400, ...campaignOptions } = options;
  let state = newCampaign(campaignOptions);
  const rng = new Rng((state.seed ^ 0x5f3a) | 0);

  const human = state.players.find((player) => player.kind === "human");
  if (!human) throw new Error("a campaign always has a human seat");

  let turns = 0;
  let formingTurns = 0;
  let currentRun = 0;
  let longestFormation = 0;

  while (state.phase !== "over" && turns < maxTurns) {
    turns += 1;
    if (state.phase === "forming") {
      formingTurns += 1;
      currentRun += 1;
      longestFormation = Math.max(longestFormation, currentRun);
    } else {
      currentRun = 0;
    }
    const allocation = strategy(state, human.key, rng);
    state = applyAction(state, { type: "commit", playerKey: human.key, allocation }).state;
  }

  return {
    state,
    turns,
    finished: state.phase === "over",
    humanWon: state.winner === human.key,
    formingTurns,
    longestFormation,
  };
};
