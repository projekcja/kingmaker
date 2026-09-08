import type { Action } from "../engine/actions";
import { expectedMonths, signingProblems, stabilityScore } from "../engine/negotiation";
import type { GameState } from "../engine/types";
import { coalitionSeats, optionLabel } from "../engine/types";
import { partyColour, tone } from "./format";

interface Props {
  state: GameState;
  onAction: (action: Action) => void;
}

export const AgreementPanel = ({ state, onAction }: Props) => {
  const problems = signingProblems(state);
  const seats = coalitionSeats(state);
  const stability = Math.round(stabilityScore(state));
  const assigned = Object.entries(state.coalition.portfolios).sort(
    (a, b) =>
      state.parliament.portfolios[b[0]].prestige - state.parliament.portfolios[a[0]].prestige,
  );
  const commitments = Object.entries(state.coalition.commitments);
  const unassigned = Object.values(state.parliament.portfolios).filter(
    (portfolio) => state.coalition.portfolios[portfolio.key] === undefined,
  );

  return (
    <section className="panel">
      <header>
        <h2>The agreement</h2>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>{seats} seats</span>
      </header>

      <div className="panel-body">
        <div className="section-title" style={{ marginBottom: 6 }}>
          Cabinet as it stands
        </div>
        <table className="table">
          <tbody>
            {assigned.map(([portfolioKey, partyKey]) => (
              <tr key={portfolioKey}>
                <td>{state.parliament.portfolios[portfolioKey].name}</td>
                <td style={{ color: partyColour(state.parliament.parties[partyKey].ideology) }}>
                  {state.parliament.parties[partyKey].name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 0 }}>
          {unassigned.length} ministries still unallocated.
        </p>
      </div>

      {commitments.length > 0 && (
        <div className="section">
          <div className="section-title">Positions written in</div>
          <table className="table">
            <tbody>
              {commitments.map(([issueKey, position]) => (
                <tr key={issueKey}>
                  <td>{state.parliament.issues[issueKey].name}</td>
                  <td>{optionLabel(state.parliament.issues[issueKey], position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section">
        <div className="section-title">If you signed today</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Projected stability</span>
          <span>
            {stability}/100 · about {expectedMonths(state)} months
          </span>
        </div>
        <div className={`meter ${tone(stability, 55, 35)}`}>
          <span style={{ width: `${stability}%` }} />
        </div>

        {problems.length > 0 ? (
          <ul className="problems">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#8fd0a4", fontSize: 12.5, marginBottom: 0 }}>
            Every partner would sign this today.
          </p>
        )}

        <div className="actions" style={{ marginTop: 12 }}>
          <button
            className="primary"
            disabled={problems.length > 0}
            onClick={() => onAction({ type: "sign" })}
          >
            Present the government
          </button>
        </div>
      </div>
    </section>
  );
};
