import { LAWS } from "../engine/laws";
import type { GameState } from "../engine/types";
import { statuteSummary } from "../engine/laws";

/**
 * The order paper: three bills, and the option of doing nothing.
 *
 * The one place in the game where a player acts on the board rather than on
 * the auction, so it is drawn as a decision and not as a status line. Passing
 * nothing is a button of the same size as the other three, because it is a real
 * choice — a government whose coalition is held together by a haredi party
 * should decline the Conscription Law, and that is a play, not an abstention.
 *
 * It rides on the same commit as the bids: the whole turn goes in one envelope,
 * so the choice made here is not final until the week is ended.
 */

interface Props {
  state: GameState;
  /** The law currently pencilled in, or null for passing nothing. */
  chosen: string | null;
  onChoose: (lawId: string | null) => void;
  /** False when this seat is not the prime minister's. */
  yours: boolean;
}

const KIND_LABEL: Record<string, string> = {
  ballot: "the ballot",
  mood: "your partners",
  cabinet: "the cabinet",
};

export const Bill = ({ state, chosen, onChoose, yours }: Props) => {
  const bill = state.bill;
  const standing = statuteSummary(state);

  // The statutes in force are worth showing even to somebody who cannot
  // legislate: they are the reason the next election will not go the way the
  // seat counts suggest, and they belong to whoever is reading the board.
  const inForce = standing.length > 0 && (
    <div className="bill-force">
      <span className="bill-force-label">In force</span>
      {standing.map((entry) => (
        <span
          key={entry.bloc}
          className={`bill-force-item ${entry.factor > 1 ? "up" : "down"}`}
          title={`${entry.label} lists poll ${Math.abs(Math.round((entry.factor - 1) * 100))}% ${entry.factor > 1 ? "better" : "worse"} while the statutes stand`}
        >
          {entry.label} {entry.factor > 1 ? "+" : "−"}
          {Math.abs(Math.round((entry.factor - 1) * 100))}%
        </span>
      ))}
    </div>
  );

  if (!bill || bill.options.length === 0) {
    return standing.length > 0 ? <div className="bill">{inForce}</div> : null;
  }

  if (!yours) {
    return (
      <div className="bill">
        <div className="bill-head">
          <span className="bill-title">The order paper</span>
          <span className="bill-note">the government's to move, not yours</span>
        </div>
        {inForce}
      </div>
    );
  }

  return (
    <div className="bill">
      <div className="bill-head">
        <span className="bill-title">The order paper</span>
        <span className="bill-note">one act of legislation this year</span>
      </div>

      <div className="bill-options" role="radiogroup" aria-label="This year's legislation">
        {bill.options.map((id) => {
          const law = LAWS.find((entry) => entry.id === id);
          if (!law) return null;
          return (
            <button
              key={id}
              role="radio"
              aria-checked={chosen === id}
              className={`bill-option ${chosen === id ? "on" : ""}`}
              data-kind={law.kind}
              onClick={() => onChoose(chosen === id ? null : id)}
            >
              <span className="bill-option-head">
                <span className="bill-option-title">{law.title}</span>
                <span className="bill-option-kind">acts on {KIND_LABEL[law.kind]}</span>
              </span>
              <span className="bill-option-effect">{law.effect}</span>
            </button>
          );
        })}

        {/* The same size as the bills, because it is the same kind of move. */}
        <button
          role="radio"
          aria-checked={chosen === null}
          className={`bill-option none ${chosen === null ? "on" : ""}`}
          onClick={() => onChoose(null)}
        >
          <span className="bill-option-head">
            <span className="bill-option-title">Pass nothing</span>
            <span className="bill-option-kind">no bill this year</span>
          </span>
          <span className="bill-option-effect">
            The year is spent holding the coalition together and nothing is put to the house.
            Often the right answer, and never the one that reads well.
          </span>
        </button>
      </div>

      {inForce}
    </div>
  );
};
