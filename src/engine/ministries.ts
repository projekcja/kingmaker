/**
 * The eighteen ministries, and what each is worth.
 *
 * Budgets run 1..18 billion, roughly ranked by real weight. Every player holds
 * one of each, so a bid is only ever compared against another player's bid for
 * the same party — the ladder is what makes some ministries worth fighting for.
 *
 * Cards can create a nineteenth or abolish one, so the live list lives in the
 * game state; this is only the opening set.
 */

export interface Ministry {
  key: string;
  name: string;
  /** Billions. Also its bidding weight. */
  budget: number;
}

export const MINISTRIES: Ministry[] = [
  { key: "defense", name: "Defense", budget: 18 },
  { key: "education", name: "Education", budget: 17 },
  { key: "health", name: "Health", budget: 16 },
  { key: "finance", name: "Finance", budget: 15 },
  { key: "interior", name: "Interior", budget: 14 },
  { key: "transport", name: "Transportation", budget: 13 },
  { key: "national-security", name: "National Security", budget: 12 },
  { key: "justice", name: "Justice", budget: 11 },
  { key: "housing", name: "Housing", budget: 10 },
  { key: "foreign", name: "Foreign Affairs", budget: 9 },
  { key: "economy", name: "Economy", budget: 8 },
  { key: "energy", name: "Energy", budget: 7 },
  { key: "agriculture", name: "Agriculture", budget: 6 },
  { key: "communications", name: "Communications", budget: 5 },
  { key: "environment", name: "Environmental Protection", budget: 4 },
  { key: "culture", name: "Culture & Sport", budget: 3 },
  { key: "tourism", name: "Tourism", budget: 2 },
  { key: "science", name: "Science & Technology", budget: 1 },
];

/** Total billions each player has to spread across the board every turn. */
export const TOTAL_BUDGET = MINISTRIES.reduce((sum, ministry) => sum + ministry.budget, 0);

/** Names a card can use when it invents a new portfolio. */
export const EXTRA_MINISTRIES: Array<{ key: string; name: string; budget: number }> = [
  { key: "diaspora", name: "Diaspora Affairs", budget: 6 },
  { key: "negev-galilee", name: "Negev & Galilee", budget: 5 },
  { key: "immigration", name: "Immigrant Absorption", budget: 7 },
  { key: "heritage", name: "Heritage", budget: 3 },
  { key: "settlements", name: "Settlements", budget: 9 },
];
