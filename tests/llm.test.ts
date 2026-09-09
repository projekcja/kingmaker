/**
 * The language-model seat, tested without a language model.
 *
 * The briefing and the reply parser are pure, so a canned "model" proves the
 * whole loop offline: what a player is told, what is accepted from them, and
 * what happens when they send something illegal.
 */

import { describe, expect, it } from "vitest";

import { greedyOffer } from "../src/bots";
import {
  createLlmStrategy,
  describePosition,
  extractJson,
  parseReply,
  promptFor,
} from "../src/bots/llm";
import { newCampaign } from "../src/engine/campaign";
import { Rng } from "../src/engine/rng";
import type { GameState, Offer } from "../src/engine/types";
import { biddableParties, freeMinistries } from "../src/engine/types";
import { playCampaign, playCampaignAsync } from "./harness";

const setup = (seed = 31): GameState => newCampaign({ seed, humanParty: "likud" });

/** An offer as a model would write it. */
const asJson = (offer: Offer, thinking = "buying the biggest thing I can afford"): string =>
  JSON.stringify({
    thinking,
    withdrawFrom: offer.withdrawFrom,
    bids: offer.bids.map((bid) => ({ party: bid.partyKey, ministries: bid.ministries })),
  });

describe("the briefing", () => {
  it("puts the whole position in front of the player", () => {
    const state = setup();
    const text = describePosition(state, "you");

    for (const party of biddableParties(state)) {
      expect(text).toContain(party.key);
      expect(text).toContain(`${party.seats} mandates`);
    }
    expect(text).toContain("defense");
    expect(text).toContain("18bn");
    expect(text).toContain("Likud");
  });

  it("marks a party that has ruled the player out", () => {
    const state = setup();
    const target = biddableParties(state)[0];
    target.refusals.push({ partyKey: "likud", until: state.turn + 3 });
    expect(describePosition(state, "you")).toContain("REFUSES YOU");
  });

  it("shows what a partner is being paid, and to whom", () => {
    const state = setup();
    const target = biddableParties(state)[0];
    const before = freeMinistries(state, "you");
    target.heldBy = "bot1";
    target.package = ["defense", "science"];

    const text = describePosition(state, "you");
    expect(text).toContain("19bn");
    expect(text).toContain("beat that to take it");
    // And your own hand is untouched by it, because what a rival is paying with
    // is their copy of those portfolios, not yours.
    expect(freeMinistries(state, "you")).toEqual(before);
  });

  it("never leaks a rival sealed offer", () => {
    const state = setup();
    const before = describePosition(state, "you");

    const target = biddableParties(state)[1];
    state.offers = {
      bot1: { bids: [{ partyKey: target.key, ministries: ["defense", "finance"] }], withdrawFrom: [] },
    };
    // Committing changes nothing about what the other side can see.
    expect(describePosition(state, "you")).toBe(before);
  });

  it("ships the rules with the position", () => {
    const messages = promptFor(setup(), "you");
    expect(messages[0].content).toContain("61");
    expect(messages[0].content).toContain("A losing offer costs nothing");
    expect(messages[0].content).toContain('"bids"');
    expect(messages[1].content).toContain("PARTIES FOR SALE");
  });
});

describe("reading a reply", () => {
  it("finds the JSON inside whatever it was wrapped in", () => {
    expect(extractJson('Here you go:\n```json\n{"bids": []}\n```\nGood luck!')).toBe('{"bids": []}');
    expect(extractJson('{"a": {"b": 1}, "c": "}"}')).toBe('{"a": {"b": 1}, "c": "}"}');
    expect(extractJson("no json here")).toBeNull();
  });

  it("takes display names as readily as keys", () => {
    const state = setup();
    const shas = state.parties.shas.name;
    const parsed = parseReply(
      state,
      "you",
      `I will court them.\n{"bids": [{"party": "${shas}", "ministries": ["Justice", "Science & Technology"]}]}`,
    );

    expect(parsed.problems).toEqual([]);
    expect(parsed.offer.bids).toEqual([{ partyKey: "shas", ministries: ["justice", "science"] }]);
  });

  it("keeps the reasoning the model gave", () => {
    const state = setup();
    const parsed = parseReply(state, "you", asJson({ bids: [], withdrawFrom: [] }, "sitting this one out"));
    expect(parsed.thinking).toBe("sitting this one out");
  });

  it("reports a move that breaks a rule instead of repairing it", () => {
    const state = setup();
    const [a, b, c, d] = biddableParties(state);

    // Three tables is the week. A fourth is not, however little is on it.
    const tooMany = parseReply(
      state,
      "you",
      asJson({
        bids: [
          { partyKey: a.key, ministries: ["defense"] },
          { partyKey: b.key, ministries: ["finance"] },
          { partyKey: c.key, ministries: ["health"] },
          { partyKey: d.key, ministries: ["justice"] },
        ],
        withdrawFrom: [],
      }),
    );
    expect(tooMany.problems.map((problem) => problem.code)).toContain("too-many");

    const twice = parseReply(
      state,
      "you",
      asJson({
        bids: [
          { partyKey: a.key, ministries: ["defense"] },
          { partyKey: b.key, ministries: ["defense"] },
        ],
        withdrawFrom: [],
      }),
    );
    expect(twice.problems.map((problem) => problem.code)).toContain("duplicate");
  });

  it("complains about things that do not exist", () => {
    const state = setup();
    const invented = parseReply(
      state,
      "you",
      '{"bids": [{"party": "pirate-party", "ministries": ["Ministry of Silly Walks"]}]}',
    );
    const codes = invented.problems.map((problem) => problem.code);
    expect(codes).toContain("unknown-party");
  });

  it("treats an unreadable reply as a problem, not a crash", () => {
    const state = setup();
    expect(parseReply(state, "you", "I would rather not.").problems).toHaveLength(1);
    expect(parseReply(state, "you", "{not json at all,}").problems).toHaveLength(1);
  });
});

