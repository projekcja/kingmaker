/**
 * The house mark: a seven-branched lamp between two olive branches.
 *
 * It is the emblem the building itself carries, and it is the one ornament in
 * the game that is not also a reading. Everything else on screen is load-
 * bearing — a bench is a mandate, a coin is a budget, a pip is a week — so the
 * emblem is drawn once and then used only where the screen is doing nothing
 * else: washed out behind the title, and small in the corner of the board.
 *
 * Drawn to the historical lamp rather than to a menorah in general. The one on
 * the Arch of Titus — and so the one the state carries after it — has three
 * particular things a freehand menorah does not, and all three are what make it
 * read as a monument rather than as an ornament:
 *
 *   - the branches are **semicircles**, nested and concentric, springing from a
 *     single centre on the line of the lamps, rather than curling out of the
 *     shaft at whatever height each one likes;
 *   - it is **unlit**. The lamps are cups and there are no flames. Flames are
 *     the Hanukkah lamp and the greetings card; the Temple one is shown as an
 *     object;
 *   - it stands on a **plinth**, not a tripod — a collar, a splayed foot and a
 *     bar, which is the weight that keeps the whole thing sitting down.
 *
 * Filled rather than stroked, for the same reason: the original is a relief and
 * then a silhouette, and a solid mark survives being shrunk to 34px in the
 * corner of the board, where an outline of this many nested arcs turns to mush.
 * It takes its colour from `currentColor`, so the same drawing sits in
 * lamplight, in daylight and on a pressed seal without three copies of it.
 */

/** The line the branch tips and the lamps stand on. Everything hangs off it. */
const LAMP_Y = 27;

/** Half the thickness of the shaft and of every branch: one wood throughout. */
const LIMB = 2.6;

/**
 * Branch radii, innermost first.
 *
 * Each pair is one semicircle centred at `(60, LAMP_Y)`, so it comes up on both
 * sides at exactly the height of the shaft and crosses the shaft at the bottom
 * of its own arc. Nothing is jointed: the arcs and the shaft are laid over one
 * another in the same colour and the overlaps close themselves, which is how
 * the relief does it too.
 */
const BRANCHES = [12, 22, 32];

/** Where the seven lamps stand: the branch tips, and the shaft between them. */
const LAMPS = [-32, -22, -12, 0, 12, 22, 32];

/** One branch as a half-annulus: out along the arc, back along the inner one. */
const branch = (r: number): string => {
  const outer = r + LIMB;
  const inner = r - LIMB;
  return [
    `M ${60 - outer} ${LAMP_Y}`,
    `A ${outer} ${outer} 0 0 0 ${60 + outer} ${LAMP_Y}`,
    `L ${60 + inner} ${LAMP_Y}`,
    `A ${inner} ${inner} 0 0 1 ${60 - inner} ${LAMP_Y}`,
    "Z",
  ].join(" ");
};

/**
 * One lamp: a cup, flared out of the branch it stands on, and left empty.
 *
 * The flare is what separates seven tips from seven cut-off sticks, and it is
 * the whole of the ornament — the cups on the relief are plain.
 */
const lamp = (offset: number): string => {
  const cx = 60 + offset;
  return [
    `M ${cx - LIMB} ${LAMP_Y}`,
    `C ${cx - LIMB} ${LAMP_Y - 2.4} ${cx - 4.2} ${LAMP_Y - 2.1} ${cx - 4.2} ${LAMP_Y - 4.8}`,
    `L ${cx + 4.2} ${LAMP_Y - 4.8}`,
    `C ${cx + 4.2} ${LAMP_Y - 2.1} ${cx + LIMB} ${LAMP_Y - 2.4} ${cx + LIMB} ${LAMP_Y}`,
    "Z",
  ].join(" ");
};

