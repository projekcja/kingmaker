import { beforeEach, describe, expect, it } from "vitest";

import { applyAction, isLegal } from "../src/engine/actions";
import type { Action } from "../src/engine/actions";
import { newGame } from "../src/engine/generator";
import { evaluate } from "../src/engine/negotiation";
import { suggestedTargets } from "../src/engine/actions";
import type { GameState, Offer } from "../src/engine/types";
import { RULES_VERSION, coalitionSeats, isHumanSeat, whoseTurn } from "../src/engine/types";
import { LocalTransport } from "../src/net/localTransport";
import { replay } from "../src/net/replay";
import type { GameRecord } from "../src/net/transport";
import { newGameId } from "../src/net/transport";
import { cheapestAcceptableOffer } from "./bot";

const FORMATEUR = "alice";
const PARTNER = "bob";

/** A game where the formateur and one other party both have people in them. */
const seatedGame = (seed: number): { state: GameState; humanParty: string } => {
  const solo = newGame({ seed });
  const humanParty = suggestedTargets(solo)[0];
  const state = newGame({
    seed,
    seats: { [solo.playerKey]: FORMATEUR, [humanParty]: PARTNER },
  });
  return { state, humanParty };
};

const emptyOffer = (partyKey: string): Offer => ({ partyKey, portfolios: [], commitments: {} });

describe("seats", () => {
  it("leaves the single-player game untouched when nobody is seated", () => {
    const solo = newGame({ seed: 4001 });
    expect(solo.seats).toEqual({});
    expect(solo.pending).toBeNull();
    expect(whoseTurn(solo).playerId).toBeNull();
    // With no seat holder, any actor may move.
    expect(isLegal(solo, { type: "rally" }, "anyone")).toBe(true);
  });

  it("tables an offer with a human party instead of resolving it", () => {
    const { state, humanParty } = seatedGame(4002);
    expect(isHumanSeat(state, humanParty)).toBe(true);

    const offer = cheapestAcceptableOffer(state, humanParty) ?? emptyOffer(humanParty);
    const next = applyAction(state, { type: "offer", offer }).state;

    expect(next.pending).not.toBeNull();
    expect(next.pending?.offer.partyKey).toBe(humanParty);
    expect(next.coalition.members).not.toContain(humanParty);
    // No time passes while a person is thinking.
    expect(next.day).toBe(state.day);
  });

  it("still resolves an offer to a party the engine plays", () => {
    const { state } = seatedGame(4003);
    const aiParty = suggestedTargets(state).find((key) => !isHumanSeat(state, key));
    if (!aiParty) return;

    const offer = cheapestAcceptableOffer(state, aiParty);
    if (!offer) return;
    const next = applyAction(state, { type: "offer", offer }).state;

    expect(next.pending).toBeNull();
    expect(next.coalition.members).toContain(aiParty);
    expect(next.day).toBe(state.day + 2);
  });
});

describe("turn order", () => {
  it("hands the turn to the party holding the offer, and blocks the formateur", () => {
    const { state, humanParty } = seatedGame(4004);
    const tabled = applyAction(state, {
      type: "offer",
      offer: emptyOffer(humanParty),
    }).state;

    const turn = whoseTurn(tabled);
    expect(turn.partyKey).toBe(humanParty);
    expect(turn.playerId).toBe(PARTNER);
    expect(turn.awaitingAnswer).toBe(true);

    // The formateur cannot act at all while an answer is owed.
    expect(isLegal(tabled, { type: "rally" }, FORMATEUR)).toBe(false);
    expect(isLegal(tabled, { type: "meet", partyKey: humanParty }, FORMATEUR)).toBe(false);
    // And only the seat holder may answer.
    expect(isLegal(tabled, { type: "respond", accept: true }, FORMATEUR)).toBe(false);
    expect(isLegal(tabled, { type: "respond", accept: true }, PARTNER)).toBe(true);
  });

  it("refuses a response when nothing is on the table", () => {
    const { state } = seatedGame(4005);
    expect(isLegal(state, { type: "respond", accept: true }, PARTNER)).toBe(false);
  });

  it("returns the turn to the formateur once the answer is given", () => {
    const { state, humanParty } = seatedGame(4006);
    const tabled = applyAction(state, { type: "offer", offer: emptyOffer(humanParty) }).state;
    const answered = applyAction(tabled, { type: "respond", accept: false }).state;

    expect(answered.pending).toBeNull();
    expect(whoseTurn(answered).playerId).toBe(FORMATEUR);
    expect(answered.day).toBe(tabled.day + 2);
  });
});

