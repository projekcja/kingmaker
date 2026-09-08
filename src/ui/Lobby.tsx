import { useEffect, useState } from "react";

import { RULES_VERSION } from "../engine/types";
import { playerId, playerName, setPlayerName } from "../net/identity";
import type { GameRecord } from "../net/transport";
import { newGameId } from "../net/transport";
import { transport } from "../net/useGame";

interface LobbyProps {
  onOpen: (id: string) => void;
}

const buildRecord = (seed: number | undefined): GameRecord => ({
  id: newGameId(),
  seed: seed ?? Math.floor(Math.random() * 2 ** 31),
  rulesVersion: RULES_VERSION,
  daysTotal: 28,
  partyCount: 8,
  totalSeats: 120,
  seats: {},
  players: { [playerId()]: playerName() },
  status: "lobby",
  createdAt: Date.now(),
});

export const LobbyScreen = ({ onOpen }: LobbyProps) => {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [seed, setSeed] = useState("");
  const [joinId, setJoinId] = useState("");
  const [name, setName] = useState(playerName());

  const refresh = () => void transport.listGames().then(setGames);
  useEffect(refresh, []);

  const create = async () => {
    const record = buildRecord(seed ? Number(seed) : undefined);
    await transport.createGame(record);
    onOpen(record.id);
  };

  return (
    <div className="screen">
      <h1>Kingmaker</h1>
      <div className="tagline">
        Twenty-eight days to build a government out of people who cannot stand each other.
      </div>

      <p>
        Start a table, then decide which parties are played by people and which are played by the
        engine. Every game is saved as it is played, so you can close the tab and come back to it.
      </p>

      <ul className="rules">
        <li>
          <strong>Everything costs days.</strong> A meeting takes one, a full negotiation two, and
          the mandate does not extend.
        </li>
        <li>
          <strong>You pay in ministries and in policy.</strong> Both are finite, and every position
          you promise one party is read by all the others.
        </li>
        <li>
          <strong>Leverage is structural.</strong> A party that sits on every route to a majority
          knows it. Open a second route and its price falls on its own.
        </li>
        <li>
          <strong>Your own party is watching.</strong> Concede too much and they will replace you
          before the voters get the chance.
        </li>
      </ul>

      <div className="seed-row">
        <button className="primary" onClick={() => void create()}>
          New game
        </button>
        <input
          type="text"
          inputMode="numeric"
          placeholder="seed (optional)"
          value={seed}
          onChange={(event) => setSeed(event.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      <div className="section" style={{ borderTop: "none", padding: "22px 0 0" }}>
        <div className="section-title">You</div>
        <div className="seed-row" style={{ marginTop: 0 }}>
          <input
            type="text"
            style={{ width: 200 }}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setPlayerName(name)}
          />
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            this tab is one player — open a second tab to be another
          </span>
        </div>
      </div>

      <div className="section" style={{ borderTop: "none", padding: "22px 0 0" }}>
        <div className="section-title">Join a table</div>
        <div className="seed-row" style={{ marginTop: 0 }}>
          <input
            type="text"
            placeholder="game id"
            value={joinId}
            onChange={(event) => setJoinId(event.target.value.trim())}
          />
          <button disabled={!joinId} onClick={() => onOpen(joinId)}>
            Join
          </button>
        </div>
      </div>

      {games.length > 0 && (
        <div className="section" style={{ borderTop: "none", padding: "22px 0 0" }}>
          <div className="section-title">Saved games</div>
          <table className="table">
            <tbody>
              {games.map((game) => (
                <tr key={game.id}>
                  <td>
                    <button
                      style={{ border: "none", background: "none", padding: 0 }}
                      onClick={() => onOpen(game.id)}
                    >
                      {game.id}
                    </button>
                  </td>
                  <td>
                    {game.status === "lobby" ? "seating" : "in play"} · seed {game.seed} ·{" "}
                    {Object.keys(game.seats).length || "no"} human seats
                    {game.rulesVersion !== RULES_VERSION && " · old rules"}
                    <button
                      className="danger"
                      style={{ marginLeft: 10, padding: "2px 8px", fontSize: 11 }}
                      onClick={async () => {
                        await transport.deleteGame(game.id);
                        refresh();
                      }}
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface SeatingProps {
  record: GameRecord;
  /** Replayed from the seed so the lobby can show the real parliament. */
  parties: Array<{ key: string; name: string; leader: string; seats: number }>;
  formateurKey: string;
  onSave: (record: GameRecord) => void;
  onLeave: () => void;
}

export const SeatingScreen = ({
  record,
  parties,
  formateurKey,
  onSave,
  onLeave,
}: SeatingProps) => {
  const me = playerId();
  const mySeat = Object.entries(record.seats).find(([, holder]) => holder === me)?.[0] ?? null;

  const claim = (partyKey: string) => {
    const seats = { ...record.seats };
    // One seat each: taking a new party gives up the old one.
    for (const [key, holder] of Object.entries(seats)) if (holder === me) delete seats[key];
    if (mySeat !== partyKey) seats[partyKey] = me;
    onSave({
      ...record,
      seats,
      players: { ...record.players, [me]: playerName() },
    });
  };

  return (
    <div className="screen">
      <div className="outcome-tag government">table {record.id}</div>
      <h1>Take your seats</h1>
      <p>
        Whoever holds the <strong>{parties.find((p) => p.key === formateurKey)?.name}</strong> has
        the mandate and forms the government. Any party a person claims answers offers itself;
        every other party is played by the engine. Seats lock when the game starts.
      </p>

      <table className="table" style={{ marginTop: 18 }}>
        <tbody>
          {parties.map((party) => {
            const holder = record.seats[party.key];
            const isMine = holder === me;
            return (
              <tr key={party.key}>
                <td>
                  {party.name}
                  {party.key === formateurKey && (
                    <span className="chip gold" style={{ marginLeft: 8 }}>
                      mandate
                    </span>
                  )}
                </td>
                <td>{party.seats}</td>
                <td>
                  {holder ? record.players[holder] ?? "a player" : "engine"}
                  <button
                    style={{ marginLeft: 10, padding: "2px 8px", fontSize: 11 }}
                    disabled={holder !== undefined && !isMine}
                    onClick={() => claim(party.key)}
                  >
                    {isMine ? "give up" : "sit here"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ marginTop: 18, fontSize: 12.5 }}>
        Open this page in a second tab and join table <strong>{record.id}</strong> to sit somebody
        else down. Leave every seat empty for a game played entirely against the engine.
      </p>

      <div className="seed-row">
        <button className="primary" onClick={() => onSave({ ...record, status: "playing" })}>
          Start the mandate
        </button>
        <button onClick={onLeave}>Back</button>
      </div>
    </div>
  );
};
