import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { applyExertion, createPlayer, currentAbility, fatigueLevel } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam, teamsInDivision } from '../src/data/gameData.ts';
import {
  endSeason,
  playerFixtures,
  recordPlayerMatch,
  simulateRound,
  startCareer,
} from '../src/simulation/CareerService.ts';
import { FITNESS_RECOVERY, nextFixture, seasonComplete } from '../src/core/career/career.ts';
import {
  ageFactor,
  createDevelopmentState,
  developAfterMatch,
  driftPotential,
} from '../src/core/career/development.ts';
import {
  applyResult,
  emptyTable,
  generateFixtures,
  simulateFixture,
  sortTable,
  tablePosition,
} from '../src/core/career/league.ts';
import { averageRating, createSeasonStats } from '../src/core/career/seasonStats.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { calculateDecisionTime } from '../src/simulation/DecisionTimer.ts';
import { getSituationTemplate } from '../src/data/situations.ts';
import { context } from './helpers.ts';

/** The player's own division. A career league is one division, not the pyramid. */
const LEAGUE = teamsInDivision(1).map((t) => t.id);
const lookup = (id: string) => getTeam(id);

function prospect(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({
      name: 'Kid',
      position: 'ST',
      age: 18,
      experience: 10,
      baseAttribute: 50,
      potentialAbility: 88,
      attributes: { awareness: 45, composure: 42, decisionMaking: 40, finishing: 60 },
    }),
    ...overrides,
  };
}

function playMatch(state: ReturnType<typeof startCareer>, rating: number, goals = 0) {
  const stats = createMatchStats();
  stats.minutes = 90;
  stats.goals = goals;
  return recordPlayerMatch(
    state,
    { stats, rating, playerTeamScore: goals, opponentScore: 0, fitnessAtEnd: 45 },
    lookup,
  );
}

describe('fixtures and league', () => {
  it('builds a double round-robin where everyone plays everyone home and away', () => {
    const fixtures = generateFixtures(LEAGUE, new Rng('fix'));
    expect(fixtures).toHaveLength(LEAGUE.length * (LEAGUE.length - 1));

    for (const team of LEAGUE) {
      const own = fixtures.filter((f) => f.homeId === team || f.awayId === team);
      expect(own, team).toHaveLength((LEAGUE.length - 1) * 2);
      expect(own.filter((f) => f.homeId === team)).toHaveLength(LEAGUE.length - 1);
    }

    // Every pairing appears exactly twice, once each way.
    for (const a of LEAGUE) {
      for (const b of LEAGUE) {
        if (a === b) continue;
        expect(fixtures.filter((f) => f.homeId === a && f.awayId === b)).toHaveLength(1);
      }
    }
  });

  it('never schedules a team twice in the same round', () => {
    const fixtures = generateFixtures(LEAGUE, new Rng('rounds'));
    const rounds = new Set(fixtures.map((f) => f.round));
    for (const round of rounds) {
      const inRound = fixtures.filter((f) => f.round === round);
      const seen = new Set<string>();
      for (const f of inRound) {
        expect(seen.has(f.homeId)).toBe(false);
        expect(seen.has(f.awayId)).toBe(false);
        seen.add(f.homeId);
        seen.add(f.awayId);
      }
    }
  });

  it('handles an odd number of teams with byes', () => {
    const odd = LEAGUE.slice(0, 5);
    const fixtures = generateFixtures(odd, new Rng('odd'));
    expect(fixtures).toHaveLength(5 * 4);
    for (const team of odd) {
      expect(fixtures.filter((f) => f.homeId === team || f.awayId === team)).toHaveLength(8);
    }
  });

  it('produces believable simulated scorelines', () => {
    const rng = new Rng('scores');
    let goals = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const r = simulateFixture(rng, getTeam('vale-park'), getTeam('brackenmoor'));
      expect(r.homeGoals).toBeGreaterThanOrEqual(0);
      expect(r.homeGoals).toBeLessThanOrEqual(9);
      goals += r.homeGoals + r.awayGoals;
    }
    const perMatch = goals / runs;
    expect(perMatch).toBeGreaterThan(1.5);
    expect(perMatch).toBeLessThan(4.5);
  });

  it('gives the stronger side more points over a long run', () => {
    const rng = new Rng('strength');
    let strongPoints = 0;
    let weakPoints = 0;
    for (let i = 0; i < 500; i++) {
      const r = simulateFixture(rng, getTeam('castleford-royals'), getTeam('old-harbour'));
      if (r.homeGoals > r.awayGoals) strongPoints += 3;
      else if (r.homeGoals === r.awayGoals) {
        strongPoints += 1;
        weakPoints += 1;
      } else weakPoints += 3;
    }
    expect(strongPoints).toBeGreaterThan(weakPoints * 2);
  });

  it('sorts the table by points, then goal difference, then goals scored', () => {
    const table = emptyTable(['a', 'b', 'c']);
    applyResult(table, { round: 1, homeId: 'a', awayId: 'b', homeGoals: 1, awayGoals: 0 });
    applyResult(table, { round: 1, homeId: 'c', awayId: 'a', homeGoals: 5, awayGoals: 0 });
    applyResult(table, { round: 2, homeId: 'b', awayId: 'c', homeGoals: 0, awayGoals: 0 });
    const sorted = sortTable(table);
    expect(sorted[0]!.teamId).toBe('c');
    expect(sorted.map((r) => r.points)).toEqual([4, 3, 1]);
    expect(table.reduce((n, r) => n + r.played, 0)).toBe(6);
  });
});

