import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import type { TableRow } from './league.ts';
import { applyResult, emptyTable, generateFixtures, simulateFixture, sortTable } from './league.ts';

/**
 * DIVISIONS WITHIN A COUNTRY
 *
 * A country's league pyramid, and the movement between its tiers.
 *
 * The world currently gives every country a SINGLE tier, so promotion and
 * relegation are dormant: `resolveDivisions` on a one-tier pyramid simulates
 * the table and swaps nobody. That is deliberate rather than accidental. The
 * mechanics are written, tested and wired in, so adding a second tier to a
 * country is a data change plus a fixture list — not a re-implementation.
 *
 * What used to live here and now does not: league NAMES and PRESTIGE. When the
 * world was a single pyramid, "which division" answered "how big is this
 * league". With a map of countries it does not — the second tier of a big
 * country and the first tier of a small one are different questions — so both
 * moved to core/career/countries.ts.
 *
 * The tier a player is in is still called his `division`, and 1 is still the
 * top of his own country's pyramid.
 */

/** How many clubs go down from a tier each season, once there is one below. */
export const RELEGATION_PLACES = 2;

/** How many come up from the tier below. Kept equal, so sizes are stable. */
export const PROMOTION_PLACES = 2;

/**
 * Play out a full season for a division the player is not in.
 *
 * Uses the same fixture generator and scoreline model as the neutral fixtures
 * in the player's own league, so every league in the world is decided by the
 * same football and a table from one is comparable with a table from another.
 */
export function simulateDivisionSeason(rng: Rng, teams: readonly Team[]): TableRow[] {
  return simulateDivisionThrough(rng, teams, Number.POSITIVE_INFINITY);
}

/**
 * The same season, stopped after `rounds` rounds.
 *
 * This is what makes the other seven leagues in the world LIVE rather than a
 * result announced in June. Nothing about them is stored in the save: a table
 * is a pure function of (seed, season, country, rounds played), so the league
 * browser recomputes whichever one you are looking at and it always agrees with
 * the final table that same seed will produce at the end of the season.
 *
 * Fixtures are generated from the same rng as the results, so a partial
 * simulation is a genuine prefix of the full one rather than a different season
 * that happens to stop early.
 */
export function simulateDivisionThrough(
  rng: Rng,
  teams: readonly Team[],
  rounds: number,
): TableRow[] {
  const ids = teams.map((team) => team.id);
  const byId = new Map(teams.map((team) => [team.id, team]));
  const table = emptyTable(ids);

  for (const fixture of generateFixtures(ids, rng)) {
    if (fixture.round > rounds) continue;
    const home = byId.get(fixture.homeId);
    const away = byId.get(fixture.awayId);
    if (!home || !away) continue;
    const { homeGoals, awayGoals } = simulateFixture(rng, home, away);
    applyResult(table, { ...fixture, homeGoals, awayGoals });
  }

  return sortTable(table);
}

/** What a season did to one club's division. */
export type DivisionMovement = 'promoted' | 'relegated';

export interface DivisionOutcome {
  /** Final table for every division, index 0 being the top flight. */
  tables: TableRow[][];
  /** New membership for every division, index 0 being the top flight. */
  divisions: string[][];
  /** Clubs that went up, and the division they arrived in. */
  promoted: { teamId: string; toDivision: number }[];
  /** Clubs that went down, and the division they arrived in. */
  relegated: { teamId: string; toDivision: number }[];
}

export interface ResolveDivisionsInput {
  /** Current membership, index 0 being the top flight. */
  divisions: readonly (readonly string[])[];
  /** The division the player just played in. */
  playerDivision: number;
  /** The real, played table for the player's own division. */
  playerTable: readonly TableRow[];
  lookup: (id: string) => Team;
}

/**
 * Close the season across every division and move clubs between them.
 *
 * The player's own division uses the table he actually played out; every other
 * one is simulated here. Swaps are strictly equal in both directions, so a
 * division never changes size and a fixture list never needs a bye.
 */
export function resolveDivisions(rng: Rng, input: ResolveDivisionsInput): DivisionOutcome {
  const tables = input.divisions.map((ids, index) => {
    if (index + 1 === input.playerDivision) return sortTable(input.playerTable);
    return simulateDivisionSeason(rng.fork(`division:${index + 1}`), ids.map(input.lookup));
  });

  const divisions = input.divisions.map((ids) => ids.slice());
  const promoted: { teamId: string; toDivision: number }[] = [];
  const relegated: { teamId: string; toDivision: number }[] = [];

  for (let upper = 0; upper + 1 < divisions.length; upper++) {
    const lower = upper + 1;
    const goingDown = bottomOf(tables[upper]!, RELEGATION_PLACES, divisions[upper]!);
    const comingUp = topOf(tables[lower]!, PROMOTION_PLACES, divisions[lower]!);
    // Only ever swap in pairs, so neither division changes size even if a table
    // is somehow shorter than the number of places (a very small division).
    const swaps = Math.min(goingDown.length, comingUp.length);

    for (let i = 0; i < swaps; i++) {
      const down = goingDown[i]!;
      const up = comingUp[i]!;
      divisions[upper] = divisions[upper]!.filter((id) => id !== down).concat(up);
      divisions[lower] = divisions[lower]!.filter((id) => id !== up).concat(down);
      relegated.push({ teamId: down, toDivision: lower + 1 });
      promoted.push({ teamId: up, toDivision: upper + 1 });
    }
  }

  return { tables, divisions, promoted, relegated };
}

/** The lowest `count` clubs of a table, worst last, restricted to members. */
function bottomOf(table: readonly TableRow[], count: number, members: readonly string[]): string[] {
  const ranked = table.filter((row) => members.includes(row.teamId));
  return ranked.slice(Math.max(0, ranked.length - count)).map((row) => row.teamId);
}

/** The top `count` clubs of a table, best first, restricted to members. */
function topOf(table: readonly TableRow[], count: number, members: readonly string[]): string[] {
  return table
    .filter((row) => members.includes(row.teamId))
    .slice(0, count)
    .map((row) => row.teamId);
}

/** Which division a club is in, given a membership list. 0 if it is in none. */
export function divisionOf(divisions: readonly (readonly string[])[], teamId: string): number {
  const index = divisions.findIndex((ids) => ids.includes(teamId));
  return index === -1 ? 0 : index + 1;
}

/** What happened to one club, for the review screen to report. */
export function movementFor(outcome: DivisionOutcome, teamId: string): DivisionMovement | null {
  if (outcome.promoted.some((entry) => entry.teamId === teamId)) return 'promoted';
  if (outcome.relegated.some((entry) => entry.teamId === teamId)) return 'relegated';
  return null;
}
