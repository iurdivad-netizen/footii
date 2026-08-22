import { describe, expect, it } from 'vitest';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { recordPlayerMatch, startCareer } from '../src/simulation/CareerService.ts';
import type { CareerState } from '../src/core/career/career.ts';
import {
  APPEARANCE_MILESTONES,
  GOAL_MILESTONES,
  MOMENT_LIMIT,
  SCORING_RUN_MILESTONE,
  momentsFrom,
  rememberMoments,
} from '../src/core/career/moments.ts';
import type { Moment, MomentKind } from '../src/core/career/moments.ts';
import { createCareerRecords, recordMatch } from '../src/core/career/records.ts';
import type { CareerRecords } from '../src/core/career/records.ts';
import { INTERNATIONAL } from '../src/core/career/international.ts';

const lookup = (id: string) => getTeam(id);

/**
 * A record book with `matches` ordinary league matches already in it, so a test
 * can put a career at any point in its life without playing one.
 */
function book(matches: number, goals = 0, assists = 0, rating = 6.8): CareerRecords {
  const records = createCareerRecords();
  for (let i = 0; i < matches; i++) {
    recordMatch(records, {
      competition: 'league',
      goals: i < goals ? 1 : 0,
      assists: i < assists ? 1 : 0,
      rating,
      result: 0,
    });
  }
  return records;
}

function fold(
  before: CareerRecords,
  match: { competition?: 'league' | 'championsLeague' | typeof INTERNATIONAL; goals?: number; assists?: number; rating?: number },
) {
  const after = book(0);
  // Replay the before-book into the after-book so the two share a history.
  Object.assign(after, structuredClone(before));
  recordMatch(after, {
    competition: match.competition ?? 'league',
    goals: match.goals ?? 0,
    assists: match.assists ?? 0,
    rating: match.rating ?? 6.8,
    result: 0,
  });
  return momentsFrom({
    records: after,
    before,
    competition: match.competition ?? 'league',
    goals: match.goals ?? 0,
    assists: match.assists ?? 0,
    rating: match.rating ?? 6.8,
    season: 3,
    opponentName: 'Stapleton Vale',
    againstOldClub: false,
    traits: [],
  });
}

const kinds = (moments: Moment[]): MomentKind[] => moments.map((m) => m.kind);

describe('the things that only happen once', () => {
  it('marks a debut, and only the debut', () => {
    expect(kinds(fold(book(0), {}))).toContain('debut');
    expect(kinds(fold(book(1), {}))).not.toContain('debut');
  });

  it('marks a first goal and a first assist', () => {
    expect(kinds(fold(book(20), { goals: 1 }))).toContain('firstGoal');
    expect(kinds(fold(book(20, 5), { goals: 1 }))).not.toContain('firstGoal');
    expect(kinds(fold(book(20), { assists: 1 }))).toContain('firstAssist');
  });

  it('marks a first European night and a first cap', () => {
    expect(kinds(fold(book(40), { competition: 'championsLeague' }))).toContain(
      'firstEuropeanNight',
    );
    expect(kinds(fold(book(40), { competition: INTERNATIONAL }))).toContain('firstCap');
  });

  it('does not mark a second European night', () => {
    const played = book(40);
    recordMatch(played, {
      competition: 'championsLeague',
      goals: 0,
      assists: 0,
      rating: 7,
      result: 0,
    });
    expect(kinds(fold(played, { competition: 'championsLeague' }))).not.toContain(
      'firstEuropeanNight',
    );
  });
});

describe('the things rare enough to say every time', () => {
  it('marks a hat-trick', () => {
    expect(kinds(fold(book(50, 20), { goals: 3 }))).toContain('hatTrick');
    expect(kinds(fold(book(50, 20), { goals: 2 }))).not.toContain('hatTrick');
  });

  it('marks a perfect ten', () => {
    expect(kinds(fold(book(50), { rating: 10 }))).toContain('perfectRating');
    expect(kinds(fold(book(50), { rating: 9.5 }))).not.toContain('perfectRating');
  });

  it('says nothing at all about an ordinary afternoon', () => {
    // Most matches are this one. A strip that appeared every week would train
    // the eye to skip the week it said something.
    expect(fold(book(120, 40, 20), { goals: 1, rating: 7.1 })).toEqual([]);
  });
});

describe('round numbers', () => {
  it('announces an appearance milestone on the match that crossed it', () => {
    const at99 = fold(book(99), {});
    expect(kinds(at99)).toContain('appearanceMilestone');
    expect(at99.find((m) => m.kind === 'appearanceMilestone')!.text).toContain('100');
    // And not on the one after.
    expect(kinds(fold(book(100), {}))).not.toContain('appearanceMilestone');
  });

  it('announces a goal milestone the same way', () => {
    const at24 = fold(book(200, 24), { goals: 1 });
    expect(at24.find((m) => m.kind === 'goalMilestone')!.text).toContain('25');
  });

  it('never announces the first of either twice, having already said "your first"', () => {
    // 1 is in both milestone lists so the crossing logic is uniform, but the
    // first goal already has a line of its own and two would be a stutter.
    expect(APPEARANCE_MILESTONES[0]).toBe(1);
    expect(GOAL_MILESTONES[0]).toBe(1);
    const debut = kinds(fold(book(0), { goals: 1 }));
    expect(debut).toContain('debut');
    expect(debut).toContain('firstGoal');
    expect(debut).not.toContain('appearanceMilestone');
    expect(debut).not.toContain('goalMilestone');
  });

  it('widens the gaps, so the later ones stay worth reaching', () => {
    const gaps = APPEARANCE_MILESTONES.slice(1).map(
      (value, index) => value - APPEARANCE_MILESTONES[index]!,
    );
    expect(gaps[gaps.length - 1]).toBeGreaterThanOrEqual(gaps[0]!);
  });
});

