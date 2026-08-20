import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { LEAGUE_COUNTRIES, TEAMS, getTeam, teamsInCountry } from '../src/data/gameData.ts';
import { initialLeagues, locateClub } from '../src/core/career/countries.ts';

/** Every country fields a league of this size. */
const LEAGUE_SIZE = 16;
import {
  PROMOTION_PLACES,
  RELEGATION_PLACES,
  divisionOf,
  movementFor,
  resolveDivisions,
  simulateDivisionSeason,
  simulateDivisionThrough,
} from '../src/core/career/divisions.ts';
import { applyResult, emptyTable, sortTable } from '../src/core/career/league.ts';
import type { TableRow } from '../src/core/career/league.ts';

const lookup = (id: string) => getTeam(id);

/** A finished table in a known order, best first. */
function tableInOrder(ids: readonly string[]): TableRow[] {
  const table = emptyTable(ids);
  // Give each club a distinct points total by beating everyone below it.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      applyResult(table, { round: 1, homeId: ids[i]!, awayId: ids[j]!, homeGoals: 1, awayGoals: 0 });
    }
  }
  return table;
}

const ENGLAND = teamsInCountry('england').map((t) => t.id);

describe('simulating a league the player is not in', () => {
  const clubs = teamsInCountry('spain');

  it('plays a full double round-robin and gives everyone the same number of games', () => {
    const table = simulateDivisionSeason(new Rng('bg'), clubs);
    expect(table).toHaveLength(clubs.length);
    for (const row of table) expect(row.played).toBe((clubs.length - 1) * 2);
  });

  it('is deterministic from its seed', () => {
    expect(simulateDivisionSeason(new Rng('same'), clubs)).toEqual(
      simulateDivisionSeason(new Rng('same'), clubs),
    );
  });

  it('usually puts the stronger clubs above the weaker ones', () => {
    // Not a guarantee for any one season, so this asks the aggregate question.
    const best = clubs.reduce((a, b) => (a.ratings.attack > b.ratings.attack ? a : b));
    const worst = clubs.reduce((a, b) => (a.ratings.attack < b.ratings.attack ? a : b));

    let bestAbove = 0;
    for (let seed = 0; seed < 30; seed++) {
      const table = simulateDivisionSeason(new Rng(`s${seed}`), clubs);
      const bestPos = table.findIndex((r) => r.teamId === best.id);
      const worstPos = table.findIndex((r) => r.teamId === worst.id);
      if (bestPos < worstPos) bestAbove += 1;
    }
    expect(bestAbove).toBeGreaterThan(20);
  });
});

describe('a league part-way through its season', () => {
  const clubs = teamsInCountry('italy');

  it('plays only the rounds asked for', () => {
    const table = simulateDivisionThrough(new Rng('part'), clubs, 5);
    for (const row of table) expect(row.played).toBeLessThanOrEqual(5);
    expect(table.some((row) => row.played === 5)).toBe(true);
  });

  it('has played nothing at all before the first round', () => {
    const table = simulateDivisionThrough(new Rng('none'), clubs, 0);
    for (const row of table) expect(row.played).toBe(0);
  });

  it('is a genuine PREFIX of the full season, not a different one', () => {
    // This is what lets the league browser recompute a table on demand: a
    // mid-season table must be the same season the final table will settle,
    // or a league would visibly rewrite its own history as the year went on.
    const full = simulateDivisionSeason(new Rng('prefix'), clubs);
    const prefix = simulateDivisionThrough(new Rng('prefix'), clubs, 30);
    expect(prefix).toEqual(full);
  });

  it('accumulates rather than jumping around as the season runs', () => {
    let previous = 0;
    for (const rounds of [2, 6, 12, 20, 30]) {
      const table = simulateDivisionThrough(new Rng('grow'), clubs, rounds);
      const played = table.reduce((sum, row) => sum + row.played, 0);
      expect(played).toBeGreaterThan(previous);
      previous = played;
    }
  });
});

