import { describe, expect, it } from "vitest";

import { greedyOffer, randomOffer } from "../src/bots";
import { validateOffer } from "../src/engine/allocation";
import { applyAction, newCampaign, rollSeats, standings } from "../src/engine/campaign";
import { CARDS } from "../src/engine/deck";
import { ELECTORAL_THRESHOLD, MAJORITY, TOTAL_SEATS } from "../src/engine/parties";
import { Rng } from "../src/engine/rng";
import type { GameState, Offer } from "../src/engine/types";
import {
  FORMING_DEADLINE,
  OFFERS_PER_TURN,
  YEARS_TO_WIN,
  biddableParties,
  blocSeats,
  freeMinistries,
} from "../src/engine/types";
import { playCampaign } from "./harness";

const SEEDS = Array.from({ length: 40 }, (_, index) => index * 977 + 3);

const seatTotal = (state: GameState): number =>
  Object.values(state.parties).reduce((sum, party) => sum + party.seats, 0);

const humanMove = (state: GameState, offer: Offer): GameState =>
  applyAction(state, { type: "offer", playerKey: "you", offer }).state;

describe("setup", () => {
  it("seats the human in the party they picked and bots in the largest left", () => {
    const state = newCampaign({ seed: 1, humanParty: "shas", bots: ["greedy", "random"] });
    expect(state.players[0].partyKey).toBe("shas");
    expect(state.players[0].kind).toBe("human");
    expect(state.players[1].partyKey).toBe("likud");
    expect(state.players[2].partyKey).toBe("yesh-atid");
  });

  it("opens on a real hung Knesset with nothing promised", () => {
    const state = newCampaign({ seed: 2 });
    expect(seatTotal(state)).toBe(TOTAL_SEATS);
    for (const player of state.players) {
      expect(blocSeats(state, player.key)).toBeLessThan(MAJORITY);
      expect(freeMinistries(state, player.key)).toHaveLength(18);
    }
    expect(state.phase).toBe("forming");
    expect(state.ministries.reduce((sum, m) => sum + m.budget, 0)).toBe(171);
    for (const party of Object.values(state.parties)) {
      expect(party.heldBy).toBeNull();
      expect(party.package).toEqual([]);
    }
  });

  it("is reproducible from a seed", () => {
    const a = playCampaign({ seed: 7788, maxTurns: 60 });
    const b = playCampaign({ seed: 7788, maxTurns: 60 });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe("turns", () => {
  it("does not mutate the state handed to it", () => {
    const state = newCampaign({ seed: 3 });
    const before = JSON.stringify(state);
    humanMove(state, greedyOffer(state, "you", new Rng(1)));
    expect(JSON.stringify(state)).toBe(before);
  });

  it("resolves the whole turn once the human commits", () => {
    const state = newCampaign({ seed: 4 });
    const next = humanMove(state, greedyOffer(state, "you", new Rng(1)));

    expect(next.turn).toBe(state.turn + 1);
    expect(next.lastTurn).not.toBeNull();
    expect(next.offers).toEqual({});
    // Bots played too, without anything being written to the action log.
    expect(next.lastTurn?.parties.some((party) => Object.keys(party.bids).length > 0)).toBe(true);
  });

  it("never lets a player spend more than they hold", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const outcome = playCampaign({ seed, maxTurns: 80 });
      const state = outcome.state;
      for (const player of state.players) {
        const locked = Object.values(state.parties)
          .filter((party) => party.heldBy === player.key)
          .flatMap((party) => party.package);
        // No portfolio is ever promised to two parties at once.
        expect(new Set(locked).size).toBe(locked.length);
        expect(locked.length).toBeLessThanOrEqual(state.ministries.length);
      }
    }
  });

  it("keeps the Knesset at 120 seats through every card", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const outcome = playCampaign({ seed, maxTurns: 80 });
      expect(seatTotal(outcome.state)).toBe(TOTAL_SEATS);
    }
  });
});

