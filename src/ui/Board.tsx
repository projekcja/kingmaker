import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { availableMinistries, validateOffer } from "../engine/allocation";
import { ordinal } from "../engine/campaign";
import { BLOC_LABEL, MAJORITY } from "../engine/parties";
import type { GameState, Offer } from "../engine/types";
import {
  FORMING_DEADLINE,
  OFFERS_PER_TURN,
  TERM_LENGTH,
  biddableParties,
  blocSeats,
  ministryByKey,
  packageValue,
  refusalsAgainst,
  valueOf,
} from "../engine/types";
import { Chamber } from "./Chamber";
import { Emblem } from "./Emblem";
import { BLOC_COLOUR, playerColour, playerName } from "./format";

interface Props {
  state: GameState;
  onCommit: (offer: Offer) => void;
  busy?: boolean;
  /** Which seat is looking. Defaults to the first human, for a solo campaign. */
  seat?: string;
}

/**
 * The whole game on one screen.
 *
 * Pick up to three parties, drop as many portfolios on them as you like, send
 * it. What a party is already being paid is public, so poaching is an informed
 * decision rather than a guess — the hidden part is only what your rivals are
 * doing this turn.
 */
export const Board = ({ state, onCommit, busy = false, seat }: Props) => {
  const human =
    state.players.find((player) => player.key === seat) ??
    state.players.find((player) => player.kind === "human");
  const targets = biddableParties(state);

  const [bids, setBids] = useState<Record<string, string[]>>({});
  const [withdrawFrom, setWithdrawFrom] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const offer: Offer = useMemo(
    () => ({
      bids: Object.entries(bids)
        .filter(([, ministries]) => ministries.length > 0)
        .map(([partyKey, ministries]) => ({ partyKey, ministries })),
      withdrawFrom,
    }),
    [bids, withdrawFrom],
  );

  const problems = useMemo(
    () => (human ? validateOffer(state, human.key, offer) : []),
    [state, human, offer],
  );

  if (!human) return null;

  // Two people at one keyboard need telling which board they are looking at.
  const sharing = state.players.filter((player) => player.kind === "human").length > 1;
  const hand = availableMinistries(state, human.key, offer);
  const assigned = new Set(Object.values(bids).flat());
  const courting = offer.bids.length;

  const toggleMinistry = (key: string) => {
    setBids((current) => {
      const next: Record<string, string[]> = {};
      let removed = false;
      for (const [partyKey, ministries] of Object.entries(current)) {
        const kept = ministries.filter((entry) => entry !== key);
        if (kept.length !== ministries.length) removed = true;
        if (kept.length > 0) next[partyKey] = kept;
      }
      if (removed || !active) return next;
      // Three tables a week, with as much on each as the hand will bear.
      if (!next[active] && Object.keys(next).length >= OFFERS_PER_TURN) return next;
      next[active] = [...(next[active] ?? []), key];
      return next;
    });
  };

  const toggleWithdraw = (partyKey: string) =>
    setWithdrawFrom((current) => {
      const next = current.includes(partyKey)
        ? current.filter((key) => key !== partyKey)
        : [...current, partyKey];
      // Portfolios pulled back cannot still be sitting on a table.
      setBids((currentBids) => {
        const freed = new Set(state.parties[partyKey]?.package ?? []);
        if (current.includes(partyKey)) {
          const cleaned: Record<string, string[]> = {};
          for (const [key, ministries] of Object.entries(currentBids)) {
            const kept = ministries.filter((entry) => !freed.has(entry));
            if (kept.length > 0) cleaned[key] = kept;
          }
          return cleaned;
        }
        return currentBids;
      });
      return next;
    });

  const reset = () => {
    setBids({});
    setWithdrawFrom([]);
  };

  const forming = state.phase === "forming";
  const clock = forming
    ? `Week ${state.week}`
    : `Year ${state.governmentYears + 1} of ${TERM_LENGTH}`;

  // Which side of the aisle this seat is on. Only one player can be prime
  // minister, so everybody else is the opposition — and the same four years
  // mean the opposite thing to them. The board is dressed accordingly rather
  // than telling somebody they are "in government" when they are not in it.
  const inPower = state.primeMinister === human.key;
  const side = forming ? undefined : inPower ? "government" : "opposition";

  const tag = forming
    ? "Coalition talks"
    : state.phase === "rebuilding"
      ? inPower
        ? "The coalition is breaking"
        : "Their coalition is breaking"
      : inPower
        ? "In government"
        : "In opposition";

  const headline = forming
    ? "Buy a majority"
    : state.phase === "rebuilding"
      ? inPower
        ? "Rebuild it or lose it"
        : "One turn to finish them"
      : inPower
        ? "Hold the coalition together"
        : "Take their coalition apart";

  // The two phases run on different clocks — six weeks to build something, four
  // years to keep it — so the pips are the clock you are actually racing.
  const span = forming ? FORMING_DEADLINE : TERM_LENGTH;
  const spent = forming ? state.week : state.governmentYears + 1;
  const label = forming ? "weeks to form a government" : "years of this Knesset";

  return (
    <div className="board" data-phase={state.phase} data-side={side}>
      <header className="hud">
        <div className="hud-left">
          <Emblem className="hud-emblem" />
          <div className="phase-tag">{tag}</div>
          <div className="phase">{headline}</div>
          <div className="clock">
            <span className="pips" title={`${clock} · ${label}`}>
              {Array.from({ length: span }, (_, index) => (
                <span
                  key={index}
                  className={`pip ${index < spent ? "spent" : ""} ${index === spent - 1 ? "now" : ""}`}
                />
              ))}
            </span>
            <span className="clock-text">
              {clock} · {state.parliament}
              {ordinal(state.parliament)} Knesset
            </span>
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
                {player.key === human.key && sharing && <span className="kind"> your seat</span>}
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
          const mine = party.heldBy === human.key;
          const pulling = withdrawFrom.includes(party.key);
          const pending = bids[party.key] ?? [];
          const pendingValue = valueOf(state, pending);
          const current = pulling ? 0 : packageValue(state, party.key);
          const blocked = refusalsAgainst(state, party, human.key);

          return (
            <div
              key={party.key}
              className={`party-card ${active === party.key ? "active" : ""} ${blocked.length ? "blocked" : ""} ${pulling ? "pulling" : ""}`}
              // The bloc colour is handed to the card as a custom property
              // rather than painted onto one element, so the spine, the wash
              // behind the seat count and the hover glow are all the same
              // politics without three copies of the value in the markup.
              style={
                {
                  borderColor: party.heldBy ? playerColour(state, party.heldBy) : "var(--line)",
                  "--bloc": BLOC_COLOUR[party.bloc],
                } as CSSProperties
              }
            >
              <span className="party-spine" />
              {party.heldBy && (
                <span
                  className={`party-ribbon ${mine ? "mine" : ""}`}
                  style={{ background: playerColour(state, party.heldBy) }}
                >
                  {mine ? "yours" : "bought"}
                </span>
              )}
              <button className="party-hit" onClick={() => setActive(party.key)}>
                <div className="party-head">
                  <span className="party-seats">{party.seats}</span>
                  <span className="party-name">{party.name}</span>
                </div>
                {/* How far through a majority this one list gets you. The
                    number above says 12; the bar says 12 is a fifth of the
                    way, which is the thing you are actually deciding. */}
                <div
                  className="party-mandates"
                  title={`${party.seats} of the ${MAJORITY} needed`}
                  style={{ "--share": `${Math.min(100, (party.seats / MAJORITY) * 100)}%` } as CSSProperties}
                >
                  <span />
                </div>
                <div className="party-sub">
                  <span className="bloc" style={{ color: BLOC_COLOUR[party.bloc] }}>
                    {BLOC_LABEL[party.bloc]}
                  </span>
                  <span className="holder" style={{ color: playerColour(state, party.heldBy) }}>
                    {party.heldBy ? playerName(state, party.heldBy) : "unaligned"}
                  </span>
                </div>

                {blocked.length > 0 && (
                  <div className="redline">
                    refuses you over {blocked.map((key) => state.parties[key]?.name).join(", ")}
                  </div>
                )}

                <div className="party-price">
                  <span className="current">{current > 0 ? `holding ${current}bn` : "no offer"}</span>
                  {pendingValue > 0 && <span className="pending">+{pendingValue}bn</span>}
                </div>

                {pending.length > 0 && (
                  <div className="party-chips">
                    {pending.map((key) => (
                      <span key={key} className="mini">
                        {ministryByKey(state, key)?.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              {mine && (
                <button className="pull" onClick={() => toggleWithdraw(party.key)}>
                  {pulling ? "keep them" : "pull out"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="tray">
        <div className="tray-head">
          <span>
            {active
              ? `Offering to ${state.parties[active]?.name}`
              : "Pick a party, then tap portfolios"}
          </span>
          <span className={courting > OFFERS_PER_TURN ? "warn" : "ok"}>
            {courting} of {OFFERS_PER_TURN} tables ·{" "}
            {valueOf(state, hand.filter((k) => !assigned.has(k)))}bn still in hand
          </span>
        </div>

        <div className="chips">
          {hand.map((key) => {
            const ministry = ministryByKey(state, key);
            if (!ministry) return null;
            const used = assigned.has(key);
            // Nothing can be put down until a table is chosen to put it on.
            const spent = !used && !active;
            // Three denominations, so the hand can be read by colour at a
            // glance instead of by adding up eighteen numbers.
            const tier = ministry.budget >= 13 ? "high" : ministry.budget >= 7 ? "mid" : "low";
            return (
              <button
                key={key}
                className={`chip ${used ? "used" : ""} ${spent ? "spent" : ""}`}
                data-tier={tier}
                onClick={() => toggleMinistry(key)}
                title={`${ministry.name} — ${ministry.budget}bn`}
              >
                <span className="chip-coin">{ministry.budget}</span>
                <span className="chip-name">{ministry.name}</span>
              </button>
            );
          })}
          {hand.length === 0 && (
            <span className="muted">
              Everything you have is promised. Pull out of a partner to free a portfolio.
            </span>
          )}
        </div>

        <div className="commit-row">
          <button className="commit" disabled={problems.length > 0 || busy} onClick={() => {
            onCommit(offer);
            reset();
          }}>
            {busy ? "Resolving…" : state.phase === "forming" ? "End the week" : "End the year"}
          </button>
          <button className="ghost" onClick={reset}>
            Clear
          </button>
          <span className="need">
            {Math.max(0, MAJORITY - blocSeats(state, human.key))} more mandates for a majority
          </span>
          {problems.length > 0 && <span className="problem">{problems[0].message}</span>}
        </div>
      </div>
    </div>
  );
};
