import { describe, expect, it } from 'vitest';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import {
  acceptOffer,
  endSeason,
  missMatch,
  prepareNextMatch,
  recordPlayerMatch,
  startCareer,
  teamSheet,
} from '../src/simulation/CareerService.ts';
import { INTERNATIONAL } from '../src/core/career/international.ts';
import {
  fixturesFor,
  nextFixture,
  nextMatch,
  seasonComplete,
} from '../src/core/career/career.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { lifetimeTotals } from '../src/core/career/records.ts';

/**
 * MATCHES THAT HAPPENED WITHOUT HIM
 *
 * The point of an injury is not the injury. It is that a season can now contain
 * matches the player was not in — which is the one thing that was missing for
 * reputation's playing-time term and the awards' 60% gate to mean anything.
 */
const lookup = (id: string) => getTeam(id);

function career(seed = 'missed') {
  return startCareer({
    player: createPlayer({
      name: 'Absent',
      position: 'ST',
      age: 26,
      baseAttribute: 70,
      reputation: 65,
      potentialAbility: 85,
      attributes: {},
    }),
    clubId: 'northport-city',
    teams: TEAMS,
    seed,
  });
}

function play(state: CareerState) {
  const stats = createMatchStats();
  stats.minutes = 90;
  stats.goals = 1;
  recordPlayerMatch(
    state,
    { stats, rating: 7.2, playerTeamScore: 2, opponentScore: 1, fitnessAtEnd: 55 },
    lookup,
  );
}

describe('a fixture that passes without the player', () => {
  it('still plays the match, and still counts it in the table', () => {
    const state = career();
    const fixture = nextFixture(state)!;
    const before = state.table.reduce((n, row) => n + row.played, 0);

    const missed = missMatch(state, lookup);

    expect(state.results.some((r) => r.round === fixture.round && r.homeId === fixture.homeId)).toBe(
      true,
    );
    // His club's match AND the rest of the round, exactly as a played one does.
    expect(state.table.reduce((n, row) => n + row.played, 0)).toBeGreaterThan(before);
    expect(missed.goalsFor).toBeGreaterThanOrEqual(0);
    expect(missed.opponentId).toBeTruthy();
  });

  it('gives him no appearance, no goals and no rating', () => {
    const state = career();
    missMatch(state, lookup);

    expect(state.seasonStats.matches).toBe(0);
    expect(state.leagueStats.matches).toBe(0);
    expect(state.seasonStats.goals).toBe(0);
    expect(state.seasonStats.ratingTotal).toBe(0);
    expect(lifetimeTotals(state.records).matches).toBe(0);
  });

  it('advances the season, so a missed match is not replayed forever', () => {
    const state = career();
    const before = state.calendarIndex;
    missMatch(state, lookup);
    expect(state.calendarIndex).toBeGreaterThan(before);
    expect(state.nextFixtureIndex).toBe(1);
  });

  it('reports itself as missed rather than as skipped', () => {
    // Two different things: a skipped match is one he played without watching,
    // a missed one is a match that happened without him.
    const state = career();
    missMatch(state, lookup);
    expect(state.lastResult!.missed).toBe(true);
    expect(state.lastResult!.skipped).toBe(false);
    expect(state.lastResult!.rating).toBe(0);
  });

  it('is deterministic, like every other result in the game', () => {
    const one = career('determinism');
    const two = career('determinism');
    const a = missMatch(one, lookup);
    const b = missMatch(two, lookup);
    expect(a).toEqual(b);
  });
});

