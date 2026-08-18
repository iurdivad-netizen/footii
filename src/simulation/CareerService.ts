import { round } from '../core/util/math.ts';
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
import {
  applyTransferEffects,
  generateOffers,
  scoutingInterest,
  squadRole,
} from '../core/career/transfers.ts';
import type { ClubInterest, TransferOffer, TransferRecord } from '../core/career/transfers.ts';
import {
  acceptRenewal,
  advanceContract,
  createContract,
  fallbackContract,
  isExpired,
  renewalOffer,
} from '../core/career/contracts.ts';
import type { Contract, ContractOffer } from '../core/career/contracts.ts';
import {
  divisionOf,
  divisionPrestige,
  initialDivisions,
  movementFor,
  resolveDivisions,
} from '../core/career/divisions.ts';
import type { DivisionMovement } from '../core/career/divisions.ts';
import { applyStrength, driftSeason, initialStrengths } from '../core/career/clubDrift.ts';
import { evaluateHonours, leagueBenchmark } from '../core/career/awards.ts';
import type { Honour, LeagueBenchmark } from '../core/career/awards.ts';
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

/**
 * Resolves a club id to the club as the DATA FILE describes it.
 * Everything that plays football goes through `clubIn` instead, which layers
 * the career's own drift on top — see core/career/clubDrift.ts.
 */
export type TeamLookup = (id: string) => Team;

/**
 * The club as it currently is, this many seasons into this career.
 *
 * Every consumer — the market, the table, the match engine, the development
 * model — must go through here, or half the game would be balancing against
 * ratings the other half had already moved on from.
 */
export function clubIn(state: CareerState, lookup: TeamLookup, id: string): Team {
  return applyStrength(lookup(id), state.clubStrengths);
}

/** A lookup bound to one career, for callers that hold on to it (the UI). */
export function careerTeams(state: CareerState, lookup: TeamLookup): TeamLookup {
  return (id) => clubIn(state, lookup, id);
}

/** Prestige of the division a club is currently in, 0-1. */
export function prestigeOfClub(state: CareerState, clubId: string): number {
  return divisionPrestige(divisionOf(state.divisions, clubId) || state.division);
}

export interface StartCareerOptions {
  player: Player;
  clubId: string;
  /** Every club in the game. The pyramid is read from their `division`. */
  teams: readonly Team[];
  seed: string;
}

