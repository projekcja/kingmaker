import { describe, expect, it } from "vitest";

import { newCampaign, rollSeats } from "../src/engine/campaign";
import { PARTY_HISTORY, partyHistory } from "../src/engine/history";
import { LAWS, ballotTilt, drawBill, enactLaw, expireLegislation, lawById } from "../src/engine/laws";
import { CHAMBERS, TOTAL_SEATS } from "../src/engine/parties";
import { Rng } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";
import {
  HOME_SEATS_FOR_ALL,
  cabinetValue,
  freeMinistries,
  moodOf,
  packageFace,
  packageValue,
  redLines,
  redLinesFor,
  reservedMinistries,
  reservedValue,
  valueOf,
} from "../src/engine/types";

const setup = (seed = 11): GameState =>
  newCampaign({ seed, humanParty: "likud", bots: ["greedy"] });

/** Put a government in place without playing the weeks out. */
const govern = (state: GameState): GameState => {
  state.phase = "governing";
  state.primeMinister = "you";
  state.governmentYears = 0;
  return state;
};

describe("what a list was", () => {
  it("has a note for every party in every chamber", () => {
    // The setup screen reads this by key. A list added to a chamber without a
    // note here would render a blank panel rather than fail, so it fails here.
    for (const chamber of CHAMBERS) {
      for (const profile of chamber.parties) {
        const note = partyHistory(profile.key);
        expect(note, `${profile.key} (${profile.name}) has no history note`).toBeTruthy();
        expect(note!.length).toBeGreaterThan(40);
      }
    }
  });

  it("carries no note for a key that is not on any ballot", () => {
    const known = new Set(CHAMBERS.flatMap((chamber) => chamber.parties.map((p) => p.key)));
    for (const key of Object.keys(PARTY_HISTORY)) {
      expect(known.has(key), `${key} has a note but never runs`).toBe(true);
    }
    expect(partyHistory("no-such-party")).toBeNull();
  });
});

describe("what the home party keeps", () => {
  it("claims the whole cabinet at the calibration point and nothing at zero", () => {
    const state = setup();
    const own = state.parties[state.players[0].partyKey];

    own.seats = HOME_SEATS_FOR_ALL;
    expect(reservedMinistries(state, "you")).toHaveLength(state.ministries.length);
    expect(reservedValue(state, "you")).toBe(cabinetValue(state));
    expect(freeMinistries(state, "you")).toEqual([]);

    own.seats = 0;
    expect(reservedMinistries(state, "you")).toEqual([]);
    expect(valueOf(state, freeMinistries(state, "you"))).toBe(cabinetValue(state));
  });

  it("scales with the list, and never claims more than its share", () => {
    const state = setup();
    const own = state.parties[state.players[0].partyKey];

    let previous = -1;
    for (let seats = 1; seats <= HOME_SEATS_FOR_ALL; seats += 1) {
      own.seats = seats;
      const claimed = reservedValue(state, "you");
      const target = Math.round((cabinetValue(state) * seats) / HOME_SEATS_FOR_ALL);
      // Never over the target -- the claim is a ceiling, not a rounding.
      expect(claimed).toBeLessThanOrEqual(target);
      // And close to it: the ladder is dense enough to settle almost exactly.
      expect(target - claimed).toBeLessThanOrEqual(2);
      expect(claimed).toBeGreaterThanOrEqual(previous);
      previous = claimed;
    }
  });

  it("is the handicap it was meant to be: a bigger list has less to spend", () => {
    const state = setup();
    const own = state.parties[state.players[0].partyKey];

    own.seats = 10;
    const smallHand = valueOf(state, freeMinistries(state, "you"));
    own.seats = 40;
    const bigHand = valueOf(state, freeMinistries(state, "you"));
    expect(bigHand).toBeLessThan(smallHand);
  });

  it("loses a claimed portfolio only once when it is also promised away", () => {
    const state = setup();
    const target = Object.values(state.parties).find((party) => party.key !== "likud")!;
    const claimed = reservedMinistries(state, "you");
    // Promise away something the home party had also claimed.
    target.heldBy = "you";
    target.package = [claimed[0]];

    const free = new Set(freeMinistries(state, "you"));
    const kept = new Set(reservedMinistries(state, "you"));
    const locked = new Set(target.package);
    for (const ministry of state.ministries) {
      const places = [free, kept, locked].filter((set) => set.has(ministry.key)).length;
      expect(places, `${ministry.key} is in ${places} places`).toBeGreaterThan(0);
      expect(free.has(ministry.key) && locked.has(ministry.key)).toBe(false);
    }
  });
});

