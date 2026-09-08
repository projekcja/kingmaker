# Kingmaker

A turn-based browser game about building a coalition government in a parliamentary system.

The election settled nothing. You lead one of the two largest parties in a hung parliament, and
the president has handed you the mandate: assemble 61 of 120 seats within 28 days, or the country
votes again and you answer for it.

Written in TypeScript. The rules engine is a pure, deterministic module with no DOM dependency;
React is only the interface on top of it.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check, then bundle to dist/
npm run preview    # serve the production build
npm test           # engine + interface test suite
npm run typecheck  # tsc --noEmit
```

## Multiplayer

One player forms the government; any other party can have a person in its seat, and answers offers
itself instead of being played by the engine. A party with nobody in its seat stays engine-run, so
**the single-player game is just the case where no seats are claimed** — not a separate mode.

To play alone against the engine, start a game and press *Start the mandate* without claiming
anything. To test two-handed:

1. Open the app, create a game, and note the table id.
2. Claim the party marked **mandate** — that is the formateur.
3. Open a **second tab** and join the same table id. That tab is a different player: identity
   lives in `sessionStorage`, which is per-tab.
4. Claim another party there, then start the mandate from either tab.

Offer that party a package and the board hands over: the formateur is locked out, the other tab
gets the offer with its own private read of what the deal is worth, and answers. Both tabs update
live.

The engine's verdict is advice at that point, not a ruling. A player may accept terms the
arithmetic hated or refuse terms it liked, and the coalition holds either way — a party with a
person in its seat is never ejected automatically, because its membership was a decision rather
than a calculation.

### Persistence and history

Nothing about the live state is stored. A saved game is a seed, a seat map, and an append-only list
of moves — a few hundred bytes — replayed through the engine on load. The action list *is* the
history, and the record panel renders it.

Each move is stored as its own record (`km:game:<id>:action:<n>`) rather than as an entry in a
mutable array, so two players writing at once cannot clobber one another and the ordering is free.
A move onto a turn number that is already taken comes back as a conflict rather than overwriting it.

Storage sits behind the `Transport` interface in `src/net/transport.ts`. The shipped implementation
is `LocalTransport`: localStorage for the data, BroadcastChannel for live updates between tabs.
It is deliberately shaped like a hosted document store, so pointing the game at a shared backend is
a matter of writing one more implementation of that interface — the game itself does not change.

Two constraints worth knowing. **Seats lock when play begins**, because whether a party is human-run
changes how its offers resolve, and so changes how the stored log replays. And a saved game records
the `RULES_VERSION` that produced it; retuning any number in the engine means old games replay as
different games, so a mismatch is refused rather than silently mangled.

## How the game works

Every parliament is generated from a seed and validated before you see it: it is always hung,
always constrained by red lines, and always has between 2 and 14 minimal winning coalitions. The
seed is shown in the header, so a scenario can be replayed or shared.

**Time is the real budget.** A meeting costs one day, a full negotiation two, and the mandate does
not extend. Breaking off talks is instant, and permanent enough to hurt.

**You pay in two currencies.** Ministries are finite — sixteen of them, weighted by prestige — and
so are the seven policy questions the agreement has to answer. Ministries are private and
divisible; policy is public and shared, so every position you promise one party is read by all the
others. That is what makes a coalition hard: satisfying your left flank on the budget is exactly
what makes your right flank expensive.

**Leverage is structural, not scripted.** A party's price rises with the fraction of your remaining
routes to a majority that run through it. Open a second route and its price falls on its own,
without a word being said. Every partner you admit closes routes, which is why the last seat costs
far more than the first.

**Your own party is watching.** Ministries given away, partners admitted, and positions conceded
all cost you standing with your own base. Let it reach zero and your party replaces you before the
voters get the chance.

Signing is checked, not assumed: at the table every partner re-runs its arithmetic against the
current deal, and a party whose price has risen past what it was given will walk out. Get a
government and it is scored for stability and given an expected lifespan.

### Actions

| Action | Cost | Effect |
| --- | --- | --- |
| Request a meeting | 1 day | Reveals a party's wish list and priorities; warms them slightly |
| Present an offer | 2 days | Ministries plus promised positions; they accept or explain the refusal |
| Squeeze in public | 1 day | May cut a party's price, may blow up in your face |
| Rally the faithful | 1 day | Restores your standing at home; partners read it as bad faith |
| Break off talks | free | Ejects a partner and returns their ministries to the pool |
| Answer an offer | 2 days | A seated party accepts or refuses; time passes only once they decide |

Overnight, things happen without you: ultimatums, scandals, floor-crossings that change the
arithmetic, leaks, and backbench letters. Any event that would leave you with no path to a
majority is rolled back rather than inflicted.

## Layout

```
src/engine/     the rules, with no reference to the DOM
  types.ts        data model and shared helpers
  rng.ts          seeded PRNG; the cursor lives in the game state
  content.ts      the sixteen ministries and seven policy questions
  generator.ts    scenario generation and coalition enumeration
  negotiation.ts  pricing, evaluation, leverage, stability
  events.ts       overnight events, with rollback guards
  actions.ts      the turn loop
src/net/        multiplayer plumbing
  transport.ts    the storage interface a backend must satisfy
  localTransport.ts  localStorage + BroadcastChannel; two tabs, two players
  replay.ts       rebuilding a game from its seed and its moves
  identity.ts     per-tab player identity
  useGame.ts      React binding: load, replay, submit, stay in sync
src/ui/         React components
tests/          engine, multiplayer and interface tests, plus a headless bot
scripts/        balance probe: npx vite-node scripts/balance.ts
```

## Balance

`scripts/balance.ts` plays 300 seeded games with a greedy bot that can see hidden information a
human cannot. It currently wins 77% of them, taking a median of 11 days and spending about a
quarter of the ministerial prestige on the board — with the long tail running to 23 days and two
thirds of the board. The remaining games end in an expired mandate or a leader deposed by their
own party.

The test suite asserts the win rate stays inside a playable band, so retuning any number in
`negotiation.ts` will show up immediately as a failing test rather than as a boring game.
