import { describe, expect, it } from "vitest";

import { greedyOffer, randomOffer, shrewdOffer } from "../src/bots";
import { resolveRound, validateOffer } from "../src/engine/allocation";
import { applyAction, newCampaign } from "../src/engine/campaign";
import { Rng } from "../src/engine/rng";
import type { GameState, Party } from "../src/engine/types";
import { emptyOffer, freeMinistries, refusalsAgainst, valueOf } from "../src/engine/types";
import {
  HAND_LIMIT,
  applyWilds,
  canPlay,
  drawWild,
  legalPlays,
  preferredWild,
} from "../src/engine/wilds";

const setup = (seed = 11): GameState =>
  newCampaign({ seed, humanParty: "likud", bots: ["greedy"] });

/** A party nobody leads, which is what every card is played against. */
const spare = (state: GameState): Party => {
  const led = new Set(state.players.map((player) => player.partyKey));
  const party = Object.values(state.parties).find((candidate) => !led.has(candidate.key));
  if (!party) throw new Error("every chamber has a party for sale");
  return party;
};

/** Open the offers and settle the auction, exactly as a turn does. */
const settle = (state: GameState) => {
  const outcome = applyWilds(state);
  state.whipped = outcome.whipped;
  return { outcome, results: resolveRound(state) };
};

describe("what the cards do", () => {
  it("keeps a whipped coalition whole against any bid", () => {
    const build = (whip: boolean) => {
      const state = setup();
      const party = spare(state);
      party.heldBy = "you";
      party.package = ["defense"];
      state.players[0].hand = whip ? ["whip"] : [];

      // Everything the rival has, against one portfolio. Money should win.
      const purse = freeMinistries(state, "bot1");
      expect(valueOf(state, purse)).toBeGreaterThan(valueOf(state, party.package));
      state.offers = {
        you: { bids: [], withdrawFrom: [], wild: whip ? { id: "whip" } : null },
        bot1: { bids: [{ partyKey: party.key, ministries: purse }], withdrawFrom: [] },
      };
      const { results } = settle(state);
      return results.find((result) => result.partyKey === party.key)!;
    };

    // The control matters more than the assertion: without the card the same
    // bid takes the party, so the card is what held it.
    expect(build(false).newHolder).toBe("bot1");
    expect(build(true).newHolder).toBe("you");
  });

  it("strikes a red line for good, and opens the list to the same turn's bid", () => {
    const state = setup();
    const party = spare(state);
    const rival = state.players[1];
    party.refusals = [
      { partyKey: "likud", until: state.turn + 10 },
      { partyKey: rival.partyKey, until: state.turn + 10 },
    ];
    expect(refusalsAgainst(state, party, "you")).not.toEqual([]);
    const against = refusalsAgainst(state, party, rival.key);
    expect(against).not.toEqual([]);

    state.players[0].hand = ["ultimatum"];
    state.offers = {
      you: { bids: [], withdrawFrom: [], wild: { id: "ultimatum", partyKey: party.key } },
    };
    settle(state);

    expect(refusalsAgainst(state, party, "you")).toEqual([]);
    // One player's arrangement, not a change of heart: the list still will not
    // sit with anybody else it had ruled out.
    expect(refusalsAgainst(state, party, rival.key)).toEqual(against);

    // Permanent, where the refusal it replaced would have lapsed on a timer.
    state.turn += 50;
    expect(refusalsAgainst(state, party, "you")).toEqual([]);
  });

  it("takes the portfolios back in a reshuffle and keeps the partner", () => {
    const state = setup();
    const party = spare(state);
    party.heldBy = "you";
    party.package = ["defense", "finance"];

    state.players[0].hand = ["reshuffle"];
    const offer = {
      bids: [],
      withdrawFrom: [],
      wild: { id: "reshuffle", partyKey: party.key },
    };
    // The freed portfolios fund this very turn, exactly as a withdrawal's do.
    expect(validateOffer(state, "you", { ...offer, bids: [] })).toEqual([]);

    state.offers = { you: offer };
    settle(state);

    expect(party.heldBy).toBe("you");
    expect(party.package).toEqual([]);
  });

  it("stops the clock for a recess without banking the year", () => {
    const play = (recess: boolean) => {
      const state = newCampaign({ seed: 4242, humanParty: "likud", bots: [] });
      state.phase = "governing";
      state.primeMinister = "you";
      state.governmentYears = 1;
      state.players[0].yearsInPower = 1;
      state.players[0].hand = recess ? ["recess"] : [];
      state.emergencyUntil = 0;
      const after = applyAction(state, {
        type: "offer",
        playerKey: "you",
        offer: { ...emptyOffer(), wild: recess ? { id: "recess" } : null },
      }).state;
      return after;
    };

    const stopped = play(true);
    const ran = play(false);
    expect(ran.governmentYears).toBe(2);
    expect(stopped.governmentYears).toBe(1);
    // A delay, not a gift: the year does not count toward winning either.
    expect(stopped.players[0].yearsInPower).toBe(1);
    expect(ran.players[0].yearsInPower).toBe(2);
  });
});

