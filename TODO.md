# Open work

Written at the end of the session that added CI, the campaign history, keyboard
support, standing red lines and the shrewd bot. Everything below is either
deliberately unfinished or deliberately left alone — none of it is a surprise.

Sessions after that one added an achievements system and an order paper and
redrew the emblem; the three items below were re-checked against the tree as it
stands and are all still open.

## 1. Re-measure the balance figures

**Blocked on a decision, not on work.** Standing red lines changed what every
campaign can reach, so every number in the README's Balance section is the last
measurement of a *different rule set*. The section is marked as such rather than
left standing as fact.

```bash
npm run balance
```

The probe already has everything needed: the existing greedy-vs-random arms, and
a head-to-head arm added for this — shrewd against greedy, swapped between the
seats on the same board, because the parties are wildly unequal and a naive
comparison mostly measures who drew the largest list.

It plays ~960 campaigns, which is the "automated game loop" the global rule in
`~/.claude/CLAUDE.md` says not to run unasked. That is why it has not been run.

When it has been, replace:

- the paragraph beginning *"Previously, on the 22nd Knesset it opens on…"*, and
  delete the block quote above it;
- the `22nd (2019) — the default` row in the skill table.

**Until then, nobody knows whether the shrewd bot is actually stronger.** It is
reasoned, not measured. It is opt-in from the setup screen, so it cannot affect
the default game either way — but the claim in its module comment is a design
intention, not a result.

## 2. Phone layout

The second half of the reach work; the keyboard half landed. Breakpoints are
written but the game has only ever been *rendered* at desktop width, so all of
them are untested rather than known-good.

Ones written in the session that added them, with the intent behind each:

| Width | What is supposed to happen |
|---|---|
| 900px | `.board-body` collapses to one column; the dispatch panel goes under the tray and stops being sticky |
| 720px | The setup emblem shrinks and shifts right |
| 620px | `.swing` drops the bar column; the signed number and both seat counts carry the reading |
| 560px | `.log-line` drops the kind column in the campaign history |
| 520px | `.diary-slots` goes to a single column |

Later sessions have since added more — `460px`, `760px`, `1180px`, `1200px` —
belonging to the achievements system and the order paper. Their intent is not
recorded here; read them before assuming they compose with the ones above.

Worth checking specifically: the chamber fan (`max-width: 620px` inside a column
that no longer has 620px), the party grid at `minmax(190px, 1fr)`, whether the
election report's swing rows survive losing the bar, and the newer achievements
and order-paper surfaces, which have never been seen narrow either.

## 3. Unmeasured dial in the shrewd bot

`DENIAL = 0.6` in `src/bots/shrewd.ts` — what a mandate denied to the leading
rival is worth against one gained. Chosen by reasoning, never swept. `AGGRESSION
= 0.3` was inherited from greedy, where it *was* measured (0.3 beats 0.85 by nine
points at three tables); shrewd may well want its own value, since it now bids
the floor where nothing is contested and so spends its purse differently.

# Found and deliberately left alone

Both are pre-existing, both are arguably correct, and neither was in scope. They
are recorded so the next session does not rediscover them as bugs.

- **A list can break away and wind itself up in the same election.** Two
  realignments can fire per election, and the second can act on the list the
  first invented. Seed 15 has a faction walk out of the Joint List, register,
  and fold again before anybody votes. `tests/campaign.test.ts` asserts both
  branches of this rather than assuming it cannot happen.
- **The splinter-name pool is not filtered by politics.** The same seed hands a
  Joint List breakaway the name "Otzma Yehudit".

# Environment notes

Two things that cost real time in this session, on this machine:

- **Headless Chrome screenshots work; headless Firefox does not.** Firefox exits
  with `RenderCompositorSWGL failed mapping default framebuffer` and writes no
  file, with or without `--window-size`, a fresh profile, or acceleration
  disabled. Firefox has to be checked by opening a real window.
- **Git Bash rewrites leading-slash arguments.** `--base=/61/` reaches
  Vite as `/Program Files/Git/61/`. Use PowerShell for anything passing a
  path-shaped flag; the Linux CI runner is unaffected.

`scripts/preview.tsx` renders every screen to one contact sheet, which is the
cheapest way to look at a change without playing to it.

# How verification works here

The global rule in `~/.claude/CLAUDE.md` says not to run playtests, build checks
or automated game loops after a feature unless asked. That is covered without
them:

- **CI** runs typecheck, the full suite and a build on every push and pull
  request.
- **Pages** re-runs typecheck and the suite *before* publishing, so a commit that
  is red cannot reach https://projekcja.github.io/61/ even if it is on
  `main`.

Tests written but not run locally have twice gone green in CI on the first try;
that is the intended workflow here, not a lucky accident.
