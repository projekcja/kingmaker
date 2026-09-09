import { useMemo } from "react";

import { MAJORITY, TOTAL_SEATS } from "../engine/parties";
import type { GameState } from "../engine/types";
import { blocSeats } from "../engine/types";
import { playerColour } from "./format";

/**
 * The Knesset as the chamber it actually is: 120 seats in a half-circle.
 *
 * A stacked bar told the truth but read like a progress meter. Seats are the
 * unit the whole game is played in — you buy them one party at a time — so they
 * are drawn one at a time, filled in seating order from the left, with the
 * sixty-first marked. Whether you are two seats short is then something you
 * see rather than something you work out.
 *
 * A seat is a bench rather than a dot. A dot is a data point; a bench sits in a
 * row, faces the floor, and catches the light on its front edge — which is what
 * turns 120 marks into a room. The geometry for one is shared with the setup
 * screen's fan below, so the two are the same chamber seen twice.
 */

export interface Seat {
  x: number;
  y: number;
  angle: number;
}

/** Lay 120 seats into concentric arcs, the back rows longer than the front. */
export const layout = (count: number, rows: number): Seat[] => {
  // Seats per row in proportion to the row's radius, so the spacing between
  // neighbours comes out roughly equal everywhere in the fan.
  const radii = Array.from({ length: rows }, (_, row) => 0.46 + (row / (rows - 1)) * 0.54);
  const weight = radii.reduce((sum, radius) => sum + radius, 0);
  const perRow = radii.map((radius) => Math.round((radius / weight) * count));

  // Rounding never lands on 120 exactly; settle the difference on the back row,
  // which has the most room for it.
  let drift = count - perRow.reduce((sum, n) => sum + n, 0);
  for (let row = rows - 1; drift !== 0 && row >= 0; row -= 1) {
    const step = drift > 0 ? 1 : -1;
    perRow[row] += step;
    drift -= step;
  }

  const seats: Seat[] = [];
  radii.forEach((radius, row) => {
    const n = perRow[row];
    // A margin at both ends keeps the outermost seats off the floor line.
    const spread = Math.PI - 0.16;
    for (let index = 0; index < n; index += 1) {
      const t = n === 1 ? 0.5 : index / (n - 1);
      const angle = Math.PI - 0.08 - t * spread;
      seats.push({ x: Math.cos(angle) * radius, y: -Math.sin(angle) * radius, angle });
    }
  });

  // Seating order, left to right across the whole fan.
  return seats.sort((a, b) => b.angle - a.angle);
};

/** The rows the benches stand on, in the order they are laid out. */
export const ROW_RADII = [0.46, 0.595, 0.73, 0.865, 1.0];

/* The room, in the units the seats are measured in. */
export const VIEW = { w: 2.3, h: 1.28 };
export const WELL = 0.36;
export const RIM = 1.1;

export const px = (x: number): string => (x + VIEW.w / 2).toFixed(4);
export const py = (y: number): string => (y + VIEW.h - 0.06).toFixed(4);

/** The top half of a disc of radius `r`, drawn left to right over the top. */
export const halfDisc = (r: number): string =>
  `M ${px(-r)} ${py(0)} A ${r} ${r} 0 0 1 ${px(r)} ${py(0)} Z`;

/** The bare arc at radius `r`, with no closing line across the floor. */
export const halfArc = (r: number): string =>
  `M ${px(-r)} ${py(0)} A ${r} ${r} 0 0 1 ${px(r)} ${py(0)}`;

/**
 * An arc covering only the span the benches occupy.
 *
 * The rows stop where the seating stops. Drawn as a full half-circle they run
 * on past the last bench in each row and leave a stub lying on the floor, which
 * reads as a mark rather than as the end of a row.
 */
export const rowArc = (r: number): string => {
  const first = Math.PI - 0.08;
  const last = 0.08;
  return (
    `M ${px(Math.cos(first) * r)} ${py(-Math.sin(first) * r)} ` +
    `A ${r} ${r} 0 0 1 ${px(Math.cos(last) * r)} ${py(-Math.sin(last) * r)}`
  );
};

/**
 * The line falls in the gap between the 61st seat and the 62nd, so it reads as
 * a threshold rather than striking through the seat that crosses it.
 */
export const majorityAngleOf = (seats: Seat[]): number =>
  ((seats[MAJORITY - 1]?.angle ?? Math.PI / 2) + (seats[MAJORITY]?.angle ?? 0)) / 2;

/*
 * A bench is wider across the row than it is deep, and it faces the floor.
 *
 * The rotation goes on a wrapping group rather than on the bench itself: the
 * seat carries a CSS entrance animation, CSS and the SVG `transform` attribute
 * are the same property, and the animation would otherwise flatten the fan into
 * 120 identical horizontal bars.
 */
const BENCH_W = 0.073;
const BENCH_H = 0.049;

export const benchAt = (
  seat: Seat,
): { rect: { x: string; y: string; width: number; height: number; rx: number }; spin: string } => {
  const cx = Number(px(seat.x));
  const cy = Number(py(seat.y));
  return {
    rect: {
      x: (cx - BENCH_W / 2).toFixed(4),
      y: (cy - BENCH_H / 2).toFixed(4),
      width: BENCH_W,
      height: BENCH_H,
      rx: 0.016,
    },
    spin: `rotate(${(((Math.PI / 2 - seat.angle) * 180) / Math.PI).toFixed(2)} ${cx} ${cy})`,
  };
};

/**
 * Everything in the chamber that is not a seat.
 *
 * Both fans draw the same room — the wall behind the back row, the rows the
 * benches stand in, the well they look down into, and the line a government has
 * to cross — so it is built once and handed an id prefix, because two copies of
 * the same gradient on one page is one gradient with a duplicated name.
 */
