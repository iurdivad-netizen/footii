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

What is still open on the interface: **choosing a club at setup is a 192-item dropdown** that
truncates mid-word and says nothing about any of them, although the game models whether each would
sign you, trial you or ignore you.

What remains on the RPG side: **tendency and position retraining**, so a thirty-one-year-old can
become the deep-lying version of himself, **a background at creation**, and a **full squad** — a
readable XI and squad numbers — which is flavour rather than mechanism and blocks nothing.

One thing found while measuring and deliberately not acted on: **auto-play scores far too much.**
A skipped match resolves at 1.0 goals a match at ability 55 and **2.9 at ability 85**, with an
average rating of 9.4 — so "let him play it" produces a superhuman career, and it distorts the
golden boot, the record book and the wall of fame. Retuning it would move every career already
played, so it is recorded here rather than changed.

## Nothing is still open

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

What is left is the three roadmap items above — a second division, a playable goalkeeper, a richer
location model — plus the RPG work listed with them, and one balance question recorded but
deliberately untouched.
