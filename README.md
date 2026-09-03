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

#### The resolution is animated

The decision has a fourth beat: once the engine has resolved it, the ball
**flies on the same pitch the moment was read on** — to the net, into the
keeper's committed dive, off the post, out to the man the pass picked — for
under a second before the overlay comes down and the text banner takes over.
The **keeper dives across that flight** rather than appearing in his new
position, which is the part worth watching: he commits faster than the ball
travels, so by the time it reaches him he has already gone one way or the
other. The ball carries a short **trail**, because a four-pixel dot crossing a
small pitch is a thing you have to already be looking at to see, and the
outcome lands **in words on the same line that spent the moment urging you
on** — the banner behind the overlay cannot be read until the overlay is gone.
Nothing about it is new information (the outcome is decided before the first
frame), but the read the whole mechanic asks for is "which way has he gone, and
did I beat him?", and that question deserves to be answered in the picture that
asked it. It is skipped when the browser asks for reduced motion; the outcome
banner and sound cue carry the same fact either way. See
`SituationRenderer.animateResolution` and `EventOverlay.playResolution`.

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

### Leaving a match that has already started

Once a match began there was no visible way out of it. Ninety simulated minutes is not long, which
is why nobody noticed — until it is a phone and somebody has to be somewhere, and then the only exits
are closing the tab or sitting through it.

**It is not an undo, and that is the whole design.** The rest of the match is *played out without
you* and the result stands. Abandoning back to the hub would have been easier to build and would
have made a save-scum out of the seed: every fixture is deterministic from its calendar slot, so a
match you could walk out of and re-enter is one you could retry until the chance went in. Leaving
costs you control of the remainder, which is a real price and the honest one.

It takes **two presses**, and the first one **pauses**. The word "leave" does not say what it costs,
so the armed label does — and stopping the clock while somebody reads it is the least the screen can
do, given that the reason they reached for the button is usually that they are out of time. Focus
leaving disarms it, like every other guarded button in the game.

A walked-out fixture is folded as **skipped**. "How much of this career did you actually play" must
never be flattered by a match somebody left, and counting conservatively is the only honest direction
for a label about your own attention. A walked-out **trial** is judged by exactly the same arithmetic
as a finished one, through the same method — the moment those drift is the moment leaving becomes a
way of getting a different answer. A **quick match** simply ends, because it touches no career and
there is nothing there to retry.

### Settings

