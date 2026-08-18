import { Rng } from '../core/rng.ts';
import type { Player } from '../core/player/player.ts';
import { currentAbility } from '../core/player/player.ts';
import { ATTRIBUTE_LABELS } from '../core/player/attributes.ts';
import type { SeasonProgress } from '../core/career/training.ts';
import { calculateTrainingPoints, summariseProgress } from '../core/career/training.ts';
import { benchmarkDecisionWindow } from './DecisionBenchmark.ts';
import type { Team } from '../core/team/team.ts';
import type { CareerState, SeasonRecord } from '../core/career/career.ts';
import {
  advanceSeason,
  applyMatchToCareer,
  fixturesFor,
  nextFixture,
  seasonComplete,
} from '../core/career/career.ts';
import { createDevelopmentState } from '../core/career/development.ts';
import { clubStature, settleReputation } from '../core/career/reputation.ts';
import type { ReputationSettlement } from '../core/career/reputation.ts';
import { applyTransferEffects, generateOffers, scoutingInterest } from '../core/career/transfers.ts';
import type { ClubInterest, TransferOffer, TransferRecord } from '../core/career/transfers.ts';
import type { Fixture, FixtureResult, TableRow } from '../core/career/league.ts';
import {
  applyResult,
  coachingQuality,
  emptyTable,
  generateFixtures,
  simulateFixture,
  sortTable,
  tablePosition,
} from '../core/career/league.ts';
import { createSeasonStats } from '../core/career/seasonStats.ts';
import type { MatchStats } from '../core/match/matchStats.ts';

/**
 * CAREER SERVICE
 *
 * Orchestrates the career: starting one, resolving the rest of a matchday
 * around the player's own game, closing seasons. Pure over `CareerState` and a
 * team lookup, so the whole career can be fast-forwarded head-lessly in tests.
 */

export type TeamLookup = (id: string) => Team;

export interface StartCareerOptions {
  player: Player;
  clubId: string;
  leagueTeamIds: string[];
  seed: string;
}

export function startCareer(options: StartCareerOptions): CareerState {
  const rng = new Rng(`${options.seed}:season:1`);
  return {
    player: options.player,
    clubId: options.clubId,
    leagueTeamIds: options.leagueTeamIds.slice(),
    seasonNumber: 1,
    fixtures: generateFixtures(options.leagueTeamIds, rng),
    results: [],
    table: emptyTable(options.leagueTeamIds),
    nextFixtureIndex: 0,
    seasonStats: createSeasonStats(),
    development: createDevelopmentState(),
    history: [],
    seed: options.seed,
    lastDevelopment: [],
    fitness: 100,
    seasonStartAttributes: { ...options.player.attributes },
    seasonStartAbility: currentAbility(options.player),
    seasonStartExperience: options.player.experience,
    trainingPoints: 0,
    offers: [],
    transfers: [],
  };
}

/** The round number of the player's next fixture, or null at season's end. */
export function currentRound(state: CareerState): number | null {
  return nextFixture(state)?.round ?? null;
}

/** True once every fixture in a round has a result. */
function roundResolved(state: CareerState, round: number): boolean {
  const expected = state.fixtures.filter((f) => f.round === round).length;
  const actual = state.results.filter((r) => r.round === round).length;
  return actual >= expected;
}

/**
 * Resolve every OTHER fixture in the given round.
 * The player's own fixture is skipped — it is played, not simulated.
 */
export function simulateRound(state: CareerState, round: number, lookup: TeamLookup): FixtureResult[] {
  if (roundResolved(state, round)) return [];
  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:r${round}`);
  const produced: FixtureResult[] = [];

  for (const fixture of state.fixtures.filter((f) => f.round === round)) {
    const isPlayerMatch = fixture.homeId === state.clubId || fixture.awayId === state.clubId;
    if (isPlayerMatch) continue;
    if (state.results.some((r) => r.round === round && r.homeId === fixture.homeId)) continue;

    const { homeGoals, awayGoals } = simulateFixture(
      rng,
      lookup(fixture.homeId),
      lookup(fixture.awayId),
    );
    const result: FixtureResult = { ...fixture, homeGoals, awayGoals };
    state.results.push(result);
    applyResult(state.table, result);
    produced.push(result);
  }
  return produced;
}

export interface PlayedMatchInput {
  stats: MatchStats;
  rating: number;
  playerTeamScore: number;
  opponentScore: number;
  fitnessAtEnd: number;
}

/**
 * Record the player's own completed match, then resolve the rest of the round.
 * Returns the attribute changes so the UI can show what improved.
 */
export function recordPlayerMatch(
  state: CareerState,
  input: PlayedMatchInput,
  lookup: TeamLookup,
) {
  const fixture = nextFixture(state);
  if (!fixture) throw new Error('recordPlayerMatch called with no fixture remaining');

  const isHome = fixture.homeId === state.clubId;
  const result: FixtureResult = {
    ...fixture,
    homeGoals: isHome ? input.playerTeamScore : input.opponentScore,
    awayGoals: isHome ? input.opponentScore : input.playerTeamScore,
  };
  state.results.push(result);
  applyResult(state.table, result);

  const outcome =
    input.playerTeamScore > input.opponentScore
      ? 1
      : input.playerTeamScore < input.opponentScore
        ? -1
        : 0;

  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:m${state.nextFixtureIndex}`);
  const changes = applyMatchToCareer(rng, state, {
    stats: input.stats,
    rating: input.rating,
    result: outcome,
    goalsFor: input.playerTeamScore,
    goalsAgainst: input.opponentScore,
    coaching: coachingQuality(lookup(state.clubId)),
    clubStature: clubStature(lookup(state.clubId)),
    fitnessAtEnd: input.fitnessAtEnd,
  });

  // `applyMatchToCareer` advances the fixture index, so resolve the round the
  // player just played using the fixture's own round number.
  simulateRound(state, fixture.round, lookup);
  return changes;
}

