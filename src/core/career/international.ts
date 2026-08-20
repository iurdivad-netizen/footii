import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import type { CupState } from './cups.ts';
import { createCup } from './cups.ts';
import type { Fixture, FixtureResult, TableRow } from './league.ts';
import {
  applyResult,
  emptyTable,
  generateFixtures,
  simulateFixture,
  sortTable,
} from './league.ts';
import { QUALIFY_PER_GROUP, nationId, qualifyingGroups } from './nations.ts';

/**
 * INTERNATIONAL FOOTBALL
 *
 * The one competition a player cannot transfer into. Everything else in a
 * career is a choice — which club, which country, which league — and this is
 * the part that is decided FOR him, by a nationality he picked before he had
 * played a match and a reputation he has to earn every season. That is why it
 * is worth having: it is the only thing in the game he can be left out of.
 *
 * THE SHAPE. Eight nations, one tournament a year:
 *
 *   GROUPS      two of four, three matches each, everybody plays everybody in
 *               their group. A four-match campaign against four of seven
 *               possible opponents could never produce a fair table; a group
 *               can, which matters when finishing second sends you home.
 *   KNOCKOUT    the top two of each group, crossed — winners meet runners-up,
 *               never each other. Then a final.
 *
 * Five matches for a nation that goes all the way, three for one that goes out
 * in the groups. Crossing the bracket rather than drawing it is what makes
 * winning a group worth something; an open draw would make the group stage a
 * qualification formality and nothing else.
 *
 * WHY YEARLY rather than every second summer, as football does it. A career is
 * eighteen-odd seasons and a player's peak is perhaps six of them. On a biennial
 * cycle a career gets three tournaments, of which he is good enough for one or
 * two — so the whole system would be something most careers glimpse once. Yearly
 * makes international football something a career actually has.
 */

/** The competition's id, as the calendar and the record book know it. */
export const INTERNATIONAL = 'international';
export type InternationalKind = typeof INTERNATIONAL;

/** Group matches each nation plays: everybody else in a group of four. */
export const GROUP_ROUNDS = 3;
/** Knockout rounds: semi-final, final. */
export const KNOCKOUT_ROUNDS = 2;
/** The most international matches one nation can play in a season. */
export const INTERNATIONAL_MATCHES = GROUP_ROUNDS + KNOCKOUT_ROUNDS;

export interface InternationalState {
  /**
   * Group fixtures for BOTH groups, in playing order.
   *
   * Both, not just the player's, because the knockout is seeded off the other
   * group's final table as much as his own — there is nothing to derive it from
   * later, so the whole group stage is played here.
   */
  fixtures: Fixture[];
  /** Results so far, oldest first. */
  results: FixtureResult[];
  /** Every nation, one row each. Sliced by group for display. */
  table: TableRow[];
  /**
   * The groups, as nation ids, fixed when the tournament was drawn.
   *
   * STORED rather than recomputed. The field is the eight countries highest in
   * the European order, and that order moves every season — so recomputing the
   * groups from today's order would eventually disagree with the fixture list
   * drawn from last summer's, and a nation would be reading a table it was
   * never in.
   */
  groups: string[][];
  /** Group rounds settled so far, 0 to GROUP_ROUNDS. */
  groupRoundsPlayed: number;
  /** The knockout, once the groups have finished. Null until then. */
  knockout: CupState<InternationalKind> | null;
}

/**
 * The groups of a tournament, as nation ids rather than country ids.
 *
 * Read off the state, so it always agrees with the fixtures that were drawn
 * with it.
 */
export function nationGroups(state: InternationalState): string[][] {
  return state.groups ?? [];
}

/** The groups a fresh tournament would be drawn into, from a European order. */
export function drawGroups(order?: readonly string[]): string[][] {
  return qualifyingGroups(order).map((group) => group.map(nationId));
}

/**
 * A fresh international season.
 *
 * The fixture list is the FIRST HALF of a double round-robin per group — three
 * rounds in which everybody plays everybody once. A nation hosts some and
 * travels to others, which is as close to a neutral tournament as a model with
 * home advantage gets.
 */
export function createInternational(rng: Rng, order?: readonly string[]): InternationalState {
  const groups = drawGroups(order);
  const fixtures: Fixture[] = [];
  for (const group of groups) {
    // The same rng for both groups, drawn one after the other: it carries its
    // own state forward, so the two draws are independent without either
    // needing a seed of its own.
    for (const fixture of generateFixtures(group, rng)) {
      if (fixture.round <= GROUP_ROUNDS) fixtures.push(fixture);
    }
  }

  return {
    fixtures,
    results: [],
    table: emptyTable(groups.flat()),
    groups,
    groupRoundsPlayed: 0,
    knockout: null,
  };
}

