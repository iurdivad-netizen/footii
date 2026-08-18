import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import type { SeasonStats } from '../src/core/career/seasonStats.ts';
import { emptyTable } from '../src/core/career/league.ts';
import type { TableRow } from '../src/core/career/league.ts';
import {
  AWARD_MINIMUM_SHARE,
  CAP_MILESTONES,
  INTERNATIONAL_REPUTATION,
  capsForSeason,
  evaluateHonours,
  leagueBenchmark,
  summariseHonours,
} from '../src/core/career/awards.ts';
import type { Honour, LeagueBenchmark } from '../src/core/career/awards.ts';

const SEASON_LENGTH = 14;

function player(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({ name: 'Award Test', position: 'ST', age: 26, baseAttribute: 70, attributes: {} }),
    ...overrides,
  };
}

function stats(overrides: Partial<SeasonStats> = {}): SeasonStats {
  return {
    ...createSeasonStats(),
    matches: SEASON_LENGTH,
    goals: 10,
    assists: 5,
    ratingTotal: 7.2 * SEASON_LENGTH,
    ...overrides,
  };
}

/** A finished table with a known set of goal totals. */
function table(goalsFor: readonly number[]): TableRow[] {
  const ids = goalsFor.map((_, i) => `club-${i}`);
  const rows = emptyTable(ids);
  for (const [index, row] of rows.entries()) {
    row.played = SEASON_LENGTH;
    row.goalsFor = goalsFor[index]!;
    row.won = Math.max(0, SEASON_LENGTH - index * 2);
    row.points = row.won * 3;
  }
  return rows;
}

const benchmark: LeagueBenchmark = { goldenBoot: 12, bestRating: 7.3, bestContributions: 17 };

function honourKinds(honours: readonly Honour[]): string[] {
  return honours.map((h) => h.kind);
}

describe('the bar an award is judged against', () => {
  it('rises with the goals actually scored in the division', () => {
    const quiet = leagueBenchmark(new Rng('a'), {
      table: table([12, 10, 9, 8]),
      playerClubId: 'none',
      playerGoals: 0,
    });
    const wild = leagueBenchmark(new Rng('a'), {
      table: table([60, 55, 50, 48]),
      playerClubId: 'none',
      playerGoals: 0,
    });
    expect(wild.goldenBoot).toBeGreaterThan(quiet.goldenBoot);
  });

  it('never counts the player against himself', () => {
    const withPlayer = leagueBenchmark(new Rng('same'), {
      table: table([60, 20, 18, 16]),
      playerClubId: 'club-0',
      playerGoals: 45,
    });
    const withoutPlayer = leagueBenchmark(new Rng('same'), {
      table: table([15, 20, 18, 16]),
      playerClubId: 'none',
      playerGoals: 0,
    });
    // His club's 60 goals minus his own 45 is the same 15 the other table has.
    expect(withPlayer.goldenBoot).toBe(withoutPlayer.goldenBoot);
  });

  it('is deterministic from its seed', () => {
    const input = { table: table([40, 35, 30, 25]), playerClubId: 'club-1', playerGoals: 9 };
    expect(leagueBenchmark(new Rng('x'), input)).toEqual(leagueBenchmark(new Rng('x'), input));
  });

  it('keeps the best rating inside a rating scale', () => {
    const mark = leagueBenchmark(new Rng('r'), {
      table: table([90, 80, 70, 5]),
      playerClubId: 'none',
      playerGoals: 0,
    });
    expect(mark.bestRating).toBeGreaterThanOrEqual(6.8);
    expect(mark.bestRating).toBeLessThanOrEqual(8);
  });
});

describe('team honours', () => {
  const base = {
    player: player(),
    stats: stats(),
    season: 3,
    clubId: 'club-0',
    division: 1,
    benchmark,
    seasonLength: SEASON_LENGTH,
  };

  it('records a title for finishing top', () => {
    const result = evaluateHonours({ ...base, position: 1, movement: null });
    expect(honourKinds(result.honours)).toContain('title');
  });

  it('records nothing for finishing second', () => {
    const result = evaluateHonours({ ...base, position: 2, movement: null });
    expect(honourKinds(result.honours)).not.toContain('title');
  });

  it('records promotion and relegation, and names the division moved out of', () => {
    const up = evaluateHonours({ ...base, division: 2, position: 1, movement: 'promoted' });
    expect(honourKinds(up.honours)).toContain('promotion');

    const down = evaluateHonours({ ...base, position: 8, movement: 'relegated' });
    expect(honourKinds(down.honours)).toContain('relegation');
    expect(down.honours.find((h) => h.kind === 'relegation')!.detail).toContain('Premier');
  });

  it('says which division a title was won in', () => {
    const second = evaluateHonours({ ...base, division: 2, position: 1, movement: null });
    expect(second.honours.find((h) => h.kind === 'title')!.label).toContain('Championship');
  });
});