/** Play out every remaining round in the season (used when a season ends). */
export function flushRemainingRounds(state: CareerState, lookup: TeamLookup): void {
  const rounds = [...new Set(state.fixtures.map((f) => f.round))].sort((a, b) => a - b);
  for (const round of rounds) simulateRound(state, round, lookup);
}

export interface SeasonEnd {
  record: SeasonRecord;
  position: number;
  champion: string;
  /** How the player changed across the season just completed. */
  progress: SeasonProgress;
  /** Points earned for pre-season training. */
  trainingAwarded: number;
  trainingNotes: string[];
  /** How the season moved the player's standing in the game. */
  reputation: ReputationSettlement;
  /** Offers on the table this summer, best first. */
  offers: TransferOffer[];
}

/**
 * Close the season and open the next one.
 * Any unplayed neutral fixtures are resolved first so the table is complete.
 */
export function endSeason(state: CareerState, lookup: TeamLookup): SeasonEnd {
  if (!seasonComplete(state)) {
    throw new Error('endSeason called before the season was complete');
  }
  flushRemainingRounds(state, lookup);

  const position = tablePosition(state.table, state.clubId);
  const champion = sortTable(state.table)[0]?.teamId ?? state.clubId;

  // Captured BEFORE advanceSeason re-baselines the snapshot and ages the player.
  const progress: SeasonProgress = {
    abilityBefore: state.seasonStartAbility,
    abilityAfter: currentAbility(state.player),
    experienceBefore: state.seasonStartExperience,
    experienceAfter: state.player.experience,
    windowBefore: benchmarkDecisionWindow({
      ...state.player,
      attributes: state.seasonStartAttributes,
      experience: state.seasonStartExperience,
    }),
    windowAfter: benchmarkDecisionWindow(state.player),
    changes: summariseProgress(
      state.seasonStartAttributes,
      state.player.attributes,
      ATTRIBUTE_LABELS,
    ),
  };

  const award = calculateTrainingPoints(state.player, state.seasonStats);

  // Settle reputation on the season just played, BEFORE the club can change and
  // before the player ages, so it is judged on the football that actually
  // happened. Match-by-match gains have already been applied; this is the
  // correction back toward what the whole season justifies.
  const club = lookup(state.clubId);
  const reputation = settleReputation(state.player, {
    stats: state.seasonStats,
    leaguePosition: position,
    leagueSize: state.leagueTeamIds.length,
    clubStature: clubStature(club),
    seasonLength: fixturesFor(state, state.clubId).length,
  });

  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:end`);
  const nextRng = new Rng(`${state.seed}:season:${state.seasonNumber + 1}`);
  const record = advanceSeason(rng, state, position, {
    fixtures: generateFixtures(state.leagueTeamIds, nextRng),
    table: emptyTable(state.leagueTeamIds),
    leagueTeamIds: state.leagueTeamIds,
  });

  // Unspent points are never banked; a fresh award replaces whatever was left.
  state.trainingPoints = award.points;

  // Offers come AFTER the birthday: clubs buy the player who will turn out for
  // them next season, not the one who finished last season.
  const offerRng = new Rng(`${state.seed}:s${record.seasonNumber}:transfers`);
  const lastMove = state.transfers[state.transfers.length - 1];
  state.offers = generateOffers(offerRng, {
    player: state.player,
    currentClubId: state.clubId,
    clubs: state.leagueTeamIds.map(lookup),
    stats: record.stats,
    season: record.seasonNumber,
    // A club he left last summer does not come straight back for him.
    excludeClubIds:
      lastMove && lastMove.season === record.seasonNumber - 1 ? [lastMove.fromClubId] : [],
  });

  return {
    record,
    position,
    champion,
    progress,
    trainingAwarded: award.points,
    trainingNotes: award.notes,
    reputation,
    offers: state.offers,
  };
}

/**
 * Take an offer.
 *
 * The move itself is a single field — `clubId` — but everything downstream
 * changes with it: the quality of the chances the engine generates, the
 * coaching that drives development, the standing that decides who watches you
 * next, and where you finish in the table. The window closes on acceptance, so
 * a summer produces exactly one decision.
 */
export function acceptOffer(
  state: CareerState,
  offerId: string,
  lookup: TeamLookup,
): TransferRecord {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new Error(`No such offer: ${offerId}`);

  const record: TransferRecord = {
    season: offer.season,
    fromClubId: state.clubId,
    toClubId: offer.clubId,
    fee: offer.fee,
    wage: offer.wage,
    role: offer.role,
    age: state.player.age,
  };

  state.clubId = offer.clubId;
  state.transfers.push(record);
  applyTransferEffects(state.player, lookup(offer.clubId));
  state.offers = [];
  return record;
}

/** Turn everything down and stay where you are. */
export function declineOffers(state: CareerState): void {
  state.offers = [];
}

/**
 * Clubs watching but not yet bidding.
 *
 * Shown in the hub during the season so the transfer window is something you
 * can see coming: interest builds as reputation does, and the list is the
 * feedback loop that makes a run of goals feel like it is going somewhere.
 */
export function clubsWatching(state: CareerState, lookup: TeamLookup): ClubInterest[] {
  return scoutingInterest(
    state.player,
    state.leagueTeamIds.map(lookup),
    state.clubId,
    state.seasonStats,
  );
}

export function playerFixtures(state: CareerState): Fixture[] {
  return fixturesFor(state, state.clubId);
}

export function leagueTable(state: CareerState): TableRow[] {
  return sortTable(state.table);
}
