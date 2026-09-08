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
UTJ 7, Yisrael Beiteinu 6, Ra'am 5, Hadash-Ta'al 5, Labor 4. You pick which one to lead; rivals
take the largest you left. Your own party's mandates always count toward your bloc.

**Two players by default** — you and one rival. A party somebody leads is never for sale, so each
extra rival takes seats off the market faster than it adds a contender: with two players there are
64 mandates to buy, with three only 50, and by four the smaller seats cannot reach 61 at all.

Every player holds their own eighteen ministries, worth 1–18bn — 171bn each, every turn.

### The bidding
Each turn you may sit down with **two parties**, and put as many portfolios in front of each as you
like. Everyone commits at once; the offers are sealed. Each party then takes the **best offer on
its table**, weighed against what it is already being paid.

Ministries handed over stay **locked with that party for as long as it stays bought**, so every
partner you add leaves you less to buy the next one with. Getting from 55 seats to 61 is the hard
part. The only way to move a portfolio once promised is to **pull out** of the party holding it,
which costs you the party.

An offer that loses costs nothing — you only pay on success.

Money is plentiful; **turns are the scarce resource**. That single restriction is what makes this a
negotiation rather than one decisive auction.

Ties break twice over. An incumbent defends — it only has to match a challenger, not beat one, and
a holder's top-up stacks on the package it has already paid. Where nobody holds the party, a tie
goes to the bidder with **more mandates already behind them**: a seat in the government most likely
to actually form is worth more than the same seat in one that never will, so success bandwagons.

### The two phases
- **Forming** — one turn is a week. Bid until somebody's bloc reaches 61; they become prime
  minister. A formateur gets **six weeks**: 28 days, plus the 14 the president usually grants. Fail
  and the Knesset dissolves itself and the country votes again. That deadline is also what keeps
  the game from deadlocking — portfolios stay locked with the partners that bought them, so without
  it well-funded players can each hold part of the board with none able to afford the rest.
- **Governing** — one turn is a year. The opposition bids to peel partners away, the prime minister
  defends, and each surviving year is banked. Drop below 61 and there is **one turn** to put it
  back together; fail and the government falls, the Knesset is re-elected around the real baseline,
  and the bidding starts over.

**An election does not tear up your agreements.** A party that keeps its place in the new Knesset
keeps whatever it was promised and whoever it was promised to; only the arithmetic underneath moves.
A list that falls below the threshold leaves the chamber, and the portfolios it was holding go back
to the player who paid them.

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
  allocation.ts   sealed offers, resolution, tie-breaking, withdrawal
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

Currently: **greedy beats random 79%**, every campaign reaches a winner, a campaign runs a median of
16 turns across about three parliaments, and forming a coalition takes a median of 2 weeks — well
inside the six-week limit, with head-to-head negotiations running to 9.

Three findings from that probe are baked into the rules and the bot:

- **One offer a turn was the fix for pacing.** Under an earlier rule where players spread all
  eighteen portfolios across the whole board every turn, coalitions formed in a single turn even
  between competent players, and the campaign was just its governing phase.
- **Acquisition has to outrank defence in the bot.** A two-billion top-up on a party you already
  hold looks wonderfully efficient beside buying anything, so a version that ranked the two
  together polished its coalition forever and never grew it — and lost to random.
- **The deadline exists because the game deadlocked without it.** Three greedy players would
  stalemate for 200+ turns; with dissolution they settle inside 70. The six-week figure comes from
  Israeli practice rather than from tuning, and it happens to bite about as often as it should.
- **Letting agreements survive an election cost greedy its dominance**, from 93% down to 79%,
  because a lucky bloc assembled by accident now persists instead of being wiped. That is a better
  game, not a worse one: the margin is still decisive and the recovery from a bad election is real.
