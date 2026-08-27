# Changelog

What was raised, what was done about it, and what turned out to be a different problem from the
one it looked like.

Not a release log. This game has no releases, and a list of version numbers nobody ever
installed would say less than nothing. What is worth recording is the other thing: every item
somebody raised from actually playing, and what the code turned out to be doing about it —
because several were a different bug from the one they were reported as, and that is the part
you cannot reconstruct from a diff.

What is still to build is in [ROADMAP.md](ROADMAP.md); how the game works is in
[README.md](README.md).

## Reported bugs and improvements

Raised from playing the game. Each is annotated with what the code actually does today, because
several turned out to be a different problem from the one they looked like.

**1. The European competitions should be a group stage, then a knockout.** ✅ **Done.**
Four groups of four, then quarter-final, semi-final and final. Six matches for a club that goes all
the way and three guaranteed for one that does not, where a straight knockout gave most qualifiers
exactly one European night a year. See [European competitions](README.md#european-competitions).

**2. You should be able to choose where to start, or play a trial.** ✅ **Done.**
The choice was never the problem — the gate was. Clubs are now banded by whether they would sign
you, give you a trial, or not look at you, and a trial is one real match. See [Where a career may begin](README.md#where-a-career-may-begin).

**3. You should be able to respond to a contract offer.** ✅ **Done.**
You can push once, on wages, length or squad role, on any offer and on your own club's renewal —
and a club that only half wants you can withdraw rather than be haggled with. See [Having a position](README.md#having-a-position-contracts-and-where-you-will-go).

**4. You should be able to refuse a move upfront, and name preferred leagues.** ✅ **Done.**
Stated before the window opens and read by `generateOffers`, so a refused country's clubs do not
bid at all rather than bidding and being hidden. See [Having a position](README.md#having-a-position-contracts-and-where-you-will-go).

**5. A cup tie that ends level eliminates the player's club.** ✅ **Done** — and it was a different
bug from the one it looked like. A level tie never did eliminate you automatically:
`applyPlayerResult` has always sent it to penalties. Two separate claims were worth checking, and
only one survived:

  - **The shootout was invisible.** True, and the whole of the bug. No extra time, no shootout to
    play, nothing in the full-time screen or the hub — the only place in the entire UI that rendered
    a `pens` tag was the world browser. You now play your own kicks; see [Penalty shootouts](README.md#penalty-shootouts).
  - **The odds were badly weighted.** *Not true, and the earlier note here was wrong.* Measured
    across the whole world, the extreme case is about 72/28 and a typical mismatch about 60/40 —
    mild, and what the code's own comment claimed. The weighting was left alone.

**6. Every country should have a super cup.** ✅ **Done.**
One match, before the first league round: last season's champions against last season's cup winners,
or the league runner-up when one club did both. See [The super cup](README.md#the-super-cup).

**7. Salaries should look more like real ones.** ✅ **Done.**
The curve was the right shape and the wrong scale, so it was rescaled rather than retuned — by the
same factor on both what a club offers and what a player expects, which is why not one signing in
the game moved. See [What the money looks like](README.md#what-the-money-looks-like).

**8. The career history table should show every trophy, season by season.** ✅ **Done.**
It was a rendering gap, not a data one — the honours list already held a season's trophies, awards
and promotions together. Both history tables now badge them by kind, so the eye separates what the
club won from what the player won, and both from a relegation.

**9. The decision window should be about 10 seconds at 1x.** ✅ **Done.**
One constant, `DECISION_SCALE`, applied at the very end — so every window stretched by the same
factor and nothing was retuned. See [The decision window, rescaled](README.md#the-decision-window-rescaled).

**10. The default should be no time limit.** ✅ **Done.**
`defaultSettings()` now returns `pace: 'untimed'`. A two-second window on six options you have never
read before is a reflex test rather than a decision, and somebody whose first three chances expire
never finds out what the game is. The keeper still commits on schedule at this setting, so the read
is unchanged.

**11. The career score should be penalised for skipped matches and for a generous pace.** ✅ **Done,
and not in the shape it was asked for.** Right in principle — a career built on skipped matches at
no time limit is not the same career as one played out at Hardcore — and the fix is a **label rather
than a penalty**.

The catch this item was always going to hit is that it can only count *forward*. `skipped` existed
per match and only the most recent one survived, in `lastResult`, so the answer to "how much of this
career did you actually play" was overwritten every match and gone by the end of the first season.
No amount of care at scoring time can recover a season that was never recorded.

That is an argument for starting the counter **early**, not for deferring it with everything else —
every week spent waiting on the scoring rule was a week of data nobody can get back. So
`CareerState.howPlayed` now records, per career: matches skipped, matches played, and a histogram of
the decision pace each played match was played at. It is written in `applyMatchToCareer`, the one
place a finished match becomes part of a career, so it cannot drift from the statistics beside it.

Three details worth knowing:

- **A skipped match is filed under no pace at all.** It was not played slowly; it was not played.
  Counting it under whatever the settings happened to say would credit a career with football
  nobody sat through.
- **The histogram is keyed by a plain string**, not by the `DecisionPace` union. The union lives in
  `simulation/` and `core` may not import from there; and the pace settings have already been
  renamed and rescaled once (see [The decision window, rescaled](README.md#the-decision-window-rescaled)), so a save holding counts under a
  name the code no longer has should keep them as an unreadable tally rather than fail to load.
- **Existing careers start at zero, and that is a fact rather than a default.** A career already
  under way will under-count itself for everything it has already played, and only a career started
  after v18 has a total that means anything. That is unavoidable for any counter added to a running
  game, and it gets less true every day the counting is happening.

**Why not the penalty that was asked for.** The framing has a problem it cannot solve: *how much?*
Is a skipped match worth half a played one, or a tenth? Is Relaxed worth 0.9 of Standard? Nothing in
the game can answer that, because it is not a question about football — it is a question about how
somebody chose to spend their evening, and there is no honest exchange rate between an hour of a
person's attention and a number on a wall. Every value that could be picked would be arbitrary and
would then be defended for years as though it were not.

A label needs no exchange rate. **Played out**, **Mostly played**, **Part-played**, **Largely
simulated**, **Simulated**, with the dominant pace named beside it — shown next to the score on the
wall of fame and the end-of-career screen rather than folded into it. The score says how good the
career was; this says how much of it was actually sat through. Neither is an answer to the other,
and that is precisely why converting one into the other was the wrong move. `careerScore` is
untouched and a test asserts that it stays untouched.

The third of the three questions — *whether a career with too little recorded football should be
judged on this at all* — turned out to be the one with a real answer, and it is no. A career begun
before v18 under-counts itself, so the summary compares what was counted against the appearances
actually made and reports **Not recorded** when they disagree by more than a tenth. Declining costs
nothing; labelling a career "largely simulated" on the strength of a field nobody was filling in
would be an accusation made out of a gap. See [How much of it you actually played](README.md#how-much-of-it-you-actually-played).

**12. You should be able to ask to leave, and to say what a move has to be worth.** ✅ **Done.**
Raised after playing with rotation, and it is the item rotation unlocked rather than one that was
waiting on nothing. Three things: a floor on how big a club has to be before he will move to it, a
demand for European football (any of the three, or one competition and no other), and a **transfer
request** — the only lever in the market that is entirely the player's.

The last of those is the one worth recording a finding about, because the obvious implementation
does nothing. A transfer request was written first as a multiplier on club interest, on the
reasoning that a player known to be available is a player more clubs bid for. Measured across sixty
seeds it produced **exactly as many offers as before**: the offer list is capped at three, and for
anybody with a season worth bidding on the cap binds long before the interest threshold does, so
the multiplier only reordered the same three clubs. Widening a market means raising the cap, which
produced more offers in sixty seeds out of sixty. The interest boost was kept — it decides *which*
clubs fill the list — but it is not what makes the feature work, and the code says so.

See [What he will move for, and asking to leave](README.md#what-he-will-move-for-and-asking-to-leave).

**13. There are a lot of injuries, even for a young player.** ✅ **Done, and measured before and
after.** Raised from playing several seasons. Both halves of it check out, and the second half is
the sharper one.

Measuring it at all meant building [`scripts/measureInjuries.ts`](scripts/measureInjuries.ts), because
this is the one part of the game nobody can judge by reading: risk is quadratic in fitness at the
final whistle, fitness is whatever ninety minutes of a real match happened to leave, and a match
costs slightly more than a week of rest returns. What a constant produces over a season is emergent
rather than arithmetic. Across **480 season-samples played through the real match engine**:

| | measured |
|---|---|
| Injuries per season | 1.29 |
| Weeks out | 3.31 |
| Matches missed | 3.32 of ~40 fixtures |
| Seasons with no injury at all | 25% |

So the file's own claim — "roughly one and a half across a forty-match season… about a month a
year" — is **accurate**. The model is doing what it says. What makes it *feel* like more is that
three seasons in four contain an injury and 49% of them are one-week knocks: the event fires far
more often than the football lost would suggest.

**The "even when young" half is a genuine gap, and not a subtle one.** The age term reads
`input.age <= 28 ? 1 : 1 + (input.age - 28) * 0.07` — flat below 28. A nineteen-year-old is exactly
as fragile as a twenty-eight-year-old and mends exactly as slowly. Measured, age 18 takes 0.95
injuries a season against age 28's 1.38, which is barely above noise. The comment above it says
*"Bodies stop forgiving a hard season somewhere around thirty"*, which describes the top half of a
curve whose bottom half was never written.

**What was done.** A curve at **both** ends, split across two different things because they are
two different facts: `ageRisk` for getting hurt, tapering to ×0.7 by nineteen, and `recoveryFactor`
for mending, using the same taper and rising more slowly to a cap of ×1.35 at the top. The split is
the honest part — real footballers do not stop getting injured for being young, but young bodies do
recover faster, so the larger half of the correction lives in the duration rather than the rate.
`BASE_INJURY_RISK` also came down from 0.035 to 0.031, which was the one genuine balance judgement
here and was taken deliberately rather than derived.

Measured after, on the same 480 seasons:

| | before | after |
|---|---|---|
| Injuries per season | 1.29 | **1.06** |
| Weeks out | 3.31 | **2.38** |
| Matches missed | 3.32 | **2.58** |
| Seasons with none | 25% | **29%** |
| Age 18: injuries · weeks | 0.95 · 1.9 | **0.47 · 0.7** |

A teenager now misses well under a match a season and an ordinary season carries about one injury —
noticeable when it happens rather than a recurring tax. Peak-age and veteran careers move much less,
which is the intended shape: the complaint was about being young, not about being fragile.

**14. A week of extra work costs far more than its card admits.** ✅ **Done.** Not raised by
anybody — found while measuring item 13, in code committed the same day.

`TRAIN_FITNESS` takes 6 fitness a week. Fitness does not reset between matches, and the system
already runs a slight deficit (a match costs about 36, a week's rest returns 34), so −6 turns a
knife-edge into a ratchet. Measured, on a career that trains every week:

- injuries **1.26 → 1.73**, a 37% increase
- mean fitness at full time **53 → 36**, with a tenth percentile of **2**
- seasons with no injury **26% → 13%**

The card says *"turn up to it tired."* It does not say *"and get injured half as often again."*

**What was done**, and the shape of it matters: a **gate rather than a smaller number**, because a
smaller number still ratchets — it only takes longer. Below 80 fitness a player is in no state for
extra work, which is what a coach would say anyway. The option is rendered greyed out with the
reason attached rather than hidden, so being tired makes resting *visibly* the right answer instead
of a lesson learned in February, and the service refuses the choice as well as the screen — a screen
is not a rule.

One trap inside the fix, worth recording because the obvious implementation has it: `max(80, f - 6)`
at fitness 60 hands the player 80, so extra work becomes a way to **recover**. The cost is therefore
clamped to never exceed where he started as well as never to fall below the floor, and there is a
test for exactly that.

After it, the three physical choices sit in the order they should: rest **0.90** injuries a season,
planning nothing **1.06**, training every week **1.23** — about 16% more, which is a price worth
advertising rather than hiding.

One thing the same run corrected, because the obvious reading of it is wrong: **rest looks like a
no-op and is not.** Injuries come out at 1.26 whether or not the player rests every week — but that
is exposure, not risk. Resting lifts mean fitness at full time from 53 to 63 and removes every match
started below 80, and the count holds level only because a fitter player is available for more
matches (35.0 played against 33.4).

## Found while reviewing, and fixed

Eight things that were not on either list, found by reading the code against what it claimed:

- **Reputation's playing-time term could never fire.** It divided every competition's matches by the
  league's fixture list — a number that reaches fifty over one that is thirty — so it was pinned at
  its maximum in every season anybody has played. Fixed ahead of the squad rotation that will make
  it bite, and with no effect on any career today. See [Reputation and transfers](README.md#reputation-and-transfers).
- **Every league's trophies were worth the same.** `careerScore` priced an Austrian title and an
  English one identically, so the shortest route up the wall of fame was to find the weakest league
  in the world and win it repeatedly. Domestic honours are now tapered by the standing of the
  country they were won in; European and international ones deliberately are not. See [The wall of fame](README.md#the-wall-of-fame).
- **Morale was decoration.** It had exactly one consumer — a 0.08 weight in the decision timer —
  which across its whole 0-100 range is 0.53 seconds out of ten. The hub rendered it beside form and
  fitness as though it were one of them, so a player could watch it move for a decade and never see
  the game change. Fixed by giving the club an opinion of its own: **manager confidence** reads into
  selection, into the renewal, and into morale, which is the number it was written to rescue. The
  roadmap had listed this under what squad context would unblock, and it turned out not to need a
  squad at all — only the rival that rotation had already put in the dressing room. See
  [What the manager makes of you](README.md#what-the-manager-makes-of-you).
- **Everything was counted and nothing was ever said.** The record book knew the exact minute a
  career reached its hundredth appearance and had no way to mention it; a first goal was an
  increment. Two strikers with the same twenty attributes were, in every respect the game could
  express, the same footballer. Fixed by the pair that had to ship together: **traits**, earned from
  what was already being recorded and never chosen, and **moments**, so that earning one is
  something that happens to you rather than a row appearing in a table. See
  [What you become known for](README.md#what-you-become-known-for).

  Worth recording from the calibration, because it cost three attempts: the **maverick** trait
  cannot be built on the best rating a career ever got — a maximum over five hundred matches is a
  ten for everybody, so that version fired for 100% of careers and said nothing. Nor on a count of
  perfect tens, which the *better* player reaches sooner while his average is still low, inverting
  the trait. It works as a rate against an average that has stopped moving, and it is the one trait
  a modest career earns and a great one cannot.
- **A browser that could not save said nothing about it.** Every write failure was swallowed, so a
  career could be played to its end in a browser keeping none of it. Failures now raise a warning
  above every screen, and offer the export that makes them survivable. See [When the browser will not save](README.md#when-the-browser-will-not-save).

- **The career's diary was only readable once it was over.** `state.moments` has been accumulating
  the last eighty things worth remarking on since moments existed, and the only places it could be
  read in full were the end-of-career screen and the summer news — the hub showed only the moments
  from the last match. So the game wrote a diary and showed it to the player once, after it was too
  late to be the person in it. Fixed by rendering the log it already keeps, newest first, on the hub.
  Nothing new is recorded, which is why every existing save has a full diary the moment it loads.
  See [The diary, while the career is still being played](README.md#the-diary-while-the-career-is-still-being-played).

- **Manager confidence was a scoreboard with nobody posting the score.** It had read into selection,
  the renewal and morale since it was written, and moved on every match — without the player ever
  being told what he was being judged against. The one question a footballer would actually ask in
  August had no answer anywhere in the game. Fixed by the manager saying it: appearances and goals
  or assists, set when a season starts, on the hub all year, settled in the summer.

  Worth recording from the calibration, because the first attempt was wrong twice in opposite
  directions. The demand was first measured against the **calendar**, which counts weeks rather than
  matches — so a seventeen-year-old was asked for forty-nine appearances in a thirty-match league.
  With that fixed, the contribution half was pitched at what a striker *ought* to return by the
  standards of real football, and 77% of seasons exceeded it: this engine is simply more generous
  than real football, at about 1.22 goals and assists per appearance for an auto-played striker. The
  rate is now set just under what a skipped season already produces, and the verdict lands at
  20% exceeded / 50% met / 30% missed. `scripts/measureObjectives.ts` is committed, for the same
  reason `measureInjuries.ts` was: the second time somebody asks whether a target is fair should be
  cheaper than the first. See [What he wants this season](README.md#what-he-wants-this-season).

- **One colour was doing four jobs, and 192 colours were doing none.** `--accent` green was the
  focus ring, the primary button, a positive statistic and a league position at once, so nothing on
  the hub could be made to stand out — everything already had the loudest colour available. Meanwhile
  every club in `teams.json` has carried a `colour` since the world was generated and the interface
  used it in exactly two places, so signing for one club looked identical to signing for any other.
  Fixed together, because they are the same problem: each token now has exactly one meaning, and club
  colour became the identity channel that was missing. 60 of the 192 are too dark to see against the
  page and are lifted in their own hue until they clear a contrast floor — asserted across the whole
  data file rather than checked by eye. See [What each colour means](README.md#what-each-colour-means).

- **The roadmap's auto-play finding was real and mis-attributed**, which is the sort of thing only a
  measurement settles. It recorded that "auto-play scores far too much" and deliberately left it
  alone. Measuring the same fixture under four policies on the same seeds shows that a striker
  choosing the **worst available option every single time** still scores 1.58 goals a match at
  ability 85 — so the inflation is the engine's chance supply, which a played career gets in exactly
  the same measure, and retuning auto-play would have made skipping a punishment while fixing
  nothing.

  What *is* wrong with auto-play is the opposite of the claim: the gap between it and a perfect read
  narrows from −0.95 rating at ability 55 to −0.31 at 85, so the value of playing the match yourself
  shrinks to almost nothing exactly as a career becomes good enough to matter. `AUTO_SHARPNESS` is
  not the lever either — sweeping it across five candidate ranges moves the average rating by at most
  0.02. Both halves are still recorded rather than changed, because either would move every career
  already played, but they are now recorded accurately and `scripts/measureAutoPlay.ts` is committed.

  **A second pass found where the goals actually come from, and a third found that auto-play has no
  lever at all.** Decomposing the scoring shows chance VOLUME is flat across ability — 5.1 shots a
  match at 55 against 5.8 at 85 — while conversion runs 0.11 to 0.39. The amplifier is `GOAL_CURVE`,
  a logistic steep enough to turn a 0.15 swing in the underlying shot value into a 3.5× swing in
  conversion, calibrated honestly on one-on-ones and then applied to every shot in the game. Fixing
  it is one constant plus four re-calibrations, all of which now have tools.

  The obvious contained alternative — stop `autoTimeUsed` scaling its tempo with the player's
  attributes — was written, measured and **reverted**, because it changed nothing: the term spans
  17.4% to 22.5% across a whole career, a five-point swing that could never have produced the
  effect. Recorded because it is the kind of dead end worth only paying for once. See ROADMAP.md.

- **And then it was fixed, and the fix was not the one that had been scoped.** The plan of record
  was to lower `GOAL_CURVE`'s midpoint and re-calibrate around it. Measuring first killed that: the
  curve's one-on-one numbers were right the day they were written, and lowering it drags them down
  with everything else.

  The real defect was `RESOLUTION_WEIGHTS.quality` at 0.18 — half the weight of the player's own
  execution — so a good footballer's HOPELESS chance inherited most of the value of his best one.
  A world-class striker converted a genuinely poor chance 27.6% of the time against 44.5% for a
  gilt-edged one: a spread of 1.5x where real football is nearer tenfold. That is why the aggregate
  was absurd while every individual number looked defensible.

  Raising that weight was tried first and **inverted the game** — it feeds `value`, which the whole
  decision model is ordered by, so at 0.58 choosing the worst available option outscored choosing
  the best at every ability measured. Recorded because it is exactly the kind of plausible fix that
  only measurement catches. What shipped instead separates chance quality out and applies it at the
  goal roll alone, leaving every option ordered as before, with set pieces exempt because each is
  already calibrated in its own right.

  Season goals fell 47.0 to 29.0 and a season's average rating 7.64 to 6.99. Four things read those
  numbers and were re-calibrated with them: the season objective's rates (rescaled, verdicts back to
  15/50/35), the trait thresholds (each moved by its own measured ratio, so incidence is preserved),
  the individual awards (deliberately NOT restored — top scorer in 89% of seasons was itself the
  distortion, and it is now 70%), and the wall of fame (each legacy stamped with a `balanceVersion`
  and older entries labelled, a label rather than a rescale for the same reason item 11 settled the
  same way). What is still wrong is stated rather than hidden: the shot MIX, which is the situation
  generator's business. See [What a chance is worth](README.md#what-a-chance-is-worth).

- **The game never explained itself to anybody arriving.** The front door opened on a rack of career
  slots and a settings panel — a decision pace dropdown shown to somebody who had not yet been told
  that decisions were timed, and a hub layout dropdown shown before he had seen a hub. The
  explanation that existed was five bullets inside a collapsed `<details>` at the bottom of that
  page, below the careers, the wall, the quick match, the settings and the save panel: folded, below
  the fold, and under five other sections. Fixed with a welcome shown exactly once and a manual
  reachable at any time, the manual generated from the game's own tables so it cannot drift out of
  step with the settings it describes. Existing players are marked as having seen the welcome
  without ever being shown it. See [Arriving for the first time](README.md#arriving-for-the-first-time).

- **Choosing where to start was a 192-item dropdown.** It truncated mid-word on a phone and withheld
  everything the game already knew: `trial.ts` works out for every club whether it would sign you,
  trial you or not look at you, and the dropdown compressed that into three headings and a disabled
  attribute — with the league, the squad strength and the style of football nowhere on screen, at the
  one moment that decides the next fifteen years. Replaced with a browsable picker.

  The measurement changed the design. Grouping by band is the obvious structure and organises almost
  nothing — a young prospect has 174 of 192 clubs reachable, so it is one enormous group and two
  small ones. Country divides the world properly: twelve of them, sixteen clubs each. Clubs are
  sorted strongest first, which is the ladder the dropdown hid entirely, and out-of-reach clubs are
  shown greyed rather than filtered out. A bug only a browser found: the first version built its
  country row from `allCountries()`, which returns forty-eight — the world has that many because
  international football needs them and only twelve have a league. See
  [Where a career may begin](README.md#where-a-career-may-begin).
