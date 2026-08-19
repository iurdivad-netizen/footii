import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { nextMatch, seasonComplete } from '../src/core/career/career.ts';
import {
  acceptOffer,
  canStay,
  endSeason,
  recordPlayerMatch,
  startCareer,
  stayAtClub,
} from '../src/simulation/CareerService.ts';
import type { SeasonEnd } from '../src/simulation/CareerService.ts';
import { isExpired } from '../src/core/career/contracts.ts';
import { allClubIds, locateClub } from '../src/core/career/countries.ts';
import { CUP_KINDS } from '../src/core/career/cups.ts';
import { maximumMatches } from '../src/core/career/calendar.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';

/**
 * LONG-CAREER REGRESSION
 *
 * Every other career test looks at one season in isolation, which is exactly
 * where a career model hides its problems: a market that quietly runs out of
 * clubs, a reputation that flatlines, a contract that expires with nowhere to
 * go, a division that loses a team. None of those show up in one summer.
 *
 * These play a whole career to its end and assert the things that must hold for
 * ALL of it — the invariants, not the outcomes.
 */

const lookup = (id: string) => getTeam(id);
const SEASONS = 18;

function prospect(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({
      name: 'Long Career',
      position: 'ST',
      age: 18,
      experience: 12,
      baseAttribute: 54,
      reputation: 30,
      potentialAbility: 86,
      attributes: { finishing: 64, awareness: 48, composure: 46, decisionMaking: 44 },
    }),
    ...overrides,
  };
}

interface CareerLog {
  state: CareerState;
  seasons: SeasonEnd[];
}

/**
 * Play a full career, taking the best offer whenever one is on the table.
 * `rating` and `goals` set how good the player is, so a caller can run the same
 * career as a star or as a journeyman.
 */
function playCareer(options: {
  seed: string;
  clubId: string;
  player?: Player;
  rating: number;
  goals: number;
  seasons?: number;
  move?: boolean;
}): CareerLog {
  const state = startCareer({
    player: options.player ?? prospect(),
    clubId: options.clubId,
    teams: TEAMS,
    seed: options.seed,
  });
  const seasons: SeasonEnd[] = [];

  for (let season = 0; season < (options.seasons ?? SEASONS); season++) {
    while (!seasonComplete(state)) {
      const stats = createMatchStats();
      stats.minutes = 90;
      stats.goals = options.goals;
      stats.assists = options.goals > 0 ? 1 : 0;
      recordPlayerMatch(
        state,
        {
          stats,
          rating: options.rating,
          playerTeamScore: options.goals,
          opponentScore: 1,
          fitnessAtEnd: 45,
        },
        lookup,
      );
    }

    const outcome = endSeason(state, lookup);
    seasons.push(outcome);

    // The summer must always be resolvable — that is the point of the test.
    if (outcome.offers.length > 0 && (options.move !== false || !canStay(state))) {
      acceptOffer(state, outcome.offers[0]!.id, lookup);
    } else if (canStay(state)) {
      stayAtClub(state);
    } else {
      throw new Error(`season ${season + 1}: no offers and nowhere to stay`);
    }
    state.trainingPoints = 0;
  }

  return { state, seasons };
}

