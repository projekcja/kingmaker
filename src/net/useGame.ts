/** React binding over a {@link Transport}: load, replay, submit, stay in sync. */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Action } from "../engine/actions";
import { isLegal } from "../engine/actions";
import type { GameState } from "../engine/types";
import { playerId } from "./identity";
import { LocalTransport } from "./localTransport";
import { replayWithLast, ReplayError } from "./replay";
import type { GameRecord, Transport } from "./transport";

/** Swapping this for a hosted store is the whole of the multiplayer upgrade. */
export const transport: Transport = new LocalTransport();

export interface Game {
  record: GameRecord | null;
  actions: Action[];
  state: GameState | null;
  lastMessage: string | null;
  error: string | null;
  loading: boolean;
  /** Play a move. Rejected if it is not this player's turn. */
  submit: (action: Action) => Promise<void>;
  saveRecord: (record: GameRecord) => Promise<void>;
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
    if (!record) return { state: null, lastMessage: null, replayError: null as string | null };
    try {
      const { state, lastMessage } = replayWithLast(record, actions);
      return { state, lastMessage, replayError: null };
    } catch (caught) {
      const message =
        caught instanceof ReplayError ? caught.message : "This saved game could not be replayed.";
      return { state: null, lastMessage: null, replayError: message };
    }
  }, [record, actions]);

  const submit = useCallback(
    async (action: Action) => {
      if (!id || !replayed.state) return;
      if (!isLegal(replayed.state, action, playerId())) {
        setError("It is not your move.");
        return;
      }
      setError(null);
      const result = await transport.appendAction(id, actions.length, action);
      if (result === "conflict") setError("Somebody else moved first. Catching up…");
      await reload();
    },
    [id, actions.length, replayed.state, reload],
  );

  const saveRecord = useCallback(
    async (next: GameRecord) => {
      await transport.saveGame(next);
      await reload();
    },
    [reload],
  );

  return {
    record,
    actions,
    state: replayed.state,
    lastMessage: replayed.lastMessage,
    error: error ?? replayed.replayError,
    loading,
    submit,
    saveRecord,
    reload,
  };
};
