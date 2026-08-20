import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { TEAMS, getTeam, teamsInCountry } from '../src/data/gameData.ts';
import '../src/data/gameData.ts';
import {
  CUP_KINDS,
  CUP_ROUNDS,
  applyPlayerResult,
  advanceCupTo,
  backgroundCup,
  backgroundCupWinner,
  closeRound,
  createCup,
  cupName,
  drawRound,
  finishCup,
  openRound,
  opponentIn,
  resolveTie,
  roundName,
  stillIn,
  tieFor,
  totalRounds,
} from '../src/core/career/cups.ts';
import type { CupState } from '../src/core/career/cups.ts';
import {
  LEAGUE_CUP_SCHEDULE,
  NATIONAL_CUP_SCHEDULE,
  calendarLength,
  competitionLabel,
  isCup,
  knockoutRoundsPlayed,
  maximumMatches,
  seasonCalendar,
} from '../src/core/career/calendar.ts';
import { EUROPEAN_TIERS } from '../src/core/career/europe.ts';
import {
  GROUP_ROUNDS,
  INTERNATIONAL,
  MAX_INTERNATIONAL_MATCHES,
} from '../src/core/career/international.ts';

const lookup = (id: string) => getTeam(id);
const ENGLAND = teamsInCountry('england').map((t) => t.id);

function freshCup(kind: 'nationalCup' | 'leagueCup' = 'nationalCup'): CupState {
  return createCup(kind, 'england', ENGLAND);
}

describe('naming a knockout', () => {
  it('names rounds from the end, so the last tie is always the final', () => {
    expect(roundName(4)).toBe('Final');
    expect(roundName(3)).toBe('Semi-final');
    expect(roundName(2)).toBe('Quarter-final');
    // Early rounds get an ordinal, because these read in running prose.
    expect(roundName(1)).toBe('First round');
    expect(roundName(1, 6)).toBe('First round');
    expect(roundName(2, 6)).toBe('Second round');
  });

  it('names a smaller cup correctly too', () => {
    expect(roundName(2, 2)).toBe('Final');
    expect(roundName(1, 2)).toBe('Semi-final');
  });

  it('names the cup after the country it is played in', () => {
    expect(cupName('nationalCup', 'england')).toBe('The English Cup');
    expect(cupName('leagueCup', 'spain')).toBe('The Spanish League Cup');
  });

  it('works out how many rounds sixteen clubs take', () => {
    expect(totalRounds(freshCup())).toBe(CUP_ROUNDS);
  });
});

describe('the draw', () => {
  it('pairs everybody exactly once', () => {
    const cup = freshCup();
    const round = drawRound(new Rng('draw'), cup);
    expect(round.ties).toHaveLength(8);

    const involved = round.ties.flatMap((tie) => [tie.homeId, tie.awayId]);
    expect(new Set(involved).size).toBe(16);
    for (const id of ENGLAND) expect(involved).toContain(id);
  });

  it('never draws a club against itself', () => {
    for (let seed = 0; seed < 20; seed++) {
      const round = drawRound(new Rng(`s${seed}`), freshCup());
      for (const tie of round.ties) expect(tie.homeId).not.toBe(tie.awayId);
    }
  });

  it('is open: the two strongest clubs can and do meet early', () => {
    // Seeding would make the cup a second, shorter league. Across many draws
    // the top two must sometimes be paired in the first round.
    const [best, second] = [...ENGLAND].sort(
      (a, b) => getTeam(b).ratings.attack - getTeam(a).ratings.attack,
    );
    let met = 0;
    for (let seed = 0; seed < 200; seed++) {
      const round = drawRound(new Rng(`open${seed}`), freshCup());
      const tie = tieFor(round, best!)!;
      if (opponentIn(tie, best!) === second) met += 1;
    }
    expect(met).toBeGreaterThan(0);
  });

  it('is deterministic from its rng', () => {
    expect(drawRound(new Rng('same'), freshCup())).toEqual(
      drawRound(new Rng('same'), freshCup()),
    );
  });

  it('carries an odd club through rather than dropping it', () => {
    const odd = createCup('nationalCup', 'england', ENGLAND.slice(0, 5));
    const round = drawRound(new Rng('odd'), odd);
    const involved = round.ties.flatMap((tie) => [tie.homeId, tie.awayId]);
    expect(new Set(involved).size).toBe(5);
    // The bye is already resolved, so it goes through untouched.
    expect(round.ties.filter((tie) => tie.homeId === tie.awayId)).toHaveLength(1);
  });
});

