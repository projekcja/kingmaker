import { useState } from "react";
import type { CSSProperties } from "react";

import { partyHistory } from "../engine/history";
import { BLOC_LABEL, CHAMBERS, DEFAULT_CHAMBER, chamberById } from "../engine/parties";
import type { PlayerKind } from "../engine/types";
import { YEARS_TO_WIN } from "../engine/types";
import { AchievementStrip } from "./Achievements";
import { BlocChamber } from "./BlocChamber";
import { Emblem } from "./Emblem";
import { BLOC_COLOUR } from "./format";

interface Props {
  onStart: (options: {
    humanParty: string;
    bots: PlayerKind[];
    seed?: number;
    chamber?: string;
  }) => void;
  /** Which board the screen opens on. The default is the one a campaign gets. */
  chamber?: string;
  /** Trophies this browser has already earned, across every past campaign. */
  unlocked?: Set<string>;
}

const BOT_SETS: Array<{ label: string; bots: PlayerKind[]; note: string }> = [
  { label: "One rival", bots: ["greedy"], note: "a rival who plays to win" },
  {
    label: "One shrewd rival",
    bots: ["shrewd"],
    note: "a rival who plays against you rather than beside you — it counts the seats you still need, buys the ones that would have finished your coalition, and does not overpay where nobody is bidding against it",
  },
  { label: "One weak rival", bots: ["random"], note: "a rival with no plan at all" },
  { label: "Two rivals", bots: ["greedy", "random"], note: "crowded — three parties come off the market" },
  {
    label: "A friend, hot seat",
    bots: ["human"],
    note: "two of you on this one screen, taking the keyboard in turn. They lead the largest party you leave behind, and the screen is covered between moves because the offers are sealed",
  },
];

