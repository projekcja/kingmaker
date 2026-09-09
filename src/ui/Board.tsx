import { useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

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
  moodOf,
  packageFace,
  packageValue,
  redLinesFor,
  reservedMinistries,
  reservedValue,
  refusalsAgainst,
  valueOf,
} from "../engine/types";
import { Chamber } from "./Chamber";
import { Dispatch } from "./Dispatch";
import { Bill } from "./Bill";
import { Emblem } from "./Emblem";
import { RedLines } from "./RedLines";
import { BLOC_COLOUR, playerColour, playerName } from "./format";

interface Props {
  state: GameState;
  onCommit: (offer: Offer) => void;
  busy?: boolean;
  /** Which seat is looking. Defaults to the first human, for a solo campaign. */
  seat?: string;
  /** Open a fuller account from the side panel. */
  onOpenReport?: (kind: "turn" | "election" | "history") => void;
}

/**
 * The whole game on one screen.
 *
 * Pick up to three parties, drop as many portfolios on them as you like, send
 * it. What a party is already being paid is public, so poaching is an informed
 * decision rather than a guess — the hidden part is only what your rivals are
 * doing this turn.
 */
export const Board = ({ state, onCommit, busy = false, seat, onOpenReport }: Props) => {
  const human =
    state.players.find((player) => player.key === seat) ??
    state.players.find((player) => player.kind === "human");
  const targets = biddableParties(state);

  const [bids, setBids] = useState<Record<string, string[]>>({});
  const [withdrawFrom, setWithdrawFrom] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // The bill pencilled in for this year. Null is "pass nothing", which is a
  // choice rather than the absence of one, and it is also the default.
  const [law, setLaw] = useState<string | null>(null);

  const offer: Offer = useMemo(
    () => ({
      bids: Object.entries(bids)
        .filter(([, ministries]) => ministries.length > 0)
        .map(([partyKey, ministries]) => ({ partyKey, ministries })),
      withdrawFrom,
      law,
    }),
    [bids, withdrawFrom, law],
  );

  const problems = useMemo(
    () => (human ? validateOffer(state, human.key, offer) : []),
    [state, human, offer],
  );

  if (!human) return null;

  // Two people at one keyboard need telling which board they are looking at.
  const sharing = state.players.filter((player) => player.kind === "human").length > 1;
  const hand = availableMinistries(state, human.key, offer);
  // Portfolios your own party has claimed for its own MKs, which never reach
  // the hand at all. Proportional to the list you lead, so leading a giant is
  // no longer free.
  const kept = reservedMinistries(state, human.key);
  const keptValue = reservedValue(state, human.key);
  const assigned = new Set(Object.values(bids).flat());
  // The week's diary: which parties already have something in front of them.
  // This is the only resource the game actually rations, and until it was drawn
  // the rule was invisible — tapping a portfolio for a fourth party silently
  // did nothing at all.
  const booked = offer.bids.map((bid) => bid.partyKey);
  const courting = booked.length;
  const diaryFull = courting >= OFFERS_PER_TURN;

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

  /**
   * Arrow keys walk a group of controls; Tab still leaves it.
   *
   * Every control here is already a real button, so the keyboard could always
   * reach them — but a turn is eighteen portfolios and up to a dozen parties,
   * and reaching the last one meant thirty presses of Tab. Arrows move inside
   * the group and wrap, which is what makes the board playable without a mouse
   * rather than merely operable.
   */
  const walk = (selector: string) => (event: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(selector)].filter(
      (item) => !item.disabled,
    );
    const here = items.indexOf(document.activeElement as HTMLButtonElement);
    if (here === -1) return;
    event.preventDefault();
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    items[(here + (forward ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const canCommit = problems.length === 0 && !busy;

  /** Give a meeting back: clears that party's table, freeing the slot. */
  const clearTable = (partyKey: string) =>
    setBids((current) => {
      const next = { ...current };
      delete next[partyKey];
      return next;
    });

  const reset = () => {
    setBids({});
    setWithdrawFrom([]);
    setLaw(null);
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
    <div
      className="board"
      data-phase={state.phase}
      data-side={side}
      onKeyDown={(event) => {
        // The turn is the one action worth a shortcut, and it is the one that
        // is furthest from wherever the hand is when it is ready to be sent.
        if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
        if (!canCommit) return;
        event.preventDefault();
        onCommit(offer);
        reset();
      }}
    >
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

      {/* Below the header the screen is the board you act on, with what just
          happened kept in the margin beside it. The chamber goes in the acting
          column rather than across the whole width: centred over the page it
          sits off-centre from the cards underneath it, which are the same
          subject drawn twice. */}
      <div className="board-body">
        <div className="board-main">
          <Chamber state={state} />

        <div className="parties" onKeyDown={walk(".party-hit")}>
          {targets.map((party) => {
            const mine = party.heldBy === human.key;
            const pulling = withdrawFrom.includes(party.key);
            const pending = bids[party.key] ?? [];
            const pendingValue = valueOf(state, pending);
            const current = pulling ? 0 : packageValue(state, party.key);
            // What the portfolios are worth on paper, before the party's mood
            // is applied — the two differ exactly when a law has landed.
            const face = pulling ? 0 : packageFace(state, party.key);
            const mood = moodOf(state, party.key);
            const blocked = refusalsAgainst(state, party, human.key);
            // Who this list will not sit with, whoever ends up holding it.
            // `blocked` is the same fact asked from inside your bloc; these are
            // the partners buying it would cost you later, which is a price
            // the card never quoted.
            const forecloses = redLinesFor(state, party.key).filter(
              (key) => !blocked.includes(key),
            );

            return (
              <div
                key={party.key}
                className={`party-card ${active === party.key ? "active" : ""} ${blocked.length ? "blocked" : ""} ${pulling ? "pulling" : ""} ${diaryFull && pending.length === 0 ? "shut" : ""}`}
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
                <button
                className="party-hit"
                aria-pressed={active === party.key}
                onClick={() => setActive(party.key)}
                title={
                  diaryFull && pending.length === 0
                    ? `No meetings left this ${forming ? "week" : "year"} — cancel one to court ${party.name}`
                    : undefined
                }
              >
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

                  {forecloses.length > 0 && (
                    <div className="redline soft">
                      <span className="redline-mark" aria-hidden="true" />
                      won't sit with{" "}
                      {forecloses.map((key) => state.parties[key]?.name).join(", ")}
                    </div>
                  )}

                  <div className="party-price">
                    <span className="current">{current > 0 ? `holding ${current}bn` : "no offer"}</span>
                    {pendingValue > 0 && <span className="pending">+{pendingValue}bn</span>}
                    {/* What a law did to them. The number above already has the
                        discount in it — this says why it is not the sum of the
                        portfolios on the card. */}
                    {mood && face !== current && (
                      <span
                        className={`party-mood ${mood.delta > 0 ? "pleased" : "angry"}`}
                        title={`${party.name} ${mood.delta > 0 ? "is pleased about" : "is furious about"} ${mood.because}. The ${face}bn holding them counts as ${current}bn until it wears off.`}
                      >
                        {mood.delta > 0 ? "pleased" : "angry"} · {face}bn
                      </span>
                    )}
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
          {/* The government's one act of the year, above the diary because it
              is the only thing on this screen that is not an auction. */}
          <Bill state={state} chosen={law} onChoose={setLaw} yours={inPower} />

          {/* The diary. Three meetings is the only thing the game rations, and
              it was being reported as "0 of 3 tables" in the corner — a number
              nobody reads until they have already been refused by it. Drawn as
              the slots themselves, what is spent and what is left is the first
              thing on the tray rather than a footnote on it. */}
          <div className="diary">
            <div className="diary-head">
              <span className="diary-title">
                {forming ? "This week's diary" : "This year's diary"}
              </span>
              <span className={`diary-count ${diaryFull ? "full" : ""}`}>
                {diaryFull
                  ? "no meetings left"
                  : `${OFFERS_PER_TURN - courting} of ${OFFERS_PER_TURN} still free`}
              </span>
            </div>

            <div className="diary-slots">
              {Array.from({ length: OFFERS_PER_TURN }, (_, slot) => {
                const partyKey = booked[slot];
                if (!partyKey) {
                  return (
                    <span key={slot} className="diary-slot free">
                      free
                    </span>
                  );
                }
                return (
                  <button
                    key={slot}
                    className="diary-slot booked"
                    onClick={() => clearTable(partyKey)}
                    title={`Cancel the meeting with ${state.parties[partyKey]?.name}`}
                  >
                    <span className="diary-slot-name">{state.parties[partyKey]?.name}</span>
                    <span className="diary-slot-value">
                      {valueOf(state, bids[partyKey] ?? [])}bn
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="diary-rule">
              {/* One interpolation, so the number and the noun stay one text node:
                  split, React puts a comment between them and the sentence is no
                  longer searchable in the rendered page. */}
              You can sit down with <b>{`${OFFERS_PER_TURN} parties`}</b>{" "}
              {forming ? "a week" : "a year"}, and that is the whole restriction — put as
              much of your hand in front of each as you like. The diary is the scarce
              thing, not the money.
            </p>
          </div>

          <div className="tray-head">
            <span
              role="status"
              aria-live="polite"
              className={diaryFull && active && !booked.includes(active) ? "warn" : ""}
            >
              {diaryFull && active && !booked.includes(active)
                ? `The diary is full. Cancel a meeting to sit down with ${state.parties[active]?.name}.`
                : active
                  ? `Offering to ${state.parties[active]?.name}`
                  : "Pick a party, then tap portfolios"}
            </span>
            <span className="ok">
              {valueOf(state, hand.filter((k) => !assigned.has(k)))}bn still in hand
            </span>
          </div>

          {/* What your own list has taken off the table before you start.
              Drawn beside the hand rather than announced once, because the
              question it answers — "why can I only spend this much" — is asked
              every single turn. */}
          {kept.length > 0 && (
            <div className="kept" title="Your own MKs hold these. The bigger your list, the more of the cabinet it eats.">
              <span className="kept-label">
                {state.parties[human.partyKey]?.name} keeps {keptValue}bn
              </span>
              <span className="kept-list">
                {kept
                  .map((key) => ministryByKey(state, key)?.name)
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </div>
          )}

          <div className="chips" onKeyDown={walk(".chip")}>
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
                  aria-pressed={used}
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
            <button
              className="commit"
              disabled={!canCommit}
              title="Ctrl+Enter"
              onClick={() => {
                onCommit(offer);
                reset();
              }}
            >
              {busy ? "Resolving…" : state.phase === "forming" ? "End the week" : "End the year"}
            </button>
            <button className="ghost" onClick={reset}>
              Clear
            </button>
            <span className="need">
              {Math.max(0, MAJORITY - blocSeats(state, human.key))} more mandates for a majority
            </span>
            {problems.length > 0 && (
              <span role="status" aria-live="polite" className="problem">
                {problems[0].message}
              </span>
            )}
          </div>
        </div>

        {/*
         * The whole map of who refuses whom, at the very bottom of the column.
         *
         * It went between the party cards and the tray first, which put the
         * two halves of a single move — pick a party, then tap portfolios at
         * it — a scroll apart. Those two have to stay adjacent: the turn is
         * played by going back and forth between them a dozen times. The map
         * is read once before a turn and then not again, so it is the one
         * thing here that can afford to be below the fold.
         */}
        <RedLines state={state} seat={human.key} />
        </div>

        <Dispatch state={state} onOpen={(kind) => onOpenReport?.(kind)} />
      </div>
    </div>
  );
};
