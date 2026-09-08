import type { GameState } from "../engine/types";

export const LogPanel = ({ state }: { state: GameState }) => {
  const entries = [...state.log].reverse();

  return (
    <section className="panel">
      <header>
        <h2>The record</h2>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>
          day {Math.min(state.day, state.daysTotal)} of {state.daysTotal}
        </span>
      </header>

      <div className="scroll">
        {entries.map((entry, index) => (
          <div key={`${entry.day}-${index}-${entry.text}`} className={`log-entry ${entry.kind}`}>
            <span className="log-day">Day {entry.day}</span>
            {entry.text}
          </div>
        ))}
      </div>
    </section>
  );
};
