/**
 * Rebuilding a campaign from what was stored.
 *
 * Nothing about the live state is persisted — only the seed, the setup, and the
 * moves the human made. Because `newCampaign` is deterministic, `applyAction`
 * is pure, and the bots decide from the same seeded stream, folding the action
 * list back over a fresh campaign reproduces it exactly, elections included.
 */

import type { Action } from "../engine/campaign";
import { applyAction, newCampaign } from "../engine/campaign";
import type { GameState } from "../engine/types";
import { RULES_VERSION } from "../engine/types";
import type { GameRecord } from "./transport";

export class ReplayError extends Error {}

const check = (record: GameRecord): void => {
  if (record.rulesVersion !== RULES_VERSION) {
    throw new ReplayError(
      `This campaign was played under rules v${record.rulesVersion}; this build is v${RULES_VERSION}.`,
    );
  }
};

export const startingState = (record: GameRecord): GameState => {
  check(record);
  return newCampaign({
    seed: record.seed,
    humanParty: record.humanParty,
    bots: record.bots,
  });
};

/** Fold a stored action list back into a live campaign. */
export const replay = (record: GameRecord, actions: readonly Action[]): GameState => {
  let state = startingState(record);
  for (const action of actions) {
    if (state.phase === "over") break;
    state = applyAction(state, action).state;
  }
  return state;
};
