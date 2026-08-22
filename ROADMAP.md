# Roadmap

What is still to build, and why in this order.

Everything already built is in [CHANGELOG.md](CHANGELOG.md); how the game works and why it is
built the way it is stays in [README.md](README.md).

The four agreed stages — a world of countries, domestic cups, European competitions and
international football — are all done, and so is the end of the loop: a career can now finish, and
finishing one leaves something behind.

What remains, **ordered by what it unblocks rather than by size**. The first item is the one every
other item on this list is waiting for.

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

5. **Richer location model** — the tactical zone model is designed to be swapped for 2D coordinates
   behind the same `Zone` interface. Deliberately last: nothing else is waiting on it, and it is
   worth more once there are teammates to have positions.

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

What remains on the RPG side, roughly in the order it is worth doing: **the rival's arc** (he ages
and nothing else; selling him when you beat him would make the club feel populated), **tendency and
position retraining**, so a thirty-one-year-old can become the deep-lying version of himself, and
**a background at creation**.

## The one thing still open

Of the fourteen items in [CHANGELOG.md](CHANGELOG.md) — thirteen raised from playing the game and one
found while measuring another — thirteen are done and the fourteenth is half done.

Items 13 and 14, the injury rate and what a week of extra work costs, went from raised to measured
to fixed in one sitting, and the middle step is the one worth keeping: the tool that measured them
([`scripts/measureInjuries.ts`](scripts/measureInjuries.ts)) is committed, because injuries are the
one part of this game nobody can judge by reading the code. See [Age, at both ends](README.md#age-at-both-ends) and [The gate](README.md#the-gate-and-why-a-smaller-number-would-not-have-done).

**[Item 11](CHANGELOG.md#reported-bugs-and-improvements) — penalties on the end-of-career score for skipped matches and an easy decision pace.** The
item split cleanly into a cheap half that had to happen early and an expensive half that is better
late, and only the second is outstanding:

- **Counting — done.** `CareerState.howPlayed` records skipped matches, played matches and the pace
  each played match was played at, from v18 onward. This is the half that could not wait, because a
  counter can only ever count forward.
- **Scoring — open.** Nothing reads the counts yet. Deciding what a skipped match costs, and what a
  generous pace costs, is a balance judgement that wants a few real careers' worth of data behind
  it — which, now that the data is being collected, is a matter of playing rather than of writing
  anything. It is also a larger job than when it was listed, since the pace settings it would read
  are no longer the ones it was written against — see [The decision window, rescaled](README.md#the-decision-window-rescaled).
