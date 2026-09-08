/**
 * Balance probe.
 *
 * The headline number is whether greedy beats random. Because the parties are
 * real and wildly unequal, a naive comparison would mostly measure who drew
 * Likud, so every seed is played twice with the strategies swapped between the
 * same two seats. If greedy does not win clearly across both arms, the
 * allocation game is noise.
 *
 * Run with: npx vite-node scripts/balance.ts
 */

import { greedyOffer, randomOffer } from "../src/bots";
import { PARTY_PROFILES } from "../src/engine/parties";
import { YEARS_TO_WIN } from "../src/engine/types";
import { playCampaign } from "../tests/harness";

const SEEDS = Array.from({ length: 240 }, (_, index) => index * 613 + 17);
const MAX_TURNS = 400;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)];
};

let greedyWins = 0;
let randomWins = 0;
let decided = 0;
let unfinished = 0;
const turns: number[] = [];
const parliaments: number[] = [];
const yearsPerGovernment: number[] = [];
const formingTurns: number[] = [];
const longestFormation: number[] = [];

// A separate arm with a competent player on both sides of the table, which is
// the only way to see how long forming a coalition really takes.
const contested: number[] = [];

for (const seed of SEEDS) {
  // Arm A: greedy in the human seat, random as the bot.
  // Arm B: the same board with the strategies swapped.
  const arms = [
    { strategy: greedyOffer, bot: "random" as const, humanIsGreedy: true },
    { strategy: randomOffer, bot: "greedy" as const, humanIsGreedy: false },
  ];

  for (const arm of arms) {
    const outcome = playCampaign({
      seed,
      humanParty: "likud",
      bots: [arm.bot],
      strategy: arm.strategy,
      maxTurns: MAX_TURNS,
    });

    if (!outcome.finished) {
      unfinished += 1;
      continue;
    }
    decided += 1;
    turns.push(outcome.turns);
    formingTurns.push(outcome.formingTurns);
    longestFormation.push(outcome.longestFormation);
    parliaments.push(outcome.state.parliament);
    yearsPerGovernment.push(YEARS_TO_WIN / Math.max(1, outcome.state.parliament));

    const greedyWon = outcome.humanWon === arm.humanIsGreedy;
    if (greedyWon) greedyWins += 1;
    else randomWins += 1;
  }
}

for (const seed of SEEDS.slice(0, 80)) {
  const outcome = playCampaign({
    seed,
    humanParty: "likud",
    bots: ["greedy"],
    strategy: greedyOffer,
    maxTurns: MAX_TURNS,
  });
  contested.push(outcome.longestFormation);
}

const total = greedyWins + randomWins;
console.log("campaigns played:  ", SEEDS.length * 2);
console.log("decided:           ", decided, `(${unfinished} hit the turn cap)`);
console.log("greedy wins:       ", greedyWins, `(${((greedyWins / total) * 100).toFixed(1)}%)`);
console.log("random wins:       ", randomWins, `(${((randomWins / total) * 100).toFixed(1)}%)`);
console.log(
  "turns to a winner: ",
  `mean ${mean(turns).toFixed(1)}  p50 ${pct(turns, 0.5)}  p90 ${pct(turns, 0.9)}  max ${Math.max(...turns, 0)}`,
);
console.log(
  "parliaments:       ",
  `mean ${mean(parliaments).toFixed(2)}  p90 ${pct(parliaments, 0.9)}`,
);
console.log("years per govt:    ", mean(yearsPerGovernment).toFixed(2));
console.log(
  "turns forming:     ",
  `mean ${mean(formingTurns).toFixed(1)} of the campaign · longest single negotiation p50 ${pct(longestFormation, 0.5)} p90 ${pct(longestFormation, 0.9)}`,
);
console.log(
  "greedy vs greedy:  ",
  `longest negotiation mean ${mean(contested).toFixed(1)}  p50 ${pct(contested, 0.5)}  p90 ${pct(contested, 0.9)}  max ${Math.max(...contested, 0)}`,
);
console.log("parties on board:  ", PARTY_PROFILES.length);