**Decision pace**, **match speed** and **career hub** live on the home screen and are **saved
between sessions**, because they describe how *you* want to play rather than anything about a
particular match. The first two were previously chosen per match and never persisted, which meant
reloading and continuing a career silently reverted a deliberately relaxed game to Standard — the
game got harder without saying so. The third picks the hub's layout; see
[The shape of the hub](#the-shape-of-the-hub).

**Sound** is one switch, on by default. Everything audible — the crowd, the
build-up beats, the decision clock, the keeper's commit, the outcome — is
synthesized in the browser by the Web Audio API (`audio/SoundEngine.ts`), so
nothing is downloaded and nothing can 404. Every cue restates something that is
already on screen, which is what makes the switch genuinely binary: muting
loses atmosphere, never information. The clock is never audible at the untimed
pace — a clock you can hear is exactly the pressure that setting removes.

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
on his line. The canvas shows this (he changes colour and pulses), and a **keeper strip** beneath it
says it in words: what he is doing, and what it has opened up.

That strip is a correction. For a long time the mechanic the README calls the most important thing
on screen was an **eleven-pixel monospace caption painted onto the middle of the pitch** — the
quietest element on the busiest part of the interface, and invisible to a screen reader, because a
canvas is `aria-hidden` and cannot be anything else. The words live in the DOM now, at a size that
matches their importance, and turn amber the moment he moves.

Showing the same fact more legibly is **not a balance change**, and it is worth saying so plainly:
every state was already on screen at exactly the moment it is now. Nothing is revealed earlier, and
nothing new is revealed at all. The one thing the strip adds is a **tell** — *"the far post is his
weak side now"* — which names a consequence a player who had watched a lot of football would already
see. It never says what to do. That would be the game playing itself.

That creates the central tension:

- **Decide early** and you act on incomplete information, but you get a small tempo bonus.
- **Wait for his commit** and several options change value sharply — chipping a keeper who has
  rushed out is a great idea; chipping one still stood on his line is a terrible one — but you burn
  clock, and deciding in the final sliver of the window is a rushed action.

There is no universally optimal button. That's the point.

#### Reading the rest of it

Two smaller things around that strip, both of which had been quietly wrong since the overlay was
written:

**The pitch had no key.** The action families had one from the start — SHOT, RUN, CROSS — while the
dots on the pitch had none, so a new player had to work out that blue was himself from the fact that
it moved. There is a key now, drawn from the renderer's own palette rather than a restatement of it:
a key in approximately the right colour is worse than no key.

**The clock did not say what it was counting.** During the build-up it showed the window length
beside a full bar, which reads as a countdown that has jammed; at the *no time limit* setting it
showed `∞`, which is honest but tells you nothing about how long you have been standing there. Both
now carry a caption — **your window**, **seconds left**, **elapsed · no limit** — and the number
shows **one decimal instead of two**. Nobody has ever read a hundredth of a second off a screen, and
the extra digit only made it harder to glance at in the one moment glancing is all there is time
for.

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

### What a chance is worth

The roadmap recorded for a long time that "auto-play scores far too much" — 2.9 goals a match at
ability 85 — and deliberately left it alone. Measuring it took three passes and each one moved the
blame. The first two are recorded in [ROADMAP.md](ROADMAP.md); this is the one that was real.

**Chance volume was never the problem.** Decomposing goals into
`involvements × shots/involvement × goals/shot`, a great striker gets barely more chances than a poor
one — 5.8 shots a match at ability 85 against 5.1 at 55, and an identical 0.65 shots per
involvement. The entire ability effect ran through **conversion**: 0.11 goals per shot at 55 against
0.39 at 85.

**The defect was that the chance itself barely counted.** `RESOLUTION_WEIGHTS.quality` was 0.18 —
half the weight of the player's own execution — so a good footballer's *hopeless* chance inherited
most of the value of his best one. Measured by band of `situationQuality`, with a perfect read:

| chance | ability 55 | ability 85 |
|---|---|---|
| poor (<0.45) | 18.8% | **27.6%** |
| fair (.45–.62) | 12.7% | 33.3% |
| big (≥0.62) | 22.6% | **44.5%** |

A world-class striker converted a genuinely poor chance more than a quarter of the time, and the
spread from hopeless to gilt-edged was **1.5×** where real football is nearer tenfold. That is what
made the aggregate absurd while every individual number looked defensible: `GOAL_CURVE` was
calibrated on one-on-ones, where it was right, and every speculative effort in the game came along
for the ride.

**The obvious fix inverts the game.** Raising `RESOLUTION_WEIGHTS.quality` was tried and measured
first. That weight feeds `value`, which every action family shares and which the whole decision model
is ordered by — so raising it makes the situation matter more and the *choice* matter less. At 0.58,
**choosing the worst available option outscored choosing the best** at every ability measured (0.68
goals a match against 0.53 at ability 55; 1.90 against 1.83 at 85), because a bad shot in a good
position now beat a good pass. A change that makes the decision mechanic the game is built on
actively harmful is not a balance fix, whatever it does to the aggregate.

So the chance's quality is **separated out and applied only at the goal roll**, as `SHOT_QUALITY`.
`value` is untouched, every option is ordered exactly as before, and reading the situation is worth
exactly what it always was. What changes is only whether the shot goes in.

**Set pieces are exempt, and that is what the adjustment is for.** A penalty sits at 0.88–0.95
quality and a direct free kick at 0.3–0.55; each is a named, separately calibrated situation whose
numbers were tuned against the conversion they were meant to produce. A gradient fitted to open play
double-counts the one thing they already state — and because they sit at opposite ends of it,
including them sent penalties past every bound their own tests set while driving specialist free
kicks below 2%. They keep the pre-split midpoint too, since the midpoint moved only to offset a
gradient they never receive.

**What it bought**, over 150 matches a side:

| | before | after |
|---|---|---|
| poor chance, ability 85 | 27.6% | 21.5% |
| big chance, ability 85 | 44.5% | **39.3%** |
| big chance, ability 55 | 22.6% | **18.6%** |
| goals per shot | 0.381 | 0.312 |
| goals per match | 2.24 | 1.82 |
| **goals per season** | **47.0** | **29.0** |

The big-chance row is the one that matters: 39.3% and 18.6% against the **40% and 20%** `GOAL_CURVE`
was always documented to produce. That calibration is now the one the game actually has, rather than
the one it had for its best chances and lent to all the others.

**What is still wrong, stated rather than hidden.** A hopeless chance still converts better than one
in five for a world-class striker, and the spread across bands is 1.8× against a real tenfold. No
constant in the resolver closes that — a bigger one either inverts the decision model or breaks the
set pieces, both measured. What is left is the **shot mix**: the game hands its striker five to six
attempts a match, most of them decent, because he is the focus of every situation it generates. That
is the situation generator's business.

#### The shot mix, now measured

That last paragraph was a diagnosis nobody had checked, so `scripts/measureShotMix.ts` was written
to check it. It records **every moment the player is in**, not only the ones that produce a shot,
which turned out to be the whole point. Over 200 matches a policy at each ability, auto-played:

| band of `situationQuality` | share of attempts | per match | converts (perfect read) |
|---|---|---|---|
| hopeless (<0.35) | **0.8%** | 0.05 | ~25% (16 attempts in 200 matches) |
| poor (.35–.45) | 5.2% | 0.31 | 24.1% |
| decent (.45–.62) | 44.0% | 2.63 | 24.9% |
| big (≥0.62) | **50.0%** | 2.98 | 40.4% |

**94% of a striker's attempts are decent or better** — worse than "most of them", which is what the
paragraph above had guessed.

**But the reason is not that the game withholds bad chances.** It generates them freely, about two a
match at ability 85. What the player does with them is the thing:

| | becomes a shot |
|---|---|
| a poor or hopeless moment | **17.7%** |
| a big chance | **87.2%** |

Midfield possession, the pressing trap, the aerial duel and the wide attack produce a shot **0%** of
the time; the edge of the box manages 32% and the side of the penalty area 41%. The population of
attempts is filtered by the decision model before it is anything else — a striker who squares the
ball rather than shooting from a hopeless angle has not taken a bad shot, he has taken **no** shot.
That is football rather than a defect, and it means the top-heavy mix is substantially a description
of somebody playing well.

**What is genuinely wrong is the slope**, and it can now be stated per ability: **9.6% of attempts at
ability 55, 17.7% at 70, 29.1% at 85**, against a real-football 12–15%. A poor footballer is already
*below* real conversion and a great one is double it.

#### Three ways to change the mix, and all three miss

The tool's other two modes change the world, measure what comes out, and put it back.

**Shifting the bands down works but is blunt.** Every `qualityRange` lowered by 0.10 takes ability 85
from 30.5% to 21.4% — still above real football — while dragging ability 55 to 6.6%, half of it.

**Stretching the bands apart makes it worse**, which is not what anybody would predict from reading
the data file: 30.5% → **37.0%**. Almost every template already sits above 0.5, so widening the
spread around the scale's midpoint pushes the bulk of the game's chances *up*.

**Reweighting the archetypes moves volume, not slope.** `positionWeights` and `qualityRange` are
correlated — for a striker the three likeliest moments are the three best ones (one-on-one at weight
6 over 0.62–0.90, the through ball at 5 over 0.50–0.82, the cross at 5 over 0.45–0.78) while midfield
possession sits at 0.6 over 0.12–0.40. Lifting the poor archetypes fourfold and halving the
one-on-one, with every band untouched:

| ability | attempts | goals | per attempt |
|---|---|---|---|
| 55 | 5.03 → 3.41 | 0.49 → 0.22 | 9.7% → **6.5%** |
| 85 | 6.01 → 4.25 | 1.79 → 0.91 | 29.7% → **21.5%** |

It fixes the *volume* — 4.25 attempts a match is a real striker's game rather than six — and does
nothing to the slope: **3.1× from 55 to 85 before, 3.3× after**.

**So the slope is not in the mix.** Three independent ways of changing which chances a footballer
gets all move the level and leave the ratio between a poor player and a great one alone, because that
ratio is the goal curve's response to `value` and nothing upstream of it can flatten a curve. Four
levers are now priced and none is free, which is why this is recorded rather than changed: any of
them moves every career in progress.

#### What had to be re-calibrated with it

Four things read the numbers this changed, and leaving any of them would have made a mechanical
correction into a silent design change.

**The season objective.** Its contribution rates were explicitly pinned to what a skipped season
returns, so they were re-measured and rescaled — a striker's rate from 1.15 to 0.76. The verdict
distribution is back where it was set: 15% exceeded, 50% met, 35% missed.

**The traits.** Every threshold reads evidence that moved. Measured over fourteen careers of fourteen
seasons, before and after: average rating 8.30 → 7.38, nines per 100 apps 48.1 → 26.7, hat-tricks per
100 13.0 → 7.6, longest scoring run 25.6 → 11.8, big-match average 8.06 → 7.07, assists 140 → 93,
perfect tens 173 → 70. Each threshold moved by its own measured ratio — the counting ones scaled, the
rating ones shifted — so **incidence is preserved**. Re-basing was forced by the engine change, and
using it as cover to also make traits rarer would have folded a design decision nobody asked for into
a correction nobody could then audit.

**The awards — deliberately not restored.** The golden boot bar is derived from the AI league table,
which this change does not touch, so the player now has to compete with his division rather than
lap it. Individual honours per 100 seasons went from 89 top-scorer and 65 player-of-the-season to
**70 and 29**. Winning the golden boot nine years in ten *was* the distortion the roadmap complained
about; restoring it would have undone the fix.

**The wall of fame.** `careerScore` reads goals and average rating, both of which moved, so a career
enshrined under the old model outranks an identical one played under the new — permanently, and
through no merit of its own. Each legacy now carries a `balanceVersion`, and older entries are
labelled on the wall. It is a **label rather than a rescale**, for the reason this game has already
settled once over skipped matches: rewriting a number somebody was shown the day his career ended is
the one thing a record must never do, and the factor doing the rescaling would be a fiction — no
multiplier turns a career that happened into the career it would have been.

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

**Somebody still has to choose the seed**, and that happens in `ui/careerSeed.ts` — the one layer
allowed to be non-deterministic, because it is the one with the buttons on it. A career takes a
fresh seed the moment its setup screen opens.

It used to be a text field on that screen, defaulting to the constant `footii-1` and restored from
the previous selection afterwards. **So the three careers this game advertises as independent lives
were three copies of one world**: measured at the same club on the default, an identical fixture
list, identical cup draws and an identically named rival. Anybody who never touched the box — which
is anybody who did not already know what a seed was — played the same fifteen years three times.

Nothing about determinism was given up with the field. The seed is still printed on every event in
[debug mode](#debug-mode), and an exported save carries whole worlds. What went is being asked to
invent one before the game has started, on the only control on that screen with no better or worse
answer. **A quick match keeps it**, where it means what it says: play the same fixture twice, decide
differently, and see what that was worth.

One property it had by accident is kept on purpose. The seed is minted when the career setup opens
and spent when a career begins, so failing a [trial](#where-a-career-may-begin) and going back gets
you the same trial rather than a fresh roll. That used to hold because the seed was a constant; it
now holds because it is deliberately not re-rolled — and it is stricter than before, since the
visible field was itself the reroll, one keystroke away.

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
├── generateWorld.py       regenerates the twelve leagues, their clubs and keepers
├── measureAutoPlay.ts     what a skipped match is worth, against a perfect read
├── measureInjuries.ts     how much football a career actually misses
├── measureObjectives.ts   whether the manager's target is one a season can hit
└── measureShotMix.ts      which chances the game generates, and what each is worth
```

The world data is generated rather than hand-authored: 192 clubs need ratings that agree with their
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

### The front door

The front door **was** the careers page: a rack of three slots, the wall of fame, a quick match,
three settings and the save panel, in one scrolling column. Everything a player could want was on
it, which is exactly the problem — the one thing he wants every time he opens the game, *carry on
with the career I was playing*, was a card among six other things and below a heading.

So the door is a menu now, and the careers page is what one of its entries opens. Nothing was taken
away; it was put in an order.

| | |
|---|---|
| **Continue career** | Named: the footballer, his club, the season, and how far into it he is |
| **Careers** / **New career** | The rack — start another, switch between them, end one |
| **Quick match** | One game, on its own ledger |
| **How to play** | The manual |
| *Wall of fame · Settings* | Underneath, in smaller type, and only offered once there is a wall |

**The order is not the order it was asked for**, and that is worth saying plainly. The request read:
how to play, continue, new game, quick game. That is the right order exactly once — on a first
visit, when there is nothing to continue and the manual is the only thing that can help. Every
visit after that it puts a document you read once above the action you take every session. So the
first entry is whatever the save says you are likeliest to have come for: **Continue** when there is
a career, **New career** when there is not. The manual is always one press away and never in the
way.

**A continue button that says who.** *Continue career* is a verb with no object, and this game keeps
three of them. The entry names the footballer, his club and his season, so pressing it is a decision
rather than a guess about which of the three is behind it.

**A label that is a fact about the save.** The second entry opens the careers page, and what that
page is *for* depends on what is in it. With careers on it, it is where you start another, switch
between them or end one. With nothing on it, it is not a page at all — three blank slots under a
heading is not worth a press — so on an empty save it reads **New career** and goes straight to the
creator.

Which entries appear and in what order is decided in `ui/titleMenu.ts` rather than in the markup,
for the same reason the hub's sections are: it is a decision about the save, and a decision you
cannot read without a browser is a decision nobody will check.

#### One screen, one question

Putting a menu in front of the careers page exposed what the careers page had been carrying. It held
a summary of the wall, a quick match, three settings, the save panel and a link to the manual —
every one of which is now an entry on the menu that opens it. **All five were on screen twice**, and
a page that offers everything has no answer to "where do I go".

So each of them went where it belongs:

| | |
|---|---|
| **Careers** | The three slots. Nothing else — no quick match, no settings, no save panel |
| **Settings** | Decision pace, match speed, sound, hub layout, and the save file they all live in |

**Key attributes** are the position's, everywhere they are shown. `keyAttributesFor` and
`summaryAttributesFor` in `core/player/positions.ts` are the single answer the creator, the training
grid, the hub card and the season review all read, so a centre back is measured on tackling and a
striker on finishing. Awareness, Decision Making and Composure are shown for every position — the
decision timer reads them whoever you are — but marked *key* only where the role asks for them too.
| **Wall of fame** | Careers that have *ended*, which is a different question from the three being played, and had a screen already |
| **Quick match** | Its own setup, straight from the menu |

The settings screen is the clearest case. The menu had an entry called Settings that opened the
*careers* page and scrolled it two thirds of the way down — a link that lands somewhere and hopes.
The save panel came with it: export and import are about the **browser**, not about any one career,
and importing replaces all three at once.

One field was wrong in the same family, and looking at it properly turned up a defect rather than a
label. The setup screen offered a **seed** on both screens, described as a match seed — but in a
career it became the career's own seed and settled every fixture, every draw and every summer for
fifteen years. Renaming it was the first fix and the wrong one: it should not have been on a career
at all, its default was a constant, and the result was three "independent" careers sharing one
world. It is a quick-match field now, and a career takes a fresh seed of its own — see
[Determinism](#determinism).

#### The mark

A game with a front door needs something on it that is not a word, and the first question is what
the mark should be *of*. A football is the obvious answer and the wrong one: every football game has
one, it says "football" and nothing else, and what makes this one different is not that it contains
a ball.

So the mark is the mechanic — a ring, six ticks around it, one of them longer and lit, and a ball at
the centre. That is a decision window, the six options in it, the one you took, and the thing you
took it with. It reads at 24px and at 240px, and somebody who has played for an hour recognises it
as a picture of what they were doing. It is drawn once in `ui/logo.ts` and used at three sizes, so
the title, the welcome and the careers page cannot drift apart.

### Arriving for the first time

Before any of that, a first-time player was being asked to choose a **decision pace** before
anything on the page had told him that a decision was a thing this game had.

The explanation did exist. It was five bullets inside a collapsed `<details>` at the very bottom,
under the careers, the wall, the quick match, the settings and the save panel. **Folded, below the
fold, and under five other sections is three separate ways of being unread.**

So there are two screens before the menu.

**A welcome, shown once.** Three beats, and deliberately not a tutorial: you are one footballer
rather than the manager; every moment is six options and a clock, with a goalkeeper who commits
inside your window; and it runs for fifteen years. Then three doors — start a career, read the
manual, or just look around. `seenIntro` is written the moment you leave by any of them, because an
introduction that came back because somebody was in a hurry the first time is an obstacle rather
than a welcome.

Existing players never see it. The migration marks anybody holding a career, or with one on the
wall, as having long since found out — showing them an introduction after an update would be the
game forgetting them. A save that exists but has never held a career *does* get it, which is the
right way round: the file may exist because somebody opened the page once, changed a setting and
left.

**A manual, reachable at any time** from the menu. Seven sections with a contents list: the
match and the keeper's commit, how to read the six options, the hub and its sections, the week, what
each setting actually changes, the keyboard, and how careers are kept.

**It is generated from the game's own tables rather than transcribed from them.** The pace labels,
the match speeds, the hub layouts, the action families and their colours, and the four week choices
are all imported from the modules that define them. Documentation that can drift is documentation
that will, and the drifted version is worse than none because it is confidently wrong — so
`tests/howToPlay.test.ts` reads the source and fails if any of those tables is ever hand-copied into
the page.

### The shape of the hub

A mature career renders **sixteen cards** on the hub — from the next fixture to the
season-by-season history — and it used to render all sixteen in one flat grid, every week, every
one of them shouting at the same volume. On a phone that was about **3,300 pixels** of scrolling
to reach a button that had been on the first screen in season one.

The fix is not fewer cards; every one of them earns its place at some point in a season. The
problem is that only a few earn it *every* week. So **the next match and the week stay pinned**,
under whatever the last match and the last moment had to say, and the rest go into four named
sections — **You**, **Club**, **Competitions**, **Career**.

**Every section carries a peek**: a line of live text beside its name — *"Club · 1st in the league ·
3 yrs left"*, *"Competitions · The English Cup · Quarter-final"* — assembled from the actual cards
inside it. That line is the whole reason the restructure is not a regression. Hiding a card behind
a heading costs you the glance that told you whether to look; a peek gives the glance back. A peek
built from anything other than the real contents would be a decoration that happened to look like
information, which is why the competitions one says *"not started"* for a cup that has been drawn
but not played rather than naming a round nobody has been in yet.

**The layout is a setting, not a decision taken for you**, because the trade is genuinely a matter
of taste:

| Layout | What it does | What it costs |
| --- | --- | --- |
| **Tabs** (default) | One section at a time behind a tab bar. Shortest page — the phone hub drops to about 1,700px. | A navigation model to learn, and find-in-page only searches the open tab. |
| **Folds** | All four listed as collapsible rows; open as many as you like. | A longer page — about 2,250px on a phone — but nothing to learn. |

Both draw the **same division**, defined exactly once in `ui/screens/hubSections.ts`. Two layouts
that disagreed about which card belongs where would be two different hubs, and the second one would
drift; worse, the setting would quietly become a difficulty level rather than a preference. The
sections you leave open are remembered across sessions and **shared between the layouts**, so
switching does not lose your place — in folds the list is every open section, in tabs it is read as
the one to show. A remembered section that does not exist this week — a first-season career has no
honours, no transfers and no history, so it has no Career section — falls back to the first one
there is rather than showing an empty screen.

Folds are real `<details>` elements, so they open without JavaScript, are keyboard-operable for
free, and are announced as disclosures. Tabs carry `role="tab"`/`role="tabpanel"` and the
`aria-controls` pairing that ties each one to its panel, and switching a tab does **not** re-render
the hub — rebuilding sixteen cards' worth of markup to look at a contract would scroll the page
back to the top for nothing.

### What each colour means

The palette had one working hue. `--accent` green was the focus ring, the primary button, a positive
statistic **and** a league position — four jobs for one colour, and a colour doing four jobs is a
colour saying nothing. Nothing on the hub could be made to stand out, because everything already had
the loudest colour available.

Each one now has exactly one meaning, and the list is short enough to keep:

| token | what it means |
|---|---|
| `--accent` | **you**, and things going well — focus, primary actions, progress, a rating above par |
| `--goal` | **a goal**, and the honours a career of them wins. Nothing else may use it |
| `--warn` | **jeopardy that has not happened yet** — a keeper committing, a contract running down |
| `--danger` | **something has gone wrong** — an injury, a relegation, a refusal |
| `--club` | **which club this is**. Identity, never sentiment |

The match already owns red, orange and yellow for its action families (shot, header, dribble), and
that constrains all of the above: the hub cannot borrow those hues for decoration without teaching
the eye a second meaning for a colour it has to read in under a second during a match.

**The club colour is the one that is not semantic.** Every club in `teams.json` has carried a
`colour` since the world was generated, and the interface used it in exactly two places — a border
on a transfer offer and a dot in the world table. Signing for Northport City looked identical to
signing for anybody else, which is a strange thing for a game about spending fifteen years
somewhere. It is now set per club on the career screen and used for identity only: a band on the
hub header, a mark beside the club's name, the transfer cards.

It **never replaces the accent**. A hub where signing for a red club turned every success message
red is a hub where colour has stopped meaning anything.

Two things a stylesheet cannot do on its own, which is why `ui/clubColour.ts` exists:

- **Legibility.** The page is `#0b1a12`, very dark. A club whose colour is a deep navy or a maroon
  disappears into it, and a crest colour that cannot be seen reads as a rendering bug rather than as
  a design. So a colour is **lifted in its own hue** until it clears a contrast floor of 3.5 against
  the page — in HSL rather than by blending toward white, because blending desaturates and a maroon
  mixed with white becomes pink, which is a different club. 60 of the 192 need it; none is left
  under 3.5, asserted over the whole data file in `tests/clubColour.test.ts` rather than checked by
  eye.
- **Text on top of it.** Where the colour becomes a filled band, the words on it are black or white
  depending on what is underneath, which is a per-club answer.

A property worth knowing, because it is what makes this worth doing at all: there are 16 distinct
colours across 192 clubs, and **every country has all sixteen**. So within the league you actually
play in, every club is a different colour — which is where a player reads colour. Across the world
they repeat, and that is fine.

### What the last match changed

The hub redrew after every match with a dozen numbers in new positions and nothing anywhere saying
which of them had moved. Fitness had dropped, the manager had revised his opinion, the objective was
a match closer — all of it visible if you happened to remember last week's figures, which nobody
does. The screen was a **readout rather than feedback**.

The obvious fix is to print the differences, and it would be worse than nothing: nine lines every
week, most of them a point or two of a number you cannot act on, and within a month the eye skips
the whole strip. That is exactly what happened to morale, and what making the moments rare was for.

So the rule is: **say it only when it changes what he might do next.**

| | reported when |
|---|---|
| **Fitness** | it falls below the level extra work needs — the *week's decision changing shape*, not a number changing value |
| **Confidence** | the manager's **band** changes. Two points of a hidden number is not news; being back in his plans is |
| **Milestones** | within three. "Two matches from your fiftieth" is a reason to play the next one; "thirty-one from your hundredth" is not |

Measured over seventy matches, it speaks on about **one in four** — rare enough to be worth reading,
common enough to exist.

One rule came from playing rather than from reading. Both milestone lists start at 1, so a player
who has not scored yet is *permanently* within range of his "1st goal" — which for a centre-back
means the strip repeats that line after every match for twenty matches. The countdown starts at the
**second** milestone now. Nothing is lost: the firsts were never this feature's to report, because
the moments already announce them properly, at the moment they happen.

### The season so far

The hub could say what happened last Saturday and nothing about the shape of the year around it. A
run of four wins and a run of four defeats looked identical from here, which is most of what a
season feels like.

So: **one dot per match**, oldest first, in the order they were played, with the next fixture marked
at the end. It reuses the summary `lastResult` already held — kept rather than overwritten — so
nothing new is counted.

**Colour is never the only channel.** Each dot carries its letter — W, D, L, and a middot for a
match he missed — so the strip reads with no colour at all. That is the same rule the action
families follow in the match, for the same reason. A goal gets its own mark in `--goal` on the
corner of the dot, because scanning for the afternoons he scored is the single most likely reason to
look at the strip.

**A missed match gets a dot of its own** rather than being left out. An absence is exactly the thing
a timeline should show — dropping it would draw a season that looks continuous when it was not.

The strip scrolls inside its own box, so a fifty-match season never makes the page scroll sideways.

### A hub that does not look broken on day one

Empty sections are dropped rather than rendered hollow, and that is right: a first-season career has
no honours, no transfers and no history, and three empty folds would be worse than the flat hub the
sections replaced.

The consequence nobody had accounted for is what a career looks like on its **first day**. Measured
in a browser: three sections — *You*, *Club*, *Competitions* — where the manual describes four, with
nothing anywhere saying the fourth is coming. A player cannot tell an empty career from a broken
screen, and the reading he can make unaided is the wrong one.

So one line sits under the sections, and it **names** what is missing:

> *Career appears here once there is something to put in it — honours you win, clubs you move to,
> seasons you finish.*

Naming the section is a fact about this career. "It fills up as you play" is a sentence that could be
written without looking at one.

**It removes itself** the moment every section has something in it — measured at four matches into
the first season. A hub that permanently explained itself would carry a permanent apology.

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

**How much you played is measured on league football, and only on league football.** Both halves of
that ratio come off the league ledger: matches you were in the side for, over matches there were to
be in the side for. It used to compare `seasonStats` — which counts *every* competition, both cups,
a European run, an international tournament — against the league's fixture list alone, so the
number on top could reach fifty while the number underneath stayed at thirty. The ratio never fell
below 1 in any season anybody has played, the clamp pinned it at 1, and *"you cannot be famous for
football you did not play"* was a sentence the code did not implement.

The league is the right denominator because it is the only competition whose fixture count is known
in advance. How far a cup run goes is an **outcome**, so ties you never had are not ties you missed;
being left out of the league side is absence, and absence is the thing the term exists to see.

Nothing about today's game changes, and that is the point of fixing it now: you start every league
fixture, so the ratio is 1 either way and not one career is retuned. The term is simply *correct*
ahead of the thing that will make it bite. Squad rotation is what makes playing time a real number,
and it is next but one on the [roadmap](ROADMAP.md) — a lever that is wrong while dormant is a lever that is wrong
on the day it wakes up, and much harder to notice then.

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

The 192 clubs therefore form a ladder that runs across countries as well as up them, and climbing
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

### The world: twelve countries

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
the **Conference League** below both. Sixteen clubs apiece, drawn from all twelve countries — four
from each, whatever its standing.

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

**Groups first, then a bracket.** Four groups of four, three matches each, and the top two of every
group go through to a quarter-final, semi-final and final. Six matches for a club that goes all the
way; three guaranteed for one that does not.

It used to be a straight sixteen-club knockout, mechanically identical to a domestic cup, and that
was wrong in a way worth stating — because it is the difference between the two competitions. A cup
tie is one afternoon, and that is what a cup is *for*: a small club gets ninety minutes in which the
gap might not matter. Europe asks the opposite question, which is which of these sixteen clubs is
actually the best. Deciding that by single ties meant a good side drawn badly was gone in September
having played once, and it meant qualifying for Europe was worth exactly **one European night** to
most clubs that managed it. A group gives everybody three, makes the last one matter, and makes
going out mean being worse over a month rather than worse for an afternoon.

The knockout is **seeded, not drawn**: each group's winner is paired with the next group's
runner-up, so two group winners cannot meet in the first round. That is the entire payoff for
topping a group, and an open draw there would delete it. The bracket half is still exactly the cup
object — the same "a round is drawn only when it is reached", the same shootout — so every fix to
the draw or the penalties still applies to all five competitions at once.

The coefficient counts group results as well as knockout rounds, at about a third of the weight: a
club that wins all three group matches has still not knocked anybody out, and pricing them equally
would make a country's standing mostly a record of the half where nobody is eliminated.

**A European run makes you more visible than your league does.** Reputation is settled against how
closely your season was watched, and that is now the better of your league's standing and the
competition's — so a Scottish club in the Champions League is genuinely more seen than the Scottish
league alone would make it. This is the mechanism by which a career escapes a small country by
playing well in it, rather than only by signing away from it.

The hub shows how far the competition has got whether or not you are still in it — your group table
while the group is being played, then the bracket. A European competition you go out of plays on
round by round on its own dates, exactly as a domestic cup does, so the survivor count keeps coming
down and the card eventually names whoever lifted it, which is a better answer to "how did that end"
than a number frozen on the night you lost. The group tables stay visible after the bracket is
drawn: the argument for a group stage is that going out of one is a month of football rather than a
bad night, and a table that vanished would take that record with it.

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
| **A season** | **30 to 47 matches**, depending how far the knockout runs go, in **at most 40 weeks** |

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

#### A season is measured in weeks, not in matches

For a long time a slot was the only unit of time the calendar had. A season *was* its list of slots,
so two things were true that should never have been the same thing: every match was equally spaced
by definition, and **a new competition could only make the season longer**. That is why the
[roadmap](ROADMAP.md) kept saying "the calendar is already full" — because it was, and there was
nowhere to put anything.

Every slot now carries the **week** it is played in, and several slots can share one. A Saturday
league match and a Wednesday cup tie are the same week of a footballer's life, so a competition is
added by filling midweeks rather than by extending the year. A season is capped at
`SEASON_WEEK_CAP` — **forty weeks**, roughly a real August-to-May campaign — however many matches it
ends up holding. Forty weeks cannot hold fifty matches without doubling up, which is the point.

The rules that place them:

- **Week one is the super cup, alone.** It is played before the season proper starts, so nothing
  shares it.
- **League football is the metronome.** Rounds are placed first and everything else hangs off them.
  They are spread across the weeks available rather than packed into the front of the season — so a
  league short enough to leave room gets genuine **rest weeks** — but never more than a fortnight
  apart, because a league spread thinner than that would leave a player permanently fresh and
  quietly switch the fitness model off.
- **Anything scheduled "after league round N" shares that round's week.** That is what makes it a
  midweek fixture rather than an extra week of season.
- **The international knockout gets a week each, at the end.** A tournament semi-final is not
  something played midweek alongside a league fixture.

The cap is a **cap**, not a fixed length: a small league that finishes its programme early has a
genuinely shorter season, and `seasonWeeks` reports the last week actually used. Telling somebody it
is week 12 of 40 when their season ends in week 30 would misdescribe how much football is left.

#### What a week is worth: congestion

Weeks would be decoration if nothing read them. What reads them is fitness.

Recovery used to be a flat `FITNESS_RECOVERY` between any two matches, because the calendar had no
way to say that two of them were three days apart. It is now a function of the **gap**:

| Gap to the next match | Recovered |
| --- | --- |
| Same week — a midweek fixture | `CONGESTED_RECOVERY`, 18 |
| One clear week | `FITNESS_RECOVERY`, 34 |
| A rest week or more | 34 per week, and the 0-100 ceiling does the rest |

The one-week case is **deliberately unchanged**. One match a week is what most of a season looks
like, so the ordinary case recovers exactly what it always did and not one existing career is
retuned; what weeks add is the two tails either side of it. The effect is a shape football already
has — a club in every competition is tired and a club in none is fresh. Measured across a career at
a strong club: a 34-match season averages **95** fitness at kick-off, a 51-match European season
averages **67**, with nineteen of those matches started below 60.

The gap is asked **after** the season's indexes advance, by asking the career what its next match
actually is. That matters: `nextMatch` walks past every slot that is not yours — a cup you are out
of, a European tier you are not in, an international you were not picked for — so a midweek you have
no fixture in correctly reads as rest rather than as congestion.

`CONGESTED_RECOVERY` sits at the forgiving end of what could be argued for, on purpose. Saturday to
Wednesday is four days against seven, and recovery is not linear in days — but more to the point,
**there is currently no way to be rested**, because you start every fixture there is. It is the
number to tighten when squad rotation finally gives you somewhere to sit; congestion is the pressure
that makes rotation and injuries worth having at all, and it did not exist before.

### Injuries, and the matches that happen without you

Two levers in this game were written, tested and unreachable for a long time, and they had the same
cause: **you start every fixture there is**. Reputation weights how much of the season you played,
and individual awards need 60% of a league campaign — but with a full season every season, both
ratios were 1 in every season anybody had ever played.

The [roadmap](ROADMAP.md) listed injuries as blocked on squad context, and for a long time that was right: an
injury with no teammates meant a match was skipped and nothing else. **It stopped being right once
playing time was measured properly.** Missing matches now moves both levers on its own, because
both are measured against the league's own fixture list, and a player in the treatment room is not
in the side. No teammate has to exist for that to be true — which is why this landed before squad
context rather than after it.

#### What causes one

Fatigue, mostly, and that is the point. The risk is **quadratic** in how empty you were at the final
whistle, so the danger concentrates exactly where football puts it: the end of a hard match, in a
week that already had one. A linear term would have spread risk evenly across every level of
tiredness and made a hard season feel like a slightly unluckier version of an easy one.

That makes **fixture congestion the engine**, rather than a dice roll that fires sometimes. Minutes
played, age and stamina adjust it from there — a substitute risks less than a man who played ninety,
and a durable player less than a fragile one. Nothing happens to a player who did not play at all.

#### Age, at both ends

The age term used to read `age <= 28 ? 1 : …` — **flat below the peak**. A nineteen-year-old was
exactly as fragile as a twenty-eight-year-old and mended exactly as slowly. That was a gap rather
than a simplification, and it was measurable: across 480 seasons a teenager took 0.95 injuries a
season against a twenty-eight-year-old's 1.38, which is barely above noise. Anybody who played a
young career could feel it, and somebody did.

There is now a curve at both ends, and it is deliberately split across two different things:

- **Getting hurt** (`ageRisk`) tapers gently to ×0.7 by nineteen and rises 7% a year past
  twenty-eight. The floor is there because a teenager is not made of rubber.
- **Mending** (`recoveryFactor`) uses the same taper downward, and rises more slowly upward to a
  cap of ×1.35. A nineteen-year-old shrugs off in two weeks what keeps a thirty-four-year-old out
  for three.

The split is the honest part. Real footballers do not stop getting injured for being young — the
medical literature has youth incidence close to flat, with its own growth-related problems. What is
genuinely true is that young bodies **recover** faster, so the larger half of the correction lives
in the duration rather than in the rate. The veteran end is also capped on purpose: past the
mid-thirties a career is already ending on the ageing curve in `development.ts`, and it should not
also be ending in the treatment room.

It is diagnosed **at full time, never mid-match**. A player pulling up in the 62nd minute is the
better simulation and the worse game: it ends the one thing you came to do, halfway through, on a
roll you cannot see or influence.

#### How long

| Severity | Share of injuries | Out for |
| --- | --- | --- |
| A knock | 55% | 1 week |
| A strain | 28% | 2–3 weeks |
| A torn muscle | 13% | 4–7 weeks |
| A rupture | 4% | 9–16 weeks |

#### What the rate actually is, and how it is known

Nothing about the base risk can be read off the arithmetic. Risk is quadratic in fitness at the
final whistle, fitness is whatever ninety minutes of a real match happened to leave, and **a match
costs slightly more than a week of rest returns** — so what any constant produces over a season is
emergent. The only honest way to set it is to play several hundred seasons and count, which is what
[`scripts/measureInjuries.ts`](scripts/measureInjuries.ts) exists to do.

| | at the old 0.035 | at 0.031, with the age curve |
| --- | --- | --- |
| Injuries per season | 1.29 | **1.06** |
| Weeks out | 3.31 | **2.38** |
| Matches missed | 3.32 | **2.58** |
| Seasons with none at all | 25% | **29%** |
| Age 18: injuries · weeks | 0.95 · 1.9 | **0.47 · 0.7** |

The old number was accurate to what its comment claimed and still felt like too much from the other
side of the screen, and the reason is worth recording: **roughly half of all injuries are one-week
knocks, and it is the event a player counts rather than the football lost.** Three seasons in four
containing an injury reads as "always injured" even when the weeks are modest.

League participation still runs between about **70% and 100%**, usually in the nineties. That range
is the whole point: it is the first time those numbers have been able to be anything other than
exactly 100%.

Weeks are what an injury is counted in, which is only expressible because the season is now measured
in them. A midweek fixture is a gap of **zero** weeks, so missing it does not shorten the injury that
caused it to be missed — both matches in a congested week are lost to the same week of recovery.

#### The match still happens

A missed fixture is played by your club without you. The result counts, the table moves, the bracket
moves, the calendar advances — the season has to move on identically whether you played or watched.
The only difference is that **none of it is yours**: no appearance, no rating, no goals, no
development, no record book, no reputation from the match itself. That absence *is* the mechanism.

The result is simulated the way every other club's fixture is simulated, because that is exactly
what your club's match is when you are not in it: a background fixture. A cup tie you miss that
finishes level still goes to penalties and is still rolled on the two clubs' strength — including
the super cup, which previously would have fallen to the champions by default.

The hub reports it as **Missed** rather than **Skipped**, and the distinction is deliberate: a
skipped match is one you played without watching, a missed one is a match that happened without you.
Reporting the second as the first would credit you with an appearance you never made.

**A summer heals everything.** Carrying a rupture into pre-season is the better simulation and it is
not worth what it costs: the break is months long, so almost every injury genuinely would have
healed, and modelling the one that would not means greeting somebody with an unplayable August. The
cost is that an injury picked up in May is served cheaply, and that is the honest trade.

### The competition for your place

Rotation is the other half of what the [roadmap](ROADMAP.md) called squad context, and it is the half that gives
you something to do. An injury is something that happens to you; being left out while perfectly fit
is an argument you can win.

**What it makes real is your contract.** `contract.role` — Star player, First-team regular, Squad
player — has existed since contracts did. Clubs offer it, two screens show it, and you can push a
club up a rung in negotiation. Until now **nothing read it**. You could talk a club into calling you
its star player and it changed precisely nothing. Rotation is what turns the central non-money term
of a contract from a label into a promise the club has to keep.

#### One rival, not a squad

The obvious implementation is eighteen named players per club, and it is the wrong one here. There
are 192 clubs, so a real squad model is three and a half thousand footballers to generate, drift
every summer, and carry in a localStorage save that currently holds an entire career in a few tens
of kilobytes. *Large player databases* is on the list of things this game deliberately does not
build, and a squad for every club in the world is exactly that.

What selection actually needs is far smaller: **somebody to be dropped for**. Only one club ever
picks a team you are in, and within it only one shirt is contested. So the model is a single rival
for your position at your club — generated when you sign, drifting while you are there, replaced
when you move.

He is **named**, and the names cost nothing new. Every club in the world already has a hand-authored
goalkeeper, sixteen per country; splitting those into forenames and surnames and recombining them
gives 256 names per country in exactly the right register, because the authored names *are* the
definition of what a name from that country sounds like. A generated name is never one an existing
keeper already has.

His ability comes from the club's own squad level — so signing for a stronger side means a better
man in possession of the shirt — but it is **capped by what the club promised you**. A club that
calls you its star player cannot also have somebody ten points better in your position, because
that would be the two halves of a signing contradicting each other.

#### How the manager picks

| Input | Effect |
| --- | --- |
| Ability, then form | Measured against the rival, not in the abstract. Being good is not the question; being better than the man beside you is. |
| Squad role | What the club promised, and the size of the bias is what makes the promise worth having. |
| Fitness × how little the match matters | Tired legs in a game nobody will remember. Both halves are required. |
| A congested week | Sharpens the above — a second match in a week is where resting happens. |

The last two are **rotation** rather than being dropped, and the difference is worth the trouble: a
manager resting his best player in the second round of the league cup is looking after him, so the
hub says *"Rested"* and names what he is being saved for, rather than reporting a demotion that has
not happened.

**How hard the manager tries to field his best side scales with how much the match matters.** That
one line is what stops "signed as cover" being a season of watching: in a low-stakes cup tie both
the pecking order and the contract count for less, because the manager is resting the people they
favour. It is rotation working *for* the fringe player, and it is how you play your way in.

Measured across careers: a star at a club below his level starts **90–96%** of matches; a player
signed as cover at a club above his starts **15–37%**, climbing as his role improves. Nought is not
a number the model produces any more, and that was a deliberate correction — a season of never
playing is a dead end, not a difficulty.

#### Two things that would otherwise be traps

**Form drifts back toward neutral while you are out of the side.** Form is only earned by playing,
so a player dropped while out of form would need form to get back in and no way to find it. The way
out cannot be locked behind the thing being punished.

**Club rotation never touches an international.** Your country already picks you through its own
rule, on reputation. Two selection models voting on the same shirt would be one too many.

The decision is **seeded on the calendar slot**, so the hub gives one answer however many times it
is rendered. A selection that re-rolled on every redraw would be a slot machine, and a player would
learn to reopen the screen until he was picked.

### The rival's own career

He used to age and nothing else. Beat him for the shirt thirty times and he was still there in
August, a year older, waiting to be beaten again — which made the club a place where nothing that
happened had consequences for anybody but the player.

Three outcomes now, decided in the summer on the season just played:

| Fate | When | What follows |
| --- | --- | --- |
| **Sold** | he started 3 or fewer contested matches while you started 15+ | a replacement arrives, pitched a shade **higher** than the man he follows |
| **Retires** | he is 34 | a replacement arrives |
| **Stays** | everything else | he ages and drifts, as he always did |

**Winning the shirt buys a harder argument for it**, which is the loop: the club keeps testing you,
and what you won last May you have to win again in August.

#### The fourth outcome, and why it does not exist

The obvious missing one is *the club buys somebody better when you cannot get a game.* It sounds
realistic and it is a trap: it makes losing your place the **cause** of a harder opponent for it, so
a bad season becomes impossible to recover from. That is the same spiral the
[confidence drift](#it-never-digs-the-hole-deeper) and the form drift both refuse to build, refused
here for the same reason — the way out cannot be locked behind the thing being punished.

What actually happens to a footballer who cannot get a game is that **he** moves, and the game
already models that: the market, the loan, the transfer request. A club has no need to buy while the
man it owns is playing well. So the only fate the player can cause is the one he earns.

#### Two guards that took measuring to find

**Only contested starts count.** A match you missed injured is not a shirt lost — it is a shirt
nobody was competing for — and counting it would let a torn hamstring persuade the club in June that
it prefers the other man.

**A club does not sell a man it signed twelve months ago.** Without this guard a strong career got
through a new rival **almost every season** (9.2 over sixteen, measured), and somebody replaced that
often stops being a person and becomes a respawning obstacle.

With both, over sixteen seasons at a club you stay at:

| Career | Rivals who left | Careers where nobody ever left |
| --- | --- | --- |
| Modest | **1.4** | 8% |
| Middling | **2.2** | 0% |
| Superhuman | 7.2 | 0% |

There is a texture in those numbers worth noting: a modest career's rivals mostly **retire**, and a
good career's are **sold**. Nobody wrote that rule — it falls out of the fact that only one of them
displaces anybody.

And a career that moves club every summer displaces **nobody at all**, because a rival never reaches
a second season. That is not a bug: you cannot take a shirt off a man at a club you keep leaving.

#### Where he goes

A sold rival is remembered — a name, a club, the season — up to six of them, oldest forgotten first.
When one of them lines up against you years later the hub says so. Nothing simulates his career, so
the honest reading of "he plays for them" is the one written down when he left: a cheap fiction, and
the alternative is the player database this game deliberately does not build.

### What the manager makes of you

Morale has been on the hub since there was a hub, and until now it did exactly one thing: it
contributed `TIMER_WEIGHTS.morale` — **0.08** — to the decision window. Across the whole 0-100 range
that is **0.53 seconds out of ten**. A player could go from delighted to despairing and never see
the game change. It was a number on a screen rather than a mechanic, which is the same problem
`contract.role` had before rotation, and it has the same fix: what gives a mood teeth is somebody
whose opinion decides whether you play.

So there is now a second number, **manager confidence**, 0-100, held per club. It is what the man
picking the side currently makes of you, and it is deliberately not the same thing as how you feel:

| | whose it is | what moves it |
|---|---|---|
| **Morale** | his | **results**, because a footballer in a winning side is happy whatever his manager thinks |
| **Confidence** | the manager's | **performances**, weighted by how much the match mattered |

Keeping both is what lets them disagree, and the disagreement is the point. A good player in a bad
side keeps his manager's trust while his mood sinks. A passenger in a winning side is cheerful and
about to be dropped. Neither is sayable with one number.

**Where it starts** is what the club called you when it signed you — a third job for `contract.role`,
and the one that makes the term mean something on day one rather than in March. A star arrives
believed in (64), a squad player arrives doubted (40), and neither head start is big enough to
settle the argument on its own.

**What it reads into** is three things, and deliberately no more:

- **Selection**, alongside the squad role and the transfer request and on the same scale they use.
  The full range of a manager's opinion is worth ±0.12 — slightly less than the gap between being
  signed as a star and being signed as cover, and more than the gap between `starter` and `squad`.
  A manager can talk himself into and out of a footballer; he cannot make a bad one good.
- **The renewal**, which is the one question the market cannot ask. Every club in the world answers
  the other five identically about the same player; only his own club knows what its manager
  thinks. This is the mechanism behind a career that was previously unsayable — the good footballer
  whose manager has stopped fancying him, whose contract runs down while clubs elsewhere are still
  interested. It can also **move the club's word for him one step**: a season of being undroppable
  gets a squad player offered a starter's deal, and being offered one is how the game says the
  argument was won.
- **Morale**, which is the coupling that gives the older number its job at last. Being trusted lifts
  him and being frozen out grinds him down, worth ±12 on a target that sits between 34 and 78 — a
  real term and not the decisive one. Being frozen out at a winning club still beats being adored at
  a losing one, which is the correct ordering; footballers say so.

**What it deliberately does not read is a transfer request.** That already has a measured price in
selection and at the negotiating table, and charging it again here would make one decision cost
twice — the exact mistake [asking to leave](#what-he-will-move-for-and-asking-to-leave) was careful
not to make.

#### It never digs the hole deeper

Being left out pulls confidence **toward neutral, never away from it**. Being dropped is already the
punishment for a manager's doubt; making it also the cause would lock the way out behind the thing
being punished — the same trap [form](#the-competition-for-your-place) avoids while you are out of
the side, and avoided here in the same shape. A manager who has stopped picking you slowly stops
having a view, which is both the merciful reading and the true one: a player nobody has watched for
six weeks is a question rather than an answer, and the answer comes back the moment he plays. An
injury does it faster than an omission, because nobody is being judged for a hamstring.

It also **belongs to the club**, like the rival and the named teammates. Signing somewhere else does
not carry a grudge across: the new manager has his own view, and it starts from what the new club
just promised you.

The hub shows it as **a band and a line in the manager's voice** — *Out of favour*, *Unconvinced*,
*Watching*, *Trusted*, *Untouchable* — rather than as a figure. A two-digit number beside `Morale`
is exactly what this was written to stop being.

### What he wants this season

Manager confidence answered *what does he think of me*. It did not answer the question a footballer
would actually ask in August, which is **what do you want from me** — and without that, confidence
was a scoreboard with no posted score. The number moved every match, the band changed, and nothing
anywhere in the game said what it was moving against.

So the manager says it. **Two numbers and a sentence**, set when a season starts, on the hub all
year, settled in the summer.

> *You are his best player. He wants 27 appearances and 38 goals or assists — and a season people
> remember.*

**Two numbers rather than one**, because the two ways of failing are different and a career has to
tell them apart. A striker who plays thirty matches and scores four has a problem; one who scores
eight in eleven has a different problem, and it is not his finishing. Appearances and contributions
separate *he does not pick me* from *I am not delivering* — the two arguments this game already
models everywhere else.

**Where the appearance target comes from** is `contract.role`, which is now doing a fourth job: a
star is asked for 78% of a season, a starter 64%, a squad player 42%. Missing it means missing what
your own contract said you were, which is a fair thing to be asked about. A season is measured as
the **league fixture list plus the football around it** — cup ties, European nights, internationals
— which measurement puts at about 1.15 times the league alone. It is deliberately *not* the
calendar: the calendar counts weeks, including dates he may never play, and the first version of
this asked a seventeen-year-old for forty-nine appearances in a thirty-match league.

**Where the contribution target comes from** was calibrated rather than estimated, and the first
attempt was wrong by about half in the direction nobody expects. The rates started at what a striker
*ought* to return by the standards of real football, and `scripts/measureObjectives.ts` reported
**77% of seasons exceeding the demand** and 12% missing it. A target three-quarters of careers clear
without noticing is not a target. This engine is more generous than real football — an auto-played
striker returns about **1.22 goals and assists per appearance** — so the demand is now set just
under what a *skipped* season already produces. Measured again at that setting:

| verdict | share of seasons |
|---|---|
| exceeded | 20% |
| met | 50% |
| missed | 30% |

Those are auto-played seasons, which is a **floor rather than a typical career**: auto-play is
deliberately worse than a person reading the situation. A demand met comfortably at that standard is
one a human will meet.

**Exceeding it needs both halves**, not either. On *either*, more than half of all seasons came back
exceeded — clearing the appearance half comfortably is close to automatic for anybody being picked,
and a verdict most seasons receive is not a verdict.

**It is not allowed to be a spiral**, which is the constraint that shaped the judging. Being dropped
already costs confidence indirectly, and an objective that punished a player for the appearances his
manager refused to give him would make being out of favour the *cause* of being further out of
favour — the exact trap `confidenceAfterAbsence` and `missMatch` are both written to avoid. So a
season more than a third of which was lost to **injury is not judged at all**, in either direction,
and the summer says so out loud rather than quietly forgiving it. Nobody is judged for a torn
hamstring.

**What it is worth** is deliberately small: **+9** confidence for exceeding, **+3** for meeting,
**−8** for missing. Confidence moves 10-22% of the way toward a verdict on every match played, so
thirty matches vastly outweigh anything here — and that ordering is load-bearing. The football is
where a manager makes his mind up; this is the conversation in his office afterwards, and a
conversation is worth a few points. A summer that could overturn a season would make the season not
matter.

**It never travels.** A move means a new manager with his own demands, made the day you walk in —
the same reason confidence itself belongs to the club. A demand somebody else made can never be
marked against you.

### The week before a match

A career used to be a conveyor belt. Between one fixture and the next the hub offered exactly one
button — *Play match* — and everything else on the screen was a readout. A season was thirty
decisions about how to finish a chance and none at all about how to be a footballer.

So the week is a decision now. **One choice, made before the next fixture and spent on it**, out of
four things a player can do with seven days:

| | what it gives | what it costs |
|---|---|---|
| **Rest up** | +8 fitness, which selection reads | you learn nothing from the week |
| **Extra work** | more out of the next match | −6 fitness, which selection also reads — and not offered at all below 80 |
| **Study the opponent** | a wider decision window in the next match | nothing physical — its whole price is the other three |
| **Ask for a start** | your manager's confidence, if it lands | his confidence, if it does not |

None of them is a free bonus. Every one costs what the other three would have given you, and two of
them cost more than that on their own — training hard is a way to end up not being picked, and
knocking on the manager's door is the only option in the game that can go backwards.

**Morale decides what a week is worth.** This is the second half of giving morale a job (the first
is [manager confidence](#what-the-manager-makes-of-you)): a number that only ever receives is still
decoration. What a footballer takes from a week of work is multiplied by whether he wants to be
there — 0.6 at rock bottom, 1.4 at the top — and it is most of what decides whether asking for a
start lands, because the conversation is going to be had by whichever version of him turns up to it.

#### What this week would do to you

The table above is what the four options **are**. It is not what any of them is worth to *you* this
week, and for a long time nothing on the screen was. Each card carried one authored sentence —
*"you will take more from the next match, and turn up to it tired"* — true, unchanging, and without
a number in it. That is the same mistake this codebase has now made twice and written up twice:
[morale](#what-the-manager-makes-of-you) was a stat with one consumer worth half a second, and a
trait announced only in a stats table is an invisible modifier. The week was the same shape, and it
is the decision a player makes most often.

So every option now carries a second line saying what it would do to **this** footballer, computed
from the same constants the week itself will use:

| | what the card says today |
|---|---|
| **Rest up** | `Fitness 74 → 82.` — or that he is already as fresh as he is going to get |
| **Extra work** | `+24% from what the next match teaches you, at your morale. Fitness 92 → 86.` |
| **Study the opponent** | `About 0.8s more on every decision in the match.` |
| **Ask for a start** | `About a 46% chance he takes the point. If not, it costs you morale and his confidence in you.` |

**It is derived, not written.** There is no second copy of the arithmetic to drift out of step with
the model — the tests play each choice and assert the card promised exactly what the week delivered.
That matters more than it sounds: a promise on a button that quietly stops being true is worse than
no promise at all.

**It is also how you learn what morale is for.** Extra work is +12% to a footballer who wants out
and +28% to one who is happy where he is, and no fixed sentence can say that. A player who reads the
same card twice at different morale has been taught the multiplier without a tooltip explaining it.

**And it exposes a dead option.** At the *no time limit* pace there is no clock, so a wider decision
window buys precisely nothing — one of the four options is worth zero because of a setting chosen on
another screen. The card now says so, and says where to change it, instead of selling him a week for
it.

What it deliberately does **not** promise is an outcome. Extra work multiplies what a match teaches
you and how much that is depends on the match; asking for a start moves two numbers that feed
selection, wages and the renewal. A figure for either would be a lie with a decimal point on it.
Every line is the mechanism and its odds, which is what a decision needs and all of it that is
honestly knowable beforehand.

#### Two halves land immediately, and two wait for the match

Fitness and confidence are applied **the moment you choose**, and that is most of what makes the
week feel like a decision rather than a form. Both are read by the team sheet, so resting up or
arguing your way back in can flip the very selection you were looking at when you chose — **a man
who has just been dropped can talk his way back into the side before the match he was dropped
from**. The other two wait because they have nowhere else to land: what a week of work is worth is
only knowable once there is a match to apply it to, and studying an opponent is worth nothing until
you are facing them.

#### Extra work at both ends of a career

The training multiplier moves **growth and decline in opposite directions**, and that is the detail
that keeps it from being an empty menu item after thirty. Growth is zero past the peak, so a
multiplier on growth alone would leave a decision with nothing on either side of it for eight of the
twenty-three seasons a career can run. Instead, extra work makes a young player better and an old
one worse more slowly — which is the same line the pre-season training screen has been saying since
training existed: *at your age, training is mostly about holding on.*

It is deliberately a **nudge rather than a rewrite**: it multiplies a development budget calibrated
to produce a whole career arc, and a week's work worth half as much again would take a fifteen-year
career somewhere the model was never tuned for. It is also self-limiting, which is why it can be as
generous as it is — training costs fitness, fitness is read by selection, and development only
happens in matches you play. A career spent entirely in the gym trains its way out of the side.

#### The gate, and why a smaller number would not have done

The fitness cost very nearly shipped as a **ratchet**, and it is worth recording how, because the
mistake is invisible from the code. Fitness carries between matches; a match costs about 36 and a
week's rest returns 34, so the system already runs a slight deficit. Taking another six every week
compounds. Measured over 360 seasons, a career that trained every week:

| | never planning a week | training every week |
| --- | --- | --- |
| Injuries per season | 1.26 | **1.73** |
| Mean fitness at full time | 53 | **36** (10th percentile: **2**) |
| Seasons with no injury | 26% | **13%** |

The card promised *"turn up to it tired."* It was not describing that. The fix is a **gate rather
than a smaller number**, because a smaller number still ratchets — it only takes longer. Below 80
fitness a player is in no state for extra work, which is what a coach would say anyway. The option
is greyed out with the reason on it rather than hidden, so being tired makes resting *visibly* the
right answer instead of a lesson learned in February.

After it, the three physical choices sit in the order they should: **rest 0.90 injuries a season,
planning nothing 1.06, training every week 1.23.** Extra work costs about 16% more injuries, which
is a price worth advertising rather than one worth hiding.

#### Asking for a start limits itself

The odds rise with morale and form, and **fall as the manager's confidence rises**. That is not a
balance patch bolted on afterwards, it is the thing itself: a player his manager already rates has
nothing to ask for, and asking anyway is exactly what turns a man who was happy with him into one
who is not.

Run the arithmetic and it settles itself. At confidence 20 the expected move is strongly positive;
at 50 it is close to nothing; at 80 it is negative enough that a season of nagging costs a place in
the side. So this is the option a benched career reaches for and a settled career leaves alone —
and **nobody had to write a rule capping how often he may ask**.

#### The rules around it

**One pick, and it is final.** For the same reason [negotiation](#having-a-position-contracts-and-where-you-will-go) allows exactly one push: a
decision you can retake until you like the answer is a slot machine rather than a decision.

**A plan names the calendar slot it was made for**, so it is spent exactly once. It is cleared by
the match it was made for — whether he played it or watched it, which is the honest cost of planning
a week you are then left out of — and it is cleared again by the summer, because slots start at zero
every August and a plan left over from May would otherwise be spent twice, a year apart.

**While injured there is no week to plan.** The fixture is going to pass without him whatever he
does, so a training decision about it would be a choice with nothing on either side of it. Being
left out while *fit* is the opposite case and keeps every option — asking for a start is precisely
what that week is for.

### What you become known for

Two strikers with the same twenty attributes were the same footballer. The record book counted
everything they had ever done and none of it came back: a hat-trick was a number on a page, never a
fact about the man who scored it.

A **trait** is that fact. Eight of them, each earned from something the career was already
recording, and each one changing how a **match plays** rather than adding a figure to a screen.

| Trait | Earned by | What it changes |
| --- | --- | --- |
| **Big-game player** | 20+ European/international nights at 7.4+ | worth up to +0.045 on a European night and **nothing** on a Saturday |
| **Cool head** | 30+ nines per 100 appearances | thinking time back, scaled by the pressure that took it |
| **The provider** | 100 career assists | passes and crosses land better |
| **Poacher** | 30 hat-tricks, 11+ per 100 | finishing **inside the box only** |
| **Made of granite** | 33+ appearances a season over six | injury risk ×0.82 |
| **Streaky** ⚖ | a 16-match scoring run | form moves faster — *in both directions* |
| **Maverick** ⚖ | 4+ perfect tens per 100, with an average under 7.0 | wider execution spread: better best case, worse worst case |
| **Old head** | 33 years old and 350 appearances | fatigue closes your decision window 30% more slowly |

⚖ = cuts both ways.

#### Three rules, and they are what stop this being a skill tree

**Earned, never chosen.** There is no menu. A trait arrives because of something you did over enough
football that it stopped being a coincidence.

**It must be felt at the keyboard.** Every one reads into the action model, the decision window, the
injury roll or selection. A trait that only made a number bigger would be repeating the mistake
[morale](#what-the-manager-makes-of-you) spent every version until recently making — eight times over.

**Earned from what is already counted.** This is the constraint that shaped the list, and it comes
from a lesson this codebase has already paid for: **a counter only counts forward.** A trait needing
a *new* counter would sit there doing nothing for every career already in progress. So every
condition reads the record book as it already is — which means an existing career gains what it has
already earned at its very next match. Several ideas were re-based to fit this and one, penalties,
was dropped for failing it.

#### The maverick took three attempts, and the reason is worth keeping

The obvious version reads the **best rating a career ever got**. It fires for 100% of careers and
says nothing, because a maximum over five hundred matches is a ten for everybody.

The second version counted perfect tens against the career average. That inverted the trait: the
*better* player reaches any fixed count sooner, while his average is still low, so good careers
became mavericks and modest ones did not.

The version that works is a **rate**, against an average that has stopped moving — 4+ perfect tens
per 100 appearances, an average under 7.0, and at least 300 matches. It is the one trait a modest
career earns and a great one cannot: a great one's average disqualifies him. He is not a maverick.
He is just good.

#### A property worth knowing

Traits are checked after every match and never taken back, so **a condition on a rate effectively
tests the highest that rate ever reached**, not where it finished. That is left as it is — *"he was,
for a while, exactly that player"* is a true thing to say, and a career that could un-become
something would not be a record. But it is why every rate also carries an absolute floor. Without
one, measurement showed a middling career becoming a maverick **100% of the time**, on the strength
of a good fortnight in its early twenties.

#### How many a career ends with

Measured over 25 careers of 18 seasons at three levels of ability, because the same thresholds look
trivial to one career and out of reach to another — auto-play scores 1.0 goals a match at ability 55
and 2.9 at ability 85, so anything calibrated on one profile alone is calibrated on nothing.

| Career | Avg rating | Traits earned | Career score, no traits → with |
| --- | --- | --- | --- |
| Modest | 6.35 | **1.4** | 1653 → 1672 (**+1.1%**) |
| Middling | 7.21 | **2.8** | 4388 → 4543 (**+3.5%**) |
| Superhuman | 8.33 | **6.8** | 7995 → 8546 (**+6.9%**) |

Traits are meant to be **situational flavour rather than power creep**, and at the two realistic
levels they are. The superhuman profile is an auto-play artefact no human matches — it earns nearly
every trait, so of course it gains most; that number is reported rather than hidden.

### The moments a career is made of

Everything was counted and nothing was ever said. The record book knew the exact minute a career
reached its hundredth appearance and had no way to mention it; a first goal was an increment. A
career you can only read as a table is a spreadsheet with a footballer's name on it.

So the hub now says what was worth remarking on: a debut, a first goal, a first European night, a
first cap, a hat-trick, a perfect ten, a round number reached, a scoring run as it lengthens, a match
against a club that used to pay your wages — and, last and biggest, **becoming something**.

**This is why traits and moments shipped together.** A trait announced only in a stats table is an
invisible modifier, which is the exact mistake this codebase has already made once. Earning one has
to be a moment or it is not really a thing that happened to you.

**What is deliberately not here is anything that happens most weeks.** A moment for every goal would
train the eye to skip the line that says *"your first"*, which is the only one that mattered. An
ordinary afternoon produces nothing at all, and most afternoons are ordinary.

A milestone announces itself **exactly once**, because `momentsFrom` compares the record book from
both sides of the match rather than keeping a list of what it has already mentioned. The hundredth
appearance is simply the match where the count crossed a hundred.

A career keeps the last **80**. When it fills the oldest go — the wrong way round for a diary and the
right way round for a save that holds a whole career in a few tens of kilobytes, and the end-of-career
screen says so rather than quietly beginning in season six.

### The diary, while the career is still being played

The moment log had a reader problem rather than a writer one. `state.moments` has been accumulating
the last eighty things worth remarking on since moments existed — and the only places it could be
read **in full** were the end-of-career screen and the summer news. The game wrote a career's diary
and showed it to you once, after it was too late to be the person in it.

It is now a card on the hub, in the **Career** section: the same log, newest first, twelve lines
deep.

Nothing new is recorded and nothing is computed. That is the point — a diary needing a new counter
would be the mistake `traits` and `moments` were both built to avoid, where a career already in
progress gets a feature with nothing in it. Every existing save has a full diary the moment it loads.

**Newest first here, oldest first at the end of a career**, and the orders differ because the
questions do. A finished career is read from the beginning as a story. A live one is checked from
the top for what just happened.

Twelve rather than eighty, because a card that scrolled for a page would be a section rather than a
card. The rest is what the end screen is for, and the hub says so when there are more.

### Somebody to pass to

An assist used to go to nobody. The commentary said *"GOAL — and an assist!"* and the man who
finished it did not exist, because a club was a set of ratings and the only footballer in the game
was the one you were playing.

Five named teammates now come with every club you sign for — **the five you would actually pass to**.
That is the whole trick, and the reason a squad is still not modelled: what the match engine needs
is a name for whoever got on the end of it, and only the people in front of you can be that. A
striker lays it off to attacking midfielders, wingers and a central midfielder; a centre-back plays
it into midfield and out to the full-backs. Generating the receivers rather than a team is five
footballers instead of eighteen, at one club instead of 192.

**The names cost nothing new.** Every club in the world already has a hand-authored goalkeeper —
sixteen a country. Splitting those into forenames and surnames and recombining them gives 256 names
per country in exactly the right register, because the authored names *are* the definition of what a
name from that country sounds like. No generated name is one a goalkeeper already has, and no two
men in the same five share a surname.

Who receives is weighted by ability, because a ball into the box finds the centre-forward more often
than the full-back who happened to arrive — and it is drawn **once**, before the finish is rolled,
so the same man is named whether he scores or misses. A chance created and a chance taken are the
same pass to two different endings.

> *Playmaker's whip it into the six-yard box is finished off first time by Tomas Brandt! GOAL — and
> an assist!*
>
> *Playmaker's play a one-two puts Wes Arbuthnot in, but the chance goes begging.*

One action label changed with them: **Square ball to a teammate** is now **Square ball across**,
because the outcome names the teammate and the old label doubled up.

A quick match has no dressing room and neither does a save from before this existed, so both narrate
"a teammate" exactly as they always did.

### Going out on loan

Rotation is what made loans necessary. Before there was competition for the shirt, a season at a club
above your level was indistinguishable from a season at a club at it — you played every match either
way — so a loan had nothing to solve. Now a nineteen-year-old can sign for the champions, be told
honestly that he is cover, and spend a year watching.

A loan is offered when **three things are true at once**: he is 23 or under, he played less than 45%
of the league season, and his club sees him as a squad player. Young enough that a year of football
beats a year of training; short of games; and at a club where that is unlikely to change.

Where he goes is the **strongest club he would still walk into**, searched across the whole world
rather than his own country. Both ends of that matter: a loan that repeats the problem is worse than
none — another year of watching, a year older — and a league he is twenty points too good for
teaches him nothing.

**It is deliberately not a transfer.** The contract does not move, the wage does not change, and the
parent club takes him back in a year. What moves is the only thing that was wrong: where he plays.
That makes a loan the one thing in the game that separates `clubId` from `contract.clubId`, and the
long-career invariant is written to say so rather than to forbid it.

What he *is* at the loan club is carried on the loan itself, not read off the contract. The contract
belongs to the parent and calls him cover — which is what sent him away. Selection reading that
while he is somewhere else would leave him on the bench at a club that took him specifically to
play him, which is the loan failing at the one job it has.

A career it works on, measured:

| Season | Age | Where | League matches | Ability |
| --- | --- | --- | --- | --- |
| 1 | 19 | Castleford Royals | 1 | 58 |
| 2 | 20 | **on loan** at Club Espinela | 24 | 65 |
| 3 | 21 | Castleford Royals | 5 | 69 |
| 4 | 22 | **on loan** at SV Marburgen | 22 | 75 |
| 5 | 23 | Castleford Royals | 0 | 75 |
| 6 | 24 | **on loan** at Calcio Vestrella | 22 | 78 |
| 7 | 25 | Castleford Royals | 13 | 80 |

#### The seam

The risky part of a loan is not the loan, it is the moment it ends. Everything settled before the
return has to read the club he was **at**; everything built after it has to read the club that
**owns** him. So the return happens in two steps at different points in the summer: the season ahead
becomes the parent's before the fixture list is built, and he actually moves back only after
`advanceSeason` has written the season just played into history. A single-step return credited a
year at Club Espinela to Castleford Royals — which is exactly what the test that caught it now
guards.

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

#### The afternoon it was won

That table was, for a long time, the whole of it. You won the cup final in March and the screen said
**2-1** and offered a button marked *Back to career*; the trophy itself turned up four months later
as a row on the season review, between a promotion and a cap count. This codebase has now written up
the same defect three times in different clothes — morale was a stat with one consumer, a trait
announced only in a stats table is an invisible modifier, a week described in prose that never
changed said nothing — and this was the fourth. **A trophy recorded only in a list is a trophy that
never happened to you.**

So there are two ceremonies now, and the line between them is the calendar.

**In season, the moment a final ends.** The two domestic cups, the three European competitions, the
super cup and the international tournament are all settled by a match, so each is presented the
moment that match is over: what was won, the scoreline, who it was against, and what you did in it.

**In June, everything a match cannot settle.** The league title, which is a table rather than a
fixture; the doubles and trebles, which are a season's shape rather than an afternoon; promotion;
and every individual award, which needs the whole season's evidence before anybody can hand one
over. They come one at a time, club before player — being the division's top scorer in a side that
won the title reads differently from being its top scorer in a side that went down, and putting the
club's night first is what makes the second one land.

The June list **skips the trophies that already had their afternoon**. A cup celebrated in March and
celebrated again in June is a game that does not remember what it told you. The season review still
lists all of it: the review is the record, the ceremony is the moment, and they are allowed to
disagree about how often a thing is worth saying.

Four decisions inside it are worth stating, because each could have gone the other way:

**A final lost gets a screen too.** The alternative is a game that goes quiet on the one afternoon a
season can turn on — you reach a European final, lose it, and the screen says *1-2, back to career*.
Reaching a final is already on the honours list above, so refusing to mention it here would
contradict the record book two screens later. It is a different screen, not a consolation one: no
gold, no congratulations, just what happened.

**A trophy won while you were injured is still your trophy**, and the screen says which it was.
*You watched from the treatment room. They won it without you.* Being hurt for the final does not
un-win the cup — you are in the squad and the medal is real — but printing "you played" over that
would be the game flattering you about your own career, which is the one thing the
[how much of it you actually played](#how-much-of-it-you-actually-played) label exists to stop.

**It survives the tab being closed on it.** The final is written to the career when the tie settles
and cleared by the screen that shows it, the same way an open transfer window and a forced
retirement are stored rather than left living in a mount call. It also goes into
[the diary](#the-diary-while-the-career-is-still-being-played), which is the thing that remembers
after the screen is gone — and is the only record of a final *lost* in a season the club won nothing
in.

**It cannot fire twice.** Whether a final has just been played is answered by comparing the
competition's winner before the match with its winner after, rather than by working out which round
is the last one. Every competition answers that the same way — a domestic cup, a European bracket
hanging off a group stage, an international tournament of eight and a super cup that is one fixture
have four different notions of "the final" and one notion of "somebody has won it now" — and the
transition from nobody to somebody happens exactly once per competition per season.

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

#### How much of it you actually played

A career played out at Hardcore and one skipped from start to finish are different careers, and
until now the game could not tell them apart. `CareerState.howPlayed` has counted the difference
since v18 — matches played, matches skipped, and the pace each played one was played at — and
nothing read it.

It is settled as **a label rather than a penalty**, which is a deliberate departure from how the
request was first written.

It was raised as *"the career score should be penalised for skipped matches and for a generous
pace"*, and that framing has a problem it cannot solve: **how much?** Is a skipped match worth half
a played one, or a tenth? Is Relaxed worth 0.9 of Standard? Nothing in the game can answer that,
because it is not a question about football — it is a question about how somebody chose to spend
their evening, and there is no honest exchange rate between an hour of a person's attention and a
number on a wall.

A label needs no exchange rate. **Played out**, **Mostly played**, **Part-played**, **Largely
simulated**, **Simulated** — with the dominant pace named beside it. That is all the original
request actually wanted: for the two not to look identical. `careerScore` is untouched, and there is
a test that says so.

The two sit **side by side** on the wall of fame and the end-of-career screen. The score says how
good the career was; this says how much of it the person at the keyboard sat through. Neither is an
answer to the other.

#### Refusing to guess

A career begun before v18 under-counts itself — the counter can only count forward — so its counts
cover only however much happened after the migration. Labelling that *"largely simulated"* would be
an accusation made out of a missing field.

So the summary compares what was counted against the appearances actually made, and reports **Not
recorded** when the two disagree by more than a tenth. There is no cost to declining: *"this career
began before the game started counting"* is a true and unembarrassing thing for a wall to say, and
the wall of fame shows no tag at all rather than a wrong one.

The pace is resolved **outside** `core`, because the pace ids belong to `simulation/` and the
histogram is deliberately keyed loosely enough to hold one this version has never heard of. An
unrecognised id shows nothing — an unreadable tally is what the save was designed to keep, and
printing a raw key would be worse than silence.

#### The wall of fame

Ending a career writes a **legacy**: a small, flat summary that outlives the career it came from.
Every finished career is kept, ranked against every other one this browser has played.

A legacy is a summary, **not a snapshot**. Keeping the whole `CareerState` would be easy and wrong —
it would multiply the save's size by every career you have ever finished, and every future migration
would have to migrate careers nobody is playing. A finished career is finished, so it stores
conclusions rather than the material they were drawn from.

**But a summary was not enough, and the gap was the wrong way round.** The end screen showed a career
in full — every season, every move, the whole record book — and then threw all of it away and kept
the card. So the most complete view of a career existed exactly once, in the moment you were deciding
to destroy it, and never again. A live career is the one you can always look at; it is right there in
the hub. A *finished* one is the only kind that can never be re-read from its own state, which makes
it the one that most needs keeping. The wall could rank a career it could no longer show you.

So a legacy now also carries a **detail**: every season with its club and country, every move with
both clubs, the record book in full, and every honour with the season it was won in. Clicking any
card on the wall opens it — the same panels the end screen shows, rendered by the same functions, so
the two cannot drift apart. The card itself is unchanged, because a wall is meant to be scanned and
twenty careers each showing every season they played would be a filing cabinet.

This does not contradict the paragraph above; it is worth being precise about why. What that
argument rejected was keeping the live `CareerState` — a deeply nested, versioned thing that every
future migration would have to carry forward. A detail is **flat, finished and resolved**: rows of
numbers and names, nothing that refers to a club by id, nothing that can go stale, and nothing a
migration will ever touch, because nothing will ever be added to it. It is a printed page rather than
a copy of the machinery that produced one.

The cost is measured rather than assumed. A twenty-season career that won something every year and
moved every summer — longer than the game actually allows — serialises to about **9KB** against
850 bytes for the card alone, so a full wall of twenty is roughly 180KB against a multi-megabyte
quota. Worth it; and if it were ever not, `HALL_OF_FAME_LIMIT` is the dial.

Careers already on the wall have **no detail and cannot be given one** — the state it would have come
from was deleted when they ended. Those entries open too, showing everything the card holds and
saying plainly that the season-by-season record was not kept. That is the same choice made everywhere
else a counter arrived after the game did: an admitted gap beats an invented history.

One consequence is worth naming. The end screen now renders from the legacy's detail rather than from
the live career, which makes it an **honest preview**: no panel can appear there and then quietly
fail to survive, because both screens read the same record. A field missing from the detail is a
field missing from the end screen too, where somebody will notice.

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

**A trophy is also worth what the league it came from is worth.** Honours split into two stages, and
they are priced differently:

- **Domestic** honours — the title, both cups, the super cup, the doubles and trebles, the
  individual awards, promotion and relegation — are decided inside one country, so what one is worth
  depends on which country. Sixteen clubs in Austria and sixteen in England are not the same sixteen.
  Paying 45 points for either title said the career that avoided the hard leagues was the better one,
  and it handed the transfer market a perverse instruction: the surest way up the wall of fame was to
  drop into the weakest league in the world and win it every year.
- **Common** honours — the three European competitions and the international tournament — are
  contested on a stage every country enters on the same terms. A European Cup is the same trophy
  whoever qualified for it, and discounting one for the league it came out of would dock points from
  exactly the clubs whose achievement was largest: the ones who came out of a small league and won it
  anyway. The continental treble sits here too, since a European trophy is the leg that makes it one.

The domestic weight is a **taper** of country prestige rather than prestige itself, and that is the
whole design. Raw prestige runs from 1 down to 0.46 across the twelve countries with leagues, which
would say an Austrian title is worth less than half an English one — a bigger claim than a ranking
number has any business making, and one that would bury every career played outside the top four
leagues however good it was. Tapered, the spread is about 3:2: enough that the harder league settles
a tie between two similar careers, not enough to decide one on its own. An English title is still
worth its full listed 45, so no career that was already being scored correctly is quietly deflated.

Relegation is weighted the same way, and it is negative, so going down in a weaker league costs
less. That is the same statement read backwards and it is meant: the fall is smaller because the
height was. None of this needed a migration — every honour has recorded the country it was won in
since honours existed, and this is only the decision to read it.

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

### The most destructive click in the game

A finished career is the only thing here that cannot be played again. Removing one from the wall
took **a single press**, with no undo, from a button sitting directly under a card the player had
every reason to be clicking on — while wiping the *entire* wall was already guarded by an
arm-then-confirm. That is exactly the wrong way round: the smaller and likelier mistake was the
unguarded one.

Removing one entry now takes the same two presses, with the same idiom rather than a new one. It is
not a `confirm()` dialog, for the reason the end-of-career screen settled once already: showing what
is about to be lost is a better question than *are you sure?* ever was, and here the card above the
button is exactly that. Keeping the guard inside the page also means a keyboard player meets it in
the same tab order as everything else.

Two details that matter more than they look. **Moving focus away disarms it** — a button that stayed
armed would be a trap laid for the next visit rather than a guard on this one. And **only one can be
armed at a time**, because two armed buttons on one screen is two traps rather than one guard.

### Three careers, and taking them with you

A career used to be the only thing the save could hold. One `careerState`, one slot, one footballer
at a time — which is the whole reason ending a career was destructive, and why the button for it
said **Abandon**. The wall of fame softened that (what a career did survives it) but did not remove
it: trying something else still meant putting down what you had.

The front door is now a **rack of three slots**. Each holds a career in progress, and each is
completely independent — playing one never touches another. Three rather than one, and three rather
than ten: one made starting a career cost you the last one, and ten would make the front door a file
manager. The point is to be able to keep a long career while trying something else, not to run a
league of your own saves.

One slot is **active** at a time, and everything that acts on "the career" — saving a match, opening
the hub, ending it — acts on that one. Every action offered on the rack *selects* its slot and then
acts, so no screen downstream is ever told which career it is working on. There is one answer to
that question, not two. Starting a career checks the slot is empty at the point the write would
actually happen, rather than trusting the markup: a guard in the UI is one somebody can route
around, and the single thing slots exist to prevent is a new career quietly overwriting an old one.

An unreadable slot empties *that slot*, and nothing else. Dropping the whole save over one damaged
career would cost somebody two careers to punish a fault in a third.

#### Exporting and importing the save

localStorage is not storage anybody chose. It is per-browser, per-profile and per-origin; it is
cleared by the same button that clears cookies, by private browsing, and by a browser deciding it
needs the space. Everything the game has ever recorded — three careers, a wall of fame, a season
somebody has been playing for a month — lives in one key that a routine tidy-up deletes without
asking. That is a fine default and an unacceptable only option.

**Export** writes the save to a dated JSON file. The exported file is the *save itself*, not a
summary or a separate export format, and two things follow from that: an export can be imported by
any version that can migrate it, because it goes in through exactly the same door as a save read off
disk; and there is no second serialiser to keep in step with the first. An older export is brought
forward on import rather than refused.

**Import replaces everything.** It is not a merge, deliberately — a half-imported save would have
careers from one machine and a wall from another, duplicate entries, and careers whose transfers
refer to a world the other half does not have. Import means "make this browser be that browser", and
the copy in front of it says so. The file is parsed and migrated *before* anything is written, so a
bad import costs nothing: the worst case is a message and the save you already had.

#### When the browser will not save

Writing to localStorage can simply fail. Private browsing on some browsers offers no storage at all;
a profile near its limit refuses new data; an origin can have site data switched off. The game used
to swallow every one of those with a comment saying *the game plays on* — true, and never the whole
story. The game plays on and **keeps nothing**, so somebody in a private window could finish an
eighteen-season career and lose all of it without the game ever having said a word.

Playing on is still right: refusing to run because storage is unavailable would lose the session
outright rather than merely failing to persist it. But it is now a thing you are **told**. A failed
write raises a warning bar that sits above every screen — not on one screen, because the fact it
reports is true wherever you happen to be — saying that nothing is being kept, and offering the
export that is the whole reason telling you is useful. It clears itself as soon as a write succeeds,
which is the right behaviour for a quota that was freed or a permission granted mid-session.

Two failures are told apart, because they want different words: a browser that is **full**, and one
that is **not letting the game save at all**. The advice is the same either way — export, and import
somewhere that will keep it — but a player who is told their browser is full and knows it is not
stops trusting the next thing the game says.

### Penalty shootouts

A knockout tie that finishes level has always gone to penalties. `applyPlayerResult` has always
sent it to the spot and picked a winner. The problem was that it happened INVISIBLY: you played
ninety minutes, it finished 1-1, the full-time screen said **Draw**, and the next time you looked
at the bracket you were out of the cup. Nothing told you there had been a shootout, and the one
moment in a cup run that most deserves to be a decision was the only part of the match you were not
allowed to play.

So a shootout is now something that takes place. Five kicks each, alternating, sudden death after
that, and the standard rule that it stops the moment the remaining kicks cannot change the outcome.

**You take your own kicks.** They are built from the same penalty situation the match engine uses —
same template, same six options, same keeper who commits partway through your window. That reuse is
the design: a shootout penalty should be exactly the penalty you already know how to take, because
what makes it different is what is riding on it, not the mechanics. Where you come in the order is
decided by your finishing and composure, better takers first, and the order repeats in sudden death
— so a shootout that runs long brings you back round, which is most of the reason a long one is
worth watching.

**A shootout is not part of the match.** Shootout goals are not goals: no career total, no record
book, no movement in your match rating. That is how football counts them, and it is why the engine
lives outside the match rather than as an extra phase inside it — the separation makes it true by
construction rather than by remembering to skip it.

**A tie you skipped still goes to a real shootout**, simulated in full, with a score. It used to be
a single weighted roll that produced a winner and nothing else, so there was no way for the hub to
distinguish going out on penalties from losing 1-0. Both now read as what they were.

On the conversion rate, one measured correction to an earlier note in this file: the weighting by
club strength was never severe. Across the whole world the extremes are about 72/28, and a typical
mismatch about 60/40 — which is what the code's own comment claimed and what the numbers bear out.
The bug was the silence, not the odds. `conversionChance` keeps that shape deliberately: the spread
between the best and worst side is worth about ten percentage points, where in open play it decides
matches.

### Having a position: contracts and where you will go

Two things used to be done TO the player rather than by him.

**A contract was take-it-or-leave-it.** A club made an offer; you accepted it or you did not. Wages,
length and squad role simply happened to you. You can now **push once, on one of the three**, on any
offer and on your own club's renewal. Once, deliberately: a deal you can renegotiate repeatedly is a
slot machine rather than a decision, and the ask would cost nothing.

And it can cost something. A club that only half wants you can **take the offer off the table**
rather than be haggled with. How likely that is comes from its interest and nothing else — the side
desperate for you will take being pushed, the side half looking elsewhere will not — and walking
away is deliberately kept rarer than simply refusing, because a summer in which asking about money
regularly lost you the move would teach players never to ask, which is the state this replaced.
A promise about playing time is the hardest of the three to get: money is a number, and a role is a
plan for the season.

One rule stops a dead end: **you cannot haggle over the only deal you have.** A player whose
contract has run out and who has no other bids has no leverage — which is true football, and also
what stops him talking himself into a summer with nothing left to sign.

**The market never asked what he wanted.** Offers came from club interest alone, so there was no way
to be a footballer who would not leave his country, or who had spent five seasons wanting to play in
Spain. Preferences are now stated *before* the window opens, which is the only point at which they
can matter — applied afterwards they would be a filter on a list already decided.

Three things, all blunt:

- **Settled** — he is not listening this summer, and nobody bids.
- **Refused** — countries he will not move to. Those clubs do not bid at all.
- **Favoured** — countries he would like. Those clubs are keener than they were.

The asymmetry is the point: a refusal is absolute and a preference is only a nudge, because a player
can genuinely rule a league out and cannot make a club in one want him. Refusing the country you
already play in means "I will not move abroad" and never blocks you from staying or signing at home
— reading it the other way would strand an out-of-contract player with nowhere at all to go.

### What he will move for, and asking to leave

Two more things a player gets to decide, added because the three above only ever answered **where**.

#### How big a club, and what it has to be playing in

A country is not the only thing a footballer has a position on. Two clubs in the same league are not
the same move, and "I am not dropping down for this" and "I am only leaving for European football"
are both ordinary things for a player to mean. Neither could be said.

Both are now stated on the same screen as the countries, and both sit on the **absolute** side of
the line: a club that fails one does not bid, exactly as a refused country's clubs do not.

- **How big a club.** Four bands rather than a slider, measured against `clubAppeal` — the club's own
  standing multiplied by the stage its league plays on, which is the number that already answers "is
  this a step up". A slider on a 0-1 quantity nobody can see would invite the false precision of
  choosing 0.63 over 0.61. The floors are set off the world as it is: of 192 clubs, **141** clear
  *an established club*, **48** clear *a big club* and **12** clear *the very top*.
- **European football.** *Any of the three*, or one competition and no other. Read against **next**
  season's qualification rather than the season just finished, because that is the season the move is
  for — a club that has just qualified has European football to offer and one that has just fallen
  out of it does not, whatever it did last year.

`null` and *any* are deliberately different states. The first says he does not mind; the second says
the club must be in one of the three. And the two demands **stack** rather than replace each other:
a big club without a European place fails a player who asked for both.

The screen reports how many clubs are left on the other side of every band, and that number is the
honest half of the control. A player is entitled to hold out for the Champions League. He is also
entitled to know it leaves sixteen clubs able to bid, and that if none of them wants him the summer
is silent **by his own choice** rather than by the game's — because a demand can only ever narrow the
market. It cannot conjure the offer it describes.

The European counts are read off the **places** rather than off who currently holds them, which is
the correct answer rather than a convenient one. Next season's field is not settled until this season
is played, and in a career's first season nothing has qualified for anything — so counting live
entries would tell a new player that holding out for Europe leaves him nought clubs, when it will in
fact leave him a full field. Every competition has the same number of entrants every year whoever
fills them, so the number is knowable now and the names are not.

Neither demand can reach his own club's renewal, and that needs no special case: a club never bids
for a player it already has. Setting an impossible bar leaves him where he is rather than with
nowhere at all.

#### Asking to leave

The one lever in the market that is entirely his. Everything else — offers, interest, even the
preferences above — is a position taken in advance of somebody else's decision. A transfer request
does not ask the club's permission, because in football it does not: a player who wants to go says
so, and what the club decides is not whether he said it but what to do about it.

**It needed rotation to exist first.** On the old model, where the player started every match there
was, a transfer request would have been free — a button that made offers likelier and cost nothing,
so the correct play was to press it every summer and never press it back. Selection is what gives it
a price. The manager choosing between you and the man competing for your shirt now knows you have
asked to leave, and has a ready-made reason to pick somebody who will still be here in August.

So the deal is legible and genuinely two-sided:

| You get | You pay |
| --- | --- |
| **A wider market** — one more club may bid than would have | **Your place in the side** while it stands |
| **A lower fee**, which brings clubs that could not have afforded you | **Any prospect of new terms** — your club stops planning around you |

The widening is done by **raising the cap on offers, not by raising interest**, and the distinction
is the whole implementation rather than a detail. Offers are capped at three; for anybody with a
season worth bidding on, the cap binds long before the interest threshold does. Multiplying interest
under a full cap only reorders the same three clubs — measured across sixty seeds it produced
*exactly as many offers as before*. Raising the cap produced more in sixty out of sixty. The interest
boost is still there and still does something real: it decides **which** clubs fill the list. It is
simply not the thing that widens it.

The fee discount matters more than it looks, for the same kind of reason. A fee is clamped to the
buyer's budget, so cutting it brings clubs into the market that could not otherwise have afforded
him — which is exactly where a player who cannot get a game needs the market to widen.

**It can be handed in at any point**, not only in the summer, and that is deliberate: the moment a
player wants to leave is the moment he has been left out, not the moment the window opens. Handing
one in during the season is the version with teeth, because the manager reads it before every team
sheet between now and the summer that might act on it.

The selection penalty is a **bias, not a bar**. A player good enough to be undroppable is still
undroppable — a manager fighting for a title does not leave his best footballer out to make a point
— which is what keeps this a cost rather than an exile, and what makes handing one in at a club you
are too good for a genuinely different decision from handing one in at a club you are not.

It is handed to the club he plays for, which **on loan is the loan club** rather than the parent, so
a request never follows him somewhere he did not make it. Accepting a move clears it: the request has
been answered by the thing it asked for, and a career carries no record of wanting to leave a club it
no longer plays for.

**Taking it back is free**, and that is a statement rather than an oversight. The price of a transfer
request is the matches missed while it stood, which is already paid and cannot be refunded. Charging
again on the way out would punish one decision twice — and would make withdrawing something a player
avoids doing, which is the opposite of what a reversible lever is for.

### The super cup

One match, before the season starts: last year's champions against last year's cup winners.

Everything else a season wins is settled in June and then sits on the honours list. The super cup is
the only thing that pays a previous season out in **football** rather than in a line of text — the
first fixture of the new year exists because of what you did in the old one, and a player who joins
the champions in the summer walks into a final in his first week. It is also the cheapest trophy in
the game to reach and the least valuable to win, which is exactly right: one match, no run, and a
place in it earned by something you already have a trophy for.

A club that won the league **and** the cup meets the league runner-up instead, which is what football
does and what stops the fixture being a club playing itself. A country whose cup produced no winner
plays none at all, and the calendar simply skips the slot.

It is not a knockout with rounds, so it does not use `CupState`: a bracket of one tie would be a
bracket in name only, and every screen that walks rounds would have to special-case it. And it
stores the country it belongs to, because a player who moves abroad in the summer carries the tie
with him in the save and is simply not in it — without that the fixture would name itself after
whichever league he happened to sign in.

### The decision window, rescaled

The single most important number in the game was wrong by a factor of three, and wrong in a way that
took measuring to see.

A window of about three seconds was calibrated against how long a footballer actually has on the
ball. That is honest football and a poor game: three seconds is not enough for a human to **read six
freshly generated labels** and then decide between them, so the mechanic was testing reading speed
rather than judgement. The options are the game; the clock is meant to be pressure on a decision you
have had time to understand.

So there is now one constant, `DECISION_SCALE`, applied at the very end — after every weight,
pressure penalty and modifier, in the same place the pace multiplier is applied. Every window
stretched by the same factor, so the **relative** difference between a composed veteran and a
panicking teenager survives exactly. Nothing was retuned; it was rescaled.

Ten seconds is for the player the model is centred on. A composed, experienced professional under
light pressure gets about that in open play; a young, low-attribute player in the same situation
gets a little under five; a penalty, which is deliberately the longest window in the game, runs
longer still. The pace settings are now named by the window they give rather than by a multiplier,
because "Standard — 1x" said nothing and only became sayable once the scale was one a person could
hold in their head.

### Where a career may begin

The setup screen has always offered every one of the 192 clubs in the world. That is the right
freedom and it had no cost attached: you could start an eighteen-year-old with 54 ability at the
best side on earth, which no club anywhere would do, and the career that followed was decided before
a ball was kicked.

The missing piece was never the **choice**. It was the gate.

Every club now falls into one of three bands, measured against the squad it already has:

| | |
| --- | --- |
| **Would sign you** | you are at or above their level. Pick them and the season starts. |
| **Would give you a trial** | you are short of their level, but not absurdly. One match decides. |
| **Out of your reach** | not a player they would look at. The option is there and disabled. |

**A trial rather than a filtered list.** A refusal is a rule you read and obey; a trial is a decision
with a consequence. You can reach above yourself and find out in ninety minutes whether you were
right — and it answers with the one thing the game is actually about, a match, rather than with a
number in a menu. The rating you need is shown before you commit and scales with how far you are
reaching: a club barely above you wants a good afternoon, one sixteen points better wants the best
match you have ever played.

The trial is an ordinary match — same decisions, same clock — played against a real side from the
club's own league, so the standard you are judged at is the standard you would be playing at.
**Nothing is recorded from it**: there is no career yet, which is the entire point of it.

**Potential counts, because this is the one moment where it should.** Clubs sign teenagers on what
they might become and nobody signs a thirty-year-old on it, so a share of the gap between ability
and potential is added to what a club sees — tapering to nothing by 24. That is exactly the
difference between *arriving* and *transferring*, and it is why this is not the transfer market's
`reputationRequired` gate: that one asks whether a club can afford a known player, and a career
starts with nobody who is known.

**A failed trial is never a dead end.** The screen names the best club that would have taken you
anyway and offers it directly. And the gate has a floor: the weakest squads in the world take
anybody who turns up, so a player built badly enough in the creator to be below the worst club in
the game still has somewhere to start. A gate with no floor would put a dead end behind the
character creator, which is the worst possible place for one.

#### Reading the list, rather than scrolling it

The gate was right and the *screen* was not. Choosing a club was a `<select>` with 192 options in
it — truncating mid-word on a phone, a scrolling column of names on a desktop — and it withheld
everything the game already knew. The three bands were compressed into `<optgroup>` headings and a
`disabled` attribute; the league, the strength of the squad and what kind of football they play were
all in the data and none of it was on the screen, at the one moment that decides the next fifteen
years.

**Country is the top level, and that was measured rather than assumed.** The obvious structure is by
band, and it organises almost nothing: a young prospect has **108 clubs that would sign him and 66
that would trial him** — 174 of 192 reachable — so the band is one enormous group and two small ones.
What actually divides the world is the twelve countries, sixteen clubs each. So the country row comes
first, ordered by the standing of the league, and each chip says how many of its clubs would have
you. The band became a badge on the card.

Each club now shows its **squad strength**, its **tactical style**, its own **colour**, and either
*Would sign you* or *Trial — 7.5 rating needed*. They are sorted **strongest first**, which is the
ladder the dropdown hid completely: clubs were in data-file order, so the gap between the best side
in a country and its worst was invisible until a season had been played.

**Out-of-reach clubs are still shown**, greyed and unpickable. Hiding them would be tidier and would
cost the player the thing worth knowing — that the club he has heard of is up there, and what it
would take. A ladder you cannot see the top of is not a ladder.

One bug worth recording because only a browser found it: the first version built its country row from
`allCountries()` and offered **forty-eight**. The world carries that many because international
football needs them, and only twelve have a club competition. The row is built from the clubs
themselves now, and `tests/clubPicker.test.ts` fails if it ever goes back.

### What the money looks like

The wage curve was always the right **shape** and the wrong **scale**. An ability-95 player at the
best club in the world was on £86k a week against a real figure three to five times that; an
ability-75 first-teamer earned £18k against a real £60k or more. Market values were about right —
£177m for that same player — so fees and wages disagreed with each other by a factor of four, and
`careerEarnings`, including the "£Xm earned" figure on the end screen, read low for a whole career.

So the curve was **rescaled rather than retuned**: one constant, applied to both what a club offers
and what a player expects. That is the whole reason it was safe. The wage gate asks whether the
offer clears the demand, and scaling both sides by the same number leaves every answer it has ever
given identical — not one signing in the game moved, only the figures on screen.

Roughly, at a top club:

| ability | weekly wage |
| --- | --- |
| 55 — a young squad player | £16k |
| 65 | £34k |
| 75 — a first-team regular | £74k |
| 85 | £160k |
| 95 — the best in the world | £346k |

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

## Getting to it

The interface is a keyboard-first one — a whole match is played on **1** to **6** — and for a long
time it had exactly **one** `:focus-visible` rule in the entire stylesheet. Everything else fell
back to the browser default, which on a background this dark computes to a roughly black hairline: a
player using a keyboard could not see where they were anywhere outside a match. That is fixed
globally, with the ring offset so it reads as focus rather than as a border, and switched to the
page colour on the accent-filled buttons where a green ring on green would be no ring at all.

Alongside it, three things that were missing rather than wrong:

- **Motion can be turned down.** There were eight transition and animation rules and no way to
  escape any of them. `prefers-reduced-motion` is honoured now — with the deliberate exception of
  the timer bar, whose width is written from JavaScript every frame precisely so it always shows
  real remaining time. **Reducing motion must not become reducing information.**
- **What happens is announced.** The keeper strip and the hub's moments banner are live regions, and
  the commentary announces its **newest line only, once**. The feed itself cannot be the live region:
  it is rewritten whole every frame, newest first, so a screen reader would re-read fourteen lines
  every time a minute ticked.
- **Nothing is too small to read.** The floor is 0.7rem. It used to reach **0.58rem — about nine
  pixels — on the SHOT/RUN/CROSS tag of the box a player has seconds to read under a clock.** A
  floor rather than a rescale: everything already above it is untouched.

Contrast was measured and needed no work: dim text sits at **8.0:1** and the accent at **10.3:1**
against the page, comfortably past the 4.5:1 that WCAG AA asks for. The secondary buttons were
37px tall and now have a 44px floor.

All of it is guarded by [`tests/uiAccessibility.test.ts`](tests/uiAccessibility.test.ts), which reads
the stylesheet directly. Accessibility work is uniquely easy to undo by accident — nothing breaks,
no test fails, the screenshots look identical, and a keyboard player simply cannot see where they
are again.

## Current scope

The core mechanic and a playable career loop.

Implemented: a title screen with a menu that leads with whatever the save says you came for, career and quick-match modes, custom player creation with a chosen
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
of fame that ranks every career this browser has finished and keeps each one readable in full**, **three independent career slots**,
**export and import of the whole save**, **penalty shootouts you take the kicks in**,
**contracts you can push back on, stated preferences about where you will play,
how big a club you will move for and the European football you will hold out for, and a transfer
request you can hand in and take back**,
**a trial to earn a start at a club above your level**, **injuries driven by fixture congestion,
and matches your club plays without you**, **a named rival for your shirt, and a manager who leaves
you out of the ones that do not matter**, **a manager whose confidence in you decides selection, what
your club offers to keep you and what it calls you when it does**, **a rival with a career of his
own, who is sold when you take his shirt and turns up against you years later**, **a week between matches you
spend on one of four things, each of which costs what the other three would have given you**,
**eight traits earned from what you actually did, each one changing how a match plays**, **a diary of
the moments a career is made of**, **a trophy presented on the afternoon it is won and a season's
awards handed over one at a time in June**, **a keeper you can read at a glance rather than in nine-pixel
type**, **a visible keyboard focus ring, reduced-motion support and live regions for what the match
says**, **named teammates who get on the end of your passes**,
**loans for a young player who cannot get a game**, promotion and relegation machinery
(dormant on a one-tier world), debug mode, and a versioned localStorage save with migration that
says so when the browser will not keep it.

Deliberately **not** built yet: multiplayer, accounts, a backend, 3D, physics, large player
databases.

## Roadmap and changelog

Both used to sit at the bottom of this file and now have files of their own, because they answer a
different question from the rest of it and change on a different clock:

- **[ROADMAP.md](ROADMAP.md)** — what is still to build, ordered by what it unblocks rather than by
  size, and the one item that is half done.
- **[CHANGELOG.md](CHANGELOG.md)** — everything raised from playing the game and what was actually
  done about it, several of which turned out to be a different problem from the one they looked
  like.

This file stays what it has always been: how the game works, and why it is built the way it is.
