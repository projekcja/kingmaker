/**
 * Which stored report still belongs on screen.
 *
 * The interface holds the open reveal in React state, and React state outlives
 * a campaign: starting a new one changes the id the screen is reading, but it
 * does not unmount the component holding the last one's reveal. Finish a
 * campaign, press "New campaign", play a turn — and the reveal from the
 * campaign before it opened over the new board.
 *
 * So a held report is checked against what the campaign actually last did,
 * rather than trusted because it was true when it was stored. The check is
 * cheap, it is done during the render rather than in an effect afterwards, and
 * it cannot go stale: there is no second copy of the truth to fall out of step.
 */

import type { ElectionResult, GameState, TurnResult } from "../engine/types";

/** The held reveal, if it is this campaign's most recent turn. */
export const currentReveal = (state: GameState, held: TurnResult | null): TurnResult | null =>
  held !== null && state.lastTurn !== null && state.lastTurn.turn === held.turn ? held : null;

/**
 * The held election, if it is this campaign's most recent one.
 *
 * Both the turn and the parliament, because turn numbers restart with every
 * campaign and two campaigns can easily have voted on the same turn.
 */
export const currentElection = (
  state: GameState,
  held: ElectionResult | null,
): ElectionResult | null =>
  held !== null &&
  state.lastElection !== null &&
  state.lastElection.turn === held.turn &&
  state.lastElection.parliament === held.parliament
    ? held
    : null;
