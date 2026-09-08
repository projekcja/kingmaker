import type { GameState, TurnResult } from "../engine/types";
import { playerColour, playerName } from "./format";

interface Props {
  state: GameState;
  result: TurnResult;
  onClose: () => void;
}

/**
 * What the sealed bids turned out to be.
 *
 * Only contested or changed parties are worth showing — a board of eight
 * unchanged rows tells the player nothing.
 */
export const Reveal = ({ state, result, onClose }: Props) => {
  const interesting = result.parties.filter(
    (party) =>
      Object.keys(party.bids).length > 0 ||
      party.newHolder !== party.previousHolder ||
      party.blocked.length > 0,
  );

  return (
    <div className="reveal-backdrop" onClick={onClose}>
      <div className="reveal" onClick={(event) => event.stopPropagation()}>
        <h2>The offers are opened</h2>

        {interesting.length === 0 ? (
          <p className="muted">Nobody bid for anything. A wasted turn all round.</p>
        ) : (
          <table className="reveal-table">
            <tbody>
              {interesting.map((party) => {
                const name = state.parties[party.partyKey]?.name ?? party.partyKey;
                const changed = party.newHolder !== party.previousHolder;
                return (
                  <tr key={party.partyKey} className={changed ? "changed" : ""}>
                    <td className="r-name">{name}</td>
                    <td className="r-bids">
                      {Object.entries(party.bids)
                        .sort((a, b) => b[1] - a[1])
                        .map(([playerKey, value]) => (
                          <span
                            key={playerKey}
                            className={`r-bid ${playerKey === party.newHolder ? "won" : ""}`}
                            style={{ color: playerColour(state, playerKey) }}
                          >
                            {playerName(state, playerKey)} {value}bn
                          </span>
                        ))}
                      {party.blocked.map((playerKey) => (
                        <span key={`b-${playerKey}`} className="r-bid blocked">
                          {playerName(state, playerKey)} refused
                        </span>
                      ))}
                    </td>
                    <td className="r-to" style={{ color: playerColour(state, party.newHolder) }}>
                      {party.newHolder ? playerName(state, party.newHolder) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {result.cards.length > 0 && (
          <div className="cards">
            {result.cards.map((card, index) => (
              <div key={`${card.playerKey}-${index}`} className="card">
                <div className="card-who" style={{ color: playerColour(state, card.playerKey) }}>
                  {playerName(state, card.playerKey)} draws
                </div>
                <div className="card-title">{card.title}</div>
                <div className="card-text">{card.text}</div>
              </div>
            ))}
          </div>
        )}

        <button className="commit" onClick={onClose}>
          Carry on
        </button>
      </div>
    </div>
  );
};