describe("holding a hand", () => {
  it("deals one to every player and never more than a hand holds", () => {
    const state = setup();
    for (const player of state.players) {
      expect(player.hand.length).toBe(1);
    }

    // Drawing past the limit discards the draw rather than growing the hand,
    // which is what stops a patient player from arriving at the last
    // parliament with six cards and no decisions left to make.
    const rng = new Rng(5);
    const hand = state.players[0].hand;
    while (hand.length < HAND_LIMIT) drawWild(state, rng, "you");
    expect(hand.length).toBe(HAND_LIMIT);

    const held = [...hand];
    for (let draw = 0; draw < 5; draw += 1) {
      expect(drawWild(state, rng, "you")).toBeNull();
    }
    expect(hand).toEqual(held);
  });

  it("spends the card even when nothing on the board moves", () => {
    const state = setup();
    // A legal whip on a quiet week: nobody was coming for the coalition, so
    // the card protects nothing. It is gone all the same — a wild is spent on
    // the guess, not on the outcome.
    spare(state).heldBy = "you";
    state.players[0].hand = ["whip"];
    state.offers = { you: { bids: [], withdrawFrom: [], wild: { id: "whip" } } };
    settle(state);
    expect(state.players[0].hand).toEqual([]);
  });

  it("refuses a card that is not in hand, and does not spend it", () => {
    const state = setup();
    state.players[0].hand = ["whip"];
    const offer = { bids: [], withdrawFrom: [], wild: { id: "recess" } };

    const problems = validateOffer(state, "you", offer);
    expect(problems.map((problem) => problem.code)).toContain("unplayable-wild");

    state.offers = { you: offer };
    settle(state);
    expect(state.players[0].hand).toEqual(["whip"]);
  });

  it("offers no play for a card with nothing to play it against", () => {
    const state = setup();
    // Nothing held, so there is no coalition to whip and no package to recall.
    for (const party of Object.values(state.parties)) party.heldBy = null;
    state.players[0].hand = ["whip", "reshuffle"];
    expect(legalPlays(state, "you")).toEqual([]);
    expect(canPlay(state, "you", { id: "whip" })).toBe(false);
  });
});

describe("every seat can reach the cards", () => {
  // The order-paper bug was one seat holding a lever the other could not
  // reach. These say the same thing about wilds before it can happen twice.
  const strategies = [
    ["greedy", greedyOffer],
    ["shrewd", shrewdOffer],
    ["random", randomOffer],
  ] as const;

  it("never has a strategy produce a play it may not make", () => {
    for (const [, offer] of strategies) {
      const rng = new Rng(17);
      for (const seed of [3, 91, 613, 4242]) {
        let state = newCampaign({ seed, humanParty: "likud", bots: ["shrewd"] });
        for (let turn = 0; turn < 40 && state.phase !== "over"; turn += 1) {
          const move = offer(state, "you", rng);
          expect(canPlay(state, "you", move.wild ?? null)).toBe(true);
          state = applyAction(state, { type: "offer", playerKey: "you", offer: move }).state;
        }
      }
    }
  });

  it("plays the ultimatum when a red line is the only thing in the way", () => {
    const state = setup();
    const party = spare(state);
    party.seats = 12;
    party.refusals = [{ partyKey: "likud", until: state.turn + 10 }];
    state.players[0].hand = ["ultimatum"];

    const play = preferredWild(state, "you");
    expect(play).toEqual({ id: "ultimatum", partyKey: party.key });
    for (const [, offer] of strategies.slice(0, 2)) {
      expect(offer(state, "you", new Rng(1)).wild).toEqual(play);
    }
  });
});
