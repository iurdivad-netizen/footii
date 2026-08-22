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

**11. The career score should be penalised for skipped matches and for a generous pace.**
Right in principle: a career built on skipped matches at no time limit is not the same career as one
played out at Hardcore, and `careerScore` still cannot tell them apart. **The counting half is now
done; the scoring half is not.**

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

What is still open is the judgement call: how much a skipped match should cost, how much a generous
pace should, and whether a career with too little recorded football should be scored on this at all.
That part is genuinely better late, and it is now the only part left.

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

## Found while reviewing, and fixed

Three things that were not on either list, found by reading the code against what it claimed:

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
- **A browser that could not save said nothing about it.** Every write failure was swallowed, so a
  career could be played to its end in a browser keeping none of it. Failures now raise a warning
  above every screen, and offer the export that makes them survivable. See [When the browser will not save](README.md#when-the-browser-will-not-save).
