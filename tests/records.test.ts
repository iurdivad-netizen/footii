import { describe, expect, it } from 'vitest';
import {
  PERFECT_RATING,
  averageOf,
  breakStreaks,
  createCareerRecords,
  lifetimeTotals,
  milestones,
  recordMatch,
  recordSeason,
} from '../src/core/career/records.ts';
import type { CareerRecords, MatchRecordInput } from '../src/core/career/records.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import type { CompetitionKind } from '../src/core/career/calendar.ts';

/**
 * CAREER RECORDS
 *
 * What these are actually checking is that a career's PEAKS survive being
 * counted. Totals are easy and already covered elsewhere; the failure mode here
 * is a hat-trick counted as a brace, a run that quietly spans a summer, or a
 * milestone list padded with zeroes nobody wanted to read.
 */

/** One match, with sensible defaults so a test names only what it cares about. */
function match(overrides: Partial<MatchRecordInput> = {}): MatchRecordInput {
  return { competition: 'league', goals: 0, assists: 0, rating: 6.5, result: 0, ...overrides };
}

/** Play a list of matches into a fresh record book. */
function play(matches: readonly Partial<MatchRecordInput>[]): CareerRecords {
  const records = createCareerRecords();
  for (const m of matches) recordMatch(records, match(m));
  return records;
}

describe('goals in a single match', () => {
  it('counts a brace, a hat-trick, a four and a five apart from each other', () => {
    const records = play([
      { goals: 0 },
      { goals: 1 },
      { goals: 2 },
      { goals: 2 },
      { goals: 3 },
      { goals: 4 },
      { goals: 5 },
      { goals: 7 },
    ]);
    expect(records.hauls.braces).toBe(2);
    expect(records.hauls.hatTricks).toBe(1);
    expect(records.hauls.fourGoalGames).toBe(1);
    // Five and seven both land in the same bucket: past five it is one story.
    expect(records.hauls.fivePlusGoalGames).toBe(2);
  });

  it('never counts one afternoon in two buckets', () => {
    const records = play([{ goals: 3 }]);
    const { braces, hatTricks, fourGoalGames, fivePlusGoalGames } = records.hauls;
    expect(braces + hatTricks + fourGoalGames + fivePlusGoalGames).toBe(1);
  });

  it('remembers the biggest haul, and does not lower it afterwards', () => {
    const records = play([{ goals: 2 }, { goals: 6 }, { goals: 1 }]);
    expect(records.hauls.best).toBe(6);
  });

  it('counts goals and assists together at their highest', () => {
    const records = play([
      { goals: 3, assists: 0 },
      { goals: 1, assists: 3 },
      { goals: 2, assists: 1 },
    ]);
    expect(records.bestContributionsInAMatch).toBe(4);
  });

  it('leaves a goalless career with nothing to boast about', () => {
    const records = play([{ goals: 0 }, { goals: 0 }, { goals: 1 }]);
    expect(records.hauls.braces).toBe(0);
    expect(records.hauls.best).toBe(1);
    expect(records.bestContributionsInAMatch).toBe(1);
  });
});

describe('match ratings', () => {
  it('counts a perfect ten', () => {
    const records = play([{ rating: 10 }, { rating: 9.9 }, { rating: 9.2 }]);
    expect(records.ratings.perfect).toBe(1);
  });

  it('treats the thresholds as floors, so a ten counts everywhere below it', () => {
    const records = play([{ rating: 10 }]);
    expect(records.ratings.perfect).toBe(1);
    expect(records.ratings.nineOrBetter).toBe(1);
    expect(records.ratings.eightOrBetter).toBe(1);
  });

  it('nests the bands, so nines are a subset of eights', () => {
    const records = play([{ rating: 8.2 }, { rating: 9.1 }, { rating: 9.6 }, { rating: 7.9 }]);
    expect(records.ratings.eightOrBetter).toBe(3);
    expect(records.ratings.nineOrBetter).toBe(2);
    expect(records.ratings.eightOrBetter).toBeGreaterThanOrEqual(records.ratings.nineOrBetter);
  });

  it('does not lose a ten to floating point', () => {
    // The reason PERFECT_RATING is a threshold and not an equality test.
    const records = play([{ rating: 9.999999 }, { rating: PERFECT_RATING }]);
    expect(records.ratings.perfect).toBe(2);
  });

  it('remembers the highest rating ever given, to one decimal', () => {
    const records = play([{ rating: 7.24 }, { rating: 8.66 }, { rating: 6 }]);
    expect(records.ratings.best).toBe(8.7);
  });
});

describe('runs of matches', () => {
  it('counts consecutive scoring matches and ends the run on a blank', () => {
    const records = play([
      { goals: 1 },
      { goals: 2 },
      { goals: 1 },
      { goals: 0 },
      { goals: 1 },
      { goals: 1 },
    ]);
    expect(records.scoringStreak.longest).toBe(3);
    expect(records.scoringStreak.current).toBe(2);
  });

  it('keeps the longest run even once it is over', () => {
    const records = play([{ goals: 1 }, { goals: 1 }, { goals: 1 }, { goals: 0 }]);
    expect(records.scoringStreak.longest).toBe(3);
    expect(records.scoringStreak.current).toBe(0);
  });

  it('counts a draw as unbeaten and a defeat as the end of it', () => {
    const records = play([
      { result: 1 },
      { result: 0 },
      { result: 1 },
      { result: -1 },
      { result: 1 },
    ]);
    expect(records.unbeatenStreak.longest).toBe(3);
    expect(records.unbeatenStreak.current).toBe(1);
  });

  it('does not let a run span a summer or a transfer', () => {
    // "Eleven in a row" has to mean eleven consecutive matches for one side.
    const records = play([{ goals: 1 }, { goals: 1 }, { goals: 1 }]);
    breakStreaks(records);
    recordMatch(records, match({ goals: 1 }));
    expect(records.scoringStreak.current).toBe(1);
    expect(records.scoringStreak.longest).toBe(3);
  });

  it('breaking a run does not erase what was already achieved', () => {
    const records = play([{ goals: 1, result: 1 }, { goals: 1, result: 1 }]);
    breakStreaks(records);
    expect(records.scoringStreak.longest).toBe(2);
    expect(records.unbeatenStreak.longest).toBe(2);
    expect(records.unbeatenStreak.current).toBe(0);
  });
});

