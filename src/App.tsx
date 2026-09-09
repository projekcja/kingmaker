import { useCallback, useEffect, useRef, useState } from "react";

import { humanPlayers, pendingSeat } from "./engine/campaign";
import { RULES_VERSION, TERM_LENGTH } from "./engine/types";
import type { ElectionResult, GameState, Offer, PlayerKind, TurnResult } from "./engine/types";
import { newGameId } from "./net/transport";
import { transport, useGame } from "./net/useGame";
import type { Achievement } from "./ui/achievements";
import { achievementByKey, loadUnlocked, saveUnlocked, unlockedBy } from "./ui/achievements";
import { AchievementStrip, AchievementToast } from "./ui/Trophies";
import { Board } from "./ui/Board";
import { ElectionReport } from "./ui/ElectionReport";
import { History } from "./ui/History";
import { playerColour } from "./ui/format";
import { currentElection, currentReveal } from "./ui/reports";
import { Reveal } from "./ui/Reveal";
import { Setup } from "./ui/Setup";

/** The open campaign lives in the URL, so a tab can be bookmarked or reloaded. */
const readHash = (): string | null => {
  const match = /^#g=([a-z0-9]+)$/i.exec(window.location.hash);
  return match ? match[1] : null;
};

export const App = () => {
  const [gameId, setGameId] = useState<string | null>(readHash);
  const [reveal, setReveal] = useState<TurnResult | null>(null);
  const [election, setElection] = useState<ElectionResult | null>(null);
  /**
   * The election already put in front of this player, by the turn it happened.
   *
   * Election night follows the reveal rather than replacing it — the turn that
   * brought the government down is worth reading before the result of it — so
   * it opens on the reveal closing, and this is what stops it opening again
   * every time they reopen the reveal from the side panel.
   */
  const [seenElection, setSeenElection] = useState<number | null>(null);
  /**
   * The campaign history, which is only ever opened deliberately.
   *
   * Unlike the other two it is never pushed at the player, so it needs no
   * guard against belonging to a previous campaign — it is read straight off
   * whatever state is on screen, and the reset below closes it.
   */
  const [history, setHistory] = useState(false);
  /** The seat the screen has been handed to, as `turn:player`. Hot seat only. */
  const [handedTo, setHandedTo] = useState<string | null>(null);
  const game = useGame(gameId);

  // Trophies are a browser's, not a campaign's — loaded once and kept beside
  // whatever this session unlocks so a toast never fires twice for the same
  // one. `prevStateRef` and `oppositionRef` are the one-turn-back memory
  // {@link unlockedBy} needs and cannot keep itself; both are wiped whenever
  // the open campaign changes, in the effect just below.
  const [unlockedKeys, setUnlockedKeys] = useState<Set<string>>(() => loadUnlocked());
  const [toast, setToast] = useState<Achievement | null>(null);
  const prevStateRef = useRef<GameState | null>(null);
  const oppositionRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onHashChange = () => setGameId(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((id: string | null) => {
    window.location.hash = id ? `g=${id}` : "";
    setGameId(id);
  }, []);

  const start = useCallback(
    async (options: {
      humanParty: string;
      bots: PlayerKind[];
      seed?: number;
      chamber?: string;
    }) => {
      const id = newGameId();
      await transport.createGame({
        id,
        seed: options.seed ?? Math.floor(Math.random() * 2 ** 31),
        rulesVersion: RULES_VERSION,
        humanParty: options.humanParty,
        bots: options.bots,
        chamber: options.chamber,
        createdAt: Date.now(),
      });
      navigate(id);
    },
    [navigate],
  );

  const commit = useCallback(async (offer: Offer) => game.commit(offer), [game]);

  // Show each resolution once, as it arrives.
  useEffect(() => {
    const last = game.state?.lastTurn ?? null;
    if (last && last.turn !== reveal?.turn) setReveal(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state?.lastTurn?.turn]);

  // Everything the screen is holding belongs to one campaign. Opening another
  // one has to put all of it down: what is on screen, what has been seen, and
  // which seat the keyboard was handed to.
  useEffect(() => {
    setReveal(null);
    setElection(null);
    setSeenElection(null);
    setHistory(false);
    setHandedTo(null);
    prevStateRef.current = null;
    oppositionRef.current = {};
  }, [gameId]);

  // Checked on every turn, against the turn just before it. The first render
  // of a loaded campaign only sets `prevStateRef` — a reload or a fresh visit
  // to an old save must not hand out a trophy for something that happened
  // before this browser was watching.
  useEffect(() => {
    const next = game.state;
    if (!next) return;
    const prev = prevStateRef.current;
    if (prev) {
      const result = next.lastTurn && next.lastTurn.turn === prev.turn ? next.lastTurn : null;
      const newlyUnlocked: string[] = [];
      for (const player of humanPlayers(next)) {
        const hasBeenOpposition = oppositionRef.current[player.key] ?? false;
        for (const key of unlockedBy({ seatKey: player.key, prev, next, result, hasBeenOpposition })) {
          if (!unlockedKeys.has(key)) newlyUnlocked.push(key);
        }
        const inOpposition =
          (next.phase === "governing" || next.phase === "rebuilding") && next.primeMinister !== player.key;
        oppositionRef.current[player.key] = hasBeenOpposition || inOpposition;
      }
      if (newlyUnlocked.length > 0) {
        setUnlockedKeys((current) => {
          const merged = new Set(current);
          for (const key of newlyUnlocked) merged.add(key);
          saveUnlocked(merged);
          return merged;
        });
        const achievement = achievementByKey(newlyUnlocked[0]);
        if (achievement) setToast(achievement);
      }
    }
    prevStateRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state?.turn]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!gameId) return <Setup onStart={(options) => void start(options)} unlocked={unlockedKeys} />;
  if (game.loading) return <div className="setup">Loading…</div>;

  if (!game.record || !game.state) {
    return (
      <div className="setup">
        <h1>No such campaign</h1>
        <p className="lede">{game.error ?? "Nothing is saved under that id in this browser."}</p>
        <button className="commit" onClick={() => navigate(null)}>
          Back
        </button>
      </div>
    );
  }

  const state = game.state;

  if (state.phase === "over") {
    const winner = state.players.find((player) => player.key === state.winner);
    return (
      <div className="setup">
        <div className="tag" style={{ background: playerColour(state, state.winner) }}>
          {state.parliament} parliaments · {state.turn} turns
        </div>
        <h1>{winner?.kind === "human" ? "You win" : `${winner?.name} wins`}</h1>
        <p className="lede">{state.epilogue}</p>
        <div className="scores" style={{ marginTop: 20 }}>
          {state.players.map((player) => (
            <div
              key={player.key}
              className="score"
              style={{ borderColor: playerColour(state, player.key) }}
            >
              <div className="score-name" style={{ color: playerColour(state, player.key) }}>
                {player.name}
              </div>
              <div className="score-row">
                <span className="years">{player.yearsInPower} yr</span>
              </div>
            </div>
          ))}
        </div>
        <div className="commit-row">
          <button className="commit" onClick={() => navigate(null)}>
            New campaign
          </button>
        </div>
        <AchievementStrip unlocked={unlockedKeys} />
      </div>
    );
  }

  // Whose move it is. With one player this is always them; with two sharing a
  // keyboard it changes mid-turn, and the screen has to be covered in between —
  // the offers are sealed, and a shared screen is the one place that can leak.
  const seat = pendingSeat(state) ?? humanPlayers(state)[0] ?? null;
  const sharing = humanPlayers(state).length > 1;
  const token = seat ? `${state.turn}:${seat.key}` : null;
  const covered = sharing && token !== null && handedTo !== token;

  // Held in state, checked against the campaign: a report only stays on screen
  // for as long as it is still this campaign's most recent one.
  const open = {
    reveal: currentReveal(state, reveal),
    election: currentElection(state, election),
  };

  const closeReveal = () => {
    setReveal(null);
    const vote = state.lastElection;
    if (vote && vote.turn === reveal?.turn && seenElection !== vote.turn) {
      setSeenElection(vote.turn);
      setElection(vote);
    }
  };

  const openReport = (kind: "turn" | "election" | "history") => {
    if (kind === "history") {
      setHistory(true);
      return;
    }
    if (kind === "election") {
      if (state.lastElection) setElection(state.lastElection);
      return;
    }
    if (state.lastTurn) setReveal(state.lastTurn);
  };

  return (
    <>
      {covered && seat ? (
        <div className="setup" data-phase={state.phase}>
          <div className="tag" style={{ background: playerColour(state, seat.key) }}>
            {state.phase === "forming"
              ? `Week ${state.week}`
              : `Year ${state.governmentYears + 1} of ${TERM_LENGTH}`}
          </div>
          <h1>{seat.name}, your move</h1>
          <p className="lede">
            Hand the keyboard over. Both of you commit blind, so nothing of this turn is on
            screen until it resolves.
          </p>
          <div className="commit-row">
            <button className="commit" onClick={() => setHandedTo(token)}>
              I am leading {seat.name}
            </button>
          </div>
        </div>
      ) : (
        <Board
          key={token ?? state.turn}
          state={state}
          seat={seat?.key}
          onCommit={(a) => void commit(a)}
          onOpenReport={openReport}
        />
      )}
      {game.error && <div className="error-toast">{game.error}</div>}
      {open.reveal && <Reveal state={state} result={open.reveal} onClose={closeReveal} />}
      {!open.reveal && open.election && (
        <ElectionReport state={state} result={open.election} onClose={() => setElection(null)} />
      )}
      {/* Deliberately opened, so it sits over whatever else is showing. */}
      {history && <History state={state} onClose={() => setHistory(false)} />}
      {toast && <AchievementToast achievement={toast} />}
    </>
  );
};