/** The fixture a nation plays in a given group round, if it has one. */
export function groupFixture(
  state: InternationalState,
  nation: string,
  round: number,
): Fixture | null {
  return (
    state.fixtures.find(
      (f) => f.round === round && (f.homeId === nation || f.awayId === nation),
    ) ?? null
  );
}

/**
 * Settle one round of group matches.
 *
 * `playerNation` is left for the caller to play, exactly as a cup round leaves
 * the player's own tie — everything else in the round is resolved around him.
 */
export function playGroupRound(
  rng: Rng,
  state: InternationalState,
  round: number,
  lookup: (nationId: string) => Team,
  playerNation?: string,
): void {
  for (const fixture of state.fixtures) {
    if (fixture.round !== round) continue;
    if (playerNation && (fixture.homeId === playerNation || fixture.awayId === playerNation)) {
      continue;
    }
    if (state.results.some((r) => r.round === round && r.homeId === fixture.homeId)) continue;
    const { homeGoals, awayGoals } = simulateFixture(
      rng,
      lookup(fixture.homeId),
      lookup(fixture.awayId),
    );
    recordGroupResult(state, { ...fixture, homeGoals, awayGoals });
  }
}

/** Fold one group result into the table, whoever played it. */
export function recordGroupResult(state: InternationalState, result: FixtureResult): void {
  if (
    state.results.some(
      (r) => r.round === result.round && r.homeId === result.homeId && r.awayId === result.awayId,
    )
  ) {
    return;
  }
  state.results.push(result);
  applyResult(state.table, result);
}

/** Mark a group round complete once every fixture in it has a result. */
export function closeGroupRound(state: InternationalState, round: number): void {
  const played = state.fixtures
    .filter((f) => f.round === round)
    .every((f) => state.results.some((r) => r.round === round && r.homeId === f.homeId));
  if (played) state.groupRoundsPlayed = Math.max(state.groupRoundsPlayed, round);
}

/** One group's table, best first. */
export function groupTable(state: InternationalState, group: number): TableRow[] {
  const members = new Set(nationGroups(state)[group] ?? []);
  return sortTable(state.table.filter((row) => members.has(row.teamId)));
}

/** Which group a nation is in, or -1. */
export function groupIndexOf(state: InternationalState, nation: string): number {
  return nationGroups(state).findIndex((group) => group.includes(nation));
}

/** Where a nation stands in its group, counting from 1. */
export function groupPosition(state: InternationalState, nation: string): number {
  const group = groupIndexOf(state, nation);
  if (group === -1) return 0;
  return groupTable(state, group).findIndex((row) => row.teamId === nation) + 1;
}

/**
 * Build the knockout from the finished groups.
 *
 * CROSSED, and seeded rather than drawn: the winner of one group meets the
 * runner-up of the other, and the two group winners can only meet in the final.
 * That is the entire payoff for topping a group, and an open draw would delete
 * it.
 */
export function startKnockout(state: InternationalState): CupState<InternationalKind> | null {
  if (state.knockout) return state.knockout;
  if (state.groupRoundsPlayed < GROUP_ROUNDS) return null;

  const qualified: string[] = [];
  const tables = Array.from({ length: nationGroups(state).length }, (_, group) =>
    groupTable(state, group),
  );
  // A1 v B2, then B1 v A2 — the order the bracket is paired in, since a seeded
  // draw pairs adjacent survivors.
  const groupCount = tables.length;
  for (let group = 0; group < groupCount; group++) {
    const other = (group + 1) % groupCount;
    qualified.push(tables[group]![0]?.teamId ?? '', tables[other]![QUALIFY_PER_GROUP - 1]?.teamId ?? '');
  }
  if (qualified.some((id) => !id)) return null;

  state.knockout = createCup(INTERNATIONAL, INTERNATIONAL, qualified, { seeded: true });
  return state.knockout;
}

/**
 * Did this nation qualify for the knockout?
 *
 * Asks the FIELD, not the survivors. A nation that reached the semi-final and
 * lost it still reached the knockout — `survivors` answers the different
 * question of who is still in, which `stillIn` already exists to ask.
 */
export function reachedKnockout(state: InternationalState, nation: string): boolean {
  return knockoutField(state).includes(nation);
}

/** Who won the whole thing, once it is finished. */
export function championNation(state: InternationalState): string | null {
  return state.knockout?.winnerId ?? null;
}

/**
 * Every nation that qualified for the knockout, in bracket order.
 *
 * Reads the first round once it has been drawn, and the survivors before that.
 * The distinction matters: a round is only drawn when somebody reaches it, so a
 * tournament nobody has played yet has a full field and no rounds at all —
 * reading the rounds alone reported every qualified nation as eliminated.
 */
export function knockoutField(state: InternationalState): string[] {
  const knockout = state.knockout;
  if (!knockout) return [];
  const first = knockout.rounds[0];
  return first ? first.ties.flatMap((t) => [t.homeId, t.awayId]) : knockout.survivors.slice();
}
