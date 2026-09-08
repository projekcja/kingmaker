/**
 * Rebuilding a game from what was stored.
 *
 * Nothing about the live state is persisted — only the seed and the moves.
 * Because `newGame` is deterministic and `applyAction` is pure, folding the
 * action list back over a fresh game reproduces it exactly, on any machine.
 */

import type { Action } from "../engine/actions";
import { applyAction } from "../engine/actions";
import { newGame } from "../engine/generator";
import type { GameState } from "../engine/types";
import { RULES_VERSION } from "../engine/types";
import type { GameRecord } from "./transport";

export class ReplayError extends Error {}

export const startingState = (record: GameRecord): GameState =>
  newGame({
    seed: record.seed,
    days: record.daysTotal,
    partyCount: record.partyCount,
    totalSeats: record.totalSeats,
    seats: record.seats,
  });

/**
 * Fold a stored action list back into a live game.
 *
 * Illegal moves are skipped rather than thrown on: an action list can outlive
 * a rules change, and a game that loads slightly wrong is more useful than one
 * that will not load at all.
 */
export const replay = (record: GameRecord, actions: readonly Action[]): GameState => {
  if (record.rulesVersion !== RULES_VERSION) {
    throw new ReplayError(
      `This game was played under rules v${record.rulesVersion}; this build is v${RULES_VERSION}.`,
    );
  }

  let state = startingState(record);
  for (const action of actions) {
    if (state.finished) break;
    state = applyAction(state, action).state;
  }
  return state;
};

/** The move that produced the state, for showing the player what just happened. */
export const replayWithLast = (
  record: GameRecord,
  actions: readonly Action[],
): { state: GameState; lastMessage: string | null } => {
  if (record.rulesVersion !== RULES_VERSION) {
    throw new ReplayError(
      `This game was played under rules v${record.rulesVersion}; this build is v${RULES_VERSION}.`,
    );
  }

  let state = startingState(record);
  let lastMessage: string | null = null;
  for (const action of actions) {
    if (state.finished) break;
    const result = applyAction(state, action);
    state = result.state;
    lastMessage = [result.message, ...result.events.map((event) => event.text)]
      .filter(Boolean)
      .join(" ");
  }
  return { state, lastMessage };
};
