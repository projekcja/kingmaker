/** Presentation helpers. */

import type { Bloc } from "../engine/parties";
import type { GameState } from "../engine/types";

/** One colour per player, in seating order. Gold is always you. */
export const PLAYER_COLOURS = ["#e0a63c", "#4f8fd0", "#c8503f", "#5fa86d"];

export const playerColour = (state: GameState, playerKey: string | null): string => {
  if (!playerKey) return "#4a5262";
  const index = state.players.findIndex((player) => player.key === playerKey);
  return PLAYER_COLOURS[index] ?? "#4a5262";
};

export const playerName = (state: GameState, playerKey: string | null): string => {
  if (!playerKey) return "unaligned";
  return state.players.find((player) => player.key === playerKey)?.name ?? "unaligned";
};

export const BLOC_COLOUR: Record<Bloc, string> = {
  right: "#6f8dc4",
  centre: "#a99bc9",
  left: "#c98a8a",
  haredi: "#c0b083",
  arab: "#7fb8a8",
};

/** Big numbers read better with a thin space than with nothing. */
export const bn = (value: number): string => `${value}bn`;