describe('what missing matches unlocks', () => {
  it('drops league playing time below a full season, which nothing else could', () => {
    // The whole reason injuries came before squad context. Playing time is
    // measured as league matches played over league matches there were, and
    // before this it could not be anything other than 1.
    const state = career('playing-time');
    const fixtures = fixturesFor(state, state.clubId).length;

    let missed = 0;
    while (!seasonComplete(state)) {
      if (missed < 8 && nextMatch(state)!.competition === 'league') {
        missMatch(state, lookup);
        missed += 1;
        continue;
      }
      play(state);
    }

    expect(missed).toBe(8);
    expect(state.leagueStats.matches).toBe(fixtures - 8);
    expect(state.leagueStats.matches / fixtures).toBeLessThan(1);
  });

  it('settles a season with matches missing from it, without falling over', () => {
    const state = career('settles');
    while (!seasonComplete(state)) {
      if (state.calendarIndex % 4 === 0) missMatch(state, lookup);
      else play(state);
    }
    const outcome = endSeason(state, lookup);
    expect(outcome.reputation).toBeTruthy();
    expect(state.seasonNumber).toBe(2);
  });

  it('settles a lower reputation for a season spent injured', () => {
    // End to end, and the payoff for doing injuries before squad context: two
    // identical footballers, identical performances, and the one who was not in
    // the side as often is not talked about as much.
    const run = (missLeagueMatches: number) => {
      const state = career('reputation');
      let missed = 0;
      while (!seasonComplete(state)) {
        if (missed < missLeagueMatches && nextMatch(state)!.competition === 'league') {
          missMatch(state, lookup);
          missed += 1;
          continue;
        }
        play(state);
      }
      return endSeason(state, lookup).reputation;
    };

    const everPresent = run(0);
    const injured = run(12);
    expect(injured.target).toBeLessThan(everPresent.target);
  });

  it('heals whatever he was carrying over the summer', () => {
    const state = career('summer');
    state.injury = {
      severity: 'rupture',
      label: 'A rupture',
      weeks: 14,
      weeksRemaining: 14,
      season: 1,
    };
    while (!seasonComplete(state)) missMatch(state, lookup);
    endSeason(state, lookup);
    expect(state.injury).toBeNull();
    expect(state.fitness).toBe(100);
  });
});

describe('rotation, end to end', () => {
  it('picks the player when nobody is competing for the shirt', () => {
    // Every career saved before rotation existed, until its next fixture builds
    // a rival. It must play exactly as it always did rather than benching him.
    const state = career('no-rival');
    state.rival = null;
    expect(teamSheet(state).selected).toBe(true);
  });

  it('builds a rival for a career that has never had one', () => {
    const state = career('lazy-rival');
    state.rival = null;
    prepareNextMatch(state, lookup);
    expect(state.rival).toBeTruthy();
    expect(state.rival!.name.length).toBeGreaterThan(0);
  });

  it('gives the same answer however many times the hub asks', () => {
    // The hub renders on every navigation. A selection that re-rolled would let
    // a player reopen the screen until he was picked.
    const state = career('stable');
    prepareNextMatch(state, lookup);
    const answers = [teamSheet(state), teamSheet(state), teamSheet(state)];
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it('replaces the competition when the player signs somewhere else', () => {
    const state = career('moving');
    prepareNextMatch(state, lookup);
    const before = state.rival!;
    while (!seasonComplete(state)) play(state);
    const outcome = endSeason(state, lookup);
    if (outcome.offers.length === 0) return; // nothing to prove this season
    acceptOffer(state, outcome.offers[0]!.id, lookup);
    expect(state.rival).not.toEqual(before);
  });

  it('never lets club rotation leave him out of an international', () => {
    const state = career('country');
    prepareNextMatch(state, lookup);
    // A rival so good he would never be picked for his club.
    state.rival = { name: 'Better', age: 26, ability: 99, form: 99 };
    while (!seasonComplete(state)) {
      const match = nextMatch(state)!;
      if (match.competition === INTERNATIONAL) {
        expect(teamSheet(state).selected).toBe(true);
        return;
      }
      missMatch(state, lookup);
    }
  });

  it('lets a benched player recover form he cannot earn on the pitch', () => {
    // Form only rises by playing, so a player dropped while out of form would
    // need form to get back in and no way to find it.
    const state = career('form');
    state.player.form = 14;
    prepareNextMatch(state, lookup);
    missMatch(state, lookup);
    expect(state.player.form).toBeGreaterThan(14);
  });
});
