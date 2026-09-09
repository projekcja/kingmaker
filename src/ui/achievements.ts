/**
 * Achievements: trophies for this browser, not this campaign.
 *
 * The engine has no notion of these — a career milestone is meta-state that
 * would not belong in a deterministic save, so it lives here, keyed by the
 * events a turn already reports rather than anything new for the engine to
 * track.
 */

import type { GameState, TurnResult } from "../engine/types";
import { TERM_LENGTH, YEARS_TO_WIN } from "../engine/types";

export interface Achievement {
  key: string;
  title: string;
  text: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first-coalition", title: "First Coalition", text: "Formed a government for the first time." },
  { key: "quick-study", title: "Quick Study", text: "Formed a government inside two weeks." },
  { key: "comeback", title: "Comeback", text: "Took the premiership back after sitting in opposition." },
  { key: "full-term", title: "Full Term", text: `Sat the government out a whole ${TERM_LENGTH}-year term.` },
  { key: "the-long-game", title: "The Long Game", text: `Won a campaign outright — ${YEARS_TO_WIN} years in power.` },
];

const byKey = new Map(ACHIEVEMENTS.map((achievement) => [achievement.key, achievement]));
export const achievementByKey = (key: string): Achievement | undefined => byKey.get(key);

/**
 * What one seat unlocked on the turn that just resolved.
 *
 * Judged against a single step — the state right before this turn and right
 * after — plus one piece of history the caller has to keep itself:
 * {@link hasBeenOpposition}, since a comeback spans the election and however
 * many forming turns sit between losing power and winning it back, which is
 * more than a two-frame diff can see on its own. Everything else here is
 * derivable from `prev`, `next` and the turn's own result.
 */
export const unlockedBy = (params: {
  seatKey: string;
  prev: GameState;
  next: GameState;
  result: TurnResult | null;
  hasBeenOpposition: boolean;
}): string[] => {
  const { seatKey, prev, next, result, hasBeenOpposition } = params;
  const unlocked: string[] = [];

  if (result?.swornIn === seatKey) {
    unlocked.push("first-coalition");
    if (next.week <= 2) unlocked.push("quick-study");
    if (hasBeenOpposition) unlocked.push("comeback");
  }

  // The term-end log line fires whether the government still holds 61 or
  // not — "sat its" is the one thing that means the whole term was served,
  // and by the time this turn's result is inspected an election in the same
  // turn may already have zeroed governmentYears back out.
  if (
    prev.primeMinister === seatKey &&
    result &&
    next.log.some((entry) => entry.turn === result.turn && entry.text.includes("sat its"))
  ) {
    unlocked.push("full-term");
  }

  if (next.phase === "over" && next.winner === seatKey) {
    unlocked.push("the-long-game");
  }

  return unlocked;
};

const STORAGE_KEY = "km:achievements";

/** Every trophy this browser has ever earned, across every campaign. */
export const loadUnlocked = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const keys: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set();
  }
};

export const saveUnlocked = (unlocked: Set<string>): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
  } catch {
    // Quota or private browsing: the trophy case just will not remember.
  }
};
