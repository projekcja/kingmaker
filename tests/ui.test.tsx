import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { greedyOffer } from "../src/bots";
import { applyAction, newCampaign } from "../src/engine/campaign";
import { Rng } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";
import {
  FORMING_DEADLINE,
  OFFERS_PER_TURN,
  TERM_LENGTH,
  biddableParties,
  blocSeats,
  ministryByKey,
} from "../src/engine/types";
import {
  BLOC_LABEL,
  CHAMBERS,
  DEFAULT_CHAMBER,
  TOTAL_SEATS,
  chamberById,
} from "../src/engine/parties";
import { wildById } from "../src/engine/wilds";
import { Board } from "../src/ui/Board";
import { Chamber } from "../src/ui/Chamber";
import { ElectionReport } from "../src/ui/ElectionReport";
import { History } from "../src/ui/History";
import { currentElection, currentReveal } from "../src/ui/reports";
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
    expect(html).toContain("61");
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
    // And says, in words, how many parties a turn may be courted at all.
    expect(html).toContain(`${OFFERS_PER_TURN} parties`);
  });

  it("draws the offer limit as a diary rather than reporting it as a number", () => {
    const state = newCampaign({ seed: 106 });
    const html = renderToString(<Board state={state} onCommit={noop} />);

    // The one resource the game rations. It used to be "0 of 3 tables" in grey
    // in the corner -- a number nobody reads until it has already refused them,
    // and the refusal was silent. One slot per meeting, so what is left is
    // visible before it is spent.
    expect(html.match(/class="diary-slot free"/g) ?? []).toHaveLength(OFFERS_PER_TURN);
    expect(html).toContain(`${OFFERS_PER_TURN} of ${OFFERS_PER_TURN} still free`);
    expect(html).toContain("This week&#x27;s diary");

    // The restriction itself, spelled out where it is being spent.
    expect(html).toContain("the whole restriction");
    expect(html).toContain("The diary is the scarce thing");
  });

  it("counts the diary in the phase's own unit", () => {
    const state = playTurns(newCampaign({ seed: 5, humanParty: "likud", bots: ["random"] }), 12);
    if (state.phase !== "governing") return;
    const html = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    // A turn is a year once a government sits, and the diary is a year's.
    expect(html).toContain("This year&#x27;s diary");
    expect(html).not.toContain("This week&#x27;s diary");
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

  it("leaves the benches nobody has bought in the middle, between the two sides", () => {
    const state = playTurns(newCampaign({ seed: 6, humanParty: "likud", bots: ["greedy"] }), 3);
    const html = renderToString(<Chamber state={state} />);

    // The benches in seating order, as taken or free.
    const benches = [...html.matchAll(/class="seat ([^"]*)"/g)].map((match) =>
      match[1].includes("vacant") ? "free" : "taken",
    );
    expect(benches).toHaveLength(TOTAL_SEATS);

    const free = benches.filter((bench) => bench === "free").length;
    expect(free).toBeGreaterThan(0);

    // One unbroken run of them, with somebody's bloc on either side: the ground
    // between you and them, not a heap off the end of the drawing.
    const first = benches.indexOf("free");
    const last = benches.lastIndexOf("free");
    expect(last - first + 1).toBe(free);
    expect(benches[0]).toBe("taken");
    expect(benches[benches.length - 1]).toBe("taken");
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

  it("leads with where everybody stands, not with the bidding", () => {
    const state = newCampaign({ seed: 105, humanParty: "likud", bots: ["greedy"] });
    const next = applyAction(state, {
      type: "offer",
      playerKey: "you",
      offer: greedyOffer(state, "you", new Rng(11)),
    }).state;

    const html = renderToString(<Reveal state={next} result={next.lastTurn!} onClose={noop} />);
    // The one question a turn settles, for every player, at the top of the
    // panel — before anything that explains how it got there.
    for (const player of next.players) {
      expect(html).toContain(escapeHtml(player.name));
      expect(html).toContain(`>${blocSeats(next, player.key)}</div>`);
    }
    expect(html.indexOf("rev-standings")).toBeLessThan(html.indexOf("Changed hands"));
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
        result={{ turn: 1, parties: [], withdrawals: [], cards: [], laws: [] }}
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

  /*
   * The board has exactly one adjacency it cannot give up.
   *
   * A turn is played by moving between the party cards and the portfolio chips
   * a dozen times — pick a party, tap what to put in front of it, pick the next
   * one. Twice now a panel has been added between them and put a scroll in the
   * middle of that loop: the red lines map first, then the order paper. Both
   * are read once and then not again, so both belong under the commit row.
   *
   * Asserted on the order of the markup rather than on pixels, which is the
   * part that actually decides it and the part a future panel would break.
   */
  it("keeps the party cards and the portfolio chips next to each other", () => {
    const state = governing("you");
    state.bill = { playerKey: "you", options: ["cost-of-living", "austerity"] };
    const html = renderToString(<Board state={state} seat="you" onCommit={noop} />);

    const at = (needle: string) => {
      const index = html.indexOf(needle);
      expect(index, `${needle} is not on the board`).toBeGreaterThan(-1);
      return index;
    };

    const parties = at('class="parties"');
    const chips = at('class="chips"');
    const commit = at('class="commit-row"');
    const orderPaper = at('id="order-paper"');
    const redMap = at('class="redmap"');

    // Nothing at all between the cards and the hand except the diary.
    expect(parties).toBeLessThan(chips);
    expect(html.slice(parties, chips)).not.toContain("order-paper");
    expect(html.slice(parties, chips)).not.toContain('class="redmap"');

    // The two read-once panels are below the button that ends the turn.
    expect(commit).toBeLessThan(orderPaper);
    expect(orderPaper).toBeLessThan(redMap);
  });

  it("names the pencilled-in bill in the commit row, so it cannot be missed", () => {
    const state = governing("you");
    state.bill = { playerKey: "you", options: ["cost-of-living"] };
    const html = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    // Nothing chosen yet, and the row says so rather than staying silent.
    expect(html).toContain("No bill this year");

    // Somebody who is not the prime minister is not offered the cue at all.
    const other = renderToString(<Board state={state} seat="bot1" onCommit={noop} />);
    expect(other).not.toContain("No bill this year");
  });

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

describe("whose party is whose", () => {
  /** The markup of one zone, up to wherever the next one starts. */
  const zoneOf = (html: string, zone: string): string => {
    const start = html.indexOf(`data-zone="${zone}"`);
    expect(start).toBeGreaterThan(-1);
    const next = html.indexOf("data-zone=", start + 1);
    return html.slice(start, next === -1 ? undefined : next);
  };

  // The card headings only. A card also prints the names of everyone its list
  // refuses to sit with, so "is this party in this zone" cannot be asked of the
  // zone's text — only of the cards laid in it.
  const cardsIn = (html: string, zone: string): string[] =>
    [...zoneOf(html, zone).matchAll(/class="party-name">([^<]*)</g)].map((match) => match[1]);

  it("lays every list in the zone of whoever holds it", () => {
    const state = newCampaign({ seed: 500, humanParty: "likud", bots: ["greedy"] });
    const [ours, theirs, spare] = biddableParties(state);
    ours.heldBy = "you";
    theirs.heldBy = "bot1";

    const html = renderToString(<Board state={state} seat="you" onCommit={noop} />);

    expect(cardsIn(html, "mine")).toEqual([escapeHtml(ours.name)]);
    expect(cardsIn(html, "theirs")).toEqual([escapeHtml(theirs.name)]);
    expect(cardsIn(html, "open")).toContain(escapeHtml(spare.name));

    // Every list is somewhere, and no list is in two places.
    const laid = ["mine", "theirs", "open"].flatMap((zone) => cardsIn(html, zone));
    expect(laid.sort()).toEqual(
      biddableParties(state)
        .map((party) => escapeHtml(party.name))
        .sort(),
    );
  });

  it("adds up each zone, so being short is something you read rather than work out", () => {
    const state = newCampaign({ seed: 501, humanParty: "likud", bots: ["greedy"] });
    const [ours, theirs] = biddableParties(state);
    ours.heldBy = "you";
    theirs.heldBy = "bot1";

    const html = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    expect(zoneOf(html, "mine")).toContain(`${ours.seats} seats`);
    expect(zoneOf(html, "theirs")).toContain(`${theirs.seats} seats`);
  });

  it("says which rival holds a list, and never labels one you hold yourself", () => {
    const state = newCampaign({ seed: 502, humanParty: "likud", bots: ["greedy"] });
    const [ours, theirs] = biddableParties(state);
    ours.heldBy = "you";
    theirs.heldBy = "bot1";
    const rival = state.players.find((player) => player.key === "bot1")!;

    const html = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    // With more than one rival, the zone says "theirs" but not whose.
    expect(zoneOf(html, "theirs")).toContain(escapeHtml(rival.name));
    // The zone has already said it, so the card does not say it twice.
    expect(zoneOf(html, "mine")).not.toContain("holder");
  });

  it("names an empty zone rather than dropping it off the board", () => {
    const state = newCampaign({ seed: 503, humanParty: "likud", bots: ["greedy"] });
    const html = renderToString(<Board state={state} seat="you" onCommit={noop} />);
    expect(cardsIn(html, "mine")).toEqual([]);
    expect(zoneOf(html, "mine")).toContain("You hold nobody yet");
    expect(zoneOf(html, "mine")).toContain("0 seats");
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

describe("the side panel", () => {
  /** A campaign one resolved turn in, so there is something to report. */
  const afterATurn = (seed: number): GameState => {
    const state = newCampaign({ seed, humanParty: "likud", bots: ["greedy"] });
    return applyAction(state, {
      type: "offer",
      playerKey: "you",
      offer: greedyOffer(state, "you", new Rng(seed)),
    }).state;
  };

  it("says nothing has happened before anything has", () => {
    const html = renderToString(<Board state={newCampaign({ seed: 401 })} onCommit={noop} />);
    expect(html).toContain("dispatch");
    expect(html).toContain("Nothing has happened yet");
  });

  it("keeps the last turn on screen while the next one is being decided", () => {
    const state = afterATurn(402);
    const html = renderToString(<Board state={state} onCommit={noop} />);
    const moved = state.lastTurn!.parties.filter(
      (party) => party.newHolder !== party.previousHolder,
    );

    // The reveal is a modal and is gone once it is closed. The panel is what
    // the next offer is actually placed against, so the same turn is there too.
    expect(html).toContain("The week just gone");
    for (const party of moved) {
      expect(html).toContain(escapeHtml(state.parties[party.partyKey]?.name ?? ""));
    }
    expect(html).toContain("The full reveal");
  });

  it("reports the vote instead of the bidding on the turn the country votes", () => {
    let state = newCampaign({ seed: 403, humanParty: "likud", bots: ["greedy"] });
    for (let turn = 0; turn < 400 && !state.lastElection; turn += 1) {
      state = applyAction(state, {
        type: "offer",
        playerKey: "you",
        offer: greedyOffer(state, "you", new Rng(403 + turn)),
      }).state;
    }
    const vote = state.lastElection!;
    expect(vote.turn).toBe(state.lastTurn!.turn);

    const html = renderToString(<Board state={state} onCommit={noop} />);
    // An election outranks a turn: the chamber under the whole board has been
    // redrawn, which matters more than who bid what for the Shas.
    expect(html).toContain("The country voted");
    expect(html).not.toContain("The week just gone");
    expect(html).toContain("The biggest moves");
    expect(html).toContain("The full result");

    // The biggest swing is named, with its sign spelled out rather than left to
    // the colour -- the good/bad pair is not far enough apart under deuteranopia
    // to carry it alone.
    const biggest = [...vote.standings].sort(
      (a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before),
    )[0];
    const swing = biggest.after - biggest.before;
    expect(html).toContain(escapeHtml(biggest.name));
    if (swing !== 0) expect(html).toContain(swing > 0 ? `+${swing}` : `−${Math.abs(swing)}`);
  });
});

describe("election night", () => {
  const voted = (seed: number): GameState => {
    let state = newCampaign({ seed, humanParty: "likud", bots: ["greedy"] });
    for (let turn = 0; turn < 400 && !state.lastElection; turn += 1) {
      state = applyAction(state, {
        type: "offer",
        playerKey: "you",
        offer: greedyOffer(state, "you", new Rng(seed + turn)),
      }).state;
    }
    return state;
  };

  it("names every list that stood, what it stood on, and what it won", () => {
    const state = voted(404);
    const vote = state.lastElection!;
    const html = renderToString(
      <ElectionReport state={state} result={vote} onClose={noop} />,
    );

    expect(html).toContain("The country has voted");
    for (const standing of vote.standings) {
      expect(html).toContain(escapeHtml(standing.name));
      // Both numbers on the row, because a swing without the base it swung
      // from is a number the player cannot check.
      const swing = standing.after - standing.before;
      expect(html).toContain(`>${standing.before}<`);
      expect(html).toContain(
        swing > 0 ? `+${swing}` : swing < 0 ? `−${Math.abs(swing)}` : "—",
      );
    }
  });

  it("marks a list voted out of the chamber rather than dropping it", () => {
    // A list under the threshold is gone for good, which is the harshest thing
    // an election does and the easiest to miss if it simply stops being drawn.
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = voted(seed);
      const vote = state.lastElection;
      const out = vote?.standings.filter((standing) => standing.after === 0) ?? [];
      if (out.length === 0) continue;

      const html = renderToString(
        <ElectionReport state={state} result={vote!} onClose={noop} />,
      );
      expect(html).toContain("will not sit in it");
      for (const standing of out) expect(html).toContain(escapeHtml(standing.name));
      expect(html).toContain("swing out");
      return;
    }
    throw new Error("no seed in 1..40 put a list under the threshold");
  });

  it("keeps the ballot changing apart from the country voting", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = voted(seed);
      const vote = state.lastElection;
      if (!vote || vote.ballot.length === 0) continue;

      const html = renderToString(
        <ElectionReport state={state} result={vote!} onClose={noop} />,
      );
      // Two separate stories. Merged into one set of numbers, a joint ticket
      // reads as a landslide and a breakaway as a collapse.
      expect(html).toContain("The ballot changed before anybody voted");
      expect(html).toContain("How they did");
      for (const change of vote.ballot) {
        expect(html).toContain(escapeHtml(change.name));
        if (change.kind === "union") {
          for (const part of change.parts) expect(html).toContain(escapeHtml(part.name));
        }
        if (change.kind === "wound-up") expect(html).toContain(escapeHtml(change.heirName));
        if (change.kind === "breakaway") expect(html).toContain(escapeHtml(change.parentName));
      }
      return;
    }
    throw new Error("no seed in 1..40 rearranged the ballot");
  });
});

describe("a report held across campaigns", () => {
  const played = (seed: number, turns: number): GameState => {
    let state = newCampaign({ seed, humanParty: "likud", bots: ["greedy"] });
    for (let turn = 0; turn < turns; turn += 1) {
      state = applyAction(state, {
        type: "offer",
        playerKey: "you",
        offer: greedyOffer(state, "you", new Rng(seed + turn)),
      }).state;
    }
    return state;
  };

  it("does not follow the player into the next campaign", () => {
    // The reported bug: finish a campaign, start another, play a turn, and the
    // reveal from the campaign before it opened over the new board. React state
    // outlives a campaign, so the held report has to be checked rather than
    // trusted.
    const finished = played(501, 6);
    const held = finished.lastTurn;
    expect(held).not.toBeNull();

    const fresh = newCampaign({ seed: 502, humanParty: "likud", bots: ["greedy"] });
    expect(fresh.lastTurn).toBeNull();
    expect(currentReveal(fresh, held)).toBeNull();

    // And it is still refused once the new campaign has turns of its own, even
    // where the turn numbers line up exactly.
    const oneTurnIn = played(502, 1);
    const sameTurn = played(501, 1).lastTurn!;
    expect(oneTurnIn.lastTurn!.turn).toBe(sameTurn.turn);
    expect(currentReveal(oneTurnIn, sameTurn)).toBe(sameTurn);
    expect(currentReveal(oneTurnIn, held)).toBeNull();
  });

  it("keeps a report that is still the campaign's most recent", () => {
    const state = played(503, 3);
    expect(currentReveal(state, state.lastTurn)).toBe(state.lastTurn);
    expect(currentReveal(state, null)).toBeNull();
  });

  it("refuses an election from a campaign that is not this one", () => {
    let voted = newCampaign({ seed: 504, humanParty: "likud", bots: ["greedy"] });
    for (let turn = 0; turn < 400 && !voted.lastElection; turn += 1) {
      voted = applyAction(voted, {
        type: "offer",
        playerKey: "you",
        offer: greedyOffer(voted, "you", new Rng(504 + turn)),
      }).state;
    }
    const vote = voted.lastElection!;
    expect(currentElection(voted, vote)).toBe(vote);

    // A campaign that has not voted yet has nothing to match it against.
    const fresh = newCampaign({ seed: 505, humanParty: "likud", bots: ["greedy"] });
    expect(currentElection(fresh, vote)).toBeNull();

    // Nor does one that voted on the same turn of a different parliament.
    expect(
      currentElection({ ...voted, lastElection: { ...vote, parliament: vote.parliament + 1 } }, vote),
    ).toBeNull();
  });
});

describe("the campaign history", () => {
  const campaign = (seed: number, turns: number): GameState => {
    let state = newCampaign({ seed, humanParty: "likud", bots: ["greedy"] });
    for (let turn = 0; turn < turns && state.phase !== "over"; turn += 1) {
      state = applyAction(state, {
        type: "offer",
        playerKey: "you",
        offer: greedyOffer(state, "you", new Rng(seed + turn)),
      }).state;
    }
    return state;
  };

  it("shows every line the engine has written", () => {
    const state = campaign(601, 14);
    const html = renderToString(<History state={state} onClose={noop} />);

    expect(html).toContain("The campaign so far");
    // The engine has written this since the first commit and nothing had ever
    // displayed a line of it.
    expect(state.log.length).toBeGreaterThan(0);
    expect(html.match(/class="log-line /g) ?? []).toHaveLength(state.log.length);
    for (const entry of state.log) expect(html).toContain(escapeHtml(entry.text));
  });

  it("groups the log by Knesset, newest first, and marks the sitting one", () => {
    const state = campaign(602, 60);
    const html = renderToString(<History state={state} onClose={noop} />);

    const sittings = new Set(state.log.map((entry) => entry.parliament));
    expect(html.match(/class="sitting"/g) ?? []).toHaveLength(sittings.size);

    // Exactly one Knesset is sitting, and it is the one at the top: catching up
    // means reading what just happened, not scrolling three parliaments to it.
    expect(html.match(/class="sitting-now"/g) ?? []).toHaveLength(1);
    if (sittings.size > 1) {
      const heads = [...html.matchAll(/class="sitting-head">(\d+)/g)].map((m) => Number(m[1]));
      expect(heads).toEqual([...heads].sort((a, b) => b - a));
      expect(heads[0]).toBe(state.parliament);
    }
  });

  it("names the kind of each entry rather than only colouring it", () => {
    const state = campaign(603, 40);
    const html = renderToString(<History state={state} onClose={noop} />);
    // Colour alone would not say "trouble" to anyone who cannot tell it from
    // "deal", so the margin carries the word.
    for (const kind of new Set(state.log.map((entry) => entry.kind))) {
      expect(html).toContain(`class="log-kind">${kind === "info" ? "note" : kind === "card" ? "news" : kind}<`);
    }
  });

  it("is reachable from the side panel", () => {
    const state = campaign(604, 3);
    expect(renderToString(<Board state={state} onCommit={noop} />)).toContain(
      "The campaign so far",
    );
  });
});

describe("playing without a mouse", () => {
  const board = (seed: number) =>
    renderToString(<Board state={newCampaign({ seed })} onCommit={noop} />);

  it("says which party and which portfolios are selected, not only shows it", () => {
    const html = board(701);
    // Selection was carried by colour and a border alone. aria-pressed is the
    // same fact in the form a screen reader can read.
    expect(html).toContain('aria-pressed="false"');
    expect(html.match(/class="party-hit"/g) ?? []).not.toHaveLength(0);
    expect(html).toContain("aria-pressed");
  });

  it("announces the tray's running commentary rather than only redrawing it", () => {
    // The tray is the only feedback a refused move gets -- "the diary is full,
    // cancel a meeting" -- so it has to be spoken, not just repainted.
    expect(board(702)).toContain('role="status"');
    expect(board(702)).toContain('aria-live="polite"');
  });

  it("offers a shortcut for the one action furthest from the hand", () => {
    expect(board(703)).toContain("Ctrl+Enter");
  });
});

describe("the cards in your hand", () => {
  const seat = (state: GameState, hand: string[]): GameState => {
    const next = structuredClone(state);
    next.players[0].hand = hand;
    return next;
  };

  it("puts the card and what it does on the board, not behind a lookup", () => {
    const state = seat(newCampaign({ seed: 810, humanParty: "likud" }), ["whip"]);
    const html = renderToString(<Board state={state} onCommit={noop} />);

    expect(html).toContain("Your hand");
    const whip = wildById("whip")!;
    expect(html).toContain(escapeHtml(whip.title));
    // A card that has to be looked up is a card that gets held forever.
    expect(html).toContain(escapeHtml(whip.effect));
  });

  it("says nothing at all when there is nothing to say", () => {
    const state = seat(newCampaign({ seed: 811 }), []);
    expect(renderToString(<Board state={state} onCommit={noop} />)).not.toContain("Your hand");
  });

  it("leaves an unplayable card on the table rather than hiding the rule", () => {
    // Nothing held, so the whip defends nothing. It could be dropped from the
    // panel; then a player would never learn why it is sometimes absent.
    const state = seat(newCampaign({ seed: 812, humanParty: "likud" }), ["whip"]);
    for (const party of Object.values(state.parties)) party.heldBy = null;
    const html = renderToString(<Board state={state} onCommit={noop} />);

    expect(html).toContain(escapeHtml(wildById("whip")!.title));
    expect(html).toContain("Nothing on the board to play it against");
    expect(html).toContain("wild dead");
  });

  it("counts a second copy rather than drawing a second decision", () => {
    // Two in hand is still one play a turn, so it is a badge, not a row.
    const state = seat(newCampaign({ seed: 813, humanParty: "likud" }), ["whip", "whip"]);
    state.parties[biddableParties(state)[0].key].heldBy = "you";
    const html = renderToString(<Board state={state} onCommit={noop} />);

    expect(html.match(/class="wild-title"/g) ?? []).toHaveLength(1);
    expect(html).toContain("×2");
  });

  it("aims a targeted card at named lists instead of at the board above", () => {
    const state = seat(newCampaign({ seed: 814, humanParty: "likud" }), ["ultimatum"]);
    const refusing = biddableParties(state).slice(0, 2);
    for (const party of refusing) {
      state.parties[party.key].refusals = [{ partyKey: "likud", until: state.turn + 10 }];
    }
    const html = renderToString(<Board state={state} onCommit={noop} />);

    // Not aimed yet -- picking it up is a click away, and nothing is pencilled
    // in until a list is named, so the panel is closed on a fresh render.
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("wild-target");
  });
});
