/** React binding over a {@link Transport}: load, replay, submit, stay in sync. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { isValidAllocation } from "../engine/allocation";
import type { Action } from "../engine/campaign";
import type { Allocation, GameState } from "../engine/types";
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
  /** Commit a spread of ministries and let the turn resolve. */
  commit: (allocation: Allocation) => Promise<void>;
  reload: () => Promise<void>;
}

export const useGame = (id: string | null): Game => {
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!id) {
      setRecord(null);
      setActions([]);
      setLoading(false);
      return;
    }
    const [nextRecord, nextActions] = await Promise.all([
      transport.getGame(id),
      transport.listActions(id),
    ]);
    setRecord(nextRecord);
    setActions(nextActions);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (!id) return;
    return transport.subscribe(id, () => void reload());
  }, [id, reload]);

  const replayed = useMemo(() => {
    if (!record) return { state: null, replayError: null as string | null };
    try {
      return { state: replay(record, actions), replayError: null };
    } catch (caught) {
      const message =
        caught instanceof ReplayError
          ? caught.message
          : "This saved campaign could not be replayed.";
      return { state: null, replayError: message };
    }
  }, [record, actions]);

  const commit = useCallback(
    async (allocation: Allocation) => {
      if (!id || !replayed.state) return;
      const state = replayed.state;
      const human = state.players.find((player) => player.kind === "human");
      if (!human) return;

      if (!isValidAllocation(state, human.key, allocation)) {
        setError("Every ministry has to be offered to somebody.");
        return;
      }
      setError(null);

      const result = await transport.appendAction(id, actions.length, {
        type: "commit",
        playerKey: human.key,
        allocation,
      });
      if (result === "conflict") setError("That turn was already played. Catching up…");
      await reload();
    },
    [id, actions.length, replayed.state, reload],
  );

  return {
    record,
    actions,
    state: replayed.state,
    error: error ?? replayed.replayError,
    loading,
    commit,
    reload,
  };
};
