import { MAJORITY, TOTAL_SEATS } from "../engine/parties";
import type { GameState } from "../engine/types";
import { blocSeats } from "../engine/types";
import { playerColour } from "./format";

/**
 * The Knesset as one bar: every bloc in seating order, unaligned seats grey,
 * and a line at 61.
 */
export const Chamber = ({ state }: { state: GameState }) => {
  const segments = state.players.map((player) => ({
    key: player.key,
    seats: blocSeats(state, player.key),
    colour: playerColour(state, player.key),
    label: player.name,
  }));

  const claimed = segments.reduce((sum, segment) => sum + segment.seats, 0);
  const unaligned = Math.max(0, TOTAL_SEATS - claimed);

  return (
    <div className="chamber-wrap">
      <div className="chamber">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className="chamber-seg"
            style={{ flexGrow: segment.seats, background: segment.colour }}
            title={`${segment.label}: ${segment.seats}`}
          >
            {segment.seats >= 8 && <span>{segment.seats}</span>}
          </div>
        ))}
        {unaligned > 0 && (
          <div
            className="chamber-seg empty"
            style={{ flexGrow: unaligned }}
            title={`unaligned: ${unaligned}`}
          >
            {unaligned >= 8 && <span>{unaligned}</span>}
          </div>
        )}
      </div>
      <div className="majority-mark" style={{ left: `${(MAJORITY / TOTAL_SEATS) * 100}%` }}>
        <span>{MAJORITY}</span>
      </div>
    </div>
  );
};
