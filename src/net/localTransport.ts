/**
 * Browser-local implementation of {@link Transport}.
 *
 * Games live in localStorage, so they survive a refresh, and changes are
 * announced on a BroadcastChannel, so a second tab sees them immediately.
 * That makes two tabs a genuine two-player table: separate identities, real
 * turn passing, real persistence — with nothing to deploy.
 *
 * The key layout mirrors a hosted document store on purpose:
 *
 *   km:game:<id>              the record
 *   km:game:<id>:action:<n>   one action, keyed by turn number
 */

import type { Action } from "../engine/actions";
import type { AppendResult, GameRecord, Transport } from "./transport";

const RECORD_PREFIX = "km:game:";
const CHANNEL = "kingmaker";

const recordKey = (id: string) => `${RECORD_PREFIX}${id}`;
const actionKey = (id: string, index: number) => `${RECORD_PREFIX}${id}:action:${index}`;

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private browsing: the game plays on, it just will not persist.
  }
};

/** Broadcast is best-effort; the storage event below covers browsers without it. */
const announce = (id: string): void => {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ id });
    channel.close();
  } catch {
    // Not available; other tabs still learn from the storage event.
  }
};

export class LocalTransport implements Transport {
  async createGame(record: GameRecord): Promise<void> {
    writeJson(recordKey(record.id), record);
    announce(record.id);
  }

  async getGame(id: string): Promise<GameRecord | null> {
    return readJson<GameRecord>(recordKey(id));
  }

  async saveGame(record: GameRecord): Promise<void> {
    writeJson(recordKey(record.id), record);
    announce(record.id);
  }

  async listGames(): Promise<GameRecord[]> {
    const games: GameRecord[] = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        // Records only: action keys carry a further ":action:" segment.
        if (!key || !key.startsWith(RECORD_PREFIX) || key.includes(":action:")) continue;
        const record = readJson<GameRecord>(key);
        if (record) games.push(record);
      }
    } catch {
      return [];
    }
    return games.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteGame(id: string): Promise<void> {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && (key === recordKey(id) || key.startsWith(`${recordKey(id)}:action:`))) {
          doomed.push(key);
        }
      }
      for (const key of doomed) localStorage.removeItem(key);
    } catch {
      // Nothing to do; a game that cannot be read cannot be deleted either.
    }
    announce(id);
  }

  async listActions(id: string): Promise<Action[]> {
    const actions: Action[] = [];
    // Turn numbers are dense, so read until the first gap.
    for (let index = 0; ; index += 1) {
      const action = readJson<Action>(actionKey(id, index));
      if (!action) return actions;
      actions.push(action);
    }
  }

  async appendAction(id: string, index: number, action: Action): Promise<AppendResult> {
    // Somebody else already took this turn.
    if (localStorage.getItem(actionKey(id, index)) !== null) return "conflict";
    writeJson(actionKey(id, index), action);
    announce(id);
    return "ok";
  }

  subscribe(id: string, onChange: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith(recordKey(id))) onChange();
    };
    window.addEventListener("storage", onStorage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent<{ id?: string }>) => {
        if (event.data?.id === id) onChange();
      };
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }
}