export const Setup = ({ onStart, chamber: opening = DEFAULT_CHAMBER, unlocked = new Set() }: Props) => {
  const [chamberId, setChamberId] = useState(opening);
  const chamber = chamberById(chamberId);
  const ranked = [...chamber.parties].sort((a, b) => b.baseSeats - a.baseSeats);

  // The party is picked out of a chamber, so switching chamber has to reseat
  // the player rather than leave them leading a list that is not on the board.
  const [party, setParty] = useState(ranked[0].key);
  const leading = ranked.some((profile) => profile.key === party) ? party : ranked[0].key;

  const [botSet, setBotSet] = useState(0);
  const [seed, setSeed] = useState("");

  // The list that actually formed the government after this election, if one
  // did. Looked up rather than stored twice, so the two can never disagree.
  const formed = chamber.parties.find((party) => party.key === chamber.outcome?.formedBy) ?? null;

  // The list you are about to lead, and what it actually was. The seat count
  // and the bloc colour are the two facts the game itself uses; neither is the
  // reason anyone picks Rafi over Mapai, so the note goes under the grid where
  // the choice is still being made rather than in a tooltip nobody opens.
  const leadingProfile = ranked.find((profile) => profile.key === leading) ?? ranked[0];
  const leadingHistory = partyHistory(leadingProfile.key);

  return (
    <div className="setup">
      {/* The house mark, washed almost out behind the title. It is the one
          thing on the opening screen that is decoration rather than a number,
          and it is placed where nothing has to be read through it. */}
      <Emblem className="setup-emblem" />
      <h1>Kingmaker</h1>
      <p className="lede">
        Sixty-one mandates buys you a government. Ten years in office wins the whole thing.
        Every week you can sit down with <b>three parties</b> and put as much of your
        eighteen ministries in front of each as you like. Everyone bids at once, and each
        party goes to whoever offered it most.
      </p>

      <div className="setup-block">
        <div className="setup-label">
          Which Knesset
          <span className="setup-aside">
            {chamber.name} · {chamber.date} · {chamber.parties.length} lists
          </span>
        </div>
        {/* Twenty-six of them, so the ordinal and the year is all a button gets;
            the line underneath carries whatever else there is to say. */}
        <div className="chamber-grid">
          {CHAMBERS.map((option) => (
            <button
              key={option.id}
              className={`chamber ${chamberId === option.id ? "on" : ""} ${option.projected ? "projected" : ""}`}
              onClick={() => setChamberId(option.id)}
              title={`${option.name} — ${option.date}`}
            >
              <span className="chamber-ord">{option.label}</span>
              <span className="chamber-year">{option.year}</span>
            </button>
          ))}
        </div>
        <BlocChamber chamber={chamber} />

        <p className="hint">
          {chamber.note}.
          {chamber.projected && (
            <>
              {" "}
              These seats are a hand-entered snapshot of published polling averages — not a
              result, not a live feed, and not a forecast. Treat them as a plausible board, and
              edit them in <code>src/engine/parties.ts</code> when they go stale.
            </>
          )}
        </p>

        {/* What the country actually did with this board, which is the only
            benchmark the game has: you are being asked to beat it. */}
        {chamber.outcome && (
          <p className={`outcome ${chamber.outcome.premier ? "" : "hung"}`}>
            <span
              className="outcome-dot"
              style={{ background: formed ? BLOC_COLOUR[formed.bloc] : undefined }}
            />
            <span className="outcome-text">
              {formed && chamber.outcome.premier ? (
                <>
                  <strong>
                    {chamber.outcome.premier} ({formed.name}, {formed.baseSeats})
                  </strong>{" "}
                  formed the government. {chamber.outcome.note}
                </>
              ) : (
                <>
                  <strong>Nobody formed a government.</strong> {chamber.outcome.note}
                </>
              )}
            </span>
          </p>
        )}
      </div>

      <div className="setup-block">
        <div className="setup-label">Lead which party</div>
        <div className="pick-grid">
          {ranked.map((profile) => (
            <button
              key={profile.key}
              className={`pick ${leading === profile.key ? "on" : ""}`}
              onClick={() => setParty(profile.key)}
            >
              <span className="pick-seats" style={{ "--bloc": BLOC_COLOUR[profile.bloc] } as CSSProperties}>
                {profile.baseSeats}
              </span>
              <span className="pick-body">
                <span className="pick-name">{profile.name}</span>
                <span className="pick-bloc" style={{ color: BLOC_COLOUR[profile.bloc] }}>
                  {BLOC_LABEL[profile.bloc]}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* Reads out of a table keyed by party rather than by chamber, so the
            same note follows Likud across all fourteen of the Knessets it has
            contested. It says what the list was, not how this particular
            election went — that is the outcome line further up the screen. */}
        {leadingHistory && (
          <div className="party-note" aria-live="polite">
            <div className="party-note-head">
              <span className="party-note-name">{leadingProfile.name}</span>
              <span
                className="party-note-bloc"
                style={{ color: BLOC_COLOUR[leadingProfile.bloc] }}
              >
                {BLOC_LABEL[leadingProfile.bloc]} · {leadingProfile.baseSeats} seats
              </span>
            </div>
            <p>{leadingHistory}</p>
          </div>
        )}
      </div>

      <div className="setup-block">
        <div className="setup-label">Opponents</div>
        <div className="row">
          {BOT_SETS.map((option, index) => (
            <button
              key={option.label}
              className={`pick slim ${botSet === index ? "on" : ""}`}
              onClick={() => setBotSet(index)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="hint">
          {BOT_SETS[botSet].note}. Rivals take the largest parties you left behind, and a party
          somebody leads is never for sale — so every extra rival takes seats off the market faster
          than it adds a contender.
        </p>
      </div>

      <div className="commit-row">
        <button
          className="commit"
          onClick={() =>
            onStart({
              humanParty: leading,
              bots: BOT_SETS[botSet].bots,
              seed: seed ? Number(seed) : undefined,
              chamber: chamberId,
            })
          }
        >
          Start the campaign
        </button>
        <input
          className="seed"
          placeholder="seed"
          value={seed}
          onChange={(event) => setSeed(event.target.value.replace(/[^0-9]/g, ""))}
        />
        <span className="need">first to {YEARS_TO_WIN} years in power</span>
      </div>

      {unlocked.size > 0 && (
        <div className="setup-block">
          <div className="setup-label">Trophies</div>
          <AchievementStrip unlocked={unlocked} />
        </div>
      )}
    </div>
  );
};
