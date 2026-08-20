import type { Rng } from '../rng.ts';
import { confederationAdjective } from './countries.ts';
import type { Team } from '../team/team.ts';
import type { CupState } from './cups.ts';
import { createCup, finishCup } from './cups.ts';
import type { Fixture, FixtureResult, TableRow } from './league.ts';
import {
  applyResult,
  emptyTable,
  generateFixtures,
  simulateFixture,
  sortTable,
} from './league.ts';
import {
  CONTINENTAL_FIELD,
  QUALIFY_PER_GROUP,
  continentalGroups,
  nationId,
  qualifyingGroups,
  worldTierGroups,
} from './nations.ts';
import { WORLD_TIERS, worldTierField } from './nations.ts';
import type { WorldTier } from './nations.ts';

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

/**
 * Which competition a tournament is.
 *
 * Three world tiers and a continental championship, mirroring the club game's
 * three European competitions and its domestic cups: everybody plays in one of
 * them, and which one is decided by standing rather than by geography.
 */
export type TournamentKind = WorldTier | 'continental';

/** Which half of the cycle a season is in. */
export type TournamentEra = 'world' | 'continental';

/** Group matches each nation plays: everybody else in a group of four. */
export const GROUP_ROUNDS = 3;
/** Knockout rounds in a tournament of eight: semi-final, final. */
export const KNOCKOUT_ROUNDS = 2;
/** And in one of sixteen: quarter-final, semi-final, final. */
export const WORLD_CUP_KNOCKOUT_ROUNDS = 3;

/**
 * How many knockout rounds a field of this size runs to.
 *
 * Read off the FIELD rather than the competition, because there are only two
 * shapes in the whole game — eight nations or sixteen — and every tournament is
 * one of them. Europe's championship has sixteen members and Asia's has eight;
 * they are the same two brackets the world tiers and the domestic cups use.
 */
export function knockoutRoundsForField(fieldSize: number): number {
  return fieldSize > CONTINENTAL_FIELD ? WORLD_CUP_KNOCKOUT_ROUNDS : KNOCKOUT_ROUNDS;
}

/** How many knockout rounds each competition runs to, by its usual field. */
export function knockoutRoundsFor(kind: TournamentKind): number {
  return kind === 'continental' ? KNOCKOUT_ROUNDS : WORLD_CUP_KNOCKOUT_ROUNDS;
}

/** The most matches one nation can play in each tournament. */
export const INTERNATIONAL_MATCHES = GROUP_ROUNDS + KNOCKOUT_ROUNDS;
export const WORLD_CUP_MATCHES = GROUP_ROUNDS + WORLD_CUP_KNOCKOUT_ROUNDS;

/** The longest international season there is, which is what the calendar holds. */
export const MAX_INTERNATIONAL_MATCHES = WORLD_CUP_MATCHES;

/**
 * Which tournament a season plays.
 *
 * Alternating rather than adding: a career gets about nine of each, and every
 * season still has one. The World Cup lands on odd seasons so that a career
 * opens with one — the biggest thing in the game should not be two years away
 * from a player's first match.
 */
export function eraFor(seasonNumber: number): TournamentEra {
  return seasonNumber % 2 === 1 ? 'world' : 'continental';
}

/** Kept for callers that only want to know whether it is a World Cup year. */
export function tournamentFor(seasonNumber: number): TournamentKind {
  return eraFor(seasonNumber) === 'world' ? 'worldCup' : 'continental';
}

