# Kingmaker

A turn-based browser game about buying a coalition government in the Knesset.

Sixty-one mandates buys you a government. **Ten years in office wins the campaign.** Every week
you spread eighteen ministries across the parties, everyone bids at once, and each party goes to
whoever offered it the most.

Written in TypeScript. The rules are a pure, deterministic module with no DOM dependency; React is
only the interface on top of it.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build      # type-check, then bundle to dist/
npm test           # engine, bots and interface
npm run typecheck  # tsc --noEmit
npx vite-node scripts/balance.ts   # does the game reward skill?
```

## The game

### The board
The real 25th Knesset: Likud 32, Yesh Atid 24, Religious Zionism 14, National Unity 12, Shas 11,
UTJ 7, Yisrael Beiteinu 6, Ra'am 5, Hadash-Ta'al 5, Labor 4. You pick which one to lead; the bots
take the largest you left. Your own party's mandates always count toward your bloc, and the
parties players lead are never for sale.

Every player holds their own eighteen ministries, worth 1–18bn — 171bn each, every turn.

### The bidding
1. Every player spreads **all** their ministries across the parties they want.
2. Everyone commits at once; the offers are sealed.
3. Each party takes the **highest total** offered to it.

There is no reserve price: competition *is* the price, and the constraint is that a ministry spent
on one party is a ministry not spent on another.

Ties break twice over. An incumbent defends — it only has to match a challenger, not beat one.
Where nobody holds the party, a tie goes to the bidder with **more mandates already behind them**:
a seat in the government most likely to actually form is worth more than the same seat in one that
never will, so success bandwagons.

Allocations are made afresh every turn, so **nothing is ever permanently bought**. Holding a bloc
means continuing to outbid for it — which is exactly how an opposition attacks a sitting
government.

### The two phases
- **Forming** — one turn is a week. Bid until somebody's bloc reaches 61. They become prime
  minister.
- **Governing** — one turn is a year. The opposition bids to peel partners away, the prime
  minister defends, and each surviving year is banked. Drop below 61 and there is **one turn** to
  put it back together; fail and the government falls, the Knesset is re-elected around the real
  baseline, and the bidding starts over.

Ten banked years, across as many governments as it takes, wins.

### The cards
One card is drawn per player per turn, filtered to the phase in play: lists split and merge,
members cross the floor, portfolios are invented and abolished, budgets fail, scandals break,
emergencies freeze the politics, and parties draw red lines they will not cross.

**Ideology lives here and nowhere else.** Every party carries its real bloc and a left–right
number, and the bidding never reads either. Cards do: a red-line card records a concrete
party-to-party refusal, which resolution then honours. Adding or cutting the ideological cards is
the dial for how much politics matters, and it moves nothing else. A test scrambles every party's
politics and asserts no bidding outcome changes.

## Layout

```
src/engine/     the rules, with no reference to the DOM
  parties.ts      the real Knesset, with bloc tags
  ministries.ts   the eighteen portfolios and their budgets
  allocation.ts   sealed bids, resolution, tie-breaking
  deck.ts         the card stack — the only consumer of ideology
  campaign.ts     setup, the turn machine, elections, the win check
  rng.ts          seeded PRNG; the cursor lives in the game state
src/bots/       random and greedy opponents
src/net/        persistence: a campaign is a seed plus its moves
src/ui/         the interface
tests/          rules, bots, interface, plus a headless campaign harness
scripts/        balance probe
```

## Persistence

Nothing about the live state is stored. A saved campaign is a seed, a setup, and an append-only
list of the moves you made — a few hundred bytes — replayed through the engine on load. Bots decide
from the same seeded stream, so their play never needs to be written down and a campaign running
through three parliaments still rebuilds exactly.

Each move is its own record keyed by turn number, so concurrent writes conflict instead of
clobbering. Storage sits behind the `Transport` interface, deliberately shaped like a hosted
document store, so pointing this at a shared backend is one more implementation of that interface.

Saved campaigns carry a `RULES_VERSION`; retuning the rules makes old logs replay as different
games, so a mismatch is refused rather than silently mangled.

## Balance

`scripts/balance.ts` plays every seed twice with the strategies swapped between the same two seats,
because the parties are wildly unequal and a naive comparison would mostly measure who drew Likud.

Currently: **greedy wins 95% against random**, every campaign reaches a winner, a campaign runs a
median of 12 turns across about 2.5 parliaments.

One number is not where it should be. Forming a coalition takes a median of **one turn**, even with
three greedy players — eighteen chips against seven purchasable parties is not scarce enough to
make the negotiation a contest, so the campaign is mostly its governing phase. See the note in the
plan file; the fix is a rules decision, not a tuning one.
