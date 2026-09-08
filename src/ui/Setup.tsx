import { useState } from "react";

import { PARTY_PROFILES } from "../engine/parties";
import type { PlayerKind } from "../engine/types";
import { YEARS_TO_WIN } from "../engine/types";
import { BLOC_COLOUR } from "./format";
import { BLOC_LABEL } from "../engine/parties";

interface Props {
  onStart: (options: { humanParty: string; bots: PlayerKind[]; seed?: number }) => void;
}

const BOT_SETS: Array<{ label: string; bots: PlayerKind[]; note: string }> = [
  { label: "One rival", bots: ["greedy"], note: "a rival who plays to win" },
  { label: "One weak rival", bots: ["random"], note: "a rival with no plan at all" },
  { label: "Two rivals", bots: ["greedy", "random"], note: "crowded — three parties come off the market" },
];

export const Setup = ({ onStart }: Props) => {
  const ranked = [...PARTY_PROFILES].sort((a, b) => b.baseSeats - a.baseSeats);
  const [party, setParty] = useState(ranked[0].key);
  const [botSet, setBotSet] = useState(0);
  const [seed, setSeed] = useState("");

  return (
    <div className="setup">
      <h1>Kingmaker</h1>
      <p className="lede">
        Sixty-one mandates buys you a government. Ten years in office wins the whole thing.
        Every week you hand out eighteen ministries, everyone bids at once, and each party
        goes to whoever offered most.
      </p>

      <div className="setup-block">
        <div className="setup-label">Lead which party</div>
        <div className="pick-grid">
          {ranked.map((profile) => (
            <button
              key={profile.key}
              className={`pick ${party === profile.key ? "on" : ""}`}
              onClick={() => setParty(profile.key)}
            >
              <span className="pick-seats">{profile.baseSeats}</span>
              <span className="pick-name">{profile.name}</span>
              <span className="pick-bloc" style={{ color: BLOC_COLOUR[profile.bloc] }}>
                {BLOC_LABEL[profile.bloc]}
              </span>
            </button>
          ))}
        </div>
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
              humanParty: party,
              bots: BOT_SETS[botSet].bots,
              seed: seed ? Number(seed) : undefined,
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
    </div>
  );
};
