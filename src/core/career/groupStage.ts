import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import type { CupState } from './cups.ts';
import { createCup } from './cups.ts';
import type { Fixture, FixtureResult, TableRow } from './league.ts';
import { applyResult, emptyTable, generateFixtures, simulateFixture, sortTable } from './league.ts';

/**
 * A GROUP STAGE, AND THE KNOCKOUT THAT COMES OUT OF IT
 *
 * Groups first, then a bracket seeded off them. The shape a modern European
 * competition has, and the shape the international tournament has had since it
 * was built.
 *
 * WHY IT IS WORTH THE COMPLICATION over a straight knockout. A cup tie is one
 * afternoon, which is exactly what makes a cup worth playing and exactly what
 * makes it a poor way to decide who the best sixteen clubs in Europe are: a
 * good side drawn badly is gone in September having played once. A group gives
 * everybody three matches, so going out means being worse over a month rather
 * than worse for ninety minutes — and it makes the last group match matter,
 * which a first-round tie never can.
 *
 * It also changes what a European season IS for a player. Four knockout rounds
 * meant a club that went out early gave him one European night all year. Three
 * group matches are guaranteed, so qualifying for Europe is worth something
 * even to a club that will not win it — which is the point of qualifying.
 *
 * THE KNOCKOUT IS SEEDED, NOT DRAWN. Group winners meet runners-up, and never
 * each other before the final rounds. That is the entire payoff for topping a
 * group; an open draw would make the group stage a formality that only decided
 * who was still alive.
 *
 * WHY THIS IS NOT SHARED WITH `international.ts`, which has the same shape. Its
 * state calls its own field `kind` and uses it for WHICH tournament is being
 * played, where every other competition uses `kind` for which competition it
 * is. Those two meanings cannot both live on one object, and renaming a field
 * that sits in every save on disk to avoid duplicating eighty lines of
 * orchestration is a bad trade. The duplication is deliberate and this comment
 * is the record of it.
 */

export interface GroupStage<K extends string> {
  /** Which competition this is. */
  kind: K;
  /**
   * The groups, fixed when the stage was drawn.
   *
   * STORED rather than recomputed. The field comes from last season's league
   * placings and cup winners, and by the time a group match is played those
   * tables have been archived — a recomputed draw would eventually disagree
   * with the fixture list it was drawn alongside.
   */
  groups: string[][];
  /** Group fixtures for EVERY group, in playing order. */
  fixtures: Fixture[];
  /** Results so far, oldest first. */
  results: FixtureResult[];
  /** Every club in the competition, one row each. Sliced by group for display. */
  table: TableRow[];
  /** Group rounds settled so far. */
  groupRoundsPlayed: number;
  /** The bracket, once the groups have finished. Null until then. */
  knockout: CupState<K> | null;
}

/** Clubs in each group. Four is the only size the world is built for. */
export const GROUP_SIZE = 4;

/** Matches each club plays in its group: everybody else, once. */
export const GROUP_MATCHES = GROUP_SIZE - 1;

/** How many go through from each group. */
export const QUALIFY_PER_GROUP = 2;

/**
 * Split a field into groups of four, snake-seeded off the order it arrives in.
 *
 * The field comes in strength order — Champions League entrants are their
 * countries' league winners, listed by the European order — so slicing it into
 * consecutive fours would put every strong club in group one. Snaking deals
 * them out 1-2-3-4, 4-3-2-1, which is how a seeded draw is meant to spread a
 * pot and keeps every group worth playing.
 */
export function drawGroups(field: readonly string[], size = GROUP_SIZE): string[][] {
  const count = Math.max(1, Math.floor(field.length / size));
  const groups: string[][] = Array.from({ length: count }, () => []);

  field.slice(0, count * size).forEach((id, index) => {
    const row = Math.floor(index / count);
    const column = index % count;
    // Every other row is dealt backwards, which is what makes it a snake.
    groups[row % 2 === 0 ? column : count - 1 - column]!.push(id);
  });

  return groups;
}

export function createGroupStage<K extends string>(
  kind: K,
  field: readonly string[],
  rng: Rng,
  rounds = GROUP_MATCHES,
): GroupStage<K> {
  const groups = drawGroups(field);
  const fixtures: Fixture[] = [];
  for (const group of groups) {
    // One rng carried through every group, drawn one after another: it advances
    // its own state, so the draws are independent without each needing a seed.
    for (const fixture of generateFixtures(group, rng)) {
      if (fixture.round <= rounds) fixtures.push(fixture);
    }
  }

  return {
    kind,
    groups,
    fixtures,
    results: [],
    table: emptyTable(groups.flat()),
    groupRoundsPlayed: 0,
    knockout: null,
  };
}

/** The fixture a club has in one group round, if it has one. */
export function groupFixtureFor<K extends string>(
  stage: GroupStage<K>,
  clubId: string,
  round: number,
): Fixture | null {
  return (
    stage.fixtures.find(
      (fixture) =>
        fixture.round === round && (fixture.homeId === clubId || fixture.awayId === clubId),
    ) ?? null
  );
}