describe('individual honours', () => {
  const base = {
    player: player(),
    season: 3,
    clubId: 'club-0',
    division: 1,
    position: 1,
    movement: null,
    benchmark,
    seasonLength: SEASON_LENGTH,
  };

  it('gives the top scorer award for beating the division\'s leading scorer', () => {
    const result = evaluateHonours({ ...base, stats: stats({ goals: 13 }) });
    expect(honourKinds(result.honours)).toContain('topScorer');
  });

  it('withholds it for finishing behind him', () => {
    const result = evaluateHonours({ ...base, stats: stats({ goals: 11 }) });
    expect(honourKinds(result.honours)).not.toContain('topScorer');
  });

  it('never awards a top scorer who did not score', () => {
    const result = evaluateHonours({
      ...base,
      stats: stats({ goals: 0 }),
      benchmark: { ...benchmark, goldenBoot: 0 },
    });
    expect(honourKinds(result.honours)).not.toContain('topScorer');
  });

  it('gives player of the season for outplaying the division and finishing high', () => {
    const result = evaluateHonours({
      ...base,
      stats: stats({ goals: 14, assists: 6, ratingTotal: 7.6 * SEASON_LENGTH }),
    });
    expect(honourKinds(result.honours)).toContain('playerOfTheSeason');
  });

  it('withholds it from a great season at a club that finished nowhere', () => {
    const result = evaluateHonours({
      ...base,
      position: 7,
      stats: stats({ goals: 14, assists: 6, ratingTotal: 7.6 * SEASON_LENGTH }),
    });
    expect(honourKinds(result.honours)).not.toContain('playerOfTheSeason');
  });

  it('judges a teenager against a gentler bar, and only once', () => {
    const young = { ...base, player: player({ age: 20 }) };
    const result = evaluateHonours({
      ...young,
      stats: stats({ goals: 9, assists: 3, ratingTotal: 7.05 * SEASON_LENGTH }),
    });
    expect(honourKinds(result.honours)).toContain('youngPlayerOfTheSeason');
    expect(honourKinds(result.honours)).not.toContain('playerOfTheSeason');
  });

  it('gives a teenager the senior award rather than both when he earns it', () => {
    const result = evaluateHonours({
      ...base,
      player: player({ age: 20 }),
      stats: stats({ goals: 15, assists: 6, ratingTotal: 7.7 * SEASON_LENGTH }),
    });
    expect(honourKinds(result.honours)).toContain('playerOfTheSeason');
    expect(honourKinds(result.honours)).not.toContain('youngPlayerOfTheSeason');
  });

  it('still gives a young player his award when his club finished nowhere', () => {
    // The senior award needs a top-four finish. A young player who cleared both
    // benchmarks at a club that finished 7th used to win nothing at all, while a
    // strictly worse season won the young player award.
    const result = evaluateHonours({
      ...base,
      position: 7,
      player: player({ age: 20 }),
      stats: stats({ goals: 15, assists: 6, ratingTotal: 7.7 * SEASON_LENGTH }),
    });
    expect(honourKinds(result.honours)).not.toContain('playerOfTheSeason');
    expect(honourKinds(result.honours)).toContain('youngPlayerOfTheSeason');
  });

  it('gives no individual award to a player who barely turned out', () => {
    const barely = Math.floor(SEASON_LENGTH * AWARD_MINIMUM_SHARE) - 1;
    const result = evaluateHonours({
      ...base,
      stats: stats({ matches: barely, goals: 20, assists: 10, ratingTotal: 8 * barely }),
    });
    expect(honourKinds(result.honours)).not.toContain('topScorer');
    expect(honourKinds(result.honours)).not.toContain('playerOfTheSeason');
  });
});

describe('international football', () => {
  it('picks nobody the game has not heard of', () => {
    expect(capsForSeason(player({ reputation: INTERNATIONAL_REPUTATION - 1 }), 1)).toBe(0);
  });

  it('picks a well known player, and more often the better known he is', () => {
    const known = capsForSeason(player({ reputation: 70 }), 1);
    const famous = capsForSeason(player({ reputation: 95 }), 1);
    expect(known).toBeGreaterThan(0);
    expect(famous).toBeGreaterThan(known);
  });

  it('notices a second-division season less than a first-division one', () => {
    expect(capsForSeason(player({ reputation: 80 }), 2)).toBeLessThan(
      capsForSeason(player({ reputation: 80 }), 1),
    );
  });

  it('records a debut the first time only', () => {
    const base = {
      stats: stats(),
      season: 3,
      clubId: 'club-0',
      division: 1,
      position: 3,
      movement: null,
      benchmark,
      seasonLength: SEASON_LENGTH,
    };
    const first = evaluateHonours({ ...base, player: player({ reputation: 75, caps: 0 }) });
    expect(honourKinds(first.honours)).toContain('internationalDebut');

    const later = evaluateHonours({ ...base, player: player({ reputation: 75, caps: 12 }) });
    expect(honourKinds(later.honours)).not.toContain('internationalDebut');
  });

  it('marks the cap milestones as they are passed', () => {
    const milestone = CAP_MILESTONES.find((m) => m > 1)!;
    const result = evaluateHonours({
      player: player({ reputation: 90, caps: milestone - 1 }),
      stats: stats(),
      season: 5,
      clubId: 'club-0',
      division: 1,
      position: 3,
      movement: null,
      benchmark,
      seasonLength: SEASON_LENGTH,
    });
    expect(honourKinds(result.honours)).toContain('capMilestone');
    expect(result.capsGained).toBeGreaterThan(0);
  });
});

describe('summarising an honours list', () => {
  const honour = (label: string): Honour => ({
    kind: 'title',
    season: 1,
    clubId: 'c',
    division: 1,
    label,
    detail: '',
  });

  it('counts repeats and puts the most-won first', () => {
    const summary = summariseHonours([
      honour('Premier champions'),
      honour('Premier top scorer'),
      honour('Premier champions'),
      honour('Premier champions'),
    ]);
    expect(summary[0]).toEqual({ label: 'Premier champions', count: 3 });
    expect(summary[1]).toEqual({ label: 'Premier top scorer', count: 1 });
  });

  it('handles an empty list', () => {
    expect(summariseHonours([])).toEqual([]);
  });
});
