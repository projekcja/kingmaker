/**
 * Bot tuning harness.
 *
 * `balance.ts` answers one question — does the better algorithm win — and
 * answers it for the shipped constants. This one exists to change them: it
 * plays a matchup across many seeds, both seats swapped, and reports the win
 * rate with an interval around it so a two-point difference is not mistaken
 * for a result.
 *
 * The interval is the whole point. A 480-game matchup has a standard error of
 * about 2.3 points, so two configurations at 66% and 69% are the same
 * configuration. Anything reported here without a gap wider than the intervals
 * is noise, and tuning against noise is how a bot gets slowly worse while every
 * individual measurement looks like progress.
 *
 * Run with:
 *   npx vite-node scripts/tune.ts                    # sweep both bots
 *   npx vite-node scripts/tune.ts -- --seeds=600     # more games, tighter bars
 *   npx vite-node scripts/tune.ts -- --only=shrewd
 */

import { greedyOffer, randomOffer, shrewdOffer } from "../src/bots";
import { GREEDY_TUNING } from "../src/bots/greedy";
import { SHREWD_TUNING } from "../src/bots/shrewd";
import type { PlayerKind } from "../src/engine/types";
import { playCampaign } from "../tests/harness";
import type { Strategy } from "../tests/harness";

const args = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
  if (match) args.set(match[1], match[2] ?? "true");
}
const number = (name: string, fallback: number): number =>
  Number(args.get(name) ?? String(fallback));
const option = (name: string, fallback: string): string => args.get(name) ?? fallback;

const SEEDS_N = number("seeds", 400);
const MAX_TURNS = 400;
const SEEDS = Array.from({ length: SEEDS_N }, (_, index) => index * 613 + 17);

/** The boards a matchup is played on, so a change is never judged on one. */
const CHAMBERS = ["polls", "knesset-25", "knesset-21", "knesset-13"];

export interface Result {
  wins: number;
  losses: number;
  /** Win rate as a percentage. */
  rate: number;
  /** Half-width of the 95% interval, in points. */
  margin: number;
  /** Mean turns to a decision, for spotting a change that only stalls. */
  turns: number;
}

/**
 * Play one strategy against one bot kind, swapping seats on every board.
 *
 * The swap is not optional. The lists are real and wildly unequal, so a matchup
 * played from one seat measures who was handed Likud far more loudly than it
 * measures either algorithm.
 */
export const matchup = (challenger: Strategy, defender: PlayerKind): Result => {
  let wins = 0;
  let losses = 0;
  const turns: number[] = [];

  for (const chamber of CHAMBERS) {
    for (const seed of SEEDS) {
      for (const challengerIsHuman of [true, false]) {
        // One seat plays the challenger and the other the defender, then they
        // trade places on the identical board.
        const outcome = playCampaign({
          seed,
          chamber,
          humanParty: "likud",
          bots: [challengerIsHuman ? defender : botKindOf(challenger)],
          strategy: challengerIsHuman ? challenger : defenderStrategy(defender),
          maxTurns: MAX_TURNS,
        });
        if (!outcome.finished) continue;
        turns.push(outcome.turns);
        if (outcome.humanWon === challengerIsHuman) wins += 1;
        else losses += 1;
      }
    }
  }

  const total = Math.max(1, wins + losses);
  const rate = (wins / total) * 100;
  // Normal approximation is plenty at these counts, and the point of printing
  // it is only to stop anyone reading a three-point move as a finding.
  const margin = 196 * Math.sqrt((rate / 100) * (1 - rate / 100) / total);
  return { wins, losses, rate, margin, turns: turns.reduce((a, b) => a + b, 0) / (turns.length || 1) };
};

/** The bot kind that corresponds to a strategy, for the swapped arm. */
const botKindOf = (strategy: Strategy): PlayerKind =>
  strategy === shrewdOffer ? "shrewd" : strategy === greedyOffer ? "greedy" : "random";

const defenderStrategy = (kind: PlayerKind): Strategy =>
  kind === "shrewd" ? shrewdOffer : kind === "greedy" ? greedyOffer : randomOffer;