describe('settling a tie', () => {
  const home = getTeam('castleford-royals');
  const away = getTeam('stapleton-vale');

  it('always produces a winner, because a knockout cannot be drawn', () => {
    for (let seed = 0; seed < 60; seed++) {
      const tie = resolveTie(new Rng(`t${seed}`), { homeId: home.id, awayId: away.id }, home, away);
      expect(tie.winnerId).toBeTruthy();
      expect([home.id, away.id]).toContain(tie.winnerId);
    }
  });

  it('goes to penalties only when the ninety minutes were level', () => {
    for (let seed = 0; seed < 60; seed++) {
      const tie = resolveTie(new Rng(`p${seed}`), { homeId: home.id, awayId: away.id }, home, away);
      expect(tie.penalties).toBe(tie.homeGoals === tie.awayGoals);
    }
  });

  it('lets the underdog win a shootout, so a knockout is worth playing', () => {
    // A shootout the favourite always won would remove the reason knockouts
    // exist at all. Counted over the ties that ACTUALLY went to penalties —
    // resolveTie plays its own ninety minutes, so a level score cannot be
    // forced by passing one in.
    let shootouts = 0;
    let underdogWins = 0;
    for (let seed = 0; seed < 600; seed++) {
      const tie = resolveTie(new Rng(`s${seed}`), { homeId: home.id, awayId: away.id }, home, away);
      if (!tie.penalties) continue;
      shootouts += 1;
      if (tie.winnerId === away.id) underdogWins += 1;
    }
    expect(shootouts).toBeGreaterThan(20);
    expect(underdogWins).toBeGreaterThan(0);
    // ...and the favourite still has the edge it has earned.
    expect(underdogWins).toBeLessThan(shootouts);
  });

  it('leaves an already-decided tie alone', () => {
    const decided = { homeId: home.id, awayId: away.id, homeGoals: 2, awayGoals: 0, winnerId: home.id };
    expect(resolveTie(new Rng('x'), decided, home, away)).toEqual(decided);
  });
});

describe('running a cup', () => {
  it('halves the field every round and ends with one club standing', () => {
    const cup = freshCup();
    const sizes: number[] = [cup.survivors.length];
    finishCup(new Rng('run'), cup, lookup);
    expect(cup.rounds).toHaveLength(CUP_ROUNDS);
    for (const round of cup.rounds) {
      sizes.push(round.ties.length);
      for (const tie of round.ties) expect(tie.winnerId).toBeTruthy();
    }
    expect(sizes).toEqual([16, 8, 4, 2, 1]);
    expect(cup.winnerId).toBeTruthy();
    expect(cup.survivors).toHaveLength(1);
  });

  it('only ever advances clubs that actually won a tie', () => {
    const cup = freshCup();
    finishCup(new Rng('honest'), cup, lookup);
    for (let i = 1; i < cup.rounds.length; i++) {
      const previous = cup.rounds[i - 1]!.ties.map((tie) => tie.winnerId!);
      const involved = cup.rounds[i]!.ties.flatMap((tie) => [tie.homeId, tie.awayId]);
      for (const id of involved) expect(previous).toContain(id);
    }
  });

  it('is deterministic from its seed', () => {
    const a = freshCup();
    const b = freshCup();
    finishCup(new Rng('same'), a, lookup);
    finishCup(new Rng('same'), b, lookup);
    expect(a.winnerId).toBe(b.winnerId);
    expect(a.rounds).toEqual(b.rounds);
  });

  it('produces different winners from different seeds', () => {
    const winners = new Set<string>();
    for (let seed = 0; seed < 25; seed++) {
      const cup = freshCup();
      finishCup(new Rng(`w${seed}`), cup, lookup);
      winners.add(cup.winnerId!);
    }
    expect(winners.size).toBeGreaterThan(3);
  });

  it('favours the stronger clubs without guaranteeing them', () => {
    const strongest = [...ENGLAND].sort(
      (a, b) => getTeam(b).ratings.attack - getTeam(a).ratings.attack,
    )[0]!;
    let wins = 0;
    for (let seed = 0; seed < 100; seed++) {
      const cup = freshCup();
      finishCup(new Rng(`f${seed}`), cup, lookup);
      if (cup.winnerId === strongest) wins += 1;
    }
    // More than its one-in-sixteen share, and a long way short of every time.
    expect(wins).toBeGreaterThan(6);
    expect(wins).toBeLessThan(70);
  });
});

