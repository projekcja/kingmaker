/**
 * A static shot of every screen, for looking at the design without playing to
 * each one. Renders the real components with the real stylesheet, so what comes
 * out is what the browser draws; it is a contact sheet, not a build artifact.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { renderToString } from "react-dom/server";

import { greedyOffer } from "../src/bots";
import { applyAction, newCampaign } from "../src/engine/campaign";
import { Rng } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";
import { Board } from "../src/ui/Board";
import { Reveal } from "../src/ui/Reveal";
import { Setup } from "../src/ui/Setup";

const noop = () => undefined;

const play = (state: GameState, turns: number): GameState => {
  let next = state;
  const rng = new Rng(7);
  for (let turn = 0; turn < turns && next.phase !== "over"; turn += 1) {
    next = applyAction(next, {
      type: "offer",
      playerKey: "you",
      offer: greedyOffer(next, "you", rng),
    }).state;
  }
  return next;
};

const forming = newCampaign({ seed: 12, bots: ["greedy"] });

// Stop the moment a government exists: the interesting screen is a coalition
// being held together, not the epilogue after somebody has already won.
let governing = forming;
for (let turn = 0; turn < 60 && governing.phase === "forming"; turn += 1) {
  governing = play(governing, 1);
}

const css = readFileSync("src/styles.css", "utf8");
const panel = (title: string, body: string) =>
  `<section class="preview-panel"><h4 class="preview-label">${title}</h4>${body}</section>`;

const out = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Kingmaker — screens</title>
<style>${css}
.preview-label {
  font: 700 10px/1 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.16em;
  text-transform: uppercase; color: #5d6678; margin: 34px 0 6px 20px;
}
/*
 * Every panel is its own containing block for fixed positioning.
 *
 * Three things on these screens are position: fixed -- each phase's backdrop,
 * and the reveal. On one sheet they all resolve against the viewport, so the
 * reveal covered the whole contact sheet and one backdrop was painted over the
 * lot. A transform makes a fixed descendant resolve against the panel instead,
 * which is what turns this back into a contact sheet.
 */
.preview-panel {
  position: relative; transform: translateZ(0); overflow: hidden;
  min-height: 620px;
}
</style></head><body>
${panel("setup", renderToString(<Setup onStart={noop} />))}
${panel("forming", renderToString(<Board state={forming} onCommit={noop} />))}
${panel(
  `${governing.phase} — ${governing.primeMinister === "you" ? "government" : "opposition"}`,
  renderToString(<Board state={governing} onCommit={noop} />),
)}
${panel(
  "reveal",
  governing.lastTurn
    ? renderToString(<Reveal state={governing} result={governing.lastTurn} onClose={noop} />)
    : "<p>no turn</p>",
)}
</body></html>`;

writeFileSync(process.argv[2] ?? "preview.html", out);
console.log(`wrote ${process.argv[2]} — ${governing.phase}, pm=${governing.primeMinister}`);
