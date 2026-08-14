import { clamp01, unit } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import { teamStrength } from '../team/team.ts';

/**
 * LEAGUE AND FIXTURES
 *
 * A lightweight competition model: a double round-robin between the loaded
 * teams, with every match the player is not involved in resolved by a cheap
 * probabilistic scoreline.
 *
 * The point is context, not fidelity. A result only means something if it moves
 * you up or down a table, and a season only means something if it ends
 * somewhere. Everything here is deterministic from the season's seed.
 */

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
}

export interface FixtureResult extends Fixture {
  homeGoals: number;
  awayGoals: number;
}

export interface TableRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/**
 * Circle-method double round-robin.
 * With an odd number of teams one sits out each round (a bye).
 */
export function generateFixtures(teamIds: readonly string[], rng: Rng): Fixture[] {
  const ids = rng.shuffle(teamIds);
  const withBye = ids.length % 2 === 0 ? ids.slice() : [...ids, '__bye__'];
  const count = withBye.length;
  const rounds = count - 1;
  const half = count / 2;

  const fixtures: Fixture[] = [];
  let rotation = withBye.slice();

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = rotation[i]!;
      const away = rotation[count - 1 - i]!;
      if (home === '__bye__' || away === '__bye__') continue;
      // Alternate home advantage between the two halves of the season.
      const flip = round % 2 === 1;
      fixtures.push({
        round: round + 1,
        homeId: flip ? away : home,
        awayId: flip ? home : away,
      });
    }
    // Rotate all but the first entry.
    rotation = [rotation[0]!, rotation[count - 1]!, ...rotation.slice(1, count - 1)];
  }

  // Second half of the season: same fixtures with venues reversed.
  const secondHalf = fixtures.map((f) => ({
    round: f.round + rounds,
    homeId: f.awayId,
    awayId: f.homeId,
  }));

  return [...fixtures, ...secondHalf];
}

/**
 * Resolve a match between two teams the player is not in.
 * Goals are drawn from a small Poisson-like process so scorelines look like
 * football: mostly 0-3 goals a side, occasionally a rout.
 */
export function simulateFixture(rng: Rng, home: Team, away: Team): { homeGoals: number; awayGoals: number } {
  const homeEdge = 0.25;
  const homeAttack = unit(home.ratings.attack) + homeEdge * 0.5;
  const awayAttack = unit(away.ratings.attack);
  const homeDefence = unit(home.ratings.defence) + homeEdge * 0.5;
  const awayDefence = unit(away.ratings.defence);

  const homeExpected = clamp01(0.35 + (homeAttack - awayDefence) * 0.55) * 3.4;
  const awayExpected = clamp01(0.35 + (awayAttack - homeDefence) * 0.55) * 3.0;

  return {
    homeGoals: poisson(rng, homeExpected),
    awayGoals: poisson(rng, awayExpected),
  };
}

/** Knuth's method, capped so a freak draw cannot produce an absurd scoreline. */
function poisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-Math.max(0.05, lambda));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng.next();
  } while (p > limit && k < 9);
  return k - 1;
}

export function emptyTable(teamIds: readonly string[]): TableRow[] {
  return teamIds.map((teamId) => ({
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));
}

export function applyResult(table: TableRow[], result: FixtureResult): void {
  const home = table.find((row) => row.teamId === result.homeId);
  const away = table.find((row) => row.teamId === result.awayId);
  if (!home || !away) return;

  home.played += 1;
  away.played += 1;
  home.goalsFor += result.homeGoals;
  home.goalsAgainst += result.awayGoals;
  away.goalsFor += result.awayGoals;
  away.goalsAgainst += result.homeGoals;

  if (result.homeGoals > result.awayGoals) {
    home.won += 1;
    home.points += 3;
    away.lost += 1;
  } else if (result.homeGoals < result.awayGoals) {
    away.won += 1;
    away.points += 3;
    home.lost += 1;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
  }
}

export function goalDifference(row: TableRow): number {
  return row.goalsFor - row.goalsAgainst;
}

/** Points, then goal difference, then goals scored. */
export function sortTable(table: readonly TableRow[]): TableRow[] {
  return table.slice().sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gd = goalDifference(b) - goalDifference(a);
    if (gd !== 0) return gd;
    return b.goalsFor - a.goalsFor;
  });
}

export function tablePosition(table: readonly TableRow[], teamId: string): number {
  return sortTable(table).findIndex((row) => row.teamId === teamId) + 1;
}

/** Coaching quality 0-1, used by the development model. */
export function coachingQuality(team: Team): number {
  return clamp01(teamStrength(team) * 0.8 + 0.1);
}