describe("human decisions", () => {
  it("admits the party and hands over the ministries on acceptance", () => {
    const { state, humanParty } = seatedGame(4007);
    const offer = cheapestAcceptableOffer(state, humanParty) ?? emptyOffer(humanParty);

    const tabled = applyAction(state, { type: "offer", offer }).state;
    const joined = applyAction(tabled, { type: "respond", accept: true }).state;

    expect(joined.coalition.members).toContain(humanParty);
    expect(coalitionSeats(joined)).toBeGreaterThan(coalitionSeats(state));
    for (const key of offer.portfolios) {
      expect(joined.coalition.portfolios[key]).toBe(humanParty);
    }
  });

  it("lets a player accept terms the arithmetic would have refused", () => {
    const { state, humanParty } = seatedGame(4008);
    const derisory = emptyOffer(humanParty);
    // Confirm the engine really would have said no to this.
    expect(evaluate(state, derisory).accepted).toBe(false);

    const tabled = applyAction(state, { type: "offer", offer: derisory }).state;
    const joined = applyAction(tabled, { type: "respond", accept: true }).state;

    expect(joined.coalition.members).toContain(humanParty);
  });

  it("lets a player refuse terms the arithmetic liked, and records that they did", () => {
    const { state, humanParty } = seatedGame(4009);
    const generous = cheapestAcceptableOffer(state, humanParty);
    if (!generous) return;
    expect(evaluate(state, generous).accepted).toBe(true);

    const tabled = applyAction(state, { type: "offer", offer: generous }).state;
    const refused = applyAction(tabled, { type: "respond", accept: false }).state;

    expect(refused.coalition.members).not.toContain(humanParty);
    expect(refused.log.some((entry) => entry.text.includes("its own people called generous"))).toBe(
      true,
    );
  });
});

describe("replay", () => {
  const record = (seed: number, seats: Record<string, string>): GameRecord => ({
    id: newGameId(),
    seed,
    rulesVersion: RULES_VERSION,
    daysTotal: 28,
    partyCount: 8,
    totalSeats: 120,
    seats,
    players: { [FORMATEUR]: "Alice", [PARTNER]: "Bob" },
    status: "playing",
    createdAt: 0,
  });

  it("rebuilds an identical game from the seed and the moves alone", () => {
    const solo = newGame({ seed: 4010 });
    const humanParty = suggestedTargets(solo)[0];
    const seats = { [solo.playerKey]: FORMATEUR, [humanParty]: PARTNER };

    const actions: Action[] = [
      { type: "meet", partyKey: humanParty },
      { type: "rally" },
      { type: "offer", offer: emptyOffer(humanParty) },
      { type: "respond", accept: true },
    ];

    // Played directly...
    let direct = newGame({ seed: 4010, seats });
    for (const action of actions) direct = applyAction(direct, action).state;

    // ...and rebuilt from storage.
    const rebuilt = replay(record(4010, seats), actions);

    expect(JSON.stringify(rebuilt)).toEqual(JSON.stringify(direct));
  });

  it("refuses to replay a game recorded under different rules", () => {
    const stale = { ...record(4011, {}), rulesVersion: RULES_VERSION + 1 };
    expect(() => replay(stale, [])).toThrow(/rules/);
  });
});

describe("local transport", () => {
  beforeEach(() => {
    // A minimal browser: enough for storage and for subscribe to attach.
    const store = new Map<string, string>();
    const localStorageStub = {
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageStub,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: { addEventListener: () => undefined, removeEventListener: () => undefined },
      configurable: true,
    });
  });

  it("stores a game, appends moves in order, and reads them back", async () => {
    const transport = new LocalTransport();
    const game: GameRecord = {
      id: "t1",
      seed: 7,
      rulesVersion: RULES_VERSION,
      daysTotal: 28,
      partyCount: 8,
      totalSeats: 120,
      seats: {},
      players: {},
      status: "playing",
      createdAt: 1,
    };
    await transport.createGame(game);

    expect(await transport.getGame("t1")).toEqual(game);
    expect(await transport.listActions("t1")).toEqual([]);

    expect(await transport.appendAction("t1", 0, { type: "rally" })).toBe("ok");
    expect(await transport.appendAction("t1", 1, { type: "sign" })).toBe("ok");

    const actions = await transport.listActions("t1");
    expect(actions).toEqual([{ type: "rally" }, { type: "sign" }]);
  });

  it("rejects a second move on the same turn rather than overwriting it", async () => {
    const transport = new LocalTransport();
    await transport.createGame({
      id: "t2",
      seed: 7,
      rulesVersion: RULES_VERSION,
      daysTotal: 28,
      partyCount: 8,
      totalSeats: 120,
      seats: {},
      players: {},
      status: "playing",
      createdAt: 1,
    });

    expect(await transport.appendAction("t2", 0, { type: "rally" })).toBe("ok");
    expect(await transport.appendAction("t2", 0, { type: "sign" })).toBe("conflict");
    expect(await transport.listActions("t2")).toEqual([{ type: "rally" }]);
  });

  it("lists and deletes games without touching their neighbours", async () => {
    const transport = new LocalTransport();
    const base = {
      seed: 7,
      rulesVersion: RULES_VERSION,
      daysTotal: 28,
      partyCount: 8,
      totalSeats: 120,
      seats: {},
      players: {},
      status: "playing" as const,
    };
    await transport.createGame({ ...base, id: "keep", createdAt: 2 });
    await transport.createGame({ ...base, id: "drop", createdAt: 1 });
    await transport.appendAction("drop", 0, { type: "rally" });
    await transport.appendAction("keep", 0, { type: "rally" });

    expect((await transport.listGames()).map((game) => game.id)).toEqual(["keep", "drop"]);

    await transport.deleteGame("drop");
    expect(await transport.getGame("drop")).toBeNull();
    expect(await transport.listActions("drop")).toEqual([]);
    expect(await transport.getGame("keep")).not.toBeNull();
    expect(await transport.listActions("keep")).toEqual([{ type: "rally" }]);
  });
});