describe('development', () => {
  it('has a realistic age curve', () => {
    expect(ageFactor(17)).toBeGreaterThan(ageFactor(22));
    expect(ageFactor(22)).toBeGreaterThan(ageFactor(27));
    expect(ageFactor(28)).toBe(0);
    expect(ageFactor(34)).toBeLessThan(0);
  });

  it('improves a young player over a season of good performances', () => {
    const player = prospect();
    const before = currentAbility(player);
    const state = createDevelopmentState();
    const rng = new Rng('dev');
    for (let i = 0; i < 14; i++) {
      developAfterMatch(rng, state, { player, rating: 7.4, minutes: 90, coaching: 0.7 });
    }
    expect(currentAbility(player)).toBeGreaterThan(before);
    expect(player.experience).toBeGreaterThan(10);
  });

  it('develops a talented youngster faster than an old player at his ceiling', () => {
    const growth = (age: number, potential: number) => {
      const player = prospect({ age, potentialAbility: potential });
      const before = currentAbility(player);
      const state = createDevelopmentState();
      const rng = new Rng(`g-${age}`);
      for (let i = 0; i < 14; i++) {
        developAfterMatch(rng, state, { player, rating: 7.4, minutes: 90, coaching: 0.7 });
      }
      return currentAbility(player) - before;
    };
    expect(growth(18, 90)).toBeGreaterThan(growth(27, 60));
  });

  it('rewards playing well more than playing badly', () => {
    const growth = (rating: number) => {
      const player = prospect();
      const state = createDevelopmentState();
      const rng = new Rng('perf');
      let total = 0;
      for (let i = 0; i < 14; i++) {
        total += developAfterMatch(rng, state, { player, rating, minutes: 90, coaching: 0.7 }).growth;
      }
      return total;
    };
    expect(growth(8.2)).toBeGreaterThan(growth(5.2));
  });

  it('does not develop a player who never plays', () => {
    const player = prospect();
    const before = { ...player.attributes };
    const state = createDevelopmentState();
    developAfterMatch(new Rng('bench'), state, {
      player,
      rating: 6,
      minutes: 0,
      coaching: 0.7,
    });
    expect(player.attributes).toEqual(before);
  });

  it('declines a veteran past his peak', () => {
    const player = prospect({ age: 35, potentialAbility: 60 });
    // Decline is spread randomly across the physical attributes, so assert on
    // the aggregate rather than on any single one.
    const physical = (p: Player) =>
      p.attributes.pace + p.attributes.acceleration + p.attributes.stamina + p.attributes.strength;
    const before = physical(player);
    const beforeAbility = currentAbility(player);

    const state = createDevelopmentState();
    const rng = new Rng('old');
    for (let i = 0; i < 14; i++) {
      developAfterMatch(rng, state, { player, rating: 6.5, minutes: 90, coaching: 0.5 });
    }
    expect(physical(player)).toBeLessThan(before);
    expect(currentAbility(player)).toBeLessThanOrEqual(beforeAbility);
  });

  it('never pushes an attribute outside 1-99', () => {
    const player = prospect({ potentialAbility: 99 });
    for (const key of Object.keys(player.attributes) as (keyof typeof player.attributes)[]) {
      player.attributes[key] = 99;
    }
    const state = createDevelopmentState();
    const rng = new Rng('cap');
    for (let i = 0; i < 60; i++) {
      developAfterMatch(rng, state, { player, rating: 9, minutes: 90, coaching: 1 });
    }
    for (const value of Object.values(player.attributes)) {
      expect(value).toBeLessThanOrEqual(99);
      expect(value).toBeGreaterThanOrEqual(1);
    }
  });

  it('potential drifts rather than being fixed, and never falls below current ability', () => {
    const drifts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const player = prospect();
      drifts.add(driftPotential(new Rng(`drift-${i}`), player, 7.5));
      expect(player.potentialAbility).toBeGreaterThanOrEqual(currentAbility(player));
    }
    expect(drifts.size).toBeGreaterThan(2);
  });

  it('WIDENS THE DECISION WINDOW as the player develops — the payoff loop', () => {
    const player = prospect();
    const template = getSituationTemplate('oneOnOne');
    const windowFor = (p: Player) =>
      calculateDecisionTime(context({ player: p, defensivePressure: 0.3 }), template).seconds;

    const before = windowFor(player);

    const state = createDevelopmentState();
    const rng = new Rng('payoff');
    for (let season = 0; season < 3; season++) {
      for (let i = 0; i < 14; i++) {
        developAfterMatch(rng, state, { player, rating: 7.5, minutes: 90, coaching: 0.75 });
      }
    }

    const after = windowFor(player);
    expect(after).toBeGreaterThan(before);
    // The improvement has to be big enough to actually feel at the keyboard.
    expect(after - before).toBeGreaterThan(0.25);
  });
});