export interface InternationalState {
  /**
   * Which tournament this is, and how deep its bracket runs.
   *
   * Stored rather than derived from the season number, because the state
   * outlives the season it was drawn for: the review screen is handed the
   * finished tournament AFTER the career has moved on to the next season, and a
   * kind recomputed at that point would describe the wrong competition.
   */
  kind: TournamentKind;
  knockoutRounds: number;
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

/**
 * What a tournament is called.
 *
 * A continental championship is named for its confederation, so a Brazilian's
 * summer is the South American Championship and an Englishman's the European
 * one — the same competition, played in different halves of the world.
 */
export function tournamentName(kind: TournamentKind, confederation: string): string {
  if (kind === 'continental') return `The ${confederationAdjective(confederation)} Championship`;
  return WORLD_TIER_NAMES[kind] ?? 'The World Cup';
}

const WORLD_TIER_NAMES: Record<string, string> = {
  worldCup: 'The World Cup',
  challengeCup: 'The Challenge Cup',
  conferenceCup: 'The Conference Cup',
};

/** Short form, for chips and tables. */
export function tournamentShortName(kind: TournamentKind): string {
  if (kind === 'continental') return 'Championship';
  return (WORLD_TIER_NAMES[kind] ?? 'The World Cup').replace(/^The /, '');
}

/** The groups a fresh continental championship would be drawn into. */
export function drawGroups(order?: readonly string[]): string[][] {
  return qualifyingGroups(order).map((group) => group.map(nationId));
}



/**
 * Every tournament a season holds, in order of standing.
 *
 * A season is either three world tiers or five continental championships, and
 * the player is in exactly one of them. The others still happen — they have to,
 * or four confederations would go dark whenever the player was not from them,
 * and a country outside his tier would never move in the standings again.
 */
export interface ScheduledTournament {
  kind: TournamentKind;
  /** Empty for a world tier, which is not any one part of the world. */
  confederation: string;
  /** Country ids, best first. */
  field: string[];
}

export function seasonTournaments(
  era: TournamentEra,
  order: readonly string[],
  confederations: readonly string[],
  membersOf: (confederation: string) => readonly string[],
): ScheduledTournament[] {
  if (era === 'world') {
    return WORLD_TIERS.map((tier) => ({
      kind: tier as TournamentKind,
      confederation: '',
      field: worldTierField(order, tier),
    }));
  }

  return confederations.map((confederation) => ({
    kind: 'continental' as TournamentKind,
    confederation,
    // In standing order, so the snake seeds the championship properly.
    field: order.filter((id) => membersOf(confederation).includes(id)),
  }));
}

/**
 * Play a whole tournament out with nobody watching.
 *
 * Used for the tournaments the player is not in — the other two world tiers, or
 * the four confederations he is not from. They have to be played: without them
 * a country outside his tier records "did not compete" every season and its
 * national side stops moving its standing for ever, which is the same trap that
 * scoring a non-qualifier as zero once was. And a world where Africa's
 * championship simply never happens is not a world.
 */
export function playTournament(
  rng: Rng,
  state: InternationalState,
  lookup: (nationId: string) => Team,
): InternationalState {
  for (let round = 1; round <= GROUP_ROUNDS; round++) {
    playGroupRound(rng.fork(`group:${round}`), state, round, lookup);
    closeGroupRound(state, round);
  }
  const knockout = startKnockout(state);
  if (knockout) finishCup(rng.fork('knockout'), knockout, lookup);
  return state;
}

/** The tournament a nation is in this season, or null if it is in none. */
export function tournamentFieldFor(
  tournaments: readonly ScheduledTournament[],
  countryId: string,
): ScheduledTournament | null {
  return tournaments.find((tournament) => tournament.field.includes(countryId)) ?? null;
}

/**
 * A fresh international season.
 *
 * The fixture list is the FIRST HALF of a double round-robin per group — three
 * rounds in which everybody plays everybody once. A nation hosts some and
 * travels to others, which is as close to a neutral tournament as a model with
 * home advantage gets.
 */
export function createInternational(
  rng: Rng,
  order?: readonly string[],
  kind: TournamentKind = 'continental',
  field?: readonly string[],
): InternationalState {
  // An explicit field wins: a continental championship is every member of one
  // confederation and a world tier is a band of the world order, and neither is
  // a question this module can answer on its own.
  const groups = field
    ? continentalGroups(field.map(nationId))
    : kind === 'continental'
      ? drawGroups(order)
      : worldTierGroups(order ?? [], kind).map((group) => group.map(nationId));
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
    kind,
    knockoutRounds: knockoutRoundsForField(groups.flat().length),
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
