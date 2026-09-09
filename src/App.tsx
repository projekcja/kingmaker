import { useCallback, useEffect, useState } from "react";

import { humanPlayers, pendingSeat } from "./engine/campaign";
import { RULES_VERSION, TERM_LENGTH } from "./engine/types";
import type { ElectionResult, Offer, PlayerKind, TurnResult } from "./engine/types";
import { newGameId } from "./net/transport";
import { transport, useGame } from "./net/useGame";
import { Board } from "./ui/Board";
import { ElectionReport } from "./ui/ElectionReport";
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
  /** The seat the screen has been handed to, as `turn:player`. Hot seat only. */
  const [handedTo, setHandedTo] = useState<string | null>(null);
  const game = useGame(gameId);

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
    setHandedTo(null);
  }, [gameId]);

  if (!gameId) return <Setup onStart={(options) => void start(options)} />;
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

  const openReport = (kind: "turn" | "election") => {
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
    </>
  );
};