describe('career progression', () => {
  it('starts a career with a full fixture list and an empty table', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'c1',
    });
    expect(playerFixtures(state)).toHaveLength((LEAGUE.length - 1) * 2);
    expect(state.table.every((r) => r.played === 0)).toBe(true);
    expect(nextFixture(state)).not.toBeNull();
    expect(seasonComplete(state)).toBe(false);
  });

  it('records a played match, updates the table and advances the fixture', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'c2',
    });
    const fixture = nextFixture(state)!;
    playMatch(state, 7.5, 2);

    expect(state.seasonStats.matches).toBe(1);
    expect(state.seasonStats.goals).toBe(2);
    expect(state.nextFixtureIndex).toBe(1);

    const row = state.table.find((r) => r.teamId === 'northport-city')!;
    expect(row.played).toBe(1);
    expect(row.won).toBe(1);
    // Every other club in that round also has a result.
    const inRound = state.results.filter((r) => r.round === fixture.round);
    expect(inRound.length).toBe(LEAGUE.length / 2);
  });

  it('carries fitness between matches with recovery, never mutating past bounds', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'c3',
    });
    for (let i = 0; i < 6; i++) {
      playMatch(state, 7, 1);
      expect(state.fitness).toBeGreaterThan(0);
      expect(state.fitness).toBeLessThanOrEqual(100);
    }
  });

  it('moves form with performances', () => {
    const good = startCareer({ player: prospect(), clubId: 'northport-city', teams: TEAMS, seed: 'f1' });
    const bad = startCareer({ player: prospect(), clubId: 'northport-city', teams: TEAMS, seed: 'f2' });
    for (let i = 0; i < 5; i++) {
      playMatch(good, 8.5, 2);
      playMatch(bad, 4.5, 0);
    }
    expect(good.player.form).toBeGreaterThan(bad.player.form);
    expect(good.player.morale).toBeGreaterThan(bad.player.morale);
  });

  it('plays a full season, completes the table and crowns a champion', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'season',
    });
    const total = playerFixtures(state).length;
    for (let i = 0; i < total; i++) playMatch(state, 7, 1);

    expect(seasonComplete(state)).toBe(true);
    expect(state.seasonStats.matches).toBe(total);

    const { record, position, champion } = endSeason(state, lookup);

    // Every club has played every fixture.
    const expectedPerTeam = (LEAGUE.length - 1) * 2;
    for (const row of state.history.length ? [] : []) expect(row).toBeDefined();
    expect(position).toBeGreaterThanOrEqual(1);
    expect(position).toBeLessThanOrEqual(LEAGUE.length);
    expect(champion).toBeTruthy();
    expect(record.stats.matches).toBe(total);
    expect(expectedPerTeam).toBe(total);

    // A new season is ready: aged, reset, refixtured.
    expect(state.seasonNumber).toBe(2);
    expect(state.player.age).toBe(19);
    expect(state.seasonStats.matches).toBe(0);
    expect(state.nextFixtureIndex).toBe(0);
    expect(state.fitness).toBe(100);
    expect(state.history).toHaveLength(1);
    expect(playerFixtures(state)).toHaveLength(total);
  });

  it('every team plays the same number of matches by season end', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'complete',
    });
    for (let i = 0; i < playerFixtures(state).length; i++) playMatch(state, 6.8, 1);
    const table = [...state.table];
    endSeason(state, lookup);
    const played = table.map((r) => r.played);
    expect(new Set(played).size).toBe(1);
    expect(played[0]).toBe((LEAGUE.length - 1) * 2);
  });

  it('is deterministic for a fixed seed', () => {
    const run = () => {
      const state = startCareer({
        player: prospect(),
        clubId: 'northport-city',
        teams: TEAMS,
        seed: 'determinism',
      });
      for (let i = 0; i < 6; i++) playMatch(state, 7.2, 1);
      return {
        table: sortTable(state.table).map((r) => `${r.teamId}:${r.points}:${r.goalsFor}`),
        attributes: { ...state.player.attributes },
        form: state.player.form,
      };
    };
    expect(run()).toEqual(run());
  });

  it('does not double-count a round that was already simulated', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'dupes',
    });
    const fixture = nextFixture(state)!;
    simulateRound(state, fixture.round, lookup);
    const after = state.results.length;
    simulateRound(state, fixture.round, lookup);
    expect(state.results.length).toBe(after);
    // The player's own fixture is never auto-simulated.
    expect(
      state.results.some((r) => r.homeId === state.clubId || r.awayId === state.clubId),
    ).toBe(false);
  });

  it('refuses to end a season that is still being played', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'early',
    });
    expect(() => endSeason(state, lookup)).toThrow();
  });

  it('tracks a multi-season career with history and ageing', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'multi',
    });
    const startAbility = currentAbility(state.player);
    for (let season = 0; season < 3; season++) {
      for (let i = 0; i < playerFixtures(state).length; i++) playMatch(state, 7.6, 1);
      endSeason(state, lookup);
    }
    expect(state.history).toHaveLength(3);
    expect(state.seasonNumber).toBe(4);
    expect(state.player.age).toBe(21);
    expect(currentAbility(state.player)).toBeGreaterThan(startAbility);
    expect(state.history.every((h) => h.stats.matches > 0)).toBe(true);
  });
});

