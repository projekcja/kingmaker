import { useMemo, useState } from "react";

import { validateAllocation } from "../engine/allocation";
import { MAJORITY } from "../engine/parties";
import { BLOC_LABEL } from "../engine/parties";
import type { Allocation, GameState } from "../engine/types";
import { biddableParties, blocSeats, playerOf, refusalsAgainst } from "../engine/types";
import { Chamber } from "./Chamber";
import { BLOC_COLOUR, playerColour, playerName } from "./format";

interface Props {
  state: GameState;
  onCommit: (allocation: Allocation) => void;
  busy?: boolean;
}

/**
 * The whole game on one screen.
 *
 * Pick a party, then tap ministries onto it. Everything must be placed before
 * the turn can be sent, which is the point: there is no holding back, only
 * choosing where not to spend.
 */
export const Board = ({ state, onCommit, busy = false }: Props) => {
  const human = state.players.find((player) => player.kind === "human");
  const targets = biddableParties(state);
  const [allocation, setAllocation] = useState<Allocation>({});
  const [active, setActive] = useState<string | null>(targets[0]?.key ?? null);

  const problems = useMemo(
    () => (human ? validateAllocation(state, human.key, allocation) : []),
    [state, human, allocation],
  );
  const placed = Object.keys(allocation).length;
  const remaining = state.ministries.length - placed;

  if (!human) return null;

  const assign = (ministryKey: string) => {
    setAllocation((current) => {
      const next = { ...current };
      if (next[ministryKey]) delete next[ministryKey];
      else if (active) next[ministryKey] = active;
      return next;
    });
  };

  const clearParty = (partyKey: string) =>
    setAllocation((current) =>
      Object.fromEntries(Object.entries(current).filter(([, key]) => key !== partyKey)),
    );

  const spentOn = (partyKey: string) =>
    state.ministries
      .filter((ministry) => allocation[ministry.key] === partyKey)
      .reduce((sum, ministry) => sum + ministry.budget, 0);

  const clock = state.phase === "forming" ? `Week ${state.week}` : `Year ${state.governmentYears + 1}`;
  const headline =
    state.phase === "forming"
      ? "Buy a majority"
      : state.phase === "rebuilding"
        ? "Rebuild it or lose it"
        : "Hold the coalition together";

  return (
    <div className="board">
      <header className="hud">
        <div className="hud-left">
          <div className="phase">{headline}</div>
          <div className="clock">
            {clock} · {state.parliament}
            {state.parliament === 1 ? "st" : state.parliament === 2 ? "nd" : state.parliament === 3 ? "rd" : "th"} Knesset
          </div>
        </div>
        <div className="scores">
          {state.players.map((player) => (
            <div
              key={player.key}
              className={`score ${player.key === state.primeMinister ? "pm" : ""}`}
              style={{ borderColor: playerColour(state, player.key) }}
            >
              <div className="score-name" style={{ color: playerColour(state, player.key) }}>
                {player.name}
                {player.kind !== "human" && <span className="kind"> {player.kind}</span>}
              </div>
              <div className="score-row">
                <span className="seats">{blocSeats(state, player.key)}</span>
                <span className="years">{player.yearsInPower} yr</span>
              </div>
            </div>
          ))}
        </div>
      </header>

      <Chamber state={state} />

      <div className="parties">
        {targets.map((party) => {
          const spent = spentOn(party.key);
          const blocked = refusalsAgainst(state, party, human.key);
          const holder = party.heldBy;
          return (
            <button
              key={party.key}
              className={`party-card ${active === party.key ? "active" : ""} ${blocked.length ? "blocked" : ""}`}
              style={{ borderColor: holder ? playerColour(state, holder) : "#2a3140" }}
              onClick={() => setActive(party.key)}
              onDoubleClick={() => clearParty(party.key)}
            >
              <div className="party-head">
                <span className="party-seats">{party.seats}</span>
                <span className="party-name">{party.name}</span>
              </div>
              <div className="party-sub">
                <span className="bloc" style={{ color: BLOC_COLOUR[party.bloc] }}>
                  {BLOC_LABEL[party.bloc]}
                </span>
                <span className="holder" style={{ color: playerColour(state, holder) }}>
                  {holder ? playerName(state, holder) : "unaligned"}
                </span>
              </div>
              {blocked.length > 0 && (
                <div className="redline">
                  refuses you over {blocked.map((key) => state.parties[key]?.name).join(", ")}
                </div>
              )}
              <div className={`bid ${spent > 0 ? "on" : ""}`}>{spent > 0 ? `${spent}bn` : "—"}</div>
            </button>
          );
        })}
      </div>

      <div className="tray">
        <div className="tray-head">
          <span>
            {active ? `Offering to ${state.parties[active]?.name}` : "Pick a party"}
          </span>
          <span className={remaining > 0 ? "warn" : "ok"}>
            {remaining > 0 ? `${remaining} left to place` : "all placed"}
          </span>
        </div>
        <div className="chips">
          {state.ministries.map((ministry) => {
            const target = allocation[ministry.key];
            return (
              <button
                key={ministry.key}
                className={`chip ${target ? "used" : ""}`}
                style={
                  target ? { borderColor: playerColour(state, human.key), opacity: 0.55 } : undefined
                }
                onClick={() => assign(ministry.key)}
                title={target ? `→ ${state.parties[target]?.name}` : "unplaced"}
              >
                <span className="chip-budget">{ministry.budget}</span>
                <span className="chip-name">{ministry.name}</span>
              </button>
            );
          })}
        </div>

        <div className="commit-row">
          <button
            className="commit"
            disabled={problems.length > 0 || busy}
            onClick={() => {
              onCommit(allocation);
              setAllocation({});
            }}
          >
            {busy ? "Resolving…" : state.phase === "forming" ? "End the week" : "End the year"}
          </button>
          <button className="ghost" onClick={() => setAllocation({})}>
            Clear
          </button>
          <span className="need">
            {Math.max(0, MAJORITY - blocSeats(state, human.key))} more mandates for a majority
          </span>
        </div>
      </div>
    </div>
  );
};

export const pmName = (state: GameState): string | null =>
  state.primeMinister ? playerOf(state, state.primeMinister).name : null;
