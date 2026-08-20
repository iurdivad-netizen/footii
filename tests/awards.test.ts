import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
// Imported for its side effect: loading the data registers the countries that
// honours are named after. Without it every league is "Unknown".
import '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import type { SeasonStats } from '../src/core/career/seasonStats.ts';
import { emptyTable } from '../src/core/career/league.ts';
import type { TableRow } from '../src/core/career/league.ts';
import {
  AWARD_MINIMUM_SHARE,
  CAP_MILESTONES,
  evaluateHonours,
  honourTone,
  honoursInSeason,
  leagueBenchmark,
  summariseHonours,
} from '../src/core/career/awards.ts';
import type { Honour, HonourKind, LeagueBenchmark } from '../src/core/career/awards.ts';

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
    countryId: 'england',
    cupsWon: [],
    europeanTier: null,
    wonEurope: false,
    reachedEuropeanFinal: false,
    internationalRounds: 0,
    wonInternational: false,
    reachedInternationalFinal: false,
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
    const up = evaluateHonours({ ...base, countryId: 'spain', position: 1, movement: 'promoted' });
    expect(honourKinds(up.honours)).toContain('promotion');

    const down = evaluateHonours({ ...base, position: 8, movement: 'relegated' });
    expect(honourKinds(down.honours)).toContain('relegation');
    expect(down.honours.find((h) => h.kind === 'relegation')!.detail).toContain('Premier');
  });

  it('records each cup that was won, named after the country', () => {
    const both = evaluateHonours({ ...base, position: 6, movement: null, cupsWon: ['nationalCup'] });
    expect(honourKinds(both.honours)).toContain('nationalCup');
    expect(both.honours.find((h) => h.kind === 'nationalCup')!.label).toContain('English');

    const lc = evaluateHonours({ ...base, position: 6, movement: null, cupsWon: ['leagueCup'] });
    expect(honourKinds(lc.honours)).toContain('leagueCup');
  });

  it('records a cup for a club that had an otherwise poor season', () => {
    // A cup belongs to the club, not to the player's form: you do not have to
    // have been good to have won it.
    const result = evaluateHonours({
      ...base,
      position: 14,
      movement: 'relegated',
      cupsWon: ['nationalCup'],
      stats: stats({ matches: 4, goals: 0, assists: 0, ratingTotal: 5 * 4 }),
    });
    expect(honourKinds(result.honours)).toContain('nationalCup');
    expect(honourKinds(result.honours)).toContain('relegation');
  });

  it('records a European title, named after the competition that was won', () => {
    const result = evaluateHonours({
      ...base,
      position: 6,
      movement: null,
      europeanTier: 'championsLeague',
      wonEurope: true,
    });
    expect(honourKinds(result.honours)).toContain('europeanTitle');
    expect(result.honours.find((h) => h.kind === 'europeanTitle')!.label).toContain(
      'Champions League',
    );
  });

  it('records losing a European final, but not as a trophy', () => {
    const result = evaluateHonours({
      ...base,
      position: 6,
      movement: null,
      europeanTier: 'europaLeague',
      wonEurope: false,
      reachedEuropeanFinal: true,
    });
    expect(honourKinds(result.honours)).toContain('europeanFinal');
    expect(honourKinds(result.honours)).not.toContain('europeanTitle');
  });

  it('records nothing for a European run that ended before the final', () => {
    const result = evaluateHonours({
      ...base,
      position: 6,
      movement: null,
      europeanTier: 'conferenceLeague',
      wonEurope: false,
      reachedEuropeanFinal: false,
      internationalRounds: 0,
      wonInternational: false,
      reachedInternationalFinal: false,
    });
    expect(honourKinds(result.honours)).not.toContain('europeanTitle');
    expect(honourKinds(result.honours)).not.toContain('europeanFinal');
  });

  it('cannot win Europe without having been in it', () => {
    // The tier is what says he played in it at all; a stray flag must not
    // conjure a trophy out of a season spent entirely at home.
    const result = evaluateHonours({
      ...base,
      position: 1,
      movement: null,
      cupsWon: ['nationalCup'],
      europeanTier: null,
      wonEurope: true,
      reachedEuropeanFinal: true,
    });
    expect(honourKinds(result.honours)).not.toContain('europeanTitle');
    expect(honourKinds(result.honours)).not.toContain('europeanFinal');
    // And it cannot smuggle one in through the treble either.
    expect(honourKinds(result.honours)).not.toContain('continentalTreble');
  });

  it('names a continental treble, the rarest line on the list', () => {
    const result = evaluateHonours({
      ...base,
      position: 1,
      movement: null,
      cupsWon: ['nationalCup'],
      europeanTier: 'championsLeague',
      wonEurope: true,
    });
    expect(honourKinds(result.honours)).toContain('continentalTreble');
    expect(honourKinds(result.honours)).toContain('europeanTitle');
    expect(honourKinds(result.honours)).toContain('title');
  });

  it('does not call a European title alone a treble', () => {
    const noLeague = evaluateHonours({
      ...base,
      position: 4,
      movement: null,
      cupsWon: ['nationalCup'],
      europeanTier: 'championsLeague',
      wonEurope: true,
    });
    expect(honourKinds(noLeague.honours)).not.toContain('continentalTreble');

    const noCup = evaluateHonours({
      ...base,
      position: 1,
      movement: null,
      cupsWon: [],
      europeanTier: 'championsLeague',
      wonEurope: true,
    });
    expect(honourKinds(noCup.honours)).not.toContain('continentalTreble');
  });

  it('names a double and a treble rather than leaving them to be inferred', () => {
    const double = evaluateHonours({ ...base, position: 1, movement: null, cupsWon: ['nationalCup'] });
    expect(honourKinds(double.honours)).toContain('domesticDouble');
    expect(honourKinds(double.honours)).not.toContain('domesticTreble');

    const cupsOnly = evaluateHonours({
      ...base,
      position: 5,
      movement: null,
      cupsWon: ['nationalCup', 'leagueCup'],
    });
    expect(honourKinds(cupsOnly.honours)).toContain('domesticDouble');

    const treble = evaluateHonours({
      ...base,
      position: 1,
      movement: null,
      cupsWon: ['nationalCup', 'leagueCup'],
    });
    expect(honourKinds(treble.honours)).toContain('domesticTreble');
    expect(honourKinds(treble.honours)).not.toContain('domesticDouble');
  });

  it('records neither for a single trophy', () => {
    const one = evaluateHonours({ ...base, position: 1, movement: null, cupsWon: [] });
    expect(honourKinds(one.honours)).toContain('title');
    expect(honourKinds(one.honours)).not.toContain('domesticDouble');
    expect(honourKinds(one.honours)).not.toContain('domesticTreble');
  });

  it('says which division a title was won in', () => {
    const second = evaluateHonours({ ...base, countryId: 'spain', position: 1, movement: null });
    expect(second.honours.find((h) => h.kind === 'title')!.label).toContain('Spanish');
  });
});