export function startCareer(options: StartCareerOptions): CareerState {
  const rng = new Rng(`${options.seed}:season:1`);
  const divisions = initialDivisions(options.teams);
  const division = divisionOf(divisions, options.clubId) || 1;
  const leagueTeamIds = (divisions[division - 1] ?? []).slice();
  const club = options.teams.find((team) => team.id === options.clubId);
  if (!club) throw new Error(`startCareer: unknown club ${options.clubId}`);

  const prestige = divisionPrestige(division);

  return {
    player: options.player,
    clubId: options.clubId,
    leagueTeamIds,
    seasonNumber: 1,
    fixtures: generateFixtures(leagueTeamIds, rng),
    results: [],
    table: emptyTable(leagueTeamIds),
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
    division,
    divisions,
    clubStrengths: initialStrengths(options.teams),
    // Season 0: the deal he was already on when the career opened.
    contract: createContract(
      options.player,
      club,
      squadRole(options.player, club),
      0,
      prestige,
    ),
    renewal: null,
    honours: [],
    careerEarnings: 0,
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
      clubIn(state, lookup, fixture.homeId),
      clubIn(state, lookup, fixture.awayId),
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

  const club = clubIn(state, lookup, state.clubId);
  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:m${state.nextFixtureIndex}`);
  const changes = applyMatchToCareer(rng, state, {
    stats: input.stats,
    rating: input.rating,
    result: outcome,
    goalsFor: input.playerTeamScore,
    goalsAgainst: input.opponentScore,
    coaching: coachingQuality(club),
    clubStature: clubStature(club),
    divisionPrestige: divisionPrestige(state.division),
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
  /** The division the season was played in. */
  division: number;
  /** The division the club will play in next season. */
  nextDivision: number;
  /** Whether the club went up, went down, or stayed put. */
  movement: DivisionMovement | null;
  /** What the season put on the honours list. */
  honours: Honour[];
  /** International appearances won this season. */
  capsGained: number;
  /** The bar the individual awards were judged against. */
  benchmark: LeagueBenchmark;
  /** Terms his own club has offered to keep him, if any. */
  renewal: ContractOffer | null;
  /** Wages banked for the season just played, in millions. */
  earnings: number;
  /** True when the old deal ran out and he is free to leave for nothing. */
  outOfContract: boolean;
  /**
   * True when nobody wanted him and his club put up a reduced deal rather than
   * leave him without a season to play. The review screen says so plainly.
   */
  fellBackOnClub: boolean;
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
  const club = clubIn(state, lookup, state.clubId);
  const division = state.division;
  const prestige = divisionPrestige(division);
  const reputation = settleReputation(state.player, {
    stats: state.seasonStats,
    leaguePosition: position,
    leagueSize: state.leagueTeamIds.length,
    clubStature: clubStature(club),
    seasonLength: fixturesFor(state, state.clubId).length,
    divisionPrestige: prestige,
  });

  // The pyramid moves before anything reads a club's division again: promotion
  // and relegation decide which league the summer's offers are actually in.
  const outcome = resolveDivisions(new Rng(`${state.seed}:s${state.seasonNumber}:divisions`), {
    divisions: state.divisions,
    playerDivision: division,
    playerTable: state.table,
    lookup: (id) => clubIn(state, lookup, id),
  });
  const movement = movementFor(outcome, state.clubId);

  // Awards are judged on the division just played, against a bar inferred from
  // the football that happened in it (see core/career/awards.ts).
  const benchmark = leagueBenchmark(new Rng(`${state.seed}:s${state.seasonNumber}:awards`), {
    table: state.table,
    playerClubId: state.clubId,
    playerGoals: state.seasonStats.goals,
  });
  const honoursResult = evaluateHonours({
    player: state.player,
    stats: state.seasonStats,
    season: state.seasonNumber,
    clubId: state.clubId,
    division,
    position,
    movement,
    benchmark,
    seasonLength: fixturesFor(state, state.clubId).length,
  });
  state.honours.push(...honoursResult.honours);
  state.player.caps += honoursResult.capsGained;

  // Wages for the season just played are banked, then the clock runs down one.
  const earnings = advanceContract(state.contract);
  state.careerEarnings = round(state.careerEarnings + earnings, 2);

  // Clubs are only as good as their last season. Drift uses the BASE ratings as
  // its anchor, so this takes the raw lookup rather than the drifted one.
  state.clubStrengths = driftSeason(new Rng(`${state.seed}:s${state.seasonNumber}:drift`), {
    strengths: state.clubStrengths,
    tables: outcome.tables,
    lookup,
  });

  state.divisions = outcome.divisions;
  const nextDivision = divisionOf(outcome.divisions, state.clubId) || division;
  const nextLeague = (outcome.divisions[nextDivision - 1] ?? state.leagueTeamIds).slice();

  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:end`);
  const nextRng = new Rng(`${state.seed}:season:${state.seasonNumber + 1}`);
  const record = advanceSeason(rng, state, position, {
    fixtures: generateFixtures(nextLeague, nextRng),
    table: emptyTable(nextLeague),
    leagueTeamIds: nextLeague,
    division: nextDivision,
  });

  // Unspent points are never banked; a fresh award replaces whatever was left.
  state.trainingPoints = award.points;

  // Offers come AFTER the birthday: clubs buy the player who will turn out for
  // them next season, not the one who finished last season. They also come from
  // the WHOLE pyramid, which is the point of having one — a good season in the
  // second division is seen by clubs in the first.
  const outOfContract = isExpired(state.contract);
  const nextPrestige = divisionPrestige(nextDivision);
  const offerRng = new Rng(`${state.seed}:s${record.seasonNumber}:transfers`);
  const lastMove = state.transfers[state.transfers.length - 1];
  state.offers = generateOffers(offerRng, {
    player: state.player,
    currentClubId: state.clubId,
    clubs: allClubs(state, lookup),
    stats: record.stats,
    season: record.seasonNumber,
    // A club he left last summer does not come straight back for him.
    excludeClubIds:
      lastMove && lastMove.season === record.seasonNumber - 1 ? [lastMove.fromClubId] : [],
    prestigeOf: (id) => prestigeOfClub(state, id),
    outOfContract,
  });

  // His own club only puts terms up when the old deal has actually run out.
  // Anything else and he is simply still under contract, and staying needs no
  // decision at all.
  state.renewal = outOfContract
    ? renewalOffer({
        player: state.player,
        club: clubIn(state, lookup, state.clubId),
        stats: record.stats,
        season: record.seasonNumber,
        prestige: nextPrestige,
      })
    : null;

  // The safety net: out of contract, unwanted by everyone including his own
  // club. Rather than a career with no club to play for, the club it is puts a
  // reduced one-year deal up and the review screen says exactly that.
  const fellBackOnClub = outOfContract && !state.renewal && state.offers.length === 0;
  if (fellBackOnClub) {
    state.contract = fallbackContract(
      state.player,
      clubIn(state, lookup, state.clubId),
      record.seasonNumber,
      nextPrestige,
    );
  }

  return {
    record,
    position,
    champion,
    progress,
    trainingAwarded: award.points,
    trainingNotes: award.notes,
    reputation,
    offers: state.offers,
    division,
    nextDivision,
    movement,
    honours: honoursResult.honours,
    capsGained: honoursResult.capsGained,
    benchmark,
    renewal: state.renewal,
    earnings,
    outOfContract,
    fellBackOnClub,
  };
}

