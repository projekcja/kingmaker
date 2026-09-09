import type { GameState, PartyResult, TurnResult } from "../engine/types";
import { ministryByKey, valueOf } from "../engine/types";
import { Emblem } from "./Emblem";
import { playerColour, playerName } from "./format";

interface Props {
  state: GameState;
  result: TurnResult;
  onClose: () => void;
}

const partyName = (state: GameState, key: string): string => state.parties[key]?.name ?? key;

/** Portfolios written out, because "22bn" does not tell you what was spent. */
const portfolios = (state: GameState, keys: readonly string[]): string =>
  keys.map((key) => ministryByKey(state, key)?.name ?? key).join(", ");

/**
 * The seat count a party had when the offers were opened.
 *
 * The board has already moved on by the time this renders — a card may have
 * split the party since — so the number quoted is the one the bidding was for.
 */
const seatsOf = (result: TurnResult, state: GameState, partyKey: string): number =>
  result.parties.find((party) => party.partyKey === partyKey)?.seats ??
  state.parties[partyKey]?.seats ??
  0;

/**
 * What the sealed bids turned out to be.
 *
 * Three questions, in the order a player asks them: who moved, what did it cost
 * them, and what did everybody actually put on the table. The last one is the
 * point of a sealed auction — you only ever learn a rival's hand here, and only
 * for the parties they chose to court.
 */
export const Reveal = ({ state, result, onClose }: Props) => {
  // Every party somebody actually did something about. A holder standing pat is
  // in `bids` without being in `offered`, which is not a move and not news.
  const contested = result.parties.filter(
    (party) =>
      Object.keys(party.offered).length > 0 ||
      party.newHolder !== party.previousHolder ||
      party.blocked.length > 0,
  );

  const moved = result.parties.filter((party) => party.newHolder !== party.previousHolder);
  const nothingHappened =
    moved.length === 0 && contested.length === 0 && result.withdrawals.length === 0;

  // Net mandates each player gained or gave up this turn, which is the only
  // number that decides anything. Withdrawals count against the player who
  // walked; a party they then lost to a rival counts for the rival too.
  const swing: Record<string, number> = {};
  const shift = (playerKey: string | null, mandates: number) => {
    if (!playerKey) return;
    swing[playerKey] = (swing[playerKey] ?? 0) + mandates;
  };
  for (const withdrawal of result.withdrawals) {
    shift(withdrawal.playerKey, -seatsOf(result, state, withdrawal.partyKey));
  }
  for (const party of moved) {
    shift(party.previousHolder, -party.seats);
    shift(party.newHolder, party.seats);
  }
  const swings = Object.entries(swing).filter(([, mandates]) => mandates !== 0);

  const bidders = (party: PartyResult): string[] => [
    ...new Set([...Object.keys(party.offered), ...Object.keys(party.bids)]),
  ];

  return (
    <div className="reveal-backdrop" onClick={onClose}>
      <div className="reveal" onClick={(event) => event.stopPropagation()}>
        {/* The bids were sealed until this panel opened; the seal says so. */}
        <div className="reveal-head">
          <span className="reveal-seal">
            <Emblem />
          </span>
          <h2>The offers are opened</h2>
        </div>

        {nothingHappened && (
          <p className="muted">Nobody bid for anything. A wasted turn all round.</p>
        )}

        {result.withdrawals.length > 0 && (
          <section className="rev-block">
            <h3>Walked away</h3>
            {result.withdrawals.map((withdrawal) => (
              <div key={`${withdrawal.playerKey}-${withdrawal.partyKey}`} className="rev-line">
                <span style={{ color: playerColour(state, withdrawal.playerKey) }}>
                  {playerName(state, withdrawal.playerKey)}
                </span>{" "}
                pulls out of the {partyName(state, withdrawal.partyKey)}, taking back{" "}
                {portfolios(state, withdrawal.ministries) || "nothing"}
                {withdrawal.ministries.length > 0 && (
                  <span className="rev-cost"> {valueOf(state, withdrawal.ministries)}bn</span>
                )}
              </div>
            ))}
          </section>
        )}

        <section className="rev-block">
          <h3>Changed hands</h3>
          {moved.length === 0 ? (
            <p className="muted">Not one party moved. Everybody sits where they sat.</p>
          ) : (
            moved.map((party) => (
              <div key={party.partyKey} className="rev-move">
                <span className="rev-seats">{party.seats}</span>
                <span className="rev-party">{partyName(state, party.partyKey)}</span>
                <span className="rev-arrow">
                  <span style={{ color: playerColour(state, party.previousHolder) }}>
                    {party.previousHolder ? playerName(state, party.previousHolder) : "unaligned"}
                  </span>
                  {" → "}
                  <strong style={{ color: playerColour(state, party.newHolder) }}>
                    {party.newHolder ? playerName(state, party.newHolder) : "unaligned"}
                  </strong>
                </span>
                <span className="rev-cost">
                  {party.newHolder ? `${party.bids[party.newHolder] ?? 0}bn` : "—"}
                </span>
              </div>
            ))
          )}
          {swings.length > 0 && (
            <div className="rev-swing">
              {swings.map(([playerKey, mandates]) => (
                <span key={playerKey} style={{ color: playerColour(state, playerKey) }}>
                  {playerName(state, playerKey)} {mandates > 0 ? `+${mandates}` : mandates}
                </span>
              ))}
            </div>
          )}
        </section>

        {contested.length > 0 && (
          <section className="rev-block">
            <h3>On the tables</h3>
            {contested.map((party) => (
              <div key={party.partyKey} className="rev-table">
                <div className="rev-table-head">
                  <span className="rev-seats">{party.seats}</span>
                  {partyName(state, party.partyKey)}
                </div>
                {bidders(party).map((playerKey) => {
                  const put = party.offered[playerKey] ?? [];
                  const refused = party.blocked.includes(playerKey);
                  const won = playerKey === party.newHolder;
                  const held = playerKey === party.previousHolder;
                  return (
                    <div
                      key={playerKey}
                      className={`rev-bid ${won ? "won" : ""} ${refused ? "refused" : ""}`}
                    >
                      <span className="rev-who" style={{ color: playerColour(state, playerKey) }}>
                        {playerName(state, playerKey)}
                      </span>
                      <span className="rev-what">
                        {put.length > 0 ? portfolios(state, put) : "stood pat"}
                        {held && put.length > 0 && <span className="rev-note"> on top</span>}
                      </span>
                      <span className="rev-cost">
                        {refused ? "red line" : `${party.bids[playerKey] ?? valueOf(state, put)}bn`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
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