describe('the player in a cup', () => {
  const club = ENGLAND[0]!;

  it('leaves the player\'s tie for him and settles the rest', () => {
    const cup = freshCup();
    const round = openRound({ rng: new Rng('open'), cup, lookup, playerClubId: club });

    const own = tieFor(round, club)!;
    expect(own.winnerId).toBeUndefined();
    for (const tie of round.ties) {
      if (tie === own) continue;
      expect(tie.winnerId).toBeTruthy();
    }
  });

  it('carries him through when he wins, and knocks him out when he does not', () => {
    for (const [goalsFor, goalsAgainst, through] of [[2, 0, true], [0, 2, false]] as const) {
      const cup = freshCup();
      openRound({ rng: new Rng('r1'), cup, lookup, playerClubId: club });
      applyPlayerResult(new Rng('res'), cup, { clubId: club, goalsFor, goalsAgainst, lookup });
      closeRound(cup, club);

      expect(stillIn(cup, club)).toBe(through);
      expect(cup.eliminatedInRound).toBe(through ? null : 1);
    }
  });

  it('settles his tie from the spot when it finishes level', () => {
    const cup = freshCup();
    const round = openRound({ rng: new Rng('level'), cup, lookup, playerClubId: club });
    const tie = applyPlayerResult(new Rng('pens'), cup, {
      clubId: club,
      goalsFor: 1,
      goalsAgainst: 1,
      lookup,
    });
    expect(tie.penalties).toBe(true);
    expect(tie.winnerId).toBeTruthy();
    expect(round.ties.every((t) => t.winnerId)).toBe(true);
  });

  it('refuses to close a round that still has an unresolved tie', () => {
    const cup = freshCup();
    openRound({ rng: new Rng('half'), cup, lookup, playerClubId: club });
    expect(() => closeRound(cup, club)).toThrow(/unresolved/);
  });

  it('records the round he went out in, and keeps it once set', () => {
    const cup = freshCup();
    openRound({ rng: new Rng('a'), cup, lookup, playerClubId: club });
    applyPlayerResult(new Rng('a'), cup, { clubId: club, goalsFor: 3, goalsAgainst: 0, lookup });
    closeRound(cup, club);
    expect(cup.eliminatedInRound).toBeNull();

    openRound({ rng: new Rng('b'), cup, lookup, playerClubId: club });
    applyPlayerResult(new Rng('b'), cup, { clubId: club, goalsFor: 0, goalsAgainst: 1, lookup });
    closeRound(cup, club);
    expect(cup.eliminatedInRound).toBe(2);

    // The cup runs on without him and still finds a winner.
    finishCup(new Rng('rest'), cup, lookup);
    expect(cup.winnerId).toBeTruthy();
    expect(cup.winnerId).not.toBe(club);
    expect(cup.eliminatedInRound).toBe(2);
  });
});

describe('a cup nobody was watching', () => {
  it('produces a winner for any country, from the seed alone', () => {
    const winner = backgroundCupWinner('seed', 3, 'nationalCup', 'spain', teamsInCountry('spain').map((t) => t.id), lookup);
    expect(winner).toBeTruthy();
    expect(teamsInCountry('spain').map((t) => t.id)).toContain(winner!);
  });

  it('gives the same answer every time it is asked', () => {
    const ask = () =>
      backgroundCupWinner('seed', 3, 'leagueCup', 'italy', teamsInCountry('italy').map((t) => t.id), lookup);
    expect(ask()).toBe(ask());
  });

  it('gives the two cups different winners more often than not', () => {
    let differ = 0;
    for (let season = 0; season < 20; season++) {
      const ids = teamsInCountry('germany').map((t) => t.id);
      const a = backgroundCupWinner('s', season, 'nationalCup', 'germany', ids, lookup);
      const b = backgroundCupWinner('s', season, 'leagueCup', 'germany', ids, lookup);
      if (a !== b) differ += 1;
    }
    expect(differ).toBeGreaterThan(10);
  });

  it('returns nothing for a country with no clubs rather than throwing', () => {
    expect(backgroundCupWinner('s', 1, 'nationalCup', 'atlantis', [], lookup)).toBeNull();
  });
});

