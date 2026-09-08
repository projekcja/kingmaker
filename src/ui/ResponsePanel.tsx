import type { Action } from "../engine/actions";
import {
  askingPrice,
  evaluate,
  TEMPERATURE_TEXT,
  temperature,
} from "../engine/negotiation";
import type { GameState } from "../engine/types";
import { optionLabel } from "../engine/types";
import { partyColour, priceBand } from "./format";

interface Props {
  state: GameState;
  onAction: (action: Action) => void;
}

/**
 * Shown to the player holding a party's seat when a package is tabled with them.
 *
 * They get their own numbers — what the deal is worth, what their party is
 * asking — and then decide. The engine's verdict is advice here, not a ruling:
 * accepting a bad offer or refusing a good one is allowed, and recorded.
 */
export const ResponsePanel = ({ state, onAction }: Props) => {
  const pending = state.pending;
  if (!pending) return null;

  const party = state.parliament.parties[pending.offer.partyKey];
  const formateur = state.parliament.parties[state.playerKey];
  const evaluation = evaluate(state, pending.offer);
  const band = temperature(evaluation);
  const commitments = { ...state.coalition.commitments, ...pending.offer.commitments };

  return (
    <section className="panel negotiation">
      <div className="panel-body">
        <div className="section-title">On the table</div>
        <h3 style={{ color: partyColour(party.ideology) }}>{party.name}</h3>
        <div className="leader">
          {formateur.leader} of the {formateur.name} has made you an offer. Nothing moves until you
          answer.
        </div>
      </div>

      <div className="section">
        <div className="section-title">Ministries offered</div>
        {pending.offer.portfolios.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 12.5 }}>
            Not a single ministry.
          </p>
        ) : (
          <div className="party-meta">
            {pending.offer.portfolios.map((key) => (
              <span key={key} className="chip gold">
                {state.parliament.portfolios[key].name}
                <span className="prestige"> {state.parliament.portfolios[key].prestige}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">The agreement you would be signing</div>
        {Object.keys(commitments).length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 12.5 }}>
            No positions written in yet.
          </p>
        ) : (
          <table className="table">
            <tbody>
              {Object.entries(commitments).map(([issueKey, position]) => {
                const issue = state.parliament.issues[issueKey];
                const fresh = pending.offer.commitments[issueKey] !== undefined;
                return (
                  <tr key={issueKey}>
                    <td>
                      {issue.name}
                      {fresh && (
                        <span className="chip gold" style={{ marginLeft: 8 }}>
                          new
                        </span>
                      )}
                    </td>
                    <td>{optionLabel(issue, position)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="section">
        <div className="section-title">Your own read</div>
        <div className={`verdict ${band}`}>
          {TEMPERATURE_TEXT[band]}
          {evaluation.complaints.length > 0 && (
            <ul className="quotes">
              {evaluation.complaints.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 0 }}>
          Your people were asking {priceBand(askingPrice(state, party))}. The decision is yours, not
          the arithmetic's.
        </p>
      </div>

      <div className="panel-body">
        <div className="actions">
          <button className="primary" onClick={() => onAction({ type: "respond", accept: true })}>
            Accept and join
          </button>
          <button className="danger" onClick={() => onAction({ type: "respond", accept: false })}>
            Turn it down
          </button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Answering ends two days of negotiation, whichever way you go.
        </p>
      </div>
    </section>
  );
};