describe('individual honours', () => {
  const base = {
    player: player(),
    season: 3,
    clubId: 'club-0',
    division: 1,
    countryId: 'england',
    position: 1,
    movement: null,
    cupsWon: [],
    europeanTier: null,
    wonEurope: false,
    reachedEuropeanFinal: false,
    internationalRounds: 0,
    wonInternational: false,
    reachedInternationalFinal: false,
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
  const base = {
    stats: stats(),
    season: 3,
    clubId: 'club-0',
    division: 1,
    countryId: 'england',
    cupsWon: [],
    europeanTier: null,
    wonEurope: false,
    reachedEuropeanFinal: false,
    internationalRounds: 0,
    wonInternational: false,
    reachedInternationalFinal: false,
    position: 3,
    movement: null,
    benchmark,
    seasonLength: SEASON_LENGTH,
  };

  it('counts a cap for every match actually played in the shirt', () => {
    // Caps used to be inferred from reputation, because there were no
    // international fixtures to count. There are now, and a cap is a match.
    const result = evaluateHonours({ ...base, player: player({ caps: 4 }), internationalRounds: 5 });
    expect(result.capsGained).toBe(5);
  });

  it('gives no caps to a player who was never picked, however famous', () => {
    const result = evaluateHonours({
      ...base,
      player: player({ reputation: 99, caps: 0 }),
      internationalRounds: 0,
    });
    expect(result.capsGained).toBe(0);
    expect(honourKinds(result.honours)).not.toContain('internationalDebut');
  });

  it('records a debut the first time only', () => {
    const first = evaluateHonours({
      ...base,
      player: player({ caps: 0 }),
      internationalRounds: 3,
    });
    expect(honourKinds(first.honours)).toContain('internationalDebut');

    const later = evaluateHonours({
      ...base,
      player: player({ caps: 12 }),
      internationalRounds: 3,
    });
    expect(honourKinds(later.honours)).not.toContain('internationalDebut');
  });

  it('marks the cap milestones as they are passed', () => {
    const milestone = CAP_MILESTONES.find((m) => m > 1)!;
    const result = evaluateHonours({
      ...base,
      player: player({ caps: milestone - 1 }),
      internationalRounds: 3,
    });
    expect(honourKinds(result.honours)).toContain('capMilestone');
  });

  it('does not mark a milestone twice for the same career', () => {
    const milestone = CAP_MILESTONES.find((m) => m > 1)!;
    const past = evaluateHonours({
      ...base,
      player: player({ caps: milestone + 1 }),
      internationalRounds: 3,
    });
    expect(honourKinds(past.honours)).not.toContain('capMilestone');
  });

  it('records winning the tournament, and only for a player who was in it', () => {
    const won = evaluateHonours({
      ...base,
      player: player({ caps: 20 }),
      internationalRounds: 5,
      wonInternational: true,
    });
    expect(honourKinds(won.honours)).toContain('internationalTitle');

    // His country won it while he watched. Not his honour.
    const watched = evaluateHonours({
      ...base,
      player: player({ caps: 20 }),
      internationalRounds: 0,
      wonInternational: true,
    });
    expect(honourKinds(watched.honours)).not.toContain('internationalTitle');
  });

  it('records losing the final, but not as a trophy', () => {
    const result = evaluateHonours({
      ...base,
      player: player({ caps: 20 }),
      internationalRounds: 5,
      reachedInternationalFinal: true,
    });
    expect(honourKinds(result.honours)).toContain('internationalFinal');
    expect(honourKinds(result.honours)).not.toContain('internationalTitle');
  });

  it('records nothing for a tournament that ended before the final', () => {
    const result = evaluateHonours({
      ...base,
      player: player({ caps: 20 }),
      internationalRounds: 4,
    });
    expect(honourKinds(result.honours)).not.toContain('internationalTitle');
    expect(honourKinds(result.honours)).not.toContain('internationalFinal');
  });

  it('names the honour after the nation he plays FOR, not the league he plays in', () => {
    const result = evaluateHonours({
      ...base,
      // Playing in England, Scottish.
      countryId: 'england',
      player: player({ nationality: 'scotland', caps: 20 }),
      internationalRounds: 5,
      wonInternational: true,
    });
    const title = result.honours.find((h) => h.kind === 'internationalTitle')!;
    expect(title.label).toContain('Scotland');
  });
});

describe('summarising an honours list', () => {
  const honour = (label: string): Honour => ({
    kind: 'title',
    season: 1,
    clubId: 'c',
    division: 1,
    countryId: 'england',
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


/**
 * A SEASON'S HONOURS, AS A HISTORY READS THEM
 *
 * The career history table used to print one emoji for the national cup and
 * another for the league cup, so a season that took the league, the double and
 * a European trophy read exactly like one that scraped a minor cup — and an
 * individual award showed nothing at all. Everything was already recorded; only
 * the reading of it was missing.
 */

function honourAt(kind: HonourKind, season: number, label: string = kind): Honour {
  return {
    kind,
    season,
    clubId: 'northport-city',
    division: 1,
    countryId: 'england',
    label,
    detail: `${label} detail`,
  };
}

describe("a season's honours", () => {
  it('returns everything won in that season and nothing from another', () => {
    const honours = [
      honourAt('title', 3, 'English champions'),
      honourAt('nationalCup', 3, 'English Cup'),
      honourAt('topScorer', 3, 'Top scorer'),
      honourAt('title', 4, 'English champions'),
    ];

    const third = honoursInSeason(honours, 3);

    expect(third.map((entry) => entry.label)).toEqual([
      'English champions',
      'English Cup',
      'Top scorer',
    ]);
    expect(honoursInSeason(honours, 4)).toHaveLength(1);
    expect(honoursInSeason(honours, 99)).toEqual([]);
  });

  it('carries each honour own detail, so a short badge is still readable', () => {
    const [entry] = honoursInSeason([honourAt('title', 1, 'English champions')], 1);
    expect(entry!.detail).toBe('English champions detail');
  });

  it('separates what the club won from what the player won', () => {
    // The distinction the old single-icon column could not make.
    expect(honourTone('title')).toBe('trophy');
    expect(honourTone('europeanTitle')).toBe('trophy');
    expect(honourTone('internationalTitle')).toBe('trophy');
    expect(honourTone('topScorer')).toBe('award');
    expect(honourTone('playerOfTheSeason')).toBe('award');
  });

  it('marks a relegation as a setback rather than an honour', () => {
    expect(honourTone('relegation')).toBe('setback');
    expect(honourTone('promotion')).toBe('movement');
  });

  it('includes a relegation in the season it happened, since it is what happened', () => {
    const won = honoursInSeason([honourAt('relegation', 2, 'Relegated')], 2);
    expect(won).toHaveLength(1);
    expect(won[0]!.tone).toBe('setback');
  });
});