export const ChamberRoom = ({
  id,
  majorityAngle,
  children,
}: {
  id: string;
  majorityAngle: number;
  children: React.ReactNode;
}) => (
  <>
    <defs>
      <radialGradient id={`${id}-floor`} cx="50%" cy="100%" r="72%">
        <stop offset="0%" stopColor="var(--chamber-glow)" />
        <stop offset="100%" stopColor="transparent" />
      </radialGradient>
      {/* The wall the back row sits against: bright where the light falls on
          it, gone by the time it reaches the benches. Without it the fan ends
          in mid-air and the whole drawing floats. */}
      <radialGradient id={`${id}-wall`} cx="50%" cy="100%" r="70%">
        <stop offset="72%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="92%" stopColor="#ffffff" stopOpacity="0.055" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      {/*
       * Light comes from above, the way it does in the room: the back rows
       * catch it and the front bench sits in its own shadow. One overlay
       * across the whole fan is cheaper than lighting 120 benches, and it is
       * what stops the chamber reading as a flat sheet of marks.
       */}
      <linearGradient id={`${id}-bench-light`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.17" />
        <stop offset="52%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.32" />
      </linearGradient>
      {/* The floor of the house is lit from the ceiling too, and it is the one
          surface in the room with nothing standing on it. */}
      <radialGradient id={`${id}-pit`} cx="50%" cy="100%" r="100%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.055" />
        <stop offset="76%" stopColor="#ffffff" stopOpacity="0.014" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.06" />
      </radialGradient>
    </defs>

    <ellipse cx={px(0)} cy={py(0)} rx="1.02" ry="0.98" fill={`url(#${id}-floor)`} />
    <path className="chamber-wall" d={halfDisc(1.24)} fill={`url(#${id}-wall)`} />

    {/* The rows themselves. The benches cover most of each arc; what shows
        through the gaps is the step the row stands on. */}
    {ROW_RADII.map((radius) => (
      <path key={radius} className="chamber-row" d={rowArc(radius)} />
    ))}

    {/* The well the benches look down into, and the rim they end at. */}
    <path className="chamber-well" d={halfDisc(WELL)} fill={`url(#${id}-pit)`} />
    <path className="chamber-rim" d={halfArc(RIM)} />

    {children}

    {/* The line a government has to cross, with the number on it. An
        unlabelled rule through a fan of benches is decoration; the label and
        the marker at the end of it are what make it the thing you are counting
        towards. */}
    <line
      className="majority-mark"
      x1={px(Math.cos(majorityAngle) * (WELL - 0.02))}
      y1={py(-Math.sin(majorityAngle) * (WELL - 0.02))}
      x2={px(Math.cos(majorityAngle) * 1.08)}
      y2={py(-Math.sin(majorityAngle) * 1.08)}
    />
    <g
      transform={`translate(${px(Math.cos(majorityAngle) * 1.14)} ${py(
        -Math.sin(majorityAngle) * 1.14,
      )})`}
    >
      <path className="majority-pin" d="M 0 -0.032 L 0.032 0 L 0 0.032 L -0.032 0 Z" />
    </g>
    <text
      className="majority-label"
      x={px(Math.cos(majorityAngle) * 1.235)}
      y={py(-Math.sin(majorityAngle) * 1.235)}
    >
      {MAJORITY}
    </text>
  </>
);

/** The single overlay that lights every bench at once. */
export const BenchLight = ({ id }: { id: string }) => (
  <path className="bench-light" d={halfDisc(RIM)} fill={`url(#${id}-bench-light)`} />
);

export const Chamber = ({ state }: { state: GameState }) => {
  const seats = useMemo(() => layout(TOTAL_SEATS, 5), []);

  const blocs = state.players.map((player) => ({
    key: player.key,
    seats: blocSeats(state, player.key),
    colour: playerColour(state, player.key),
    name: player.name,
    governing: player.key === state.primeMinister,
  }));

  // Every seat gets an owner, in seating order: each bloc in turn, then the
  // benches nobody has bought yet.
  const owners: Array<(typeof blocs)[number] | null> = [];
  for (const bloc of blocs) for (let i = 0; i < bloc.seats; i += 1) owners.push(bloc);
  while (owners.length < TOTAL_SEATS) owners.push(null);

  const leader = [...blocs].sort((a, b) => b.seats - a.seats)[0];
  const unaligned = owners.filter((owner) => owner === null).length;
  const majorityAngle = majorityAngleOf(seats);

  return (
    <div className="chamber-wrap">
      <svg
        className="chamber-svg"
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={`${leader?.name ?? "Nobody"} leads with ${leader?.seats ?? 0} of ${MAJORITY} needed`}
      >
        <ChamberRoom id="house" majorityAngle={majorityAngle}>
          {seats.map((seat, index) => {
            const owner = owners[index];
            const { rect, spin } = benchAt(seat);
            return (
              <g key={index} transform={spin}>
                <rect
                  className={["seat", owner ? "taken" : "vacant", owner?.governing ? "governing" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  {...rect}
                  fill={owner ? owner.colour : undefined}
                  style={{ animationDelay: `${index * 4}ms` }}
                >
                  <title>
                    {owner ? `${owner.name} — seat ${index + 1}` : `seat ${index + 1}, unaligned`}
                  </title>
                </rect>
              </g>
            );
          })}
        </ChamberRoom>

        <BenchLight id="house" />
      </svg>

      <div className="chamber-readout">
        <div className="chamber-count" style={{ color: leader ? leader.colour : undefined }}>
          {leader?.seats ?? 0}
        </div>
        <div className="chamber-of">
          of {MAJORITY} · {unaligned} unaligned
        </div>
      </div>
    </div>
  );
};
