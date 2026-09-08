/** Procedural generation of a hung parliament worth negotiating over. */

import { ISSUES, PORTFOLIOS, PORTFOLIOS_BY_KEY } from "./content";
import { BLURBS, COUNTRIES, FIRST_NAMES, PARTY_CORE, SURNAMES } from "./names";
import { Rng } from "./rng";
import type { Coalition, GameState, Ideology, Parliament, Party } from "./types";
import { ideologyDistance } from "./types";

interface Archetype {
  id: string;
  ideology: Ideology;
  pragmatism: number;
  ambition: number;
  prefixes: string[];
}

const ARCHETYPES: Archetype[] = [
  {
    id: "social-democratic",
    ideology: { economy: -6, society: -3, security: -3 },
    pragmatism: 0.75,
    ambition: 1.0,
    prefixes: ["Social Democratic", "Labour", "Solidarity"],
  },
  {
    id: "green-left",
    ideology: { economy: -7, society: -6, security: -6 },
    pragmatism: 0.35,
    ambition: 0.8,
    prefixes: ["Green", "Ecological", "Tomorrow"],
  },
  {
    id: "liberal-centre",
    ideology: { economy: 3, society: -5, security: 0 },
    pragmatism: 0.7,
    ambition: 0.9,
    prefixes: ["Liberal", "Civic", "Free"],
  },
  {
    id: "technocratic-centre",
    ideology: { economy: 1, society: 0, security: 1 },
    pragmatism: 0.85,
    ambition: 1.1,
    prefixes: ["Centre", "Renewal", "Republic"],
  },
  {
    id: "conservative",
    ideology: { economy: 6, society: 4, security: 5 },
    pragmatism: 0.7,
    ambition: 1.0,
    prefixes: ["Conservative", "National", "Order"],
  },
  {
    id: "religious",
    ideology: { economy: -2, society: 9, security: 2 },
    pragmatism: 0.55,
    ambition: 1.3,
    prefixes: ["Covenant", "Faithful", "Traditional"],
  },
  {
    id: "nationalist-right",
    ideology: { economy: 5, society: 6, security: 9 },
    pragmatism: 0.4,
    ambition: 1.1,
    prefixes: ["Homeland", "Patriotic", "Sovereign"],
  },
  {
    id: "agrarian",
    ideology: { economy: -1, society: 3, security: 0 },
    pragmatism: 0.8,
    ambition: 0.9,
    prefixes: ["Agrarian", "Provincial", "Rural"],
  },
  {
    id: "left-populist",
    ideology: { economy: -8, society: 4, security: 3 },
    pragmatism: 0.45,
    ambition: 1.2,
    prefixes: ["People's", "Justice", "Popular"],
  },
  {
    id: "civil-rights",
    ideology: { economy: -5, society: -7, security: -9 },
    pragmatism: 0.3,
    ambition: 0.7,
    prefixes: ["Equality", "Citizens'", "Unity"],
  },
  {
    id: "libertarian",
    ideology: { economy: 9, society: -2, security: 2 },
    pragmatism: 0.6,
    ambition: 0.8,
    prefixes: ["Enterprise", "Liberty", "Free Market"],
  },
  {
    id: "pensioners",
    ideology: { economy: -4, society: 1, security: 0 },
    pragmatism: 0.9,
    ambition: 0.6,
    prefixes: ["Pensioners'", "Generations", "Dignity"],
  },
];

export class GenerationError extends Error {}

const uniqueName = (used: Set<string>, build: () => string): string => {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const name = build();
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  throw new GenerationError("ran out of unique names");
};