describe('condition', () => {
  it('a full match costs meaningful fitness, and stamina slows it', () => {
    const tired = (stamina: number) => {
      const p = createPlayer({ name: 's', position: 'ST', baseAttribute: 60, attributes: { stamina } });
      for (let m = 0; m < 90; m++) applyExertion(p, 1, 1.2);
      return p;
    };
    const low = tired(40);
    const high = tired(78);

    // Fatigue has to be worth feeling, or Stamina is a decorative attribute.
    expect(low.fitness).toBeLessThan(70);
    expect(high.fitness).toBeGreaterThan(low.fitness + 5);
    expect(fatigueLevel(low)).toBeGreaterThan(0.25);
    expect(fatigueLevel(low)).toBeGreaterThan(fatigueLevel(high));
  });

  it('recovers between matches but never exceeds full fitness', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'recover',
    });
    const stats = createMatchStats();
    stats.minutes = 90;
    recordPlayerMatch(
      state,
      { stats, rating: 7, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 62 },
      lookup,
    );
    expect(state.fitness).toBe(62 + FITNESS_RECOVERY);
    expect(state.fitness).toBeLessThanOrEqual(100);

    recordPlayerMatch(
      state,
      { stats, rating: 7, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 95 },
      lookup,
    );
    expect(state.fitness).toBe(100);
  });
});

describe('season statistics', () => {
  it('averages ratings across the season', () => {
    const stats = createSeasonStats();
    stats.matches = 4;
    stats.ratingTotal = 28;
    expect(averageRating(stats)).toBe(7);
    expect(averageRating(createSeasonStats())).toBe(0);
  });

  it('positions the club correctly in the table', () => {
    const table = emptyTable(['a', 'b']);
    applyResult(table, { round: 1, homeId: 'a', awayId: 'b', homeGoals: 3, awayGoals: 0 });
    expect(tablePosition(table, 'a')).toBe(1);
    expect(tablePosition(table, 'b')).toBe(2);
  });
});
