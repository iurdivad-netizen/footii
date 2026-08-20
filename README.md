# Footii

A browser-based football career game built around a single question:

> **Is making a decision in a 1–3 second football situation fun?**

You control **one footballer**, not a team. The match simulates itself, and pulls you in only at
the moments where you can actually change the outcome. When it does, you get **six contextual
options** and a **decision window measured in seconds** — calculated from your player's awareness,
composure, decision making and experience, minus the pressure he is under.

Inspired by the philosophy of the classic *Footballer of the Year*, not a recreation of it.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build locally
npm test         # run the simulation test suite
npm run typecheck
```

Requires Node 20+.

---

## Modes

The game opens on a **home screen**: continue a career in progress, start a new one, or play a
single match — plus the settings that govern how you want to play.

Two ways in:

- **Career** — build or pick a footballer and follow him season by season.
- **Quick match** — a single game against any opponent. Nothing is saved to a career.

The two keep **completely separate ledgers**: quick-match totals never appear inside a career, and
career statistics never absorb one-off games.

### Create your own player

Instead of a pre-built, you can build a footballer:

- Spend a fixed pool of **520 attribute points**. Every attribute starts at 25 and nothing may
  begin above 70 — the rest is what a career is for. Every created player costs the same budget,
  so none is strictly better than another; a specialist has to be deliberately lopsided.
- Choose a **position** and a **playing style** (Poacher, False Nine, Inside Forward, Deep
  Playmaker, Stopper, Overlapping…). Style sets your behavioural tendencies, which change the
  situations the engine generates for you, not just your numbers.
- Choose an **age** from 16 to 34. This is a real trade-off rather than flavour: age sets your
  starting experience, which is a term in the decision timer, so a 17-year-old genuinely gets less
  time on the ball than a 30-year-old with the same attributes.
- **Your potential is hidden and never shown.** It is rolled against your age, so starting young
  carries far more upside — you find out who you are by playing.

The five pre-built players remain as ready-made archetypes.

The creator is the **last** step, not a detour: club, seed and pace are chosen before you open it,
so its button genuinely starts what it says — "Start career" begins the career, "Kick off" starts
the match. **Back** returns to the configuration screen if you want to change club.

## How the game plays

1. Choose Career or Quick match, then pick or build your player, your club and a match seed.
2. The match runs on its own — the commentary feed and score update as it goes.
3. Every so often **you** are the player in the moment. The match pauses and the chance's story
   is told a beat at a time over a minimal pitch view — with the options still hidden.
4. The six options appear, the clock starts, and you press `1`–`6` (or tap/click) before it runs out.
5. The action resolves, the match absorbs the result, and the simulation continues.
6. At full time you get a match rating and running career totals.

Press `D` at any time for the simulation debug panel.

### The three phases of an interactive moment

Every event plays out in three distinct phases:

1. **Build-up** (~1.8–3.6s) — the story of the chance is told a beat at a time,
   and **no options are visible**. This is where the context arrives: how the
   move started, what created the opening, whether you have space or bodies
   around you. The keeper has not moved yet.
2. **Scan** (~0.5s) — the six options appear. The clock is still stopped, but
   this beat is deliberately short.
3. **Decision** — the attribute-driven window runs and the keeper commits.

Input is ignored during the build-up, so you cannot fire blind. The numbered
3x2 grid is laid out from the start but with its labels hidden, so the shape of
the interface is familiar and nothing jumps when the labels arrive.

The build-up isn't decoration. It delivers the situational context *before* you
are asked to choose, which is what lets the decision window stay short without
being unfair; it manufactures tension, because a chance you watch develop has
more weight than one that simply appears; and it makes a team's tactical style
legible in play rather than only in the ratings.

#### Why the scan beat exists

The decision timer models how long the *footballer* has to act. The human is
also paying a separate cost: physically reading six freshly generated labels.
Measured over 257 events, an 18-year-old's median window was **1.04s** against
~94 characters of option text — roughly **3.8s** of reading. Revealing the
options at the exact instant the clock starts puts that cost straight back onto
the window and makes low-attribute players unplayable rather than merely
frantic.

The scan beat is far shorter than a full read because the build-up has already
delivered the context that previously had to be absorbed alongside the labels.
Set `SCAN_SECONDS` to 0 in `ui/interaction/readingTime.ts` for a pure
"options and clock together" version.

All of this lives in the UI layer — it is a property of the interface, not of
football — while the narration beats themselves are generated from the event's
seeded `Rng` (`data/buildUp.ts`), so a replayed match narrates identically.

#### Colour-coded options

Each option is tinted by the **kind** of action it is, so a six-option menu can
be grouped at a glance instead of read word by word. Under a one-second window,
"the red ones are shots" is far faster than parsing six labels.

| Family | Colour | Tag |
| --- | --- | --- |
| Shot | red | `SHOT` |
| Header | orange | `HEAD` |
| Dribble | yellow | `RUN` |
| Pass | blue | `PASS` |
| Cross | teal | `CROSS` |
| Defend / tackle | white | `DEF` |
| Hold up | grey | `HOLD` |

Two constraints make this help rather than hand-holding:

1. **Colour encodes category, never quality.** It must not hint at which option
   is correct — that read is the whole game. Grouping is help; grading would be
   cheating. Two shots in the same menu can be a tap-in and a hopeless one, and
   they are the same red.
2. **Colour is never the only channel.** Every option also carries its short
   family tag, and a legend under the grid lists only the families actually on
   offer, so the grouping works without colour vision and is learnable rather
   than memorised.

The colours stay suppressed during the build-up. The grid is laid out from the
first frame, but tinting it early would leak "there are three shots here" before
the options themselves appear, which is exactly the information the build-up
phase exists to withhold. The palette lives in `ui/actionFamilyStyle.ts` — it is
presentation only, which is why it sits in `ui/` rather than beside the action
catalogue.

### Settings

**Decision pace** and **match speed** live on the home screen and are **saved between sessions**,
because they describe how *you* want to play rather than anything about a particular match. They
were previously chosen per match and never persisted, which meant reloading and continuing a career
silently reverted a deliberately relaxed game to Standard — the game got harder without saying so.

### Decision pace

The pace setting scales every phase equally
(Hardcore 0.75x / Standard 1x / Relaxed 1.5x / Very relaxed 2.1x). Because it is
a flat multiplier, the *relative* gap between a composed veteran and a panicking
teenager is identical at every setting — it is an accessibility and difficulty
control, not a rebalance.

There is also **No time limit**, for playing without any clock at all. The
goalkeeper still commits on his normal schedule, so the read is unchanged — you
simply are not punished for taking your time. Tempo is treated as neutral rather
than late, so thinking carries no hidden penalty; what you give up is the small
bonus for deciding quickly.

Typical timings at Standard pace:

| Player   | Build-up | Scan | Ticking clock |
| -------- | -------- | ---- | ------------- |
| Prospect | ~1.8s    | 0.5s | 1.03s         |
| Veteran  | ~1.8s    | 0.5s | 2.36s         |

### The goalkeeper is the mechanic

The most important thing on screen is the goalkeeper. He starts **set**, and **commits partway
through your decision window** — rushing out, diving near or far post, going to ground, or staying
on his line. The canvas shows this clearly (he changes colour and pulses).

That creates the central tension:

- **Decide early** and you act on incomplete information, but you get a small tempo bonus.
- **Wait for his commit** and several options change value sharply — chipping a keeper who has
  rushed out is a great idea; chipping one still stood on his line is a terrible one — but you burn
  clock, and deciding in the final sliver of the window is a rushed action.

There is no universally optimal button. That's the point.

### Set pieces

Three of the thirteen archetypes are dead balls, and they exist because they are the moments where
the commit mechanic is at its purest.

**A penalty** has no defenders, no angle and no build-up to read. The only variable is the
goalkeeper, and the template puts him on his line and makes him *commit* — he dives, goes to
ground or stands up, and he never rushes out. So the entire decision is how long you dare to wait:

| You chose                        | He had already gone | He was still stood up |
| -------------------------------- | ------------------- | --------------------- |
| Side-foot it into the corner     | ~79%                | ~75%                  |
| Wait, then open the body the other way | ~78%          | ~35%                  |
| Chip it down the middle          | ~75% (gone to ground) | ~25%                |

The percentage penalty is barely affected by the read. The two spectacular ones are almost entirely
the read. That is the whole game in one event: waiting costs you nothing here except nerve, so a
penalty is the one situation where the correct play is always to hold your decision — and the
options that punish you for holding it wrong are the two that look best when they come off.

**A direct free kick** converts in single digits even for a specialist, which is deliberate: the
interesting choice is usually whether to shoot at all, and the delivery options are genuinely
competitive with the shot rather than a consolation.

**A corner** inverts the keeper read. He is not deciding how to face a striker, he is deciding
whether to come and claim, so attacking the near post is strong exactly while he stays and awful
once he moves, and peeling to the far post is the mirror image.

### The defending you are asked to do

Defensive events used to be one archetype — the last-ditch duel. There are now three, and which of
them you get is a statement about both you and the opposition:

- **The defensive duel** — a runner at you, and you are the last line.
- **The aerial duel** — the ball is launched forward and has to be won or dealt with. A **direct**
  opponent generates far more of these than a possession side, so playing a long-ball team really
  does mean an afternoon of heading.
- **The pressing trap** — they are playing out from the back and you are the first man. A
  **possession** side invites these; a direct side rarely offers one.

The consequence is that a striker's defensive work is now the press rather than the tackle, and a
centre back's is the duel and the header, without either being coded as a special case: it falls
out of the position and tendency weights. The one action in the game that reads your **own**
goalkeeper lives here too — leaving a ball for a brave, decisive keeper is free, and leaving it for
a passive one is how defenders end up apologising to the crowd.

---

## Design model

### Decision timer

The decision window is computed, not configured:

```
T = BaseSituationTime
  + 0.55 * norm(Awareness)
  + 0.35 * norm(Composure)
  + 0.35 * norm(DecisionMaking)
  + 0.30 * experienceFactor(Experience)
  - 0.55 * defensivePressure
  - 0.45 * goalkeeperPressure
  - 0.40 * situationDifficulty
  - 0.30 * fatigue
  + 0.12 * norm(Form) + 0.08 * norm(Morale)
  - opponentPressing adjustment