/** Every club in the game, drift applied, across every division. */
export function allClubs(state: CareerState, lookup: TeamLookup): Team[] {
  return state.divisions.flat().map((id) => clubIn(state, lookup, id));
}

/**
 * Can he simply stay where he is?
 *
 * Only when there is still a deal to stay on. A player whose contract has run
 * out and whose club has not offered new terms has no club to stay at, which is
 * the whole reason expiry is worth modelling — see core/career/contracts.ts.
 */
export function canStay(state: CareerState): boolean {
  return !isExpired(state.contract) || state.renewal !== null;
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
    years: offer.years,
    role: offer.role,
    age: state.player.age,
    free: offer.free,
  };

  state.clubId = offer.clubId;
  state.transfers.push(record);

  // A move can cross a division, which changes the whole season ahead: a new
  // league, a new fixture list and a new table. Rebuilding them here is what
  // makes "signing for a club in the division above" a real transfer rather
  // than a change of badge.
  const division = divisionOf(state.divisions, offer.clubId) || state.division;
  if (division !== state.division || !state.leagueTeamIds.includes(offer.clubId)) {
    const league = (state.divisions[division - 1] ?? state.leagueTeamIds).slice();
    const rng = new Rng(`${state.seed}:season:${state.seasonNumber}:${offer.clubId}`);
    state.division = division;
    state.leagueTeamIds = league;
    state.fixtures = generateFixtures(league, rng);
    state.table = emptyTable(league);
    state.results = [];
    state.nextFixtureIndex = 0;
  }

  const prestige = divisionPrestige(division);
  applyTransferEffects(state.player, clubIn(state, lookup, offer.clubId), prestige);
  state.contract = {
    clubId: offer.clubId,
    wage: offer.wage,
    yearsRemaining: offer.years,
    signedSeason: offer.season,
    role: offer.role,
  };
  state.offers = [];
  state.renewal = null;
  return record;
}

/**
 * Turn everything down and stay where you are.
 *
 * When the old deal has expired this takes the club's renewal, so "stay" is an
 * agreement rather than a refusal. Throws if there is nothing to stay on — the
 * UI is expected to check `canStay` first, and a silent no-op here would leave
 * a career playing a season it has no contract for.
 */
export function stayAtClub(state: CareerState): Contract {
  if (!canStay(state)) {
    throw new Error('stayAtClub called with an expired contract and no renewal offered');
  }
  if (state.renewal) state.contract = acceptRenewal(state.renewal);
  state.offers = [];
  state.renewal = null;
  return state.contract;
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
    allClubs(state, lookup),
    state.clubId,
    state.seasonStats,
    (id) => prestigeOfClub(state, id),
  );
}

export function playerFixtures(state: CareerState): Fixture[] {
  return fixturesFor(state, state.clubId);
}

export function leagueTable(state: CareerState): TableRow[] {
  return sortTable(state.table);
}