/** Seat counts that look like a real election: one big party, a long tail. */
const seatSplit = (rng: Rng, count: number, total: number): number[] => {
  const weights = Array.from({ length: count }, () => Math.pow(rng.range(0.35, 1.0), 1.8)).sort(
    (a, b) => b - a,
  );
  weights[0] *= rng.range(1.3, 1.8);
  const scale = total / weights.reduce((sum, w) => sum + w, 0);
  const seats = weights.map((w) => Math.max(3, Math.round(w * scale)));

  // Reconcile rounding against the fixed size of the chamber.
  let guard = 0;
  while (seats.reduce((sum, s) => sum + s, 0) !== total && guard < 5000) {
    guard += 1;
    const drift = total - seats.reduce((sum, s) => sum + s, 0);
    const index = rng.int(0, count - 1);
    if (drift > 0) seats[index] += 1;
    else if (seats[index] > 3) seats[index] -= 1;
  }
  return seats.sort((a, b) => b - a);
};

/** A wish list biased towards the ministries a party is obsessed with. */
const buildWants = (rng: Rng, ideology: Ideology): string[] => {
  const scored = PORTFOLIOS.map((portfolio) => {
    const affinity = Math.abs(ideology[portfolio.axis]) / 10;
    return {
      key: portfolio.key,
      weight: portfolio.prestige * (0.6 + affinity) * rng.range(0.7, 1.4),
    };
  });
  scored.sort((a, b) => b.weight - a.weight);
  return scored.slice(0, rng.int(3, 4)).map((entry) => entry.key);
};

/** Parties care most about the axes on which they hold strong opinions. */
const buildSalience = (rng: Rng, ideology: Ideology): Record<string, number> => {
  const salience: Record<string, number> = {};
  for (const issue of ISSUES) {
    const intensity = Math.abs(ideology[issue.axis]) / 10;
    salience[issue.key] = Number((0.3 + 1.5 * intensity * rng.range(0.6, 1.2)).toFixed(2));
  }
  return salience;
};

/** Mutual red lines between the parties furthest apart. */
const assignVetoes = (rng: Rng, parties: Party[], playerKey: string): void => {
  const pairs: Array<{ distance: number; a: Party; b: Party }> = [];
  for (let i = 0; i < parties.length; i += 1) {
    for (let j = i + 1; j < parties.length; j += 1) {
      pairs.push({
        distance: ideologyDistance(parties[i].ideology, parties[j].ideology),
        a: parties[i],
        b: parties[j],
      });
    }
  }
  pairs.sort((x, y) => y.distance - x.distance);

  let budget = rng.int(2, 3);
  for (const { distance, a, b } of pairs) {
    if (budget <= 0 || distance < 0.45) break;
    // Never lock the player out of the whole board on day one.
    if ((a.key === playerKey || b.key === playerKey) && rng.chance(0.55)) continue;
    if (a.vetoes.includes(b.key)) continue;
    a.vetoes.push(b.key);
    b.vetoes.push(a.key);
    budget -= 1;
  }
};

export const hasVetoConflict = (parliament: Parliament, members: readonly string[]): boolean => {
  const set = new Set(members);
  return members.some((key) => parliament.parties[key].vetoes.some((veto) => set.has(veto)));
};

/** True if some junior partner could be dropped and still leave a majority. */
export const isOversized = (parliament: Parliament, members: readonly string[]): boolean => {
  const seats = members.reduce((sum, key) => sum + parliament.parties[key].seats, 0);
  return members
    .slice(1)
    .some((key) => seats - parliament.parties[key].seats >= parliament.majority);
};

/**
 * Every minimal, veto-clean majority that includes the player.
 *
 * Used to validate generated scenarios and to power both the in-game analyst
 * and the leverage calculation in {@link ./negotiation}.
 */
export const viableCoalitions = (parliament: Parliament, playerKey: string): string[][] => {
  const others = Object.values(parliament.parties)
    .filter((party) => party.key !== playerKey)
    .sort((a, b) => b.seats - a.seats)
    .map((party) => party.key);

  const found: string[][] = [];
  const total = 1 << others.length;
  for (let mask = 0; mask < total; mask += 1) {
    const members = [playerKey];
    for (let bit = 0; bit < others.length; bit += 1) {
      if (mask & (1 << bit)) members.push(others[bit]);
    }
    const seats = members.reduce((sum, key) => sum + parliament.parties[key].seats, 0);
    if (seats < parliament.majority) continue;
    if (hasVetoConflict(parliament, members)) continue;
    if (isOversized(parliament, members)) continue;
    found.push(members);
  }
  return found;
};