describe('promotion and relegation between tiers', () => {
  // The world gives every country one tier today, so these run against a
  // hand-built two-tier pyramid — the shape a country takes the moment a second
  // division is added to the data.
  const upper = ENGLAND.slice(0, 8);
  const lower = ENGLAND.slice(8, 16);
  const pyramid = [upper, lower];

  it('sends the bottom of a tier down and brings the top of the one below up', () => {
    const outcome = resolveDivisions(new Rng('swap'), {
      divisions: pyramid,
      playerDivision: 1,
      playerTable: tableInOrder(upper),
      lookup,
    });

    const expectedDown = upper.slice(upper.length - RELEGATION_PLACES);
    for (const id of expectedDown) {
      expect(outcome.divisions[1]).toContain(id);
      expect(outcome.divisions[0]).not.toContain(id);
      expect(movementFor(outcome, id)).toBe('relegated');
    }

    expect(outcome.promoted).toHaveLength(PROMOTION_PLACES);
    for (const entry of outcome.promoted) {
      expect(outcome.divisions[0]).toContain(entry.teamId);
      expect(entry.toDivision).toBe(1);
      expect(movementFor(outcome, entry.teamId)).toBe('promoted');
    }
  });

  it('never changes the size of a tier, however many seasons pass', () => {
    let current: string[][] = pyramid.map((d) => d.slice());
    for (let season = 0; season < 20; season++) {
      const outcome = resolveDivisions(new Rng(`s${season}`), {
        divisions: current,
        playerDivision: 1,
        playerTable: tableInOrder(current[0]!),
        lookup,
      });
      current = outcome.divisions;
      expect(current[0]).toHaveLength(upper.length);
      expect(current[1]).toHaveLength(lower.length);
      const all = current.flat();
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('uses the played table for the player\'s own tier rather than simulating it', () => {
    const played = tableInOrder(upper);
    const outcome = resolveDivisions(new Rng('real'), {
      divisions: pyramid,
      playerDivision: 1,
      playerTable: played,
      lookup,
    });
    expect(outcome.tables[0]).toEqual(sortTable(played));
  });

  it('simulates the tier the player is not in', () => {
    const outcome = resolveDivisions(new Rng('other'), {
      divisions: pyramid,
      playerDivision: 1,
      playerTable: tableInOrder(upper),
      lookup,
    });
    expect(outcome.tables[1]).toHaveLength(lower.length);
    for (const row of outcome.tables[1]!) expect(row.played).toBeGreaterThan(0);
  });

  it('reports no movement for a club that stayed where it was', () => {
    const outcome = resolveDivisions(new Rng('stay'), {
      divisions: pyramid,
      playerDivision: 1,
      playerTable: tableInOrder(upper),
      lookup,
    });
    expect(movementFor(outcome, upper[0]!)).toBeNull();
  });

  it('moves nobody in a country with a single tier', () => {
    // The live case: every country has one division, so a season settles the
    // table and promotes nobody. The mechanics stay wired in and tested so that
    // adding a second tier is a data change rather than a re-implementation.
    const outcome = resolveDivisions(new Rng('flat'), {
      divisions: [ENGLAND],
      playerDivision: 1,
      playerTable: tableInOrder(ENGLAND),
      lookup,
    });
    expect(outcome.promoted).toEqual([]);
    expect(outcome.relegated).toEqual([]);
    expect(outcome.divisions[0]).toEqual(ENGLAND);
    expect(movementFor(outcome, ENGLAND[ENGLAND.length - 1]!)).toBeNull();
  });
});

describe('locating a club within a pyramid', () => {
  it('reports the tier a club is in, and 0 for one that is in none', () => {
    expect(divisionOf([ENGLAND], ENGLAND[0]!)).toBe(1);
    expect(divisionOf([[], ENGLAND], ENGLAND[0]!)).toBe(2);
    expect(divisionOf([ENGLAND], 'no-such-club')).toBe(0);
  });

  it('covers every club in the world', () => {
    // Asserted as the invariant rather than as a magic number: every country
    // fields a full league, and adding a country should not need this edited.
    expect(TEAMS).toHaveLength(LEAGUE_COUNTRIES.length * LEAGUE_SIZE);
    const leagues = initialLeagues(TEAMS);
    for (const team of TEAMS) {
      expect(locateClub(leagues, team.id), team.id).not.toBeNull();
    }
  });
});
