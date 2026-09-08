import { baseLoyalty } from "../engine/negotiation";
import type { GameState } from "../engine/types";
import { coalitionSeats, daysLeft } from "../engine/types";
import { loyaltyLabel, partyColour, tone } from "./format";

interface Props {
  state: GameState;
  onRestart: () => void;
}

/** The chamber drawn as a single bar, coalition members lit up. */
const Chamber = ({ state }: { state: GameState }) => {
  const parties = Object.values(state.parliament.parties).sort(
    (a, b) => a.ideology.economy - b.ideology.economy,
  );
  const majorityFraction = state.parliament.majority / state.parliament.totalSeats;

  return (
    <>
      <div className="chamber">
        {parties.map((party) => {
          const inCoalition = state.coalition.members.includes(party.key);
          const classes = ["chamber-block"];
          if (inCoalition) classes.push("in");
          if (party.key === state.playerKey) classes.push("player");
          return (
            <div
              key={party.key}
              className={classes.join(" ")}
              style={{
                flexGrow: party.seats,
                background: partyColour(party.ideology),
              }}
              title={`${party.name} — ${party.seats} seats${inCoalition ? " (in coalition)" : ""}`}
            />
          );
        })}
      </div>
      <div className="majority-line">
        <span style={{ left: `${majorityFraction * 100}%` }}>
          {state.parliament.majority} for a majority
        </span>
      </div>
    </>
  );
};

export const Header = ({ state, onRestart }: Props) => {
  const seats = coalitionSeats(state);
  const loyalty = baseLoyalty(state);
  const player = state.parliament.parties[state.playerKey];
  const remaining = daysLeft(state);

  return (
    <header className="topbar">
      <div className="topbar-row">
        <div>
          <h1>{state.parliament.name}</h1>
          <div className="sub">
            {player.leader} · {player.name} · seed {state.seed}
          </div>
        </div>

        <div className="stats">
          <div className={`stat ${tone(remaining, 7, 3)}`}>
            <div className="value">{remaining}</div>
            <div className="label">days left</div>
          </div>
          <div className={`stat ${seats >= state.parliament.majority ? "" : "warn"}`}>
            <div className="value">
              {seats}
              <span style={{ color: "var(--muted)", fontSize: 14 }}>/{state.parliament.majority}</span>
            </div>
            <div className="label">seats pledged</div>
          </div>
          <div className={`stat ${tone(loyalty, 40, 20)}`}>
            <div className="value">{Math.round(loyalty)}</div>
            <div className="label">own party: {loyaltyLabel(loyalty)}</div>
          </div>
          <button onClick={onRestart}>New game</button>
        </div>
      </div>

      <Chamber state={state} />
    </header>
  );
};
