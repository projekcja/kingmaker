import { useState } from "react";

import { WILDS, legalPlays, wildById } from "../engine/wilds";
import type { WildPlay } from "../engine/wilds";
import type { GameState } from "../engine/types";
import { playerOf } from "../engine/types";

/**
 * The cards in your hand, and the one you are spending this turn.
 *
 * Everything else on this screen is money: it is counted, it is compared, and
 * the better offer wins. A wild is the opposite kind of decision — there is
 * exactly one, it does not scale, and the whole question is *when*. So it is
 * drawn as cards rather than as chips, and a card that cannot be played this
 * turn stays on the table greyed rather than disappearing: knowing that the
 * whip is unplayable because you hold nothing is the card teaching you the rule.
 *
 * It sits below the portfolio chips and above the commit row, which is where a
 * reshuffle's effect shows up — the freed portfolios land in the hand above it
 * the moment the card is pencilled in, in the same envelope, before anything is
 * sealed.
 *
 * A targeted card opens its own list of legal targets rather than asking the
 * player to aim at the party cards. The board above is an auction surface, and
 * making a party card mean two different things depending on what is selected
 * elsewhere is the sort of mode the rest of this interface does without.
 */

interface Props {
  state: GameState;
  seat: string;
  /** The play pencilled in, or null for holding everything. */
  chosen: WildPlay | null;
  onChoose: (play: WildPlay | null) => void;
}

const same = (a: WildPlay | null, b: WildPlay | null): boolean =>
  a?.id === b?.id && (a?.partyKey ?? null) === (b?.partyKey ?? null);

export const Hand = ({ state, seat, chosen, onChoose }: Props) => {
  // Which card is face up, which is not the same as which is being played: a
  // targeted card is picked up before it is aimed, and a half-aimed card must
  // never reach the envelope — an offer carrying a target-less ultimatum is
  // invalid, and would block the commit behind a message about a rule the
  // player has not broken.
  const [open, setOpen] = useState<string | null>(null);

  const held = playerOf(state, seat).hand;
  if (held.length === 0) return null;

  const plays = legalPlays(state, seat);
  // Held in duplicate is still one decision: you may only play one a turn, so a
  // second copy is a card for next week, not a second row.
  const ids = [...new Set(held)];
  const facing = chosen?.id ?? open;

  return (
    <div className="hand-panel" id="your-hand">
      <div className="hand-head">
        <span className="hand-title">Your hand</span>
        <span className="hand-note">
          {chosen
            ? `playing ${wildById(chosen.id)?.title ?? chosen.id}`
            : held.length === 1
              ? "one card, and no obligation to spend it"
              : `${held.length} cards, one playable a turn`}
        </span>
      </div>

      <div className="hand-cards">
        {ids.map((id) => {
          const card = WILDS.find((entry) => entry.id === id);
          if (!card) return null;
          const targets = plays.filter((play) => play.id === id);
          const dead = targets.length === 0;
          const copies = held.filter((entry) => entry === id).length;
          const playing = chosen?.id === id;
          const up = facing === id;

          return (
            <div
              key={id}
              className={["wild", playing && "on", dead && "dead"].filter(Boolean).join(" ")}
            >
              <button
                type="button"
                className="wild-face"
                disabled={dead}
                aria-pressed={playing}
                aria-expanded={card.targeted ? up : undefined}
                onClick={() => {
                  if (up) {
                    setOpen(null);
                    return onChoose(null);
                  }
                  setOpen(id);
                  // An untargeted card is the whole decision, and a targeted
                  // card with one legal target has already made it. Anything
                  // else is picked up now and aimed below.
                  if (!card.targeted || targets.length === 1) onChoose(targets[0] ?? null);
                }}
              >
                <span className="wild-head">
                  <span className="wild-title">{card.title}</span>
                  {copies > 1 && <span className="wild-copies">{`×${copies}`}</span>}
                </span>
                <span className="wild-effect">{card.effect}</span>
                {dead && (
                  <span className="wild-dead">
                    Nothing on the board to play it against this week.
                  </span>
                )}
              </button>

              {/* The targets, once the card is picked up. Named lists rather
                  than a mode over the board above. Nothing is pencilled in
                  until one is picked, so a card put down half-aimed is simply
                  a card not played. */}
              {up && card.targeted && targets.length > 1 && (
                <div
                  className="wild-targets"
                  role="radiogroup"
                  aria-label={`${card.title}: against whom`}
                >
                  {targets.map((play) => (
                    <button
                      key={play.partyKey}
                      type="button"
                      role="radio"
                      aria-checked={same(play, chosen)}
                      className={`wild-target ${same(play, chosen) ? "on" : ""}`}
                      onClick={() => onChoose(play)}
                    >
                      {state.parties[play.partyKey!]?.name ?? play.partyKey}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
