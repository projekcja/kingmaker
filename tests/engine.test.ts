import { describe, expect, it } from "vitest";

import { applyAction, isLegal, suggestedTargets } from "../src/engine/actions";
import { PORTFOLIOS } from "../src/engine/content";
import { newGame, viableCoalitions } from "../src/engine/generator";
import {
  askingPrice,
  baseLoyalty,
  canSign,
  evaluate,
  openRoutes,
  pivotShare,
  signingProblems,
  stabilityScore,
} from "../src/engine/negotiation";
import { Rng, seedFromString } from "../src/engine/rng";
import type { GameState, Offer } from "../src/engine/types";
import { coalitionSeats, ideologyDistance } from "../src/engine/types";
import { cheapestAcceptableOffer, playOut } from "./bot";

const SEEDS = Array.from({ length: 60 }, (_, index) => index * 7717 + 13);

const offerFor = (partyKey: string, portfolios: string[] = []): Offer => ({
  partyKey,
  portfolios,
  commitments: {},
});

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const draws = Array.from({ length: 20 }, () => a.next());
    expect(draws).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it("stays inside the unit interval", () => {
    const rng = new Rng(seedFromString("kingmaker"));
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("draws distinct items when sampling", () => {
    const rng = new Rng(7);
    const sample = rng.sample([1, 2, 3, 4, 5, 6, 7, 8], 4);
    expect(new Set(sample).size).toBe(4);
  });
});

describe("scenario generation", () => {
  it("is reproducible from a seed", () => {
    const a = newGame({ seed: 1234 });
    const b = newGame({ seed: 1234 });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("always produces a hung, solvable parliament", () => {
    for (const seed of SEEDS) {
      const state = newGame({ seed });
      const { parliament, playerKey } = state;

      const seats = Object.values(parliament.parties).reduce((sum, p) => sum + p.seats, 0);
      expect(seats).toBe(parliament.totalSeats);
      expect(parliament.majority).toBe(Math.floor(parliament.totalSeats / 2) + 1);

      // Nobody governs alone, and the player is a plausible formateur.
      for (const party of Object.values(parliament.parties)) {
        expect(party.seats).toBeGreaterThanOrEqual(3);
        expect(party.seats).toBeLessThan(parliament.majority);
      }
      const ranked = Object.values(parliament.parties).sort((a, b) => b.seats - a.seats);
      expect(ranked.slice(0, 2).map((p) => p.key)).toContain(playerKey);

      const routes = viableCoalitions(parliament, playerKey);
      expect(routes.length).toBeGreaterThanOrEqual(2);
      expect(routes.length).toBeLessThanOrEqual(14);
    }
  });

  it("keeps red lines mutual", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const { parliament } = newGame({ seed });
      for (const party of Object.values(parliament.parties)) {
        for (const veto of party.vetoes) {
          expect(parliament.parties[veto].vetoes).toContain(party.key);
        }
      }
    }
  });

  it("starts the player with the mandate and a single ministry", () => {
    const state = newGame({ seed: 99 });
    expect(state.coalition.members).toEqual([state.playerKey]);
    expect(Object.values(state.coalition.portfolios)).toEqual([state.playerKey]);
    expect(state.day).toBe(1);
    expect(state.finished).toBe(false);
  });
});

describe("ideology", () => {
  it("is zero for identical positions and symmetric", () => {
    const a = { economy: 3, society: -4, security: 8 };
    const b = { economy: -5, society: 0, security: 2 };
    expect(ideologyDistance(a, a)).toBe(0);
    expect(ideologyDistance(a, b)).toBeCloseTo(ideologyDistance(b, a));
    expect(ideologyDistance(a, b)).toBeGreaterThan(0);
  });

  it("maxes out at 1 for opposite corners", () => {
    const left = { economy: -10, society: -10, security: -10 };
    const right = { economy: 10, society: 10, security: 10 };
    expect(ideologyDistance(left, right)).toBeCloseTo(1);
  });
});

