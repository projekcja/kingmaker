import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { greedyOffer } from "../src/bots";
import { applyAction, newCampaign } from "../src/engine/campaign";
import { Rng } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";
import { FORMING_DEADLINE, TERM_LENGTH, biddableParties, ministryByKey } from "../src/engine/types";
import {
  BLOC_LABEL,
  CHAMBERS,
  DEFAULT_CHAMBER,
  TOTAL_SEATS,
  chamberById,
} from "../src/engine/parties";
import { Board } from "../src/ui/Board";
import { Chamber } from "../src/ui/Chamber";
import { Reveal } from "../src/ui/Reveal";
import { BlocChamber } from "../src/ui/BlocChamber";
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
      type: "offer",
      playerKey: "you",
      offer: greedyOffer(next, "you", rng),
    }).state;
  }
  return next;
};

describe("setup screen", () => {
  it("offers every real party to lead", () => {
    const html = renderToString(<Setup onStart={noop} />);
    expect(html).toContain("Kingmaker");
    for (const profile of chamberById(DEFAULT_CHAMBER).parties) {
      expect(html).toContain(escapeHtml(profile.name));
    }
    expect(html).toContain("Start the campaign");
  });

  it("offers every election back to the first, and never sells the projection as a result", () => {
    const html = renderToString(<Setup onStart={noop} />);

    // One button per chamber, each naming its year.
    expect(html.match(/class="chamber /g)?.length).toBe(CHAMBERS.length);
    for (const chamber of CHAMBERS) expect(html).toContain(`>${chamber.year}<`);
    expect(html).toContain(">1949<");
    expect(html).toContain(">2022<");

    // The board it opens on is a real election, named, with what the country
    // actually did with it printed underneath -- which on this one is nothing.
    const chamber = chamberById(DEFAULT_CHAMBER);
    expect(chamber.projected).toBeUndefined();
    expect(html).toContain(escapeHtml(chamber.name));
    expect(html).toContain("Nobody formed a government");

    // Its lists are the ones offered to lead, and a party from another Knesset
    // is not on the board at all.
    for (const profile of chamber.parties) expect(html).toContain(escapeHtml(profile.name));
    expect(html).not.toContain("Mapai");
    expect(html).not.toContain("Kulanu");
  });

  it("never sells the projection as a result", () => {
    // The projection is no longer the opening board, so the screen has to be
    // asked for it. It is the one board in the file that is somebody's estimate
    // and the only one that can mislead, so the caveat is asserted in the words
    // a player reads rather than in a class name they cannot see.
    const projection = CHAMBERS.find((chamber) => chamber.projected)!;
    const html = renderToString(<Setup chamber={projection.id} onStart={noop} />);

    expect(html).toContain(escapeHtml(projection.name));
    expect(html).toContain("not a result");
    expect(html).toContain("not a live feed");
    expect(html).toContain("polling averages");
    // An apostrophe in a list name survives the round trip to HTML.
    expect(html).toContain(escapeHtml("Ra'am"));

    // And it is never given an outcome, because it has not happened.
    expect(projection.outcome).toBeUndefined();
    expect(html).not.toContain("formed the government");
  });
});

describe("the chamber on the setup screen", () => {
  it("seats all 120 of every chamber, coloured by bloc", () => {
    for (const chamber of CHAMBERS) {
      const html = renderToString(<BlocChamber chamber={chamber} />);
      expect(html.match(/class="bloc-seat"/g)?.length).toBe(TOTAL_SEATS);

      // Every bloc with seats is counted in the legend, and the counts add up.
      const blocs = new Set(chamber.parties.map((party) => party.bloc));
      let counted = 0;
      for (const bloc of blocs) {
        const seats = chamber.parties
          .filter((party) => party.bloc === bloc)
          .reduce((sum, party) => sum + party.baseSeats, 0);
        expect(html).toContain(`${BLOC_LABEL[bloc]}<strong>${seats}</strong>`);
        counted += seats;
      }
      expect(counted).toBe(TOTAL_SEATS);
    }
  });

  it("seats the fan left to right along the spectrum", () => {
    // The 21st: Hadash-Ta'al and Ra'am-Balad on the left, Likud and the URWP on
    // the right, so the first seat and the last are at opposite ends of it.
    const chamber = chamberById("knesset-21");
    const html = renderToString(<BlocChamber chamber={chamber} />);
    const order = [...html.matchAll(/<title>([^<]+?) —/g)].map((match) => match[1]);
    expect(order.length).toBe(TOTAL_SEATS);

    // renderToString escapes the names, so the comparison escapes too.
    const politics = (name: string) =>
      chamber.parties.find((party) => escapeHtml(party.name) === name)!.leftRight;
    expect(politics(order[0])).toBeLessThan(politics(order[order.length - 1]));
    // Monotone: the fan is the axis, not a shuffle.
    for (let i = 1; i < order.length; i += 1) {
      expect(politics(order[i])).toBeGreaterThanOrEqual(politics(order[i - 1]));
    }
  });

  it("reports what the country actually did with each board", () => {
    for (const chamber of CHAMBERS) {
      if (chamber.projected) {
        // Nothing has happened yet, so there is nothing to report.
        expect(chamber.outcome).toBeUndefined();
        continue;
      }
      const outcome = chamber.outcome!;
      expect(outcome).toBeDefined();

      // Whoever formed it has to be a list that actually ran in that election.
      if (outcome.formedBy) {
        expect(chamber.parties.map((party) => party.key)).toContain(outcome.formedBy);
        expect(outcome.premier).toBeTruthy();
      } else {
        expect(outcome.premier).toBeNull();
      }
    }

    // Both hung Knessets are recorded as hung, and nothing else is.
    const hung = CHAMBERS.filter((c) => c.outcome && !c.outcome.formedBy).map((c) => c.id);
    expect(hung.sort()).toEqual(["knesset-21", "knesset-22"]);
  });

  it("shows the projection on the setup screen by default", () => {
    const html = renderToString(<Setup onStart={noop} />);
    expect(html).toContain("bloc-seat");
    expect(html).toContain("majority-mark");
    expect(html.match(/class="bloc-seat"/g)?.length).toBe(TOTAL_SEATS);
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
    expect(html).toContain("in hand");
  });

  it("shows every portfolio still in hand as a chip", () => {
    const state = newCampaign({ seed: 101 });
    const html = renderToString(<Board state={state} onCommit={noop} />);
    for (const ministry of state.ministries) {
      expect(html).toContain(escapeHtml(ministry.name));
    }
    expect(html).toContain("tables");
  });

  it("switches its language once a government is sitting", () => {
    const state = playTurns(newCampaign({ seed: 5, humanParty: "likud", bots: ["random"] }), 12);
    if (state.phase !== "governing" && state.phase !== "rebuilding") return;

    const html = renderToString(<Board state={state} onCommit={noop} />);
    expect(html).toMatch(/Hold the coalition together|Rebuild it or lose it/);
    expect(html).toContain("Year ");
    expect(html).toContain("End the year");
  });

  it("dresses the two phases differently", () => {
    const forming = newCampaign({ seed: 5, humanParty: "likud", bots: ["random"] });
    const early = renderToString(<Board state={forming} onCommit={noop} />);

    // The phase drives the palette, so it has to reach the DOM.
    expect(early).toContain('data-phase="forming"');
    expect(early).toContain("Coalition talks");
    // Six weeks of fuse while forming.
    expect(early.match(/class="pip /g) ?? []).toHaveLength(FORMING_DEADLINE);

    const sitting = playTurns(forming, 12);
    if (sitting.phase !== "governing") return;

    const later = renderToString(<Board state={sitting} onCommit={noop} />);
    expect(later).toContain('data-phase="governing"');
    expect(later).toContain("In government");
    // And four years of term once a government is in.
    expect(later.match(/class="pip /g) ?? []).toHaveLength(TERM_LENGTH);
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
  it("seats the whole Knesset, one benchful per player and the rest empty", () => {
    const state = newCampaign({ seed: 103 });
    const html = renderToString(<Chamber state={state} />);

    // One circle per mandate, so the arc is the chamber rather than a bar.
    expect(html.match(/class="seat /g) ?? []).toHaveLength(TOTAL_SEATS);
    expect(html).toContain("majority-mark");
    expect(html).toContain("seat vacant");
    expect(html).toContain("61");

    // Every player's bloc is drawn in their own colour, in seating order.
    for (const player of state.players) {
      expect(html).toContain(escapeHtml(`${player.name} — seat`));
    }
  });

  it("lights the government benches once somebody is prime minister", () => {
    const state = playTurns(newCampaign({ seed: 5, humanParty: "likud", bots: ["random"] }), 12);
    if (!state.primeMinister) return;
    expect(renderToString(<Chamber state={state} />)).toContain("governing");
  });
});

describe("reveal", () => {
  it("shows the bids, the winner, and the cards drawn", () => {
    const state = newCampaign({ seed: 104, humanParty: "likud" });
    const next = applyAction(state, {
      type: "offer",
      playerKey: "you",
      offer: greedyOffer(state, "you", new Rng(3)),
    }).state;

    const result = next.lastTurn;
    expect(result).not.toBeNull();

    const html = renderToString(
      <Reveal state={next} result={result!} onClose={noop} />,
    );
    expect(html).toContain("The offers are opened");
    expect(html).toContain("bn");
    expect(html).toContain("Carry on");

    // The two questions the reveal exists to answer: who moved, and what each
    // player actually put on the table -- named portfolios, not only a total.
    expect(html).toContain("Changed hands");
    expect(html).toContain("On the tables");
    const offered = result!.parties.flatMap((party) => Object.values(party.offered)).flat();
    expect(offered.length).toBeGreaterThan(0);
    for (const key of offered) {
      expect(html).toContain(escapeHtml(ministryByKey(next, key)!.name));
    }
  });

  it("names who a party went to and who it came from", () => {
    let state = newCampaign({ seed: 7, humanParty: "likud", bots: ["greedy"] });
    let moved = null;
    for (let turn = 0; turn < 12 && !moved; turn += 1) {
      state = applyAction(state, {
        type: "offer",
        playerKey: "you",
        offer: greedyOffer(state, "you", new Rng(turn + 1)),
      }).state;
      const last = state.lastTurn;
      if (last?.parties.some((party) => party.newHolder !== party.previousHolder)) moved = last;
    }
    expect(moved).not.toBeNull();

    const html = renderToString(<Reveal state={state} result={moved!} onClose={noop} />);
    const change = moved!.parties.find((party) => party.newHolder !== party.previousHolder)!;
    expect(html).toContain(state.parties[change.partyKey]?.name ?? change.partyKey);
    // An arrow from somebody to somebody, and the mandates that moved with it.
    expect(html).toContain("→");
    expect(html).toContain(`>${change.seats}<`);
  });

  it("handles a turn where nobody bid", () => {
    const state = newCampaign({ seed: 105 });
    const html = renderToString(
      <Reveal
        state={state}
        result={{ turn: 1, parties: [], withdrawals: [], cards: [] }}
        onClose={noop}
      />,
    );
    expect(html).toContain("Nobody bid");
  });
});

describe("which side of the aisle you are on", () => {
  /** A sworn-in government, with the seats named. */
  const governing = (pm: string): GameState => {
    const state = newCampaign({ seed: 300, chamber: "knesset-25", humanParty: "likud", bots: ["human"] });
    state.phase = "governing";
    state.primeMinister = pm;
    state.governmentYears = 1;
    return state;
  };

  it("dresses the government benches and the opposition differently", () => {
    const state = governing("you");
    const pm = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    const other = renderToString(<Board state={state} seat="bot1" onCommit={noop} />);

    expect(pm).toContain('data-side="government"');
    expect(other).toContain('data-side="opposition"');
    // The palette is driven off that one attribute, so this is the whole of it.
    expect(pm).not.toContain('data-side="opposition"');
  });

  it("never tells the opposition they are in government", () => {
    const state = governing("you");
    const other = renderToString(<Board state={state} seat="bot1" onCommit={noop} />);

    expect(other).not.toContain("In government");
    expect(other).toContain("In opposition");
    expect(other).toContain("Take their coalition apart");

    const pm = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    expect(pm).toContain("In government");
    expect(pm).toContain("Hold the coalition together");
  });

  it("reads a collapsing coalition from both sides", () => {
    const state = governing("you");
    state.phase = "rebuilding";

    const pm = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    expect(pm).toContain("The coalition is breaking");
    expect(pm).toContain("Rebuild it or lose it");

    const other = renderToString(<Board state={state} seat="bot1" onCommit={noop} />);
    expect(other).toContain("Their coalition is breaking");
    expect(other).toContain("One turn to finish them");
  });

  it("takes no side while a government is still being formed", () => {
    const state = newCampaign({ seed: 301, humanParty: "likud", bots: ["human"] });
    const html = renderToString(<Board state={state} seat="bot1" onCommit={noop} />);
    expect(html).toContain("Coalition talks");
    expect(html).not.toContain("data-side");
  });
});

describe("a shared screen", () => {
  it("draws the board from the seat that is looking", () => {
    const state = newCampaign({ seed: 200, humanParty: "likud", bots: ["human"] });
    const target = biddableParties(state)[0];
    target.heldBy = "bot1";
    target.package = ["defense"];

    // Only the player who bought a party can walk out of it.
    const theirs = renderToString(<Board state={state} seat="bot1" onCommit={noop} />);
    const yours = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    expect(theirs).toContain("pull out");
    expect(yours).not.toContain("pull out");

    // And each of them is told which board this is.
    expect(theirs).toContain("your seat");
    expect(yours).toContain("your seat");
  });

  it("says nothing about seats in a solo campaign", () => {
    const state = newCampaign({ seed: 201, humanParty: "likud" });
    expect(renderToString(<Board state={state} onCommit={noop} />)).not.toContain("your seat");
  });
});
