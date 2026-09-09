import { useMemo, useState } from "react";

import { BLOC_LABEL } from "../engine/parties";
import type { GameState } from "../engine/types";
import { redLines } from "../engine/types";
import { BLOC_COLOUR, playerColour } from "./format";

/**
 * Every red line on the board at once.
 *
 * The party cards can only ever say what refuses *you*, because that is the
 * question the auction asks. It is the wrong question to buy on. A coalition is
 * a set, so the cost of taking a list is not only its price — it is every list
 * that will then never come, and that cost is invisible until you have already
 * paid it and find the last ten mandates unbuyable.
 *
 * So the whole map, drawn once. Lists sit on a ring in left-right order, which
 * is the ordering the lines are mostly generated from: put them anywhere else
 * and a chord is a chord, but put them in political order and the chords all
 * run across the ring, which is the shape of the actual problem. Reading it is
 * one glance — a party with three lines out of it is a party that costs you
 * three other parties.
 *
 * Not a control. Nothing here changes state except which node is being looked
 * at; picking a party to bid on is still the card grid's job, because that is
 * where the price is.
 */

interface Props {
  state: GameState;
  /** Whose board this is. Their own lines are drawn in their colour. */
  seat: string;
}

/** The ring, in the units the nodes are placed in. */
const R = 92;
const VIEW = 260;
const CENTRE = VIEW / 2;

