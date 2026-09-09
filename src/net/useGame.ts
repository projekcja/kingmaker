/** React binding over a {@link Transport}: load, replay, submit, stay in sync. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { validateOffer } from "../engine/allocation";
import type { Action } from "../engine/campaign";
import { pendingSeat } from "../engine/campaign";
import type { GameState, Offer } from "../engine/types";
import { LocalTransport } from "./localTransport";
import { ReplayError, replay } from "./replay";
import type { GameRecord, Transport } from "./transport";

/** Swapping this for a hosted store is the whole of the multiplayer upgrade. */
export const transport: Transport = new LocalTransport();

export interface Game {
  record: GameRecord | null;
  actions: Action[];
  state: GameState | null;
  error: string | null;
  loading: boolean;
  /** Seal this turn’s offers and let the turn resolve. */
  commit: (offer: Offer) => Promise<void>;
  reload: () => Promise<void>;
}

export const useGame = (id: string | null): Game => {
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Which campaign the loaded record actually belongs to.
   *
   * `loading` is raised in an effect, and effects run after the render that
   * changed the id — so for exactly one render after switching campaigns this
   * hook was still holding the previous campaign's record and replaying it.
   * The caller drew the old board, and the old reveal on top of it. Comparing
   * what is loaded against what was asked for is checked during the render
   * rather than after it, so there is no frame in which the answer is wrong.
   */
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) {
      setRecord(null);
      setActions([]);
      setLoadedId(null);
      setLoading(false);
      return;
    }
    const [nextRecord, nextActions] = await Promise.all([
      transport.getGame(id),
      transport.listActions(id),
    ]);
    setRecord(nextRecord);
    setActions(nextActions);
    setLoadedId(id);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (!id) return;
    return transport.subscribe(id, () => void reload());
  }, [id, reload]);

  const stale = loadedId !== id;

  const replayed = useMemo(() => {
    if (!record || stale) return { state: null, replayError: null as string | null };
    try {
      return { state: replay(record, actions), replayError: null };
    } catch (caught) {
      const message =
        caught instanceof ReplayError
          ? caught.message
          : "This saved campaign could not be replayed.";
      return { state: null, replayError: message };
    }
  }, [record, actions, stale]);

  const commit = useCallback(
    async (offer: Offer) => {
      if (!id || !replayed.state) return;
      const state = replayed.state;
      // Whoever is owed a move this turn — which with two players at one
      // keyboard is not always the same seat.
      const seat = pendingSeat(state);
      if (!seat) return;

      const problems = validateOffer(state, seat.key, offer);
      if (problems.length > 0) {
        setError(problems[0].message);
        return;
      }
      setError(null);

      const result = await transport.appendAction(id, actions.length, {
        type: "offer",
        playerKey: seat.key,
        offer,
      });
      if (result === "conflict") setError("That turn was already played. Catching up…");
      await reload();
    },
    [id, actions.length, replayed.state, reload],
  );

  return {
    record: stale ? null : record,
    actions: stale ? [] : actions,
    state: replayed.state,
    error: error ?? replayed.replayError,
    loading: loading || stale,
    commit,
    reload,
  };
};
