/**
 * The house mark: a seven-branched lamp between two olive branches.
 *
 * It is the emblem the building itself carries, and it is the one ornament in
 * the game that is not also a reading. Everything else on screen is load-
 * bearing — a bench is a mandate, a coin is a budget, a pip is a week — so the
 * emblem is drawn once and then used only where the screen is doing nothing
 * else: washed out behind the title, and small in the corner of the board.
 *
 * Stroked rather than filled, and it takes its colour from `currentColor`, so
 * the same drawing sits in lamplight, in daylight and on the opposition benches
 * without three copies of it.
 */

/** Branch offsets from the stem, innermost first. Three a side, plus the stem. */
const BRANCHES = [11, 22, 33];

/** Where the lamps sit, and where the branches leave the stem. */
const LAMP_Y = 30;

/*
 * One olive branch, grown rather than drawn.
 *
 * Hand-placed leaves drifted off the stem and came out all the same size, which
 * read as a chain of beads rather than as a branch. So the stem is a cubic, and
 * every leaf is sampled from it: the point puts the leaf on the wood, the
 * tangent tells it which way is up the branch, and it is turned out from there.
 * Leaves alternate sides and shorten towards the tip, because that is what
 * makes a row of ellipses read as foliage.
 */
const STEM: Array<[number, number]> = [
  [33, 101],
  [13, 93],
  [6, 64],
  [21, 36],
];

/** A point on the cubic, and the direction it is heading, at `t`. */
const along = (t: number): { x: number; y: number; heading: number } => {
  const [p0, p1, p2, p3] = STEM;
  const u = 1 - t;
  const at = (i: 0 | 1) =>
    u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  const d = (i: 0 | 1) =>
    3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  return { x: at(0), y: at(1), heading: (Math.atan2(d(1), d(0)) * 180) / Math.PI };
};

const OliveBranch = () => (
  <g>
    <path
      d={`M ${STEM[0][0]} ${STEM[0][1]} C ${STEM[1][0]} ${STEM[1][1]} ${STEM[2][0]} ${STEM[2][1]} ${STEM[3][0]} ${STEM[3][1]}`}
    />
    {[0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92].map((t, index) => {
      const { x, y, heading } = along(t);
      // Outward on one side, inward on the next, and a shorter leaf each time.
      const side = index % 2 === 0 ? 1 : -1;
      const splay = heading - side * 42;
      const length = 8.4 - t * 3;
      const radians = (splay * Math.PI) / 180;
      return (
        <ellipse
          key={t}
          cx={(x + Math.cos(radians) * length * 0.72).toFixed(2)}
          cy={(y + Math.sin(radians) * length * 0.72).toFixed(2)}
          rx={length.toFixed(2)}
          ry="2.9"
          transform={`rotate(${splay.toFixed(1)} ${(x + Math.cos(radians) * length * 0.72).toFixed(2)} ${(y + Math.sin(radians) * length * 0.72).toFixed(2)})`}
        />
      );
    })}
    {/* One drupe, tucked against the wood. An olive branch without an olive is
        a willow; two of them at this line weight is a tangle. */}
    <circle cx="15" cy="76" r="2.5" />
  </g>
);

export const Emblem = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 120 120"
    role="presentation"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* The stem, and the foot it stands on. */}
    <path d="M 60 30 L 60 88" />
    <path d="M 51 88 L 69 88 L 73 100 L 47 100 Z" />
    <path d="M 43 106 L 77 106" />

    {/* Three branches a side, each leaving the stem at its own height and
        turning up to the same line of lamps. */}
    {BRANCHES.map((d) => (
      <g key={d}>
        <path d={`M 60 ${LAMP_Y + d} Q ${60 - d} ${LAMP_Y + d} ${60 - d} ${LAMP_Y}`} />
        <path d={`M 60 ${LAMP_Y + d} Q ${60 + d} ${LAMP_Y + d} ${60 + d} ${LAMP_Y}`} />
      </g>
    ))}

    {/* Seven lamps in a line, the flame above each. */}
    {[-33, -22, -11, 0, 11, 22, 33].map((offset) => (
      <g key={offset}>
        <path d={`M ${60 + offset - 3.4} ${LAMP_Y} L ${60 + offset + 3.4} ${LAMP_Y}`} />
        <path d={`M ${60 + offset} ${LAMP_Y - 3} L ${60 + offset} ${LAMP_Y - 9}`} />
      </g>
    ))}

    <OliveBranch />
    {/* x → 120 - x: the same branch, on the other side of the lamp. */}
    <g transform="translate(120 0) scale(-1 1)">
      <OliveBranch />
    </g>
  </svg>
);
