/**
 * Headless campaign runner.
 *
 * The human seat is driven by whichever strategy is handed in, so the same
 * harness proves the rules terminate, measures greedy against random on
 * identical boards, and — in its async form — sits a language model down at the
 * table without the engine ever learning about it.
 */

import { greedyOffer, randomOffer } from "../src/bots";
import { applyAction, newCampaign } from "../src/engine/campaign";
import type { CampaignOptions } from "../src/engine/campaign";
import { Rng } from "../src/engine/rng";
import type { GameState, Offer } from "../src/engine/types";

export type Strategy = (state: GameState, playerKey: string, rng: Rng) => Offer;

/** A seat that has to be asked, and answers when it is ready. */
export type AsyncStrategy = (state: GameState, playerKey: string, rng: Rng) => Promise<Offer>;

export const STRATEGIES: Record<string, Strategy> = {
  greedy: greedyOffer,
  random: randomOffer,
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

/** The bookkeeping both loops do, kept in one place. */
const tracker = () => {
  let turns = 0;
  let formingTurns = 0;
  let currentRun = 0;
  let longestFormation = 0;

  return {
    tick(state: GameState) {
      turns += 1;
      if (state.phase === "forming") {
        formingTurns += 1;
        currentRun += 1;
        longestFormation = Math.max(longestFormation, currentRun);
      } else {
        currentRun = 0;
      }
    },
    outcome(state: GameState, humanKey: string): CampaignOutcome {
      return {
        state,
        turns,
        finished: state.phase === "over",
        humanWon: state.winner === humanKey,
        formingTurns,
        longestFormation,
      };
    },
  };
};

const humanSeat = (state: GameState) => {
  const human = state.players.find((player) => player.kind === "human");
  if (!human) throw new Error("a campaign always has a human seat");
  return human;
};

/**
 * The strategy driving the human seat gets its own RNG so that it cannot
 * disturb the campaign stream — the bots and the deck must stay exactly where
 * they would have been.
 */
export const strategyRng = (state: GameState) => new Rng((state.seed ^ 0x5f3a) | 0);

/** Play a campaign to its end, or until the cap. */
export const playCampaign = (
  options: CampaignOptions & { strategy?: Strategy; maxTurns?: number } = {},
): CampaignOutcome => {
  const { strategy = greedyOffer, maxTurns = 400, ...campaignOptions } = options;
  let state = newCampaign(campaignOptions);
  const rng = strategyRng(state);
  const human = humanSeat(state);
  const stats = tracker();

  let turns = 0;
  while (state.phase !== "over" && turns < maxTurns) {
    turns += 1;
    stats.tick(state);
    const offer = strategy(state, human.key, rng);
    state = applyAction(state, { type: "offer", playerKey: human.key, offer }).state;
  }

  return stats.outcome(state, human.key);
};

/**
 * The same campaign, for a seat that answers slowly.
 *
 * `onTurn` fires after each resolution, which is how the playtest script keeps
 * a transcript without the strategy having to remember anything.
 */
export const playCampaignAsync = async (
  options: CampaignOptions & {
    strategy: AsyncStrategy;
    maxTurns?: number;
    onTurn?: (state: GameState, offer: Offer) => void;
  },
): Promise<CampaignOutcome> => {
  const { strategy, maxTurns = 60, onTurn, ...campaignOptions } = options;
  let state = newCampaign(campaignOptions);
  const rng = strategyRng(state);
  const human = humanSeat(state);
  const stats = tracker();

  let turns = 0;
  while (state.phase !== "over" && turns < maxTurns) {
    turns += 1;
    stats.tick(state);
    const offer = await strategy(state, human.key, rng);
    state = applyAction(state, { type: "offer", playerKey: human.key, offer }).state;
    onTurn?.(state, offer);
  }

  return stats.outcome(state, human.key);
};