/**
 * Record one result, ignoring one that has already been recorded.
 *
 * Idempotent on purpose: the player's own fixture is recorded when he plays it
 * and the round is settled around him afterwards, so the same fixture is
 * offered to this function twice and must only count once.
 */
export function recordGroupResult<K extends string>(
  stage: GroupStage<K>,
  result: FixtureResult,
): void {
  const already = stage.results.some(
    (r) => r.round === result.round && r.homeId === result.homeId && r.awayId === result.awayId,
  );
  if (already) return;
  stage.results.push(result);
  applyResult(stage.table, result);
}

/**
 * Settle every fixture in one round except the player's own.
 *
 * `skipId` is left unresolved for the caller to play, exactly as a cup round
 * leaves his tie alone — resolving it here would decide his match around him
 * and hand the result to somebody else.
 */
export function playGroupRound<K extends string>(
  rng: Rng,
  stage: GroupStage<K>,
  round: number,
  lookup: (id: string) => Team,
  skipId?: string,
): void {
  for (const fixture of stage.fixtures.filter((f) => f.round === round)) {
    if (skipId && (fixture.homeId === skipId || fixture.awayId === skipId)) continue;
    const { homeGoals, awayGoals } = simulateFixture(
      rng.fork(`${round}:${fixture.homeId}`),
      lookup(fixture.homeId),
      lookup(fixture.awayId),
    );
    recordGroupResult(stage, { ...fixture, homeGoals, awayGoals });
  }
}

/** Mark a round complete once every fixture in it has a result. */
export function closeGroupRound<K extends string>(stage: GroupStage<K>, round: number): void {
  const complete = stage.fixtures
    .filter((f) => f.round === round)
    .every((f) => stage.results.some((r) => r.round === round && r.homeId === f.homeId));
  if (complete) stage.groupRoundsPlayed = Math.max(stage.groupRoundsPlayed, round);
}

/** One group's table, best first. */
export function groupTableOf<K extends string>(stage: GroupStage<K>, group: number): TableRow[] {
  const members = new Set(stage.groups[group] ?? []);
  return sortTable(stage.table.filter((row) => members.has(row.teamId)));
}

/** Which group a club is in, or -1. */
export function groupIndexOf<K extends string>(stage: GroupStage<K>, clubId: string): number {
  return stage.groups.findIndex((group) => group.includes(clubId));
}

/** Where a club stands in its group, counting from 1. Zero when it is not in one. */
export function groupPositionOf<K extends string>(stage: GroupStage<K>, clubId: string): number {
  const group = groupIndexOf(stage, clubId);
  if (group === -1) return 0;
  return groupTableOf(stage, group).findIndex((row) => row.teamId === clubId) + 1;
}

/**
 * Build the bracket from the finished groups.
 *
 * Crossed and seeded: each group's winner is paired with the NEXT group's
 * runner-up, so two winners cannot meet until the round after the first. That
 * is what topping a group buys, and an open draw here would delete it.
 *
 * Returns null while the groups are unfinished, which is also how a caller asks
 * "are we there yet".
 */
export function startKnockout<K extends string>(
  stage: GroupStage<K>,
  rounds = GROUP_MATCHES,
): CupState<K> | null {
  if (stage.knockout) return stage.knockout;
  if (stage.groupRoundsPlayed < rounds) return null;

  const tables = stage.groups.map((_, index) => groupTableOf(stage, index));
  const qualified: string[] = [];
  for (let group = 0; group < tables.length; group += 1) {
    const other = (group + 1) % tables.length;
    qualified.push(
      tables[group]![0]?.teamId ?? '',
      tables[other]![QUALIFY_PER_GROUP - 1]?.teamId ?? '',
    );
  }
  // A group that could not fill its places means a malformed field; better no
  // knockout than a bracket with an empty slot in it.
  if (qualified.some((id) => !id)) return null;

  stage.knockout = createCup(stage.kind, stage.kind, qualified, { seeded: true });
  return stage.knockout;
}

/** Did this club get out of its group? */
export function reachedKnockout<K extends string>(
  stage: GroupStage<K>,
  clubId: string,
): boolean {
  const knockout = stage.knockout;
  if (!knockout) return false;
  const field = knockout.rounds[0]
    ? knockout.rounds[0].ties.flatMap((tie) => [tie.homeId, tie.awayId])
    : knockout.survivors;
  return field.includes(clubId);
}

/** Who won the whole thing, once somebody has. */
export function winnerOf<K extends string>(stage: GroupStage<K> | null): string | null {
  return stage?.knockout?.winnerId ?? null;
}

/** Is this club still in it, in either half of the competition? */
export function stillInCompetition<K extends string>(
  stage: GroupStage<K>,
  clubId: string,
  rounds = GROUP_MATCHES,
): boolean {
  if (stage.groupRoundsPlayed < rounds) return groupIndexOf(stage, clubId) !== -1;
  return !!stage.knockout && stage.knockout.survivors.includes(clubId);
}
