/**
 * Overnight events: the things that happen to a negotiation while the
 * negotiator sleeps.
 *
 * Each event mutates a draft state and returns the line that goes into the
 * press log, or null if its preconditions were not met after all. Anything
 * that could make the scenario unwinnable is validated and rolled back by
 * {@link runOvernightEvent}.
 */

import { viableCoalitions } from "./generator";
import { openRoutes } from "./negotiation";
import type { Rng } from "./rng";
import type { GameState, LogEntry, Party } from "./types";
import { clamp, daysLeft, ideologyDistance } from "./types";

interface GameEvent {
  id: string;
  /** Relative likelihood; 0 means the event cannot fire right now. */
  weight: (state: GameState) => number;
  run: (state: GameState, rng: Rng) => { text: string; kind: LogEntry["kind"] } | null;
}

const others = (state: GameState): Party[] =>
  Object.values(state.parliament.parties).filter((party) => party.key !== state.playerKey);

const outsiders = (state: GameState): Party[] =>
  others(state).filter((party) => !state.coalition.members.includes(party.key));

const partners = (state: GameState): Party[] =>
  state.coalition.members
    .filter((key) => key !== state.playerKey)
    .map((key) => state.parliament.parties[key]);

export const EVENTS: GameEvent[] = [
  {
    id: "ultimatum",
    weight: (state) => (outsiders(state).length > 0 ? 3 : 0),
    run: (state, rng) => {
      const pool = outsiders(state);
      if (pool.length === 0) return null;
      // The parties who know you need them are the ones who push.
      const party = rng.weighted(pool, (candidate) => candidate.seats * candidate.ambition);
      party.priceModifier = Number(Math.min(1.9, party.priceModifier * rng.range(1.15, 1.35)).toFixed(3));
      const want = state.parliament.portfolios[party.portfolioWants[0]];
      return {
        kind: "trouble",
        text: `${party.leader} goes on the evening news: the ${party.name} will not join any government without ${want.name}.`,
      };
    },
  },
  {
    id: "scandal",
    weight: () => 2.5,
    run: (state, rng) => {
      const pool = others(state);
      if (pool.length === 0) return null;
      const party = rng.pick(pool);
      party.priceModifier = Number(Math.max(0.55, party.priceModifier * rng.range(0.72, 0.88)).toFixed(3));
      party.mood = clamp(party.mood - rng.range(0, 4), -50, 50);
      return {
        kind: "press",
        text: `A procurement scandal engulfs ${party.leader}. The ${party.name} suddenly has less to bargain with.`,
      };
    },
  },
  {
    id: "defection",
    weight: (state) => (others(state).some((party) => party.seats > 4) ? 1.6 : 0),
    run: (state, rng) => {
      const donors = Object.values(state.parliament.parties).filter((party) => party.seats > 4);
      if (donors.length === 0) return null;
      const donor = rng.pick(donors);
      // Members cross to the ideologically nearest party, as they do.
      const candidates = Object.values(state.parliament.parties).filter((party) => party.key !== donor.key);
      let target = candidates[0];
      for (const candidate of candidates) {
        if (
          ideologyDistance(donor.ideology, candidate.ideology) <
          ideologyDistance(donor.ideology, target.ideology)
        ) {
          target = candidate;
        }
      }
      const seats = rng.int(1, 2);
      donor.seats -= seats;
      target.seats += seats;
      return {
        kind: "trouble",
        text: `${seats === 1 ? "A member" : `${seats} members`} of the ${donor.name} cross the floor to the ${target.name}. The arithmetic has changed.`,
      };
    },
  },
  {
    id: "backbench-revolt",
    weight: (state) => (Object.keys(state.coalition.commitments).length >= 2 ? 2.2 : 0),
    run: (state, rng) => {
      const player = state.parliament.parties[state.playerKey];
      state.baseModifier -= rng.range(4, 8);
      return {
        kind: "trouble",
        text: `Backbenchers of the ${player.name} circulate a letter: the concessions have gone far enough.`,
      };
    },
  },
  {
    id: "leak",
    weight: (state) => (others(state).some((party) => !party.revealed) ? 2 : 0),
    run: (state, rng) => {
      const pool = others(state).filter((party) => !party.revealed);
      if (pool.length === 0) return null;
      const party = rng.pick(pool);
      party.revealed = true;
      return {
        kind: "press",
        text: `A leaked memo lays out the ${party.name}'s full list of demands. Everyone has read it by breakfast.`,
      };
    },
  },
  {
    id: "joint-statement",
    weight: (state) => (outsiders(state).length >= 2 ? 1.8 : 0),
    run: (state, rng) => {
      const pool = outsiders(state);
      if (pool.length < 2) return null;
      const [a, b] = rng.sample(pool, 2);
      a.priceModifier = Number(Math.min(1.9, a.priceModifier * 1.12).toFixed(3));
      b.priceModifier = Number(Math.min(1.9, b.priceModifier * 1.12).toFixed(3));
      return {
        kind: "trouble",
        text: `The ${a.name} and the ${b.name} issue a joint statement. They are negotiating as a bloc now.`,
      };
    },
  },
  {
    id: "poll-surge",
    weight: () => 1.5,
    run: (state, rng) => {
      const player = state.parliament.parties[state.playerKey];
      state.baseModifier += rng.range(3, 6);
      for (const party of others(state)) party.mood = clamp(party.mood + rng.range(1, 3), -50, 50);
      return {
        kind: "press",
        text: `A weekend poll shows the public blames everyone but the ${player.name} for the deadlock.`,
      };
    },
  },
  {
    id: "street-protest",
    weight: (state) => (Object.keys(state.coalition.commitments).length >= 1 ? 1.8 : 0),
    run: (state, rng) => {
      const issueKeys = Object.keys(state.coalition.commitments);
      if (issueKeys.length === 0) return null;
      const issue = state.parliament.issues[rng.pick(issueKeys)];
      state.baseModifier -= rng.range(1, 4);
      for (const party of partners(state)) party.mood = clamp(party.mood - rng.range(0, 3), -50, 50);
      return {
        kind: "press",
        text: `Tens of thousands march over ${issue.name.toLowerCase()}. Your partners spend the day denying they agreed to anything.`,
      };
    },
  },
  {
    id: "deadline-pressure",
    weight: (state) => (daysLeft(state) <= 8 ? 3 : 0),
    run: (state) => {
      for (const party of others(state)) {
        party.priceModifier = Number(Math.max(0.55, party.priceModifier * 0.92).toFixed(3));
      }
      return {
        kind: "info",
        text: "With the mandate running out, everybody's demands quietly get smaller.",
      };
    },
  },
  {
    id: "new-red-line",
    weight: (state) => (daysLeft(state) > 6 && outsiders(state).length >= 2 ? 1.2 : 0),
    run: (state, rng) => {
      const pool = outsiders(state);
      const pairs: Array<[Party, Party]> = [];
      for (const a of pool) {
        for (const b of others(state)) {
          if (a.key === b.key || a.vetoes.includes(b.key)) continue;
          if (ideologyDistance(a.ideology, b.ideology) > 0.42) pairs.push([a, b]);
        }
      }
      if (pairs.length === 0) return null;
      const [a, b] = rng.pick(pairs);
      a.vetoes.push(b.key);
      b.vetoes.push(a.key);
      return {
        kind: "trouble",
        text: `${a.leader} rules it out on live radio: the ${a.name} will never sit with the ${b.name}.`,
      };
    },
  },
];

/**
 * Roll one overnight event, rejecting any outcome that would leave the player
 * with no path to a majority at all.
 */
export const runOvernightEvent = (state: GameState, rng: Rng): LogEntry | null => {
  if (!rng.chance(0.55)) return null;

  const candidates = EVENTS.filter((event) => event.weight(state) > 0);
  if (candidates.length === 0) return null;

  const snapshot = JSON.stringify({
    parties: state.parliament.parties,
    baseModifier: state.baseModifier,
  });

  const event = rng.weighted(candidates, (candidate) => candidate.weight(state));
  const result = event.run(state, rng);
  if (!result) return null;

  const stillPossible =
    viableCoalitions(state.parliament, state.playerKey).length > 0 && openRoutes(state).length > 0;
  if (!stillPossible) {
    const restored = JSON.parse(snapshot) as {
      parties: GameState["parliament"]["parties"];
      baseModifier: number;
    };
    state.parliament.parties = restored.parties;
    state.baseModifier = restored.baseModifier;
    return null;
  }

  return { day: state.day, kind: result.kind, text: result.text };
};
