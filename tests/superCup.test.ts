import { describe, expect, it } from 'vitest';
import {
  SUPER_CUP,
  applySuperCupResult,
  nextSuperCup,
  playsInSuperCup,
  resolveSuperCup,
  superCupName,
  superCupOpponent,
} from '../src/core/career/superCup.ts';
import type { SuperCupTie } from '../src/core/career/superCup.ts';
import { competitionLabel, seasonCalendar } from '../src/core/career/calendar.ts';
import { Rng } from '../src/core/rng.ts';
import { getTeam } from '../src/data/gameData.ts';

/**
 * THE SUPER CUP
 *
 * One match, and almost all of its risk is in who plays it. A fixture between a
 * club and itself, or one that quietly drops a country's cup winner, would both
 * look like working code and produce a season nobody could explain.
 */

const ENGLAND = ['northport-city', 'ashford-united', 'brackenmoor'];

function tie(overrides: Partial<SuperCupTie> = {}): SuperCupTie {
  return {
    countryId: 'england',
    championId: 'northport-city',
    challengerId: 'ashford-united',
    challengerIsRunnerUp: false,
    ...overrides,
  };
}

describe('who plays it', () => {
  it('puts the champions against the cup winners', () => {
    const fixture = nextSuperCup({
      countryId: 'england',
      standings: ENGLAND,
      cupWinnerId: 'brackenmoor',
    })!;

    expect(fixture.championId).toBe('northport-city');
    expect(fixture.challengerId).toBe('brackenmoor');
    expect(fixture.challengerIsRunnerUp).toBe(false);
  });

  it('sends the runner-up when one club did the double', () => {
    // Otherwise the fixture would be a club playing itself.
    const fixture = nextSuperCup({
      countryId: 'england',
      standings: ENGLAND,
      cupWinnerId: 'northport-city',
    })!;

    expect(fixture.challengerId).toBe('ashford-united');
    expect(fixture.challengerIsRunnerUp).toBe(true);
  });

  it('falls back to the runner-up when no cup winner is known', () => {
    const fixture = nextSuperCup({ countryId: 'england', standings: ENGLAND, cupWinnerId: null })!;
    expect(fixture.challengerId).toBe('ashford-united');
    expect(fixture.challengerIsRunnerUp).toBe(true);
  });

  it('plays none at all when there is nobody to play it', () => {
    expect(nextSuperCup({ countryId: 'england', standings: [], cupWinnerId: null })).toBeNull();
    // One club, doing the double, with nobody behind it to stand in.
    expect(
      nextSuperCup({
        countryId: 'england',
        standings: ['northport-city'],
        cupWinnerId: 'northport-city',
      }),
    ).toBeNull();
  });

  it('never names the same club on both sides', () => {
    for (const cupWinnerId of [...ENGLAND, null]) {
      const fixture = nextSuperCup({ countryId: 'england', standings: ENGLAND, cupWinnerId })!;
      expect(fixture.championId).not.toBe(fixture.challengerId);
    }
  });

  it('remembers whose trophy it is, so a player who moves does not take it with him', () => {
    const fixture = nextSuperCup({
      countryId: 'spain',
      standings: ENGLAND,
      cupWinnerId: null,
    })!;
    expect(fixture.countryId).toBe('spain');
    expect(superCupName(fixture.countryId)).toBe('The Spanish Super Cup');
  });

  it('knows who is in it and who they are playing', () => {
    const fixture = tie();
    expect(playsInSuperCup(fixture, 'northport-city')).toBe(true);
    expect(playsInSuperCup(fixture, 'ashford-united')).toBe(true);
    expect(playsInSuperCup(fixture, 'brackenmoor')).toBe(false);
    expect(playsInSuperCup(null, 'northport-city')).toBe(false);

    expect(superCupOpponent(fixture, 'northport-city')).toBe('ashford-united');
    expect(superCupOpponent(fixture, 'ashford-united')).toBe('northport-city');
  });
});

describe('playing it', () => {
  it('always produces a winner, because one match cannot be drawn either', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const played = resolveSuperCup(
        new Rng(`s${seed}`),
        tie(),
        getTeam('northport-city'),
        getTeam('ashford-united'),
      );
      expect(played.winnerId).toBeTruthy();
      expect(['northport-city', 'ashford-united']).toContain(played.winnerId);
      expect(played.penalties).toBe(played.homeGoals === played.awayGoals);
    }
  });

  it('leaves a match that has already been played alone', () => {
    const done = tie({ homeGoals: 2, awayGoals: 1, winnerId: 'northport-city' });
    expect(resolveSuperCup(new Rng('x'), done, getTeam('northport-city'), getTeam('ashford-united'))).toEqual(done);
  });

  it('records the player own result from his side of the scoreline', () => {
    // He is the CHALLENGER here, so his goals are the away goals.
    const played = applySuperCupResult(tie(), {
      clubId: 'ashford-united',
      goalsFor: 3,
      goalsAgainst: 1,
    });
    expect(played.homeGoals).toBe(1);
    expect(played.awayGoals).toBe(3);
    expect(played.winnerId).toBe('ashford-united');
    expect(played.penalties).toBe(false);
  });

  it('lets a shootout he took decide it', () => {
    const played = applySuperCupResult(tie(), {
      clubId: 'ashford-united',
      goalsFor: 1,
      goalsAgainst: 1,
      shootoutWinnerId: 'ashford-united',
    });
    expect(played.penalties).toBe(true);
    expect(played.winnerId).toBe('ashford-united');
  });
});

describe('where it sits in the season', () => {
  it('is the very first thing played, before a league match', () => {
    const calendar = seasonCalendar(30);
    expect(calendar[0]!.competition).toBe(SUPER_CUP);
    // And there is exactly one of it.
    expect(calendar.filter((slot) => slot.competition === SUPER_CUP)).toHaveLength(1);
  });

  it('is named as a competition in its own right', () => {
    expect(competitionLabel(SUPER_CUP)).toBe('Super Cup');
  });
});
