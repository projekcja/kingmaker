/** Presentation helpers: turning engine numbers into things a person can read. */

import type { Ideology, Party } from "../engine/types";

/**
 * A stable colour per party, read off its politics: economic left runs red,
 * economic right runs blue, and strongly traditional parties bend purple.
 */
export const partyColour = (ideology: Ideology): string => {
  const base = 355 - ((ideology.economy + 10) / 20) * 145;
  const traditional = Math.max(0, Math.min(0.55, (ideology.society - 3) / 10));
  const hue = base * (1 - traditional) + 275 * traditional;
  const saturation = 42 + Math.abs(ideology.security) * 1.1;
  return `hsl(${hue.toFixed(0)} ${saturation.toFixed(0)}% 55%)`;
};

export const moodLabel = (mood: number): string => {
  if (mood <= -25) return "hostile";
  if (mood <= -10) return "cold";
  if (mood < 8) return "wary";
  if (mood < 22) return "cordial";
  return "warm";
};

export const moodTone = (mood: number): "red" | "gold" | "green" | "" => {
  if (mood <= -10) return "red";
  if (mood < 8) return "";
  if (mood < 22) return "gold";
  return "green";
};

/** What a party is asking, in words rather than points. */
export const priceBand = (price: number): string => {
  if (price < 18) return "modest";
  if (price < 30) return "serious";
  if (price < 45) return "steep";
  return "extortionate";
};

export const loyaltyLabel = (loyalty: number): string => {
  if (loyalty >= 75) return "solid";
  if (loyalty >= 50) return "grumbling";
  if (loyalty >= 30) return "restless";
  if (loyalty >= 15) return "mutinous";
  return "in open revolt";
};

export const pragmatismLabel = (party: Party): string => {
  if (party.pragmatism >= 0.75) return "deal-maker";
  if (party.pragmatism >= 0.5) return "flexible";
  if (party.pragmatism >= 0.35) return "principled";
  return "purist";
};

export const tone = (value: number, warn: number, bad: number): "" | "warn" | "bad" => {
  if (value <= bad) return "bad";
  if (value <= warn) return "warn";
  return "";
};
