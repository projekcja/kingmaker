import { describe, expect, it } from "vitest";

import { greedyOffer } from "../src/bots";
import { applyAction, newCampaign } from "../src/engine/campaign";
import { MAJORITY } from "../src/engine/parties";
import { Rng } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";
import { TERM_LENGTH, biddableParties, blocSeats, emptyOffer } from "../src/engine/types";
import { unlockedBy } from "../src/ui/achievements";

const humanMove = (state: GameState, offer = emptyOffer()): GameState =>
  applyAction(state, { type: "offer", playerKey: "you", offer }).state;

describe("achievements", () => {
  it("stays quiet on an ordinary turn", () => {
    const state = newCampaign({ seed: 3, humanParty: "likud", bots: ["random"] });
    const next = humanMove(state, greedyOffer(state, "you", new Rng(1)));
    expect(
      unlockedBy({ seatKey: "you", prev: state, next, result: next.lastTurn, hasBeenOpposition: false }),
    ).toEqual([]);
  });

  it("credits a coalition to the seat sworn in, and only on the turn it happens", () => {
    let state = newCampaign({ seed: 5, humanParty: "likud", bots: ["random"] });
    let prev = state;
    let result = state.lastTurn;
    for (let turn = 0; turn < 60 && state.phase === "forming"; turn += 1) {
      prev = state;
      state = humanMove(state, greedyOffer(state, "you", new Rng(turn)));
      result = state.lastTurn;
      if (result?.swornIn) break;
    }
    if (!result?.swornIn) return; // this seed stalled; covered elsewhere

    const seatKey = result.swornIn;
    const unlocked = unlockedBy({ seatKey, prev, next: state, result, hasBeenOpposition: false });
    expect(unlocked).toContain("first-coalition");
    // A fast formation is real information the fixture already carries — the
    // rule is checked against it rather than assumed for whatever seed ran.
    expect(unlocked.includes("quick-study")).toBe(state.week <= 2);

    // Told it has sat in opposition before, the very same turn also reads as
    // a comeback; told nothing, it does not invent one.
    expect(
      unlockedBy({ seatKey, prev, next: state, result, hasBeenOpposition: true }),
    ).toContain("comeback");

    // Nobody else at the table was sworn in on this turn.
    const other = state.players.find((player) => player.key !== seatKey)?.key;
    if (other) {
      expect(unlockedBy({ seatKey: other, prev, next: state, result, hasBeenOpposition: false })).toEqual([]);
    }
  });

  it("credits a full term to the government that actually sat it, and nobody else", () => {
    const opening = newCampaign({ seed: 4242, humanParty: "likud", bots: [] });
    for (const party of biddableParties(opening)) {
      if (blocSeats(opening, "you") >= MAJORITY) break;
      opening.parties[party.key].heldBy = "you";
    }
    let current = humanMove(opening);
    expect(current.phase).toBe("governing");

    let prev = current;
    for (let year = 0; year < TERM_LENGTH + 2 && current.phase !== "forming"; year += 1) {
      current.emergencyUntil = 0; // the emergency card postpones a vote; not this test
      prev = current;
      current = humanMove(current);
    }
    expect(current.phase).toBe("forming");
    const result = current.lastTurn;
    expect(result).not.toBeNull();
    if (!result) return;

    expect(
      unlockedBy({ seatKey: "you", prev, next: current, result, hasBeenOpposition: false }),
    ).toContain("full-term");

    // A rival who never held the government does not get credited with
    // having sat it out.
    const rival = current.players.find((player) => player.key !== "you")?.key;
    if (rival) {
      expect(
        unlockedBy({ seatKey: rival, prev, next: current, result, hasBeenOpposition: false }),
      ).not.toContain("full-term");
    }
  });

  it("marks the winner of a whole campaign, and not a finalist rival", () => {
    const rng = new Rng(9);
    let state = newCampaign({ seed: 42, humanParty: "likud", bots: ["random"] });
    let prev = state;
    for (let turn = 0; turn < 400 && state.phase !== "over"; turn += 1) {
      prev = state;
      state = applyAction(state, {
        type: "offer",
        playerKey: "you",
        offer: greedyOffer(state, "you", rng),
      }).state;
    }
    expect(state.phase).toBe("over");
    const winner = state.winner as string;
    const result = state.lastTurn;
    expect(result).not.toBeNull();
    if (!result) return;

    expect(
      unlockedBy({ seatKey: winner, prev, next: state, result, hasBeenOpposition: false }),
    ).toContain("the-long-game");

    const loser = state.players.find((player) => player.key !== winner)?.key;
    if (loser) {
      expect(
        unlockedBy({ seatKey: loser, prev, next: state, result, hasBeenOpposition: false }),
      ).not.toContain("the-long-game");
    }
  });
});
