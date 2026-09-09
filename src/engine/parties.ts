/**
 * The real Knesset, as elected.
 *
 * A campaign opens on a **chamber**: a named Knesset, with the seats it actually
 * won. Every election from the first in 1949 to the twenty-fifth in 2022 is
 * here, plus one projection of the next one, which is the default.
 *
 * Party rosters are genuinely different between elections — lists merge, split,
 * rename and vanish — so each chamber carries its own list rather than sharing
 * one table of seat counts. Keys are reused where the party is the same one, so
 * Likud is `likud` in every chamber it appears in, and Mapai is `mapai` in the
 * five it contested under that name.
 *
 * `bloc` and `leftRight` are the party's real politics. Nothing in the bidding
 * ever reads them — see {@link ./allocation} — they exist so that the card deck
 * has something to talk about, and as the one hook to switch on later if
 * ideology should start constraining deals. Applying a five-way bloc map built
 * for the 2020s to the politics of 1949 is a rough fit by construction; it is
 * descriptive colour, and nothing turns on it.
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
  /** Seats at this chamber's election; the starting point for every re-roll. */
  baseSeats: number;
  bloc: Bloc;
  /** -10 (left) to +10 (right). Descriptive only. */
  leftRight: number;
}

/**
 * What actually happened after an election.
 *
 * The board a chamber deals you is only half the story; the other half is
 * whether anyone built 61 out of it and how long that held. Twice — the 21st
 * and the 22nd — nobody could, which is exactly the outcome this game models
 * as the Knesset dissolving itself.
 */
export interface Outcome {
  /** Key of the list that formed the government, or null when none did. */
  formedBy: string | null;
  /** The prime minister who formed it, or null. */
  premier: string | null;
  /** What became of it, and how long it ran. */
  note: string;
}

export interface Chamber {
  id: string;
  /** Button text on the setup screen: the ordinal, or "Next". */
  label: string;
  /** Election year, shown under the label. */
  year: number;
  /** The full name, for the line under the picker. */
  name: string;
  /** When the country voted, or when the projection was taken. */
  date: string;
  /** One line on what makes this board interesting to play. */
  note: string;
  /**
   * True when the seats are projected rather than counted.
   *
   * A projection is a snapshot of published polling averages entered by hand,
   * not a live feed and not a result. It goes stale, and it is the one chamber
   * in this file that is somebody's estimate rather than a matter of record.
   */
  projected?: boolean;
  /** Absent only on the projection, which has not been voted on. */
  outcome?: Outcome;
  parties: PartyProfile[];
}

/**
 * The chambers, newest first, with the projection at the top.
 *
 * Every list sums to 120, no key repeats inside a chamber, nobody starts with a
 * majority already in hand, and every recorded outcome names a list that
 * actually ran in that election. A test checks all four after any edit — which
 * matters, because the minor lists of the first eight Knessets are the least
 * certain data in this file.
 */
