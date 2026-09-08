import { useCallback, useEffect, useState } from "react";

import { RULES_VERSION } from "./engine/types";
import type { Allocation, PlayerKind, TurnResult } from "./engine/types";
import { newGameId } from "./net/transport";
import { transport, useGame } from "./net/useGame";
import { Board } from "./ui/Board";
import { playerColour } from "./ui/format";
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
    async (options: { humanParty: string; bots: PlayerKind[]; seed?: number }) => {
      const id = newGameId();
      await transport.createGame({
        id,
        seed: options.seed ?? Math.floor(Math.random() * 2 ** 31),
        rulesVersion: RULES_VERSION,
        humanParty: options.humanParty,
        bots: options.bots,
        createdAt: Date.now(),
      });
      navigate(id);
    },
    [navigate],
  );

  const commit = useCallback(
    async (allocation: Allocation) => {
      const before = game.state?.turn;
      await game.commit(allocation);
      // The reveal is read off the replayed state on the next render.
      void before;
    },
    [game],
  );

  // Show each resolution once, as it arrives.
  useEffect(() => {
    const last = game.state?.lastTurn ?? null;
    if (last && last.turn !== reveal?.turn) setReveal(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state?.lastTurn?.turn]);

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

  return (
    <>
      <Board key={state.turn} state={state} onCommit={(a) => void commit(a)} />
      {game.error && <div className="error-toast">{game.error}</div>}
      {reveal && (
        <Reveal state={state} result={reveal} onClose={() => setReveal(null)} />
      )}
    </>
  );
};
