import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { TEAMS, getTeam, teamsInDivision } from '../src/data/gameData.ts';
import {
  DIVISIONS,
  PROMOTION_PLACES,
  RELEGATION_PLACES,
  divisionInfo,
  divisionOf,
  divisionPrestige,
  initialDivisions,
  isBottomDivision,
  isTopDivision,
  movementFor,
  resolveDivisions,
  simulateDivisionSeason,
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

describe('the shape of the pyramid', () => {
  it('splits the loaded clubs into the divisions they belong to', () => {
    const divisions = initialDivisions(TEAMS);
    expect(divisions).toHaveLength(DIVISIONS.length);
    expect(divisions.flat()).toHaveLength(TEAMS.length);
    expect(divisions[0]).toEqual(teamsInDivision(1).map((t) => t.id));
    expect(divisions[1]).toEqual(teamsInDivision(2).map((t) => t.id));
  });

  it('places every club exactly once', () => {
    const all = initialDivisions(TEAMS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('values the top flight above the one below it', () => {
    expect(divisionPrestige(1)).toBeGreaterThan(divisionPrestige(2));
    expect(divisionPrestige(1)).toBe(1);
  });

  it('knows the ends of the ladder', () => {
    expect(isTopDivision(1)).toBe(true);
    expect(isTopDivision(2)).toBe(false);
    expect(isBottomDivision(2)).toBe(true);
    expect(isBottomDivision(1)).toBe(false);
  });

  it('describes an unknown division as the bottom one rather than throwing', () => {
    expect(divisionInfo(99)).toBe(DIVISIONS[DIVISIONS.length - 1]);
  });

  it('reports which division a club is in, and 0 for one that is in none', () => {
    const divisions = initialDivisions(TEAMS);
    expect(divisionOf(divisions, teamsInDivision(1)[0]!.id)).toBe(1);
    expect(divisionOf(divisions, teamsInDivision(2)[0]!.id)).toBe(2);
    expect(divisionOf(divisions, 'no-such-club')).toBe(0);
  });
});

describe('simulating a division the player is not in', () => {
  it('plays a full double round-robin and gives everyone the same number of games', () => {
    const teams = teamsInDivision(2);
    const table = simulateDivisionSeason(new Rng('bg'), teams);
    expect(table).toHaveLength(teams.length);
    for (const row of table) expect(row.played).toBe((teams.length - 1) * 2);
  });

  it('is deterministic from its seed', () => {
    const teams = teamsInDivision(2);
    const a = simulateDivisionSeason(new Rng('same'), teams);
    const b = simulateDivisionSeason(new Rng('same'), teams);
    expect(a).toEqual(b);
  });

  it('usually puts the stronger clubs above the weaker ones', () => {
    // Not a guarantee for any one season, so this asks the aggregate question:
    // across many seasons the best club should finish above the worst.
    const teams = teamsInDivision(2);
    const best = teams.reduce((a, b) => (a.ratings.attack > b.ratings.attack ? a : b));
    const worst = teams.reduce((a, b) => (a.ratings.attack < b.ratings.attack ? a : b));

    let bestAbove = 0;
    for (let seed = 0; seed < 30; seed++) {
      const table = simulateDivisionSeason(new Rng(`s${seed}`), teams);
      const bestPos = table.findIndex((r) => r.teamId === best.id);
      const worstPos = table.findIndex((r) => r.teamId === worst.id);
      if (bestPos < worstPos) bestAbove += 1;
    }
    expect(bestAbove).toBeGreaterThan(20);
  });
});

describe('promotion and relegation', () => {
  const divisions = initialDivisions(TEAMS);

  it('sends the bottom of a division down and brings the top of the one below up', () => {
    const top = divisions[0]!;
    const outcome = resolveDivisions(new Rng('swap'), {
      divisions,
      playerDivision: 1,
      playerTable: tableInOrder(top),
      lookup,
    });

    // tableInOrder ranks by the order given, so the last entries went down.
    const expectedDown = top.slice(top.length - RELEGATION_PLACES);
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

  it('never changes the size of a division', () => {
    let current: string[][] = divisions.map((d) => d.slice());
    for (let season = 0; season < 12; season++) {
      const outcome = resolveDivisions(new Rng(`s${season}`), {
        divisions: current,
        playerDivision: 1,
        playerTable: tableInOrder(current[0]!),
        lookup,
      });
      current = outcome.divisions;
      expect(current[0]).toHaveLength(divisions[0]!.length);
      expect(current[1]).toHaveLength(divisions[1]!.length);
    }
  });

  it('never loses or duplicates a club, however many seasons pass', () => {
    let current: string[][] = divisions.map((d) => d.slice());
    for (let season = 0; season < 25; season++) {
      const outcome = resolveDivisions(new Rng(`long${season}`), {
        divisions: current,
        playerDivision: 1,
        playerTable: tableInOrder(current[0]!),
        lookup,
      });
      current = outcome.divisions;
      const all = current.flat();
      expect(new Set(all).size).toBe(TEAMS.length);
      expect(all).toHaveLength(TEAMS.length);
    }
  });

  it('uses the played table for the player\'s division rather than simulating it', () => {
    const top = divisions[0]!;
    const played = tableInOrder(top);
    const outcome = resolveDivisions(new Rng('real'), {
      divisions,
      playerDivision: 1,
      playerTable: played,
      lookup,
    });
    expect(outcome.tables[0]).toEqual(sortTable(played));
  });

  it('simulates the division the player is not in', () => {
    const outcome = resolveDivisions(new Rng('other'), {
      divisions,
      playerDivision: 1,
      playerTable: tableInOrder(divisions[0]!),
      lookup,
    });
    // Every second-division club has a completed season, not an empty row.
    expect(outcome.tables[1]).toHaveLength(divisions[1]!.length);
    for (const row of outcome.tables[1]!) expect(row.played).toBeGreaterThan(0);
  });

  it('reports no movement for a club that stayed where it was', () => {
    const top = divisions[0]!;
    const outcome = resolveDivisions(new Rng('stay'), {
      divisions,
      playerDivision: 1,
      playerTable: tableInOrder(top),
      lookup,
    });
    expect(movementFor(outcome, top[0]!)).toBeNull();
  });
});
