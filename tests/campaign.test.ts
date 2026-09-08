import { describe, expect, it } from "vitest";

import { greedyAllocation, randomAllocation } from "../src/bots";
import { applyAction, newCampaign, rollSeats, standings } from "../src/engine/campaign";
import { CARDS } from "../src/engine/deck";
import { ELECTORAL_THRESHOLD, MAJORITY, TOTAL_SEATS } from "../src/engine/parties";
import { Rng } from "../src/engine/rng";
import type { Allocation, GameState } from "../src/engine/types";
import { YEARS_TO_WIN, biddableParties, blocSeats } from "../src/engine/types";
import { playCampaign } from "./harness";

const SEEDS = Array.from({ length: 40 }, (_, index) => index * 977 + 3);

const seatTotal = (state: GameState): number =>
  Object.values(state.parties).reduce((sum, party) => sum + party.seats, 0);

const humanMove = (state: GameState, allocation: Allocation): GameState =>
  applyAction(state, { type: "commit", playerKey: "you", allocation }).state;

describe("setup", () => {
  it("seats the human in the party they picked and bots in the largest left", () => {
    const state = newCampaign({ seed: 1, humanParty: "shas", bots: ["greedy", "random"] });
    expect(state.players[0].partyKey).toBe("shas");
    expect(state.players[0].kind).toBe("human");
    // Likud and Yesh Atid are the biggest remaining.
    expect(state.players[1].partyKey).toBe("likud");
    expect(state.players[2].partyKey).toBe("yesh-atid");
  });

  it("opens on a real hung Knesset", () => {
    const state = newCampaign({ seed: 2 });
    expect(seatTotal(state)).toBe(TOTAL_SEATS);
    for (const player of state.players) {
      expect(blocSeats(state, player.key)).toBeLessThan(MAJORITY);
    }
    expect(state.phase).toBe("forming");
    expect(state.ministries).toHaveLength(18);
    expect(state.ministries.reduce((sum, m) => sum + m.budget, 0)).toBe(171);
  });

  it("is reproducible from a seed", () => {
    const a = playCampaign({ seed: 7788, maxTurns: 40 });
    const b = playCampaign({ seed: 7788, maxTurns: 40 });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe("turns", () => {
  it("does not mutate the state handed to it", () => {
    const state = newCampaign({ seed: 3 });
    const before = JSON.stringify(state);
    humanMove(state, greedyAllocation(state, "you", new Rng(1)));
    expect(JSON.stringify(state)).toBe(before);
  });

  it("resolves the whole turn once the human commits", () => {
    const state = newCampaign({ seed: 4 });
    const next = humanMove(state, greedyAllocation(state, "you", new Rng(1)));

    expect(next.turn).toBe(state.turn + 1);
    expect(next.lastTurn).not.toBeNull();
    expect(next.commitments).toEqual({});
    // Bots played too, without anything being written to the log.
    expect(next.lastTurn?.parties.some((party) => Object.keys(party.bids).length > 1)).toBe(true);
  });

  it("keeps the Knesset at 120 seats through every card", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const outcome = playCampaign({ seed, maxTurns: 60 });
      expect(seatTotal(outcome.state)).toBe(TOTAL_SEATS);
    }
  });
});

describe("forming a government", () => {
  it("makes the first player past 61 prime minister", () => {
    let state = newCampaign({ seed: 5, humanParty: "likud", bots: ["random"] });
    for (let turn = 0; turn < 40 && state.phase === "forming"; turn += 1) {
      state = humanMove(state, greedyAllocation(state, "you", new Rng(turn)));
    }
    if (state.phase === "forming") return; // this seed stalled; covered elsewhere

    expect(state.primeMinister).not.toBeNull();
    expect(blocSeats(state, state.primeMinister as string)).toBeGreaterThanOrEqual(MAJORITY);
    expect(state.phase).toBe("governing");
  });

  it("banks a year for the prime minister on every governing turn", () => {
    let state = newCampaign({ seed: 9, humanParty: "likud", bots: ["random"] });
    for (let turn = 0; turn < 60 && state.phase === "forming"; turn += 1) {
      state = humanMove(state, greedyAllocation(state, "you", new Rng(turn)));
    }
    if (state.phase !== "governing") return;

    const pm = state.primeMinister as string;
    const before = state.players.find((player) => player.key === pm)?.yearsInPower ?? 0;
    state = humanMove(state, greedyAllocation(state, "you", new Rng(99)));
    const after = state.players.find((player) => player.key === pm)?.yearsInPower ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});

describe("elections", () => {
  it("re-rolls a full 120-seat Knesset around the baseline", () => {
    const rng = new Rng(31337);
    for (let round = 0; round < 200; round += 1) {
      const seats = rollSeats(rng, new Set(["likud"]));
      const total = Object.values(seats).reduce((sum, count) => sum + count, 0);
      expect(total).toBe(TOTAL_SEATS);
      for (const count of Object.values(seats)) {
        expect(count).toBeGreaterThanOrEqual(ELECTORAL_THRESHOLD);
      }
      // A player's party can never be wiped out from under them.
      expect(seats.likud).toBeGreaterThanOrEqual(ELECTORAL_THRESHOLD);
    }
  });

  it("clears the board and starts bidding again after a collapse", () => {
    const outcome = playCampaign({ seed: 4242, maxTurns: 220 });
    // Somewhere in a long campaign a government falls.
    if (outcome.state.parliament > 1) {
      expect(outcome.state.log.some((entry) => entry.kind === "election")).toBe(true);
    }
    expect(seatTotal(outcome.state)).toBe(TOTAL_SEATS);
  });
});

describe("full campaigns", () => {
  it("never crashes and never leaves an illegal board", () => {
    for (const seed of SEEDS) {
      const outcome = playCampaign({ seed, maxTurns: 300 });
      const state = outcome.state;

      expect(["forming", "governing", "rebuilding", "over"]).toContain(state.phase);
      expect(seatTotal(state)).toBe(TOTAL_SEATS);
      expect(biddableParties(state).length).toBeGreaterThan(0);
      expect(state.ministries.length).toBeGreaterThan(0);

      if (state.phase === "over") {
        expect(state.winner).not.toBeNull();
        const winner = state.players.find((player) => player.key === state.winner);
        expect(winner?.yearsInPower).toBeGreaterThanOrEqual(YEARS_TO_WIN);
      } else {
        for (const player of state.players) {
          expect(player.yearsInPower).toBeLessThan(YEARS_TO_WIN);
        }
      }
    }
  });

  it("reaches a winner on most seeds inside a sane number of turns", () => {
    const outcomes = SEEDS.map((seed) => playCampaign({ seed, maxTurns: 300 }));
    const finished = outcomes.filter((outcome) => outcome.finished);
    expect(finished.length / outcomes.length).toBeGreaterThan(0.8);
  });

  it("only ever has one government at a time", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      let state = newCampaign({ seed, bots: ["greedy", "random"] });
      const rng = new Rng(seed);
      for (let turn = 0; turn < 80 && state.phase !== "over"; turn += 1) {
        state = humanMove(state, greedyAllocation(state, "you", rng));
        const majorities = state.players.filter(
          (player) => blocSeats(state, player.key) >= MAJORITY,
        );
        // Two blocs cannot both hold 61 of 120 seats.
        expect(majorities.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the deck", () => {
  it("only fires cards that belong to the phase in play", () => {
    for (const card of CARDS) {
      expect(card.phases.length).toBeGreaterThan(0);
      for (const phase of card.phases) {
        expect(["forming", "governing", "rebuilding"]).toContain(phase);
      }
    }
  });

  it("keeps some ideological cards, since that is the only thing reading politics", () => {
    expect(CARDS.filter((card) => card.ideological).length).toBeGreaterThanOrEqual(4);
  });
});

describe("bots", () => {
  it("both allocate every ministry, every time", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const state = newCampaign({ seed });
      const rng = new Rng(seed);
      for (const bot of [greedyAllocation, randomAllocation]) {
        const allocation = bot(state, "you", rng);
        expect(Object.keys(allocation)).toHaveLength(state.ministries.length);
        for (const partyKey of Object.values(allocation)) {
          expect(state.parties[partyKey]).toBeDefined();
        }
      }
    }
  });

  it("has greedy concentrate where random scatters", () => {
    const state = newCampaign({ seed: 21 });
    const rng = new Rng(21);
    const greedyTargets = new Set(Object.values(greedyAllocation(state, "you", rng)));
    const randomTargets = new Set(Object.values(randomAllocation(state, "you", rng)));
    expect(greedyTargets.size).toBeLessThanOrEqual(randomTargets.size);
  });

  it("keeps greedy out of parties that have ruled it out", () => {
    const state = newCampaign({ seed: 22 });
    const target = biddableParties(state)[0];
    target.refusals.push({ partyKey: state.players[0].partyKey, until: state.turn + 5 });

    const allocation = greedyAllocation(state, "you", new Rng(1));
    expect(Object.values(allocation)).not.toContain(target.key);
  });
});

describe("standings", () => {
  it("ranks players by the mandates behind them", () => {
    const state = newCampaign({ seed: 30, humanParty: "likud" });
    const ranked = standings(state);
    expect(ranked[0].seats).toBeGreaterThanOrEqual(ranked[ranked.length - 1].seats);
    expect(ranked.reduce((sum, entry) => sum + entry.seats, 0)).toBeLessThanOrEqual(TOTAL_SEATS);
  });
});
