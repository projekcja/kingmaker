import { Fragment } from "react";
import type { CSSProperties } from "react";

import type { BallotChange, ElectionResult, GameState, Standing } from "../engine/types";
import { ordinal } from "../engine/campaign";
import { Emblem } from "./Emblem";
import { BLOC_COLOUR, playerColour, playerName } from "./format";

/**
 * Election night.
 *
 * An election is two separate events and the reveal has to keep them apart. The
 * ballot rearranges first — lists merge, split and fold — and only then does the
 * country vote on whatever ended up on the paper. So the rearrangement is
 * reported as its own thing, and the swing underneath it is the vote alone,
 * measured against what each list actually stood on. Folded together, a joint
 * ticket reads as a landslide and a breakaway as a collapse.
 */

interface Props {
  state: GameState;
  result: ElectionResult;
  onClose: () => void;
}

const KIND_LABEL: Record<BallotChange["kind"], string> = {
  union: "Joint ticket",
  breakaway: "Breakaway",
  "wound-up": "Wound up",
};

/** What one rearrangement did, in the arithmetic rather than in prose. */
const BallotCard = ({ state, change }: { state: GameState; change: BallotChange }) => {
  const cost =
    change.kind === "breakaway" ? null : change.costTo;

  return (
    <div className={`ballot-card ${change.kind}`}>
      <div className="ballot-kind">{KIND_LABEL[change.kind]}</div>

      {change.kind === "union" && (
        <div className="ballot-sum">
          {change.parts.map((part, index) => (
            <Fragment key={part.key}>
              {/* The operator is a sibling of the two parts, not a child of one,
                  or the row's gap never falls either side of it. */}
              {index > 0 && <span className="ballot-op">+</span>}
              <span className="ballot-part">
                <b>{part.seats}</b> {part.name}
              </span>
            </Fragment>
          ))}
          <span className="ballot-op">→</span>
          <span className="ballot-part out">
            <b>{change.seats}</b> {change.name}
          </span>
        </div>
      )}

      {change.kind === "breakaway" && (
        <div className="ballot-sum">
          <span className="ballot-part">
            <b>{change.seats}</b> walk out of {change.parentName}
          </span>
          <span className="ballot-op">→</span>
          <span className="ballot-part out fresh">
            <b>{change.seats}</b> {change.name}
          </span>
          <span className="ballot-note">
            {change.parentName} goes in on {change.parentSeats}
          </span>
        </div>
      )}

      {change.kind === "wound-up" && (
        <div className="ballot-sum">
          <span className="ballot-part gone">
            <b>{change.seats}</b> {change.name}
          </span>
          <span className="ballot-op">→</span>
          <span className="ballot-part out">{change.heirName}</span>
        </div>
      )}

      {cost && (
        <div className="ballot-cost" style={{ color: playerColour(state, cost) }}>
          {playerName(state, cost)} loses the deal, and the portfolios come home.
        </div>
      )}
    </div>
  );
};

/**
 * One list's night, as a bar either side of where it started.
 *
 * The bar is a diverging one — gained to the right of the line, lost to the
 * left — and gain and loss are the game's good/bad pair. Those two are only
 * seven units apart under deuteranopia, so the sign is never carried by the
 * colour alone: every row is direct-labelled with a signed number, and which
 * side of the centre line the bar falls on says the same thing again.
 */
const SwingRow = ({
  state,
  standing,
  scale,
}: {
  state: GameState;
  standing: Standing;
  scale: number;
}) => {
  const swing = standing.after - standing.before;
  const out = standing.after === 0;
  // Written the same way everywhere it appears, including the tooltip: a minus
  // sign, not a hyphen, and a dash rather than "+0" for a list that held.
  const signed = swing > 0 ? `+${swing}` : swing < 0 ? `−${Math.abs(swing)}` : "—";
  // Half the track is one direction, so a bar can never be more than half wide.
  const width = scale === 0 ? 0 : (Math.abs(swing) / scale) * 50;

  return (
    <div className={`swing ${out ? "out" : ""}`}>
      <span className="swing-seats">{standing.after}</span>
      <span className="swing-name">
        <span className="swing-dot" style={{ background: BLOC_COLOUR[standing.bloc] }} />
        {standing.name}
        {standing.fresh && <span className="swing-tag new">new</span>}
        {out && <span className="swing-tag gone">out</span>}
        {standing.heldBy && !out && (
          <span className="swing-tag held" style={{ color: playerColour(state, standing.heldBy) }}>
            {playerName(state, standing.heldBy)}
          </span>
        )}
      </span>

      {/* What it stood on. The big number is the result; a swing without the
          base it swung from is a number the reader cannot check. */}
      <span className="swing-from">
        {standing.before} <span className="swing-arrow">→</span> {standing.after}
      </span>

      <span
        className="swing-track"
        title={`${standing.name}: ${standing.before} → ${standing.after} (${signed})`}
        style={{ "--width": `${width}%` } as CSSProperties}
      >
        <span className={`swing-bar ${swing >= 0 ? "up" : "down"}`} />
      </span>

      <span className={`swing-delta ${swing > 0 ? "up" : swing < 0 ? "down" : "flat"}`}>
        {signed}
      </span>
    </div>
  );
};

export const ElectionReport = ({ state, result, onClose }: Props) => {
  const scale = Math.max(
    1,
    ...result.standings.map((standing) => Math.abs(standing.after - standing.before)),
  );
  const gone = result.standings.filter((standing) => standing.after === 0).length;
  const stood = result.standings.length;

  return (
    <div className="reveal-backdrop" onClick={onClose}>
      <div className="reveal election" onClick={(event) => event.stopPropagation()}>
        <div className="reveal-head">
          <span className="reveal-seal">
            <Emblem />
          </span>
          <div>
            <h2>The country has voted</h2>
            <p className="election-sub">
              {result.cause === "term"
                ? "The Knesset sat its term."
                : "The government fell."}{" "}
              {stood} lists stood for the {result.parliament}
              {ordinal(result.parliament)} Knesset
              {gone > 0 && `, and ${gone} of them will not sit in it`}.
            </p>
          </div>
        </div>

        {result.ballot.length > 0 && (
          <section className="rev-block">
            <h3>The ballot changed before anybody voted</h3>
            <div className="ballot-list">
              {result.ballot.map((change, index) => (
                <BallotCard key={`${change.kind}-${change.key}-${index}`} state={state} change={change} />
              ))}
            </div>
          </section>
        )}

        <section className="rev-block">
          <h3>
            How they did · mandates won against what they stood on
          </h3>
          <div className="swings">
            {result.standings.map((standing) => (
              <SwingRow key={standing.partyKey} state={state} standing={standing} scale={scale} />
            ))}
          </div>
        </section>

        <button className="commit" onClick={onClose}>
          Start bidding
        </button>
      </div>
    </div>
  );
};