describe("the order paper", () => {
  it("only offers bills that can actually do something", () => {
    const state = govern(setup());
    const rng = new Rng(7);
    for (let round = 0; round < 40; round += 1) {
      const options = drawBill(state, rng, "you");
      expect(options.length).toBeLessThanOrEqual(3);
      expect(new Set(options).size).toBe(options.length);
      for (const id of options) {
        expect(lawById(id)!.available(state, "you")).toBe(true);
      }
    }
  });

  it("refuses to pass a law that was never on the paper", () => {
    const state = govern(setup());
    state.bill = { playerKey: "you", options: ["cost-of-living"] };
    expect(enactLaw(state, new Rng(1), "you", "conscription")).toBeNull();
    expect(state.lawsPassed).toEqual([]);
    // And refuses somebody who is not the prime minister.
    expect(enactLaw(state, new Rng(1), "bot1", "cost-of-living")).toBeNull();
  });

  it("records what it passed", () => {
    const state = govern(setup());
    state.bill = { playerKey: "you", options: ["cost-of-living"] };
    const text = enactLaw(state, new Rng(1), "you", "cost-of-living");
    expect(text).toBeTruthy();
    expect(state.lawsPassed).toHaveLength(1);
    expect(state.lawsPassed[0].id).toBe("cost-of-living");
    expect(state.lawsPassed[0].by).toBe("you");
  });
});

describe("a mood is a discount on the package, and nothing else", () => {
  it("makes an angry partner cheaper and a pleased one dearer", () => {
    const state = govern(setup());
    const target = Object.values(state.parties).find((party) => party.key !== "likud")!;
    target.heldBy = "you";
    target.package = ["defense", "finance"]; // 18 + 15
    const face = packageFace(state, target.key);
    expect(face).toBe(33);
    expect(packageValue(state, target.key)).toBe(33);

    state.moods[target.key] = { delta: -0.5, until: state.turn + 2, because: "a law" };
    expect(packageValue(state, target.key)).toBeLessThan(face);
    expect(packageFace(state, target.key)).toBe(face); // the portfolios are untouched

    state.moods[target.key] = { delta: 0.5, until: state.turn + 2, because: "a law" };
    expect(packageValue(state, target.key)).toBeGreaterThan(face);
  });

  it("never discounts a package to nothing", () => {
    const state = govern(setup());
    const target = Object.values(state.parties).find((party) => party.key !== "likud")!;
    target.heldBy = "you";
    target.package = ["science"]; // 1bn
    state.moods[target.key] = { delta: -0.99, until: state.turn + 2, because: "a law" };
    expect(packageValue(state, target.key)).toBeGreaterThanOrEqual(1);
  });

  it("wears off", () => {
    const state = govern(setup());
    const target = Object.values(state.parties).find((party) => party.key !== "likud")!;
    target.package = ["defense"];
    state.moods[target.key] = { delta: -0.5, until: state.turn, because: "a law" };
    expect(moodOf(state, target.key)).toBeNull();
    expect(packageValue(state, target.key)).toBe(18);

    expireLegislation(state);
    expect(state.moods[target.key]).toBeUndefined();
  });
});

