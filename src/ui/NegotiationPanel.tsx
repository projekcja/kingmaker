import { useState } from "react";

import type { Action } from "../engine/actions";
import { actionCost } from "../engine/actions";
import {
  askingPrice,
  baseLoyalty,
  evaluate,
  TEMPERATURE_TEXT,
  temperature,
} from "../engine/negotiation";
import type { GameState, Offer } from "../engine/types";
import { describeIdeology, isHumanSeat, optionLabel, portfoliosOf } from "../engine/types";
import { moodLabel, partyColour, pragmatismLabel, priceBand } from "./format";

interface Props {
  state: GameState;
  partyKey: string;
  onAction: (action: Action) => void;
}

/** What the coalition would look like if this package were accepted. */
const project = (state: GameState, offer: Offer): GameState => {
  const portfolios: Record<string, string> = {};
  for (const [key, holder] of Object.entries(state.coalition.portfolios)) {
    if (holder !== offer.partyKey) portfolios[key] = holder;
  }
  for (const key of offer.portfolios) portfolios[key] = offer.partyKey;

  return {
    ...state,
    coalition: {
      members: state.coalition.members.includes(offer.partyKey)
        ? state.coalition.members
        : [...state.coalition.members, offer.partyKey],
      portfolios,
      commitments: { ...state.coalition.commitments, ...offer.commitments },
    },
  };
};