export const CHAMBERS: Chamber[] = [
  {
    id: "polls",
    label: "Next",
    year: 2026,
    name: "The next election",
    date: "polling average, late 2025",
    note: "no bloc anywhere near 61 — the hardest board in the game to build on",
    projected: true,
    parties: [
      { key: "likud", name: "Likud", baseSeats: 27, bloc: "right", leftRight: 6 },
      { key: "bennett", name: "Bennett 2026", baseSeats: 25, bloc: "right", leftRight: 4 },
      { key: "democrats", name: "The Democrats", baseSeats: 12, bloc: "left", leftRight: -7 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 12,
        bloc: "right",
        leftRight: 5,
      },
      { key: "otzma", name: "Otzma Yehudit", baseSeats: 9, bloc: "right", leftRight: 10 },
      { key: "shas", name: "Shas", baseSeats: 9, bloc: "haredi", leftRight: 4 },
      { key: "yesh-atid", name: "Yesh Atid", baseSeats: 9, bloc: "centre", leftRight: -1 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 7, bloc: "haredi", leftRight: 4 },
      { key: "hadash-taal", name: "Hadash-Ta'al", baseSeats: 5, bloc: "arab", leftRight: -8 },
      { key: "raam", name: "Ra'am", baseSeats: 5, bloc: "arab", leftRight: -3 },
    ],
  },
  {
    id: "knesset-25",
    label: "25th",
    year: 2022,
    name: "25th Knesset",
    date: "November 2022",
    note: "the sitting Knesset — a right bloc that reached 64 without buying anybody",
    outcome: {
      formedBy: "likud",
      premier: "Netanyahu",
      note:
        "The right bloc had 64 mandates without buying anybody, and was sworn in " +
        "six weeks after the vote. It is the government still sitting.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 32, bloc: "right", leftRight: 6 },
      { key: "yesh-atid", name: "Yesh Atid", baseSeats: 24, bloc: "centre", leftRight: -1 },
      { key: "rz", name: "Religious Zionism", baseSeats: 14, bloc: "right", leftRight: 9 },
      {
        key: "national-unity",
        name: "National Unity",
        baseSeats: 12,
        bloc: "centre",
        leftRight: 2,
      },
      { key: "shas", name: "Shas", baseSeats: 11, bloc: "haredi", leftRight: 4 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 7, bloc: "haredi", leftRight: 4 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 6,
        bloc: "right",
        leftRight: 5,
      },
      { key: "raam", name: "Ra'am", baseSeats: 5, bloc: "arab", leftRight: -3 },
      { key: "hadash-taal", name: "Hadash-Ta'al", baseSeats: 5, bloc: "arab", leftRight: -8 },
      { key: "labor", name: "Labor", baseSeats: 4, bloc: "left", leftRight: -6 },
    ],
  },
  {
    id: "knesset-24",
    label: "24th",
    year: 2021,
    name: "24th Knesset",
    date: "March 2021",
    note: "thirteen lists, nobody above 30 — the most crowded board there has been",
    outcome: {
      formedBy: "yamina",
      premier: "Bennett",
      note:
        "The smallest party ever to lead a government: seven mandates at the head " +
        "of an eight-party coalition running from the settler right to the " +
        "Islamists, rotating to Lapid after a year. It lasted 1 year 8 months.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 30, bloc: "right", leftRight: 6 },
      { key: "yesh-atid", name: "Yesh Atid", baseSeats: 17, bloc: "centre", leftRight: -1 },
      { key: "shas", name: "Shas", baseSeats: 9, bloc: "haredi", leftRight: 4 },
      { key: "blue-white", name: "Blue and White", baseSeats: 8, bloc: "centre", leftRight: 1 },
      { key: "yamina", name: "Yamina", baseSeats: 7, bloc: "right", leftRight: 7 },
      { key: "labor", name: "Labor", baseSeats: 7, bloc: "left", leftRight: -6 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 7, bloc: "haredi", leftRight: 4 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 7,
        bloc: "right",
        leftRight: 5,
      },
      { key: "rz", name: "Religious Zionism", baseSeats: 6, bloc: "right", leftRight: 9 },
      { key: "joint-list", name: "Joint List", baseSeats: 6, bloc: "arab", leftRight: -8 },
      { key: "new-hope", name: "New Hope", baseSeats: 6, bloc: "right", leftRight: 5 },
      { key: "meretz", name: "Meretz", baseSeats: 6, bloc: "left", leftRight: -8 },
      { key: "raam", name: "Ra'am", baseSeats: 4, bloc: "arab", leftRight: -3 },
    ],
  },
  {
    id: "knesset-23",
    label: "23rd",
    year: 2020,
    name: "23rd Knesset",
    date: "March 2020",
    note: "two giants at 36 and 33 — whoever you lead, one purchase decides it",
    outcome: {
      formedBy: "likud",
      premier: "Netanyahu",
      note:
        "A unity government with Gantz on a rotation agreement, formed to end three " +
        "elections in a year. It broke over the budget before the rotation came " +
        "due, and lasted 1 year.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 36, bloc: "right", leftRight: 6 },
      { key: "blue-white", name: "Blue and White", baseSeats: 33, bloc: "centre", leftRight: 1 },
      { key: "joint-list", name: "Joint List", baseSeats: 15, bloc: "arab", leftRight: -8 },
      { key: "shas", name: "Shas", baseSeats: 9, bloc: "haredi", leftRight: 4 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 7, bloc: "haredi", leftRight: 4 },
      {
        key: "labor-gesher-meretz",
        name: "Labor-Gesher-Meretz",
        baseSeats: 7,
        bloc: "left",
        leftRight: -7,
      },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 7,
        bloc: "right",
        leftRight: 5,
      },
      { key: "yamina", name: "Yamina", baseSeats: 6, bloc: "right", leftRight: 7 },
    ],
  },
  {
    id: "knesset-22",
    label: "22nd",
    year: 2019,
    name: "22nd Knesset",
    date: "September 2019",
    note: "the one that could not form a government at all, and went back to the polls",
    outcome: {
      formedBy: null,
      premier: null,
      note:
        "Neither Netanyahu nor Gantz could reach 61. The mandate went back to the " +
        "Knesset, which dissolved itself after 3 months, and the country voted a " +
        "third time in a year.",
    },
    parties: [
      { key: "blue-white", name: "Blue and White", baseSeats: 33, bloc: "centre", leftRight: 1 },
      { key: "likud", name: "Likud", baseSeats: 32, bloc: "right", leftRight: 6 },
      { key: "joint-list", name: "Joint List", baseSeats: 13, bloc: "arab", leftRight: -8 },
      { key: "shas", name: "Shas", baseSeats: 9, bloc: "haredi", leftRight: 4 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 8,
        bloc: "right",
        leftRight: 5,
      },
      { key: "yamina", name: "Yamina", baseSeats: 7, bloc: "right", leftRight: 7 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 7, bloc: "haredi", leftRight: 4 },
      { key: "labor-gesher", name: "Labor-Gesher", baseSeats: 6, bloc: "left", leftRight: -6 },
      {
        key: "democratic-union",
        name: "Democratic Union",
        baseSeats: 5,
        bloc: "left",
        leftRight: -8,
      },
    ],
  },
  {
    id: "knesset-21",
    label: "21st",
    year: 2019,
    name: "21st Knesset",
    date: "April 2019",
    note: "a dead heat at 35 apiece, and eleven lists to buy the difference from",
    outcome: {
      formedBy: null,
      premier: null,
      note:
        "Netanyahu won the mandate and could not close the deal with Lieberman over " +
        "the conscription bill. The Knesset dissolved itself after 7 weeks rather " +
        "than let anyone else try — the first time that had ever happened.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 35, bloc: "right", leftRight: 6 },
      { key: "blue-white", name: "Blue and White", baseSeats: 35, bloc: "centre", leftRight: 1 },
      { key: "shas", name: "Shas", baseSeats: 8, bloc: "haredi", leftRight: 4 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 8, bloc: "haredi", leftRight: 4 },
      { key: "hadash-taal", name: "Hadash-Ta'al", baseSeats: 6, bloc: "arab", leftRight: -8 },
      { key: "labor", name: "Labor", baseSeats: 6, bloc: "left", leftRight: -6 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 5,
        bloc: "right",
        leftRight: 5,
      },
      {
        key: "urwp",
        name: "Union of Right-Wing Parties",
        baseSeats: 5,
        bloc: "right",
        leftRight: 9,
      },
      { key: "meretz", name: "Meretz", baseSeats: 4, bloc: "left", leftRight: -8 },
      { key: "kulanu", name: "Kulanu", baseSeats: 4, bloc: "centre", leftRight: 3 },
      { key: "raam-balad", name: "Ra'am-Balad", baseSeats: 4, bloc: "arab", leftRight: -6 },
    ],
  },
  {
    id: "knesset-20",
    label: "20th",
    year: 2015,
    name: "20th Knesset",
    date: "March 2015",
    note: "the Joint List's high-water mark, and ten lists with nobody past 30",
    outcome: {
      formedBy: "likud",
      premier: "Netanyahu",
      note:
        "A 61-seat coalition, the narrowest arithmetic there is, later widened by " +
        "bringing Yisrael Beiteinu in. It ran the full 4 years.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 30, bloc: "right", leftRight: 6 },
      { key: "zionist-union", name: "Zionist Union", baseSeats: 24, bloc: "left", leftRight: -5 },
      { key: "joint-list", name: "Joint List", baseSeats: 13, bloc: "arab", leftRight: -8 },
      { key: "yesh-atid", name: "Yesh Atid", baseSeats: 11, bloc: "centre", leftRight: -1 },
      { key: "kulanu", name: "Kulanu", baseSeats: 10, bloc: "centre", leftRight: 3 },
      {
        key: "habayit-hayehudi",
        name: "Habayit Hayehudi",
        baseSeats: 8,
        bloc: "right",
        leftRight: 8,
      },
      { key: "shas", name: "Shas", baseSeats: 7, bloc: "haredi", leftRight: 4 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 6,
        bloc: "right",
        leftRight: 5,
      },
      { key: "utj", name: "United Torah Judaism", baseSeats: 6, bloc: "haredi", leftRight: 4 },
      { key: "meretz", name: "Meretz", baseSeats: 5, bloc: "left", leftRight: -8 },
    ],
  },
  {
    id: "knesset-19",
    label: "19th",
    year: 2013,
    name: "19th Knesset",
    date: "January 2013",
    note: "the year the haredi parties sat out and a new centre list came second",
    outcome: {
      formedBy: "likud-beiteinu",
      premier: "Netanyahu",
      note:
        "The one modern government formed without the haredi parties, which is both " +
        "what held it together and what broke it. It lasted 1 year 10 months.",
    },
    parties: [
      {
        key: "likud-beiteinu",
        name: "Likud Yisrael Beiteinu",
        baseSeats: 31,
        bloc: "right",
        leftRight: 6,
      },
      { key: "yesh-atid", name: "Yesh Atid", baseSeats: 19, bloc: "centre", leftRight: -1 },
      { key: "labor", name: "Labor", baseSeats: 15, bloc: "left", leftRight: -6 },
      {
        key: "habayit-hayehudi",
        name: "Habayit Hayehudi",
        baseSeats: 12,
        bloc: "right",
        leftRight: 8,
      },
      { key: "shas", name: "Shas", baseSeats: 11, bloc: "haredi", leftRight: 4 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 7, bloc: "haredi", leftRight: 4 },
      { key: "hatnua", name: "Hatnua", baseSeats: 6, bloc: "centre", leftRight: -2 },
      { key: "meretz", name: "Meretz", baseSeats: 6, bloc: "left", leftRight: -8 },
      {
        key: "ual-taal",
        name: "United Arab List-Ta'al",
        baseSeats: 4,
        bloc: "arab",
        leftRight: -4,
      },
      { key: "hadash", name: "Hadash", baseSeats: 4, bloc: "arab", leftRight: -8 },
      { key: "balad", name: "Balad", baseSeats: 3, bloc: "arab", leftRight: -7 },
      { key: "kadima", name: "Kadima", baseSeats: 2, bloc: "centre", leftRight: 1 },
    ],
  },
  {
    id: "knesset-18",
    label: "18th",
    year: 2009,
    name: "18th Knesset",
    date: "February 2009",
    note: "Kadima won and Likud governed — the clearest case in the game's favour",
    outcome: {
      formedBy: "likud",
      premier: "Netanyahu",
      note:
        "Kadima won 28 seats to Likud's 27 and never governed a day of it: " +
        "Netanyahu had the bloc behind him and Livni did not. It ran 3 years 11 " +
        "months.",
    },
    parties: [
      { key: "kadima", name: "Kadima", baseSeats: 28, bloc: "centre", leftRight: 1 },
      { key: "likud", name: "Likud", baseSeats: 27, bloc: "right", leftRight: 6 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 15,
        bloc: "right",
        leftRight: 5,
      },
      { key: "labor", name: "Labor", baseSeats: 13, bloc: "left", leftRight: -6 },
      { key: "shas", name: "Shas", baseSeats: 11, bloc: "haredi", leftRight: 4 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 5, bloc: "haredi", leftRight: 4 },
      {
        key: "ual-taal",
        name: "United Arab List-Ta'al",
        baseSeats: 4,
        bloc: "arab",
        leftRight: -4,
      },
      { key: "national-union", name: "National Union", baseSeats: 4, bloc: "right", leftRight: 9 },
      { key: "hadash", name: "Hadash", baseSeats: 4, bloc: "arab", leftRight: -8 },
      { key: "meretz", name: "Meretz", baseSeats: 3, bloc: "left", leftRight: -8 },
      {
        key: "habayit-hayehudi",
        name: "Habayit Hayehudi",
        baseSeats: 3,
        bloc: "right",
        leftRight: 8,
      },
      { key: "balad", name: "Balad", baseSeats: 3, bloc: "arab", leftRight: -7 },
    ],
  },
  {
    id: "knesset-17",
    label: "17th",
    year: 2006,
    name: "17th Knesset",
    date: "March 2006",
    note: "a pensioners' party from nowhere took seven seats and everyone's arithmetic with it",
    outcome: {
      formedBy: "kadima",
      premier: "Olmert",
      note:
        "Formed in a month, and ended by a corruption investigation rather than by " +
        "the Knesset. Livni won the party leadership but could not form a " +
        "government, so the country voted. 2 years 11 months.",
    },
    parties: [
      { key: "kadima", name: "Kadima", baseSeats: 29, bloc: "centre", leftRight: 1 },
      { key: "labor", name: "Labor", baseSeats: 19, bloc: "left", leftRight: -6 },
      { key: "shas", name: "Shas", baseSeats: 12, bloc: "haredi", leftRight: 4 },
      { key: "likud", name: "Likud", baseSeats: 12, bloc: "right", leftRight: 6 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 11,
        bloc: "right",
        leftRight: 5,
      },
      { key: "nu-nrp", name: "National Union / NRP", baseSeats: 9, bloc: "right", leftRight: 8 },
      { key: "gil", name: "Gil", baseSeats: 7, bloc: "centre", leftRight: 0 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 6, bloc: "haredi", leftRight: 4 },
      { key: "meretz", name: "Meretz", baseSeats: 5, bloc: "left", leftRight: -8 },
      { key: "ual", name: "United Arab List", baseSeats: 4, bloc: "arab", leftRight: -3 },
      { key: "hadash", name: "Hadash", baseSeats: 3, bloc: "arab", leftRight: -8 },
      { key: "balad", name: "Balad", baseSeats: 3, bloc: "arab", leftRight: -7 },
    ],
  },
  {
    id: "knesset-16",
    label: "16th",
    year: 2003,
    name: "16th Knesset",
    date: "January 2003",
    note: "Likud at 38 with a secular centre list at 15 holding the balance",
    outcome: {
      formedBy: "likud",
      premier: "Sharon",
      note:
        "Sharon then split his own party to found Kadima, and was incapacitated " +
        "weeks later. Olmert finished the term. 3 years 2 months.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 38, bloc: "right", leftRight: 6 },
      { key: "labor", name: "Labor", baseSeats: 19, bloc: "left", leftRight: -6 },
      { key: "shinui", name: "Shinui", baseSeats: 15, bloc: "centre", leftRight: 1 },
      { key: "shas", name: "Shas", baseSeats: 11, bloc: "haredi", leftRight: 4 },
      { key: "national-union", name: "National Union", baseSeats: 7, bloc: "right", leftRight: 9 },
      { key: "meretz", name: "Meretz", baseSeats: 6, bloc: "left", leftRight: -8 },
      { key: "nrp", name: "National Religious Party", baseSeats: 6, bloc: "right", leftRight: 5 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 5, bloc: "haredi", leftRight: 4 },
      { key: "hadash-taal", name: "Hadash-Ta'al", baseSeats: 3, bloc: "arab", leftRight: -8 },
      { key: "am-ehad", name: "Am Ehad", baseSeats: 3, bloc: "left", leftRight: -5 },
      { key: "balad", name: "Balad", baseSeats: 3, bloc: "arab", leftRight: -7 },
      {
        key: "yisrael-baaliyah",
        name: "Yisrael BaAliyah",
        baseSeats: 2,
        bloc: "centre",
        leftRight: 3,
      },
      { key: "ual", name: "United Arab List", baseSeats: 2, bloc: "arab", leftRight: -3 },
    ],
  },
  {
    id: "knesset-15",
    label: "15th",
    year: 1999,
    name: "15th Knesset",
    date: "May 1999",
    note: "fifteen lists and a largest party of 26 — the most fragmented Knesset ever elected",
    outcome: {
      formedBy: "one-israel",
      premier: "Barak",
      note:
        "It came apart inside a year, and then the premiership changed hands " +
        "without a general election at all: a one-off direct vote for prime " +
        "minister in 2001 gave the job to Sharon on the same Knesset. 3 years 8 " +
        "months.",
    },
    parties: [
      { key: "one-israel", name: "One Israel", baseSeats: 26, bloc: "left", leftRight: -4 },
      { key: "likud", name: "Likud", baseSeats: 19, bloc: "right", leftRight: 6 },
      { key: "shas", name: "Shas", baseSeats: 17, bloc: "haredi", leftRight: 4 },
      { key: "meretz", name: "Meretz", baseSeats: 10, bloc: "left", leftRight: -8 },
      {
        key: "yisrael-baaliyah",
        name: "Yisrael BaAliyah",
        baseSeats: 6,
        bloc: "centre",
        leftRight: 3,
      },
      { key: "shinui", name: "Shinui", baseSeats: 6, bloc: "centre", leftRight: 1 },
      { key: "centre-party", name: "Centre Party", baseSeats: 6, bloc: "centre", leftRight: 0 },
      { key: "nrp", name: "National Religious Party", baseSeats: 5, bloc: "right", leftRight: 5 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 5, bloc: "haredi", leftRight: 4 },
      { key: "ual", name: "United Arab List", baseSeats: 5, bloc: "arab", leftRight: -3 },
      { key: "national-union", name: "National Union", baseSeats: 4, bloc: "right", leftRight: 9 },
      {
        key: "yisrael-beiteinu",
        name: "Yisrael Beiteinu",
        baseSeats: 4,
        bloc: "right",
        leftRight: 5,
      },
      { key: "hadash", name: "Hadash", baseSeats: 3, bloc: "arab", leftRight: -8 },
      { key: "balad", name: "Balad", baseSeats: 2, bloc: "arab", leftRight: -7 },
      { key: "am-ehad", name: "Am Ehad", baseSeats: 2, bloc: "left", leftRight: -5 },
    ],
  },
  {
    id: "knesset-14",
    label: "14th",
    year: 1996,
    name: "14th Knesset",
    date: "May 1996",
    note: "the first direct election of a prime minister, and a 34-32 split behind it",
    outcome: {
      formedBy: "likud",
      premier: "Netanyahu",
      note:
        "The first directly elected prime minister, and the last: splitting the " +
        "ballot shrank both big parties and the experiment was repealed. 3 years.",
    },
    parties: [
      { key: "labor", name: "Labor", baseSeats: 34, bloc: "left", leftRight: -6 },
      { key: "likud", name: "Likud", baseSeats: 32, bloc: "right", leftRight: 6 },
      { key: "shas", name: "Shas", baseSeats: 10, bloc: "haredi", leftRight: 4 },
      { key: "nrp", name: "National Religious Party", baseSeats: 9, bloc: "right", leftRight: 5 },
      { key: "meretz", name: "Meretz", baseSeats: 9, bloc: "left", leftRight: -8 },
      {
        key: "yisrael-baaliyah",
        name: "Yisrael BaAliyah",
        baseSeats: 7,
        bloc: "centre",
        leftRight: 3,
      },
      { key: "hadash", name: "Hadash", baseSeats: 5, bloc: "arab", leftRight: -8 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 4, bloc: "haredi", leftRight: 4 },
      { key: "third-way", name: "Third Way", baseSeats: 4, bloc: "centre", leftRight: 2 },
      { key: "ual", name: "United Arab List", baseSeats: 4, bloc: "arab", leftRight: -3 },
      { key: "moledet", name: "Moledet", baseSeats: 2, bloc: "right", leftRight: 9 },
    ],
  },
  {
    id: "knesset-13",
    label: "13th",
    year: 1992,
    name: "13th Knesset",
    date: "June 1992",
    note: "Labor 44, Likud 32, and a left bloc that could just about reach 61",
    outcome: {
      formedBy: "labor",
      premier: "Rabin",
      note:
        "A narrow coalition propped up from outside by the Arab parties, which is " +
        "how Oslo got through the Knesset. Rabin was assassinated in office and " +
        "Peres finished the term. 3 years 11 months.",
    },
    parties: [
      { key: "labor", name: "Labor", baseSeats: 44, bloc: "left", leftRight: -6 },
      { key: "likud", name: "Likud", baseSeats: 32, bloc: "right", leftRight: 6 },
      { key: "meretz", name: "Meretz", baseSeats: 12, bloc: "left", leftRight: -8 },
      { key: "tzomet", name: "Tzomet", baseSeats: 8, bloc: "right", leftRight: 8 },
      { key: "nrp", name: "National Religious Party", baseSeats: 6, bloc: "right", leftRight: 5 },
      { key: "shas", name: "Shas", baseSeats: 6, bloc: "haredi", leftRight: 4 },
      { key: "utj", name: "United Torah Judaism", baseSeats: 4, bloc: "haredi", leftRight: 4 },
      { key: "hadash", name: "Hadash", baseSeats: 3, bloc: "arab", leftRight: -8 },
      { key: "moledet", name: "Moledet", baseSeats: 3, bloc: "right", leftRight: 9 },
      { key: "adp", name: "Arab Democratic Party", baseSeats: 2, bloc: "arab", leftRight: -4 },
    ],
  },
  {
    id: "knesset-12",
    label: "12th",
    year: 1988,
    name: "12th Knesset",
    date: "November 1988",
    note: "40 against 39 with fifteen lists in between — the kingmakers' Knesset",
    outcome: {
      formedBy: "likud",
      premier: "Shamir",
      note:
        "A unity government first, brought down in 1990 by the only successful " +
        "no-confidence vote in Israeli history; Shamir then rebuilt a narrow right " +
        "coalition on the same Knesset. 3 years 7 months.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 40, bloc: "right", leftRight: 6 },
      { key: "alignment", name: "Alignment", baseSeats: 39, bloc: "left", leftRight: -5 },
      { key: "shas", name: "Shas", baseSeats: 6, bloc: "haredi", leftRight: 4 },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 5, bloc: "haredi", leftRight: 4 },
      { key: "nrp", name: "National Religious Party", baseSeats: 5, bloc: "right", leftRight: 5 },
      { key: "ratz", name: "Ratz", baseSeats: 5, bloc: "left", leftRight: -7 },
      { key: "hadash", name: "Hadash", baseSeats: 4, bloc: "arab", leftRight: -8 },
      { key: "tehiya", name: "Tehiya", baseSeats: 3, bloc: "right", leftRight: 9 },
      { key: "mapam", name: "Mapam", baseSeats: 3, bloc: "left", leftRight: -8 },
      { key: "degel-hatorah", name: "Degel HaTorah", baseSeats: 2, bloc: "haredi", leftRight: 4 },
      { key: "tzomet", name: "Tzomet", baseSeats: 2, bloc: "right", leftRight: 8 },
      { key: "moledet", name: "Moledet", baseSeats: 2, bloc: "right", leftRight: 9 },
      { key: "shinui", name: "Shinui", baseSeats: 2, bloc: "centre", leftRight: 1 },
      { key: "adp", name: "Arab Democratic Party", baseSeats: 1, bloc: "arab", leftRight: -4 },
      { key: "plp", name: "Progressive List for Peace", baseSeats: 1, bloc: "arab", leftRight: -7 },
    ],
  },
  {
    id: "knesset-11",
    label: "11th",
    year: 1984,
    name: "11th Knesset",
    date: "July 1984",
    note: "44 against 41, neither able to govern — it ended in a rotating premiership",
    outcome: {
      formedBy: "alignment",
      premier: "Peres",
      note:
        "Neither side could govern, so they governed together and swapped: Peres " +
        "for two years, then Shamir for two. The rotation actually held, and the " +
        "Knesset ran 4 years 4 months.",
    },
    parties: [
      { key: "alignment", name: "Alignment", baseSeats: 44, bloc: "left", leftRight: -5 },
      { key: "likud", name: "Likud", baseSeats: 41, bloc: "right", leftRight: 6 },
      { key: "tehiya", name: "Tehiya", baseSeats: 5, bloc: "right", leftRight: 9 },
      { key: "nrp", name: "National Religious Party", baseSeats: 4, bloc: "right", leftRight: 5 },
      { key: "hadash", name: "Hadash", baseSeats: 4, bloc: "arab", leftRight: -8 },
      { key: "shas", name: "Shas", baseSeats: 4, bloc: "haredi", leftRight: 4 },
      { key: "shinui", name: "Shinui", baseSeats: 3, bloc: "centre", leftRight: 1 },
      { key: "ratz", name: "Ratz", baseSeats: 3, bloc: "left", leftRight: -7 },
      { key: "yahad", name: "Yahad", baseSeats: 3, bloc: "centre", leftRight: -2 },
      { key: "plp", name: "Progressive List for Peace", baseSeats: 2, bloc: "arab", leftRight: -7 },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 2, bloc: "haredi", leftRight: 4 },
      { key: "morasha", name: "Morasha", baseSeats: 2, bloc: "haredi", leftRight: 6 },
      { key: "tami", name: "Tami", baseSeats: 1, bloc: "haredi", leftRight: 3 },
      { key: "kach", name: "Kach", baseSeats: 1, bloc: "right", leftRight: 10 },
      { key: "ometz", name: "Ometz", baseSeats: 1, bloc: "right", leftRight: 5 },
    ],
  },
  {
    id: "knesset-10",
    label: "10th",
    year: 1981,
    name: "10th Knesset",
    date: "June 1981",
    note: "48 against 47 and only 25 seats on the market — the tightest board there is",
    outcome: {
      formedBy: "likud",
      premier: "Begin",
      note:
        "Exactly 61 mandates, held together by the religious parties. Begin " +
        "resigned in 1983 and Shamir took over the same coalition. 3 years 1 month.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 48, bloc: "right", leftRight: 6 },
      { key: "alignment", name: "Alignment", baseSeats: 47, bloc: "left", leftRight: -5 },
      { key: "nrp", name: "National Religious Party", baseSeats: 6, bloc: "right", leftRight: 5 },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 4, bloc: "haredi", leftRight: 4 },
      { key: "hadash", name: "Hadash", baseSeats: 4, bloc: "arab", leftRight: -8 },
      { key: "tehiya", name: "Tehiya", baseSeats: 3, bloc: "right", leftRight: 9 },
      { key: "tami", name: "Tami", baseSeats: 3, bloc: "haredi", leftRight: 3 },
      { key: "telem", name: "Telem", baseSeats: 2, bloc: "right", leftRight: 4 },
      { key: "shinui", name: "Shinui", baseSeats: 2, bloc: "centre", leftRight: 1 },
      { key: "ratz", name: "Ratz", baseSeats: 1, bloc: "left", leftRight: -7 },
    ],
  },
  {
    id: "knesset-9",
    label: "9th",
    year: 1977,
    name: "9th Knesset",
    date: "May 1977",
    note:
      "the upheaval: Likud past Labour for the first time, with a 15-seat " +
      "newcomer holding it",
    outcome: {
      formedBy: "likud",
      premier: "Begin",
      note:
        "The upheaval: the first government in Israeli history not led by the " +
        "labour movement, built with the religious parties and then the 15-seat " +
        "Dash. It ran the full 4 years.",
    },
    parties: [
      { key: "likud", name: "Likud", baseSeats: 43, bloc: "right", leftRight: 6 },
      { key: "alignment", name: "Alignment", baseSeats: 32, bloc: "left", leftRight: -5 },
      {
        key: "dash",
        name: "Democratic Movement for Change",
        baseSeats: 15,
        bloc: "centre",
        leftRight: 0,
      },
      { key: "nrp", name: "National Religious Party", baseSeats: 12, bloc: "right", leftRight: 5 },
      { key: "hadash", name: "Hadash", baseSeats: 5, bloc: "arab", leftRight: -8 },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 4, bloc: "haredi", leftRight: 4 },
      { key: "shlomtzion", name: "Shlomtzion", baseSeats: 2, bloc: "right", leftRight: 7 },
      { key: "shelli", name: "Shelli", baseSeats: 2, bloc: "left", leftRight: -8 },
      {
        key: "poalei-agudat",
        name: "Poalei Agudat Yisrael",
        baseSeats: 1,
        bloc: "haredi",
        leftRight: 4,
      },
      {
        key: "independent-liberals",
        name: "Independent Liberals",
        baseSeats: 1,
        bloc: "centre",
        leftRight: 1,
      },
      { key: "ual", name: "United Arab List", baseSeats: 1, bloc: "arab", leftRight: -3 },
      { key: "ratz", name: "Ratz", baseSeats: 1, bloc: "left", leftRight: -7 },
      { key: "flatto-sharon", name: "Flatto-Sharon", baseSeats: 1, bloc: "centre", leftRight: 2 },
    ],
  },
  {
    id: "knesset-8",
    label: "8th",
    year: 1973,
    name: "8th Knesset",
    date: "December 1973",
    note: "elected weeks after the Yom Kippur War, with Labour still on 51",
    outcome: {
      formedBy: "alignment",
      premier: "Meir",
      note:
        "Meir formed a government in March and resigned in April over the Agranat " +
        "Commission; Rabin took over without a fresh election. 3 years 5 months.",
    },
    parties: [
      { key: "alignment", name: "Alignment", baseSeats: 51, bloc: "left", leftRight: -5 },
      { key: "likud", name: "Likud", baseSeats: 39, bloc: "right", leftRight: 6 },
      { key: "nrp", name: "National Religious Party", baseSeats: 10, bloc: "right", leftRight: 5 },
      {
        key: "independent-liberals",
        name: "Independent Liberals",
        baseSeats: 4,
        bloc: "centre",
        leftRight: 1,
      },
      { key: "rakah", name: "Rakah", baseSeats: 4, bloc: "arab", leftRight: -9 },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 3, bloc: "haredi", leftRight: 4 },
      { key: "ratz", name: "Ratz", baseSeats: 3, bloc: "left", leftRight: -7 },
      {
        key: "poalei-agudat",
        name: "Poalei Agudat Yisrael",
        baseSeats: 2,
        bloc: "haredi",
        leftRight: 4,
      },
      { key: "moked", name: "Moked", baseSeats: 1, bloc: "left", leftRight: -8 },
      {
        key: "progress-development",
        name: "Progress and Development",
        baseSeats: 1,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "arab-bedouin",
        name: "Arab List for Bedouins and Villagers",
        baseSeats: 1,
        bloc: "arab",
        leftRight: -3,
      },
      { key: "free-centre", name: "Free Centre", baseSeats: 1, bloc: "right", leftRight: 4 },
    ],
  },
  {
    id: "knesset-7",
    label: "7th",
    year: 1969,
    name: "7th Knesset",
    date: "October 1969",
    note: "the Alignment at 56 — the closest any list has come to a majority on its own",
    outcome: {
      formedBy: "alignment",
      premier: "Meir",
      note:
        "A national unity government inherited from the war of 1967, which Gahal " +
        "walked out of in 1970. It ran 4 years 2 months, the election delayed by " +
        "the Yom Kippur War.",
    },
    parties: [
      { key: "alignment", name: "Alignment", baseSeats: 56, bloc: "left", leftRight: -5 },
      { key: "gahal", name: "Gahal", baseSeats: 26, bloc: "right", leftRight: 7 },
      { key: "nrp", name: "National Religious Party", baseSeats: 12, bloc: "right", leftRight: 5 },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 4, bloc: "haredi", leftRight: 4 },
      {
        key: "independent-liberals",
        name: "Independent Liberals",
        baseSeats: 4,
        bloc: "centre",
        leftRight: 1,
      },
      { key: "state-list", name: "State List", baseSeats: 4, bloc: "right", leftRight: 4 },
      { key: "rakah", name: "Rakah", baseSeats: 3, bloc: "arab", leftRight: -9 },
      {
        key: "poalei-agudat",
        name: "Poalei Agudat Yisrael",
        baseSeats: 2,
        bloc: "haredi",
        leftRight: 4,
      },
      {
        key: "progress-development",
        name: "Progress and Development",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "cooperation",
        name: "Cooperation and Brotherhood",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      { key: "haolam-hazeh", name: "HaOlam HaZeh", baseSeats: 2, bloc: "left", leftRight: -6 },
      { key: "free-centre", name: "Free Centre", baseSeats: 2, bloc: "right", leftRight: 4 },
      { key: "maki", name: "Maki", baseSeats: 1, bloc: "left", leftRight: -9 },
    ],
  },
  {
    id: "knesset-6",
    label: "6th",
    year: 1965,
    name: "6th Knesset",
    date: "November 1965",
    note: "the year Mapai split and the right merged — thirteen lists on the board",
    outcome: {
      formedBy: "alignment",
      premier: "Eshkol",
      note:
        "Widened into a national unity government on the eve of the Six-Day War. " +
        "Eshkol died in office in 1969 and Meir succeeded him. 4 years.",
    },
    parties: [
      { key: "alignment", name: "Alignment", baseSeats: 45, bloc: "left", leftRight: -5 },
      { key: "gahal", name: "Gahal", baseSeats: 26, bloc: "right", leftRight: 7 },
      { key: "nrp", name: "National Religious Party", baseSeats: 11, bloc: "right", leftRight: 5 },
      { key: "rafi", name: "Rafi", baseSeats: 10, bloc: "centre", leftRight: -3 },
      { key: "mapam", name: "Mapam", baseSeats: 8, bloc: "left", leftRight: -8 },
      {
        key: "independent-liberals",
        name: "Independent Liberals",
        baseSeats: 5,
        bloc: "centre",
        leftRight: 1,
      },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 4, bloc: "haredi", leftRight: 4 },
      { key: "rakah", name: "Rakah", baseSeats: 3, bloc: "arab", leftRight: -9 },
      {
        key: "poalei-agudat",
        name: "Poalei Agudat Yisrael",
        baseSeats: 2,
        bloc: "haredi",
        leftRight: 4,
      },
      {
        key: "cooperation",
        name: "Cooperation and Brotherhood",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "progress-development",
        name: "Progress and Development",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      { key: "maki", name: "Maki", baseSeats: 1, bloc: "left", leftRight: -9 },
      { key: "haolam-hazeh", name: "HaOlam HaZeh", baseSeats: 1, bloc: "left", leftRight: -6 },
    ],
  },
  {
    id: "knesset-5",
    label: "5th",
    year: 1961,
    name: "5th Knesset",
    date: "August 1961",
    note: "Herut and the Liberals level on 17 apiece behind a Mapai on 42",
    outcome: {
      formedBy: "mapai",
      premier: "Ben-Gurion",
      note:
        "Ben-Gurion's last government. He resigned in 1963 and Eshkol finished the " +
        "term. 4 years 3 months.",
    },
    parties: [
      { key: "mapai", name: "Mapai", baseSeats: 42, bloc: "left", leftRight: -5 },
      { key: "herut", name: "Herut", baseSeats: 17, bloc: "right", leftRight: 7 },
      { key: "liberals", name: "Liberal Party", baseSeats: 17, bloc: "centre", leftRight: 2 },
      { key: "nrp", name: "National Religious Party", baseSeats: 12, bloc: "right", leftRight: 5 },
      { key: "mapam", name: "Mapam", baseSeats: 9, bloc: "left", leftRight: -8 },
      { key: "ahdut-haavoda", name: "Ahdut HaAvoda", baseSeats: 8, bloc: "left", leftRight: -7 },
      { key: "maki", name: "Maki", baseSeats: 5, bloc: "left", leftRight: -9 },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 4, bloc: "haredi", leftRight: 4 },
      {
        key: "poalei-agudat",
        name: "Poalei Agudat Yisrael",
        baseSeats: 2,
        bloc: "haredi",
        leftRight: 4,
      },
      {
        key: "cooperation",
        name: "Cooperation and Brotherhood",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "progress-development",
        name: "Progress and Development",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
    ],
  },
  {
    id: "knesset-4",
    label: "4th",
    year: 1959,
    name: "4th Knesset",
    date: "November 1959",
    note: "Ben-Gurion's high-water mark: Mapai on 47 and everyone else a long way back",
    outcome: {
      formedBy: "mapai",
      premier: "Ben-Gurion",
      note:
        "Brought down from inside Mapai by the Lavon Affair rather than by the " +
        "opposition. 1 year 9 months, the shortest Knesset of the era.",
    },
    parties: [
      { key: "mapai", name: "Mapai", baseSeats: 47, bloc: "left", leftRight: -5 },
      { key: "herut", name: "Herut", baseSeats: 17, bloc: "right", leftRight: 7 },
      { key: "nrp", name: "National Religious Party", baseSeats: 12, bloc: "right", leftRight: 5 },
      { key: "mapam", name: "Mapam", baseSeats: 9, bloc: "left", leftRight: -8 },
      {
        key: "general-zionists",
        name: "General Zionists",
        baseSeats: 8,
        bloc: "centre",
        leftRight: 3,
      },
      { key: "ahdut-haavoda", name: "Ahdut HaAvoda", baseSeats: 7, bloc: "left", leftRight: -7 },
      {
        key: "torah-front",
        name: "Torah Religious Front",
        baseSeats: 6,
        bloc: "haredi",
        leftRight: 4,
      },
      {
        key: "progressives",
        name: "Progressive Party",
        baseSeats: 6,
        bloc: "centre",
        leftRight: 0,
      },
      { key: "maki", name: "Maki", baseSeats: 3, bloc: "left", leftRight: -9 },
      {
        key: "cooperation",
        name: "Cooperation and Brotherhood",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "agriculture",
        name: "Agriculture and Development",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "progress-development",
        name: "Progress and Development",
        baseSeats: 1,
        bloc: "arab",
        leftRight: -3,
      },
    ],
  },
  {
    id: "knesset-3",
    label: "3rd",
    year: 1955,
    name: "3rd Knesset",
    date: "July 1955",
    note: "twelve lists, a Mapai on 40, and a Herut that had doubled",
    outcome: {
      formedBy: "mapai",
      premier: "Ben-Gurion",
      note:
        "Built with the religious parties and Ahdut HaAvoda, and it held through " +
        "the Suez campaign. 4 years 4 months.",
    },
    parties: [
      { key: "mapai", name: "Mapai", baseSeats: 40, bloc: "left", leftRight: -5 },
      { key: "herut", name: "Herut", baseSeats: 15, bloc: "right", leftRight: 7 },
      {
        key: "general-zionists",
        name: "General Zionists",
        baseSeats: 13,
        bloc: "centre",
        leftRight: 3,
      },
      { key: "nrf", name: "National Religious Front", baseSeats: 11, bloc: "haredi", leftRight: 3 },
      { key: "ahdut-haavoda", name: "Ahdut HaAvoda", baseSeats: 10, bloc: "left", leftRight: -7 },
      { key: "mapam", name: "Mapam", baseSeats: 9, bloc: "left", leftRight: -8 },
      {
        key: "torah-front",
        name: "Torah Religious Front",
        baseSeats: 6,
        bloc: "haredi",
        leftRight: 4,
      },
      { key: "maki", name: "Maki", baseSeats: 6, bloc: "left", leftRight: -9 },
      {
        key: "progressives",
        name: "Progressive Party",
        baseSeats: 5,
        bloc: "centre",
        leftRight: 0,
      },
      {
        key: "democratic-arabs",
        name: "Democratic List for Israeli Arabs",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "agriculture",
        name: "Agriculture and Development",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "progress-work",
        name: "Progress and Work",
        baseSeats: 1,
        bloc: "arab",
        leftRight: -3,
      },
    ],
  },
  {
    id: "knesset-2",
    label: "2nd",
    year: 1951,
    name: "2nd Knesset",
    date: "July 1951",
    note: "fifteen lists, most of them tiny — the cheapest board in the game to buy from",
    outcome: {
      formedBy: "mapai",
      premier: "Ben-Gurion",
      note:
        "Several governments in succession, all Mapai-led; Ben-Gurion stood down in " +
        "1953 and Sharett held the job for two years before he came back. The " +
        "Knesset ran 4 years.",
    },
    parties: [
      { key: "mapai", name: "Mapai", baseSeats: 45, bloc: "left", leftRight: -5 },
      {
        key: "general-zionists",
        name: "General Zionists",
        baseSeats: 20,
        bloc: "centre",
        leftRight: 3,
      },
      { key: "mapam", name: "Mapam", baseSeats: 15, bloc: "left", leftRight: -8 },
      { key: "herut", name: "Herut", baseSeats: 8, bloc: "right", leftRight: 7 },
      {
        key: "hapoel-hamizrachi",
        name: "HaPoel HaMizrachi",
        baseSeats: 8,
        bloc: "haredi",
        leftRight: 3,
      },
      { key: "maki", name: "Maki", baseSeats: 5, bloc: "left", leftRight: -9 },
      {
        key: "progressives",
        name: "Progressive Party",
        baseSeats: 4,
        bloc: "centre",
        leftRight: 0,
      },
      { key: "agudat-yisrael", name: "Agudat Yisrael", baseSeats: 3, bloc: "haredi", leftRight: 4 },
      {
        key: "democratic-arabs",
        name: "Democratic List for Israeli Arabs",
        baseSeats: 3,
        bloc: "arab",
        leftRight: -3,
      },
      { key: "mizrachi", name: "Mizrachi", baseSeats: 2, bloc: "haredi", leftRight: 3 },
      {
        key: "poalei-agudat",
        name: "Poalei Agudat Yisrael",
        baseSeats: 2,
        bloc: "haredi",
        leftRight: 4,
      },
      {
        key: "sephardim",
        name: "Sephardim and Oriental Communities",
        baseSeats: 2,
        bloc: "centre",
        leftRight: 2,
      },
      {
        key: "progress-work",
        name: "Progress and Work",
        baseSeats: 1,
        bloc: "arab",
        leftRight: -3,
      },
      {
        key: "agriculture",
        name: "Agriculture and Development",
        baseSeats: 1,
        bloc: "arab",
        leftRight: -3,
      },
      { key: "yemenite", name: "Yemenite Association", baseSeats: 1, bloc: "centre", leftRight: 1 },
    ],
  },
  {
    id: "knesset-1",
    label: "1st",
    year: 1949,
    name: "1st Knesset",
    date: "January 1949",
    note:
      "the founding Knesset: Mapai 46, Mapam 19, and ten lists under the " +
      "constituent assembly",
    outcome: {
      formedBy: "mapai",
      premier: "Ben-Gurion",
      note:
        "The first government of Israel, formed in March 1949 with the United " +
        "Religious Front and refusing Mapam. It fell over religious education, was " +
        "rebuilt, and fell again. 2 years 6 months.",
    },
    parties: [
      { key: "mapai", name: "Mapai", baseSeats: 46, bloc: "left", leftRight: -5 },
      { key: "mapam", name: "Mapam", baseSeats: 19, bloc: "left", leftRight: -8 },
      { key: "urf", name: "United Religious Front", baseSeats: 16, bloc: "haredi", leftRight: 3 },
      { key: "herut", name: "Herut", baseSeats: 14, bloc: "right", leftRight: 7 },
      {
        key: "general-zionists",
        name: "General Zionists",
        baseSeats: 7,
        bloc: "centre",
        leftRight: 3,
      },
      {
        key: "progressives",
        name: "Progressive Party",
        baseSeats: 5,
        bloc: "centre",
        leftRight: 0,
      },
      {
        key: "sephardim",
        name: "Sephardim and Oriental Communities",
        baseSeats: 4,
        bloc: "centre",
        leftRight: 2,
      },
      { key: "maki", name: "Maki", baseSeats: 4, bloc: "left", leftRight: -9 },
      {
        key: "nazareth",
        name: "Democratic List of Nazareth",
        baseSeats: 2,
        bloc: "arab",
        leftRight: -4,
      },
      { key: "fighters", name: "Fighters' List", baseSeats: 1, bloc: "right", leftRight: 6 },
      { key: "wizo", name: "WIZO", baseSeats: 1, bloc: "centre", leftRight: -2 },
      { key: "yemenite", name: "Yemenite Association", baseSeats: 1, bloc: "centre", leftRight: 1 },
    ],
  },
];

/**
 * The chamber a campaign opens on unless the setup screen says otherwise.
 *
 * The projection rather than the sitting Knesset: it is the board with no easy
 * majority anywhere on it, which is the game this game is about.
 */
export const DEFAULT_CHAMBER = "polls";

export const chamberById = (id: string | undefined): Chamber =>
  CHAMBERS.find((chamber) => chamber.id === id) ??
  CHAMBERS.find((chamber) => chamber.id === DEFAULT_CHAMBER)!;

/** The default chamber's lists, for everything that only ever wanted one board. */
export const PARTY_PROFILES: PartyProfile[] = chamberById(DEFAULT_CHAMBER).parties;

export const TOTAL_SEATS = 120;
export const MAJORITY = 61;

/** Seats below this at an election and the party falls out of the Knesset. */
export const ELECTORAL_THRESHOLD = 4;

export const PROFILES_BY_KEY: Record<string, PartyProfile> = Object.fromEntries(
  PARTY_PROFILES.map((profile) => [profile.key, profile]),
);
