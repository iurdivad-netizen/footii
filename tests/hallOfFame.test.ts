import { describe, expect, it } from 'vitest';
import {
  RETIREMENT_FORCED_AGE,
  RETIREMENT_OFFER_AGE,
  careerScore,
  careerVerdict,
  honourPoints,
  isWorthRemembering,
  rankLegacies,
  retirementProspect,
  summariseCareer,
} from '../src/core/career/legacy.ts';
import type { CareerLegacy } from '../src/core/career/legacy.ts';
import { startCareer } from '../src/simulation/CareerService.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import { recordMatch } from '../src/core/career/records.ts';
import type { Honour, HonourKind } from '../src/core/career/awards.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';

/**
 * WHAT SURVIVES A CAREER
 *
 * The wall of fame is the only thing in the game that outlives the career it
 * came from, which makes its failure modes different from everything else's. A
 * league table that is wrong is wrong until June; a legacy that is wrong is
 * wrong forever, because there is nothing left to recompute it from.
 *
 * So these test the two things that cannot be fixed later: that a summary
 * captures the career that was actually played — the season it was abandoned
 * in included — and that ranking them puts the better career above the longer
 * one.
 */

function career(overrides: Partial<CareerState> = {}): CareerState {
  const state = startCareer({
    player: createPlayer({ name: 'Test', position: 'ST', age: 20, attributes: {} }),
    clubId: 'northport-city',
    teams: TEAMS,
    seed: 'legacy',
  });
  return Object.assign(state, overrides);
}

/** Play `count` identical matches into the career's record book. */
function play(
  state: CareerState,
  count: number,
  match: { goals?: number; assists?: number; rating?: number; competition?: 'league' | 'international' } = {},
): CareerState {
  for (let i = 0; i < count; i += 1) {
    recordMatch(state.records, {
      competition: match.competition ?? 'league',
      goals: match.goals ?? 0,
      assists: match.assists ?? 0,
      rating: match.rating ?? 6.5,
      result: 0,
    });
  }
  return state;
}

/** A finished season on the history, with the statistics that matter here. */
function season(
  seasonNumber: number,
  stats: { matches: number; goals: number; ratingTotal: number },
  overrides: { clubId?: string; countryId?: string; age?: number } = {},
) {
  return {
    seasonNumber,
    clubId: overrides.clubId ?? 'northport-city',
    position: 4,
    stats: { ...createSeasonStats(), ...stats },
    age: overrides.age ?? 20 + seasonNumber,
    division: 1,
    countryId: overrides.countryId ?? 'england',
    cupsWon: [],
    europeanTier: null,
    wonEurope: false,
  };
}

function honour(kind: HonourKind, label: string = kind): Honour {
  return {
    kind,
    season: 1,
    clubId: 'northport-city',
    division: 1,
    countryId: 'england',
    label,
    detail: '',
  };
}

/** A legacy shaped for the ranking tests, where only the numbers matter. */
function legacy(overrides: Partial<CareerLegacy> = {}): CareerLegacy {
  return {
    id: 'a',
    name: 'Test',
    position: 'ST',
    nationality: 'england',
    ending: 'retired',
    endedAt: 1,
    seasons: 5,
    finalSeasonNumber: 6,
    ageAtEnd: 26,
    abilityAtEnd: 70,
    finalClubId: 'northport-city',
    finalClubName: 'Northport City',
    finalCountryId: 'england',
    finalCountryShort: 'ENG',
    clubs: 1,
    countries: 1,
    appearances: 100,
    goals: 30,
    assists: 20,
    averageRating: 6.8,
    caps: 0,
    earnings: 10,
    honours: [],
    titles: 0,
    highlights: [],
    score: 0,
    verdict: '',
    ...overrides,
  };
}