/** The panel shown when the player selects their own party. */
const OwnParty = ({ state, onAction }: { state: GameState; onAction: (a: Action) => void }) => {
  const player = state.parliament.parties[state.playerKey];
  const held = portfoliosOf(state.coalition, state.playerKey);

  return (
    <section className="panel negotiation">
      <div className="panel-body">
        <h3 style={{ color: partyColour(player.ideology) }}>{player.name}</h3>
        <div className="leader">
          {player.leader} · {player.seats} seats · your own people
        </div>
        <p style={{ color: "var(--paper-dim)", fontSize: 13 }}>
          Every ministry you hand out and every position you write into the agreement is read here
          first. Keep them with you: a leader without a party cannot sign anything.
        </p>
      </div>

      <div className="section">
        <div className="section-title">Ministries you have kept</div>
        <div className="party-meta">
          {held.length === 0 && <span className="chip red">none</span>}
          {held.map((key) => (
            <span key={key} className="chip gold">
              {state.parliament.portfolios[key].name}
            </span>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Where your party stands</div>
        <div className="party-meta">
          <span className="chip">{describeIdeology(player.ideology)}</span>
        </div>
        <div className="actions" style={{ marginTop: 10 }}>
          <button onClick={() => onAction({ type: "rally" })}>
            Rally the faithful (1 day)
          </button>
        </div>
      </div>
    </section>
  );
};

export const NegotiationPanel = ({ state, partyKey, onAction }: Props) => {
  const party = state.parliament.parties[partyKey];

  const [portfolios, setPortfolios] = useState<string[]>(() =>
    portfoliosOf(state.coalition, partyKey),
  );
  const [commitments, setCommitments] = useState<Record<string, number>>({});

  if (partyKey === state.playerKey) return <OwnParty state={state} onAction={onAction} />;

  const isPartner = state.coalition.members.includes(partyKey);
  const offer: Offer = { partyKey, portfolios, commitments };
  const evaluation = evaluate(state, offer);
  const band = temperature(evaluation);

  const projected = project(state, offer);
  const loyaltyNow = baseLoyalty(state);
  const loyaltyAfter = baseLoyalty(projected);
  const loyaltyDrop = loyaltyNow - loyaltyAfter;

  const toggle = (key: string) =>
    setPortfolios((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  const promise = (issueKey: string, position: number) =>
    setCommitments((current) => {
      const next = { ...current };
      if (next[issueKey] === position) delete next[issueKey];
      else next[issueKey] = position;
      return next;
    });

  const ministries = Object.values(state.parliament.portfolios).sort(
    (a, b) => b.prestige - a.prestige,
  );

  return (
    <section className="panel negotiation">
      <div className="panel-body">
        <h3 style={{ color: partyColour(party.ideology) }}>{party.name}</h3>
        <div className="leader">
          {party.leader} · {party.seats} seats · {moodLabel(party.mood)} towards you
        </div>
        <div className="party-meta" style={{ marginTop: 8 }}>
          <span className="chip">{describeIdeology(party.ideology)}</span>
          {party.revealed && <span className="chip">{pragmatismLabel(party)}</span>}
          {party.revealed && (
            <span className="chip gold">asking {priceBand(askingPrice(state, party))}</span>
          )}
        </div>
        <div className="blurb">{party.blurb}</div>

        <div className="actions" style={{ marginTop: 12 }}>
          <button onClick={() => onAction({ type: "meet", partyKey })}>
            {party.revealed ? "Meet again" : "Request a meeting"} (1 day)
          </button>
          <button onClick={() => onAction({ type: "squeeze", partyKey })}>
            Squeeze in public (1 day)
          </button>
          {isPartner && (
            <button className="danger" onClick={() => onAction({ type: "dismiss", partyKey })}>
              Break off talks
            </button>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">What they want</div>
        {party.revealed ? (
          <>
            <div className="party-meta">
              {party.portfolioWants.map((key, index) => (
                <span key={key} className={index === 0 ? "chip gold" : "chip"}>
                  {index + 1}. {state.parliament.portfolios[key].name}
                </span>
              ))}
            </div>
            <div className="party-meta" style={{ marginTop: 6 }}>
              {Object.entries(party.issueSalience)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([issueKey]) => {
                  const issue = state.parliament.issues[issueKey];
                  return (
                    <span key={issueKey} className="chip blue">
                      {issue.name}: {optionLabel(issue, party.ideology[issue.axis])}
                    </span>
                  );
                })}
            </div>
          </>
        ) : (
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 12.5 }}>
            You have not sat down with them. Anything you put on the table now is a guess.
          </p>
        )}
      </div>

      <div className="section">
        <div className="section-title">Ministries offered</div>
        <div className="ministry-grid">
          {ministries.map((portfolio) => {
            const holder = state.coalition.portfolios[portfolio.key];
            const takenByOther = holder !== undefined && holder !== partyKey;
            const on = portfolios.includes(portfolio.key);
            const wantRank = party.portfolioWants.indexOf(portfolio.key);

            const classes = ["ministry"];
            if (on) classes.push("on");
            if (takenByOther) classes.push("disabled");

            return (
              <label
                key={portfolio.key}
                className={classes.join(" ")}
                title={
                  takenByOther
                    ? `Promised to the ${state.parliament.parties[holder].name}`
                    : `Prestige ${portfolio.prestige}`
                }
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={takenByOther}
                  onChange={() => toggle(portfolio.key)}
                />
                <span>
                  {portfolio.name}
                  {party.revealed && wantRank >= 0 && (
                    <span style={{ color: "var(--gold)" }}> ★</span>
                  )}
                </span>
                <span className="prestige">{portfolio.prestige}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Positions promised in the agreement</div>
        {Object.values(state.parliament.issues).map((issue) => {
          const locked = state.coalition.commitments[issue.key];
          return (
            <div key={issue.key} className="issue">
              <div className="issue-name">{issue.name}</div>
              <div className="issue-options">
                {issue.options.map((option) => {
                  const isLocked = locked !== undefined;
                  const on = isLocked
                    ? locked === option.position
                    : commitments[issue.key] === option.position;
                  const classes = ["issue-option"];
                  if (on) classes.push("on");
                  if (isLocked) classes.push("locked");
                  return (
                    <button
                      key={option.label}
                      className={classes.join(" ")}
                      disabled={isLocked}
                      onClick={() => promise(issue.key, option.position)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel-body">
        <div className={`verdict ${party.revealed ? band : "unknown"}`}>
          {party.revealed
            ? TEMPERATURE_TEXT[band]
            : "Without a meeting you cannot read the room. Present it and find out."}
          {evaluation.complaints.length > 0 && party.revealed && (
            <ul className="quotes">
              {evaluation.complaints.map((line) => (
                <li key={line}>“{line}”</li>
              ))}
            </ul>
          )}
        </div>

        {loyaltyDrop > 0.5 && (
          <p style={{ color: "var(--gold)", fontSize: 12.5, marginBottom: 0 }}>
            Admitting them on these terms costs you {Math.round(loyaltyDrop)} points of standing
            in your own party.
          </p>
        )}

        <div className="actions" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => onAction({ type: "offer", offer })}>
            {isHumanSeat(state, partyKey)
              ? `Table the offer with ${party.leader}`
              : `Present the offer (${actionCost(state, { type: "offer", offer })} days)`}
          </button>
          <button
            onClick={() => {
              setPortfolios(portfoliosOf(state.coalition, partyKey));
              setCommitments({});
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  );
};
