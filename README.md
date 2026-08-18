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
│   ├── career/            development, league, season state, reputation and transfers
│   ├── events/            situation context, action/outcome types, tactical zones
│   ├── goalkeeper/        goalkeeper model + commit behaviour
│   ├── match/             match state, statistics, rating
│   ├── player/            attributes, positions, tendencies
│   ├── team/              team ratings and tactical styles
│   ├── util/              numeric helpers
│   └── rng.ts             seeded RNG
├── simulation/            the engines — all head-less and testable
│   ├── MatchEngine.ts     minute-by-minute possession loop
│   ├── CareerService.ts   seasons, fixtures, league simulation
│   ├── SituationGenerator.ts
│   ├── ActionGenerator.ts contextual 1–6 option generation
│   ├── DecisionTimer.ts
│   ├── ActionResolver.ts
│   └── InstinctiveAction.ts
├── rendering/             canvas drawing only
├── ui/                    screens, components, input
│   └── actionFamilyStyle.ts  option colour/tag palette (presentation only)
├── data/                  static game data (JSON) + action catalogue + situation templates
├── persistence/           versioned localStorage save
└── main.ts
```

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

251 tests covering timer calibration, event pacing, build-up narration, development, fixtures, league simulation, career progression, player creation, training and season progress, player valuation, club interest and offer generation, reputation gain and settlement, save migration, save validation, action generation (including the invariant that every
situation can always fill six slots), resolution, goalkeeper effects, attribute effects, chance
generation, randomness boundaries, position-specific behaviour, instinctive actions, rating,
pace scaling, option colour coding, boot recovery, set-piece conversion rates, the penalty commit
read, defensive archetype routing, the invariant that a defending player is never offered an action
that could score, the invariant that no catalogue action is unreachable, and full-match
determinism.

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

- **A season** is a double round-robin between the eight clubs — 14 matches. Every fixture you
  are not in is resolved probabilistically, so the league table around you is always live.
- **After every match** your rating feeds form and morale, and development is applied.
- **Development** is driven by age, headroom below Potential Ability, match rating, minutes
  played and your club's coaching quality.
- **A season ends** with a review: league position, your statistics, a scout's view of whether
  your ceiling has moved, and where your reputation now sits. Then comes the summer — the
  transfer window, then pre-season training — and you age a year and go again.

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

The eight clubs therefore form a ladder, and climbing it is the point of a career:

| Club | Style | Squad level | Expects | Budget |
| ---- | ----- | ----------- | ------- | ------ |
| Castleford Royals | Possession | 86 | a *Star* (rep 78) | £210m |
| Ashford United | Possession | 74 | *Well known* (rep 61) | £64m |
| Kingsbridge FC | High Press | 68 | *Well known* (rep 52) | £35m |
| Vale Park Wanderers | Balanced | 60 | *Established* (rep 41) | £16m |
| Northport City | Counterattack | 58 | *Established* (rep 39) | £13m |
| Brackenmoor Rovers | Wide Play | 55 | *Established* (rep 34) | £10m |
| Old Harbour Town | Direct | 52 | *Known locally* (rep 30) | £7m |
| Seaton Athletic | Defensive | 51 | *Known locally* (rep 28) | £7m |

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

Which is why the transfer screen shows the squad level, the style, the need in your position and
where you would sit in the side, rather than a fee and a badge. **Staying is a first-class choice**:
the club that wants you most is usually the one you would be best at, and that is not always the
club worth joining.

Market value is a pure function of the player — ability (exponentially: the gap between a 60 and a
70 is a few million, the gap between an 80 and a 90 is most of a stadium), a potential premium only
the young command, a hard age cliff after 30, and reputation and form at the margins. Because it is
pure, the hub can show it at any moment and the market can never disagree with the screen.

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

---

## Current scope

The core mechanic and a playable career loop.

Implemented: home screen with career and quick-match modes, custom player creation, seeded match
engine, thirteen situation archetypes (including penalties, direct free kicks, corners, aerial
duels and pressing traps), ~60 contextual actions, dynamic
decision timer, build-up narration, goalkeeper commit mechanic, action resolution with separated
choice/execution, instinctive fallback on expiry, match statistics and rating, five playable
presets across four positions, eight teams with tactical styles, **season fixtures, live league
table, per-match player development, ageing and multi-season career history, end-of-season progress reports, pre-season
training, a reputation model and a transfer market with club valuation, scouting interest and
summer offers**, debug mode, and a
versioned localStorage save with migration.

Deliberately **not** built yet: multiplayer, accounts, a backend, 3D, physics, large player
databases.

## Roadmap

- **Playable goalkeeper** — the last event type on the original list, and the only one that needs
  more than a template: `GK` exists as a position but has no playable match loop, so it needs its
  own situations (shot-stopping, claiming a cross, sweeping, distribution) and its own involvement
  model rather than a share of an outfielder's.
- **Squad context** — named teammates, so an assist has a recipient and a club has a shape.
- **Injuries and squad rotation** — the fitness model now has enough bite to support them.
- **Awards and honours** — player of the season, top scorer, international call-ups.
- **Richer location model** — the tactical zone model is designed to be swapped for 2D
  coordinates behind the same `Zone` interface.
