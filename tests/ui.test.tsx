import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { greedyAllocation } from "../src/bots";
import { applyAction, newCampaign } from "../src/engine/campaign";
import { Rng } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";
import { biddableParties } from "../src/engine/types";
import { Board } from "../src/ui/Board";
import { Chamber } from "../src/ui/Chamber";
import { Reveal } from "../src/ui/Reveal";
import { Setup } from "../src/ui/Setup";

const noop = () => undefined;

/** React escapes text on render, so assertions have to escape too. */
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

const playTurns = (state: GameState, count: number): GameState => {
  let next = state;
  const rng = new Rng(7);
  for (let turn = 0; turn < count && next.phase !== "over"; turn += 1) {
    next = applyAction(next, {
      type: "commit",
      playerKey: "you",
      allocation: greedyAllocation(next, "you", rng),
    }).state;
  }
  return next;
};

describe("setup screen", () => {
  it("offers every real party to lead", () => {
    const html = renderToString(<Setup onStart={noop} />);
    expect(html).toContain("Kingmaker");
    expect(html).toContain("Likud");
    expect(html).toContain(escapeHtml("Ra'am"));
    expect(html).toContain("Start the campaign");
  });
});

describe("board", () => {
  it("renders the opening position", () => {
    const state = newCampaign({ seed: 100, humanParty: "likud" });
    const html = renderToString(<Board state={state} onCommit={noop} />);

    expect(html).toContain("Buy a majority");
    expect(html).toContain("Week 1");
    // Every party for sale is on the board, and the ones players lead are not.
    for (const party of biddableParties(state)) {
      expect(html).toContain(escapeHtml(party.name));
    }
    expect(html).toContain("left to place");
  });

  it("shows all eighteen ministries as chips", () => {
    const state = newCampaign({ seed: 101 });
    const html = renderToString(<Board state={state} onCommit={noop} />);
    for (const ministry of state.ministries) {
      expect(html).toContain(escapeHtml(ministry.name));
    }
  });

  it("switches its language once a government is sitting", () => {
    const state = playTurns(newCampaign({ seed: 5, humanParty: "likud", bots: ["random"] }), 12);
    if (state.phase !== "governing" && state.phase !== "rebuilding") return;

    const html = renderToString(<Board state={state} onCommit={noop} />);
    expect(html).toMatch(/Hold the coalition together|Rebuild it or lose it/);
    expect(html).toContain("Year ");
    expect(html).toContain("End the year");
  });

  it("marks a party that has ruled the player out", () => {
    const state = newCampaign({ seed: 102, humanParty: "likud" });
    const target = biddableParties(state)[0];
    target.refusals.push({ partyKey: "likud", until: state.turn + 4 });

    const html = renderToString(<Board state={state} onCommit={noop} />);
    expect(html).toContain("refuses you over");
  });
});

describe("chamber", () => {
  it("draws a bloc for every player plus the unaligned remainder", () => {
    const state = newCampaign({ seed: 103 });
    const html = renderToString(<Chamber state={state} />);
    expect(html).toContain("majority-mark");
    expect(html).toContain("chamber-seg empty");
    expect(html).toContain("61");
  });
});

describe("reveal", () => {
  it("shows the bids, the winner, and the cards drawn", () => {
    const state = newCampaign({ seed: 104, humanParty: "likud" });
    const next = applyAction(state, {
      type: "commit",
      playerKey: "you",
      allocation: greedyAllocation(state, "you", new Rng(3)),
    }).state;

    const result = next.lastTurn;
    expect(result).not.toBeNull();

    const html = renderToString(
      <Reveal state={next} result={result!} onClose={noop} />,
    );
    expect(html).toContain("The offers are opened");
    expect(html).toContain("bn");
    expect(html).toContain("Carry on");
  });

  it("handles a turn where nobody bid", () => {
    const state = newCampaign({ seed: 105 });
    const html = renderToString(
      <Reveal
        state={state}
        result={{ turn: 1, parties: [], cards: [] }}
        onClose={noop}
      />,
    );
    expect(html).toContain("Nobody bid");
  });
});