export const generateParliament = (
  rng: Rng,
  partyCount: number,
  totalSeats: number,
): { parliament: Parliament; playerKey: string } => {
  const usedPartyNames = new Set<string>();
  const usedLeaders = new Set<string>();

  const archetypes = rng.sample(ARCHETYPES, partyCount);
  const seats = seatSplit(rng, partyCount, totalSeats);

  const parties: Party[] = archetypes.map((archetype, index) => {
    const ideology: Ideology = {
      economy: Number(Math.max(-10, Math.min(10, archetype.ideology.economy + rng.range(-2, 2))).toFixed(1)),
      society: Number(Math.max(-10, Math.min(10, archetype.ideology.society + rng.range(-2, 2))).toFixed(1)),
      security: Number(Math.max(-10, Math.min(10, archetype.ideology.security + rng.range(-2, 2))).toFixed(1)),
    };
    return {
      key: `p${index}`,
      name: uniqueName(usedPartyNames, () => `${rng.pick(archetype.prefixes)} ${rng.pick(PARTY_CORE)}`),
      leader: uniqueName(usedLeaders, () => `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`),
      seats: seats[index],
      ideology,
      pragmatism: Number(Math.min(0.95, Math.max(0.15, archetype.pragmatism + rng.range(-0.12, 0.12))).toFixed(2)),
      ambition: Number(Math.max(0.4, archetype.ambition + rng.range(-0.2, 0.2)).toFixed(2)),
      portfolioWants: buildWants(rng, ideology),
      issueSalience: buildSalience(rng, ideology),
      vetoes: [],
      mood: Number(rng.range(-8, 8).toFixed(1)),
      priceModifier: 1,
      revealed: false,
      blurb: rng.pick(BLURBS),
    };
  });

  // The player leads one of the two largest parties: enough weight to be handed
  // the mandate, never enough to govern alone.
  const player = rng.chance(0.6) ? parties[0] : parties[1];
  assignVetoes(rng, parties, player.key);

  const parliament: Parliament = {
    name: rng.pick(COUNTRIES),
    parties: Object.fromEntries(parties.map((party) => [party.key, party])),
    portfolios: { ...PORTFOLIOS_BY_KEY },
    issues: Object.fromEntries(ISSUES.map((issue) => [issue.key, issue])),
    totalSeats,
    majority: Math.floor(totalSeats / 2) + 1,
  };
  return { parliament, playerKey: player.key };
};

export interface NewGameOptions {
  seed?: number;
  partyCount?: number;
  totalSeats?: number;
  days?: number;
}

/** Generate a scenario that is hung, veto-constrained, and actually solvable. */
export const newGame = (options: NewGameOptions = {}): GameState => {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const partyCount = options.partyCount ?? 8;
  const totalSeats = options.totalSeats ?? 120;
  const days = options.days ?? 28;

  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const { parliament, playerKey } = generateParliament(rng, partyCount, totalSeats);
    const player = parliament.parties[playerKey];
    if (player.seats >= parliament.majority) continue; // not a hung parliament at all

    const routes = viableCoalitions(parliament, playerKey);
    if (routes.length < 2 || routes.length > 14) continue; // unsolvable, or too easy

    const coalition: Coalition = {
      members: [playerKey],
      portfolios: { [rng.chance(0.5) ? "finance" : "defence"]: playerKey },
      commitments: {},
    };

    return {
      parliament,
      playerKey,
      coalition,
      day: 1,
      daysTotal: days,
      baseModifier: 0,
      log: [
        {
          day: 1,
          kind: "info",
          text: `${player.leader} of the ${player.name} receives the mandate to form a government.`,
        },
      ],
      rngState: rng.state,
      seed,
      finished: false,
      outcome: null,
      epilogue: null,
    };
  }
  throw new GenerationError("could not generate a solvable parliament; try another seed");
};
