import { describe, expect, it } from "vitest";

import { applyRound, applyWithdrawals, resolveRound, validateOffer } from "../src/engine/allocation";
import { newCampaign } from "../src/engine/campaign";
import { PARTY_PROFILES } from "../src/engine/parties";
import type { GameState, Offer } from "../src/engine/types";
import {
  OFFERS_PER_TURN,
  biddableParties,
  blocSeats,
  freeMinistries,
  packageValue,
  valueOf,
} from "../src/engine/types";

const setup = (seed = 11): GameState =>
  newCampaign({ seed, humanParty: "likud", bots: ["greedy", "random"] });

const offer = (bids: Array<[string, string[]]>, withdrawFrom: string[] = []): Offer => ({
  bids: bids.map(([partyKey, ministries]) => ({ partyKey, ministries })),
  withdrawFrom,
});

/** Give a party to a player at a stated price, as if an earlier turn had. */
const grant = (state: GameState, partyKey: string, playerKey: string, ministries: string[]) => {
  state.parties[partyKey].heldBy = playerKey;
  state.parties[partyKey].package = ministries;
};

describe("validation", () => {
  it("allows up to two tables a turn and no more", () => {
    const state = setup();
    const [a, b, c] = biddableParties(state);

    expect(validateOffer(state, "you", offer([[a.key, ["defense"]]]))).toEqual([]);
    expect(
      validateOffer(state, "you", offer([[a.key, ["defense"]], [b.key, ["finance"]]])),
    ).toEqual([]);

    const tooMany = offer([
      [a.key, ["defense"]],
      [b.key, ["finance"]],
      [c.key, ["health"]],
    ]);
    expect(validateOffer(state, "you", tooMany).some((p) => p.code === "too-many")).toBe(true);
    expect(OFFERS_PER_TURN).toBe(2);
  });

  it("refuses to promise the same portfolio twice", () => {
    const state = setup();
    const [a, b] = biddableParties(state);
    const problems = validateOffer(
      state,
      "you",
      offer([[a.key, ["defense"]], [b.key, ["defense"]]]),
    );
    expect(problems.some((p) => p.code === "duplicate")).toBe(true);
  });

  it("refuses a portfolio that is already locked with a partner", () => {
    const state = setup();
    const [a, b] = biddableParties(state);
    grant(state, a.key, "you", ["defense", "finance"]);

    expect(freeMinistries(state, "you")).not.toContain("defense");
    const problems = validateOffer(state, "you", offer([[b.key, ["defense"]]]));
    expect(problems.some((p) => p.code === "not-in-hand")).toBe(true);
  });

  it("frees a partner's portfolios when you withdraw from them", () => {
    const state = setup();
    const [a, b] = biddableParties(state);
    grant(state, a.key, "you", ["defense", "finance"]);

    // Illegal while you still hold it, legal once you walk away.
    expect(validateOffer(state, "you", offer([[b.key, ["defense"]]])).length).toBeGreaterThan(0);
    expect(validateOffer(state, "you", offer([[b.key, ["defense"]]], [a.key]))).toEqual([]);
  });

  it("refuses to court and abandon the same party at once", () => {
    const state = setup();
    const a = biddableParties(state)[0];
    grant(state, a.key, "you", ["defense"]);
    const problems = validateOffer(state, "you", offer([[a.key, ["finance"]]], [a.key]));
    expect(problems.some((p) => p.code === "withdraw-target")).toBe(true);
  });

  it("refuses a bid for your own party or a rival's", () => {
    const state = setup();
    expect(
      validateOffer(state, "you", offer([["likud", ["defense"]]])).some((p) => p.code === "own-party"),
    ).toBe(true);

    const rival = state.players[1].partyKey;
    expect(
      validateOffer(state, "you", offer([[rival, ["defense"]]])).some((p) => p.code === "led-party"),
    ).toBe(true);
  });

  it("refuses an empty offer to a party you do not already hold", () => {
    const state = setup();
    const a = biddableParties(state)[0];
    expect(validateOffer(state, "you", offer([[a.key, []]])).some((p) => p.code === "empty")).toBe(
      true,
    );
  });
});

