/**
 * Arena — every strategy against every other, on the same boards.
 *
 * `balance.ts` asks two fixed questions (greedy beats random, shrewd beats
 * greedy). This asks the full round robin, adds the mirror matches, and then
 * uses the mirrors for the thing only a mirror can measure: with the identical
 * strategy in both seats, any remaining win rate is the board talking, not the
 * player. That is the seat advantage.
 *
 * Run with: npx vite-node scripts/arena.ts
 */

import { greedyOffer, randomOffer, shrewdOffer } from "../src/bots";
import { CHAMBERS as ALL_CHAMBERS } from "../src/engine/parties";
import type { PlayerKind } from "../src/engine/types";
import { playCampaign } from "../tests/harness";
import type { Strategy } from "../tests/harness";

const SEEDS = Array.from({ length: 120 }, (_, index) => index * 613 + 17);
const MAX_TURNS = 400;
const CHAMBERS = ["polls", "knesset-25", "knesset-20", "knesset-13"];

const KINDS = ["random", "greedy", "shrewd"] as const;
type Kind = (typeof KINDS)[number];
const STRATEGY: Record<Kind, Strategy> = {
  random: randomOffer,
  greedy: greedyOffer,
  shrewd: shrewdOffer,
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * A binomial 95% interval, so a 52% is not read as a finding when the sample
 * cannot tell it from a coin.
 */
const ci = (wins: number, n: number): string => {
  if (!n) return "—";
  const p = wins / n;
  const half = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return `${(p * 100).toFixed(1)}% ±${(half * 100).toFixed(1)}`;
};

interface Duel {
  aWins: number;
  bWins: number;
  unfinished: number;
  turns: number[];
}

/** Play `a` against `b` on every board, from both seats, and count. */
const duel = (a: Kind, b: Kind, lead?: string): Duel => {
  const out: Duel = { aWins: 0, bWins: 0, unfinished: 0, turns: [] };
  for (const chamber of CHAMBERS) {
    for (const seed of SEEDS) {
      // Arm 1: `a` leads the human seat. Arm 2: the same board with the seats
      // swapped, so neither strategy keeps the bigger party.
      const arms = [
        { strategy: STRATEGY[a], bot: b as PlayerKind, aIsHuman: true },
        { strategy: STRATEGY[b], bot: a as PlayerKind, aIsHuman: false },
      ];
      for (const arm of arms) {
        const outcome = playCampaign({
          seed,
          chamber,
          humanParty: lead,
          bots: [arm.bot],
          strategy: arm.strategy,
          maxTurns: MAX_TURNS,
        });
        if (!outcome.finished) {
          out.unfinished += 1;
          continue;
        }
        out.turns.push(outcome.turns);
        if (outcome.humanWon === arm.aIsHuman) out.aWins += 1;
        else out.bWins += 1;
      }
    }
  }
  return out;
};

console.log(
  `${SEEDS.length} seeds x ${CHAMBERS.length} chambers x 2 seats = ` +
    `${SEEDS.length * CHAMBERS.length * 2} campaigns per pairing\n`,
);

// --------------------------------------------------------------------- 1
console.log("ROUND ROBIN — row's win rate against column, seats swapped");
console.log("".padEnd(9) + KINDS.map((k) => k.padEnd(18)).join(""));
const lengths: number[] = [];
for (const a of KINDS) {
  const cells: string[] = [];
  for (const b of KINDS) {
    const d = duel(a, b);
    lengths.push(...d.turns);
    cells.push(ci(d.aWins, d.aWins + d.bWins).padEnd(18));
  }
  console.log(a.padEnd(9) + cells.join(""));
}
console.log(`\ncampaign length: mean ${mean(lengths).toFixed(1)} turns\n`);

// --------------------------------------------------------------------- 2
// The mirror match. Same strategy both sides, so a win rate away from 50%
// is the seat, not the skill.
console.log("SEAT ADVANTAGE — shrewd vs shrewd, human seat leading each party");
const board = ALL_CHAMBERS.find((c) => c.id === "knesset-25")!;
const ranked = [...board.parties].sort((a, b) => b.baseSeats - a.baseSeats);
for (const profile of ranked.slice(0, 6)) {
  let wins = 0;
  let played = 0;
  for (const seed of SEEDS) {
    const outcome = playCampaign({
      seed,
      chamber: "knesset-25",
      humanParty: profile.key,
      bots: ["shrewd"],
      strategy: shrewdOffer,
      maxTurns: MAX_TURNS,
    });
    if (!outcome.finished) continue;
    played += 1;
    if (outcome.humanWon) wins += 1;
  }
  console.log(
    `  ${profile.name.padEnd(22)} ${String(profile.baseSeats).padStart(2)} seats   ` +
      `${ci(wins, played)}   (n=${played})`,
  );
}

// --------------------------------------------------------------------- 3
console.log("\nTHREE AT THE TABLE — shrewd in the human seat vs greedy + random");
let threeWins = 0;
let threePlayed = 0;
const threeTurns: number[] = [];
for (const chamber of CHAMBERS) {
  for (const seed of SEEDS) {
    const outcome = playCampaign({
      seed,
      chamber,
      bots: ["greedy", "random"],
      strategy: shrewdOffer,
      maxTurns: MAX_TURNS,
    });
    if (!outcome.finished) continue;
    threePlayed += 1;
    threeTurns.push(outcome.turns);
    if (outcome.humanWon) threeWins += 1;
  }
}
console.log(
  `  shrewd wins ${ci(threeWins, threePlayed)} of ${threePlayed} ` +
    `(a third of the table is 33.3%), mean ${mean(threeTurns).toFixed(1)} turns`,
);
