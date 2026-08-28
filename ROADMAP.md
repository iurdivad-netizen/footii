# Roadmap

What is still to build, and what was decided against building. Everything already done is in
[CHANGELOG.md](CHANGELOG.md); how the game works and why it is built the way it is stays in
[README.md](README.md).

This file is also a record of things that were measured and then NOT changed, which is most of its
length. Those live under [The record](#the-record) below. What is actually outstanding is the short
list first, because a roadmap you have to read to the end of to find the open items is a history
book.

## What is still open

Three build items, three smaller RPG ones, and one balance question.

**The build items, in the order they are worth doing.** Nothing is waiting on any of them any
more — the dependency chain the first version of this list was ordered by has been fully paid off —
so this is ordered by value against cost.

| | what it is | why this order |
|---|---|---|
| **A second division per country** | promotion and relegation exist, are tested, and swap nobody: all 192 clubs in `teams.json` are tier 1 | the machinery is already written, so it is the most game for the least new simulation |
| **A playable goalkeeper** | `GK` is a position the career layer already answers for; what it has no version of is the MATCH | the largest single piece of new simulation left, and nothing depends on it |
| **A richer location model** | zones are designed to be swapped for 2D coordinates behind the same `Zone` interface | deliberately last: nothing is waiting on it |

All three are described in full, with what they reach into, under
[The five items this list started with](#the-five-items-this-list-started-with).

**The RPG remainder**, all three smaller than they look:

- **Tendency and position retraining**, so a thirty-one-year-old can become the deep-lying version
  of himself. `Tendencies` is a complete 0-100 blend model **set once in the creator and never
  mutated again** by any career path, and `player.position` is likewise only ever assigned there.
  The machinery already exists; nothing has ever been wired to move it.
- **A background at creation** — where he came from, before the first contract.
- **A full squad** — a readable XI and squad numbers. Flavour rather than mechanism, and it blocks
  nothing: the six footballers the game can actually see (a rival, five receivers) are the six it
  interacts with.

**And one balance question, measured to a standstill.** The engine's conversion slope is too steep:
9.6% of attempts at ability 55, 17.7% at 70 and 29.1% at 85, against a real 12-15%. A poor
footballer is already BELOW real football and a great one is double it. Four candidate levers have
now been measured and every one of them moves the LEVEL and leaves the SLOPE — the goal curve's
midpoint, the situation bands, the archetype weights, and both of auto-play's own constants. It is
recorded rather than acted on because any fix moves every career in progress, and it is the one
item on this page that nobody should start without reading
[the record of what has already been tried](#the-shot-mix-is-a-decision-before-it-is-a-distribution).

## The record

Everything below is what happened, in the order it happened. It is kept because several items
turned out to be a different problem from the one they looked like, and that is the part you cannot
reconstruct from a diff.

### The five items this list started with

The four agreed stages — a world of countries, domestic cups, European competitions and
international football — are all done, and so is the end of the loop: a career can now finish, and
finishing one leaves something behind. Of the five items that followed them, two are closed and
three are the open list above.

1. **Squad context** — ✅ **Done**, in the shape the game actually needed rather than the one the
   list first imagined.

   It was written as "named teammates, so an assist has a recipient and a club has a shape", with a
   full squad implied. What it turned into is three smaller things, none of which needs a player
   database: a named **rival** for your shirt ([The competition for your place](README.md#the-competition-for-your-place)), five named
   **receivers** to pass to ([Somebody to pass to](README.md#somebody-to-pass-to)), and **loans** for when the first of those is
   winning ([Going out on loan](README.md#going-out-on-loan)). A club is now a set of ratings plus the six footballers you
   actually interact with, which is every one the game can see.

   What a full squad would still buy is flavour rather than mechanism: a full XI to read on a team
   sheet, squad numbers, teammates with careers of their own. Worth doing one day; not blocking
   anything.

   One thing that list did promise has since arrived: **a manager whose confidence in you gives
   morale something to do**. It needed no teammates either — the rival rotation already put in the
   dressing room was enough for somebody to hold an opinion — and it turned out to be a fix for a
   bug rather than a feature: morale had exactly one consumer, worth half a second on a ten-second
   window. See [What the manager makes of you](README.md#what-the-manager-makes-of-you).

   It is no longer the blocker for playing time, though, and that is worth being precise about.
   Both levers that waited on it — the reputation settlement, and the 60% gate on individual
   awards — are now **live**, because injuries took matches off you and neither lever needed a
   teammate to notice. League participation runs between about 70% and 100% across a career instead
   of being pinned at exactly 100%. What squad context still unblocks is *rotation* — being left out
   while fit — along with assists having a recipient and loans. Every one of those is now done.

2. **Injuries and squad rotation** — ✅ **Done, both halves.**
   Injuries went first because they turned out not to depend on squad context at all: missing
   matches moves reputation and the awards gate on its own, and fixture congestion supplies the
   cause. Rotation followed, on a single named rival for your shirt rather than a squad — which is
   all selection ever needed, and which finally makes `contract.role` mean something. See [Injuries, and the matches that happen without you](README.md#injuries-and-the-matches-that-happen-without-you) and [The competition for your place](README.md#the-competition-for-your-place).

   Rotation has since paid for something the list did not anticipate: it is what made a **transfer
   request** cost anything. Being left out is the price of asking to leave, so the one lever in the
   market that is entirely the player's could not have existed before it. See [Asking to leave](README.md#asking-to-leave).

3. **A second division per country** — the machinery is written, tested and dormant; it needs clubs
   and a fixture list. `teams.json` is 192 clubs, sixteen per country across twelve countries, every
   one of them tier 1. It is genuinely a data change rather than a re-implementation, but it is not
   *only* one: a second tier reaches into the country coefficient, European entry (a relegated club
   loses its place) and `positionalNeed` in the transfer model. It adds no matches to the calendar, so
   it is cheaper than it looks — and the calendar is no longer the constraint it was anyway: it is
   measured in weeks now, so a competition that *does* add matches fills midweeks rather than
   lengthening the season. See [A season is measured in weeks](README.md#a-season-is-measured-in-weeks-not-in-matches).

4. **Playable goalkeeper** — `GK` exists as a position but has no playable match loop, so it needs
   its own situations and involvement model. It also needs its own department in the transfer model:
   `positionalNeed` currently reads a keeper against the outfield defence rating, and every
   tactical-style weighting is an outfield profile. Independent of the three above, and the largest
   single piece of new simulation left.

   Worth being exact about what already exists, because "GK is only a string in a union" is the
   easy version and it is not true. The career layer answers for a keeper everywhere a position has
   to be exhaustive — his cover positions in `squad.ts`, a contribution rate of 0.02 in
   `objective.ts`, a department in `transfers.ts` — and `POSITION_PROFILES` has a full entry for
   him. What has never been written is the ninety minutes: no creator preset offers him, no
   situation archetype carries a `GK` weight, so a career started as a goalkeeper would reach the
   first fixture and have nothing to do in it. The missing piece is the match, not the career.

5. **Richer location model** — the tactical zone model is designed to be swapped for 2D coordinates
   behind the same `Zone` interface. Deliberately last: nothing else is waiting on it, and it is
   worth more once there are teammates to have positions.

   Half of that precondition has since been met and it is worth being precise about which half. The
   five named receivers are people to pass TO, not people standing somewhere — a teammate is a name
   and a set of ratings, and there is no position on him to be richer about. So this is still last,
   and what would move it up the list is the full squad in the RPG remainder rather than anything
   in the match engine.

### What landed that was never on the list

Done since this list was last written, and worth recording because both were listed here as
obvious next steps: **three career slots**, so ending a career is no longer the price of starting
another, and **export/import of the save**, so a browser clearing its storage is no longer the end
of everything the game has recorded. Both are documented under [Career mode](README.md#career-mode).

Two more have since arrived that were on nobody's list, and they are worth recording precisely
because they were not — both came from reading the game rather than from planning it, and both are
about the part of a career that happens between matches rather than during them:

- **[What the manager makes of you](README.md#what-the-manager-makes-of-you)** — a number per club that reads into selection, into the
  renewal, and into morale. Item 1 above had listed this under what squad context would unblock; it
  needed no squad at all, only the rival that rotation had already put in the dressing room.
- **[The week before a match](README.md#the-week-before-a-match)** — the hub used to offer exactly one button between fixtures, so
  a season was thirty decisions about how to finish a chance and none at all about how to be a
  footballer. Now it is one choice out of four, each costing what the other three would have given
  you.

They are listed together because they are one change in two halves. Separately each is half a
feature: the manager's confidence is a lever with nothing to pull it, and the week is a set of
choices with nothing to spend them on. Together they are a loop — you are dropped, you knock on his
door, and you are back in the side by Saturday.

A third pair has since landed on the same principle, and for the same reason:

- **[What you become known for](README.md#what-you-become-known-for)** — eight traits, earned from what the record book was already
  counting and never chosen, each changing how a match plays rather than adding a figure to a
  screen. The game had progression, a manager, a rival and an ending, and still no **identity**: two
  strikers with the same twenty attributes were the same footballer.
- **[The moments a career is made of](README.md#the-moments-a-career-is-made-of)** — a debut, a first goal, a hundredth appearance, a run as
  it lengthens, a match against a club that used to pay your wages.

Again one feature in two halves. A trait announced only in a stats table is an invisible modifier —
the exact mistake this codebase already made once with morale — so earning one has to be a moment or
it is not really a thing that happened to you.

**[The rival's own career](README.md#the-rivals-own-career)** has since closed the third of those pairs. He used to age and nothing
else; now the summer decides whether he is still at the club at all, a replacement pitched a shade
higher arrives when he is not, and the men you displaced turn up against you years later. The half
of it worth recording is the fate that was deliberately NOT written — the club buying better when
you cannot get a game — because it would make losing your place the cause of a harder opponent for
it, which is the spiral this codebase refuses on principle.

**The interface has had a pass too**, and the two halves of it are worth distinguishing. The match
one was a real design fault: the goalkeeper is what this README calls the mechanic and he was an
eleven-pixel caption painted on a canvas — see [The goalkeeper is the mechanic](README.md#the-goalkeeper-is-the-mechanic). The other was
simply missing work: a keyboard-first game with no visible focus ring, no reduced-motion support,
no live regions and type down to nine pixels — see [Getting to it](README.md#getting-to-it).

**The hub has since been restructured**, which was the design decision the interface pass had left
open — and the count in that note was wrong: a mature career renders **sixteen** cards, not eleven,
which is how it reached 3,300px on a phone. The next match and the week stay pinned and the rest go
into four named sections, each carrying a **peek** assembled from its own contents, because hiding a
card behind a heading costs you the glance that told you whether to look. The shape is a **player
setting** rather than a decision taken for him — tabs are the shortest page and cost a navigation
model, folds are longer and cost nothing to learn — with the division defined once and drawn twice,
so the choice can never become a difficulty level. Measured in a browser at both widths: 3,325px to
**1,738px** in tabs and 2,255px in folds, no horizontal overflow at 390px. See
[The shape of the hub](README.md#the-shape-of-the-hub).

That interface item is now **closed**: choosing a club was a 192-item dropdown that truncated
mid-word and said nothing about any of them, although the game models whether each would sign you,
trial you or ignore you. It is a browsable picker now — see [Where a career may begin](README.md#where-a-career-may-begin).

Worth recording because it changed the design: the obvious structure, grouping by whether a club
would have you, **organises almost nothing.** Measured, a young prospect has 108 clubs that would
sign him and 66 that would trial him — 174 of 192 reachable — so the band is one enormous group and
two small ones. What actually divides the world is the twelve countries with sixteen clubs each, so
country came first and the band became a badge.

What remains on the RPG side: **tendency and position retraining**, so a thirty-one-year-old can
become the deep-lying version of himself, **a background at creation**, and a **full squad** — a
readable XI and squad numbers — which is flavour rather than mechanism and blocks nothing.

Worth noting about retraining, because it makes the item smaller than it looks: `Tendencies` is a
complete 0-100 blend model that is **set once in the creator and never mutated again** by any career
path, and `player.position` is likewise only ever assigned there. The machinery to be a different
footballer at thirty-one already exists; nothing has ever been wired to move it.

**Eleven more have since landed**, all from reading the game rather than from planning it — and the
count in this line has been wrong twice, which is its own small lesson about a list that grows by
one item at a time:

- **[What he wants this season](README.md#what-he-wants-this-season)** — manager confidence had been a scoreboard with no posted
  score since it was written: the number moved every match and nothing anywhere said what it was
  moving against. Now the manager asks for a number of appearances and a number of goals or assists,
  it sits on the hub all year, and the summer settles it. Calibrated rather than estimated, and the
  first attempt was wrong by half — see the README for the measured distribution and the tool.
- **[The diary, while the career is still being played](README.md#the-diary-while-the-career-is-still-being-played)** — the moment log had a reader problem
  rather than a writer one. It has been accumulating since moments existed and could only be read in
  full at the end of a career, so the game wrote a diary and showed it to you once, after it was too
  late to be the person in it. It is a hub card now, and every existing save has a full one the
  moment it loads.
- **[What each colour means](README.md#what-each-colour-means)** — the palette had one working hue doing four jobs, so nothing
  could be made to stand out. Each token now has exactly one meaning, and the club colour every one
  of the 192 clubs has carried since the world was generated — and which the interface used twice —
  is now identity throughout, lifted for legibility where the data is too dark to see.
- **[What the last match changed](README.md#what-the-last-match-changed)** — the hub redrew with a dozen numbers moved and never
  said which. It speaks now, and only when something crossed a line the player can act on: about one
  match in four.
- **[The season so far](README.md#the-season-so-far)** — four straight wins and four straight defeats looked identical from
  the hub. One dot per match, letters as well as colour, absences included.
- **[A hub that does not look broken on day one](README.md#a-hub-that-does-not-look-broken-on-day-one)** — dropping empty sections is right, and left a
  first-season career showing three where the manual describes four with nothing saying the fourth
  was coming.
- **[The most destructive click in the game](README.md#the-most-destructive-click-in-the-game)** — removing a career from the wall took one press
  with no undo, while clearing the entire wall was already guarded.
- **[Leaving a match that has already started](README.md#leaving-a-match-that-has-already-started)** — a match in progress had no exit at all. It has
  one now, and it plays the remainder out rather than discarding it, because a discardable fixture
  on a fixed seed is a fixture you can retry until it goes in.
- **[What this week would do to you](README.md#what-this-week-would-do-to-you)** — the week is the decision a player makes most often
  and each of its four cards carried one authored sentence with no number in it, which is the
  invisible-modifier mistake this file has already recorded twice. Each option now says what it
  would do to THIS footballer, derived from the constants the week itself will use rather than
  written beside them, so a test can assert the card promised what the week delivered. It pays for
  itself twice over: extra work reading +12% at one morale and +28% at another is how a player
  learns what morale is for, and studying the opponent turns out to be worth **nothing** at the
  untimed pace — one of the four options switched off by a setting chosen on another screen, which
  the card now says out loud.
- **[The afternoon it was won](README.md#the-afternoon-it-was-won)** — winning the cup produced a full-time screen reading "2-1"
  and a button marked *Back to career*; the trophy appeared four months later as a row on the season
  review, between a promotion and a cap count. That is this file's own recurring defect for the
  fourth time — a thing recorded only in a list is a thing that never happened to you. Trophies
  settled by a match are now presented the moment the match ends, and everything a match cannot
  settle — the title, the doubles, promotion, and every individual award — is handed over one at a
  time in June, club before player. Three of the decisions inside it are the interesting part: a
  final LOST gets a screen too, because a game that goes quiet on the one afternoon a season turns
  on would contradict its own honours list two screens later; a trophy won from the treatment room
  is still presented and says so rather than claiming he played; and whether a final has just
  happened is answered by comparing a competition's winner before the match with its winner after,
  which is the one question a domestic cup, a European bracket, a tournament of eight and a
  one-off super cup all answer the same way.
- **The world stopped being eight countries four countries ago.** Found while reading rather than
  playing: the README still headed its world section "eight countries" over a body that said
  twelve, the generator's own docstring described 128 clubs, and `countries.ts` opened by telling
  the reader the world was eight of them. None of it was load-bearing and all of it was the first
  thing a new reader met. The coefficient's calibration notes were the one careful case — their
  eight-country figures are the measurement that set `COEFFICIENT_SWING` and are now dated rather
  than overwritten, because a note that quietly restates history in today's numbers is worth less
  than one that says when it was taken.

### Balance, measured four times over

This is the part of the file worth reading before touching a constant. It is one question asked
four times, and the answer moved every time — so the sections below are left in the order they were
written rather than tidied into the conclusion, because the wrong turns are the useful part.

**The original observation, and every number in it is now historical** — it was taken before the
chance-quality fix, which cut scoring by about a third. It is left standing because the two sections
after it are corrections OF it, and a correction with its subject deleted is not a record.

> One thing found while measuring and deliberately not acted on: **auto-play scores far too much.**
> A skipped match resolves at 1.0 goals a match at ability 55 and **2.9 at ability 85**, with an
> average rating of 9.4 — so "let him play it" produces a superhuman career, and it distorts the
> golden boot, the record book and the wall of fame. Retuning it would move every career already
> played, so it is recorded here rather than changed.

**That attribution has since been measured, and it was wrong.** `scripts/measureAutoPlay.ts` plays
the same fixture under four policies — worst option, random, auto-play, best option — on the same
seeds, which is the comparison the original observation could not make from a single column of
numbers. What it shows at ability 85:

| policy | goals/match | rating | gap to a perfect read |
|---|---|---|---|
| always the worst option | 1.58 | 8.40 | −0.97 |
| uniformly at random | 1.68 | 8.66 | −0.71 |
| **auto-play** | **2.30** | **9.06** | **−0.31** |
| always the best option | 2.32 | 9.37 | — |

Two findings, and only the second is auto-play's fault.

**The scoring is the engine's, not the policy's.** A striker picking the *worst available option
every single time* still scores 1.58 goals a match at ability 85. That is the inflation, and it
affects a played career exactly as much as a skipped one — so retuning auto-play would not touch it,
and would make skipping a punishment, which AutoPlay.ts's own notes forbid. Fixing it properly means
the engine's chance supply at high ability, which moves **every** career, played or skipped, and is a
much larger balance change than the one this note proposed.

**What is genuinely wrong with auto-play is the opposite of "too good in general": the value of
turning up shrinks as the career gets good.** The gap between auto-play and a perfect read runs
−0.95 at ability 55, −0.69 at 70, and −0.31 at 85 — so a skipped match at 85 scores 2.30 goals
against a perfectly played 2.32. The decision mechanic the whole game is built on becomes optional
precisely for the careers going for the wall of fame.

`AUTO_SHARPNESS` is **not** the lever, which was the other thing worth measuring before touching it.
Sweeping the sharpness range across five candidates moves the average rating by at most 0.02 at any
ability — the six options a situation offers are mostly sensible, so the exponent has little to
discriminate between. The scaling actually comes from `autoTimeUsed`, and any real fix is there
rather than in the choice policy.

Both halves are recorded rather than changed, for the reason the original note gave — either would
move careers already played — but they are now recorded **accurately**, and the tool that settles the
question is committed.

### Where the goals actually come from

A second measurement pass decomposed the scoring into the chain that produces it —
`goals = involvements x (shots / involvement) x (goals / shot)` — because "the engine scores too
much" is three different bugs wearing one coat. Per match, auto-played, across the ability range:

| | 55 | 70 | 85 | change |
|---|---|---|---|---|
| involvements | 7.8 | 8.4 | 8.7 | +12% |
| shots | 5.1 | 5.5 | 5.8 | +15% |
| shots per involvement | 0.65 | 0.65 | 0.67 | **flat** |
| on-target per shot | 0.39 | 0.53 | 0.66 | +69% |
| **goals per shot** | **0.11** | **0.24** | **0.39** | **+255%** |

**Chance volume is not the problem.** A great striker gets barely more chances than a poor one, and
turns the same fraction of them into attempts. The whole ability effect on goals runs through
**conversion** — and it compounds through two stages that both scale with ability, the on-target
rate and the goals-per-shot-on-target, which multiply.

**The amplifier is `GOAL_CURVE`** in `simulation/ActionResolver.ts` — `{ midpoint: 0.64, steepness: 11 }`.
Inverting the observed conversion, the mean shot `value` moves only from about **0.45 to 0.60**
across the whole ability range. A logistic that steep turns that 0.15 swing into 11% → 39%.

**It was calibrated on the right statistic and applied to the wrong population.** The comment above
the curve says a clean one-on-one converts around 40% for a good finisher and 20% for a raw
teenager, "roughly what real one-on-ones look like" — and that is accurate. But the curve tuned on
the BEST chances is applied to EVERY shot, so ability 85 converts 39% of all attempts where real
football manages 12-15%. Nobody checked the aggregate.

**Steepness is the wrong lever**, which is worth knowing before anyone reaches for it. The mean
`value` sits BELOW the midpoint at every ability, so flattening the curve pulls conversion UP toward
50%: dropping steepness to 6 takes ability 55 from 11% to 24%. Any fix has to move the midpoint.

**What a fix would cost**, measured on a candidate (`midpoint 0.72, steepness 9`) and then reverted:

| ability | goals now → after | rating now → after |
|---|---|---|
| 55 | 0.54 → 0.42 | 6.05 → 5.78 |
| 70 | 1.28 → 0.90 | 7.74 → 7.12 |
| 85 | 2.28 → 1.58 | 9.04 → 8.40 |

Goals fall about 30%; **ratings fall only about 0.6**, because `compressEventDelta`'s square root
absorbs most of it. That bounds the blast radius, but 0.6 of rating still moves everything keyed to
a rating threshold: the traits (`bigMatchAverage >= 7.4`, `nineOrBetter >= 30%`, the maverick's
perfect-ten rate), the awards and the golden boot, the objective's contribution rates, and
`careerScore` on the wall of fame. So it is **one constant plus four re-calibrations**, each of
which now has a committed measuring tool. A day's careful work, not a one-line change and not a
fortnight.

**Now done**, with the re-calibrations it needed. See [What a chance is worth](README.md#what-a-chance-is-worth) — and note that
the fix that shipped is not the one this section proposed. Lowering the midpoint
alone was measured and rejected: it drags the one-on-one calibration down with
everything else. The defect was narrower and stranger than "conversion is too
high", and it is described there.

**What is still open, and it is the honest remainder.** A hopeless chance still
converts better than one in five for a world-class striker, against nearer one in
twenty in real football, and the spread across chance bands is 1.8x against a
real tenfold. No constant in the resolver closes that: a bigger one either
inverts the decision model or breaks the set pieces, both measured. What is left
is the SHOT MIX — the game hands its striker five to six attempts a match, most
of them decent, because he is the focus of every situation it generates. That is
`SituationGenerator` and the `qualityRange` bands in `data/situations.ts`, not
`ActionResolver`, and it is the next place to look if the aggregate still reads
high.

### The shot mix is a decision before it is a distribution

That paragraph was a diagnosis nobody had checked, which is exactly the kind of thing this file has
twice recorded and twice found to be wrong. So `scripts/measureShotMix.ts` was written to check it.
It plays the same fixture under auto-play and under a perfect read and records EVERY moment the
player was in — not only the ones that produced a shot, which turned out to be the whole point.

**The mix is top-heavy, and by more than the claim said.** At ability 85, auto-played over 200
matches:

| band | share of attempts | per match | converts (perfect read) |
|---|---|---|---|
| hopeless (<0.35) | **0.8%** | 0.05 | ~25% (n=16) |
| poor (.35-.45) | 5.2% | 0.31 | 24.1% |
| decent (.45-.62) | 44.0% | 2.63 | 24.9% |
| big (>=0.62) | **50.0%** | 2.98 | 40.4% |

94% of a striker's attempts are decent or better, and the game records one shot from a genuinely
hopeless position every twenty matches.

**But the reason is not the one anybody assumed, and this is the finding that reframes the item.**
The game generates poor moments perfectly happily — about two a match at ability 85, across midfield
possession, the pressing trap, the wide attack and the edge of the box. What it does not do is
SHOOT from them:

| | becomes a shot |
|---|---|
| a poor or hopeless moment | **17.7%** |
| a big chance | **87.2%** |

Midfield possession, the pressing trap, the aerial duel and the wide attack produce a shot 0% of the
time. The edge of the box manages 32%, the side of the penalty area 41%. The population of ATTEMPTS
is filtered by the decision model before it is anything else — and a striker who squares the ball
rather than shooting from a hopeless angle has not taken a bad shot, he has taken no shot. That is
football, not a defect, and it means "most of them are decent" is substantially a description of
somebody playing well.

**The aggregate, per ability, which had never been stated:** 9.6% of attempts at 55, 17.7% at 70,
29.1% at 85, against a real 12-15%. A poor footballer is already BELOW real conversion and a great
one is double it. It is the slope, not the level — the same shape the goal curve turned out to have.

#### Both mix levers, measured and both rejected

The tool's other two modes change the world and measure what comes out, then put it back.

**The bands cannot do it, and the intuitive direction is backwards.** At ability 85: shipped 5.88
attempts, 1.79 goals, 30.5% per attempt; every `qualityRange` shifted down 0.10 gives 5.72 / 1.23 /
21.4%; every band stretched 1.4x about 0.5 gives 5.91 / 2.18 / **37.0%**. Stretching the bands apart
RAISES conversion, because almost every template already sits above 0.5 — widening around the
scale's midpoint pushes the bulk of the game's chances up rather than fanning them out. And shifting
down drags ability 55 to 6.6%, half the real rate, to bring 85 to 21.4%, still above it.

**The archetype weights move volume, not slope.** Read the two columns of `data/situations.ts`
together and the mix stops being mysterious: for a striker the three LIKELIEST archetypes are the
three BEST ones — the one-on-one at weight 6 over a 0.62-0.90 band, the through ball at 5 over
0.50-0.82, arriving on a cross at 5 over 0.45-0.78 — while the poor ones carry the lowest weights in
the table, midfield possession at 0.6 over 0.12-0.40 and the wide attack at 1 over 0.25-0.55.
`positionWeights` and `qualityRange` are correlated, and that correlation IS the shot mix. Nothing
about any individual number is wrong; what it produces in aggregate is a footballer whose every
moment is one of his best ones.

Lifting the poor archetypes fourfold and halving the one-on-one, with every band left exactly as it
shipped:

| ability | attempts | goals | per attempt |
|---|---|---|---|
| 55 | 5.03 → 3.41 | 0.49 → 0.22 | 9.7% → **6.5%** |
| 85 | 6.01 → 4.25 | 1.79 → 0.91 | 29.7% → **21.5%** |

It does exactly what it should to VOLUME — 4.25 attempts a match is a real striker's game rather
than six — and nothing at all to the slope: 3.1x from 55 to 85 before, 3.3x after. The same shape as
the bands, and the same shape as the goal-curve midpoint before them.

**So the slope is not in the mix at all.** Three independent ways of changing which chances a
footballer gets all move the level and leave the ratio between a poor player and a great one
untouched, because that ratio is the goal curve's response to `value` and nothing upstream of it can
flatten a curve. The remaining honest options are a curve whose steepness varies with the chance
rather than with the player, or accepting the slope as the game's own exaggeration — and this file
is not the place to decide that on a hunch. What it can now say is that four levers have been priced
and none of them is free.

Recorded rather than acted on, for the reason the goal-curve fix established: it moves every career
in progress. The difference is that it can now be priced before it is chosen.

### Both of auto-play's own constants are innocent

Recorded because it was attempted and measured rather than reasoned about, and because the obvious
next step turned out not to exist.

The narrowing gap above looked like it should be fixable inside `AutoPlay.ts`, by stopping the
policy's tempo from scaling with the player. `autoTimeUsed` reads
`0.08 + sharp * 0.17`, where `sharp` is the player's own awareness and anticipation — which looks
like exactly the wrong thing to scale with ability, since the early-decision bonus is what READING
the situation buys and reading it is what auto-play stands in for the absence of.

It was flattened to a constant and measured. **It changed nothing**: the auto-play share of a
perfect read stayed at 76% / 88% / 98% against 76% / 90% / 99%. The arithmetic says why, and it is
the sort of thing only arithmetic says — `sharp` never approaches either end of its range for a real
footballer, so across a whole career the term spans **17.4% to 22.5%**, a five-point swing in how
often one of three tempo bands is hit. It could never have produced the effect.

That is now both of auto-play's candidate levers ruled out by measurement: `AUTO_SHARPNESS` moves
the rating by at most 0.02, and the tempo term by nothing at all. **The convergence is the engine's
too** — at high ability the goal curve is saturated enough that most options convert, so the
decision genuinely stops mattering. The candidate curve above moves auto-play from 99% of a perfect
read to 92%, which is the same fix arriving from the other direction.

The change was written, measured, and reverted rather than kept. A constant that is right in
principle and does nothing in practice is not worth the one thing it would have cost: skipped
matches are deterministic from their seed, and altering how the policy consumes its rng changes the
result of every future skipped match in every career in progress. That is a real price, and there
was nothing on the other side of it.

### Every item anybody reported is closed

All fourteen items in [CHANGELOG.md](CHANGELOG.md) are now done — thirteen raised from playing the
game and one found while measuring another.

**Item 11 was the last, and it closed by being answered differently from how it was asked.** It
wanted the career score penalised for skipped matches and an easy decision pace. The counting half
landed in v18 because a counter can only count forward; the scoring half sat open for a long time
because it needs a number nobody can honestly produce — there is no exchange rate between an hour of
somebody's attention and a point on a wall. It is settled as a **label** instead, which needed no
such number and was all the request actually wanted: for a career played out at Hardcore and one
skipped from start to finish not to look identical. See
[How much of it you actually played](README.md#how-much-of-it-you-actually-played).
