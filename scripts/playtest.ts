/**
 * Playtest the game with language models, through OpenRouter.
 *
 * `scripts/balance.ts` answers whether the game rewards a good algorithm. This
 * answers a different question: whether the rules can be picked up and played
 * by something that has never seen them, and what it complains about when it
 * has. A model gets the briefing in `src/bots/llm.ts`, the position each turn,
 * and nothing else — no engine internals, no rival offers.
 *
 * Three things come back that matter more than the win rate:
 *   - which rules get broken, counted by validation code. A rule models keep
 *     violating is a rule the interface is probably explaining badly too.
 *   - how many turns it takes them to notice that a losing bid costs nothing.
 *   - their own verdict, asked for at the end of a campaign they just played.
 *
 * Run with:
 *   OPENROUTER_API_KEY=sk-or-... npx vite-node scripts/playtest.ts
 *   npx vite-node scripts/playtest.ts -- --models=anthropic/claude-sonnet-5,openai/gpt-5-mini --games=2
 *   npx vite-node scripts/playtest.ts -- --list-models=claude
 *
 * Every turn is one API call, so a campaign is tens of calls. Start small.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RULES_BRIEF, createLlmStrategy } from "../src/bots/llm";
import type { LlmMove } from "../src/bots/llm";
import type { GameState, PlayerKind } from "../src/engine/types";
import { YEARS_TO_WIN } from "../src/engine/types";
import { playCampaignAsync } from "../tests/harness";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
  if (match) args.set(match[1], match[2] ?? "true");
}

const option = (name: string, fallback: string): string => args.get(name) ?? fallback;
const flag = (name: string): boolean => args.has(name);
const number = (name: string, fallback: number): number => Number(option(name, String(fallback)));

const API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const ENDPOINT = "https://openrouter.ai/api/v1";
const MODELS = option("models", "openai/gpt-5-mini")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const GAMES = number("games", 1);
const MAX_TURNS = number("max-turns", 40);
const ATTEMPTS = number("attempts", 3);
const TEMPERATURE = number("temperature", 0.4);
const OPPONENT = option("opponent", "greedy") as PlayerKind;
const WANT_VERDICT = !flag("no-verdict");
const QUIET = flag("quiet");

const say = (...parts: unknown[]) => {
  if (!QUIET) console.log(...parts);
};

if (!API_KEY) {
  console.error(
    "No OPENROUTER_API_KEY in the environment.\n" +
      "  PowerShell:  $env:OPENROUTER_API_KEY = 'sk-or-...'\n" +
      "  bash:        export OPENROUTER_API_KEY=sk-or-...\n" +
      "Keys come from https://openrouter.ai/keys",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

interface Usage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** List what OpenRouter is actually serving, so no model id has to be guessed. */
const listModels = async (filter: string): Promise<void> => {
  const response = await fetch(`${ENDPOINT}/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const body = (await response.json()) as { data: Array<{ id: string; name: string; pricing?: { prompt?: string } }> };
  const wanted = filter === "true" ? "" : filter.toLowerCase();
  const rows = body.data
    .filter((model) => model.id.toLowerCase().includes(wanted))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const model of rows) {
    const price = model.pricing?.prompt ? `${(Number(model.pricing.prompt) * 1e6).toFixed(2)}/Mtok in` : "";
    console.log(`${model.id.padEnd(48)} ${price}`);
  }
  console.log(`\n${rows.length} models`);
};

/**
 * One completion, with the retries a shared endpoint needs.
 *
 * A model that will not answer at all fails the campaign rather than quietly
 * passing every turn, which would look like a very patient player.
 */
const complete = async (
  model: string,
  messages: Array<{ role: string; content: string }>,
  usage: Usage,
): Promise<string> => {
  let wait = 1000;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Kingmaker playtest",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: TEMPERATURE,
        max_tokens: 800,
        usage: { include: true },
      }),
    });

    // A 402 is usually terminal -- no credit, no game. But OpenRouter also
    // spends one on a full in-flight budget, which is a queue being busy rather
    // than an empty account, and it says so in the body. That one clears on its
    // own, so it is worth the wait the header asks for instead of losing the
    // campaign a dozen turns in.
    let transientPayment = false;
    if (response.status === 402) {
      const body = await response.text();
      if (body.includes("in_flight_budget_exhausted")) transientPayment = true;
      else throw new Error(`${model}: 402 ${body}`);
    }

    if (transientPayment || response.status === 429 || response.status >= 500) {
      if (attempt === 5) throw new Error(`${model}: ${response.status} after 5 tries`);
      // The endpoint knows how long it needs better than a doubling guess does.
      const asked = Number(response.headers.get("retry-after")) * 1000;
      await sleep(Number.isFinite(asked) && asked > 0 ? asked : wait);
      wait *= 2;
      continue;
    }
    if (!response.ok) throw new Error(`${model}: ${response.status} ${await response.text()}`);

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      error?: { message?: string };
    };
    if (body.error) throw new Error(`${model}: ${body.error.message ?? "refused"}`);

    usage.calls += 1;
    usage.promptTokens += body.usage?.prompt_tokens ?? 0;
    usage.completionTokens += body.usage?.completion_tokens ?? 0;
    usage.cost += body.usage?.cost ?? 0;
    return body.choices?.[0]?.message?.content ?? "";
  }
  throw new Error(`${model}: no answer`);
};

// ---------------------------------------------------------------------------
// One campaign
// ---------------------------------------------------------------------------

interface Report {
  model: string;
  campaigns: number;
  wins: number;
  finished: number;
  turns: number[];
  moves: number;
  /** Replies that had to be sent back as illegal, by validation code. */
  broken: Record<string, number>;
  /** Turns where no attempt produced a legal move at all. */
  passes: number;
  thinking: Array<{ turn: number; text: string }>;
  verdicts: string[];
  usage: Usage;
  errors: string[];
}

const blank = (model: string): Report => ({
  model,
  campaigns: 0,
  wins: 0,
  finished: 0,
  turns: [],
  moves: 0,
  broken: {},
  passes: 0,
  thinking: [],
  verdicts: [],
  usage: { calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 },
  errors: [],
});

const playOne = async (
  model: string,
  seed: number,
  humanParty: string,
  report: Report,
): Promise<GameState> => {
  const ask = (messages: Array<{ role: string; content: string }>) =>
    complete(model, messages, report.usage);
  const model_ = createLlmStrategy(ask, ATTEMPTS);

  const moves: LlmMove[] = [];
  const strategy = async (state: GameState, playerKey: string) => {
    const move = await model_(state, playerKey);
    moves.push(move);
    report.moves += 1;
    if (move.gaveUp) report.passes += 1;
    // Only count the complaints that cost the model a retry.
    if (move.attempts > 1 || move.gaveUp) {
      for (const problem of move.problems) {
        report.broken[problem.code] = (report.broken[problem.code] ?? 0) + 1;
      }
    }
    if (move.thinking && moves.length % 4 === 1) {
      report.thinking.push({ turn: state.turn, text: move.thinking });
    }
    say(
      `    turn ${String(state.turn).padStart(2)}  ${move.gaveUp ? "PASSED (no legal move)" : move.offer.bids.map((bid) => bid.partyKey).join(", ") || "passed"}`,
    );
    return move.offer;
  };

  const outcome = await playCampaignAsync({
    seed,
    humanParty,
    bots: [OPPONENT],
    strategy,
    maxTurns: MAX_TURNS,
  });

  report.campaigns += 1;
  report.turns.push(outcome.turns);
  if (outcome.finished) report.finished += 1;
  if (outcome.humanWon) report.wins += 1;
  return outcome.state;
};

/**
 * Ask the model what it made of the game it just played.
 *
 * This is the part a bot harness cannot do: a fresh reader saying which rule
 * confused it and which move was obviously best every turn.
 */
const askVerdict = async (model: string, state: GameState, report: Report): Promise<void> => {
  const story = state.log.slice(-40).map((entry) => entry.text).join("\n");
  const standing = state.players
    .map((player) => `${player.name}: ${player.yearsInPower} of ${YEARS_TO_WIN} years`)
    .join("; ");

  const answer = await complete(
    model,
    [
      { role: "system", content: RULES_BRIEF },
      {
        role: "user",
        content:
          `You just played a campaign of this game. How it ended: ${standing}.\n\n` +
          `The last things that happened:\n${story}\n\n` +
          "You are the playtester now, not the player. In under 200 words: " +
          "which rule was hardest to understand, which move was obviously correct " +
          "almost every turn (that is a sign of a shallow decision), and the single " +
          "change you would make to the rules. Be blunt and specific.",
      },
    ],
    report.usage,
  );
  report.verdicts.push(answer.trim());
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const main = async () => {
  if (args.has("list-models")) {
    await listModels(option("list-models", "true"));
    return;
  }

  const seeds = Array.from({ length: GAMES }, (_, index) => index * 613 + 17);
  // Each seed is played from both ends of the table: leading the biggest party
  // is a different game from leading the second biggest, and a model that only
  // ever plays Likud tells us nothing about the other half of the board.
  const seats = ["likud", "yesh-atid"];
  const reports: Report[] = [];

  for (const model of MODELS) {
    const report = blank(model);
    reports.push(report);
    say(`\n${model}`);

    for (const seed of seeds) {
      for (const seat of seats) {
        say(`  seed ${seed}, leading ${seat}`);
        try {
          const finalState = await playOne(model, seed, seat, report);
          if (WANT_VERDICT && report.verdicts.length === 0) {
            await askVerdict(model, finalState, report);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          report.errors.push(message);
          say(`    failed: ${message}`);
        }
      }
    }
  }

  const path = writeReport(reports);
  console.log(`\n${summary(reports)}\n\nWritten to ${path}`);
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const summary = (reports: Report[]): string => {
  const rows = reports.map((report) => {
    const illegal = Object.values(report.broken).reduce((a, b) => a + b, 0);
    return [
      report.model.padEnd(36),
      `${report.wins}/${report.campaigns} won`.padEnd(12),
      `${report.finished}/${report.campaigns} finished`.padEnd(15),
      `${mean(report.turns).toFixed(1)} turns`.padEnd(12),
      `${illegal} illegal`.padEnd(12),
      `${report.passes} passed`.padEnd(11),
      `$${report.usage.cost.toFixed(4)}`,
    ].join(" ");
  });
  return rows.join("\n");
};

const writeReport = (reports: Report[]): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(process.cwd(), "playtests");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${stamp}.md`);

  const lines: string[] = [];
  lines.push(`# Playtest — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(
    `${GAMES} seed${GAMES === 1 ? "" : "s"} from both seats against the ${OPPONENT} bot, ` +
      `at most ${MAX_TURNS} turns, ${ATTEMPTS} tries at a legal move per turn, temperature ${TEMPERATURE}.`,
  );
  lines.push("");
  lines.push("| model | won | finished | mean turns | illegal replies | turns passed | calls | cost |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const report of reports) {
    const illegal = Object.values(report.broken).reduce((a, b) => a + b, 0);
    lines.push(
      `| ${report.model} | ${report.wins}/${report.campaigns} | ${report.finished}/${report.campaigns} | ` +
        `${mean(report.turns).toFixed(1)} | ${illegal} | ${report.passes} | ${report.usage.calls} | ` +
        `$${report.usage.cost.toFixed(4)} |`,
    );
  }

  for (const report of reports) {
    lines.push("");
    lines.push(`## ${report.model}`);
    if (report.errors.length > 0) {
      lines.push("");
      lines.push("**Failed campaigns**");
      for (const error of report.errors) lines.push(`- ${error}`);
    }

    const broken = Object.entries(report.broken).sort((a, b) => b[1] - a[1]);
    if (broken.length > 0) {
      lines.push("");
      lines.push("**Rules it broke** — each one is a rule the interface may be explaining badly too.");
      lines.push("");
      for (const [code, count] of broken) lines.push(`- \`${code}\` × ${count}`);
    }

    if (report.thinking.length > 0) {
      lines.push("");
      lines.push("**What it thought it was doing**");
      lines.push("");
      for (const entry of report.thinking.slice(0, 12)) {
        lines.push(`- *turn ${entry.turn}* — ${entry.text}`);
      }
    }

    for (const verdict of report.verdicts) {
      lines.push("");
      lines.push("**Its verdict on the game**");
      lines.push("");
      lines.push(verdict.split("\n").map((line) => `> ${line}`).join("\n"));
    }
  }

  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  return path;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