describe("offer evaluation", () => {
  it("never makes a party less happy by adding a ministry", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const state = newGame({ seed });
      const target = suggestedTargets(state)[0];
      let previous = evaluate(state, offerFor(target)).satisfaction;
      const keys: string[] = [];
      for (const portfolio of PORTFOLIOS.slice(0, 6)) {
        keys.push(portfolio.key);
        const next = evaluate(state, offerFor(target, [...keys])).satisfaction;
        expect(next).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = next;
      }
    }
  });

  it("refuses outright when a red line is crossed, whatever is on the table", () => {
    const state = newGame({ seed: 4242 });
    const pair = Object.values(state.parliament.parties).find(
      (party) => party.key !== state.playerKey && party.vetoes.length > 0,
    );
    if (!pair) return; // this seed drew no red lines; covered by other seeds
    const enemy = pair.vetoes[0];

    const withEnemy: GameState = {
      ...state,
      coalition: { ...state.coalition, members: [state.playerKey, enemy] },
    };
    const everything = PORTFOLIOS.map((portfolio) => portfolio.key);
    const evaluation = evaluate(withEnemy, offerFor(pair.key, everything));

    expect(evaluation.vetoedBy).toContain(enemy);
    expect(evaluation.accepted).toBe(false);
    expect(evaluation.complaints.join(" ")).toContain("will not sit");
  });

  it("explains itself whenever it says no", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const state = newGame({ seed });
      for (const key of suggestedTargets(state)) {
        const evaluation = evaluate(state, offerFor(key));
        if (!evaluation.accepted) expect(evaluation.complaints.length).toBeGreaterThan(0);
      }
    }
  });

  it("charges more for a party that every route needs", () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const state = newGame({ seed });
      const shares = suggestedTargets(state).map((key) => ({
        key,
        share: pivotShare(state, key),
        price: askingPrice(state, state.parliament.parties[key]),
      }));
      const essential = shares.filter((entry) => entry.share === 1);
      const optional = shares.filter((entry) => entry.share < 0.4);
      if (essential.length === 0 || optional.length === 0) continue;

      // Compare like with like: price per seat, so size does not confound it.
      const perSeat = (entry: { key: string; price: number }) =>
        entry.price / state.parliament.parties[entry.key].seats;
      const cheapestEssential = Math.min(...essential.map(perSeat));
      const dearestOptional = Math.max(...optional.map(perSeat));
      expect(cheapestEssential).toBeGreaterThan(dearestOptional * 0.6);
    }
  });
});

