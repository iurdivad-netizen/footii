import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import type { TableRow } from './league.ts';
import { applyResult, emptyTable, generateFixtures, simulateFixture, sortTable } from './league.ts';

/**
 * DIVISIONS, PROMOTION AND RELEGATION
 *
 * The transfer market gave a career a ladder to climb; this gives the ladder
 * somewhere to go. With a single division, a player who signed for the best
 * club in the game had reached the end of the world: reputation kept rising,
 * nobody better could ever bid, and every remaining summer was silent.
 *
 * Two divisions change three things at once:
 *
 *   1. WHERE you play is now a level, not just a badge. Winning the second
 *      division is a real season with a real prize, and the club you join in it
 *      may not be there next year.
 *   2. Your club can move without you. Relegation is the one career event you
 *      do not choose, and it is the strongest reason the game can give you to
 *      take an offer you would otherwise turn down.
 *   3. Fame is scaled by the stage. A hat-trick in the second division is worth
 *      less than a hat-trick in the first, so climbing is worth doing.
 *
 * The division the player is NOT in is simulated in the background at the end
 * of each season — cheaply, with the same scoreline model the league already
 * uses for neutral fixtures. It is not a parallel career, it is a table that
 * has to be plausible enough to promote and relegate the right clubs.
 */

export interface Division {
  /** 1 is the top flight. */
  number: number;
  name: string;
  shortName: string;
  /**
   * How much of the football world is watching, 0-1.
   *
   * Scales reputation, wages and the fees clubs pay. Deliberately a steep drop
   * rather than a gentle one: the second division has to feel like somewhere
   * you are trying to get out of.
   */
  prestige: number;
}

export const DIVISIONS: readonly Division[] = [
  { number: 1, name: 'The Premier Division', shortName: 'Premier', prestige: 1 },
  { number: 2, name: 'The Championship', shortName: 'Championship', prestige: 0.62 },
];

/** How many clubs go down from a division each season. */
export const RELEGATION_PLACES = 2;

/** How many come up from the division below. Kept equal, so sizes are stable. */
export const PROMOTION_PLACES = 2;

export function divisionInfo(number: number): Division {
  return DIVISIONS.find((d) => d.number === number) ?? DIVISIONS[DIVISIONS.length - 1]!;
}

export function divisionPrestige(number: number): number {
  return divisionInfo(number).prestige;
}

export function isTopDivision(number: number): boolean {
  return number <= DIVISIONS[0]!.number;
}

export function isBottomDivision(number: number): boolean {
  return number >= DIVISIONS[DIVISIONS.length - 1]!.number;
}

/**
 * Play out a full season for a division the player is not in.
 *
 * Uses the same fixture generator and scoreline model as the neutral fixtures
 * in the player's own league, so the two divisions are decided by the same
 * football and a table from one is comparable with a table from the other.
 */
export function simulateDivisionSeason(rng: Rng, teams: readonly Team[]): TableRow[] {
  const ids = teams.map((team) => team.id);
  const byId = new Map(teams.map((team) => [team.id, team]));
  const table = emptyTable(ids);

  for (const fixture of generateFixtures(ids, rng)) {
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

/**
 * The starting shape of the league pyramid, from the loaded clubs.
 * A club with an unknown division is placed in the bottom one rather than
 * dropped, so a data error cannot silently shrink the game.
 */
export function initialDivisions(teams: readonly Team[]): string[][] {
  const bottom = DIVISIONS[DIVISIONS.length - 1]!.number;
  const placed = (team: Team) =>
    DIVISIONS.some((d) => d.number === team.division) ? team.division : bottom;

  return DIVISIONS.map((division) =>
    teams.filter((team) => placed(team) === division.number).map((team) => team.id),
  );
}