/*
 * One olive branch, grown rather than drawn.
 *
 * Hand-placed leaves drifted off the stem and came out all the same size, which
 * read as a chain of beads rather than as a branch. So the stem is a cubic, and
 * every leaf is sampled from it: the point puts the leaf on the wood, the
 * tangent tells it which way is up the branch, and it is turned out from there.
 * Leaves alternate sides and shorten towards the tip, because that is what
 * makes a row of them read as foliage.
 *
 * The leaves are lens-shaped rather than elliptical, pointed at both ends. An
 * olive leaf is lanceolate, and at emblem scale that point is the difference
 * between foliage and a string of pebbles.
 */
const STEM: Array<[number, number]> = [
  [36, 102],
  [15, 95],
  [7, 64],
  [20, 31],
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

/**
 * A leaf, from where it joins the wood to its point.
 *
 * Two quadratics bowed opposite ways off the same axis. The control offset is
 * twice the width wanted, because a quadratic only reaches halfway to its
 * control at the middle of the curve.
 */
const leafPath = (bx: number, by: number, degrees: number, length: number): string => {
  const radians = (degrees * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const bow = 3.4;
  // Perpendicular to the leaf's axis, scaled to bow the two sides out.
  const px = -dy * bow;
  const py = dx * bow;
  const midX = bx + dx * length * 0.5;
  const midY = by + dy * length * 0.5;
  const tipX = bx + dx * length;
  const tipY = by + dy * length;
  return [
    `M ${bx.toFixed(2)} ${by.toFixed(2)}`,
    `Q ${(midX + px).toFixed(2)} ${(midY + py).toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)}`,
    `Q ${(midX - px).toFixed(2)} ${(midY - py).toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`,
    "Z",
  ].join(" ");
};

const OliveBranch = () => (
  <g>
    {/* The wood is the one stroked thing in the drawing: a branch tapering to
        nothing is a line, and filling it would mean drawing both its sides. */}
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      d={`M ${STEM[0][0]} ${STEM[0][1]} C ${STEM[1][0]} ${STEM[1][1]} ${STEM[2][0]} ${STEM[2][1]} ${STEM[3][0]} ${STEM[3][1]}`}
    />
    {[0.18, 0.31, 0.44, 0.57, 0.7, 0.82, 0.93].map((t, index) => {
      const { x, y, heading } = along(t);
      // Outward on one side, inward on the next, and a shorter leaf each time.
      const side = index % 2 === 0 ? 1 : -1;
      return <path key={t} d={leafPath(x, y, heading - side * 44, 8.2 - t * 3)} />;
    })}
    {/* One drupe, tucked against the wood. An olive branch without an olive is
        a willow; two of them at this weight is a tangle. */}
    <circle cx="14.4" cy="78" r="2.6" />
  </g>
);

export const Emblem = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 120 120"
    role="presentation"
    aria-hidden="true"
    fill="currentColor"
    stroke="none"
  >
    {/* The shaft, from the middle lamp down to where the base takes over. */}
    <rect x={60 - LIMB} y={LAMP_Y} width={LIMB * 2} height={83 - LAMP_Y} />

    {/* Three nested semicircles, and the seven cups standing on their tips. */}
    {BRANCHES.map((r) => (
      <path key={r} d={branch(r)} />
    ))}
    {LAMPS.map((offset) => (
      <path key={offset} d={lamp(offset)} />
    ))}

    {/* The base: a collar, a foot splayed out under it, and the bar it all
        stands on. Three pieces, because one tapered wedge reads as a funnel. */}
    <rect x="54.6" y="79" width="10.8" height="4.6" rx="1.4" />
    <path d="M 56.4 83.6 L 63.6 83.6 L 71 99 L 49 99 Z" />
    <rect x="43.6" y="99" width="32.8" height="6.4" rx="1.6" />

    <OliveBranch />
    {/* x → 120 - x: the same branch, on the other side of the lamp. */}
    <g transform="translate(120 0) scale(-1 1)">
      <OliveBranch />
    </g>
  </svg>
);