describe('summarising a career', () => {
  it('counts the season it was abandoned in, not just the completed ones', () => {
    // The whole point of reading the record book rather than `history`: a
    // career given up in March would otherwise lose the March that caused it.
    const state = career();
    state.history.push(season(1, { matches: 30, goals: 10, ratingTotal: 210 }));
    play(state, 30, { goals: 1, rating: 7 }); // last season, already archived
    play(state, 12, { goals: 2, rating: 7.5 }); // the season being abandoned

    const summary = summariseCareer(state, getTeam, 'abandoned');

    expect(summary.appearances).toBe(42);
    // 30 from the archived season, 24 from the one being walked out on.
    expect(summary.goals).toBe(54);
    // Seasons COMPLETED is still one. The half-season is in the totals without
    // being counted as a season he saw out.
    expect(summary.seasons).toBe(1);
    expect(summary.ending).toBe('abandoned');
  });

  it('counts every club and country he played in, not just the moves he made', () => {
    const state = career();
    state.history.push(season(1, { matches: 30, goals: 5, ratingTotal: 200 }));
    state.history.push(
      season(2, { matches: 30, goals: 9, ratingTotal: 210 }, { clubId: 'iberia-royal', countryId: 'spain' }),
    );
    state.clubId = 'nord-athletic';
    state.countryId = 'germany';
    play(state, 60);

    const summary = summariseCareer(state, getTeam, 'retired');

    expect(summary.clubs).toBe(3);
    expect(summary.countries).toBe(3);
  });

  it('resolves the final club to a NAME, so a later data change cannot blank it', () => {
    const state = career();
    play(state, 1);
    const summary = summariseCareer(state, getTeam, 'retired');

    expect(summary.finalClubName).toBe(getTeam('northport-city').name);
    expect(summary.finalCountryShort).toBe('ENG');
  });

  it('survives a club that no longer exists rather than refusing to end the career', () => {
    const state = career({ clubId: 'a-club-that-was-deleted' });
    play(state, 5);

    const summary = summariseCareer(
      state,
      (id) => {
        throw new Error(`no such club: ${id}`);
      },
      'abandoned',
    );

    expect(summary.appearances).toBe(5);
    expect(summary.finalClubName).toBe('a-club-that-was-deleted');
  });

  it('separates international appearances out as caps', () => {
    const state = career();
    play(state, 40, { goals: 1 });
    play(state, 15, { goals: 2, competition: 'international' });

    const summary = summariseCareer(state, getTeam, 'retired');

    // Caps are counted separately but are still appearances, and the goals he
    // scored for his country are still goals.
    expect(summary.appearances).toBe(55);
    expect(summary.goals).toBe(70);
    expect(summary.caps).toBe(15);
  });

  it('groups honours rather than listing them one by one', () => {
    const state = career();
    play(state, 30);
    state.honours.push(honour('title', 'Champions'), honour('title', 'Champions'), honour('nationalCup', 'National Cup'));

    const summary = summariseCareer(state, getTeam, 'retired');

    expect(summary.titles).toBe(2);
    expect(summary.honours).toContainEqual({ label: 'Champions', count: 2 });
    expect(summary.honours).toContainEqual({ label: 'National Cup', count: 1 });
  });

  it('gives every ended career a distinct id, so two can sit on the wall together', () => {
    const state = career();
    play(state, 5);
    const first = summariseCareer(state, getTeam, 'abandoned', 1000);
    const second = summariseCareer(state, getTeam, 'abandoned', 2000);

    expect(first.id).not.toBe(second.id);
  });
});