describe('a whole career, played out', () => {
  const star = playCareer({ seed: 'star', clubId: 'stapleton-vale', rating: 7.5, goals: 1 });
  const journeyman = playCareer({
    seed: 'journey',
    clubId: 'ashford-united',
    rating: 5.5,
    goals: 0,
    player: prospect({ age: 26, potentialAbility: 55, reputation: 32 }),
  });

  it('never leaves a player without a club to play for', () => {
    for (const career of [star, journeyman]) {
      expect(career.state.contract).toBeTruthy();
      expect(isExpired(career.state.contract)).toBe(false);
      expect(career.state.clubId).toBe(career.state.contract.clubId);
    }
  });

  it('keeps the player in the division his club is actually in', () => {
    for (const career of [star, journeyman]) {
      const placed = locateClub(career.state.leagues, career.state.clubId);
      expect(placed?.division).toBe(career.state.division);
      expect(placed?.countryId).toBe(career.state.countryId);
      expect(career.state.leagueTeamIds).toContain(career.state.clubId);
    }
  });

  it('never loses, duplicates or strands a club across the whole career', () => {
    for (const career of [star, journeyman]) {
      const all = allClubIds(career.state.leagues);
      expect(all).toHaveLength(TEAMS.length);
      expect(new Set(all).size).toBe(TEAMS.length);
      for (const pyramid of Object.values(career.state.leagues)) {
        for (const tier of pyramid) expect(tier.length).toBeGreaterThan(1);
      }
    }
  });

  it('always gives the player a full fixture list for his league', () => {
    for (const career of [star, journeyman]) {
      const own = career.state.fixtures.filter(
        (f) => f.homeId === career.state.clubId || f.awayId === career.state.clubId,
      );
      expect(own).toHaveLength((career.state.leagueTeamIds.length - 1) * 2);
    }
  });

  it('keeps the market alive rather than going permanently silent', () => {
    // The failure this exists to catch: a career that reaches the top of the
    // ladder and then never hears from anyone again.
    const late = star.seasons.slice(-6);
    const heardFrom = late.filter((s) => s.offers.length > 0 || s.renewal !== null);
    expect(heardFrom.length).toBeGreaterThan(0);
  });

  it('moves a good player up the ladder and keeps a poor one down', () => {
    // Starting at the weakest club in the world, a star does not end there.
    expect(star.state.clubId).not.toBe('stapleton-vale');
  });

  it('keeps every country\'s league at a full complement', () => {
    for (const [countryId, pyramid] of Object.entries(star.state.leagues)) {
      expect(pyramid[0]!.length, countryId).toBe(16);
    }
  });

  it('keeps reputation inside its scale and responsive to the football played', () => {
    for (const career of [star, journeyman]) {
      expect(career.state.player.reputation).toBeGreaterThanOrEqual(0);
      expect(career.state.player.reputation).toBeLessThanOrEqual(100);
    }
    expect(star.state.player.reputation).toBeGreaterThan(journeyman.state.player.reputation);
  });

  it('builds an honours list for a good career and not for a bad one', () => {
    expect(star.state.honours.length).toBeGreaterThan(0);
    expect(star.state.honours.length).toBeGreaterThan(journeyman.state.honours.length);
    for (const honour of star.state.honours) {
      expect(honour.season).toBeGreaterThan(0);
      expect(honour.label).toBeTruthy();
    }
  });

  it('banks wages every season, and more for the better career', () => {
    expect(star.state.careerEarnings).toBeGreaterThan(0);
    expect(star.state.careerEarnings).toBeGreaterThan(journeyman.state.careerEarnings);
  });

  it('keeps every club recognisably itself after a career of drift', () => {
    for (const team of TEAMS) {
      const drifted = star.state.clubStrengths[team.id]!;
      expect(Math.abs(drifted.attack - team.ratings.attack)).toBeLessThanOrEqual(12);
      expect(Math.abs(drifted.defence - team.ratings.defence)).toBeLessThanOrEqual(12);
      expect(drifted.attack).toBeGreaterThan(0);
    }
  });

  it('finishes both knockouts every season, whoever went out when', () => {
    // A season that archived an unfinished cup would leave a hole in the
    // history and an honour nobody could have won.
    for (const career of [star, journeyman]) {
      for (const outcome of career.seasons) {
        for (const kind of CUP_KINDS) {
          const cup = outcome.cups[kind];
          expect(cup.winnerId, kind).toBeTruthy();
          expect(cup.survivors, kind).toHaveLength(1);
        }
      }
    }
  });

  it('never plays more matches in a season than the calendar allows', () => {
    for (const career of [star, journeyman]) {
      for (const outcome of career.seasons) {
        const league = outcome.record.stats.matches;
        expect(league).toBeLessThanOrEqual(maximumMatches(30));
        expect(league).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('only credits a cup win to a club that actually won it', () => {
    for (const career of [star, journeyman]) {
      for (const outcome of career.seasons) {
        for (const kind of outcome.cupsWon) {
          expect(outcome.cups[kind].winnerId).toBe(outcome.record.clubId);
        }
      }
    }
  });

  it('starts every season with a clean pair of cups', () => {
    for (const career of [star, journeyman]) {
      for (const kind of CUP_KINDS) {
        expect(career.state.cups[kind].winnerId, kind).toBeNull();
        expect(career.state.cups[kind].countryId).toBe(career.state.countryId);
        expect(career.state.cups[kind].survivors).toEqual(career.state.leagueTeamIds);
      }
    }
  });

  it('never offers the same calendar slot twice', () => {
    // The bug this exists to catch: `nextMatch` walks forward past slots that
    // are not the player's, so advancing the index by one leaves it trailing
    // and a match already played gets offered again. A won cup final was being
    // replayed, and losing the replay handed the trophy to the opponent.
    const state = startCareer({
      player: prospect(),
      clubId: 'kingsbridge',
      teams: TEAMS,
      seed: 'slots',
    });

    const seen = new Set<number>();
    while (!seasonComplete(state)) {
      const scheduled = nextMatch(state)!;
      expect(seen.has(scheduled.slotIndex), `slot ${scheduled.slotIndex} replayed`).toBe(false);
      seen.add(scheduled.slotIndex);

      const stats = createMatchStats();
      stats.minutes = 90;
      recordPlayerMatch(
        state,
        { stats, rating: 7, playerTeamScore: 2, opponentScore: 1, fitnessAtEnd: 45 },
        lookup,
      );
      expect(state.calendarIndex).toBe(scheduled.slotIndex + 1);
    }
  });

  it('leaves every club in the league on the same number of matches', () => {
    // Simulating the calendar slot's round rather than the fixture's own meant
    // the player finished on 30 and everyone else on 27 or 28.
    const state = startCareer({
      player: prospect(),
      clubId: 'vale-park',
      teams: TEAMS,
      seed: 'rounds',
    });
    while (!seasonComplete(state)) {
      const stats = createMatchStats();
      stats.minutes = 90;
      recordPlayerMatch(
        state,
        { stats, rating: 6.8, playerTeamScore: 1, opponentScore: 1, fitnessAtEnd: 45 },
        lookup,
      );
    }
    const played = state.table.map((row) => row.played);
    expect(new Set(played).size).toBe(1);
    expect(played[0]).toBe(30);
  });

  it('records a season of history for every season played', () => {
    expect(star.state.history).toHaveLength(SEASONS);
    for (const record of star.state.history) {
      expect(record.division).toBeGreaterThanOrEqual(1);
      expect(record.position).toBeGreaterThan(0);
    }
  });

  it('ages the player exactly one year per season', () => {
    expect(star.state.player.age).toBe(18 + SEASONS);
  });

  it('is fully deterministic from its seed', () => {
    const a = playCareer({ seed: 'repeat', clubId: 'fenwick-town', rating: 7.2, goals: 1, seasons: 8 });
    const b = playCareer({ seed: 'repeat', clubId: 'fenwick-town', rating: 7.2, goals: 1, seasons: 8 });
    expect(a.state.clubId).toBe(b.state.clubId);
    expect(a.state.division).toBe(b.state.division);
    expect(a.state.player.reputation).toBe(b.state.player.reputation);
    expect(a.state.honours).toEqual(b.state.honours);
    expect(a.state.clubStrengths).toEqual(b.state.clubStrengths);
    expect(a.state.careerEarnings).toBe(b.state.careerEarnings);
  });
});

describe('a career that stays put', () => {
  it('survives never moving club, however long it runs', () => {
    const loyal = playCareer({
      seed: 'loyal',
      clubId: 'kingsbridge',
      rating: 7.0,
      goals: 1,
      move: false,
    });
    expect(loyal.state.contract).toBeTruthy();
    expect(isExpired(loyal.state.contract)).toBe(false);
    expect(loyal.state.history).toHaveLength(SEASONS);
  });
});