describe("a cabinet law reaches every player at once", () => {
  it("abolishing an office strikes it out of every agreement on the board", () => {
    const state = govern(setup());
    const parties = Object.values(state.parties).filter((party) => party.key !== "likud");
    // Every cheap office is being used to hold somebody, so whichever one the
    // law picks out of the bottom half, it is one that matters to a coalition.
    const cheap = [...state.ministries].sort((a, b) => a.budget - b.budget).slice(0, 6);
    parties.forEach((party, index) => {
      party.heldBy = index % 2 === 0 ? "you" : "bot1";
      party.package = [cheap[index % cheap.length].key];
    });
    const before = new Set(state.ministries.map((ministry) => ministry.key));

    state.bill = { playerKey: "you", options: ["abolish-office"] };
    expect(enactLaw(state, new Rng(3), "you", "abolish-office")).toBeTruthy();

    const after = new Set(state.ministries.map((ministry) => ministry.key));
    const closed = [...before].filter((key) => !after.has(key));
    expect(closed).toHaveLength(1);

    // Gone from the cabinet, and gone from every agreement -- yours and theirs.
    for (const party of Object.values(state.parties)) {
      expect(party.package).not.toContain(closed[0]);
    }
  });

  it("merging redirects the packages that named either half", () => {
    const state = govern(setup());
    const ladder = [...state.ministries].sort((a, b) => a.budget - b.budget);
    const [a, b] = ladder;
    const held = Object.values(state.parties).find((party) => party.key !== "likud")!;
    held.heldBy = "you";
    held.package = [a.key];

    const before = state.ministries.length;
    state.bill = { playerKey: "you", options: ["merge-offices"] };
    expect(enactLaw(state, new Rng(3), "you", "merge-offices")).toBeTruthy();

    expect(state.ministries).toHaveLength(before - 1);
    expect(state.ministries.some((m) => m.key === a.key)).toBe(false);
    expect(state.ministries.some((m) => m.key === b.key)).toBe(false);
    // The agreement now names the merged office rather than a dead key.
    expect(held.package).toHaveLength(1);
    expect(state.ministries.some((m) => m.key === held.package[0])).toBe(true);
  });

  it("leaves no package holding a portfolio that no longer exists", () => {
    // The failure mode worth a test of its own: a party held by a dead key is
    // held for nothing, and silently free for anybody to take.
    const rng = new Rng(99);
    for (const law of LAWS.filter((entry) => entry.kind === "cabinet")) {
      const state = govern(setup(31));
      const parties = Object.values(state.parties).filter((party) => party.key !== "likud");
      parties.forEach((party, index) => {
        party.heldBy = index % 2 === 0 ? "you" : "bot1";
        party.package = [state.ministries[index % state.ministries.length].key];
      });
      if (!law.available(state, "you")) continue;

      state.bill = { playerKey: "you", options: [law.id] };
      enactLaw(state, rng, "you", law.id);

      const live = new Set(state.ministries.map((ministry) => ministry.key));
      for (const party of Object.values(state.parties)) {
        for (const key of party.package) {
          expect(live.has(key), `${law.id} left ${party.key} holding a dead ${key}`).toBe(true);
        }
      }
    }
  });
});

