/**
 * The real Knesset, as elected.
 *
 * Baseline seats are the 25th Knesset (November 2022), 120 in total. Elections
 * during a campaign re-roll around these numbers rather than replacing them.
 *
 * `bloc` and `leftRight` are the party's real politics. Nothing in the bidding
 * ever reads them — see {@link ./allocation} — they exist so that the card deck
 * has something to talk about, and as the one hook to switch on later if
 * ideology should start constraining deals.
 */

export const BLOCS = ["right", "centre", "left", "haredi", "arab"] as const;
export type Bloc = (typeof BLOCS)[number];

export const BLOC_LABEL: Record<Bloc, string> = {
  right: "Right",
  centre: "Centre",
  left: "Left",
  haredi: "Haredi",
  arab: "Arab",
};

export interface PartyProfile {
  key: string;
  name: string;
  /** Seats at the baseline election; the starting point for every re-roll. */
  baseSeats: number;
  bloc: Bloc;
  /** -10 (left) to +10 (right). Descriptive only. */
  leftRight: number;
}

export const PARTY_PROFILES: PartyProfile[] = [
  { key: "likud", name: "Likud", baseSeats: 32, bloc: "right", leftRight: 6 },
  { key: "yesh-atid", name: "Yesh Atid", baseSeats: 24, bloc: "centre", leftRight: -1 },
  { key: "rz", name: "Religious Zionism", baseSeats: 14, bloc: "right", leftRight: 9 },
  { key: "national-unity", name: "National Unity", baseSeats: 12, bloc: "centre", leftRight: 2 },
  { key: "shas", name: "Shas", baseSeats: 11, bloc: "haredi", leftRight: 4 },
  { key: "utj", name: "United Torah Judaism", baseSeats: 7, bloc: "haredi", leftRight: 4 },
  { key: "yisrael-beiteinu", name: "Yisrael Beiteinu", baseSeats: 6, bloc: "right", leftRight: 5 },
  { key: "raam", name: "Ra'am", baseSeats: 5, bloc: "arab", leftRight: -3 },
  { key: "hadash-taal", name: "Hadash-Ta'al", baseSeats: 5, bloc: "arab", leftRight: -8 },
  { key: "labor", name: "Labor", baseSeats: 4, bloc: "left", leftRight: -6 },
];

export const TOTAL_SEATS = 120;
export const MAJORITY = 61;

/** Seats below this at an election and the party falls out of the Knesset. */
export const ELECTORAL_THRESHOLD = 4;

export const PROFILES_BY_KEY: Record<string, PartyProfile> = Object.fromEntries(
  PARTY_PROFILES.map((profile) => [profile.key, profile]),
);