describe('a cup shown as far as it has got', () => {
  const spain = teamsInCountry('spain').map((t) => t.id);

  it('stops after the rounds asked for', () => {
    const cup = createCup('nationalCup', 'spain', spain);
    advanceCupTo(new Rng('partial'), cup, lookup, 2);
    expect(cup.rounds).toHaveLength(2);
    expect(cup.winnerId).toBeNull();
    expect(cup.survivors).toHaveLength(4);
  });

  it('is a prefix of the same cup run all the way out', () => {
    // The property the whole background model rests on: a cup recomputed on
    // demand in October has to agree with the one recomputed in May, or the
    // world would rewrite its own history every time somebody looked at it.
    const partial = createCup('nationalCup', 'spain', spain);
    advanceCupTo(new Rng('same'), partial, lookup, 2);

    const full = createCup('nationalCup', 'spain', spain);
    finishCup(new Rng('same'), full, lookup);

    expect(full.rounds.slice(0, 2)).toEqual(partial.rounds);
  });

  it('runs a background cup only to the round the season has reached', () => {
    const early = backgroundCup('seed', 4, 'nationalCup', 'spain', spain, lookup, 1);
    expect(early.rounds).toHaveLength(1);
    expect(early.winnerId).toBeNull();

    const done = backgroundCup('seed', 4, 'nationalCup', 'spain', spain, lookup);
    expect(done.winnerId).toBeTruthy();
    expect(done.rounds.slice(0, 1)).toEqual(early.rounds);
  });

  it('agrees with the winner the qualification model is given', () => {
    const bracket = backgroundCup('seed', 2, 'leagueCup', 'italy', teamsInCountry('italy').map((t) => t.id), lookup);
    const winner = backgroundCupWinner('seed', 2, 'leagueCup', 'italy', teamsInCountry('italy').map((t) => t.id), lookup);
    expect(bracket.winnerId).toBe(winner);
  });

  it('hands back an empty bracket for a country with no clubs', () => {
    const cup = backgroundCup('s', 1, 'nationalCup', 'atlantis', [], lookup);
    expect(cup.rounds).toHaveLength(0);
    expect(cup.winnerId).toBeNull();
  });
});

describe('how far into a knockout the season is', () => {
  it('counts a cup round as played once the league round it follows is', () => {
    // The national cup's first round is played after league round 5.
    const first = NATIONAL_CUP_SCHEDULE[0]!;
    expect(knockoutRoundsPlayed('nationalCup', 30, first - 1)).toBe(0);
    expect(knockoutRoundsPlayed('nationalCup', 30, first)).toBe(1);
  });

  it('reaches every round by the end of the season', () => {
    for (const kind of CUP_KINDS) {
      expect(knockoutRoundsPlayed(kind, 30, 30)).toBe(CUP_ROUNDS);
    }
    for (const tier of EUROPEAN_TIERS) {
      expect(knockoutRoundsPlayed(tier, 30, 30)).toBe(CUP_ROUNDS);
    }
  });

  it('never goes backwards as the season runs on', () => {
    let previous = 0;
    for (let round = 0; round <= 30; round++) {
      const played = knockoutRoundsPlayed('leagueCup', 30, round);
      expect(played).toBeGreaterThanOrEqual(previous);
      previous = played;
    }
    expect(previous).toBe(CUP_ROUNDS);
  });

  it('treats a finished season as having reached everything', () => {
    expect(knockoutRoundsPlayed('nationalCup', 30, Number.POSITIVE_INFINITY)).toBe(CUP_ROUNDS);
  });

  it('still reaches every round in a league too short for the schedule', () => {
    // The schedules are clamped into a short league rather than dropping off
    // the end of it, and reading the calendar is what keeps this honest.
    expect(knockoutRoundsPlayed('nationalCup', 6, 6)).toBe(CUP_ROUNDS);
  });
});

