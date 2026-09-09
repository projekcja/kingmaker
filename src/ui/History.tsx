import { useMemo } from "react";

import { ordinal } from "../engine/campaign";
import type { GameState, LogEntry, LogKind } from "../engine/types";

/**
 * The whole campaign, read back.
 *
 * The engine has always written this — every deal struck, every card turned
 * over, every government that fell and every election that followed — and
 * nothing had ever displayed a line of it. A campaign runs a median of eighteen
 * turns across four parliaments, which is long enough that the third Knesset is
 * played without much memory of what the first one cost.
 *
 * Newest first, the way a feed reads. Chronological is how a story is written
 * but not how one is caught up on: opening this to the founding of a parliament
 * three ago, and scrolling to reach what just happened, would make the common
 * case the expensive one.
 */

interface Props {
  state: GameState;
  onClose: () => void;
}

/** What each kind of entry is, in the margin. */
const KIND_LABEL: Record<LogKind, string> = {
  info: "note",
  card: "news",
  deal: "deal",
  trouble: "trouble",
  election: "election",
};

interface Sitting {
  parliament: number;
  entries: LogEntry[];
}

/**
 * Group the log into the parliaments that produced it, newest first.
 *
 * Entries carry their own parliament, so this only has to collect runs of them
 * rather than decide where the boundaries are.
 */
const sittings = (log: readonly LogEntry[]): Sitting[] => {
  const byParliament = new Map<number, LogEntry[]>();
  for (const entry of log) {
    const existing = byParliament.get(entry.parliament);
    if (existing) existing.push(entry);
    else byParliament.set(entry.parliament, [entry]);
  }
  return [...byParliament.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([parliament, entries]) => ({ parliament, entries: [...entries].reverse() }));
};

export const History = ({ state, onClose }: Props) => {
  const grouped = useMemo(() => sittings(state.log), [state.log]);
  const turns = state.turn - 1;

  return (
    <div className="reveal-backdrop" onClick={onClose}>
      <div className="reveal history" onClick={(event) => event.stopPropagation()}>
        <div className="reveal-head">
          <div>
            <h2>The campaign so far</h2>
            <p className="election-sub">
              {turns} turn{turns === 1 ? "" : "s"} across {state.parliament} Knesset
              {state.parliament === 1 ? "" : "s"}, most recent first.
            </p>
          </div>
        </div>

        {grouped.length === 0 ? (
          <p className="muted">Nothing has happened yet.</p>
        ) : (
          grouped.map((sitting) => (
            <section key={sitting.parliament} className="sitting">
              <h3 className="sitting-head">
                {sitting.parliament}
                {ordinal(sitting.parliament)} Knesset
                {sitting.parliament === state.parliament && (
                  <span className="sitting-now">sitting now</span>
                )}
              </h3>

              <div className="log">
                {sitting.entries.map((entry, index) => (
                  <div key={`${entry.turn}-${index}`} className={`log-line ${entry.kind}`}>
                    <span className="log-turn">{entry.turn}</span>
                    <span className="log-kind">{KIND_LABEL[entry.kind]}</span>
                    <span className="log-text">{entry.text}</span>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}

        <button className="commit" onClick={onClose}>
          Back to the board
        </button>
      </div>
    </div>
  );
};
