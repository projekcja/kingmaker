import { describe, expect, it } from "vitest";

import { resolveRound, validateAllocation } from "../src/engine/allocation";
import { newCampaign } from "../src/engine/campaign";
import { PARTY_PROFILES } from "../src/engine/parties";
import type { Allocation, GameState } from "../src/engine/types";
import { biddableParties, blocSeats } from "../src/engine/types";

const setup = (seed = 11): GameState =>
  newCampaign({ seed, humanParty: "likud", bots: ["greedy", "random"] });

/** Put named ministries on a party, leaving the rest wherever `filler` says. */
const spread = (
  state: GameState,
  onto: Record<string, string[]>,
  filler?: string,
): Allocation => {
  const allocation: Allocation = {};
  for (const [partyKey, ministryKeys] of Object.entries(onto)) {
    for (const key of ministryKeys) allocation[key] = partyKey;
  }
  if (filler) {
    for (const ministry of state.ministries) {
      if (!allocation[ministry.key]) allocation[ministry.key] = filler;
    }
  }
  return allocation;
};

describe("validation", () => {
  it("insists every ministry is offered to somebody", () => {
    const state = setup();
    const target = biddableParties(state)[0].key;
    const partial = spread(state, { [target]: ["defense"] });

    const problems = validateAllocation(state, "you", partial);
    expect(problems.some((problem) => problem.code === "unallocated")).toBe(true);

    const full = spread(state, {}, target);
    expect(validateAllocation(state, "you", full)).toEqual([]);
  });

  it("refuses a bid for your own party or a rival's", () => {
    const state = setup();
    const target = biddableParties(state)[0].key;

    const ownBid = spread(state, { likud: ["defense"] }, target);
    expect(validateAllocation(state, "you", ownBid).some((p) => p.code === "own-party")).toBe(true);

    const rivalParty = state.players[1].partyKey;
    const rivalBid = spread(state, { [rivalParty]: ["defense"] }, target);
    expect(validateAllocation(state, "you", rivalBid).some((p) => p.code === "led-party")).toBe(true);
  });
});

describe("resolution", () => {
  it("gives each party to the highest bidder", () => {
    const state = setup();
    const [first, second] = biddableParties(state);

    state.commitments = {
      you: spread(state, { [first.key]: ["defense", "education"] }, second.key),
      bot1: spread(state, { [first.key]: ["finance"] }, second.key),
    };

    const results = resolveRound(state);
    const contested = results.find((result) => result.partyKey === first.key);
    expect(contested?.bids.you).toBe(18 + 17);
    expect(contested?.bids.bot1).toBe(15);
    expect(contested?.newHolder).toBe("you");
  });

  it("leaves a party nobody bid for unaligned", () => {
    const state = setup();
    const [first, second] = biddableParties(state);
    state.parties[first.key].heldBy = "you";
    state.commitments = { you: spread(state, {}, second.key) };

    const results = resolveRound(state);
    expect(results.find((result) => result.partyKey === first.key)?.newHolder).toBeNull();
  });

  it("lets the incumbent hold a party on a tie", () => {
    const state = setup();
    const [first, second] = biddableParties(state);
    state.parties[first.key].heldBy = "bot1";

    state.commitments = {
      you: spread(state, { [first.key]: ["defense"] }, second.key),
      bot1: spread(state, { [first.key]: ["defense"] }, second.key),
    };

    const result = resolveRound(state).find((entry) => entry.partyKey === first.key);
    expect(result?.bids.you).toBe(result?.bids.bot1);
    expect(result?.newHolder).toBe("bot1");
  });

  it("gives a tied, unaligned party to whoever is closest to a majority", () => {
    const state = setup();
    const [first, second] = biddableParties(state);
    expect(state.parties[first.key].heldBy).toBeNull();

    // You lead Likud (32); bot1 leads the next largest. Same money, so the
    // bigger bloc should win the bandwagon.
    state.commitments = {
      you: spread(state, { [first.key]: ["defense"] }, second.key),
      bot1: spread(state, { [first.key]: ["defense"] }, second.key),
    };

    expect(blocSeats(state, "you")).toBeGreaterThan(blocSeats(state, "bot1"));
    const result = resolveRound(state).find((entry) => entry.partyKey === first.key);
    expect(result?.newHolder).toBe("you");

    // Hand bot1 enough mandates to lead, and the same tie flips.
    const spare = biddableParties(state).find(
      (party) => party.key !== first.key && party.key !== second.key,
    );
    if (spare) {
      state.parties[spare.key].heldBy = "bot1";
      state.parties[spare.key].seats = 40;
      expect(blocSeats(state, "bot1")).toBeGreaterThan(blocSeats(state, "you"));
      const flipped = resolveRound(state).find((entry) => entry.partyKey === first.key);
      expect(flipped?.newHolder).toBe("bot1");
    }
  });

  it("lets a red line beat any amount of money", () => {
    const state = setup();
    const [first, second] = biddableParties(state);
    // The party refuses to sit with Likud, which is the human's own party.
    state.parties[first.key].refusals.push({ partyKey: "likud", until: state.turn + 3 });

    state.commitments = {
      you: spread(state, {}, first.key), // everything, all 171bn
      bot1: spread(state, { [first.key]: ["science"] }, second.key), // 1bn
    };

    const result = resolveRound(state).find((entry) => entry.partyKey === first.key);
    expect(result?.blocked).toContain("you");
    expect(result?.bids.you).toBeUndefined();
    expect(result?.newHolder).toBe("bot1");
  });
});

describe("ideology stays out of the bidding", () => {
  it("resolves identically when every party's politics is scrambled", () => {
    const state = setup(4242);
    const [first, second] = biddableParties(state);
    state.commitments = {
      you: spread(state, { [first.key]: ["defense", "finance"] }, second.key),
      bot1: spread(state, { [first.key]: ["education"] }, second.key),
      bot2: spread(state, { [second.key]: ["health"] }, first.key),
    };
    const before = resolveRound(state);

    // Same board, politically unrecognisable.
    const blocs = PARTY_PROFILES.map((profile) => profile.bloc).reverse();
    Object.values(state.parties).forEach((party, index) => {
      party.bloc = blocs[index % blocs.length];
      party.leftRight = -party.leftRight;
    });

    expect(resolveRound(state)).toEqual(before);
  });
});