then scaled by the Decision pace multiplier,
clamped to [1.0s, 4.5s] * pace
```

The 1.0s floor is deliberate: a sub-second window is a coin flip rather than a
decision. Having enough time to *read* the options is handled separately by the
set phase, above.

`norm(x) = (x - 50) / 50`, so a weight is literally "seconds gained by a 99-rated attribute", and
every weight lives in one exported table (`TIMER_WEIGHTS` in `src/simulation/DecisionTimer.ts`).

Calibration targets, enforced by tests:

| Player                                             | Window under light pressure |
| -------------------------------------------------- | --------------------------- |
| Awareness 85 / Composure 82 / Decision 88, veteran | ~2.8–3.2s                   |
| Awareness 45 / Composure 42 / Decision 40, teenager | ~1.3–1.7s                   |

Under intense pressure (aggressive keeper rushing out, three defenders) the same player loses well
over half a second.

### Choosing ≠ executing

Every action carries three independent things:

- **`fit(context)`** — *was this the right idea here?* Evaluated at the moment of the decision, so
  it sees the goalkeeper's current action. This is the "read the game" term.
- **`execution`** — *can this player pull it off?* An attribute-weighted score, degraded by
  pressure (mitigated by Composure), fatigue and rushing.
- **`gkRelevance` / `defenderRelevance`** — how much the opposition suppresses this specific action.

So a brilliant choice can be botched, and a poor choice can be rescued by talent.

### Action resolution

```
value = baseValue
      + 0.34 * (execution      - 0.5)
      + 0.28 * (fit            - 0.5)
      + 0.18 * (chanceQuality  - 0.5)
      + 0.06 * tempo
      - 0.34 * gkRelevance * (goalkeeperScore - 0.5)
      - 0.30 * defenderRelevance * defensivePressure
      + bounded noise (gaussian, sd 0.10, hard-clamped at 2.5 sd)
```

`value` is then mapped to an outcome through a per-family ladder (goal / woodwork / save / block /
miss for shots; completed / dangerous / intercepted for passes; and so on).

### Goals are a probability, not a threshold

`value` is mapped to an outcome through a per-family ladder — except for the single most important
question, "did it go in", which uses a logistic curve over `value`.

This matters more than it sounds. Originally a shot scored when `value >= 0.70`. Because the
resolution noise is clamped, that threshold sat *above the entire value distribution* of a weak
player: a created 17-year-old striker converted a **clean one-on-one 3.7%** of the time and could
play two full seasons without scoring, while the same threshold barely inconvenienced a veteran.
Player quality became hypersensitive — a small change in value swung conversion from impossible to
routine.

A curve keeps the ordering (better players and better reads still score far more often) while
making nothing impossible and nothing certain:

| Player in a clean one-on-one | Before | After |
| ---------------------------- | ------ | ----- |
| Created 17-year-old          | 3.7%   | ~24%  |
| Pre-built prospect           | 2.8%   | ~21%  |
| Veteran (Finishing 84)       | 17.7%  | ~41%  |

**The general lesson, worth remembering before tuning anything:** with clamped randomness, a hard
threshold near the edge of a distribution is a wall, not a long shot. If you introduce one, check
the resulting distribution rather than assuming it merely shifts the odds.

### Timer expiry

Running out of time is **not** an automatic miss. An instinctive action is chosen from the player's
profile — a high-composure player falls back on something sensible, a natural finisher shoots, a
dribbler backs himself, a panicking player reaches for the riskiest thing available — and is then
resolved through the normal pipeline with a modest execution penalty. The real cost of running out
of time is usually *which option you get*, not a guaranteed failure.

### Position, tendencies and team style

Position is not a label. It drives where the player receives the ball, how often he is involved,
and which situations he can experience at all. Tendencies (`Runs Behind`, `Drops Deep`,
`Cuts Inside`, …) then bias event generation, so two strikers with identical technical attributes
produce different games. Team style biases it again — a wide-play team manufactures crossing
situations, a counterattacking team manufactures transitions.

Measured over 25-match samples, this holds up: a centre back's match is ~6 defensive duels, a
playmaker's is midfield progressions and duels, a winger's is wide attacks, a striker's is
one-on-ones and through balls.

### Match rating

Starts at 6.0 and moves on per-event contributions, so a midfielder can rate 8+ through chance
creation and ball-winning without scoring. Accumulated credit is compressed beyond ±2.5 so that a
merely *busy* match cannot out-rate a *decisive* one.

---

## Determinism

The entire simulation is deterministic given a seed. Nothing in `core/` or `simulation/` calls
`Math.random()` — every consumer of randomness receives an `Rng` instance. The same seed replays
the same match, event for event and commentary line for commentary line (asserted in tests). This
is what makes the engine debuggable and balanceable.

---

## Architecture

```
src/
├── core/                  pure data models + types, no DOM, no randomness of its own
│   ├── career/            development, league, countries, divisions, cups, the season
│   │                      calendar, club drift, season state, reputation, transfers,
│   │                      contracts and honours
│   ├── events/            situation context, action/outcome types, tactical zones
│   ├── goalkeeper/        goalkeeper model + commit behaviour
│   ├── match/             match state, statistics, rating
│   ├── player/            attributes, positions, tendencies
│   ├── team/              team ratings and tactical styles
│   ├── util/              numeric helpers
│   └── rng.ts             seeded RNG
├── simulation/            the engines — all head-less and testable
│   ├── MatchEngine.ts     minute-by-minute possession loop
│   ├── CareerService.ts   seasons, fixtures, league simulation, the summer
│   ├── SituationGenerator.ts
│   ├── ActionGenerator.ts contextual 1–6 option generation
│   ├── AutoPlay.ts        the "skip this match" decision policy
│   ├── DecisionTimer.ts
│   ├── ActionResolver.ts
│   └── InstinctiveAction.ts
├── rendering/             canvas drawing only
├── ui/                    screens, components, input
│   └── actionFamilyStyle.ts  option colour/tag palette (presentation only)
├── data/                  static game data (JSON) + action catalogue + situation templates
│                          (teams/goalkeepers/countries are generated — see scripts/)
├── persistence/           versioned localStorage save
└── main.ts