export const RedLines = ({ state, seat }: Props) => {
  const [lit, setLit] = useState<string | null>(null);

  const lines = useMemo(() => redLines(state), [state]);

  /*
   * Where each list sits on the ring.
   *
   * Ordered by `leftRight` and then by seats, so the ring is the spectrum and
   * the order is stable across a turn — a node that moved every time a card
   * was drawn would make the map unreadable as a map. The sweep is a full
   * circle rather than an arc: an arc leaves the two extremes adjacent at the
   * ends, and the extremes are precisely the pair that must be furthest apart
   * for the chords to mean anything.
   */
  const nodes = useMemo(() => {
    const ordered = Object.values(state.parties).sort(
      (a, b) => a.leftRight - b.leftRight || b.seats - a.seats || a.key.localeCompare(b.key),
    );
    return ordered.map((party, index) => {
      // Start at the top and go clockwise, so left sits left and right right.
      const angle = -Math.PI / 2 - Math.PI + ((index + 0.5) / ordered.length) * Math.PI * 2;
      return {
        party,
        x: CENTRE + Math.cos(angle) * R,
        y: CENTRE + Math.sin(angle) * R,
        // Seats set the disc, but on a square root: a 40-seat list is not ten
        // times the dot of a 4-seat one, it is three times, and the small
        // lists are the ones whose lines are easiest to miss.
        r: 4.4 + Math.sqrt(party.seats) * 1.5,
      };
    });
  }, [state.parties]);

  const at = useMemo(() => new Map(nodes.map((node) => [node.party.key, node])), [nodes]);

  /** How many lines run out of each list — the number the ring is read for. */
  const degree = useMemo(() => {
    const count = new Map<string, number>();
    for (const line of lines) {
      count.set(line.from, (count.get(line.from) ?? 0) + 1);
      count.set(line.to, (count.get(line.to) ?? 0) + 1);
    }
    return count;
  }, [lines]);

  if (lines.length === 0) {
    return (
      <div className="redmap">
        <div className="redmap-head">
          <span className="redmap-title">Red lines</span>
          <span className="redmap-count">none on this board</span>
        </div>
        <p className="redmap-empty">
          No two lists here are far enough apart to refuse each other outright. Every party is
          buyable by everyone, and the only thing between you and a majority is the money.
        </p>
      </div>
    );
  }

  const touching = (key: string) =>
    lit === null || lit === key || lines.some((line) =>
      line.from === lit ? line.to === key : line.to === lit && line.from === key,
    );

  return (
    <div className="redmap">
      <div className="redmap-head">
        <span className="redmap-title">Red lines</span>
        <span className="redmap-count">
          {lines.length} between {degree.size} lists
        </span>
      </div>

      <div className="redmap-body">
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="redmap-svg" role="img"
          aria-label={`${lines.length} red lines between ${degree.size} of the ${nodes.length} lists on this board`}>
          {/* The ring itself, as a faint guide. It is the spectrum, so it gets
              a tick at the centre where the axis crosses zero. */}
          <circle cx={CENTRE} cy={CENTRE} r={R} className="redmap-ring" />

          {/*
           * The chords.
           *
           * Bowed towards the middle rather than drawn straight, so two lines
           * between neighbouring nodes do not lie on top of each other, and so
           * a long line across the ring reads as a span rather than as a
           * diameter cutting the drawing in half. The control point is pulled
           * towards the centre in proportion to how far apart the ends are.
           */}
          {lines.map((line) => {
            const a = at.get(line.from);
            const b = at.get(line.to);
            if (!a || !b) return null;
            const span = Math.hypot(a.x - b.x, a.y - b.y) / (R * 2);
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const bow = 0.15 + span * 0.55;
            const cx = midX + (CENTRE - midX) * bow;
            const cy = midY + (CENTRE - midY) * bow;
            const on = lit === null || line.from === lit || line.to === lit;
            return (
              <path
                key={`${line.kind}-${line.from}-${line.to}`}
                className={`redmap-line ${line.kind} ${on ? "" : "off"}`}
                d={`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`}
              />
            );
          })}

          {nodes.map((node) => {
            const held = node.party.heldBy;
            const on = touching(node.party.key);
            const count = degree.get(node.party.key) ?? 0;
            return (
              <g
                key={node.party.key}
                className={`redmap-node ${on ? "" : "off"} ${lit === node.party.key ? "lit" : ""}`}
                onMouseEnter={() => setLit(node.party.key)}
                onMouseLeave={() => setLit(null)}
                onFocus={() => setLit(node.party.key)}
                onBlur={() => setLit(null)}
                tabIndex={0}
                role="listitem"
              >
                <title>
                  {node.party.name} — {node.party.seats} seats, {BLOC_LABEL[node.party.bloc]}
                  {count === 0 ? " · no red lines" : ` · ${count} red line${count === 1 ? "" : "s"}`}
                </title>
                {/* A list somebody holds gets their colour as a collar, so the
                    map also shows whose problem each line already is. */}
                {held && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 2.6}
                    className={`redmap-collar ${held === seat ? "mine" : ""}`}
                    style={{ stroke: playerColour(state, held) }}
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  className="redmap-dot"
                  style={{ fill: BLOC_COLOUR[node.party.bloc] }}
                />
              </g>
            );
          })}
        </svg>

        {/*
         * The key, which is also the list.
         *
         * A ring of coloured dots is unreadable without the names beside it,
         * and the names have to carry the count anyway — so the legend is the
         * table, sorted by how entangled each list is rather than by seats.
         * The parties at the top are the expensive ones to own.
         */}
        <ul className="redmap-key">
          {[...nodes]
            .sort(
              (a, b) =>
                (degree.get(b.party.key) ?? 0) - (degree.get(a.party.key) ?? 0) ||
                b.party.seats - a.party.seats,
            )
            .map((node) => {
              const count = degree.get(node.party.key) ?? 0;
              const against = lines
                .filter((line) => line.from === node.party.key || line.to === node.party.key)
                .map((line) =>
                  line.from === node.party.key
                    ? state.parties[line.to]?.name
                    : state.parties[line.from]?.name,
                )
                .filter(Boolean)
                .join(", ");
              return (
                <li
                  key={node.party.key}
                  className={`redmap-row ${count === 0 ? "clear" : ""} ${lit === node.party.key ? "lit" : ""}`}
                  onMouseEnter={() => setLit(node.party.key)}
                  onMouseLeave={() => setLit(null)}
                >
                  <span className="redmap-swatch" style={{ background: BLOC_COLOUR[node.party.bloc] }} />
                  <span className="redmap-row-name">{node.party.name}</span>
                  <span className="redmap-row-against">{count === 0 ? "clear" : against}</span>
                  <span className="redmap-row-count">{count || ""}</span>
                </li>
              );
            })}
        </ul>
      </div>

      <p className="redmap-rule">
        A red line beats any amount of money. Solid lines are politics and never lapse; dashed
        ones were drawn by a card and will. Taking a list takes everything it refuses off your
        board too — which is the real price of the far ends of the ring.
      </p>
    </div>
  );
};
