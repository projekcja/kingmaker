/**
 * The trophy case: the two views of the achievements.
 *
 * Named for the case rather than for its contents, because `achievements.ts`
 * next door holds the achievements themselves and two modules whose names
 * differ only in case are indistinguishable on a case-insensitive filesystem —
 * which is most of them. TypeScript resolves `./Achievements` to whichever it
 * loaded first there and then reports the exports of the wrong one.
 */

import type { Achievement } from "./achievements";
import { ACHIEVEMENTS } from "./achievements";

/** The trophy case: every achievement that exists, earned ones lit up. */
export const AchievementStrip = ({ unlocked }: { unlocked: Set<string> }) => (
  <div className="achievements">
    {ACHIEVEMENTS.map((achievement) => (
      <div
        key={achievement.key}
        className={`achievement ${unlocked.has(achievement.key) ? "earned" : ""}`}
        title={achievement.text}
      >
        <span className="achievement-dot" />
        <span className="achievement-title">{achievement.title}</span>
      </div>
    ))}
  </div>
);

/** A trophy just won, surfaced for a few seconds over whatever is on screen. */
export const AchievementToast = ({ achievement }: { achievement: Achievement }) => (
  <div className="achievement-toast" role="status">
    <span className="achievement-toast-label">Achievement unlocked</span>
    <span className="achievement-toast-title">{achievement.title}</span>
    <span className="achievement-toast-text">{achievement.text}</span>
  </div>
);
