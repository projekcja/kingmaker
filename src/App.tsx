import { useCallback, useEffect, useState } from "react";

import type { Action } from "./engine/actions";
import type { GameState } from "./engine/types";
import { whoseTurn } from "./engine/types";
import { playerId } from "./net/identity";
import { startingState } from "./net/replay";
import { useGame } from "./net/useGame";
import { AgreementPanel } from "./ui/AgreementPanel";
import { Header } from "./ui/Header";
import { LobbyScreen, SeatingScreen } from "./ui/Lobby";
import { LogPanel } from "./ui/LogPanel";
import { NegotiationPanel } from "./ui/NegotiationPanel";
import { PartyList } from "./ui/PartyList";
import { ResponsePanel } from "./ui/ResponsePanel";
import { EndScreen } from "./ui/Screens";

/** The open game lives in the URL, so a tab can be shared or bookmarked. */
const readHash = (): string | null => {
  const match = /^#g=([a-z0-9]+)$/i.exec(window.location.hash);
  return match ? match[1] : null;
};

const useHashRoute = (): [string | null, (id: string | null) => void] => {
  const [id, setId] = useState<string | null>(readHash);

  useEffect(() => {
    const onHashChange = () => setId(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: string | null) => {
    window.location.hash = next ? `g=${next}` : "";
    setId(next);
  }, []);

  return [id, navigate];
};

/** Who the board is waiting on, phrased for whoever is reading it. */
const waitingFor = (state: GameState, players: Record<string, string>): string | null => {
  const turn = whoseTurn(state);
  if (turn.playerId === null || turn.playerId === playerId()) return null;
  const who = players[turn.playerId] ?? "another player";
  const party = state.parliament.parties[turn.partyKey];
  return turn.awaitingAnswer
    ? `${who} is deciding whether the ${party.name} accepts your offer.`
    : `${who} is playing the ${party.name}.`;
};

export const App = () => {
  const [gameId, navigate] = useHashRoute();
  const [selected, setSelected] = useState<string | null>(null);
  const game = useGame(gameId);

  if (!gameId) return <LobbyScreen onOpen={(id) => navigate(id)} />;

  if (game.loading) {
    return (
      <div className="screen">
        <p>Opening table {gameId}…</p>
      </div>
    );
  }

  if (!game.record) {
    return (
      <div className="screen">
        <h1>No such table</h1>
        <p>Nothing is saved under “{gameId}” in this browser.</p>
        <div className="seed-row">
          <button className="primary" onClick={() => navigate(null)}>
            Back to the lobby
          </button>
        </div>
      </div>
    );
  }

  if (game.record.status === "lobby") {
    const opening = startingState(game.record);
    return (
      <SeatingScreen
        record={game.record}
        formateurKey={opening.playerKey}
        parties={Object.values(opening.parliament.parties)
          .sort((a, b) => b.seats - a.seats)
          .map((party) => ({
            key: party.key,
            name: party.name,
            leader: party.leader,
            seats: party.seats,
          }))}
        onSave={(record) => void game.saveRecord(record)}
        onLeave={() => navigate(null)}
      />
    );
  }

  const state = game.state;
  if (!state) {
    return (
      <div className="screen">
        <h1>This game cannot be replayed</h1>
        <p>{game.error ?? "The saved moves do not fit the rules this build is running."}</p>
        <div className="seed-row">
          <button className="primary" onClick={() => navigate(null)}>
            Back to the lobby
          </button>
        </div>
      </div>
    );
  }

  if (state.finished) {
    return (
      <EndScreen
        state={state}
        onRestart={() => navigate(null)}
        onReplay={() => navigate(null)}
      />
    );
  }

  const me = playerId();
  const turn = whoseTurn(state);
  const selectedKey = selected ?? state.playerKey;
  const myMove = turn.playerId === null || turn.playerId === me;
  const waiting = waitingFor(state, game.record.players);
  const answering = state.pending !== null && myMove;

  const runAction = (action: Action) => void game.submit(action);

  return (
    <div className="app">
      <Header state={state} onRestart={() => navigate(null)} />

      {waiting && (
        <div className="toast" style={{ marginTop: 12, borderColor: "var(--blue)" }}>
          {waiting}
        </div>
      )}
      {game.error && (
        <div className="toast" style={{ marginTop: 12, borderColor: "var(--red)" }}>
          {game.error}
        </div>
      )}
      {!waiting && game.lastMessage && (
        <div className="toast" style={{ marginTop: 12 }}>
          {game.lastMessage}
        </div>
      )}

      <div className={`board ${myMove ? "" : "locked"}`}>
        <div className="column">
          <PartyList state={state} selected={selectedKey} onSelect={setSelected} />
        </div>

        <div className="column">
          {answering ? (
            <ResponsePanel state={state} onAction={runAction} />
          ) : (
            <NegotiationPanel
              /* A fresh draft whenever the day turns or the target changes. */
              key={`${selectedKey}-${state.day}`}
              state={state}
              partyKey={selectedKey}
              onAction={runAction}
            />
          )}
        </div>

        <div className="column">
          <AgreementPanel state={state} onAction={runAction} />
          <LogPanel state={state} />
        </div>
      </div>
    </div>
  );
};
