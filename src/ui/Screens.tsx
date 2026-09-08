import { expectedMonths, stabilityScore } from "../engine/negotiation";
import type { GameState, Outcome } from "../engine/types";
import { coalitionSeats } from "../engine/types";
import { partyColour } from "./format";

const OUTCOME_TITLE: Record<Outcome, string> = {
  government: "You have a government",
  expired: "The mandate expires",
  deposed: "You are removed",
  collapsed: "The coalition collapses",
};

interface EndProps {
  state: GameState;
  onRestart: () => void;
  onReplay: () => void;
}

export const EndScreen = ({ state, onRestart, onReplay }: EndProps) => {
  const outcome = state.outcome ?? "expired";
  const player = state.parliament.parties[state.playerKey];
  const won = outcome === "government";

  return (
    <div className="screen">
      <div className={`outcome-tag ${outcome}`}>day {Math.min(state.day, state.daysTotal)} of {state.daysTotal}</div>
      <h1>{OUTCOME_TITLE[outcome]}</h1>

      <p className="epilogue">{state.epilogue}</p>

      {won && (
        <>
          <table className="table" style={{ maxWidth: 420 }}>
            <tbody>
              <tr>
                <td>Coalition</td>
                <td>
                  {state.coalition.members.length} parties, {coalitionSeats(state)} seats
                </td>
              </tr>
              <tr>
                <td>Stability</td>
                <td>{Math.round(stabilityScore(state))}/100</td>
              </tr>
              <tr>
                <td>Expected life</td>
                <td>{expectedMonths(state)} months</td>
              </tr>
              <tr>
                <td>Days used</td>
                <td>{Math.min(state.day, state.daysTotal)}</td>
              </tr>
            </tbody>
          </table>

          <div className="party-meta" style={{ marginTop: 14 }}>
            {state.coalition.members.map((key) => (
              <span
                key={key}
                className="chip"
                style={{ color: partyColour(state.parliament.parties[key].ideology) }}
              >
                {state.parliament.parties[key].name} · {state.parliament.parties[key].seats}
              </span>
            ))}
          </div>
        </>
      )}

      {!won && (
        <p>
          The {player.name} goes into the next campaign with your name on the poster and this
          fortnight in everyone's memory.
        </p>
      )}

      <div className="seed-row">
        <button className="primary" onClick={onRestart}>
          New parliament
        </button>
        <button onClick={onReplay}>Replay seed {state.seed}</button>
      </div>
    </div>
  );
};