scripts/
└── generateWorld.py       regenerates the eight leagues, their clubs and keepers
```

The world data is generated rather than hand-authored: 128 clubs need ratings that agree with their
standing and their style, and doing that by eye produces a world where half the clubs are quietly
nonsense. The *flavour* is still authored — every club name, place name and goalkeeper name is
written by hand, country by country, and all of them are invented. Re-run with
`python3 scripts/generateWorld.py`; it is deterministic, so a diff means somebody changed the
recipe.

The dependency rule is one-directional: `ui` → `simulation` → `core`. `core` and `simulation`
never import from `ui`, `rendering` or `persistence`, which is why the whole engine can be played
head-lessly in tests.

### Adding a new interactive event type

1. Add a `SituationType` in `src/core/events/types.ts`.
2. Add a template in `src/data/situations.ts` (zone, base time, difficulty, position weights, and
   at least six candidate actions).
3. Add any new actions to `src/data/actionCatalogue.ts`.

No engine file needs editing — the generator, timer, resolver and UI all read from those
definitions. Three template flags carry the cases that used to be hard-coded in the generator:

- `defensive` — whether the archetype belongs to the defending pool. The generator routes on this
  flag, so a new defensive archetype is added exactly like an attacking one.
- `setPiece` — a dead ball. Set pieces get their own opening narration beat, because "they break at
  pace" and "the referee points to the spot" cannot both describe the same moment.
- `keeperCommit` — an optional override of what the goalkeeper commits to. A keeper facing a
  penalty dives far more often than he does in open play; one facing a corner is deciding whether
  to come and claim. Commit *timing* still comes from his aggression either way.

TypeScript enforces most of the rest: `SITUATION_LABELS`, the template record, and the tendency,
style and narration switches are all exhaustive over `SituationType`, so a half-added archetype
fails to compile rather than failing quietly at runtime.

---

## Debug mode

Press `D`. Shows the seed, the situation, the **decision timer modifier breakdown**, the generated
options with their fit scores, and the full resolution breakdown term by term:

```
BASE TIME              2.10
Awareness             +0.39
Composure             +0.22
Decision Making       +0.27
Experience            +0.26
Defender pressure     -0.48
Situation difficulty  -0.14
FINAL TIME             2.58 sec
```

If a number in there looks wrong, the gameplay is wrong.

---

## Tests

```bash
npm test
```

540 tests covering timer calibration, event pacing, build-up narration, development, fixtures, league simulation, career progression, player creation, training and season progress, player valuation, club interest and offer generation, reputation gain and settlement, country prestige, the world's
league membership, background simulation of the leagues you are not in (including that a mid-season
table is a genuine prefix of the final one), promotion and relegation, club drift, wage demands and
the wage gate, contract expiry, renewals and free transfers, the award benchmark and every honour,
auto-play's fairness against four decision policies, the openness of a cup draw, knockout
resolution and shootouts, cup progress and elimination, the season calendar's interleaving, cup
honours and the domestic double and treble, European qualification (that every competition fills to
sixteen, that a cup winner takes a place rather than adding one, and that a place passes down the
table when its winner already qualified higher), what a league position is worth in each country,
the visibility a European run confers, the record book's hauls, rating bands, streaks and
per-competition split, that a run does not span a summer, that a milestone list omits what never
happened, national sides derived from their countries' clubs (that a nation always beats its own best
club, that depth and not one superclub is what makes it strong, and that it declines when its league
does), selection thresholds that differ by nationality, the fairness of the groups and the seeding
that balances them, the crossed bracket that keeps two group winners apart until the final, that
every tournament produces exactly one champion and the better nations win more of them, that a cap is
only ever awarded for a match actually played, save migration, save validation, action generation (including the invariant that every
situation can always fill six slots), resolution, goalkeeper effects, attribute effects, chance
generation, randomness boundaries, position-specific behaviour, instinctive actions, rating,
pace scaling, option colour coding, boot recovery, set-piece conversion rates, the penalty commit
read, defensive archetype routing, the invariant that a defending player is never offered an action
that could score, the invariant that no catalogue action is unreachable, and full-match
determinism.

`tests/longCareer.test.ts` plays whole careers to their end and asserts the invariants that only
break over time — that a player is never left without a club, that a division never loses or
duplicates a team, that the market never goes permanently silent, and that the same seed produces
the same career. Every other career test looks at one season in isolation, which is exactly where a
career model hides its problems.

---

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs typecheck + tests, builds with `GITHUB_PAGES=true` (which sets
vite's `base` to `/footii/`), and publishes `dist/` via GitHub Pages.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Pushes to
`main` then deploy automatically. If you fork or rename the repository, update `base` in
`vite.config.ts` to match the new repository name.

### If the page comes up blank after a deploy

Every build writes a new content-hashed bundle (`assets/index-<hash>.js`) and a fresh
`index.html` pointing at it. A browser holding a **cached copy of the previous `index.html`**
therefore asks for a filename that no longer exists, the request 404s, and none of the game's
code ever runs — a blank page immediately after a deploy that was working minutes earlier.

Nothing in `src/` can report that, because nothing in `src/` has loaded. So `index.html`
carries a small **boot watchdog**: a plain (non-module) script that records resource load
failures and, if the app has not mounted after six seconds, replaces the blank page with what
actually failed and a **"Reload, ignoring the cache"** button. The button reloads with a
changed query string, which forces a fresh document request rather than the cached one.

There are now two layers, and they cover different failures:

| Failure | Caught by | What you see |
| --- | --- | --- |
| The game's code throws while starting | error boundary in `main.ts` | Error screen with the message and save-clearing options |
| The game's code never loads at all | boot watchdog in `index.html` | "Footii did not load", the failed URL, cache-busting reload |

`main.ts` sets `window.__footiiStarted` after its try/catch, so reaching the error boundary
counts as a successful load — that screen is more useful than the watchdog's.

---

## Career mode

Beyond the single match, a career follows **one footballer season by season**.

- **A season** is a double round-robin between the sixteen clubs in your league — 30 matches — plus
  a national cup and a league cup, so 30 to 38 matches depending how far the cup runs go. Every
  fixture you are not in is resolved probabilistically, so the table around you is always live, and
  the other seven countries play their seasons out alongside yours.
- **Any match can be skipped**, which resolves it through the real engine with the player deciding
  for himself. See "Skipping a match" below.
- **After every match** your rating feeds form and morale, and development is applied.
- **Development** is driven by age, headroom below Potential Ability, match rating, minutes
  played and your club's coaching quality.
- **A season ends** with a review: league position, promotion or relegation, anything you won,
  your statistics, a scout's view of whether your ceiling has moved, and where your reputation now
  sits. Then comes the summer — the transfer window and any contract decision, then pre-season
  training — and you age a year and go again.

### Why development is applied per match

Because the payoff has to be felt in the core mechanic, not read on a summary screen.

Awareness, Composure and Decision Making are three of the four attributes that set your decision
window. A young player who is developing well literally gets more time to think as the seasons
pass. Measured over five seasons of consistent 7.4 ratings, an 18-year-old prospect:

| Season | Age | Ability | Decision window | Awareness | Composure |
| ------ | --- | ------- | --------------- | --------- | --------- |
| Start  | 18  | 54      | **1.32s**       | 45        | 42        |
| 1      | 19  | 57      | 1.62s           | 49        | 53        |
| 3      | 21  | 62      | 2.06s           | 60        | 69        |
| 5      | 23  | 65      | **2.36s**       | 66        | 82        |

(Automatic development only — pre-season training is placed on top of this by hand.)

The same situations that felt frantic in his first season become readable. That progression is
only available because the timer is an attribute-driven formula rather than a difficulty setting.

**Potential is not a hard ceiling.** A player at his potential still creeps upward slowly, and
potential itself drifts each season based on how he has performed — so two identical prospects do
not have identical careers.

### End of season: progress and pre-season training

A season closes with a review that shows **how you changed**, not just what you scored:

```
HOW YOU DEVELOPED
1.27s → 1.51s          58 → 60              +20
Decision window        Overall ability      Experience