describe('what a career is worth', () => {
  it('puts a winner above a journeyman who played twice as long', () => {
    const winner = careerScore({
      goals: 180,
      assists: 60,
      appearances: 400,
      averageRating: 7.4,
      caps: 60,
      seasons: 12,
      honours: [],
      honourPoints: honourPoints([honour('title'), honour('title'), honour('europeanTitle')]),
    });
    const journeyman = careerScore({
      goals: 90,
      assists: 70,
      appearances: 800,
      averageRating: 6.5,
      caps: 0,
      seasons: 22,
      honours: [],
      honourPoints: 0,
    });

    expect(winner).toBeGreaterThan(journeyman);
  });

  it('rewards longevity, but never enough to outrank what it did not win', () => {
    const short = careerScore({
      goals: 20,
      assists: 10,
      appearances: 60,
      averageRating: 7,
      caps: 0,
      seasons: 2,
      honours: [],
      honourPoints: 0,
    });
    const long = careerScore({
      goals: 20,
      assists: 10,
      appearances: 200,
      averageRating: 7,
      caps: 0,
      seasons: 7,
      honours: [],
      honourPoints: 0,
    });

    expect(long).toBeGreaterThan(short);
  });

  it('costs a career something to have been relegated', () => {
    expect(honourPoints([honour('relegation')])).toBeLessThan(0);
    expect(honourPoints([honour('title'), honour('relegation')])).toBeLessThan(
      honourPoints([honour('title')]),
    );
  });

  it('values an international title above a domestic one', () => {
    expect(honourPoints([honour('internationalTitle')])).toBeGreaterThan(
      honourPoints([honour('title')]),
    );
  });

  it('never scores a career below zero, however badly it went', () => {
    const score = careerScore({
      goals: 0,
      assists: 0,
      appearances: 4,
      averageRating: 4,
      caps: 0,
      seasons: 0,
      honours: [],
      honourPoints: honourPoints([honour('relegation'), honour('relegation')]),
    });
    expect(score).toBe(0);
  });

  it('ranks best first, and breaks a tie with the more recent career', () => {
    const ranked = rankLegacies([
      legacy({ id: 'low', score: 100, endedAt: 5 }),
      legacy({ id: 'old-tie', score: 500, endedAt: 1 }),
      legacy({ id: 'new-tie', score: 500, endedAt: 9 }),
    ]);

    expect(ranked.map((entry) => entry.id)).toEqual(['new-tie', 'old-tie', 'low']);
  });

  it('does not reorder the list it was given', () => {
    const entries = [legacy({ id: 'a', score: 1 }), legacy({ id: 'b', score: 2 })];
    rankLegacies(entries);
    expect(entries.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

describe('what kind of footballer this was', () => {
  it('calls a career that never left one club exactly that', () => {
    expect(careerVerdict({ ...legacy({ clubs: 1, seasons: 12 }) })).toContain('one-club man');
  });

  it('notices a career spent moving between countries', () => {
    expect(careerVerdict({ ...legacy({ clubs: 6, countries: 5, seasons: 12 }) })).toContain(
      'countries',
    );
  });

  it('says so when a long career won nothing at all', () => {
    const verdict = careerVerdict({ ...legacy({ seasons: 12, clubs: 3, countries: 2, honours: [] }) });
    expect(verdict).toContain('nothing in the cabinet');
  });

  it('does not dress up a career abandoned before it started', () => {
    const verdict = careerVerdict({
      ...legacy({ ending: 'abandoned', seasons: 0, appearances: 3, goals: 0 }),
    });
    expect(verdict).toContain('before it had said anything');
  });
});

describe('whether a career is worth remembering', () => {
  it('keeps a career that played a single match', () => {
    expect(isWorthRemembering({ appearances: 1 })).toBe(true);
  });

  it('drops one that never played at all', () => {
    expect(isWorthRemembering({ appearances: 0 })).toBe(false);
  });
});

describe('retirement', () => {
  it('says nothing to a player with football left in him', () => {
    const state = career();
    state.player.age = RETIREMENT_OFFER_AGE - 1;
    expect(retirementProspect(state)).toBeNull();
  });

  it('offers the choice once he is old enough, without taking it for him', () => {
    const state = career();
    state.player.age = RETIREMENT_OFFER_AGE;
    const prospect = retirementProspect(state)!;

    expect(prospect).not.toBeNull();
    expect(prospect.forced).toBe(false);
    expect(prospect.reason).toContain(String(RETIREMENT_OFFER_AGE));
  });

  it('takes the choice away eventually, because everybody stops', () => {
    const state = career();
    state.player.age = RETIREMENT_FORCED_AGE;
    expect(retirementProspect(state)!.forced).toBe(true);
  });

  it('names the decline when the last season was clearly worse than the one before', () => {
    const state = career();
    state.player.age = RETIREMENT_OFFER_AGE + 1;
    // 7.00 the year before, 6.20 last year: a fall worth mentioning.
    state.history.push(season(1, { matches: 30, goals: 12, ratingTotal: 210 }));
    state.history.push(season(2, { matches: 30, goals: 4, ratingTotal: 186 }));

    const prospect = retirementProspect(state)!;

    expect(prospect.forced).toBe(false);
    expect(prospect.reason).toContain('6.20');
    expect(prospect.reason).toContain('7.00');
  });

  it('does not invent a decline for a player who is holding his level', () => {
    const state = career();
    state.player.age = RETIREMENT_OFFER_AGE + 1;
    state.history.push(season(1, { matches: 30, goals: 12, ratingTotal: 210 }));
    state.history.push(season(2, { matches: 30, goals: 13, ratingTotal: 213 }));

    expect(retirementProspect(state)!.reason).toContain('another season in you');
  });
});

describe('where an honour was won', () => {
  const inCountry = (kind: HonourKind, countryId: string): Honour => ({
    ...honour(kind),
    countryId,
  });

  it('pays a title in a stronger league more than the same title in a weaker one', () => {
    expect(honourPoints([inCountry('title', 'england')])).toBeGreaterThan(
      honourPoints([inCountry('title', 'austria')]),
    );
  });

  it('pays a European Cup the same whoever qualified for it', () => {
    // The point of the exception: a small league's club that wins Europe has
    // done MORE than a big league's, so the last thing its trophy should get is
    // a discount for the league it came out of.
    expect(honourPoints([inCountry('europeanTitle', 'austria')])).toBe(
      honourPoints([inCountry('europeanTitle', 'england')]),
    );
  });

  it('pays an international tournament the same whoever won it', () => {
    expect(honourPoints([inCountry('internationalTitle', 'scotland')])).toBe(
      honourPoints([inCountry('internationalTitle', 'spain')]),
    );
  });

  it('keeps the strongest league at its full listed value', () => {
    // England is the top of the scale, so nothing about this change may quietly
    // deflate the careers that were already being scored correctly.
    expect(honourPoints([inCountry('title', 'england')])).toBe(45);
  });

  it('costs less to go down in a weaker league than in a stronger one', () => {
    // Both are negative, so "costs less" means closer to zero.
    expect(honourPoints([inCountry('relegation', 'austria')])).toBeGreaterThan(
      honourPoints([inCountry('relegation', 'england')]),
    );
    expect(honourPoints([inCountry('relegation', 'austria')])).toBeLessThan(0);
  });

  it('does not let a weak league outscore a strong one on the same haul', () => {
    const strong = [inCountry('title', 'england'), inCountry('nationalCup', 'england')];
    const weak = [inCountry('title', 'austria'), inCountry('nationalCup', 'austria')];
    expect(honourPoints(strong)).toBeGreaterThan(honourPoints(weak));
  });

  it('keeps the taper mild enough that a league title still beats a league cup', () => {
    // The guard against over-tapering: no amount of country weighting may
    // reorder what the trophies themselves are worth.
    expect(honourPoints([inCountry('title', 'austria')])).toBeGreaterThan(
      honourPoints([inCountry('leagueCup', 'england')]),
    );
  });
});
