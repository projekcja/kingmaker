/**
 * Storage for multiplayer games.
 *
 * A stored game is a seed, a seat map, and an append-only list of actions —
 * a few hundred bytes — because the engine replays deterministically from it.
 * Each action is its own record rather than an entry in a mutable array, so
 * two players writing at once can never clobber one another, and the ordering
 * comes for free.
 *
 * This interface is deliberately the intersection of what a browser can do
 * locally and what a hosted document store offers, so the local implementation
 * can be swapped for a shared one without the game noticing.
 */

import type { Action } from "../engine/campaign";
import type { PlayerKind } from "../engine/types";

export interface GameRecord {
  id: string;
  seed: number;
  /** The rules that produced this game; a mismatch makes the log unreplayable. */
  rulesVersion: number;
  /** The party the human leads. Fixed for the life of the campaign. */
  humanParty: string;
  /** Bot opponents, in order of the parties they take. */
  bots: PlayerKind[];
  createdAt: number;
}

/** Appending fails when somebody else already took that turn. */
export type AppendResult = "ok" | "conflict";

export interface Transport {
  createGame(record: GameRecord): Promise<void>;
  getGame(id: string): Promise<GameRecord | null>;
  saveGame(record: GameRecord): Promise<void>;
  listGames(): Promise<GameRecord[]>;
  deleteGame(id: string): Promise<void>;

  listActions(id: string): Promise<Action[]>;
  /** `index` is the turn number; a taken index means somebody moved first. */
  appendAction(id: string, index: number, action: Action): Promise<AppendResult>;

  /** Fires whenever this game changes, in this tab or another. */
  subscribe(id: string, onChange: () => void): () => void;
}

export const newGameId = (): string =>
  Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
