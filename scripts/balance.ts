/**
 * Balance probe: play many seeds with the greedy bot and print the shape of
 * the difficulty curve. Run with `npx vite-node scripts/balance.ts`.
 */
import { newGame } from "../src/engine/generator";
import { baseLoyalty, stabilityScore } from "../src/engine/negotiation";
import { coalitionSeats } from "../src/engine/types";
import { playOut } from "../tests/bot";

const seeds = Array.from({ length: 300 }, (_, i) => i * 1013 + 7);
let wins = 0;
const days: number[] = [];
const spend: number[] = [];
const loyalty: number[] = [];
const stability: number[] = [];
const outcomes: Record<string, number> = {};

for (const seed of seeds) {
  const result = playOut(newGame({ seed }));
  const s = result.state;
  outcomes[s.outcome ?? "none"] = (outcomes[s.outcome ?? "none"] ?? 0) + 1;
  if (result.won) {
    wins += 1;
    days.push(s.day);
    loyalty.push(baseLoyalty(s));
    stability.push(stabilityScore(s));
    const given = Object.entries(s.coalition.portfolios)
      .filter(([, holder]) => holder !== s.playerKey)
      .reduce((sum, [key]) => sum + s.parliament.portfolios[key].prestige, 0);
    spend.push(given);
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)];
};

console.log("games:      ", seeds.length);
console.log("win rate:   ", (wins / seeds.length).toFixed(3));
console.log("outcomes:   ", outcomes);
console.log("days used:  ", `mean ${mean(days).toFixed(1)}  p50 ${pct(days, 0.5)}  p90 ${pct(days, 0.9)}  max ${Math.max(...days, 0)}`);
console.log("prestige out:", `mean ${mean(spend).toFixed(1)}  p90 ${pct(spend, 0.9)}  (93 total on the board)`);
console.log("base loyalty:", `mean ${mean(loyalty).toFixed(1)}  p10 ${pct(loyalty, 0.1)}`);
console.log("stability:  ", `mean ${mean(stability).toFixed(1)}  p10 ${pct(stability, 0.1)}`);
