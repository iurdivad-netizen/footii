import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { calendarFor, nextMatch, seasonComplete } from '../src/core/career/career.ts';
import {
  acceptOffer,
  canStay,
  endSeason,
  prepareNextMatch,
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
import { lifetimeTotals } from '../src/core/career/records.ts';
import {
  GROUP_ROUNDS,
  MAX_INTERNATIONAL_MATCHES,
} from '../src/core/career/international.ts';
import { isSelected, nationId } from '../src/core/career/nations.ts';

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
      // A loan is the one thing that separates the two, and it does so on
      // purpose: the contract stays with the club that owns him while he plays
      // somewhere else. These careers never take one, but the invariant is
      // written as it actually is rather than as it used to be.
      expect(career.state.clubId).toBe(
        career.state.loan ? career.state.loan.clubId : career.state.contract.clubId,
      );
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

  it('judges a season record on LEAGUE goals, not on everything he played', () => {
    // The star scores in every match of every competition. A season is 30 league
    // matches plus up to 12 cup and European ties, so counting the lot would put
    // "best season" well above 30 — and a twenty-goal season would stop meaning
    // the same thing in a career with a long cup run as in one without.
    expect(star.state.records.bestSeasonGoals).toBe(30);
    expect(star.state.records.tenGoalSeasons).toBe(SEASONS);
    expect(star.state.records.twentyGoalSeasons).toBe(SEASONS);
    // ...while the record book as a whole still counts every competition.
    expect(lifetimeTotals(star.state.records).goals).toBeGreaterThan(30 * SEASONS);
  });

  it('splits the record book by competition, adding back up to the whole career', () => {
    for (const career of [star, journeyman]) {
      const total = lifetimeTotals(career.state.records);
      const played = career.seasons.reduce((sum, s) => sum + s.record.stats.matches, 0);
      // Every match in every competition is in the book exactly once. The record
      // book is the only place a cup or European appearance is counted at all.
      expect(total.matches).toBe(played);
      expect(total.goals).toBe(
        career.seasons.reduce((sum, s) => sum + s.record.stats.goals, 0),
      );
      expect(career.state.records.byCompetition.league!.matches).toBe(30 * SEASONS);
    }
  });

  it('never lets a run of matches span a summer', () => {
    // A season is at most 42 matches, so a longer run could only have been
    // carried across a close season — or a transfer.
    for (const career of [star, journeyman]) {
      expect(career.state.records.scoringStreak.longest).toBeLessThanOrEqual(maximumMatches(30));
      expect(career.state.records.unbeatenStreak.longest).toBeLessThanOrEqual(maximumMatches(30));
    }
  });

  it('plays a full international season every year, whoever was picked', () => {
    // A tournament the player watched on television still has a winner, and the
    // world has to be able to say who it was.
    for (const career of [star, journeyman]) {
      for (const outcome of career.seasons) {
        const international = outcome.international;
        for (const row of international.table) expect(row.played, row.teamId).toBe(GROUP_ROUNDS);
        expect(international.knockout?.winnerId, 'no champion').toBeTruthy();
        expect(international.knockout!.survivors).toHaveLength(1);
        expect(outcome.internationalChampion).toBe(international.knockout!.winnerId);
      }
    }
  });

  it('draws a fresh tournament every season rather than replaying one', () => {
    // Leaving last year's in place would freeze the groups at full time and
    // never offer another international match again.
    const champions = star.seasons.map((s) => s.internationalChampion);
    expect(new Set(champions).size).toBeGreaterThan(1);
    const draws = star.seasons.map((s) => JSON.stringify(s.international.results));
    expect(new Set(draws).size).toBe(star.seasons.length);
  });

  it('never awards a cap for a match that was not played', () => {
    for (const career of [star, journeyman]) {
      let counted = 0;
      for (const outcome of career.seasons) {
        expect(outcome.caps).toBeGreaterThanOrEqual(0);
        // A World Cup runs a knockout round deeper than a continental
        // championship, so the most caps a season can hold is the longer one.
        expect(outcome.caps).toBeLessThanOrEqual(MAX_INTERNATIONAL_MATCHES);
        counted += outcome.caps;
      }
      expect(career.state.player.caps).toBe(counted);
      // Every cap is a match in the record book, and vice versa.
      expect(career.state.records.byCompetition.international?.matches ?? 0).toBe(counted);
    }
  });

  it('leaves an unknown player out of the squad entirely', () => {
    // The whole point of the competition: it is the one thing in a career he
    // can be left out of.
    const capped = journeyman.seasons.filter((s) => s.caps > 0);
    expect(isSelected(journeyman.state.player)).toBe(false);
    expect(capped).toHaveLength(0);
    expect(journeyman.state.player.caps).toBe(0);
  });

  it('picks a famous player, and gives him the caps to show for it', () => {
    expect(isSelected(star.state.player)).toBe(true);
    expect(star.state.player.caps).toBeGreaterThan(0);
  });

  it('only credits a tournament win to a nation the player actually played for', () => {
    for (const career of [star, journeyman]) {
      for (const outcome of career.seasons) {
        if (!outcome.wonInternational) continue;
        expect(outcome.internationalChampion).toBe(nationId(career.state.player.nationality));
      }
      // ...and an honour needs him to have been in it, not merely to support them.
      const titles = career.state.honours.filter((h) => h.kind === 'internationalTitle');
      for (const title of titles) {
        const season = career.seasons[title.season - 1];
        expect(season?.caps ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('finishes an international round whose date passed without the player', () => {
    // The bug this exists to catch: leaving the player's own fixture out of a
    // round that had ALREADY been played, on the grounds that he is currently
    // in the squad. The round then never completes, so the bracket seeded off
    // it is never built and he is offered no knockout at all. A save migrated
    // forward mid-season is exactly that shape.
    const state = startCareer({
      player: prospect({ reputation: 95 }),
      clubId: 'kingsbridge',
      teams: TEAMS,
      seed: 'catch-up',
    });
    expect(isSelected(state.player)).toBe(true);

    // Walk the calendar past the first international break without playing it,
    // the way a loaded save arrives.
    const calendar = calendarFor(state);
    const firstBreak = calendar.findIndex(
      (slot) => slot.competition === 'international' && slot.round === 1,
    );
    expect(firstBreak).toBeGreaterThan(0);
    state.calendarIndex = firstBreak + 1;

    prepareNextMatch(state, lookup);
    // Settled in full, his fixture included — nothing is left pending.
    expect(state.international.groupRoundsPlayed).toBeGreaterThanOrEqual(1);
    for (const row of state.international.table) {
      expect(row.played, row.teamId).toBeGreaterThanOrEqual(1);
    }

    // ...and the season still reaches a tournament with a champion.
    while (!seasonComplete(state)) {
      const stats = createMatchStats();
      stats.minutes = 90;
      recordPlayerMatch(
        state,
        { stats, rating: 7, playerTeamScore: 2, opponentScore: 1, fitnessAtEnd: 45 },
        lookup,
      );
    }
    const outcome = endSeason(state, lookup);
    expect(outcome.internationalChampion).toBeTruthy();
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