describe("the seat", () => {
  it("hands an illegal move back with its complaints and takes the correction", async () => {
    const state = setup();
    const target = biddableParties(state)[0];
    // Out of the hand the player actually has: the top of the ladder belongs to
    // their own list, and offering it would be a second, different complaint.
    const [one, two, three, four] = freeMinistries(state, "you");
    const replies = [
      // Four tables is one too many.
      asJson({
        bids: [
          { partyKey: target.key, ministries: [one] },
          { partyKey: biddableParties(state)[1].key, ministries: [two] },
          { partyKey: biddableParties(state)[2].key, ministries: [three] },
          { partyKey: biddableParties(state)[3].key, ministries: [four] },
        ],
        withdrawFrom: [],
      }),
      asJson({ bids: [{ partyKey: target.key, ministries: [one] }], withdrawFrom: [] }),
    ];

    const seen: Array<Array<{ role: string; content: string }>> = [];
    const strategy = createLlmStrategy(async (messages) => {
      seen.push(messages.map((message) => ({ ...message })));
      return replies.shift() ?? "";
    });

    const move = await strategy(state, "you");
    expect(move.attempts).toBe(2);
    expect(move.gaveUp).toBe(false);
    expect(move.offer.bids).toEqual([{ partyKey: target.key, ministries: [one] }]);
    // The second call was told exactly what was wrong with the first.
    expect(seen[1].at(-1)?.content).toContain("3 parties a week");
  });

  it("passes the turn rather than playing an illegal move", async () => {
    const strategy = createLlmStrategy(async () => "absolutely not", 3);
    const move = await strategy(setup(), "you");

    expect(move.attempts).toBe(3);
    expect(move.gaveUp).toBe(true);
    expect(move.offer).toEqual({ bids: [], withdrawFrom: [] });
  });
});

describe("a campaign played through the model seat", () => {
  it("runs exactly as it would have without the round trip", async () => {
    const rng = new Rng(99);
    // A "model" that speaks only JSON, and happens to think like the greedy bot.
    const strategy = async (state: GameState, playerKey: string) => {
      const reply = asJson(greedyOffer(state, playerKey, rng));
      const parsed = parseReply(state, playerKey, reply);
      expect(parsed.problems).toEqual([]);
      return parsed.offer;
    };

    const throughJson = await playCampaignAsync({
      seed: 4242,
      humanParty: "likud",
      strategy,
      maxTurns: 200,
    });
    const direct = playCampaign({ seed: 4242, humanParty: "likud", maxTurns: 200 });

    expect(throughJson.finished).toBe(true);
    expect(throughJson.turns).toBe(direct.turns);
    expect(throughJson.state.winner).toBe(direct.state.winner);
    expect(throughJson.state.parliament).toBe(direct.state.parliament);
  });

  it("survives a seat that never sends a legal move", async () => {
    const strategy = createLlmStrategy(async () => "no", 1);
    const outcome = await playCampaignAsync({
      seed: 7,
      humanParty: "likud",
      strategy: async (state, playerKey) => (await strategy(state, playerKey)).offer,
      maxTurns: 40,
    });

    // Passing every turn is legal; the rival simply wins the campaign.
    expect(outcome.turns).toBeGreaterThan(0);
    expect(outcome.humanWon).toBe(false);
  });
});