describe('where it happened', () => {
  it('splits totals by competition', () => {
    const records = play([
      { competition: 'league', goals: 1, assists: 1, rating: 7 },
      { competition: 'league', goals: 2, rating: 8 },
      { competition: 'championsLeague', goals: 3, rating: 9 },
      { competition: 'nationalCup', goals: 0, rating: 6 },
    ]);
    expect(records.byCompetition.league).toEqual({
      matches: 2,
      goals: 3,
      assists: 1,
      ratingTotal: 15,
    });
    expect(records.byCompetition.championsLeague?.goals).toBe(3);
    expect(records.byCompetition.nationalCup?.matches).toBe(1);
  });

  it('says nothing at all about a competition never played in', () => {
    const records = play([{ competition: 'league' }]);
    expect(records.byCompetition.europaLeague).toBeUndefined();
  });

  it('adds the split back up to the whole career', () => {
    const competitions: CompetitionKind[] = [
      'league',
      'nationalCup',
      'leagueCup',
      'championsLeague',
      'europaLeague',
      'conferenceLeague',
    ];
    const records = play(
      competitions.map((competition, i) => ({
        competition,
        goals: i,
        assists: 1,
        rating: 7,
      })),
    );
    const total = lifetimeTotals(records);
    expect(total.matches).toBe(competitions.length);
    expect(total.goals).toBe(0 + 1 + 2 + 3 + 4 + 5);
    expect(total.assists).toBe(competitions.length);
    expect(averageOf(total)).toBe(7);
  });

  it('reports no average rather than dividing by nothing', () => {
    expect(averageOf({ matches: 0, goals: 0, assists: 0, ratingTotal: 0 })).toBe(0);
    expect(lifetimeTotals(createCareerRecords()).matches).toBe(0);
  });
});

describe('seasons', () => {
  const season = (goals: number) => ({ ...createSeasonStats(), matches: 30, goals });

  it('counts ten- and twenty-goal seasons, a twenty being both', () => {
    const records = createCareerRecords();
    recordSeason(records, season(9));
    recordSeason(records, season(10));
    recordSeason(records, season(24));
    expect(records.tenGoalSeasons).toBe(2);
    expect(records.twentyGoalSeasons).toBe(1);
  });

  it('remembers the best season and never lowers it', () => {
    const records = createCareerRecords();
    recordSeason(records, season(24));
    recordSeason(records, season(11));
    expect(records.bestSeasonGoals).toBe(24);
  });
});

describe('the record book as something worth reading', () => {
  it('leaves out everything that never happened', () => {
    const records = play([{ goals: 1, rating: 7 }]);
    const labels = milestones(records).map((m) => m.label);
    // A career with no hat-trick should not be told it has none.
    expect(labels).not.toContain('Hat-tricks');
    expect(labels).not.toContain('Perfect tens');
    expect(labels).not.toContain('Five or more');
  });

  it('has nothing to say about a career that has not started', () => {
    expect(milestones(createCareerRecords())).toEqual([]);
  });

  it('shows a milestone once it has happened, with its count', () => {
    const records = play([{ goals: 3, rating: 10 }, { goals: 3, rating: 9 }]);
    const found = milestones(records).find((m) => m.label === 'Hat-tricks');
    expect(found?.value).toBe(2);
    expect(found?.note).toBeTruthy();
    expect(milestones(records).find((m) => m.label === 'Perfect tens')?.value).toBe(1);
  });

  it('says a run is still going while it is still going', () => {
    const records = play([{ goals: 1 }, { goals: 1 }, { goals: 1 }]);
    const run = milestones(records).find((m) => m.label === 'Longest scoring run');
    expect(run?.value).toBe(3);
    expect(run?.note).toContain('Currently on 3');
  });

  it('stops calling a finished run current', () => {
    const records = play([{ goals: 1 }, { goals: 1 }, { goals: 0 }]);
    const run = milestones(records).find((m) => m.label === 'Longest scoring run');
    expect(run?.note).not.toContain('Currently');
  });

  it('gives every line a label and a note', () => {
    const records = play([
      { goals: 5, rating: 10 },
      { goals: 2, rating: 9 },
      { goals: 1, rating: 8 },
      { goals: 4, rating: 8.5 },
      { goals: 3, rating: 7 },
    ]);
    recordSeason(records, { ...createSeasonStats(), goals: 22 });
    const list = milestones(records);
    expect(list.length).toBeGreaterThan(8);
    for (const line of list) {
      expect(line.label, JSON.stringify(line)).toBeTruthy();
      expect(line.note, line.label).toBeTruthy();
      expect(line.value, line.label).toBeGreaterThan(0);
    }
  });
});
