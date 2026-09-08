import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { applyAction, suggestedTargets } from "../src/engine/actions";
import { newGame } from "../src/engine/generator";
import type { GameState } from "../src/engine/types";
import { AgreementPanel } from "../src/ui/AgreementPanel";
import { Header } from "../src/ui/Header";
import { LogPanel } from "../src/ui/LogPanel";
import { NegotiationPanel } from "../src/ui/NegotiationPanel";
import { PartyList } from "../src/ui/PartyList";
import { ResponsePanel } from "../src/ui/ResponsePanel";
import { SeatingScreen } from "../src/ui/Lobby";
import { EndScreen } from "../src/ui/Screens";
import { cheapestAcceptableOffer, playOut } from "./bot";

const noop = () => undefined;

/** React escapes text on render, so assertions have to escape too. */
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

/** Render every panel of the board for a given state. */
const renderBoard = (state: GameState, partyKey: string): string =>
  [
    renderToString(<Header state={state} onRestart={noop} />),
    renderToString(<PartyList state={state} selected={partyKey} onSelect={noop} />),
    renderToString(<NegotiationPanel state={state} partyKey={partyKey} onAction={noop} />),
    renderToString(<AgreementPanel state={state} onAction={noop} />),
    renderToString(<LogPanel state={state} />),
  ].join("\n");

describe("interface", () => {
  it("renders the whole board on day one", () => {
    const state = newGame({ seed: 2024 });
    const html = renderBoard(state, state.playerKey);
    expect(html).toContain(state.parliament.name);
    expect(html).toContain(escapeHtml(state.parliament.parties[state.playerKey].name));
    expect(html).toContain("for a majority");
  });

  it("renders every party panel, met and unmet", () => {
    const state = newGame({ seed: 2025 });
    for (const key of Object.keys(state.parliament.parties)) {
      const html = renderToString(
        <NegotiationPanel state={state} partyKey={key} onAction={noop} />,
      );
      expect(html).toContain(escapeHtml(state.parliament.parties[key].name));
    }

    // And again once their demands are on the table.
    const met = applyAction(state, {
      type: "meet",
      partyKey: Object.keys(state.parliament.parties).find((key) => key !== state.playerKey)!,
    }).state;
    expect(renderBoard(met, met.playerKey)).toContain("day");
  });

  it("hides a party's demands until they have been met", () => {
    const state = newGame({ seed: 2026 });
    const target = Object.keys(state.parliament.parties).find((key) => key !== state.playerKey)!;

    const before = renderToString(
      <NegotiationPanel state={state} partyKey={target} onAction={noop} />,
    );
    expect(before).toContain("You have not sat down with them");

    const after = applyAction(state, { type: "meet", partyKey: target }).state;
    const html = renderToString(
      <NegotiationPanel state={after} partyKey={target} onAction={noop} />,
    );
    expect(html).not.toContain("You have not sat down with them");
    expect(html).toContain(
      escapeHtml(
        after.parliament.portfolios[after.parliament.parties[target].portfolioWants[0]].name,
      ),
    );
  });

  it("renders a board mid-negotiation, with partners and commitments", () => {
    let state = newGame({ seed: 2027 });
    const target = Object.keys(state.parliament.parties).find((key) => key !== state.playerKey)!;

    const issue = Object.values(state.parliament.issues)[0];
    state = applyAction(state, {
      type: "commit",
      issueKey: issue.key,
      position: issue.options[0].position,
    }).state;

    const offer = cheapestAcceptableOffer(state, target);
    if (offer) state = applyAction(state, { type: "offer", offer }).state;

    const html = renderBoard(state, target);
    expect(html).toContain(issue.name);
    expect(html).toContain("Positions written in");
  });

  it("renders both endings", () => {
    const won = (() => {
      for (let seed = 0; seed < 80; seed += 1) {
        const result = playOut(newGame({ seed }));
        if (result.won) return result.state;
      }
      return null;
    })();
    expect(won).not.toBeNull();
    const winHtml = renderToString(
      <EndScreen state={won as GameState} onRestart={noop} onReplay={noop} />,
    );
    expect(winHtml).toContain("You have a government");
    expect(winHtml).toContain("Stability");

    const lost = newGame({ seed: 31337 });
    const expired: GameState = {
      ...lost,
      finished: true,
      outcome: "expired",
      day: lost.daysTotal + 1,
      epilogue: "The mandate expires.",
    };
    const lossHtml = renderToString(
      <EndScreen state={expired} onRestart={noop} onReplay={noop} />,
    );
    expect(lossHtml).toContain("The mandate expires");
  });
});

describe("multiplayer interface", () => {
  it("shows a seated party the package on the table and its own read", () => {
    const solo = newGame({ seed: 3101 });
    const humanParty = suggestedTargets(solo)[0];
    const state = newGame({
      seed: 3101,
      seats: { [solo.playerKey]: "alice", [humanParty]: "bob" },
    });

    const wanted = state.parliament.parties[humanParty].portfolioWants[0];
    const tabled = applyAction(state, {
      type: "offer",
      offer: { partyKey: humanParty, portfolios: [wanted], commitments: {} },
    }).state;

    const html = renderToString(<ResponsePanel state={tabled} onAction={noop} />);
    expect(html).toContain("On the table");
    expect(html).toContain(escapeHtml(tabled.parliament.portfolios[wanted].name));
    expect(html).toContain("Accept and join");
    expect(html).toContain("Turn it down");
  });

  it("renders nothing when there is no package to answer", () => {
    const state = newGame({ seed: 3102 });
    expect(renderToString(<ResponsePanel state={state} onAction={noop} />)).toBe("");
  });

  it("renders the seating screen with every party and who holds it", () => {
    const state = newGame({ seed: 3103 });
    const parties = Object.values(state.parliament.parties).map((party) => ({
      key: party.key,
      name: party.name,
      leader: party.leader,
      seats: party.seats,
    }));

    const html = renderToString(
      <SeatingScreen
        record={{
          id: "abc123",
          seed: 3103,
          rulesVersion: 1,
          daysTotal: 28,
          partyCount: 8,
          totalSeats: 120,
          seats: { [state.playerKey]: "alice" },
          players: { alice: "Alice" },
          status: "lobby",
          createdAt: 0,
        }}
        parties={parties}
        formateurKey={state.playerKey}
        onSave={noop}
        onLeave={noop}
      />,
    );

    expect(html).toContain("Take your seats");
    expect(html).toContain("abc123");
    expect(html).toContain("Alice");
    for (const party of parties) expect(html).toContain(escapeHtml(party.name));
  });
});
