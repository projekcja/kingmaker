import { askingPrice, pivotShare } from "../engine/negotiation";
import type { GameState, Party } from "../engine/types";
import { describeIdeology } from "../engine/types";
import { moodLabel, moodTone, partyColour, pragmatismLabel, priceBand } from "./format";

interface Props {
  state: GameState;
  selected: string | null;
  onSelect: (partyKey: string) => void;
}

const statusChips = (state: GameState, party: Party) => {
  const chips: Array<{ text: string; tone: string }> = [];

  if (party.key === state.playerKey) {
    chips.push({ text: "your party", tone: "gold" });
    return chips;
  }
  if (state.coalition.members.includes(party.key)) {
    chips.push({ text: "in coalition", tone: "green" });
  }

  const blocked = party.vetoes.filter((veto) => state.coalition.members.includes(veto));
  if (blocked.length > 0) {
    chips.push({
      text: `red line: ${blocked.map((key) => state.parliament.parties[key].name).join(", ")}`,
      tone: "red",
    });
  }
  if (pivotShare(state, party.key) === 1 && !state.coalition.members.includes(party.key)) {
    chips.push({ text: "unavoidable", tone: "blue" });
  }
  return chips;
};

export const PartyList = ({ state, selected, onSelect }: Props) => {
  const parties = Object.values(state.parliament.parties).sort((a, b) => b.seats - a.seats);

  return (
    <section className="panel">
      <header>
        <h2>The chamber</h2>
        <span className="sub" style={{ color: "var(--muted)", fontSize: 11 }}>
          {state.parliament.totalSeats} seats
        </span>
      </header>

      {parties.map((party) => {
        const classes = ["party"];
        if (party.key === selected) classes.push("selected");
        if (state.coalition.members.includes(party.key)) classes.push("partner");

        return (
          <button
            key={party.key}
            className={classes.join(" ")}
            onClick={() => onSelect(party.key)}
          >
            <div className="party-top">
              <span className="party-name" style={{ color: partyColour(party.ideology) }}>
                {party.name}
              </span>
              <span className="party-seats">{party.seats}</span>
            </div>

            <div className="leader">{party.leader}</div>

            <div className="party-meta">
              {statusChips(state, party).map((chip) => (
                <span key={chip.text} className={`chip ${chip.tone}`}>
                  {chip.text}
                </span>
              ))}
              {party.key !== state.playerKey && (
                <span className={`chip ${moodTone(party.mood)}`}>{moodLabel(party.mood)}</span>
              )}
              {party.revealed && party.key !== state.playerKey && (
                <span className="chip">
                  asking {priceBand(askingPrice(state, party))}
                </span>
              )}
            </div>

            <div className="party-meta">
              <span className="chip">{describeIdeology(party.ideology)}</span>
              {party.revealed && <span className="chip">{pragmatismLabel(party)}</span>}
            </div>

            {party.key === selected && <div className="blurb">{party.blurb}</div>}
          </button>
        );
      })}
    </section>
  );
};