Composure 42 → 50 +8   Finishing 62 → 66 +4   Awareness 45 → 49 +4  …
```

The decision window is deliberately the headline. Ability is an abstraction; *"you now get a
quarter of a second longer on the ball"* is the thing you will feel in the next match. It is
measured by a fixed benchmark one-on-one (`simulation/DecisionBenchmark.ts`) where everything
except the player is held constant. From your second season onward the review also compares the
season just finished with the one before it.

Then comes **pre-season training**: a pool of points you place yourself.

- Awarded from age, headroom below potential, playing time and average rating, and the screen
  tells you which of those helped or hurt.
- The training screen shows a **live decision-window readout**, so putting points into Awareness,
  Composure or Decision Making visibly moves the number that governs your time on the ball.
- No attribute can be trained more than **25 above your overall ability**, which rises as you
  improve. Specialising is possible and worthwhile; building a 55-ability player with 99 Finishing
  is not.
- Unspent points are **discarded**, not banked — pre-season is a moment, not a savings account.

This is the deliberate half of progression. Per-match development is what the season did *to* you;
training is what you chose to work on. **It is not extra progression bolted on top**: part of the
automatic growth budget was moved into it (`GROWTH_BASE` was reduced when training was added), so
the overall career arc stays where it was calibrated and you simply get to steer some of it.

### Reputation and transfers

Reputation is what the football world thinks you are, as distinct from what you actually are
(Current Ability) and what you might become (Potential Ability). It is the currency of the transfer
market, and it moves at **two speeds**:

- **Per match** — goals, assists and standout ratings push it up quickly, scaled by how big a stage
  you played on. A poor performance costs a little. Gains **saturate** as you climb, so the first
  ten goals of a career make a name and the two hundredth adds nothing to one.
- **Per season** — the summer settles it back toward what your career actually justifies: ability,
  league finish, goal contribution and how much you played. It is a partial move, not a jump, so
  one quiet season does not erase a name and one loud season does not make one.

Without the settlement, reputation could only ever climb, and every career ended with a
world-famous 34-year-old who had not started a match in a year.

| Reputation | You are | What it means |
| ---------- | ------- | ------------- |
| 0–17 | Unknown | Nobody outside your own dressing room knows your name |
| 18–33 | Known locally | Your own supporters know you; scouts do not |
| 34–49 | Established | A recognised name in this division |
| 50–64 | Well known | Clubs above you have started watching |
| 65–79 | Star | One of the names this league is known for |
| 80–91 | Household name | The sort of signing that sells season tickets |
| 92+ | World class | Anyone would take you, if they could afford you |

#### What a club asks before it bids

An offer is not a dice roll dressed as a market. It is the answer to five questions a real club
would ask, each of them answerable from state the career layer already keeps:

| Question | Answered by |
| -------- | ----------- |
| Have we heard of him? | reputation against the club's own standing |
| Would he improve us? | ability — plus potential, if he is young — against the level of the squad |
| Do we need him? | his position against the club's weakest department, read off its own ratings |
| Does he suit how we play? | his attributes against the club's tactical style |
| Can we afford him? | market value against the budget |

They are **multiplied, not averaged**, so any one of them can veto a move: a club that has never
heard of you does not care how well you would fit, and one that cannot pay does not bid at all.

The 128 clubs therefore form a ladder that runs across countries as well as up them, and climbing
it is the point of a career. A club expects less of a signing when it plays in a league fewer
people watch, which is what makes the quiet corners of the map a reachable starting point rather
than a dead end. The English league, for reference:

| Club | Style | Squad level | Expects | Budget |
| ---- | ----- | ----------- | ------- | ------ |
| Castleford Royals | Possession | 86 | a *Star* (rep 78) | £210m |
| Ashford United | Possession | 74 | *Well known* (rep 61) | £64m |
| Kingsbridge FC | High Press | 68 | *Well known* (rep 52) | £35m |
| Vale Park Wanderers | Balanced | 60 | *Established* (rep 41) | £16m |
| Northport City | Counterattack | 58 | *Established* (rep 39) | £13m |
| Cheltley Rangers | Possession | 58 | *Known locally* (rep 32) | £13m |
| Brackenmoor Rovers | Wide Play | 55 | *Established* (rep 34) | £10m |
| Marsden Athletic | High Press | 54 | *Known locally* (rep 28) | £9m |
| Old Harbour Town | Direct | 52 | *Known locally* (rep 30) | £7m |
| Portmere Rovers | Counterattack | 52 | *Known locally* (rep 26) | £7m |
| Seaton Athletic | Defensive | 51 | *Known locally* (rep 28) | £7m |
| Bexley Wanderers | Wide Play | 50 | *Known locally* (rep 23) | £6m |
| Fenwick Town | Direct | 48 | *Known locally* (rep 21) | £5m |
| Hollowfield | Balanced | 46 | *Known locally* (rep 18) | £4m |
| Ravensworth Park | Defensive | 44 | *Unknown* (rep 17) | £3m |
| Stapleton Vale | Direct | 40 | *Unknown* (rep 17) | £2m |

These are the *starting* positions, and only one league of eight. Clubs drift as seasons pass, so
the ladder you climb is not the one printed here. The other seven leagues are generated —
`scripts/generateWorld.py` derives every club's ratings from two authored inputs, its rank in its
league and its tactical style, so a "possession" club always has the possession and passing to back
it up and the club lying second always has ratings that justify lying second. Every name in the
world is invented.

**Moving abroad** is modelled as more than a change of badge: clubs are warier of an import, a move
home is an easier sell, and a new country unsettles form harder than a move down the road. Your
nationality is chosen at creation and never changes, however many times you move.

Two rules keep the market honest rather than noisy:

- **A club only bids for a player it intends to play.** Squad rotation is not modelled yet, so an
  offer that quietly meant "you will sit on the bench" would be a promise the simulation cannot
  keep. Clubs that would only use you as cover simply do not come.
- **The keenest interested club always bids**; the rest roll against their own interest. A season
  good enough to have a side ready to move should never be met with silence because of a dice
  roll, and the hub shows you the interest building all season (*"Scouts watching"*) so the window
  is something you can see coming.

Clubs well below your current one mostly do not try, so the flow of offers from the bottom of the
league dries up as you climb — and a club you walked out of last summer does not come straight back
for you.

#### Why a transfer matters mechanically

Moving club is one field — `clubId` — but almost everything downstream changes with it:

- your club's ratings feed the **situation generator**, so a better side hands you better chances,
  and its **style** decides *which* situations you get (a wide-play club produces crossing
  situations, a counterattacking one produces transition one-on-ones)
- its standing sets your **coaching quality**, which drives development
- where it finishes drives your **reputation settlement**, which decides who watches you next

Which is why the transfer screen shows the squad level, the style, the need in your position, where
you would sit in the side and **which European competition the club has qualified for**, rather than
a fee and a badge. That last one belongs to the club rather than to you: leave and it stays behind,
sign for a club that qualified and you inherit theirs, so turning down the Champions League for a
bigger badge should at least be a decision you made on purpose. **Staying is a first-class choice**:
the club that wants you most is usually the one you would be best at, and that is not always the
club worth joining.

Market value is a pure function of the player — ability (exponentially: the gap between a 60 and a
70 is a few million, the gap between an 80 and a 90 is most of a stadium), a potential premium only
the young command, a hard age cliff after 30, and reputation and form at the margins. Because it is
pure, the hub can show it at any moment and the market can never disagree with the screen.

### The world: eight countries

The game is a map, not a ladder: **twelve countries, sixteen clubs each, 192 clubs in all**. Every
country has its own league, and every league is playing at the same time as yours.

| League | Country | Watched | Best club | Weakest club |
| ------ | ------- | ------- | --------- | ------------ |
| The Premier Division | England | 1.00 | 82 | 41 |
| La Liga Nacional | Spain | 0.96 | 87 | 42 |
| Die Bundesliga | Germany | 0.92 | 85 | 44 |
| Serie Alta | Italy | 0.90 | 84 | 41 |
| Le Championnat | France | 0.80 | 82 | 38 |
| The Super Group | Turkey | 0.72 | 79 | 35 |
| A Liga Principal | Portugal | 0.68 | 78 | 34 |
| De Eredivisie | Netherlands | 0.66 | 76 | 33 |
| De Ereklasse | Belgium | 0.62 | 74 | 31 |
| The Alpha Division | Greece | 0.56 | 73 | 30 |
| The Premiership | Scotland | 0.50 | 72 | 28 |
| Die Erste Klasse | Austria | 0.46 | 70 | 27 |

"Watched" is **prestige**, and it is deliberately not the same thing as strength. It scales
reputation, wages and international selection, so a league can be well watched and mediocre, or
excellent and ignored. Strength is a separate question the clubs answer themselves — the best club
in Scotland is weaker than a mid-table club in Spain, which is what makes moving country a step in
one direction or the other rather than a change of scenery.

Where you play therefore has two axes, and they can disagree. The best club in Portugal has a
stronger squad than a mid-table English side and is still the smaller move, because far fewer
people are watching. The transfer screen labels the offer by prestige for exactly that reason.

**Every league is live.** The seven you are not in are played out alongside your own season, so
browsing Spain in November shows a November table. Nothing about them is stored in the save: a
table is a pure function of `(seed, season, country, rounds played)`, and a mid-season table is a
genuine prefix of the final one that same seed will settle. That is what makes it safe to
recompute a league on demand and never have a stored table disagree with the season that produced
it.

**You can look at all of it.** Every competition in the world is reachable from the hub, whether or
not you have anything to do with it — see the note on the invisible second division under
"Balancing notes", which is the mistake that screen exists to prevent from happening eight times
over. The world browser has four views:

| View | Shows | Where it comes from |
| ---- | ----- | ------------------- |
| Leagues | Any country's table, live | Recomputed from the seed |
| Cups | Both knockouts in any country, drawn as far as the season has got | Yours is the real bracket; the rest recomputed |
| Europe | All three competitions, including the two you did not qualify for | Yours is the real bracket; the rest recomputed |
| International | Both groups and the knockout | The real tournament, which is stored |

Everything recomputed is run only as far as **the round the calendar has actually reached**, which
is the same rule the league tables follow. A background cup run all the way out would tell you in
October who lifted a trophy that has not been played for; run to the round the season is on, it
says exactly as much as your own cup does. A partial bracket is always a genuine prefix of the
final one, because the draw for round three is derived from the round number rather than from how
many rounds happen to have been played when somebody looks.

### Divisions within a country

Every country currently has a **single tier**, so promotion and relegation are dormant: settling a
one-tier season swaps nobody. The mechanics are nonetheless written, tested and wired in, so giving
a country a second division is a data change plus a fixture list rather than a re-implementation.
Two clubs would go down and two would come up.

The tier a player is in is still called his `division`, and 1 is still the top of his own country's
pyramid.

### Domestic cups

Every country runs two knockouts alongside its league: a **national cup** and a **league cup**.
Sixteen clubs make a clean bracket — 16, 8, 4, 2 — so both are four rounds and neither needs byes.

A league is a thirty-match average: one bad afternoon costs almost nothing, which is the right
shape for a season and a poor shape for a single match. A cup tie is the opposite. It cannot be
drawn, it cannot be made up next week, and the small club drawn against the big one has exactly
ninety minutes in which the gap between them might not matter. That is a different kind of match
to play, using the same engine.

**The draw is open.** No seeding, no keeping the big clubs apart — the two best clubs in a country
can meet in the first round and regularly do. Seeding would turn the cup into a second, shorter
league, which is the one thing it should not be. Home advantage goes to whichever club comes out of
the hat first, so a small club can land a home tie against a big one.

**A tie cannot end level.** Ninety minutes first, using the same scoreline model as every other
match you do not play; still level and it goes to penalties, weighted only lightly by strength. A
shootout is the one part of football where being the better side barely helps, and a cup that
quietly awarded them to the favourite would remove the reason knockouts are worth playing.

A round is drawn only when it is REACHED — a draw made in July for a tie played in October is a
promise the cup has no reason to make — and the rest of the round is settled around you, leaving
only your own tie to play. Go out and the competition **carries on without you on its own dates**,
round by round, exactly as it would have done had you still been in it: the seed a round is drawn
from is the round's, not the player's, so who lifts the trophy does not depend on when you went
out. "Who won the one you lost" is part of knowing where you stand, and it is worth knowing in
March rather than only in May.

### European competitions

Three of them, in a strict order of standing: the **Champions League**, the **Europa League**, and
the **Conference League** below both. Sixteen clubs apiece, drawn from all eight countries.

This is what gives the country ladder a reason to exist beyond wages. Before it, climbing the ladder
was purely a transfer decision — nothing that happened on a Saturday moved you between leagues.
Europe closes that loop: finishing fourth instead of fifth is worth something concrete the following
season, the clubs you meet are from countries you do not play in, and a player at a mid-sized club
gets watched by big ones without having to sign for them first.

**Who gets in** is league position, plus the cup winners:

| | |
| --- | --- |
| Champions League | the top **1 to 3** places, by where the country stands in Europe |
| Europa League | the next **1 to 3**, one of which goes to the **national cup winner** |
| Conference League | the next **1 to 3**, one of which goes to the **league cup winner** |

How many each country gets is hand-tuned rather than derived, because each row has to sum to exactly
sixteen and because the shape matters more than a formula. **Read the columns, not the rows:**

| rank | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| ---- | - | - | - | - | - | - | - | - | - | -- | -- | -- |
| Champions League | 3 | 3 | 2 | 2 | 2 | 1 | 1 | 1 | 1 | 0 | 0 | 0 |
| Europa League | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 1 | 1 | 0 |
| Conference League | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 2 | 3 | 3 | 4 |
| **total** | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |

Every country sends exactly **four** clubs to Europe. The Europa League row is a **hump** rather
than a slope, and that is football rather than an accident: the biggest countries send most of their
allocation to the Champions League and few to the Europa League, the smallest send theirs to the
Conference League, and the countries in the middle are what the Europa League is mostly made of.
The bottom three send **nobody** to the Champions League — a real statement about a small league,
and the strongest argument the transfer market has.

A country climbing the order does not send **more** clubs to Europe — it sends the same number to
**better** competitions, trading a Conference place for a Europa one. And the order itself is
**earned**: see "The country coefficient" below.

A cup winner **takes** a place rather than adding one, so the total never moves. If it already
qualified higher on merit it keeps the better place and the one it would have taken **passes down
the league table** rather than going unused — which is why winning a cup is a genuine route into
Europe for a club that finished nowhere, and exactly what a cup is for.

**It is the same knockout object as a domestic cup**, deliberately: the same open draw, the same
"a round is drawn only when it is reached", the same shootout. Every fix to the draw or the
penalties applies to all five competitions at once. What differs is who is in it, how much of the
world is watching, and what winning it is worth.

**A European run makes you more visible than your league does.** Reputation is settled against how
closely your season was watched, and that is now the better of your league's standing and the
competition's — so a Scottish club in the Champions League is genuinely more seen than the Scottish
league alone would make it. This is the mechanism by which a career escapes a small country by
playing well in it, rather than only by signing away from it.

The hub shows how far the competition has got whether or not you are still in it. A European
competition you go out of plays on round by round on its own dates, exactly as a domestic cup does,
so the survivor count keeps coming down and the card eventually names whoever lifted it — which is
a better answer to "how did that end" than a number frozen on the night you lost.

### Career records

Season statistics answer "how is this year going". They are the wrong shape for the question a
career actually raises after a decade, which is **"what kind of footballer was I"** — and totals
cannot answer it. Two players with 180 goals are not the same player if one of them scored three in
a match eleven times and the other never scored more than one.

What distinguishes a career is its **peaks** and its **runs**, and none of that survives being added
up. So these are accumulated one match at a time, in every competition, played or skipped:

| | |
| --- | --- |
| How big one afternoon got | braces, hat-tricks, four-goal games, five or more, the best haul ever |
| How good one afternoon was | perfect tens, nines or better, eights or better, the best rating ever |
| How long it kept going | longest run of consecutive matches scoring, and unbeaten |
| Where it happened | matches, goals, assists and average rating **split by competition** |
| The seasons | ten-goal seasons, twenty-goal seasons, the best single season |

**A run does not span a summer or a transfer.** "Eleven in a row" has to mean eleven consecutive
matches for the same side, not a number that quietly skips three months off and a change of club.

**The record book omits everything that never happened.** A career with no five-goal game is not
told it has none — a column of zeroes hides the two lines that are actually interesting.

Nothing here can be recomputed from season statistics after the fact, which is exactly why it has to
be kept as it happens. It is also why a save migrated forward starts with an **empty** record book
rather than a guessed one: a hat-trick count inferred from totals would be wrong, and a wrong record
is worse than an absent one.

### International football

The one competition a player cannot transfer into. Everything else in a career is a choice — which
club, which country, which league — and this is the part decided **for** him, by a nationality he
picked before he had played a match and a reputation he has to earn every season. That is why it is
worth having: it is the only thing in the game he can be **left out of**.

**A national side is derived, not stored.** For the same reason the golden boot has no name: there
are no other footballers in this world. A nation is built from its country's strongest clubs — its
best club's ratings, lifted by how deep the rest of the pool is behind it. Two things fall out for
free: it needs no data file and no migration, and it **drifts with its country**, so a league whose
clubs decline over a decade fields a weaker national side ten years later without anything having to
remember that it should. A nation is always stronger than the best club in it — otherwise being
picked would be a demotion and the shirt would mean nothing.

**The shape** is eight nations and one tournament a year:

| | |
| --- | --- |
| Groups | two of four, **three matches**, everybody plays everybody in their group |
| Knockout | the **top two of each group**, crossed — then a final |
| A campaign | 3 matches, or 5 if you go all the way |

Groups rather than a four-match campaign against four of seven possible opponents, because that
could never produce a fair table and finishing second sends you home. The groups are **seeded by a
snake down the prestige order** rather than drawn: a random draw puts the three best nations together
often enough to read as a bug, however fairly it was rolled.

The bracket is **crossed and seeded** — winners meet runners-up, and two group winners can only meet
in the final. That is the entire payoff for topping a group, and an open draw would delete it. It is
the one place in the game where a draw is *not* open, and the knockout model carries a flag for it
precisely so the cups stay open while this one does not.

**Why yearly**, when football plays its tournaments every second summer. A career is eighteen-odd
seasons and a peak is perhaps six of them. On a biennial cycle a career gets three tournaments, of
which a player is good enough for one or two — so the whole system would be something most careers
glimpse once. Yearly makes international football something a career actually *has*.

**The FIFA shape**, alternating year by year:

| | What runs | Field |
| --- | --------- | ----- |
| **Odd seasons** | **The World Cup** | 16 nations, allocated by confederation |
| **Even seasons** | every confederation's championship | every member: 16 for Europe, 8 for the rest |

**A World Cup place belongs to a confederation, not to a ranking.** Europe six, South America three,
Africa three, Asia two, North America two — sixteen, and every part of the world is always at one.
Each confederation's places go to its own highest-standing nations, which is qualification standing
in for a campaign: a nation reaches a World Cup by being among the best of ITS part of the world
rather than of the whole of it. **Finishing above your neighbours matters more than finishing above
Spain.**

**Not qualifying is ordinary.** Most of the world is outside any given World Cup and has no summer
that year — which is what happens to real non-qualifiers. Nobody is shut out of football for a
career, because the continental championship the year either side takes everybody: Scotland misses
World Cups and plays every European Championship, and its route in is climbing Europe's order, not
the world's.

Alternating rather than adding, because the original argument against a biennial cycle still holds: a
career is eighteen-odd seasons and a peak perhaps six of them, so a tournament every other year is a
tournament most careers glimpse. Alternating keeps one every single season — nothing is lost — while
making each an event. A career gets about nine of each, and it opens with a world tournament.

**The continental championship is YOURS.** It is seeded from the player's own confederation, because
his is the only one the game plays out in detail. Seeding it from Europe regardless would have given
a Brazilian a World Cup every other year and nothing at all in between, while an Englishman got both.

**Standing decides everything**, and it is one number: prestige, bent by what a country's clubs did
in Europe and what its national side did in its tournaments. It orders the European club places and
it fills the World Cup slots, so a country's football is judged once rather than twice. The world
browser shows the qualification picture confederation by confederation — how many places each has,
who holds them today, and where your own country sits in the queue.

### The country coefficient

The tournament used to change nothing outside your own honours list: five matches a year the world
forgot by August. It now decides **how many clubs each country sends to each European competition**.

A country's Champions League allocation used to be a fixed list read off a fixed prestige order —
England always three, Scotland always one, for eighteen seasons — which made it a property of the
data file rather than of anything that happened. It is now **earned**, over time.

A country's standing has **two halves**, because its football does: what its **clubs** did in Europe
over the winter, and what its **national side** did in the summer. Real football's coefficient is the
club half alone; both are kept here because between them they say something neither says on its own —
a country can have one great generation and no clubs to speak of, or a dominant league whose national
side never turns up.

**One international campaign is worth:**

| | |
| --- | --- |
| Each group win | 1 point (a draw, half) |
| Reaching the knockout | +1.5 |
| Reaching the final | +1.5 |
| Winning it | +2 |

**One European club season is worth**, per club: 1 a round won, +2 for lifting it, all scaled by the
competition — the Champions League counts full, the Europa League 0.7, the Conference League 0.5,
because a quarter-final in one is not the same evening as a quarter-final in another.

That club total is divided by **how many clubs the country entered**, and that division is the whole
reason it works. A country at the top of the order sends seven clubs to Europe and one at the bottom
sends five, so a raw total would reward a country for the places it already has: the rich would
compound and the order would set like concrete. Per club entered asks the only question worth asking —
how well did its clubs do, each of them?

Each half is averaged over the last **five** seasons, measured against **its own** field average, and
the two contributions are added and clamped to **±0.20 of prestige** — so prestige stays the anchor
and the football bends the order around it. Two reasons it is a nudge rather than the
whole ranking: prestige also scales wages, reputation and the bar for selection, so if European
places came purely from international form "a big country" would mean one thing for what you are
paid and another for what you can qualify for; and one tournament is five matches, which is far too
little football to redraw a map with.

**The nudge ramps with the evidence.** A country that has played one tournament gets a fifth of the
movement one with a full window gets. A single good summer is the noisiest evidence there is and,
on an average, also the loudest — a country that wins its first tournament has a coefficient of
eight and nothing to temper it. So the map opens as the data file drew it and becomes earned as the
seasons accumulate.

**Your own performances feed the national half.** It is the one part of the world a career can move:
a Scottish striker capped five times a season drove Scotland's national coefficient to 5.5, the best
record in the world.

**But it is the smaller half, and that is deliberate.** European places are places for CLUBS, and
Scotland's clubs are the weakest in the world — its club coefficient sits below the field while its
national one sits far above. The two pull against each other, so that career won Scotland a Europa
League place in four separate seasons and lost it again in between. A great generation is worth
something; it does not by itself make a country's clubs good enough for the Champions League.

The world browser's **International** view shows the whole order — every country's coefficient, how
far it has moved them, and what each is currently worth in all three competitions.

### The season calendar

A season used to be a list of league fixtures and an index into it. With two cups and a European
competition running alongside the league, "what do I play next" stops being a property of one
competition, so the calendar knows about all of them:

| | |
| --- | --- |
| League | 30 rounds |
| European nights | rounds after league rounds 4, 12, 18, 24 |
| National cup | rounds after league rounds 5, 11, 19, 26 |
| International breaks | rounds after league rounds 7, 16, 21 |
| League cup | rounds after league rounds 8, 14, 22, 28 |
| The tournament | after the final league round |
| **A season** | **30 to 47 matches**, depending how far the knockout runs go |

The international knockout sits **after** the last league round, because that is when a tournament is
played and because it gives a career a shape a club season cannot: the league is decided, the cups
are won, and then the last thing that happens all year is a semi-final for your country.

The calendar carries a slot for **each** of the three European competitions on the same dates,
because it is a pure function of the league's length and cannot know which one your club is in. At
most one is ever playable, so the calendar is deliberately longer than any season can be — in the
same way it carries cup rounds for a cup you may go out of. `calendarLength` and `maximumMatches`
are therefore different numbers on purpose.

The interleaving is fixed rather than random, so the shape of a season is learnable and one season
can be compared with another. The calendar stores ROUNDS rather than fixtures, because a cup slot
only produces a match if you are still in that cup — and against an opponent nobody can know until
the previous round has been played. Knocked out, and the slot is simply skipped.

**Cup goals do not count toward league awards.** Statistics are kept twice: everything you did, and
league matches only. The golden boot is inferred from the league table, so it has to be judged on
league football — otherwise a good cup run could win an award the league never saw.

### Skipping a match

A season is up to forty-seven matches across five competitions. Playing every one of them is a
commitment the game should ask for rather than assume, so any fixture can be skipped.

**A skipped match is a real match.** The same engine, situation generator, goalkeeper, resolver,
statistics, rating and fatigue — the only thing that changes is who answers the decisions.
Inventing a separate statistical model of a match would have given the career two sources of truth
about what a footballer does, and they would have drifted apart the moment either was tuned, making
a skipped season and a played season incomparable.

The policy has to be fair in both directions: not a punishment, or skipping quietly wrecks a
career; not an exploit, or skipping becomes the best way to play and the decision mechanic the
whole game is built around becomes optional. Measured over 300 matches with the veteran striker
preset, deliberate choices span:

| Decision policy | Average rating |
| --------------- | -------------- |
| Always the worst option | 6.9 |
| Uniformly at random | 8.1 |
| **Auto-play (skip)** | **8.3** |
| Always the best option, decided early | 8.9 |
| *(letting the clock expire)* | *6.8 — a different thing entirely* |

Two things worth reading off that table. The six options a situation offers are mostly sensible, so
choosing at random is already close to choosing well and the room your reading buys is the narrow
band at the top. And **letting the timer expire is not the floor for choosing badly** — expiry
carries its own execution and tempo penalties on top of a poor choice, so it sits below even the
deliberately worst decision.

Auto-play is driven by the player's own Decision Making, Composure and Awareness, so it improves as
he develops — and skipping costs a raw teenager far more than a seasoned professional. Measured:
the veteran auto-plays at 8.3, an 18-year-old prospect at 6.3. Playing a young player's matches
yourself is worth real progression.

### Clubs drift

Clubs used to be constants: every rating came from the data file and never moved. That quietly
broke the market in a way no single formula was responsible for, because `squadLevel`,
`positionalNeed`, `transferBudget` and `reputationRequired` are all derived from those ratings. The
same clubs wanted you every summer for the same reason, and once you had seen one window you had
seen all of them.

Now a club's **quality** moves and its **identity** does not. Only attack, midfield and defence
drift — the three ratings that decide the table, the market and the coaching. Possession, tempo,
width and the rest are left alone, because they are what makes a wide-play side a wide-play side,
and a club that gradually forgot how it plays would make tactical fit meaningless.

The model is mean-reverting: finishing well pulls a club up, finishing badly pulls it down, the
pull is toward a target rather than a jump, and everything is leashed to the club's own baseline.
Without the leash, twenty seasons of noise turns the smallest club in the game into the biggest and
the ladder stops meaning anything. Promotion and relegation need no special case — a promoted club
won its division and drifts up, a relegated one finished bottom and drifts down.

### Contracts

Wages used to be a number printed on the offer card and then forgotten. The club's side of the
market was fully modelled — what it could afford, what it needed, how it played — and the player's
side was not modelled at all, so every decision came down to football and money never once changed
an answer.

A contract makes it a two-sided deal:

- **Wage** is a demand as well as an offer. A club that will not pay what you expect does not sign
  you, however much it likes you. Reputation dominates the demand deliberately: ability appears on
  both sides of the gate and very nearly cancels, so what actually decides affordability is how
  well known you are against how big they are. Fame is expensive to live up to.
- **Length** is the clock. Deals get shorter as you age — five seasons at 21, one at 33 — so the
  back half of a career is a series of one-year proofs rather than a settled job.
- **Expiry** is the event. When a deal runs out you must resolve the summer, and if nobody renews
  you leave on a **free transfer**, which is the one time the whole market can afford you.

Your own club offers new terms only when the old deal has actually expired; anything else and you
are simply still under contract, and staying needs no decision. A club renewing its own player is
exempt from the *fee* gate but not the *wage* one — otherwise every small club would lose the
academy graduate it had been playing for years the moment he outgrew its transfer budget.

The career can never softlock on a contract. Out of contract, with no renewal and no offers, your
club puts up a reduced one-year deal rather than leaving you with no season to play, and the review
screen says exactly that.

### Awards and honours

A career needs a record of the things that cannot be taken back. Ability decays, reputation
settles, a club can relegate you — but a title is a title ten seasons later, and an honours list is
the only part of the save that only ever grows.

The problem is that individual awards need rivals, and the game has no other footballers. There is
no squad, no opposition scorer, nobody to finish second in a vote. Inventing a full league of
players to award one trophy would be a simulation the rest of the game does not have and could not
keep consistent.

So the rivals are derived from the football that actually happened. Every club's goals are already
in the table, so the division's leading scorer is a plausible **share** of the goals its club really
scored. That gives a golden boot which responds to the season — a division full of 4-3s produces a
higher bar than a division of 1-0s — without pretending to know anyone's name. Your own goals are
removed from your club's total first, so you are never competing against yourself, and the whole
benchmark is deterministic from the season seed, so an honour is never a reroll away.

| Honour | How it is won |
| ------ | ------------- |
| Champions | Finish top of your division |
| The Cup / The League Cup | Win either domestic knockout |
| The double / the treble | Two or three of the domestic trophies in one season |
| A European title | Win the Champions, Europa or Conference League |
| European finalist | Reach a European final and lose it — not a trophy, and still the season of a career |
| The continental treble | League, a domestic cup and Europe in one season |
| Promoted / relegated | Your club goes up or down |
| Top scorer | Outscore the division's leading scorer |
| Player of the season | Beat the division's best rating *and* its best goal contribution, from a top-four club |
| Young player of the season | The same, at 21 or under, against a gentler bar |
| International debut / caps | Picked for your country, and a cap for every match you play for it |
| International champions | Win the tournament, having played in it |
| International finalist | Reach its final and lose it |

Individual awards require having played at least 60% of the season. Nobody is player of the season
on nine appearances. Team honours carry no such condition — a cup belongs to the club, not to your
form, and you do not have to have been good to have won it.

### Ending a career, and what survives it

A career used to have exactly one ending: **Abandon** on the home screen, a browser dialog, and
eighteen seasons of honours, records and history deleted between one click and the next. The most
consequential action in the game was the only one with no screen of its own, and nothing carried
over — which meant there was no reason to have played the first career before starting the second.

There are now two ways for a career to stop, and both go through the same end screen.

**Retirement** is offered at the season review. From **34** you are asked, and can say no as many
times as you like; from **39** the decision has been made for you. The question is deliberately a
summer one — a footballer does not walk away in the middle of a season, and asking after a bad
match in November would turn a dip in form into a life decision. When the last two seasons show a
real fall in average rating, the offer says so, and names both numbers.

A forced retirement survives a reload. The review is a screen you can simply close, and without
that check a player who shut the tab on being told his career was over would reopen the game to a
hub that let him play on — and be told again next June, forever.

**Ending it yourself** is the old Abandon, routed through the same place. There is no browser
dialog any more: the end screen *is* the confirmation. You are shown what you are about to stop —
every season, the honours, the record book, the whole route from first club to last — with the
button to go back underneath it. A career that survives being read in full is one you meant to end.
Nothing is written until you press the button.

#### The wall of fame

Ending a career writes a **legacy**: a small, flat summary that outlives the career it came from.
Every finished career is kept, ranked against every other one this browser has played.

A legacy is a summary, **not a snapshot**. Keeping the whole `CareerState` would be easy and wrong —
it would multiply the save's size by every career you have ever finished, and every future migration
would have to migrate careers nobody is playing. A finished career is finished, so it stores
conclusions rather than the material they were drawn from.

It also stores **names as well as ids**. Everywhere else the save refers to clubs by id and resolves
them at render time, which is right for a live career: the club drifts, gets promoted, and must be
read fresh. A finished career is the opposite case — it is a historical record, and a wall that
throws because a club was renamed is worse than one that shows the name the career played under.

Totals come from the **record book**, not from `history`. History holds completed seasons, so a
career abandoned in March would otherwise lose the season it was abandoned in — the very season that
made somebody abandon it. The record book is written per match, so it already contains today.

The ranking is `careerScore`, and it is blunt on purpose: it exists to put the best career at the
top, not to settle an argument. Three things are balanced — what he won, what he produced, and how
long he did it for. Longevity is weighted lightest, so a twenty-season journeyman sits below a
ten-season winner, but it is not zero, because turning out four hundred times is itself an
achievement. The rating term is centred on 6.5 rather than 0, so an average career scores nothing
for it either way; without that, appearances would be paid twice. Honour weights are deliberately
*not* the reputation weights: reputation asks how good he is now and decays, this asks what he will
be remembered for and cannot. A European Cup outscores the league title that qualified him for it,
an international tournament outscores everything, and a relegation costs something.

A career that never played a match is not kept. The threshold is the lowest one possible — a single
appearance — because anything higher would start judging which real careers were worth remembering,
and that is what the ranking is for.

**Clearing is deliberate, and separate.** Wiping the wall never touches the career being played, and
ending a career never touches the wall: they are two different kinds of loss, and running them
together would make one of them a surprise. The wall can be cleared whole or one career at a time,
behind a two-step press rather than a browser dialog — an action this final deserves a button that
says what it is about to do. The wall is capped at twenty, because localStorage is not: a browser
used for a year would otherwise accumulate entries nobody scrolls to, and the quota it eventually
hit would take the live career down with it. The entries dropped are always the lowest-ranked.

Enshrining and clearing the career are **one write**, never two. Two writes have a moment between
them, and a browser that dies in that moment leaves you either with a career you have already said
goodbye to, or with a wall entry for a career still being played.

### Balancing notes worth knowing

Two calibration bugs were found by measurement rather than by eye, and both are documented at
their constants:

- **Growth looked far too small.** Current Ability is a weighted average of twenty attributes, so
  raising it by one point means spending roughly twenty attribute points. The original growth base
  moved a potential-91 prospect from 54 to 56 over five seasons, which is not a career arc.
- **Fatigue was inert.** A full 90 minutes cost only ~15 fitness, worth a 0.03s timer penalty, and
  Stamina 40 differed from Stamina 78 by under 0.02s. A match now costs 30-40 fitness, so tired
  legs are worth about a tenth of a second of thinking time and Stamina earns its place.
- **The bottom of the transfer market was dead.** Budgets pitched at a club's own squad level left
  the smallest sides unable to afford anybody who would improve them, because a market value
  carries premiums a bare ability does not. Affordability is meant to stop a struggling club buying
  a star, not to stop it signing a decent footballer.
- **Reputation ran away from itself.** With unsaturated per-match gains a decent striker reached 98
  by his mid-twenties on volume alone, and the summer settlement then dragged him back ten points
  every year — which read as the game taking something away rather than as fame having a ceiling.
- **A whole division was invisible.** Promotion and relegation were implemented, tested and wired
  in — and nothing ever showed them. The hub rendered the player's own table and only his own, and
  the review reported only his own club's movement, so unless you were relegated into it you could
  play several seasons without learning the second division existed. It was reported as "I did not
  notice the second division", which is exactly right: a system the player cannot look at may as
  well not exist. Eight countries is eight times the same opportunity, hence the world screen.
- **The wage gate never fired.** As first written, what a club offered and what a player demanded
  scaled with ability at almost the same rate, so ability cancelled and the gate came down to a
  constant that was always on the accepting side of the line. Money was decorative — exactly the
  problem contracts were added to fix. Reputation now dominates the demand and the club-standing
  spread is wider, so a household name really is priced out of a small club. The division scales
  both sides *identically*: when wages fell faster than demands in the lower division, dropping
  down became impossible for everyone, which fired the gate on the division rather than the player.
- **The calendar is longer than any season can be.** It carries a slot for each of the three
  European competitions on the same dates, because it is a pure function of the league's length and
  cannot know which one your club is in. Asserting the calendar's length against the most matches a
  season can contain therefore fails, and the fix was not to shorten it but to admit they are two
  different questions: `calendarLength` counts slots, `maximumMatches` counts football.
- **A frozen number reads as a claim.** Once you were knocked out of a knockout, the rest of it was
  not played until the season was resolved, so the hub showed "8 still in" for months next to "out
  in the first round" — technically everything the model knew, and read as if the competition had
  stopped existing when you left it. Hiding the count was the first fix and the wrong one: it
  treated a stale number as a display problem when the competition really had stopped. Knockouts
  you are out of now play on round by round on their own dates, so the count is live, the card
  eventually names whoever lifted it, and nothing has to be hidden. Same family as the invisible
  division above: state the player can see is a statement, and a stale one is a wrong one.
- **The same mistake, four competitions later.** The world screen was written to stop a system
  being invisible, and then two domestic cups, three European competitions and an international
  tournament were added to a screen that rendered league tables and nothing else. Of five
  competitions in the world, one was browsable. The bracket a cup is actually about — who else is
  in it, who you might meet, which of the big clubs went out on a Tuesday night — was state the
  game held, updated and never once drew. Being able to say "a system the player cannot look at may
  as well not exist" turns out not to stop you doing it again; the only thing that does is asking,
  of every new competition, which screen shows it.
- **Two halves of one qualification, decided by two different worlds.** European places are awarded
  on each country's final table and on who won its cups. The tables are settled with the strengths
  the season was played on; the cup winners for the seven countries you are not in are recomputed
  on demand, from whatever the strengths are when they are asked for. Because the clubs drifted
  first, the cup half was answered by NEXT season's squads — so a club that had just collapsed
  could lift a trophy on the strength of a side it no longer had, and take a European place with
  it. It moved about one winner in twenty-five, which is exactly the size of bug that survives a
  test suite: nothing crashes, nothing is non-deterministic, and the answer is quietly from the
  wrong year.
- **A European place was invisible at the moment you chose.** Europe follows the club, so signing
  for a club that qualified is one of the strongest reasons to move — and the transfer card listed
  country, prestige step, squad level, tactical style and wages, and said nothing about it. You
  could turn down the Champions League for a bigger badge without ever being told. Each offer now
  names the competition it comes with, and so does staying.
- **A game-design argument is not an argument against the sport.** The World Cup field was first a
  confederation quota, then rewritten as "rank the world and take the top sixteen" on the reasoning
  that a quota guarantees the weakest confederation's best nation a place it has not earned while
  shutting out a better nation from a stronger one. Every word of that is true and it is beside the
  point: a World Cup is not the sixteen best teams, it is a tournament the whole world enters and
  each part of the world sends its own. Ranking the globe produces a competition with a name it has
  not earned. The quota is back, and the reasoning that removed it is recorded here so it does not
  get made a third time.
- **Reaching for the nearest structure builds the wrong competition.** The international game had one
  tournament and most of the world outside it, which is a real problem — measured, twenty-five of
  forty-four nations never played a match across eight seasons. The fix reached for was three world
  tiers with promotion between them, mirroring the three European club competitions. That is the
  UEFA Nations League: a league rather than a cup, a European invention rather than a FIFA one, and
  not a World Cup at all. The hole was real and the answer was borrowed from the wrong sport's wrong
  competition. FIFA's own answer is that everybody plays a continental championship and the best of
  each confederation reach the World Cup — which fixes the same hole without inventing a tournament
  football does not have.
- **A tournament that never happens cannot score anybody.** Only the player's own tournament was
  played out, so in a continental season four of the five confederations simply did not exist that
  year — and every country in them recorded "did not compete", which meant their national side could
  never move their standing again. Every tournament of a season is now played, the player's for real
  and the rest in the background, exactly as the two European competitions he is not in already are.
- **A world with no clubs in it stands perfectly still.** National sides are derived from their
  country's five strongest clubs, which is why they need no roster and drift for free. Thirty-six of
  the forty-eight countries have no clubs, so their authored strength would never have moved — Brazil
  fielding precisely the same side in season eighteen as in season one while every European nation
  drifted a dozen rating points around it. Over a career the two halves of the world come apart: the
  derived nations spread out and the authored ones stand in a line. They now drift on their own, and
  are pulled back toward where they belong so that a random walk does not eventually produce a world
  with Panama above Brazil.
- **Two scales that have to meet.** The authored strengths were first written as what a national side
  felt like in isolation, and the result put ten of the twelve European sides above every nation
  outside Europe. A World Cup would have been a European procession with Brazil in it. A derived side
  is its best club lifted by its country's depth — Spain lands at 0.977 of the scale and Austria, the
  twelfth league, at 0.813 — and any number authored without measuring against that is authored
  against nothing. Calibrated, the two halves interleave.
- **"Scored nothing" and "did not compete" are different facts.** The tournament holds eight nations
  and the world has twelve, so four countries play no international football each year. Recording
  that as a zero looked harmless — it is what the ledger does for a country that entered and lost
  everything — and it dragged every non-qualifying country down by about a fifth of the whole swing,
  which is most of what one would need to climb back INTO the tournament. Not qualifying became
  self-reinforcing and the bottom of the order was sealed shut: exactly the compounding the club
  half is divided per club entered to avoid, reintroduced through the other half. A country that did
  not play now records nothing at all, neither help nor harm, and is judged on the football it did
  play.
- **A weighted average of two movements is smaller than either.** When the coefficient gained its
  club half, the obvious way to say "clubs count more" was to weight the two halves as shares of one
  movement — 0.6 clubs, 0.4 nation. What that actually said was "each half alone can only reach its
  share of the swing": a country with a perfect international record and ordinary clubs could move
  0.08 where it used to move 0.19, which deleted the one thing in this game a player's own
  performances can change. The halves are now additive contributions on their own scales with only
  the total clamped, so "clubs count more" means what it should — a point of club form is worth more
  prestige than a point of international form — and either half alone still carries as far as the
  swing allows.
- **The two halves are not on one scale, and guessing which is wider is not a plan.** Measured over
  240 country-seasons, club coefficients run 0.19 to 1.52 with deviations reaching ±0.77, and
  national coefficients run 0.50 to 6.10 with deviations reaching ±3.22 — five times wider, because
  one is an average per club entered and the other is a whole campaign. A scale guessed for one is
  wrong for the other by a factor of five. This is the same lesson as the mis-calibrated scale
  below, learned a second time in the same file.
- **A range that was really a ceiling.** The country coefficient was first allowed to move a
  country ±0.15 of prestige, which looked ample against neighbour gaps of 0.02 to 0.16. Played out,
  a Scottish career that won five caps a season for eighteen years drove Scotland's coefficient to
  6.0 — the best record in the world by a distance — and Scotland's allocation never moved once. The
  gap to the Netherlands was 0.16, more than the entire swing, so no record however good could cover
  it without the country above collapsing at the same moment. The one country with everything to
  gain from the mechanic was the one country the mechanic could not reach.
- **A distribution with no step where the country stands.** Widening the swing fixed the ordering
  and changed nothing: Scotland climbed to seventh and still had exactly what it had at eighth,
  because the Champions League row gives ranks six, seven and eight one place each. A mechanic can
  be correct, visible, well tested and still deliver nothing, if the thing it moves has a plateau
  exactly where the movement happens. The two lower competitions now respond to the order as well,
  so climbing trades a Conference place for a Europa one — the totals are unchanged and the football
  is better.
- **Scaling calibrated on the wrong measurement.** The coefficient's scale was set from the spread
  of country averages over sixty tournaments (2.0 to 3.3) — but no country is ever judged on sixty
  tournaments. Judged on the five in the window, real coefficients ran 1.7 to 5.3, every deviation
  clamped, and five countries of eight sat pinned at exactly the maximum swing. The nudge had
  stopped being a gradient and become "top group up, bottom group down", which flips an allocation
  whenever two countries trade places by a hair. Calibrate on the window you actually measure over.
- **Twelve independent maxima compound.** A national side was first built by taking the best of
  each rating across its country's top five clubs, which sounds like what a selection is. It put all
  eight nations between 0.82 and 0.97 strength: a country with one good defence and another club's
  good attack ended up with both, every international was squeezed into the top fifteen per cent of
  the scale, and Scotland came out near enough England. Building on the best club and lifting it by
  the country's depth keeps the spread of nations tracking the spread of the clubs they are drawn
  from.
- **The tournament only moved when the player moved.** A group round he was not picked for is still
  played — by everybody else, on the night it was scheduled. Without settling those rounds as their
  dates pass, a player outside the squad could not be shown a live group table, and, worse, a player
  who climbed into selection midway through a season found no knockout waiting for him: the groups he
  missed were never finished, so the bracket seeded off them was never built.
- **"Reached it" and "still in it" are different questions.** The tournament card read the survivors
  to decide whether a nation had qualified, so a nation that lost a semi-final was reported as having
  gone out at the group stage — and, before a single knockout round had been drawn, every qualified
  nation was reported as eliminated, because a round is only drawn when somebody reaches it.
- **An international is played in a different shirt.** The match builder handed the engine the
  player's CLUB for every fixture, so a call-up would have put him out for his club against a
  national side — and, since the goalkeeper is looked up by the side's id and no nation has one of
  its own, thrown on the way. Nations borrow the best keeper in their country, which is what a
  national side does anyway.
- **The obvious baseline for auto-play was the wrong one.** Skipping a match was first tuned against
  "letting the timer expire", which looked like the floor for deciding badly and is not: expiry
  carries execution and tempo penalties on top of a poor choice, so it sits *below* deliberately
  picking the worst option every time. Measured against the right baseline — choosing uniformly at
  random — the first policy was nearly as good as playing perfectly, which would have made skipping
  the strongest way to play.

---

## Current scope

The core mechanic and a playable career loop.

Implemented: home screen with career and quick-match modes, custom player creation with a chosen
nationality, seeded match engine, thirteen situation archetypes (including penalties, direct free
kicks, corners, aerial duels and pressing traps), ~60 contextual actions, dynamic decision timer,
build-up narration, goalkeeper commit mechanic, action resolution with separated choice/execution,
instinctive fallback on expiry, match statistics and rating, five playable presets across four
positions, **a world of forty-eight countries across five confederations — twelve of them with leagues of their
own, 192 clubs in all**, **a national cup and a
league cup in every country**, **a Champions League, a Europa League and a Conference League entered
by league position and by winning a cup**, **a yearly international tournament contested by the eight countries highest in the European
order, with groups, a seeded knockout and a squad you have to be good enough to be picked for**, **a country coefficient
that turns those results into how many clubs each country sends to each European competition**, **a season calendar
interleaving all of them**, season fixtures,
a world browser covering **every competition there is — any country's league, both of its cups, all
three European competitions and the international tournament**, each shown as far as the season has
actually got, **the option to skip any match and have the player decide for
himself**, per-match player development, ageing and multi-season career history, end-of-season
progress reports, pre-season training, a reputation model, a transfer market spanning countries
with club valuation, scouting interest and summer offers, clubs that strengthen and decline season
to season, contracts with wages, terms, expiry and free transfers, an honours list covering titles, cups,
European trophies, domestic and continental trebles, top scorer, player of the season,
international caps and tournament wins, **a career record book of braces, hat-tricks, four- and five-goal games, perfect
ratings, scoring and unbeaten runs and per-competition totals**, **an ending — retirement offered
from 34 and forced at 39, an end screen that shows a career in full before you stop it, and a wall
of fame that ranks every career this browser has finished**, promotion and relegation machinery
(dormant on a one-tier world), debug mode, and a versioned localStorage save with migration.

Deliberately **not** built yet: multiplayer, accounts, a backend, 3D, physics, large player
databases.

## Roadmap

The four agreed stages — a world of countries, domestic cups, European competitions and
international football — are all done, and so is the end of the loop: a career can now finish, and
finishing one leaves something behind.

What remains, **ordered by what it unblocks rather than by size**. The first item is the one every
other item on this list is waiting for.

1. **Squad context** — named teammates, so an assist has a recipient and a club has a shape.
   The biggest structural gap by a distance, and the blocker for most of what follows: the
   reputation settlement weights playing time and awards require 60% of a season, but you start
   every fixture forever, so neither can bite. `Team` is currently a set of ratings and nothing
   else.

2. **Injuries and squad rotation** — the fitness model has enough bite to support them
   (`FITNESS_RECOVERY`, and a match that costs 30-40 points), and they are what would make the
   playing-time half of reputation real. **Depends on squad context**: without teammates, an injury
   only means a match is skipped, with nobody taking your place and nothing to win back.

3. **A second division per country** — the machinery is written, tested and dormant; it needs clubs
   and a fixture list. `teams.json` is 192 clubs, sixteen per country across twelve countries, every
   one of them tier 1. It is genuinely a data change rather than a re-implementation, but it is not
   *only* one: a second tier reaches into the country coefficient, European entry (a relegated club
   loses its place) and `positionalNeed` in the transfer model. It adds no matches to the calendar,
   which is already full, so it is cheaper than it looks.

4. **Playable goalkeeper** — `GK` exists as a position but has no playable match loop, so it needs
   its own situations and involvement model. It also needs its own department in the transfer model:
   `positionalNeed` currently reads a keeper against the outfield defence rating, and every
   tactical-style weighting is an outfield profile. Independent of the three above, and the largest
   single piece of new simulation left.

5. **Richer location model** — the tactical zone model is designed to be swapped for 2D coordinates
   behind the same `Zone` interface. Deliberately last: nothing else is waiting on it, and it is
   worth more once there are teammates to have positions.

Deliberately not on the list, and worth saying why: **multiple career slots**. The save holds
exactly one career, which is why ending one used to be destructive. The wall of fame softens that —
what a career did survives it — but it does not remove it, and slots would. It is the obvious next
quality-of-life change if ending a career still feels too expensive.