describe("a ballot law changes the vote, not the seats", () => {
  it("does nothing until the country votes", () => {
    const state = govern(setup());
    const before = Object.fromEntries(
      Object.values(state.parties).map((party) => [party.key, party.seats]),
    );
    state.bill = { playerKey: "you", options: ["cost-of-living"] };
    enactLaw(state, new Rng(1), "you", "cost-of-living");

    for (const party of Object.values(state.parties)) {
      expect(party.seats).toBe(before[party.key]);
    }
    expect(state.statutes).toHaveLength(1);
  });

  it("tilts the blocs it named and leaves the Knesset at 120", () => {
    const state = govern(setup());
    state.bill = { playerKey: "you", options: ["cost-of-living"] };
    enactLaw(state, new Rng(1), "you", "cost-of-living");

    const tilt = ballotTilt(state);
    for (const party of Object.values(state.parties)) {
      if (party.bloc === "centre" || party.bloc === "left") {
        expect(tilt[party.key]).toBeGreaterThan(1);
      } else if (party.bloc === "right") {
        expect(tilt[party.key]).toBeLessThan(1);
      }
    }

    // However the vote is tilted, the chamber is still 120 seats.
    const rng = new Rng(5);
    for (let round = 0; round < 50; round += 1) {
      const baseline = Object.fromEntries(
        Object.values(state.parties).map((party) => [party.key, party.seats]),
      );
      const seats = rollSeats(rng, new Set(["likud"]), baseline, tilt);
      expect(Object.values(seats).reduce((sum, count) => sum + count, 0)).toBe(TOTAL_SEATS);
    }
  });

  it("actually moves the vote, averaged over many elections", () => {
    // One election is noise -- the swing is +-45% before any law is read. The
    // claim is only that the tilt shows up across enough of them.
    const share = (tilted: boolean): number => {
      const state = govern(setup(77));
      if (tilted) {
        state.bill = { playerKey: "you", options: ["cost-of-living"] };
        enactLaw(state, new Rng(1), "you", "cost-of-living");
      }
      const tilt = tilted ? ballotTilt(state) : {};
      const baseline = Object.fromEntries(
        Object.values(state.parties).map((party) => [party.key, party.seats]),
      );
      const centreLeft = Object.values(state.parties)
        .filter((party) => party.bloc === "centre" || party.bloc === "left")
        .map((party) => party.key);

      const rng = new Rng(2024);
      let total = 0;
      for (let round = 0; round < 300; round += 1) {
        const seats = rollSeats(rng, new Set(["likud"]), baseline, tilt);
        total += centreLeft.reduce((sum, key) => sum + (seats[key] ?? 0), 0);
      }
      return total / 300;
    };

    expect(share(true)).toBeGreaterThan(share(false));
  });

  it("lapses", () => {
    const state = govern(setup());
    state.bill = { playerKey: "you", options: ["cost-of-living"] };
    enactLaw(state, new Rng(1), "you", "cost-of-living");
    expect(Object.keys(ballotTilt(state)).length).toBeGreaterThan(0);

    state.turn += 99;
    expect(ballotTilt(state)).toEqual({});
    expireLegislation(state);
    expect(state.statutes).toEqual([]);
  });
});

describe("the whole map of red lines", () => {
  it("reports a standing pair once, whichever end it is read from", () => {
    const state = setup();
    const lines = redLines(state).filter((line) => line.kind === "standing");
    const seen = new Set<string>();
    for (const line of lines) {
      const pair = [line.from, line.to].sort().join("|");
      expect(seen.has(pair)).toBe(false);
      seen.add(pair);
      // Standing lines are mutual, so both parties must list each other.
      expect(redLinesFor(state, line.from)).toContain(line.to);
      expect(redLinesFor(state, line.to)).toContain(line.from);
    }
  });

  it("keeps a card's line pointing the way the card wrote it", () => {
    const state = setup();
    const [a, b] = Object.values(state.parties).filter(
      (party) => Math.abs(party.leftRight) < 6,
    );
    a.refusals.push({ partyKey: b.key, until: state.turn + 3 });

    const carded = redLines(state).filter((line) => line.kind === "carded");
    expect(carded).toContainEqual({
      from: a.key,
      to: b.key,
      kind: "carded",
      until: state.turn + 3,
    });
    // Undirected for the party cards, which ask a different question.
    expect(redLinesFor(state, a.key)).toContain(b.key);
    expect(redLinesFor(state, b.key)).toContain(a.key);
  });

  it("drops a lapsed card and never doubles a line the politics already draws", () => {
    const state = setup();
    const [a, b] = Object.values(state.parties).filter(
      (party) => Math.abs(party.leftRight) < 6,
    );
    a.refusals.push({ partyKey: b.key, until: state.turn });
    expect(redLines(state).some((line) => line.kind === "carded")).toBe(false);

    // A card restating a standing refusal is one line on the map, not two.
    const standing = redLines(state).find((line) => line.kind === "standing");
    if (!standing) return;
    state.parties[standing.from].refusals.push({
      partyKey: standing.to,
      until: state.turn + 3,
    });
    const between = redLines(state).filter(
      (line) =>
        (line.from === standing.from && line.to === standing.to) ||
        (line.from === standing.to && line.to === standing.from),
    );
    expect(between).toHaveLength(1);
  });
});