describe("resolution", () => {
  it("gives a party to the biggest offer on the table", () => {
    const state = setup();
    const target = biddableParties(state)[0];

    state.offers = {
      you: offer([[target.key, ["defense", "education"]]]), // 35
      bot1: offer([[target.key, ["finance"]]]), // 15
    };

    const result = resolveRound(state).find((entry) => entry.partyKey === target.key);
    expect(result?.bids.you).toBe(35);
    expect(result?.bids.bot1).toBe(15);
    expect(result?.newHolder).toBe("you");
  });

  it("leaves a party where it is when nobody courts it", () => {
    const state = setup();
    const [a, b] = biddableParties(state);
    grant(state, a.key, "you", ["defense"]);
    state.offers = { you: offer([[b.key, ["finance"]]]) };

    const result = resolveRound(state).find((entry) => entry.partyKey === a.key);
    // Bought is bought: it does not fall out of the bloc through inattention.
    expect(result?.newHolder).toBe("you");
  });

  it("makes a challenger beat the package already in place", () => {
    const state = setup();
    const target = biddableParties(state)[0];
    grant(state, target.key, "bot1", ["defense", "education"]); // 35

    state.offers = { you: offer([[target.key, ["finance", "interior"]]]) }; // 29
    let result = resolveRound(state).find((entry) => entry.partyKey === target.key);
    expect(result?.newHolder).toBe("bot1");

    state.offers = { you: offer([[target.key, ["finance", "interior", "justice"]]]) }; // 40
    result = resolveRound(state).find((entry) => entry.partyKey === target.key);
    expect(result?.newHolder).toBe("you");
  });

  it("stacks a holder's top-up on the package it already paid", () => {
    const state = setup();
    const target = biddableParties(state)[0];
    grant(state, target.key, "you", ["justice"]); // 11

    state.offers = {
      you: offer([[target.key, ["science"]]]), // 11 + 1 = 12
      bot1: offer([[target.key, ["interior"]]]), // 14
    };
    const result = resolveRound(state).find((entry) => entry.partyKey === target.key);
    expect(result?.bids.bot1).toBe(14);
    expect(result?.newHolder).toBe("bot1");

    state.offers = {
      you: offer([[target.key, ["energy"]]]), // 11 + 7 = 18
      bot1: offer([[target.key, ["interior"]]]), // 14
    };
    expect(resolveRound(state).find((e) => e.partyKey === target.key)?.newHolder).toBe("you");
  });

  it("returns the losing side's portfolios and locks the winner's", () => {
    const state = setup();
    const target = biddableParties(state)[0];
    grant(state, target.key, "bot1", ["justice"]);

    state.offers = { you: offer([[target.key, ["defense"]]]) };
    applyRound(state, resolveRound(state));

    expect(state.parties[target.key].heldBy).toBe("you");
    expect(state.parties[target.key].package).toEqual(["defense"]);
    // bot1 has its portfolio back, and yours is spent.
    expect(freeMinistries(state, "bot1")).toContain("justice");
    expect(freeMinistries(state, "you")).not.toContain("defense");
  });

  it("does not charge for an offer that lost", () => {
    const state = setup();
    const target = biddableParties(state)[0];

    state.offers = {
      you: offer([[target.key, ["science"]]]),
      bot1: offer([[target.key, ["defense"]]]),
    };
    applyRound(state, resolveRound(state));

    expect(state.parties[target.key].heldBy).toBe("bot1");
    expect(freeMinistries(state, "you")).toContain("science");
  });

  it("lets an incumbent hold by matching rather than beating", () => {
    const state = setup();
    const target = biddableParties(state)[0];

    grant(state, target.key, "bot1", ["finance"]); // 15
    state.offers = { you: offer([[target.key, ["interior"]]]) }; // 14, not enough
    expect(resolveRound(state).find((e) => e.partyKey === target.key)?.newHolder).toBe("bot1");

    state.offers = { you: offer([[target.key, ["finance"]]]) };
    // Exactly matching the package still loses: the holder defends the tie.
    expect(resolveRound(state).find((e) => e.partyKey === target.key)?.newHolder).toBe("bot1");
  });

  it("gives an open party to whoever is closest to governing on a tie", () => {
    const state = setup();
    const target = biddableParties(state)[0];

    // Likud (32) against Yesh Atid (24), identical money, nobody holding it.
    state.offers = {
      you: offer([[target.key, ["defense"]]]),
      bot1: offer([[target.key, ["defense"]]]),
    };
    expect(blocSeats(state, "you")).toBeGreaterThan(blocSeats(state, "bot1"));
    expect(resolveRound(state).find((e) => e.partyKey === target.key)?.newHolder).toBe("you");
  });

  it("lets a red line beat any amount of money", () => {
    const state = setup();
    const [a] = biddableParties(state);
    state.parties[a.key].refusals.push({ partyKey: "likud", until: state.turn + 3 });

    state.offers = {
      you: offer([[a.key, ["defense", "education", "health", "finance"]]]),
      bot1: offer([[a.key, ["science"]]]),
    };
    const result = resolveRound(state).find((entry) => entry.partyKey === a.key);
    expect(result?.blocked).toContain("you");
    expect(result?.bids.you).toBeUndefined();
    expect(result?.newHolder).toBe("bot1");
  });
});

describe("withdrawal", () => {
  it("hands the portfolios back and puts the party on the market", () => {
    const state = setup();
    const target = biddableParties(state)[0];
    grant(state, target.key, "you", ["defense", "finance"]);
    expect(packageValue(state, target.key)).toBe(33);

    state.offers = { you: offer([], [target.key]) };
    applyWithdrawals(state);

    expect(state.parties[target.key].heldBy).toBeNull();
    expect(state.parties[target.key].package).toEqual([]);
    expect(valueOf(state, freeMinistries(state, "you"))).toBe(171);
  });
});

describe("ideology stays out of the bidding", () => {
  it("resolves identically when every party's politics is scrambled", () => {
    const state = setup(4242);
    const [a, b] = biddableParties(state);
    grant(state, a.key, "bot1", ["justice"]);
    state.offers = {
      you: offer([[a.key, ["defense"]], [b.key, ["finance"]]]),
      bot1: offer([[b.key, ["education"]]]),
    };
    const before = resolveRound(state);

    const blocs = PARTY_PROFILES.map((profile) => profile.bloc).reverse();
    Object.values(state.parties).forEach((party, index) => {
      party.bloc = blocs[index % blocs.length];
      party.leftRight = -party.leftRight;
    });

    expect(resolveRound(state)).toEqual(before);
  });
});