const show = (label: string, result: Result): void => {
  console.log(
    `  ${label.padEnd(34)} ${result.rate.toFixed(1)}% ±${result.margin.toFixed(1)}` +
      `  (${result.wins}-${result.losses})  ${result.turns.toFixed(1)} turns`,
  );
};

/** Sweep one numeric dial, restoring it afterwards. */
const sweep = <T extends Record<string, number>>(
  config: T,
  key: keyof T,
  values: number[],
  challenger: Strategy,
  defender: PlayerKind,
): void => {
  const original = config[key];
  console.log(`\n${String(key)}  (currently ${original})`);
  let best: { value: number; rate: number } | null = null;
  for (const value of values) {
    (config as Record<string, number>)[key as string] = value;
    const result = matchup(challenger, defender);
    show(`${String(key)} = ${value}`, result);
    if (!best || result.rate > best.rate) best = { value, rate: result.rate };
  }
  (config as Record<string, number>)[key as string] = original;
  if (best) console.log(`  best: ${String(key)} = ${best.value} at ${best.rate.toFixed(1)}%`);
};

/*
 * Which opponent a dial is measured against matters, and it matters most for
 * the defensive ones. Random almost never poaches a partner, so a defensive
 * top-up measured against random is measured against nothing and always looks
 * like waste. `--defender` picks who is on the other side of the table.
 */
const DEFENDER = option("defender", "") as PlayerKind | "";
const DIALS = option("dials", "").split(",").filter(Boolean);
const VALUES = option("values", "").split(",").filter(Boolean).map(Number);

/** `--set=aggression=0.7,buffer=14` applies before anything is measured. */
for (const pair of option("set", "").split(",").filter(Boolean)) {
  const [key, value] = pair.split("=");
  const config = option("only", "both") === "shrewd" ? SHREWD_TUNING : GREEDY_TUNING;
  (config as Record<string, number>)[key] = Number(value);
  console.log(`set ${option("only", "greedy")}.${key} = ${value}`);
}

const only = option("only", "both");

console.log(
  `${SEEDS.length} seeds x ${CHAMBERS.length} boards x 2 seats = ` +
    `${SEEDS.length * CHAMBERS.length * 2} games per configuration
`,
);

// A targeted run: one bot, named dials, named values, a chosen opponent.
if (DIALS.length > 0) {
  const challenger = only === "shrewd" ? shrewdOffer : greedyOffer;
  const config = only === "shrewd" ? SHREWD_TUNING : GREEDY_TUNING;
  const defender = (DEFENDER || (only === "shrewd" ? "greedy" : "random")) as PlayerKind;
  console.log(`${only} vs ${defender}`);
  show("baseline", matchup(challenger, defender));
  for (const dial of DIALS) {
    sweep(config as Record<string, number>, dial, VALUES, challenger, defender);
  }
  process.exit(0);
}

console.log("baseline");
if (only !== "shrewd") show("greedy vs random", matchup(greedyOffer, "random"));
if (only !== "greedy") show("shrewd vs greedy", matchup(shrewdOffer, "greedy"));

if (only === "greedy" || only === "both") {
  console.log("\n=== greedy ===");
  sweep(GREEDY_TUNING, "aggression", [0.15, 0.22, 0.3, 0.4, 0.55], greedyOffer, "random");
  sweep(GREEDY_TUNING, "buffer", [0, 3, 6, 10, 14], greedyOffer, "random");
  sweep(GREEDY_TUNING, "defenceShare", [0.0, 0.12, 0.2, 0.3, 0.45], greedyOffer, "random");
}

if (only === "shrewd" || only === "both") {
  console.log("\n=== shrewd ===");
  sweep(SHREWD_TUNING, "aggression", [0.15, 0.22, 0.3, 0.4, 0.55], shrewdOffer, "greedy");
  sweep(SHREWD_TUNING, "denial", [0.0, 0.3, 0.6, 0.9, 1.2], shrewdOffer, "greedy");
  sweep(SHREWD_TUNING, "buffer", [0, 3, 6, 10, 14], shrewdOffer, "greedy");
  sweep(SHREWD_TUNING, "defenceShare", [0.0, 0.12, 0.2, 0.3, 0.45], shrewdOffer, "greedy");
}
