import { useCallback, useEffect, useState } from "react";

import type { Action } from "./engine/actions";
import { applyAction, isLegal } from "./engine/actions";
import { newGame } from "./engine/generator";
import type { GameState } from "./engine/types";
import { AgreementPanel } from "./ui/AgreementPanel";
import { Header } from "./ui/Header";
import { LogPanel } from "./ui/LogPanel";
import { NegotiationPanel } from "./ui/NegotiationPanel";
import { PartyList } from "./ui/PartyList";
import { EndScreen, StartScreen } from "./ui/Screens";

const SAVE_KEY = "kingmaker.save.v1";

const loadSave = (): GameState | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    // A save from an older rules version is not worth resurrecting.
    if (!parsed.parliament?.parties || typeof parsed.day !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const App = () => {
  const [state, setState] = useState<GameState | null>(() => loadSave());
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      else localStorage.removeItem(SAVE_KEY);
    } catch {
      // Private browsing, quota, or a hostile iframe: the game plays on regardless.
    }
  }, [state]);

  const start = useCallback((seed?: number) => {
    const next = newGame(seed === undefined ? {} : { seed });
    setState(next);
    setSelected(null);
    setMessage(null);
  }, []);

  const runAction = useCallback(
    (action: Action) => {
      setState((current) => {
        if (!current || !isLegal(current, action)) return current;
        const result = applyAction(current, action);
        const lines = [result.message, ...result.events.map((event) => event.text)];
        setMessage(lines.filter(Boolean).join(" "));
        return result.state;
      });
    },
    [],
  );

  if (!state) return <StartScreen onStart={start} />;

  if (state.finished) {
    return (
      <EndScreen
        state={state}
        onRestart={() => {
          setState(null);
          setSelected(null);
        }}
        onReplay={() => start(state.seed)}
      />
    );
  }

  const selectedKey = selected ?? state.playerKey;

  return (
    <div className="app">
      <Header
        state={state}
        onRestart={() => {
          setState(null);
          setSelected(null);
          setMessage(null);
        }}
      />

      {message && (
        <div className="toast" style={{ marginTop: 12 }}>
          {message}
        </div>
      )}

      <div className="board">
        <div className="column">
          <PartyList state={state} selected={selectedKey} onSelect={setSelected} />
        </div>

        <div className="column">
          <NegotiationPanel
            /* A fresh draft whenever the day turns or the target changes. */
            key={`${selectedKey}-${state.day}`}
            state={state}
            partyKey={selectedKey}
            onAction={runAction}
          />
        </div>

        <div className="column">
          <AgreementPanel state={state} onAction={runAction} />
          <LogPanel state={state} />
        </div>
      </div>
    </div>
  );
};