describe('a run, while it is happening', () => {
  it('says so as it lengthens rather than only when it ends', () => {
    // The interesting part of a scoring run is being ON one.
    const onFour = book(0);
    for (let i = 0; i < 4; i++) {
      recordMatch(onFour, { competition: 'league', goals: 1, assists: 0, rating: 7, result: 0 });
    }
    const fifth = fold(onFour, { goals: 1 });
    expect(kinds(fifth)).toContain('scoringRun');
    expect(fifth.find((m) => m.kind === 'scoringRun')!.text).toContain(
      String(SCORING_RUN_MILESTONE),
    );
  });

  it('says nothing about a run too short to be a story', () => {
    const onOne = book(0);
    recordMatch(onOne, { competition: 'league', goals: 1, assists: 0, rating: 7, result: 0 });
    expect(kinds(fold(onOne, { goals: 1 }))).not.toContain('scoringRun');
  });
});

describe('an old club', () => {
  it('is remarked on, and says whether he scored', () => {
    const quiet = momentsFrom({
      records: book(101),
      before: book(100),
      competition: 'league',
      goals: 0,
      assists: 0,
      rating: 6.5,
      season: 5,
      opponentName: 'Northport City',
      againstOldClub: true,
      traits: [],
    });
    expect(kinds(quiet)).toContain('oldClub');
    expect(quiet.find((m) => m.kind === 'oldClub')!.text).not.toContain('And you scored');

    const loud = momentsFrom({
      records: book(101),
      before: book(100),
      competition: 'league',
      goals: 2,
      assists: 0,
      rating: 8.5,
      season: 5,
      opponentName: 'Northport City',
      againstOldClub: true,
      traits: [],
    });
    expect(loud.find((m) => m.kind === 'oldClub')!.text).toContain('And you scored');
  });
});

describe('becoming something', () => {
  it('is the last thing said, because it is the biggest', () => {
    const moments = momentsFrom({
      records: book(101, 40),
      before: book(100, 40),
      competition: 'league',
      goals: 3,
      assists: 0,
      rating: 9,
      season: 6,
      opponentName: 'Stapleton Vale',
      againstOldClub: false,
      traits: ['poacher'],
    });
    expect(kinds(moments)).toContain('traitEarned');
    expect(moments[moments.length - 1]!.kind).toBe('traitEarned');
  });

  it('names the trait and says what earned it', () => {
    const moments = momentsFrom({
      records: book(101),
      before: book(100),
      competition: 'league',
      goals: 0,
      assists: 0,
      rating: 7,
      season: 6,
      opponentName: 'Stapleton Vale',
      againstOldClub: false,
      traits: ['oldHead'],
    });
    const text = moments.find((m) => m.kind === 'traitEarned')!.text;
    expect(text.toLowerCase()).toContain('old head');
    expect(text.length).toBeGreaterThan(30);
  });
});

describe('what a career keeps', () => {
  const moment = (n: number): Moment => ({ kind: 'hatTrick', text: `#${n}`, season: 1 });

  it('keeps everything until it is full', () => {
    const kept = rememberMoments([moment(1)], [moment(2), moment(3)]);
    expect(kept).toHaveLength(3);
  });

  it('drops the oldest when it fills, which is the wrong way round for a diary', () => {
    const full = Array.from({ length: MOMENT_LIMIT }, (_, i) => moment(i));
    const kept = rememberMoments(full, [moment(999)]);
    expect(kept).toHaveLength(MOMENT_LIMIT);
    expect(kept[kept.length - 1]!.text).toBe('#999');
    expect(kept[0]!.text).toBe('#1');
  });

  it('never grows past the cap however much happens at once', () => {
    const flood = Array.from({ length: MOMENT_LIMIT * 3 }, (_, i) => moment(i));
    expect(rememberMoments([], flood)).toHaveLength(MOMENT_LIMIT);
  });
});

describe('a career writes its own', () => {
  function career(seed = 'moments'): CareerState {
    return startCareer({
      player: createPlayer({
        name: 'Diary',
        position: 'ST',
        age: 22,
        baseAttribute: 68,
        attributes: {},
      }),
      clubId: 'northport-city',
      teams: TEAMS,
      seed,
    });
  }

  it('starts with none, and has a debut after one match', () => {
    const state = career();
    expect(state.moments).toEqual([]);

    const stats = createMatchStats();
    stats.minutes = 90;
    recordPlayerMatch(
      state,
      { stats, rating: 7, playerTeamScore: 0, opponentScore: 0, fitnessAtEnd: 60 },
      lookup,
    );

    expect(kinds(state.lastMoments)).toContain('debut');
    expect(state.moments).toHaveLength(state.lastMoments.length);
    // Named, because "your debut, against them" reads as a bug.
    expect(state.lastMoments[0]!.text).not.toContain('against them');
  });

  it('clears the last match\'s moments when the next one is quiet', () => {
    const state = career('quiet');
    const play = (goals: number) => {
      const stats = createMatchStats();
      stats.minutes = 90;
      stats.goals = goals;
      recordPlayerMatch(
        state,
        { stats, rating: 7, playerTeamScore: goals, opponentScore: 0, fitnessAtEnd: 60 },
        lookup,
      );
    };
    play(0);
    expect(state.lastMoments.length).toBeGreaterThan(0);
    play(0);
    // Second match: nothing is a first any more.
    expect(state.lastMoments).toEqual([]);
    // But the career still remembers the debut.
    expect(kinds(state.moments)).toContain('debut');
  });
});