describe("actions", () => {
  it("does not mutate the state handed to it", () => {
    const state = newGame({ seed: 555 });
    const before = JSON.stringify(state);
    applyAction(state, { type: "meet", partyKey: suggestedTargets(state)[0] });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("costs a day and reveals demands when meeting a party", () => {
    const state = newGame({ seed: 556 });
    const target = suggestedTargets(state)[0];
    const { state: next } = applyAction(state, { type: "meet", partyKey: target });
    expect(next.day).toBe(state.day + 1);
    expect(next.parliament.parties[target].revealed).toBe(true);
  });

  it("admits a party and hands over the ministries when an offer is accepted", () => {
    const state = newGame({ seed: 777 });
    const target = suggestedTargets(state)[0];
    const offer = cheapestAcceptableOffer(state, target);
    if (!offer) return;

    const { state: next } = applyAction(state, { type: "offer", offer });
    expect(next.coalition.members).toContain(target);
    expect(coalitionSeats(next)).toBeGreaterThan(coalitionSeats(state));
    for (const key of offer.portfolios) {
      expect(next.coalition.portfolios[key]).toBe(target);
    }
  });

  it("returns a rejected party's ministries to the pool on dismissal", () => {
    const state = newGame({ seed: 778 });
    const target = suggestedTargets(state)[0];
    const offer = cheapestAcceptableOffer(state, target);
    if (!offer || offer.portfolios.length === 0) return;

    const joined = applyAction(state, { type: "offer", offer }).state;
    const dismissed = applyAction(joined, { type: "dismiss", partyKey: target }).state;

    expect(dismissed.coalition.members).not.toContain(target);
    for (const key of offer.portfolios) {
      expect(dismissed.coalition.portfolios[key]).toBeUndefined();
    }
    expect(dismissed.day).toBe(joined.day); // dismissal is instant
  });

  it("forbids promising a ministry that is already spoken for", () => {
    const state = newGame({ seed: 779 });
    const [first, second] = suggestedTargets(state);
    const offer = cheapestAcceptableOffer(state, first);
    if (!offer || offer.portfolios.length === 0 || !second) return;

    const joined = applyAction(state, { type: "offer", offer }).state;
    const illegal = { type: "offer", offer: offerFor(second, offer.portfolios) } as const;
    expect(isLegal(joined, illegal)).toBe(false);
  });

  it("writes public commitments into the agreement and moves opinion", () => {
    const state = newGame({ seed: 780 });
    const issue = Object.values(state.parliament.issues)[0];
    const option = issue.options[2];
    const { state: next } = applyAction(state, {
      type: "commit",
      issueKey: issue.key,
      position: option.position,
    });

    expect(next.coalition.commitments[issue.key]).toBe(option.position);
    const moods = Object.values(next.parliament.parties).map((p) => p.mood);
    const before = Object.values(state.parliament.parties).map((p) => p.mood);
    expect(moods).not.toEqual(before);
  });
});

describe("the player's own party", () => {
  it("starts loyal and sours as the leader gives things away", () => {
    const state = newGame({ seed: 909 });
    expect(baseLoyalty(state)).toBeGreaterThan(80);

    const target = suggestedTargets(state)[0];
    const senior = Object.values(state.parliament.portfolios)
      .filter((p) => p.prestige >= 8 && state.coalition.portfolios[p.key] === undefined)
      .map((p) => p.key);

    const generous: GameState = {
      ...state,
      coalition: {
        ...state.coalition,
        members: [state.playerKey, target],
        portfolios: {
          ...state.coalition.portfolios,
          ...Object.fromEntries(senior.map((key) => [key, target])),
        },
      },
    };
    expect(baseLoyalty(generous)).toBeLessThan(baseLoyalty(state));
  });

  it("blocks signing when the base has abandoned the leader", () => {
    const state = newGame({ seed: 910 });
    const broken: GameState = { ...state, baseModifier: -100 };
    expect(signingProblems(broken).length).toBeGreaterThan(0);
    expect(canSign(broken)).toBe(false);
  });
});

describe("signing", () => {
  it("refuses a minority coalition", () => {
    const state = newGame({ seed: 1010 });
    expect(canSign(state)).toBe(false);
    const { state: next } = applyAction(state, { type: "sign" });
    expect(next.finished).toBe(false);
    expect(signingProblems(state)[0]).toContain("seats");
  });

  it("produces a government, a score and an epilogue when the deal holds", () => {
    let signed: GameState | null = null;
    for (const seed of SEEDS) {
      const result = playOut(newGame({ seed }));
      if (result.won) {
        signed = result.state;
        break;
      }
    }
    expect(signed).not.toBeNull();
    const state = signed as GameState;
    expect(state.outcome).toBe("government");
    expect(coalitionSeats(state)).toBeGreaterThanOrEqual(state.parliament.majority);
    expect(state.epilogue).toBeTruthy();
    const stability = stabilityScore(state);
    expect(stability).toBeGreaterThanOrEqual(0);
    expect(stability).toBeLessThanOrEqual(100);
  });
});

describe("full games", () => {
  it("always terminates with a definite outcome", () => {
    for (const seed of SEEDS) {
      const result = playOut(newGame({ seed }));
      expect(result.state.finished).toBe(true);
      expect(result.state.outcome).not.toBeNull();
      expect(result.state.day).toBeLessThanOrEqual(result.state.daysTotal + 1);
      expect(result.turns).toBeLessThan(400);
    }
  });

  it("leaves a route to a majority open at every step", () => {
    for (const seed of SEEDS.slice(0, 25)) {
      let state = newGame({ seed });
      for (let step = 0; step < 12 && !state.finished; step += 1) {
        expect(openRoutes(state).length).toBeGreaterThan(0);
        state = applyAction(state, { type: "rally" }).state;
      }
    }
  });

  it("is winnable often enough to be a game, and losable often enough to be one", () => {
    const results = SEEDS.map((seed) => playOut(newGame({ seed })));
    const wins = results.filter((result) => result.won).length;
    const rate = wins / results.length;
    expect(rate).toBeGreaterThan(0.25);
    expect(rate).toBeLessThan(0.98);
  });
});