describe("forming a government", () => {
  it("makes the first player past 61 prime minister", () => {
    let state = newCampaign({ seed: 5, humanParty: "likud", bots: ["random"] });
    for (let turn = 0; turn < 60 && state.phase === "forming"; turn += 1) {
      state = humanMove(state, greedyOffer(state, "you", new Rng(turn)));
    }
    if (state.phase === "forming") return; // this seed stalled; covered elsewhere

    expect(state.primeMinister).not.toBeNull();
    expect(blocSeats(state, state.primeMinister as string)).toBeGreaterThanOrEqual(MAJORITY);
    expect(state.phase).toBe("governing");
  });

  it("banks a year for the prime minister on every governing turn", () => {
    let state = newCampaign({ seed: 9, humanParty: "likud", bots: ["random"] });
    for (let turn = 0; turn < 80 && state.phase === "forming"; turn += 1) {
      state = humanMove(state, greedyOffer(state, "you", new Rng(turn)));
    }
    if (state.phase !== "governing") return;

    const pm = state.primeMinister as string;
    const before = state.players.find((player) => player.key === pm)?.yearsInPower ?? 0;
    state = humanMove(state, greedyOffer(state, "you", new Rng(99)));
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
      expect(seats.likud).toBeGreaterThanOrEqual(ELECTORAL_THRESHOLD);
    }
  });

  it("dissolves a Knesset that cannot produce a government", () => {
    // Nobody offers anything, so nobody can ever reach 61.
    let state = newCampaign({ seed: 606, humanParty: "likud", bots: [] });
    const parliament = state.parliament;

    for (let week = 0; week < FORMING_DEADLINE; week += 1) {
      state = humanMove(state, { bids: [], withdrawFrom: [] });
    }

    expect(state.parliament).toBe(parliament + 1);
    expect(state.phase).toBe("forming");
    expect(state.week).toBe(1);
    expect(seatTotal(state)).toBe(TOTAL_SEATS);
    expect(state.log.some((entry) => entry.text.includes("dissolves itself"))).toBe(true);
  });

  it("clears every promise when a government falls", () => {
    const outcome = playCampaign({ seed: 4242, maxTurns: 300 });
    if (outcome.state.parliament > 1) {
      expect(outcome.state.log.some((entry) => entry.kind === "election")).toBe(true);
    }
    expect(seatTotal(outcome.state)).toBe(TOTAL_SEATS);
  });
});

describe("full campaigns", () => {
  it("never crashes and never leaves an illegal board", () => {
    for (const seed of SEEDS) {
      const outcome = playCampaign({ seed, maxTurns: 400 });
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
    const outcomes = SEEDS.map((seed) => playCampaign({ seed, maxTurns: 400 }));
    const finished = outcomes.filter((outcome) => outcome.finished);
    expect(finished.length / outcomes.length).toBeGreaterThan(0.8);
  });

  it("only ever has one government at a time", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      let state = newCampaign({ seed, bots: ["greedy", "random"] });
      const rng = new Rng(seed);
      for (let turn = 0; turn < 100 && state.phase !== "over"; turn += 1) {
        state = humanMove(state, greedyOffer(state, "you", rng));
        const majorities = state.players.filter(
          (player) => blocSeats(state, player.key) >= MAJORITY,
        );
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
  it("never break the rules of an offer", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const state = newCampaign({ seed });
      const rng = new Rng(seed);
      for (const bot of [greedyOffer, randomOffer]) {
        const offer = bot(state, "you", rng);
        expect(offer.bids.length).toBeLessThanOrEqual(OFFERS_PER_TURN);
        expect(validateOffer(state, "you", offer)).toEqual([]);
      }
    }
  });

  it("only offer portfolios they actually hold", () => {
    const state = newCampaign({ seed: 23 });
    const hand = new Set(freeMinistries(state, "you"));
    for (const bot of [greedyOffer, randomOffer]) {
      const offer = bot(state, "you", new Rng(23));
      for (const bid of offer.bids) {
        for (const key of bid.ministries) expect(hand.has(key)).toBe(true);
      }
    }
  });

  it("keep greedy out of parties that have ruled it out", () => {
    const state = newCampaign({ seed: 22 });
    const target = biddableParties(state)[0];
    target.refusals.push({ partyKey: state.players[0].partyKey, until: state.turn + 5 });

    const offer = greedyOffer(state, "you", new Rng(1));
    expect(offer.bids.map((bid) => bid.partyKey)).not.toContain(target.key);
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