describe('the season calendar', () => {
  const calendar = seasonCalendar(30);

  it('runs every league round in order', () => {
    const league = calendar.filter((slot) => slot.competition === 'league');
    expect(league).toHaveLength(30);
    expect(league.map((slot) => slot.round)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it('gives both cups all their rounds', () => {
    for (const kind of CUP_KINDS) {
      const rounds = calendar.filter((slot) => slot.competition === kind);
      expect(rounds, kind).toHaveLength(CUP_ROUNDS);
      expect(rounds.map((slot) => slot.round)).toEqual([1, 2, 3, 4]);
    }
  });

  it('holds a slot for every European tier, only one of which is ever playable', () => {
    // The calendar cannot know which European competition a club is in — it is
    // a pure function of the league's length — so it carries all three on the
    // same dates and the walk skips the two that are not the player's.
    expect(calendar).toHaveLength(calendarLength(30));
    for (const tier of EUROPEAN_TIERS) {
      expect(calendar.filter((slot) => slot.competition === tier), tier).toHaveLength(CUP_ROUNDS);
    }
  });

  it('is the longest a season can be: league, both cups, Europe and a country', () => {
    // 30 league + 4 national cup + 4 league cup + 4 European + 6 international,
    // the six being a World Cup, which runs a knockout round deeper than a
    // continental championship.
    expect(maximumMatches(30)).toBe(30 + 4 + 4 + 4 + MAX_INTERNATIONAL_MATCHES);
    expect(maximumMatches(30)).toBeLessThan(calendarLength(30));
  });

  it('plays the international tournament after the last league round', () => {
    // A season should end on a semi-final for your country, not before one.
    const lastLeague = calendar.map((s) => s.competition).lastIndexOf('league');
    const knockoutSlots = calendar
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.competition === INTERNATIONAL && slot.round > GROUP_ROUNDS);
    // The calendar holds the LONGEST tournament there is, because it is a pure
    // function of the league's length and cannot know which one is being played
    // — the same reason it carries a slot for all three European competitions.
    expect(knockoutSlots).toHaveLength(MAX_INTERNATIONAL_MATCHES - GROUP_ROUNDS);
    for (const { index } of knockoutSlots) expect(index).toBeGreaterThan(lastLeague);
  });

  it('spreads the group matches through the season, not into the tournament', () => {
    const groupSlots = calendar
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.competition === INTERNATIONAL && slot.round <= GROUP_ROUNDS);
    expect(groupSlots).toHaveLength(GROUP_ROUNDS);
    const lastLeague = calendar.map((s) => s.competition).lastIndexOf('league');
    for (const { index } of groupSlots) expect(index).toBeLessThan(lastLeague);
  });

  it('never schedules the two cups in the same slot', () => {
    expect(new Set(NATIONAL_CUP_SCHEDULE).size).toBe(CUP_ROUNDS);
    for (const round of NATIONAL_CUP_SCHEDULE) {
      expect(LEAGUE_CUP_SCHEDULE).not.toContain(round);
    }
  });

  it('spreads the cups through the season rather than bunching them', () => {
    const positions = CUP_KINDS.flatMap((kind) =>
      calendar.map((slot, i) => (slot.competition === kind ? i : -1)).filter((i) => i >= 0),
    );
    expect(Math.min(...positions)).toBeGreaterThan(3);
    // The season does not end on a cup tie the player may not even be in.
    expect(Math.max(...positions)).toBeLessThan(calendar.length - 1);
  });

  it('keeps every cup round inside a short league too', () => {
    // A league of a different size must not lose a cup round off the end.
    for (const rounds of [6, 10, 14, 30, 38]) {
      const short = seasonCalendar(rounds);
      for (const kind of CUP_KINDS) {
        expect(short.filter((slot) => slot.competition === kind), `${rounds}/${kind}`).toHaveLength(
          CUP_ROUNDS,
        );
      }
      expect(short.filter((slot) => slot.competition === 'league')).toHaveLength(rounds);
    }
  });

  it('labels competitions for a screen', () => {
    expect(competitionLabel('league')).toBe('League');
    expect(competitionLabel('nationalCup')).toBe('Cup');
    expect(competitionLabel('leagueCup')).toBe('League Cup');
    expect(isCup('league')).toBe(false);
    expect(isCup('nationalCup')).toBe(true);
  });
});

describe('the world of cups', () => {
  it('has a cup for every country in it', () => {
    for (const team of TEAMS.slice(0, 8)) {
      expect(cupName('nationalCup', team.country)).toContain('Cup');
    }
  });
});
