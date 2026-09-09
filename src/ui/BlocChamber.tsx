import { useMemo } from "react";

import type { Bloc, Chamber as KnessetChamber } from "../engine/parties";
import { BLOC_LABEL, TOTAL_SEATS } from "../engine/parties";
import { BLOC_COLOUR } from "./format";
import { BenchLight, ChamberRoom, VIEW, benchAt, layout, majorityAngleOf } from "./Chamber";

/**
 * A chamber drawn as politics rather than as a scoreboard.
 *
 * The in-game {@link Chamber} colours seats by who has bought them, which is
 * the question during a campaign. Before one starts, the question is a
 * different one — what kind of Knesset is this? — so this fan is seated by
 * ideology instead: every list placed on the left-right axis, coloured by bloc,
 * so a glance says whether the right is at 50 or at 70 and whether anything
 * reaches the line without crossing the whole board to do it.
 *
 * Real Knesset seating is not ideological. This is a reading aid, and the
 * majority mark is what it is a reading aid for.
 */

const seatsIn = (chamber: KnessetChamber, bloc: Bloc): number =>
  chamber.parties.filter((party) => party.bloc === bloc).reduce((sum, p) => sum + p.baseSeats, 0);

/** Where a bloc sits on the axis: the mean politics of its lists, by seat. */
const blocPosition = (chamber: KnessetChamber, bloc: Bloc): number => {
  const parties = chamber.parties.filter((party) => party.bloc === bloc);
  const seats = parties.reduce((sum, p) => sum + p.baseSeats, 0);
  if (seats === 0) return 0;
  return parties.reduce((sum, p) => sum + p.leftRight * p.baseSeats, 0) / seats;
};

export const BlocChamber = ({ chamber }: { chamber: KnessetChamber }) => {
  const seats = useMemo(() => layout(TOTAL_SEATS, 5), []);

  // Left to right across the fan, so the picture is the spectrum. Ties break on
  // seat count, which keeps the order stable rather than dependent on the order
  // the lists happen to be written in.
  const ranked = useMemo(
    () =>
      [...chamber.parties].sort(
        (a, b) => a.leftRight - b.leftRight || b.baseSeats - a.baseSeats || a.key.localeCompare(b.key),
      ),
    [chamber],
  );

  const benches = useMemo(() => {
    const out: Array<{ name: string; bloc: Bloc }> = [];
    for (const party of ranked) {
      for (let i = 0; i < party.baseSeats; i += 1) out.push({ name: party.name, bloc: party.bloc });
    }
    return out;
  }, [ranked]);

  const legend = useMemo(
    () =>
      (Object.keys(BLOC_LABEL) as Bloc[])
        .map((bloc) => ({ bloc, seats: seatsIn(chamber, bloc) }))
        .filter((entry) => entry.seats > 0)
        .sort((a, b) => blocPosition(chamber, a.bloc) - blocPosition(chamber, b.bloc)),
    [chamber],
  );

  const majorityAngle = majorityAngleOf(seats);
  const largest = ranked.reduce((top, party) => (party.baseSeats > top.baseSeats ? party : top), ranked[0]);

  return (
    <div className="bloc-chamber">
      <svg
        className="bloc-chamber-svg"
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={legend
          .map((entry) => `${BLOC_LABEL[entry.bloc]} ${entry.seats}`)
          .join(", ")}
      >
        {/* The same room as the in-game fan, so the two read as one chamber
            seen twice rather than two different drawings. The line a
            government has to cross means something on this axis: 61 seats to
            the left of the mark is a left bloc. */}
        <ChamberRoom id="bloc" majorityAngle={majorityAngle}>
          {seats.map((seat, index) => {
            const bench = benches[index];
            if (!bench) return null;
            const { rect, spin } = benchAt(seat);
            return (
              <g key={index} transform={spin}>
                <rect className="bloc-seat" {...rect} fill={BLOC_COLOUR[bench.bloc]}>
                  <title>{`${bench.name} — ${BLOC_LABEL[bench.bloc]}`}</title>
                </rect>
              </g>
            );
          })}
        </ChamberRoom>

        <BenchLight id="bloc" />
      </svg>

      <div className="bloc-legend">
        {legend.map((entry) => (
          <span key={entry.bloc} className="bloc-key">
            <span className="bloc-dot" style={{ background: BLOC_COLOUR[entry.bloc] }} />
            {BLOC_LABEL[entry.bloc]}
            <strong>{entry.seats}</strong>
          </span>
        ))}
        <span className="bloc-key largest">
          largest <strong>{largest?.name}</strong> {largest?.baseSeats}
        </span>
      </div>
    </div>
  );
};
