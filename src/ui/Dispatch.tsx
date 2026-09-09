import type { GameState } from "../engine/types";
import { valueOf } from "../engine/types";
import { playerColour, playerName } from "./format";

/**
 * What just happened, kept on screen while you decide what to do about it.
 *
 * The reveal is a modal: it interrupts, it is read once, and then it is gone —
 * which is the wrong shape for the thing you are reasoning against while you
 * place the next offer. So the same turn is also written down here, in the
 * margin, and stays there for as long as it is the most recent news.
 *
 * An election outranks a turn. The week a government falls, what matters is not
 * who bid what for the Shas — it is that the chamber underneath the whole board
 * has been redrawn, so the panel reports the vote instead and the bidding
 * digest waits until there is a bid worth digesting.
 */

interface Props {
  state: GameState;
  /** Reopen the full report for whichever of the two is being shown. */
  onOpen: (kind: "turn" | "election") => void;
}

export const Dispatch = ({ state, onOpen }: Props) => {
  const turn = state.lastTurn;
  const vote = state.lastElection;
  // The election is the news only on the turn it happened; after that the
  // bidding is again the most recent thing to have happened.
  const voted = vote !== null && vote.turn === turn?.turn;

  const partyName = (key: string): string => state.parties[key]?.name ?? key;

  if (!turn && !voted) {
    return (
      <aside className="dispatch">
        <div className="dispatch-tag">The week ahead</div>
        <p className="dispatch-empty">
          Nothing has happened yet. Put a portfolio on a table and end the week.
        </p>
      </aside>
    );
  }

  if (voted && vote) {
    const swung = [...vote.standings]
      .map((standing) => ({ ...standing, swing: standing.after - standing.before }))
      .sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing));
    const out = vote.standings.filter((standing) => standing.after === 0);

    return (
      <aside className="dispatch">
        <div className="dispatch-tag vote">The country voted</div>

        {vote.ballot.length > 0 && (
          <div className="dispatch-block">
            <h4>The ballot changed</h4>
            {vote.ballot.map((change, index) => (
              <div key={`${change.key}-${index}`} className="dispatch-line">
                {change.kind === "union" && (
                  <>
                    <b>{change.parts.map((part) => part.name).join(" + ")}</b> run together as{" "}
                    {change.name}, {change.seats} on one ticket.
                  </>
                )}
                {change.kind === "breakaway" && (
                  <>
                    <b>{change.seats} walk out of {change.parentName}</b> and register as{" "}
                    {change.name}.
                  </>
                )}
                {change.kind === "wound-up" && (
                  <>
                    <b>{change.name} winds up.</b> Its {change.seats} go to {change.heirName}.
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="dispatch-block">
          <h4>The biggest moves</h4>
          {swung.slice(0, 4).map((standing) => (
            <div key={standing.partyKey} className="dispatch-swing">
              <span className="dispatch-swing-name">{standing.name}</span>
              <span className="dispatch-swing-seats">
                {standing.before} → {standing.after}
              </span>
              {/* The sign is spelled out, never left to the colour alone. */}
              <span
                className={`dispatch-swing-delta ${
                  standing.swing > 0 ? "up" : standing.swing < 0 ? "down" : "flat"
                }`}
              >
                {standing.swing > 0
                  ? `+${standing.swing}`
                  : standing.swing < 0
                    ? `−${Math.abs(standing.swing)}`
                    : "—"}
              </span>
            </div>
          ))}
        </div>

        {out.length > 0 && (
          <div className="dispatch-block">
            <h4>Out of the chamber</h4>
            <div className="dispatch-line muted">
              {out.map((standing) => standing.name).join(", ")} — below the threshold, and gone
              for good.
            </div>
          </div>
        )}

        <button className="ghost dispatch-more" onClick={() => onOpen("election")}>
          The full result
        </button>
      </aside>
    );
  }

  if (!turn) return null;

  const moved = turn.parties.filter((party) => party.newHolder !== party.previousHolder);
  const quiet = moved.length === 0 && turn.withdrawals.length === 0 && turn.cards.length === 0;

  return (
    <aside className="dispatch">
      <div className="dispatch-tag">
        {state.phase === "forming" ? "The week just gone" : "The year just gone"}
      </div>

      {quiet && <p className="dispatch-empty">Nobody moved. A wasted turn all round.</p>}

      {turn.withdrawals.length > 0 && (
        <div className="dispatch-block">
          <h4>Walked away</h4>
          {turn.withdrawals.map((withdrawal) => (
            <div key={`${withdrawal.playerKey}-${withdrawal.partyKey}`} className="dispatch-line">
              <b style={{ color: playerColour(state, withdrawal.playerKey) }}>
                {playerName(state, withdrawal.playerKey)}
              </b>{" "}
              drops {partyName(withdrawal.partyKey)}, taking back{" "}
              {valueOf(state, withdrawal.ministries)}bn.
            </div>
          ))}
        </div>
      )}

      {moved.length > 0 && (
        <div className="dispatch-block">
          <h4>Changed hands</h4>
          {moved.map((party) => (
            <div key={party.partyKey} className="dispatch-move">
              <span className="dispatch-move-seats">{party.seats}</span>
              <span className="dispatch-move-body">
                <span className="dispatch-move-name">{partyName(party.partyKey)}</span>
                <span className="dispatch-move-to">
                  <span style={{ color: playerColour(state, party.previousHolder) }}>
                    {party.previousHolder ? playerName(state, party.previousHolder) : "unaligned"}
                  </span>{" "}
                  →{" "}
                  <span style={{ color: playerColour(state, party.newHolder) }}>
                    {party.newHolder ? playerName(state, party.newHolder) : "unaligned"}
                  </span>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {turn.cards.length > 0 && (
        <div className="dispatch-block">
          <h4>In the news</h4>
          {turn.cards.map((card) => (
            <div key={card.title} className="dispatch-card">
              <div className="dispatch-card-title">{card.title}</div>
              <div className="dispatch-line muted">{card.text}</div>
            </div>
          ))}
        </div>
      )}

      <button className="ghost dispatch-more" onClick={() => onOpen("turn")}>
        The full reveal
      </button>

      {/* An election earlier in the campaign is still worth being able to reach. */}
      {vote && (
        <button className="ghost dispatch-back" onClick={() => onOpen("election")}>
          {vote.parliament === state.parliament
            ? "How this Knesset was elected"
            : "The last election"}
        </button>
      )}
    </aside>
  );
};
