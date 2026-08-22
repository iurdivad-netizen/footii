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
  calendarFor,
  createHowItWasPlayed,
  fixturesFor,
  knockoutFor,
  nextFixture,
  playerNation,
  nextMatch,
  restUntilNextMatch,
  seasonComplete,
} from '../core/career/career.ts';
import type { ScheduledMatch } from '../core/career/career.ts';
import type { Injury } from '../core/career/injury.ts';
import type { Rival, TeamSheet } from '../core/career/squad.ts';
import type { Teammate } from '../core/team/team.ts';
import type { Loan, LoanOffer } from '../core/career/loan.ts';
import { loanPitch, loanRole, needsLoan, rankLoanClubs } from '../core/career/loan.ts';
import {
  createRival,
  createSquad,
  driftRival,
  matchImportance,
  pickSide,
  rivalAfterMatch,
} from '../core/career/squad.ts';
import { playerName } from '../data/gameData.ts';
import { createMatchStats } from '../core/match/matchStats.ts';
import { teamStrength } from '../core/team/team.ts';
import { clamp01 } from '../core/util/math.ts';
import { createDevelopmentState } from '../core/career/development.ts';
import { clubStature, settleReputation } from '../core/career/reputation.ts';
import type { ReputationSettlement } from '../core/career/reputation.ts';
import {
  applyTransferEffects,
  clubAppeal,
  effectiveAbility,
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
import { negotiate } from '../core/career/negotiation.ts';
import { defaultPreferences } from '../core/career/preferences.ts';
import type { TransferRequest } from '../core/career/transferRequest.ts';
import { handInRequest, requestStands } from '../core/career/transferRequest.ts';
import {
  CONFIDENCE_NEUTRAL,
  confidenceAfterAbsence,
  startingConfidence,
} from '../core/career/confidence.ts';
import type { WeekChoice, WeekOption, WeekPlan } from '../core/career/week.ts';
import { planApplies, spendWeek, weekOptions } from '../core/career/week.ts';
import type {
  EuropeanDemand,
  MarketReach,
  StandingFloor,
} from '../core/career/preferences.ts';
import { STANDING_FLOORS } from '../core/career/preferences.ts';
import type { SuperCupTie } from '../core/career/superCup.ts';
import {
  SUPER_CUP,
  applySuperCupResult,
  nextSuperCup,
  playsInSuperCup,
  resolveSuperCup,
} from '../core/career/superCup.ts';
import type { NegotiationAsk, NegotiationResult } from '../core/career/negotiation.ts';
import { movementFor, resolveDivisions, simulateDivisionThrough } from '../core/career/divisions.ts';
import {
  CUP_KINDS,
  applyPlayerResult,
  backgroundCup,
  backgroundCupWinner,
  closeRound,
  createCup,
  finishCup,
  openRound,
  stillIn,
} from '../core/career/cups.ts';
import type { CupKind, CupState } from '../core/career/cups.ts';
import {
  EUROPEAN_MATCHES,
  EUROPEAN_TIERS,
  PLACES_BY_TIER,
  advanceEuropeanSeason,
  championsLeaguePlaces,
  createEuropeanSeason,
  europeanTierOf,
  europeanWinner,
  fieldFor,
  isGroupRound,
  knockoutRoundOf,
  lostEuropeanFinal,
  qualifyForEurope,
  visibilityOf,
} from '../core/career/europe.ts';
// Aliased: `international.ts` has its own functions of the same names for its
// own state shape, and both are used in this file. See groupStage.ts for why
// the two are not one module.
import {
  GROUP_SIZE,
  playGroupRound as playEuropeanGroupRound,
  closeGroupRound as closeEuropeanGroupRound,
  groupFixtureFor as europeanGroupFixture,
  recordGroupResult as recordEuropeanGroupResult,
  startKnockout as startEuropeanKnockout,
  stillInCompetition,
} from '../core/career/groupStage.ts';
import type { EuropeanEntries, EuropeanState, EuropeanTier } from '../core/career/europe.ts';
import { createCareerRecords, recordSeason } from '../core/career/records.ts';
import type { Coefficients } from '../core/career/coefficients.ts';
import {
  countriesByStanding,
  createCoefficients,
  nationsByStanding,
  recordEuropeanSeason,
  scoreEuropeanSeason,
  scoreTournament,
} from '../core/career/coefficients.ts';
import type {
  InternationalState,
  ScheduledTournament,
} from '../core/career/international.ts';
import {
  GROUP_ROUNDS,
  INTERNATIONAL,
  championNation,
  closeGroupRound,
  createInternational,
  eraFor,
  seasonTournaments,
  tournamentFieldFor,
  groupFixture,
  playGroupRound,
  recordGroupResult,
  startKnockout,
  playTournament,
} from '../core/career/international.ts';
import { countryOfNation, nationId, nationalTeam } from '../core/career/nations.ts';
import type { DivisionMovement } from '../core/career/divisions.ts';
import {
  allClubIds,
  allConfederations,
  countriesIn,
  countryPrestige,
  initialLeagues,
  leagueMembers,
  locateClub,
  playedCountries,
} from '../core/career/countries.ts';
import { applyStrength, driftSeason, initialStrengths } from '../core/career/clubDrift.ts';
import {
  driftNations,
  initialNationStrengths,
  nationAdjustment,
} from '../core/career/nationDrift.ts';
import { evaluateHonours, leagueBenchmark } from '../core/career/awards.ts';
import type { Honour, LeagueBenchmark } from '../core/career/awards.ts';
import type { CompetitionKind } from '../core/career/calendar.ts';
import { isEuropean, isInternational, knockoutRoundsPlayed } from '../core/career/calendar.ts';
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

/**
 * A national side, built from the country's clubs AS THEY NOW ARE.
 *
 * Through `clubIn`, so a nation inherits this career's drift: a country whose
 * clubs have declined over a decade fields a weaker side for it, without
 * anything having had to remember that it should.
 */
export function nationIn(state: CareerState, lookup: TeamLookup, countryId: string): Team {
  const clubs = leagueMembers(state.leagues, countryId, 1).map((id) => clubIn(state, lookup, id));
  // A country with clubs inherits their drift for free. One without any carries
  // its own, or the half of the world with no leagues would stand perfectly
  // still while the half with them spread out over eighteen seasons.
  return nationalTeam(countryId, clubs, nationAdjustment(state.nationStrengths ?? {}, countryId));
}

/**
 * Any side that plays football in this career, club or country.
 *
 * Nations and clubs share the fixture list, the knockout model and the match
 * engine, so everything downstream needs ONE lookup that resolves both — a
 * national side handed to a club lookup would not be found, and the tie it was
 * meant to play would silently resolve to nothing.
 */
export function teamIn(state: CareerState, lookup: TeamLookup, id: string): Team {
  const country = countryOfNation(id);
  return country ? nationIn(state, lookup, country) : clubIn(state, lookup, id);
}

/** A lookup bound to one career, for callers that hold on to it (the UI). */
export function careerTeams(state: CareerState, lookup: TeamLookup): TeamLookup {
  return (id) => teamIn(state, lookup, id);
}

/** The country a club currently plays in, falling back to the player's own. */
export function countryOfClub(state: CareerState, clubId: string): string {
  return locateClub(state.leagues, clubId)?.countryId ?? state.countryId;
}

/** The tier a club currently plays in, falling back to the player's own. */
export function divisionOfClub(state: CareerState, clubId: string): number {
  return locateClub(state.leagues, clubId)?.division ?? state.division;
}

/**
 * Prestige of the league a club plays in, 0-1.
 *
 * Now a property of the COUNTRY rather than of a rung on one ladder. The best
 * club in a small country and a mid-table club in a big one can have similar
 * squads and still be very different propositions, and this is the number that
 * knows the difference.
 */
export function prestigeOfClub(state: CareerState, clubId: string): number {
  return countryPrestige(countryOfClub(state, clubId));
}

/**
 * A league table for any country, at the player's current point in the season.
 *
 * The player's own league is the real one he is playing; every other is
 * recomputed from the seed. Nothing about the other leagues is stored, so this
 * can never disagree with the season that will eventually be settled.
 */
export function worldTable(
  state: CareerState,
  countryId: string,
  lookup: TeamLookup,
  tier?: number,
): TableRow[] {
  // Default to the player's own tier when looking at his own country, so a
  // player in a second division sees the league he is actually playing rather
  // than a background simulation of the one above him.
  const division = tier ?? (countryId === state.countryId ? state.division : 1);
  if (countryId === state.countryId && division === state.division) {
    return sortTable(state.table);
  }
  const ids = leagueMembers(state.leagues, countryId, division);
  if (ids.length === 0) return [];
  return simulateDivisionThrough(
    leagueRng(state, countryId, division),
    ids.map((id) => clubIn(state, lookup, id)),
    roundsPlayed(state),
  );
}

/**
 * The rng for one league's background season.
 *
 * Keyed by seed, season, country and tier, so every league is independent and
 * a partial table is always a prefix of the same league's final table.
 */
function leagueRng(state: CareerState, countryId: string, division: number): Rng {
  return new Rng(`${state.seed}:s${state.seasonNumber}:league:${countryId}:${division}`);
}

/**
 * How far into the season the world is, in rounds.
 *
 * Taken from the player's own progress so the whole world moves in step with
 * him: browsing Spain in November shows a November table, not a finished one.
 */
function roundsPlayed(state: CareerState): number {
  const own = fixturesFor(state, state.clubId);
  const next = own[state.nextFixtureIndex];
  return next ? Math.max(0, next.round - 1) : Number.POSITIVE_INFINITY;
}

/**
 * Who won a cup in any country, at the end of the season just played.
 *
 * The player's own country returns the real bracket he took part in; every
 * other is computed from the seed, in the same spirit as the background league
 * tables. Nothing is stored, so this can never disagree with itself.
 */
export function cupWinner(
  state: CareerState,
  kind: CupKind,
  countryId: string,
  lookup: TeamLookup,
): string | null {
  if (countryId === state.countryId) return state.cups[kind]?.winnerId ?? null;
  return backgroundCupWinner(
    state.seed,
    state.seasonNumber,
    kind,
    countryId,
    leagueMembers(state.leagues, countryId, 1),
    (id) => clubIn(state, lookup, id),
  );
}

/** Is the player's club still in this cup? */
export function stillInCup(state: CareerState, kind: CupKind): boolean {
  const cup = state.cups?.[kind];
  return !!cup && stillIn(cup, state.clubId);
}

/**
 * How far a knockout has got by now, in rounds.
 *
 * The season's own answer, taken from the calendar, so every competition in the
 * world is shown at the same point in the year as the player's own. Without it
 * a browsable cup would either be empty or already won, and neither is where
 * the season actually is.
 */
export function roundsReached(state: CareerState, competition: CompetitionKind): number {
  return knockoutRoundsPlayed(
    competition,
    fixturesFor(state, state.clubId).length,
    roundsPlayed(state),
  );
}

/**
 * A country's cup as it stands today, wherever it is played.
 *
 * The player's own country returns the real bracket he is in; every other is
 * recomputed from the seed, exactly as its league table is, and run only as far
 * as the season has got. Nothing is stored for the other seven countries, so
 * this can never disagree with itself between one screen and the next.
 */
export function worldCup(
  state: CareerState,
  countryId: string,
  kind: CupKind,
  lookup: TeamLookup,
): CupState<CupKind> | null {
  if (countryId === state.countryId) return state.cups?.[kind] ?? null;
  const members = leagueMembers(state.leagues, countryId, 1);
  if (members.length === 0) return null;
  return backgroundCup(
    state.seed,
    state.seasonNumber,
    kind,
    countryId,
    members,
    (id) => clubIn(state, lookup, id),
    roundsReached(state, kind),
  );
}

/**
 * One European competition as it stands today.
 *
 * The player's own is the real thing; the other two are derived from the same
 * entry list — which IS stored, because it was decided last May — and played
 * out to the round the calendar has reached. Only one of the three can ever be
 * the player's, so the other two would otherwise be invisible all season
 * despite being the competitions his club is trying to reach.
 */
export function europeanState(
  state: CareerState,
  tier: EuropeanTier,
  lookup: TeamLookup,
): EuropeanState | null {
  if (state.europe?.kind === tier) return state.europe;
  const field = fieldFor(state.europeanEntries ?? {}, tier);
  if (field.length < GROUP_SIZE) return null;
  // Recomputed on demand rather than stored, exactly as a background league
  // table is: a pure function of the seed, so browsing one can never disagree
  // with the season that produced it.
  const season = createEuropeanSeason(
    tier,
    field,
    new Rng(`${state.seed}:s${state.seasonNumber}:europe:${tier}:draw`),
  );
  advanceEuropeanSeason(
    new Rng(`${state.seed}:s${state.seasonNumber}:europe:${tier}`),
    season,
    roundsReached(state, tier),
    (id) => clubIn(state, lookup, id),
  );
  return season;
}

/** Every country that has a league this career knows about. */
export function worldCountries(state: CareerState): string[] {
  return playedCountries(state.leagues);
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
  const leagues = initialLeagues(options.teams);
  const located = locateClub(leagues, options.clubId);
  const club = options.teams.find((team) => team.id === options.clubId);
  if (!club || !located) throw new Error(`startCareer: unknown club ${options.clubId}`);

  const { countryId, division } = located;
  const leagueTeamIds = leagueMembers(leagues, countryId, division);
  const prestige = countryPrestige(countryId);

  const state: CareerState = {
    player: options.player,
    clubId: options.clubId,
    leagueTeamIds,
    seasonNumber: 1,
    fixtures: generateFixtures(leagueTeamIds, rng),
    results: [],
    table: emptyTable(leagueTeamIds),
    nextFixtureIndex: 0,
    calendarIndex: 0,
    seasonStats: createSeasonStats(),
    leagueStats: createSeasonStats(),
    development: createDevelopmentState(),
    history: [],
    seed: options.seed,
    lastDevelopment: [],
    fitness: 100,
    seasonStartAttributes: { ...options.player.attributes },
    seasonStartAbility: currentAbility(options.player),
    seasonStartExperience: options.player.experience,
    trainingPoints: 0,
    preferences: defaultPreferences(),
    transferRequest: null,
    // No previous season to have earned one.
    superCup: null,
    offers: [],
    transfers: [],
    countryId,
    division,
    leagues,
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
    lastResult: null,
    howPlayed: createHowItWasPlayed(),
    injury: null,
    rival: null,
    teammates: [],
    // Overwritten by `joinClub` below, which knows what the club called him.
    // Present here because the state has to be whole before anything reads it.
    confidence: CONFIDENCE_NEUTRAL,
    // The first week of a career has not been planned yet.
    week: null,
    loan: null,
    loanOffer: null,
    cups: newCups(countryId, leagueTeamIds),
    // Nobody is in Europe in season one: qualification is decided by a season
    // that has not been played. The first European night of a career is earned.
    europe: null,
    europeanEntries: {},
    // Season one has nothing on record, so the field is the eight best-watched
    // countries — which is what the world looks like before it has a history.
    international: newInternational(
      options.seed,
      1,
      createCoefficients(),
      options.player.nationality,
    ),
    seasonCaps: 0,
    // Nothing has been played, so every country stands exactly where the data
    // file says it does. The order starts moving with the first tournament.
    coefficients: createCoefficients(),
    nationStrengths: initialNationStrengths(),
    records: createCareerRecords(),
  };

  // After the state exists, because the rival is built from the club as this
  // career knows it — drifted ratings included — and that needs a career.
  const teams: TeamLookup = (id) => options.teams.find((team) => team.id === id) ?? club;
  joinClub(state, teams, options.clubId);
  return state;
}

/**
 * The player already in the shirt at a club.
 *
 * Seeded off the career and the club rather than off the calendar, so the same
 * footballer is waiting whenever this career signs for this club — and a
 * different one is waiting at the club next door.
 */
function newRival(state: CareerState, lookup: TeamLookup, clubId: string): Rival {
  const team = clubIn(state, lookup, clubId);
  const rng = new Rng(`${state.seed}:rival:${clubId}:${state.player.position}`);
  const countryId = locateClub(state.leagues, clubId)?.countryId ?? state.countryId;
  return createRival(rng, team, playerName(rng, countryId), {
    // Same reasoning as selection: the club he is at is the one whose word for
    // him bounds the competition he finds there.
    role: state.loan?.role ?? state.contract?.role ?? 'starter',
    playerAbility: effectiveAbility(state.player),
  });
}

/**
 * The teammates he will be passing to at a club.
 *
 * Seeded off the career, the club and his position, so the same five are
 * waiting whenever this career signs here — and a defender finds a different
 * five from a striker, because they are the people in front of him.
 */
function newTeammates(state: CareerState, lookup: TeamLookup, clubId: string): Teammate[] {
  const team = clubIn(state, lookup, clubId);
  const rng = new Rng(`${state.seed}:squad:${clubId}:${state.player.position}`);
  const countryId = locateClub(state.leagues, clubId)?.countryId ?? state.countryId;
  return createSquad(rng, team, state.player.position, (r) => playerName(r, countryId));
}

/**
 * Put the career into a different club's season.
 *
 * Shared by signing for somebody and going out on loan, because from the
 * season's point of view those are the same event: a different league, a
 * different fixture list, a different table and a different set of cups. The
 * guard matters as much as the rebuild — moving WITHIN a league must not wipe
 * the table and the fixtures of a season already under way.
 */
function moveToClub(state: CareerState, lookup: TeamLookup, clubId: string): void {
  const located = locateClub(state.leagues, clubId);
  const countryId = located?.countryId ?? state.countryId;
  const division = located?.division ?? state.division;
  if (
    countryId !== state.countryId ||
    division !== state.division ||
    !state.leagueTeamIds.includes(clubId)
  ) {
    const league = leagueMembers(state.leagues, countryId, division);
    const rng = new Rng(`${state.seed}:season:${state.seasonNumber}:${clubId}`);
    state.countryId = countryId;
    state.division = division;
    // Belonged to the club he has just left, and to a season that no longer
    // exists. Showing it on the new club's hub would be a lie.
    state.lastResult = null;
    state.leagueTeamIds = league.length > 0 ? league : state.leagueTeamIds;
    state.fixtures = generateFixtures(state.leagueTeamIds, rng);
    state.table = emptyTable(state.leagueTeamIds);
    state.results = [];
    state.nextFixtureIndex = 0;
    state.calendarIndex = 0;
    // A new country means new knockouts: the cups he was entered in belong to
    // the league he has just left.
    state.cups = newCups(countryId, state.leagueTeamIds);
  }
  joinClub(state, lookup, clubId);
}

/**
 * A club willing to take him for a season, or null.
 *
 * Searched across the WHOLE world rather than his own country, because a loan
 * abroad is a real thing and the transfer model already knows how to move a
 * career between leagues. Ranked by `rankLoanClubs`, which puts the strongest
 * club he would still be a starter at first — the hardest football he can be
 * sure of playing is the loan worth having.
 */
function findLoan(
  state: CareerState,
  lookup: TeamLookup,
  leagueMatches: number,
  seasonLength: number,
): LoanOffer | null {
  const parent = clubIn(state, lookup, state.clubId);
  if (!needsLoan(state.player, parent, { leagueMatches, seasonLength })) return null;

  const candidates = allClubIds(state.leagues)
    .filter((id) => id !== state.clubId)
    .map((id) => clubIn(state, lookup, id));
  const best = rankLoanClubs(state.player, candidates)[0];
  if (!best) return null;

  const placed = locateClub(state.leagues, best.id);
  return {
    clubId: best.id,
    clubName: best.name,
    countryId: placed?.countryId ?? state.countryId,
    division: placed?.division ?? 1,
    role: loanRole(state.player, best),
    pitch: loanPitch(state.player, best),
  };
}

/**
 * Take the loan: go and play somewhere else for a season.
 *
 * Deliberately built on the same machinery as accepting a transfer, because
 * from the season's point of view it is the same event — a different league, a
 * different fixture list, a different table and a different set of cups. What
 * makes it a loan rather than a move is the two things it does NOT touch: the
 * contract, which stays with the parent club, and `state.loan`, which is what
 * brings him back.
 */
export function acceptLoan(state: CareerState, offer: LoanOffer, lookup: TeamLookup): Loan {
  const parent = clubIn(state, lookup, state.clubId);
  const loan: Loan = {
    parentClubId: state.clubId,
    parentClubName: parent.name,
    clubId: offer.clubId,
    clubName: offer.clubName,
    role: offer.role,
    // The season he is about to play, which `endSeason` has already moved on to.
    season: state.seasonNumber,
  };

  state.clubId = offer.clubId;
  state.loan = loan;
  moveToClub(state, lookup, offer.clubId);
  // A loan closes the summer: he is spoken for, and a club that wanted to buy
  // him cannot also have him on loan somewhere else.
  state.offers = [];
  state.loanOffer = null;
  return loan;
}

/** Everyone at a club who matters to the player: the rival, and the receivers. */
function joinClub(state: CareerState, lookup: TeamLookup, clubId: string): void {
  state.rival = newRival(state, lookup, clubId);
  state.teammates = newTeammates(state, lookup, clubId);
  // A new manager's view of him, which starts from what the club just called
  // him and nothing else. It is deliberately not carried across from wherever
  // he came from: a reputation travels, but an opinion formed in another
  // dressing room is not one this manager has any reason to hold.
  //
  // On loan, the club whose word counts is the loan club — the same rule
  // selection and the rival already follow, and for the same reason: the man
  // picking the side is the one whose confidence matters.
  state.confidence = startingConfidence(state.loan?.role ?? state.contract?.role ?? 'starter');
}

/**
 * A fresh international season, its draw fixed by the seed and the year.
 *
 * The FIELD is the eight countries highest in the European order, so a country
 * that has been climbing can play its way into a tournament it was not in last
 * year — and one that has been sliding can miss out. That is the same order the
 * European places are handed out on, which is what ties a country's clubs and
 * its national side into one standing rather than two.
 */
function newInternational(
  seed: string,
  seasonNumber: number,
  record: Coefficients,
  nationality: string,
): InternationalState {
  const scheduled = tournamentsFor(seasonNumber, record);
  // The one HIS nation is in. Every nation is in exactly one, so this only
  // misses for a country the registry has never heard of.
  const own = tournamentFieldFor(scheduled, nationality) ?? scheduled[scheduled.length - 1]!;
  return buildTournament(seed, seasonNumber, own);
}

/**
 * What every nation earned from this season's international football.
 *
 * The player's own tournament is the real one he played in. The others — the
 * two world tiers he is not in, or the four confederations he is not from — are
 * played out here, because a tournament that never happens is not a tournament
 * a country can be scored on, and a country scored on nothing never moves in
 * the standings again. That would seal the lower tiers shut exactly as scoring
 * a non-qualifier as zero once sealed the bottom of the European order.
 */
function scoreAllTournaments(state: CareerState, lookup: TeamLookup): Record<string, number> {
  const scores: Record<string, number> = { ...scoreTournament(state.international) };
  const played = new Set(state.international.groups.flat());

  for (const scheduled of tournamentsFor(state.seasonNumber, state.coefficients)) {
    // His own, already played and already scored.
    if (scheduled.field.some((id) => played.has(nationId(id)))) continue;
    const tournament = buildTournament(state.seed, state.seasonNumber, scheduled);
    playTournament(
      new Rng(`${state.seed}:s${state.seasonNumber}:${scheduled.confederation || scheduled.kind}:play`),
      tournament,
      (id) => teamIn(state, lookup, id),
    );
    Object.assign(scores, scoreTournament(tournament));
  }

  return scores;
}

/** Every tournament of one season, the player's included. */
function tournamentsFor(seasonNumber: number, record: Coefficients): ScheduledTournament[] {
  return seasonTournaments(
    eraFor(seasonNumber),
    nationsByStanding(record),
    allConfederations(),
    (confederation) => countriesIn(confederation).map((country) => country.id),
  );
}

/** Draw one tournament, from a seed that names it. */
function buildTournament(
  seed: string,
  seasonNumber: number,
  scheduled: ScheduledTournament,
): InternationalState {
  const label = scheduled.confederation || scheduled.kind;
  return createInternational(
    new Rng(`${seed}:s${seasonNumber}:${label}:draw`),
    undefined,
    scheduled.kind,
    scheduled.field,
  );
}

/** The rng one international round is settled with. */
function internationalRng(state: CareerState, round: number): Rng {
  return new Rng(`${state.seed}:s${state.seasonNumber}:international:r${round}`);
}

/**
 * Settle an international round, IN FULL.
 *
 * The tournament does not stop because one footballer is not in it, which is
 * the whole reason being left out stings. It is only ever called for a round
 * whose date has passed, so nothing is left pending for the player — his own
 * match, if he played one, was recorded before this and is skipped as already
 * settled.
 *
 * Leaving his fixture out on the grounds that he is currently selected was
 * wrong and silently broke a season: the round would never complete, so the
 * bracket seeded off it would never be built and he would be offered no
 * knockout at all. A migrated save is exactly that case — it arrives part-way
 * through a season with international dates already behind it.
 */
function settleGroupRound(state: CareerState, round: number, lookup: TeamLookup): void {
  playGroupRound(
    internationalRng(state, round),
    state.international,
    round,
    (id) => teamIn(state, lookup, id),
  );
  closeGroupRound(state.international, round);
  // The bracket is seeded off both groups' final tables, so it can be built the
  // moment the last group match anywhere has been played.
  if (state.international.groupRoundsPlayed >= GROUP_ROUNDS) startKnockout(state.international);
}

/**
 * Set up the player's European competition for a season, if he is in one.
 *
 * The field is every club that qualified for that tier, from every country, so
 * the draw is the one part of the game where a Scottish club and a Spanish one
 * are in the same hat.
 */
function newEurope(
  entries: EuropeanEntries,
  clubId: string,
  seed: string,
  season: number,
): EuropeanState | null {
  const tier = europeanTierOf(entries, clubId);
  if (!tier) return null;
  const field = fieldFor(entries, tier);
  // A field too small to make a group cannot be drawn at all. Never happens
  // with a full world, but a partial one must degrade to "no Europe" rather
  // than to a crash.
  if (field.length < GROUP_SIZE) return null;
  return createEuropeanSeason(tier, field, new Rng(`${seed}:s${season}:europe:${tier}:draw`));
}

/**
 * A fresh pair of knockouts for a country, entered by every club in its league.
 *
 * Drawn lazily: the bracket is empty until the first round is reached, because
 * a draw made in July for a tie played in October would be a promise the cup
 * has no reason to make.
 */
function newCups(countryId: string, clubIds: readonly string[]): Record<CupKind, CupState> {
  return {
    nationalCup: createCup('nationalCup', countryId, clubIds),
    leagueCup: createCup('leagueCup', countryId, clubIds),
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
  /** True when the match was resolved automatically rather than played. */
  skipped?: boolean;
  /**
   * The decision pace the match was played at, as the settings had it.
   *
   * Passed in rather than read from anywhere, because the pace is a UI setting
   * and `simulation` cannot see one. Absent for a skipped match, and absent in
   * head-less callers that are not playing at a pace at all.
   */
  pace?: string;
  /**
   * The shootout, when the player took one himself.
   *
   * Only ever set for a knockout tie that finished level and was PLAYED. A tie
   * he skipped carries nothing here and is settled by the roll that has always
   * settled it — see `applyPlayerResult`. The score comes along with the winner
   * so the hub can say what happened rather than only who went through.
   */
  shootout?: { winnerId: string; scored: number; conceded: number };
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
  // Idempotent, and called here as well as by the UI before it builds the match
  // engine. A cup round has to be drawn before its tie can be recorded, and
  // making that the caller's job means every future caller can forget to do it.
  prepareNextMatch(state, lookup);

  const scheduled = nextMatch(state);
  if (!scheduled) throw new Error('recordPlayerMatch called with no match remaining');

  const isHome = scheduled.home;
  const outcome =
    input.playerTeamScore > input.opponentScore
      ? 1
      : input.playerTeamScore < input.opponentScore
        ? -1
        : 0;

  // A league match feeds the table; a cup tie feeds its bracket. Both are real
  // matches for the player and both are folded into his season below.
  // Captured before `applyMatchToCareer` advances the fixture index. The round
  // to simulate is the FIXTURE's own, never the calendar slot's: the two are
  // equal only while nothing has been skipped, and once they diverge the round
  // the player actually played would never be resolved for anybody else.
  const leagueFixture = scheduled.competition === 'league' ? nextFixture(state) : null;
  if (leagueFixture) {
    const result: FixtureResult = {
      ...leagueFixture,
      homeGoals: isHome ? input.playerTeamScore : input.opponentScore,
      awayGoals: isHome ? input.opponentScore : input.playerTeamScore,
    };
    state.results.push(result);
    applyResult(state.table, result);
  }

  state.lastResult = {
    opponentId: scheduled.opponentId,
    competition: scheduled.competition,
    home: isHome,
    goalsFor: input.playerTeamScore,
    goalsAgainst: input.opponentScore,
    goals: input.stats.goals,
    assists: input.stats.assists,
    rating: input.rating,
    skipped: !!input.skipped,
    ...(input.shootout
      ? {
          shootout: {
            // He plays a knockout international for his COUNTRY, so the side
            // that won is not his club.
            won:
              input.shootout.winnerId ===
              (scheduled.competition === INTERNATIONAL ? playerNation(state) : state.clubId),
            scored: input.shootout.scored,
            conceded: input.shootout.conceded,
          },
        }
      : {}),
  };

  const club = clubIn(state, lookup, state.clubId);
  const rng = new Rng(
    `${state.seed}:s${state.seasonNumber}:m${state.calendarIndex}:${scheduled.competition}`,
  );
  const changes = applyMatchToCareer(rng, state, {
    stats: input.stats,
    rating: input.rating,
    result: outcome,
    goalsFor: input.playerTeamScore,
    goalsAgainst: input.opponentScore,
    coaching: coachingQuality(club),
    clubStature: clubStature(club),
    divisionPrestige: visibilityOf(state.countryId, state.europe?.kind ?? null),
    fitnessAtEnd: input.fitnessAtEnd,
    competition: scheduled.competition,
    slotIndex: scheduled.slotIndex,
    skipped: !!input.skipped,
    pace: input.skipped ? null : (input.pace ?? null),
    // What the match was worth to the club, which is what decides how far the
    // manager's view moves on the back of it.
    importance: matchImportance(scheduled.competition, scheduled.round),
  });

  // The player was in the side, so the man he beat to it was not.
  advanceRival(state, scheduled.slotIndex, true);

  if (leagueFixture) {
    simulateRound(state, leagueFixture.round, lookup);
  } else if (scheduled.competition === SUPER_CUP) {
    if (state.superCup) {
      state.superCup = applySuperCupResult(state.superCup, {
        clubId: state.clubId,
        goalsFor: input.playerTeamScore,
        goalsAgainst: input.opponentScore,
        shootoutWinnerId: input.shootout?.winnerId,
      });
    }
  } else if (scheduled.competition === INTERNATIONAL) {
    settleInternational(state, scheduled.round, input, isHome, lookup);
  } else if (isEuropean(scheduled.competition)) {
    settleEuropean(state, scheduled.round, input, isHome, lookup);
  } else {
    settlePlayerTie(state, scheduled.competition, input, lookup);
  }

  return changes;
}

/**
 * The manager's team sheet for the next fixture.
 *
 * A pure function of the career: the seed comes from the calendar slot, so the
 * hub can ask as many times as it renders and get one answer. A selection that
 * changed every time the screen redrew would be a slot machine rather than a
 * decision, and the player would learn to re-open the screen until he was
 * picked.
 *
 * Returns `selected` for anything it cannot rotate: an international, where his
 * country picks him on reputation through its own rule, and any career without
 * a rival — which is every career saved before this existed.
 */
export function teamSheet(state: CareerState): TeamSheet {
  const scheduled = nextMatch(state);
  if (!scheduled) return { selected: true, note: '' };
  if (!state.rival || isInternational(scheduled.competition)) {
    return { selected: true, note: '' };
  }

  const congested = sharesWeek(state, scheduled);
  return pickSide(new Rng(`${state.seed}:s${state.seasonNumber}:c${scheduled.slotIndex}:sheet`), {
    player: state.player,
    rival: state.rival,
    // The club he is actually playing for decides what he is. On loan that is
    // the loan club, which took him to play him; at home it is his contract.
    role: state.loan?.role ?? state.contract.role,
    fitness: state.fitness,
    importance: matchImportance(scheduled.competition, scheduled.round),
    congested,
    // Against the club actually picking the side, which on loan is the loan
    // club. A request handed to the parent must not cost him his place
    // somewhere he never asked to leave — and `requestStands` is what says so.
    requested: requestStands(state.transferRequest, state.clubId),
    confidence: state.confidence,
  });
}

/**
 * What the player may do with the week before the next fixture, and whether he
 * has already decided.
 *
 * Returned whole rather than as four separate questions, because the hub asks
 * all of them at once and a screen that had to assemble the answer itself would
 * be the second place in the codebase deciding when a week exists.
 */
export interface WeekAhead {
  /**
   * Null when there is no week to plan: the season is over, or he is injured.
   *
   * Otherwise all four, each carrying whether he is in a state to take it. The
   * unavailable ones stay in the list so the screen can shut them visibly and
   * say why — see `weekOptions`.
   */
  options: readonly WeekOption[] | null;
  /** The plan already made for the next fixture, or null. */
  plan: WeekPlan | null;
  /**
   * Why there is nothing to decide, when there is not. Empty otherwise.
   *
   * A card that simply vanishes reads as a bug; one that says he is in the
   * treatment room reads as a career.
   */
  reason: string;
}

/**
 * The week in front of him.
 *
 * NOTHING TO PLAN WHILE INJURED, deliberately. The fixture is going to pass
 * without him whatever he does, so a training decision about it would be a
 * choice with nothing on either side of it. Being left out while fit is the
 * opposite case and keeps every option — asking for a start is precisely what
 * that week is for.
 */
export function weekAhead(state: CareerState): WeekAhead {
  const scheduled = nextMatch(state);
  if (!scheduled) return { options: null, plan: null, reason: 'The season is over.' };
  if (state.injury) {
    return {
      options: null,
      plan: null,
      reason: `You are in the treatment room. ${state.injury.label} — nothing to plan this week.`,
    };
  }
  const plan = planApplies(state.week ?? null, scheduled.slotIndex) ? state.week! : null;
  return { options: weekOptions(state.fitness), plan, reason: '' };
}

/**
 * Spend the week on one of the four things a footballer can do with seven days.
 *
 * Applied IMMEDIATELY rather than at kick-off, and that is most of what makes
 * it a decision you can feel. Fitness and the manager's confidence are both
 * read by `teamSheet`, so resting up or knocking on his door can flip the very
 * team sheet the player was looking at when he chose — a man who has just been
 * dropped can argue his way back into the side before the match he was dropped
 * from. The two deferred halves are deferred because they have nowhere else to
 * land: what a week of work is worth is only knowable once there is a match to
 * apply it to, and studying an opponent is worth nothing until you are facing
 * them.
 *
 * Returns null when there was no week to plan, or when one has already been
 * planned for this fixture. One pick, and it is final — for the same reason
 * negotiation allows exactly one push: a decision you can retake until you like
 * the answer is not a decision.
 */
export function planWeek(state: CareerState, choice: WeekChoice): WeekPlan | null {
  const ahead = weekAhead(state);
  if (!ahead.options || ahead.plan) return null;
  // Checked here as well as rendered as a shut button, because a screen is not
  // a rule. Anything that can reach this function has to be told no by it.
  if (!ahead.options.some((option) => option.choice === choice && option.available)) return null;

  const scheduled = nextMatch(state);
  if (!scheduled) return null;

  // Seeded off the calendar slot, like every other decision the career makes
  // about a specific fixture: the same week cannot be re-rolled by asking twice.
  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:c${scheduled.slotIndex}:week`);
  const outcome = spendWeek(rng, {
    choice,
    fitness: state.fitness,
    morale: state.player.morale,
    form: state.player.form,
    confidence: state.confidence ?? CONFIDENCE_NEUTRAL,
  });

  state.fitness = outcome.fitness;
  // Both, because the match engine plays a clone taken from the player and the
  // career keeps its own copy. Letting them disagree is how a career ends up
  // playing a match at a fitness nobody chose.
  state.player.fitness = outcome.fitness;
  state.player.morale = outcome.morale;
  state.confidence = outcome.confidence;

  const plan: WeekPlan = {
    choice,
    slotIndex: scheduled.slotIndex,
    note: outcome.note,
    growth: outcome.growth,
    preparation: outcome.preparation,
  };
  state.week = plan;
  return plan;
}

/**
 * What a planned week is worth to the match about to be played.
 *
 * Asked by whoever builds the match engine, and answered here rather than there
 * so that the guard on WHICH fixture a plan belongs to lives in one place.
 */
export function preparationFor(state: CareerState): number {
  const scheduled = nextMatch(state);
  if (!scheduled) return 0;
  return planApplies(state.week ?? null, scheduled.slotIndex) ? state.week!.preparation : 0;
}

/** Is there another match for him in the same week as this one? */
function sharesWeek(state: CareerState, scheduled: ScheduledMatch): boolean {
  const after = { ...state, calendarIndex: scheduled.slotIndex + 1 };
  const next = nextMatch(after);
  return !!next && next.week === scheduled.week;
}

/**
 * Move the competition on after a fixture has gone by.
 *
 * Called from both paths, because the rival's season happens whether or not the
 * player was watching it: he plays exactly the matches the player does not.
 */
function advanceRival(state: CareerState, slotIndex: number, playerPlayed: boolean): void {
  if (!state.rival) return;
  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:c${slotIndex}:rival`);
  state.rival = rivalAfterMatch(rng, state.rival, !playerPlayed);
}

/** What happened in a fixture the player was not fit to play. */
export interface MissedMatch {
  competition: CompetitionKind;
  opponentId: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  /** The injury as it stands after the match went by, or null if he is fit now. */
  injury: Injury | null;
}

/**
 * Let the next fixture pass without him.
 *
 * The counterpart to `recordPlayerMatch`, and deliberately the same shape: the
 * season has to move on identically whether he played or watched. The club
 * still plays, the result still counts, the table and the bracket still move,
 * and the calendar still advances. The only difference is that none of it is
 * HIS — no statistics, no rating, no development, no record book, no
 * reputation. That absence is the whole mechanism: a season with matches
 * missing from it is what makes playing time a number that can fall below one.
 *
 * The result is simulated the way every other club's fixture is simulated —
 * `simulateFixture`, seeded off the calendar slot — because that is exactly
 * what his club's match is when he is not in it: a background fixture.
 */
export function missMatch(state: CareerState, lookup: TeamLookup): MissedMatch {
  prepareNextMatch(state, lookup);

  const scheduled = nextMatch(state);
  if (!scheduled) throw new Error('missMatch called with no match remaining');

  const isHome = scheduled.home;
  // His country plays the international, not his club.
  const ownId = isInternational(scheduled.competition) ? playerNation(state) : state.clubId;
  const own = teamIn(state, lookup, ownId);
  const opponent = teamIn(state, lookup, scheduled.opponentId);

  const rng = new Rng(
    `${state.seed}:s${state.seasonNumber}:c${scheduled.slotIndex}:absent`,
  );
  const { homeGoals, awayGoals } = simulateFixture(
    rng,
    isHome ? own : opponent,
    isHome ? opponent : own,
  );
  const goalsFor = isHome ? homeGoals : awayGoals;
  const goalsAgainst = isHome ? awayGoals : homeGoals;

  // A league fixture is a row in the table like any other. Captured before the
  // indexes move, for the same reason `recordPlayerMatch` captures it there.
  const leagueFixture = scheduled.competition === 'league' ? nextFixture(state) : null;
  if (leagueFixture) {
    const result: FixtureResult = {
      ...leagueFixture,
      homeGoals: leagueFixture.homeId === state.clubId ? goalsFor : goalsAgainst,
      awayGoals: leagueFixture.homeId === state.clubId ? goalsAgainst : goalsFor,
    };
    state.results.push(result);
    applyResult(state.table, result);
  }

  state.lastResult = {
    opponentId: scheduled.opponentId,
    competition: scheduled.competition,
    home: isHome,
    goalsFor,
    goalsAgainst,
    // Nothing of his, because none of it happened. The hub reads `missed` and
    // says so rather than reporting a 0.0 rating he never earned.
    goals: 0,
    assists: 0,
    rating: 0,
    skipped: false,
    missed: true,
  };

  // Everything downstream takes the same shape it takes for a played match, so
  // the settlement below is the settlement that has always run.
  const asPlayed: PlayedMatchInput = {
    stats: createMatchStats(),
    rating: 0,
    playerTeamScore: goalsFor,
    opponentScore: goalsAgainst,
    fitnessAtEnd: state.fitness,
  };

  if (leagueFixture) state.nextFixtureIndex += 1;
  state.calendarIndex = scheduled.slotIndex + 1;

  if (leagueFixture) {
    simulateRound(state, leagueFixture.round, lookup);
  } else if (scheduled.competition === SUPER_CUP) {
    if (state.superCup) {
      state.superCup = applySuperCupResult(state.superCup, {
        clubId: state.clubId,
        goalsFor,
        goalsAgainst,
        // Level, and he was not there to take a kick. Rolled on the two clubs'
        // strength, the same weighting a cup tie uses — without this the tie
        // would fall to the champions by default, which is a trophy awarded on
        // a technicality.
        shootoutWinnerId:
          goalsFor === goalsAgainst ? missedShootoutWinner(state, rng, scheduled, lookup) : undefined,
      });
    }
  } else if (scheduled.competition === INTERNATIONAL) {
    settleInternational(state, scheduled.round, asPlayed, isHome, lookup);
  } else if (isEuropean(scheduled.competition)) {
    settleEuropean(state, scheduled.round, asPlayed, isHome, lookup);
  } else {
    settlePlayerTie(state, scheduled.competition, asPlayed, lookup);
  }

  // A week in the treatment room is still a week: fitness comes back, and the
  // injury moves one step closer to over. This is the only thing that ever
  // heals one, so it must run on the missed path as well as the played one.
  restUntilNextMatch(state, scheduled.slotIndex, state.fitness);
  // He played, because somebody had to.
  advanceRival(state, scheduled.slotIndex, false);

  // Form drifts back toward neutral rather than staying frozen, and the
  // difference is the whole difference between a hard spell and a trap. Form is
  // only earned by playing, so a player dropped while out of form would keep
  // that form for as long as he was out of the side — and need form to get back
  // into it. The way out cannot be locked behind the thing being punished.
  state.player.form = round(state.player.form * 0.88 + 50 * 0.12, 1);
  // The manager's view drifts the same way and for the same reason, a little
  // more slowly. An injury pulls it back faster than an omission does: nobody
  // is being judged for a hamstring. See core/career/confidence.ts.
  state.confidence = confidenceAfterAbsence(
    state.confidence ?? CONFIDENCE_NEUTRAL,
    state.injury !== null,
  );

  // The week is spent whether or not he got on the pitch, and that is the
  // honest cost of planning one: a week of extra work before a match you are
  // left out of bought you nothing, which is exactly what would have happened.
  if (planApplies(state.week ?? null, scheduled.slotIndex)) state.week = null;

  return {
    competition: scheduled.competition,
    opponentId: scheduled.opponentId,
    home: isHome,
    goalsFor,
    goalsAgainst,
    injury: state.injury,
  };
}

/**
 * Who wins a super cup shootout nobody took.
 *
 * The same strength weighting `applyPlayerResult` uses for a cup tie, rather
 * than a coin: a shootout is close to even and not quite even, and the two
 * places that settle one should not disagree about by how much.
 */
function missedShootoutWinner(
  state: CareerState,
  rng: Rng,
  scheduled: ScheduledMatch,
  lookup: TeamLookup,
): string {
  const own = teamIn(state, lookup, state.clubId);
  const opponent = teamIn(state, lookup, scheduled.opponentId);
  const edge = clamp01(0.5 + (teamStrength(own) - teamStrength(opponent)) * 0.35);
  return rng.chance(edge) ? state.clubId : scheduled.opponentId;
}

/**
 * Fold the player's international result in, then settle the rest of the round.
 *
 * A group match feeds the group table; a knockout tie feeds the bracket. The
 * two live in one competition because that is what a tournament is, and the
 * round number is what says which half of it we are in.
 */
function settleInternational(
  state: CareerState,
  round: number,
  input: PlayedMatchInput,
  isHome: boolean,
  lookup: TeamLookup,
): void {
  const nation = playerNation(state);

  if (round <= GROUP_ROUNDS) {
    const fixture = groupFixture(state.international, nation, round);
    if (fixture) {
      recordGroupResult(state.international, {
        ...fixture,
        homeGoals: isHome ? input.playerTeamScore : input.opponentScore,
        awayGoals: isHome ? input.opponentScore : input.playerTeamScore,
      });
    }
    settleGroupRound(state, round, lookup);
    return;
  }

  const knockout = state.international.knockout;
  if (!knockout) return;
  const rng = new Rng(
    `${state.seed}:s${state.seasonNumber}:international:ko${knockout.rounds.length}:result`,
  );
  applyPlayerResult(rng, knockout, {
    clubId: nation,
    goalsFor: input.playerTeamScore,
    goalsAgainst: input.opponentScore,
    lookup: (id) => teamIn(state, lookup, id),
    shootoutWinnerId: input.shootout?.winnerId,
  });
  closeRound(knockout, nation);
}

/**
 * Fold the player's European result in, then settle the rest of the round.
 *
 * A group match feeds the table; a knockout tie feeds the bracket. Which of
 * the two it is comes from the round number and nothing else — see
 * `isGroupRound`.
 */
function settleEuropean(
  state: CareerState,
  round: number,
  input: PlayedMatchInput,
  isHome: boolean,
  lookup: TeamLookup,
): void {
  const europe = state.europe;
  if (!europe) return;
  const clubs = (id: string) => clubIn(state, lookup, id);

  if (isGroupRound(round)) {
    const fixture = europeanGroupFixture(europe, state.clubId, round);
    if (fixture) {
      recordEuropeanGroupResult(europe, {
        ...fixture,
        homeGoals: isHome ? input.playerTeamScore : input.opponentScore,
        awayGoals: isHome ? input.opponentScore : input.playerTeamScore,
      });
    }
    // Everybody else in the round, now that his own result is in.
    playEuropeanGroupRound(
      new Rng(`${state.seed}:s${state.seasonNumber}:europe:group:${round}`),
      europe,
      round,
      clubs,
      state.clubId,
    );
    closeEuropeanGroupRound(europe, round);
    return;
  }

  const knockout = europe.knockout;
  if (!knockout) return;
  applyPlayerResult(
    new Rng(`${state.seed}:s${state.seasonNumber}:${europe.kind}:r${knockout.rounds.length}:result`),
    knockout,
    {
      clubId: state.clubId,
      goalsFor: input.playerTeamScore,
      goalsAgainst: input.opponentScore,
      lookup: clubs,
      shootoutWinnerId: input.shootout?.winnerId,
    },
  );
  closeRound(knockout, state.clubId);
}

/**
 * Fold the player's cup result into the bracket and move the round on.
 *
 * Called after the tie has been played or skipped. Losing here is what ends a
 * cup run: `closeRound` notices he is no longer among the survivors and the
 * calendar stops offering him that competition's remaining rounds.
 */
function settlePlayerTie(
  state: CareerState,
  kind: CompetitionKind,
  input: PlayedMatchInput,
  lookup: TeamLookup,
): void {
  const cup = knockoutFor(state, kind);
  if (!cup) return;
  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:${kind}:r${cup.rounds.length}:result`);
  applyPlayerResult(rng, cup, {
    clubId: state.clubId,
    goalsFor: input.playerTeamScore,
    goalsAgainst: input.opponentScore,
    lookup: (id) => clubIn(state, lookup, id),
    shootoutWinnerId: input.shootout?.winnerId,
  });
  closeRound(cup, state.clubId);
}

/**
 * Make sure the competition the player is about to play in is ready for him.
 *
 * A cup round cannot be drawn until the one before it has been settled, so the
 * draw happens at the last possible moment: when the match is about to be
 * played. IDEMPOTENT — a round that has already been drawn is left alone — so
 * both the UI (which needs the opponent to build a match) and
 * `recordPlayerMatch` (which needs the bracket to record a result) can call it
 * without either having to know the other did.
 */
export function prepareNextMatch(state: CareerState, lookup: TeamLookup): void {
  // A career saved before rotation existed has nobody competing for its shirt.
  // Built here rather than in the migration because the rival comes from the
  // club as this career knows it, drifted ratings and all, and a migration has
  // no business reconstructing that. Deterministic on club and career, so the
  // same footballer appears however many times this runs.
  if (!state.rival || state.teammates.length === 0) joinClub(state, lookup, state.clubId);

  const upcoming = nextMatch(state);
  catchUpInternational(state, upcoming?.slotIndex ?? Number.POSITIVE_INFINITY, lookup);
  catchUpEurope(state, upcoming?.slotIndex ?? Number.POSITIVE_INFINITY, lookup);
  catchUpKnockouts(state, lookup);

  // Asked AGAIN, because a catch-up can bring a competition into existence.
  // Europe's bracket is built the moment its last group round is settled, and
  // until it exists there is no knockout tie for the walk to find — so a
  // `nextMatch` read from before the catch-up would skip the quarter-final it
  // has just made possible, and skip it again on every future call.
  const scheduled = nextMatch(state);
  if (!scheduled || scheduled.competition === 'league') return;

  if (scheduled.competition === INTERNATIONAL) {
    // A group match needs no draw — the fixture list is known from the start.
    if (scheduled.round <= GROUP_ROUNDS) return;
    const knockout = state.international.knockout;
    const koRound = scheduled.round - GROUP_ROUNDS;
    if (!knockout || knockout.rounds.length >= koRound) return;
    openRound({
      rng: internationalRng(state, scheduled.round),
      cup: knockout,
      lookup: (id) => teamIn(state, lookup, id),
      playerClubId: playerNation(state),
    });
    return;
  }

  if (isEuropean(scheduled.competition)) {
    // A group match needs no draw: the fixture list was made when the season
    // was. Only the bracket half has rounds to open, and it does not exist
    // until every group has finished.
    if (isGroupRound(scheduled.round)) return;
    const knockout = startEuropeanKnockout(state.europe!);
    const koRound = knockoutRoundOf(scheduled.round);
    if (!knockout || knockout.rounds.length >= koRound) return;
    openRound({
      rng: new Rng(
        `${state.seed}:s${state.seasonNumber}:${scheduled.competition}:r${scheduled.round}`,
      ),
      cup: knockout,
      lookup: (id) => clubIn(state, lookup, id),
      playerClubId: state.clubId,
    });
    return;
  }

  const cup = knockoutFor(state, scheduled.competition);
  if (!cup || cup.rounds.length >= scheduled.round) return;

  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:${scheduled.competition}:r${scheduled.round}`);
  openRound({
    rng,
    cup,
    lookup: (id) => clubIn(state, lookup, id),
    playerClubId: state.clubId,
  });
}

/**
 * Settle European group rounds the calendar has passed.
 *
 * The same job `catchUpInternational` does, for the same reason: a group round
 * he was not involved in still has to be played, or the table he is reading in
 * November would be missing three of its four fixtures.
 */
export function catchUpEurope(state: CareerState, beforeSlot: number, lookup: TeamLookup): void {
  const europe = state.europe;
  if (!europe) return;
  const calendar = calendarFor(state);
  for (let i = 0; i < Math.min(beforeSlot, calendar.length); i++) {
    const slot = calendar[i]!;
    if (slot.competition !== europe.kind || !isGroupRound(slot.round)) continue;
    if (europe.groupRoundsPlayed >= slot.round) continue;
    playEuropeanGroupRound(
      new Rng(`${state.seed}:s${state.seasonNumber}:europe:group:${slot.round}`),
      europe,
      slot.round,
      (id) => clubIn(state, lookup, id),
      state.clubId,
    );
    closeEuropeanGroupRound(europe, slot.round);
  }

  // Once every group is finished the bracket can be built, and must be: it is
  // what the rest of the season's European dates are for.
  startEuropeanKnockout(europe);
}

/**
 * Play on the knockouts the player is no longer in.
 *
 * A cup does not stop because he went out of it in the second round — and until
 * this existed, his own country's cup did exactly that: the bracket sat frozen
 * at the round he lost in, all season, and only lurched to a winner at the
 * final whistle in May. Every other country's cup was live; his own, the one he
 * had actually played in, was the one that stood still.
 *
 * Rounds are opened with the SAME per-round seed a round he was still in would
 * have used, so whether he went out in the first round or the semi-final makes
 * no difference to who lifts the trophy. `finishCup` at the end of the season
 * then finds nothing left to do, and remains as the safety net for a season
 * that somehow ends early.
 *
 * Idempotent, and called from `prepareNextMatch` alongside the international
 * catch-up for the same reason: both the UI and the match recorder get it
 * without either having to know the other did.
 */
export function catchUpKnockouts(state: CareerState, lookup: TeamLookup): void {
  const clubs = (id: string) => clubIn(state, lookup, id);

  for (const kind of CUP_KINDS) {
    const cup = state.cups?.[kind];
    // Still in it: his own tie is his to play, and drawing the round here would
    // resolve it around him and hand the result to somebody else.
    if (cup && !stillIn(cup, state.clubId)) {
      playOnWithout(state, cup, roundsReached(state, kind), clubs, kind);
    }
  }

  // Europe plays on without him too — and unlike a cup it has two halves, so
  // "how far has it got" has to be answered across both. A club that went out
  // in the group has a whole knockout still to be played around it.
  const europe = state.europe;
  if (europe && !stillInCompetition(europe, state.clubId)) {
    advanceEuropeanSeason(
      new Rng(`${state.seed}:s${state.seasonNumber}:europe:${europe.kind}`),
      europe,
      roundsReached(state, europe.kind),
      clubs,
    );
  }

  // The super cup is one fixture rather than a bracket, so it has no rounds to
  // catch up — it is either his to play or somebody else's, and somebody
  // else's is settled here so the honours list and the season review can say
  // who opened the year with a trophy.
  const superCup = state.superCup;
  if (superCup && !superCup.winnerId && !playsInSuperCup(superCup, state.clubId)) {
    state.superCup = resolveSuperCup(
      new Rng(`${state.seed}:s${state.seasonNumber}:superCup`),
      superCup,
      clubs(superCup.championId),
      clubs(superCup.challengerId),
    );
  }
}

/** Open and settle rounds of a knockout the player is not in, up to `rounds`. */
function playOnWithout(
  state: CareerState,
  cup: CupState<CompetitionKind>,
  rounds: number,
  lookup: TeamLookup,
  kind: CompetitionKind,
): void {
  while (cup.winnerId === null && cup.rounds.length < rounds) {
    const last = cup.rounds[cup.rounds.length - 1];
    // A tie of his own still waiting to be played. Cannot happen while he is
    // out of the competition, but running past one would silently overwrite a
    // match the season is still expecting him to turn up for.
    if (last && last.ties.some((tie) => !tie.winnerId)) return;
    openRound({
      rng: new Rng(`${state.seed}:s${state.seasonNumber}:${kind}:r${cup.rounds.length + 1}`),
      cup,
      lookup,
    });
    closeRound(cup, state.clubId);
  }
}

/**
 * Settle international rounds whose date has passed without the player.
 *
 * A group round he was not picked for is still PLAYED — by everybody else, on
 * the night it was scheduled. Without this the tournament only moves when the
 * player moves, which has two consequences, both wrong: the world cannot show a
 * live group table to a player who is not in the squad, and — worse — a player
 * who climbs into selection midway through a season finds no knockout waiting
 * for him, because the groups he missed were never finished and the bracket
 * that is seeded off them was therefore never built.
 *
 * Idempotent, and called from `prepareNextMatch` so both the UI and the match
 * recorder get it without either having to know the other did.
 */
export function catchUpInternational(
  state: CareerState,
  beforeSlot: number,
  lookup: TeamLookup,
): void {
  const calendar = calendarFor(state);
  for (let i = 0; i < Math.min(beforeSlot, calendar.length); i++) {
    const slot = calendar[i]!;
    if (slot.competition !== INTERNATIONAL || slot.round > GROUP_ROUNDS) continue;
    if (state.international.groupRoundsPlayed >= slot.round) continue;
    settleGroupRound(state, slot.round, lookup);
  }
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
  /**
   * A club willing to take him for a season to get him playing, if he needs one.
   *
   * Null for almost every season of almost every career: it needs a young
   * player, short of games, at a club that sees him as cover. Those three
   * together are exactly the situation a loan exists for.
   */
  loanOffer: LoanOffer | null;
  /** The division the season was played in. */
  division: number;
  /** The division the club will play in next season. */
  nextDivision: number;
  /** The country the season was played in. */
  countryId: string;
  /** The country the player will be playing in next season. */
  nextCountryId: string;
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
  /** Both knockouts as they finished, for the review to report the runs. */
  cups: Record<CupKind, CupState>;
  /** The super cup that opened this season, if there was one to open it. */
  superCup: SuperCupTie | null;
  /** Which of them the player's club won. */
  cupsWon: CupKind[];
  /** The European competition played this season, as it finished. */
  europe: EuropeanState | null;
  /** Which competition it was, if any. */
  europeanTier: EuropeanTier | null;
  /** True when the club won it. */
  wonEurope: boolean;
  /** The competition the club has qualified for NEXT season, if any. */
  nextEuropeanTier: EuropeanTier | null;
  /** The international season, as it finished. */
  international: InternationalState;
  /** International matches he played in it. Zero when he was not picked. */
  caps: number;
  /** The nation that won the tournament. */
  internationalChampion: string | null;
  /**
   * Champions League places his country had this season, and has next.
   *
   * The two differ when the tournament just played moved his country in the
   * European order. It is the one outcome of an international summer that
   * changes club football, so the review says so plainly.
   */
  placesBefore: number;
  placesAfter: number;
  /** The European order the places were handed out on, best first. */
  europeanOrder: string[];
  /** True when that nation was his. */
  wonInternational: boolean;
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

  // Both knockouts are played out to a winner FIRST, before anything reads a
  // result off the season. A cup the player went out of carries on without him,
  // because "who won the one you lost" is part of knowing where you stand — and
  // the honours below cannot judge a cup that has not finished.
  for (const kind of CUP_KINDS) {
    finishCup(
      new Rng(`${state.seed}:s${state.seasonNumber}:${kind}:finish`),
      state.cups[kind],
      (id) => clubIn(state, lookup, id),
      state.clubId,
    );
  }
  const cupsWon = CUP_KINDS.filter((kind) => state.cups[kind].winnerId === state.clubId);

  // The international season finishes whether or not he was ever picked. A
  // tournament the player watched on television still has a winner, and the
  // world has to be able to say who it was.
  for (let round = 1; round <= GROUP_ROUNDS; round++) settleGroupRound(state, round, lookup);
  const knockout = startKnockout(state.international);
  if (knockout) {
    finishCup(
      new Rng(`${state.seed}:s${state.seasonNumber}:international:finish`),
      knockout,
      (id) => teamIn(state, lookup, id),
      playerNation(state),
    );
  }
  const internationalChampion = championNation(state.international);
  const wonInternational = internationalChampion === playerNation(state);
  // Read before the summer resets it for next year's tournament.
  const capsThisSeason = state.seasonCaps;

  // The European season finishes too, whether or not he was still in it — both
  // halves of it, since a club knocked out in its group leaves a whole bracket
  // still to be played.
  if (state.europe) {
    advanceEuropeanSeason(
      new Rng(`${state.seed}:s${state.seasonNumber}:europe:${state.europe.kind}`),
      state.europe,
      EUROPEAN_MATCHES,
      (id) => clubIn(state, lookup, id),
    );
    if (state.europe.knockout) {
      finishCup(
        new Rng(`${state.seed}:s${state.seasonNumber}:europe:finish`),
        state.europe.knockout,
        (id) => clubIn(state, lookup, id),
        state.clubId,
      );
    }
  }
  const europeanTier = state.europe?.kind ?? null;
  const wonEurope = europeanWinner(state.europe) === state.clubId;

  // BOTH halves of the season now go on every country's record, and the European
  // order is re-read off them — BEFORE places are awarded below, so a country
  // that has just reached a final is rewarded for it this summer rather than
  // next. This is the whole point of the coefficient: what a country's clubs did
  // in Europe over the winter and what its national side did in the summer
  // decide how many clubs from it play in the Champions League.
  //
  // All three European competitions are read, not just the player's. Only his
  // is a stored bracket; the other two are derived on demand, and by now the
  // season has run past every European date so they come back finished.
  const allEurope: Partial<Record<EuropeanTier, EuropeanState | null>> = {};
  for (const tier of EUROPEAN_TIERS) allEurope[tier] = europeanState(state, tier, lookup);

  const placesBefore = championsLeaguePlaces(
    state.countryId,
    countriesByStanding(state.coefficients),
  );
  state.coefficients = recordEuropeanSeason(state.coefficients, {
    clubs: scoreEuropeanSeason(state.europeanEntries ?? {}, allEurope, (id) =>
      countryOfClub(state, id),
    ),
    nations: scoreAllTournaments(state, lookup),
  });
  const europeanOrder = countriesByStanding(state.coefficients);
  const placesAfter = championsLeaguePlaces(state.countryId, europeanOrder);

  const position = tablePosition(state.table, state.clubId);
  // Captured before `advanceSeason` empties the table: next season's super cup
  // is read off this one, and by then there is nothing left to read.
  const finalStandings = sortTable(state.table).map((row) => row.teamId);
  const champion = finalStandings[0] ?? state.clubId;

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
  const countryId = state.countryId;
  // The fixture list of the season that has just been PLAYED, captured before
  // anything replaces it. Read three times below — reputation, awards, and
  // whether he needs a loan — and by the time the last of those runs both the
  // fixtures and, for a loanee, the club have moved on.
  const playedSeasonLength = fixturesFor(state, state.clubId).length;

  const reputation = settleReputation(state.player, {
    stats: state.seasonStats,
    leaguePosition: position,
    leagueSize: state.leagueTeamIds.length,
    clubStature: clubStature(club),
    // Both halves of playing time come off the LEAGUE ledger, so the ratio is
    // matches-he-played over matches-there-were rather than every competition
    // over one of them. See `leagueMatches` in reputation.ts.
    leagueMatches: state.leagueStats.matches,
    seasonLength: playedSeasonLength,
    // A European run is seen by more people than the league it came from, so a
    // player at a small club who reaches the Champions League is genuinely more
    // visible than his league alone would make him.
    divisionPrestige: visibilityOf(countryId, state.europe?.kind ?? null),
  });

  // The player's own country's pyramid moves before anything reads a club's
  // division again. With one tier per country this settles the table and swaps
  // nobody; it becomes promotion and relegation the moment a country gains a
  // second tier, without another line here.
  const outcome = resolveDivisions(new Rng(`${state.seed}:s${state.seasonNumber}:divisions`), {
    divisions: state.leagues[countryId] ?? [state.leagueTeamIds],
    playerDivision: division,
    playerTable: state.table,
    lookup: (id) => clubIn(state, lookup, id),
  });
  const movement = movementFor(outcome, state.clubId);

  // Every other league in the world plays its season out too — every tier of
  // every country, not just the top one, or a second division added later would
  // have its clubs frozen out of drift. Their tables are what drift reads, and
  // — from the next stage — what European places are awarded on.
  const settled: TableRow[][] = [...outcome.tables];
  const backgroundTables = new Map<string, TableRow[]>();
  for (const other of playedCountries(state.leagues)) {
    if (other === countryId) continue;
    const pyramid = state.leagues[other] ?? [];
    for (let tier = 1; tier <= pyramid.length; tier++) {
      const table = simulateDivisionThrough(
        leagueRng(state, other, tier),
        leagueMembers(state.leagues, other, tier).map((id) => clubIn(state, lookup, id)),
        Number.POSITIVE_INFINITY,
      );
      settled.push(table);
      if (tier === 1) backgroundTables.set(other, table);
    }
  }
  /** A country's finished top-flight table, already computed above. */
  const backgroundTable = (id: string): TableRow[] => backgroundTables.get(id) ?? [];

  // Awards are judged on the division just played, against a bar inferred from
  // the football that happened in it (see core/career/awards.ts).
  // Judged on LEAGUE football against a benchmark inferred from the LEAGUE
  // table. Counting cup goals toward the golden boot would let a good cup run
  // win an award the league never saw.
  const benchmark = leagueBenchmark(new Rng(`${state.seed}:s${state.seasonNumber}:awards`), {
    table: state.table,
    playerClubId: state.clubId,
    playerGoals: state.leagueStats.goals,
  });
  const honoursResult = evaluateHonours({
    player: state.player,
    stats: state.leagueStats,
    season: state.seasonNumber,
    clubId: state.clubId,
    division,
    countryId,
    position,
    movement,
    cupsWon,
    // The super cup was played in the FIRST week of the season being closed, so
    // the tie sitting on the career now is the one this season played. It is
    // replaced below with the one next season will play.
    wonSuperCup: state.superCup?.winnerId === state.clubId,
    europeanTier,
    wonEurope,
    internationalRounds: state.seasonCaps,
    wonInternational,
    reachedInternationalFinal:
      !!knockout &&
      !wonInternational &&
      knockout.eliminatedInRound === (knockout.rounds.length || 0),
    reachedEuropeanFinal:
      lostEuropeanFinal(state.europe, state.clubId),
    benchmark,
    seasonLength: playedSeasonLength,
  });
  state.honours.push(...honoursResult.honours);
  state.player.caps += honoursResult.capsGained;

  // Wages for the season just played are banked, then the clock runs down one.
  const earnings = advanceContract(state.contract);
  state.careerEarnings = round(state.careerEarnings + earnings, 2);

  // Who plays in Europe next season, decided by the season that has just
  // finished everywhere. This is the loop Europe exists to close: where your
  // club finished in May is worth something concrete in September.
  //
  // BEFORE the drift below, and that ordering is load-bearing. The background
  // countries' league tables were settled above with the strengths the season
  // was actually played on; their cup winners are recomputed on demand from
  // whatever the strengths are WHEN THEY ARE ASKED FOR. Drifting first meant a
  // country's European places were awarded off a table from this season and a
  // cup won by next season's squads — so a club that had just collapsed could
  // lift a trophy on the strength of a side it no longer had.
  const finalTables: Record<string, TableRow[]> = {};
  const nationalCupWinners: Record<string, string | null> = {};
  const leagueCupWinners: Record<string, string | null> = {};
  for (const id of playedCountries(state.leagues)) {
    // Always the TOP FLIGHT's table. Europe is entered from the first division
    // of a country, never from whichever one the player happens to be in — a
    // distinction that does not show while every country is one tier deep, and
    // would silently award European places off a second-division table the
    // moment one exists.
    finalTables[id] = id === countryId ? outcome.tables[0] ?? [] : backgroundTable(id);
    nationalCupWinners[id] = cupWinner(state, 'nationalCup', id, lookup);
    leagueCupWinners[id] = cupWinner(state, 'leagueCup', id, lookup);
  }
  const nextEuropeanEntries = qualifyForEurope({
    tables: finalTables,
    nationalCupWinners,
    leagueCupWinners,
    order: europeanOrder,
  });

  // Clubs are only as good as their last season — everywhere, not just where
  // the player happens to be, or seven of the eight leagues would be frozen in
  // the shape the data file shipped with. Drift anchors to the BASE ratings, so
  // this takes the raw lookup rather than the drifted one.
  state.clubStrengths = driftSeason(new Rng(`${state.seed}:s${state.seasonNumber}:drift`), {
    strengths: state.clubStrengths,
    tables: settled,
    lookup,
  });
  // And the nations with no clubs to drift behind them, on the same night.
  state.nationStrengths = driftNations(
    new Rng(`${state.seed}:s${state.seasonNumber}:nations:drift`),
    state.nationStrengths ?? {},
  );

  state.leagues = { ...state.leagues, [countryId]: outcome.divisions };

  // THE SEAM. Everything above has settled the season he spent at the loan
  // club — its table, its awards, his reputation, his honours — and everything
  // below builds the season he will play at the club that owns him. Sending him
  // back here rather than a line earlier or later is what makes both halves
  // read the right club, because `locateClub` on the next line is what decides
  // the country, the division and the fixture list of the season to come.
  // A loan ends here, and it ends in two steps rather than one, because the two
  // halves of "where does he belong" are needed at different moments. The
  // SEASON AHEAD is his parent club's from this line on — its league, its
  // fixtures, its cups. The SEASON JUST PLAYED is still the loan club's, and it
  // has not been written to history yet: `advanceSeason` does that below, off
  // `state.clubId`. So the club he is at moves only after the record is made,
  // or a career would remember a year at a club it spent somewhere else.
  const returning = state.loan;
  const nextClubId = returning ? returning.parentClubId : state.clubId;

  const located = locateClub(state.leagues, nextClubId);
  const nextCountry = located?.countryId ?? countryId;
  const nextDivision = located?.division ?? division;
  const nextLeague = leagueMembers(state.leagues, nextCountry, nextDivision);

  // Taken before the season is advanced, which resets both ledgers. The season
  // record is judged on LEAGUE goals — a twenty-goal season has to mean the same
  // thing in every career, and a cup run is a different achievement counted
  // separately in the record book's per-competition split.
  const leagueStats = state.leagueStats;

  const rng = new Rng(`${state.seed}:s${state.seasonNumber}:end`);
  const nextRng = new Rng(`${state.seed}:season:${state.seasonNumber + 1}`);
  const record = advanceSeason(rng, state, position, {
    fixtures: generateFixtures(nextLeague, nextRng),
    table: emptyTable(nextLeague),
    leagueTeamIds: nextLeague,
    division: nextDivision,
    countryId: nextCountry,
  });

  // The record is written, so the loan is over. Everything below builds next
  // season for the club that owns him, and every one of those lines reads
  // `state.clubId`.
  if (returning) {
    state.clubId = returning.parentClubId;
    state.loan = null;
    // He walks back into a dressing room he has been away from for a year. The
    // rival he left is not the one he comes back to, and neither are the people
    // he passes to — a season is long enough for a club to have moved on.
    joinClub(state, lookup, state.clubId);
  }

  // The rival had a summer too. He is a year older and better or worse for it,
  // so a shirt won last season is not one that stays won — and a rival who kept
  // the player out at thirty-one is a problem that starts solving itself.
  if (state.rival) {
    state.rival = driftRival(
      new Rng(`${state.seed}:s${state.seasonNumber}:rival:drift`),
      state.rival,
    );
  }

  // A new season needs new knockouts, entered by whoever is in the league now.
  // The finished ones are handed back on the season end so the review can
  // report the runs that have just been erased from the live state.
  const finishedCups = state.cups;
  const finishedEurope = state.europe;
  const finishedInternational = state.international;
  // Handed back on the season end, because the live one is about to be replaced
  // by next season's and the review still has to be able to report it.
  const finishedSuperCup = state.superCup;

  // Next season's opening fixture, earned by the one that just finished.
  //
  // Built from THIS country's table and cup, not next season's: the super cup
  // is played by the champions and cup winners of the league it belongs to, so
  // a player who moves abroad in the summer simply is not in it — which is both
  // correct and the reason it is checked by club id rather than assumed.
  state.superCup = nextSuperCup({
    countryId,
    standings: finalStandings,
    cupWinnerId: finishedCups?.nationalCup?.winnerId ?? null,
  });

  state.cups = newCups(nextCountry, nextLeague);
  // A new tournament, drawn afresh. `advanceSeason` has already moved the
  // season number on, so this is next year's draw and not a repeat of the one
  // just played — leaving the old one in place would freeze the groups at
  // full-time and never offer another international match again.
  state.international = newInternational(
    state.seed,
    state.seasonNumber,
    state.coefficients,
    state.player.nationality,
  );
  state.seasonCaps = 0;
  state.europeanEntries = nextEuropeanEntries;
  state.europe = newEurope(nextEuropeanEntries, state.clubId, state.seed, state.seasonNumber);

  recordSeason(state.records, leagueStats);

  // Unspent points are never banked; a fresh award replaces whatever was left.
  state.trainingPoints = award.points;

  // Offers come AFTER the birthday: clubs buy the player who will turn out for
  // them next season, not the one who finished last season. They also come from
  // the WHOLE pyramid, which is the point of having one — a good season in the
  // second division is seen by clubs in the first.
  const outOfContract = isExpired(state.contract);
  const nextPrestige = countryPrestige(nextCountry);
  const offerRng = new Rng(`${state.seed}:s${record.seasonNumber}:transfers`);
  const lastMove = state.transfers[state.transfers.length - 1];
  // Read against the club that would SELL him, which on loan is the parent: the
  // request was handed to the people who own his contract, and they are the
  // ones a bidding club has to deal with.
  const requested = requestStands(state.transferRequest, state.loan?.parentClubId ?? state.clubId);
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
    countryOf: (id) => countryOfClub(state, id),
    outOfContract,
    preferences: state.preferences,
    // Next season's qualification, which the lines above have just settled. A
    // player holding out for European football is asking about the season he
    // would actually play, not the one that has just finished.
    europeanTierOf: (id) => nextEuropeanEntries[id] ?? null,
    transferRequested: requested,
  });

  // His own club only puts terms up when the old deal has actually run out.
  // Anything else and he is simply still under contract, and staying needs no
  // decision at all.
  // A club does not put new terms in front of a player who has asked to leave.
  // This is the second half of what a request costs, and the sharper half when
  // his contract is running down: asking to go in the last year of a deal means
  // the door behind him closes as well.
  state.renewal = outOfContract && !requested
    ? renewalOffer({
        player: state.player,
        club: clubIn(state, lookup, state.clubId),
        stats: record.stats,
        season: record.seasonNumber,
        prestige: nextPrestige,
        // The question only his own club can answer. It decides whether terms
        // go up at all, and what they call him when they do.
        confidence: state.confidence,
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

  // Whether anybody would take him for a year to get him playing. Judged on the
  // season just finished — the LEAGUE half of it — which is only a question
  // worth asking now that being out of the side is a thing that happens.
  state.loanOffer = findLoan(state, lookup, leagueStats.matches, playedSeasonLength);

  return {
    record,
    position,
    champion,
    progress,
    trainingAwarded: award.points,
    trainingNotes: award.notes,
    reputation,
    offers: state.offers,
    loanOffer: state.loanOffer,
    division,
    nextDivision,
    countryId,
    nextCountryId: nextCountry,
    movement,
    honours: honoursResult.honours,
    capsGained: honoursResult.capsGained,
    benchmark,
    renewal: state.renewal,
    earnings,
    outOfContract,
    fellBackOnClub,
    cups: finishedCups,
    superCup: finishedSuperCup,
    cupsWon,
    europe: finishedEurope,
    europeanTier,
    wonEurope,
    international: finishedInternational,
    caps: capsThisSeason,
    internationalChampion,
    wonInternational,
    placesBefore,
    placesAfter,
    europeanOrder,
    nextEuropeanTier: europeanTierOf(nextEuropeanEntries, state.clubId),
  };
}

/** Every club in the world, drift applied, across every country and tier. */
export function allClubs(state: CareerState, lookup: TeamLookup): Team[] {
  return allClubIds(state.leagues).map((id) => clubIn(state, lookup, id));
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
    fromCountryId: state.countryId,
    toCountryId: locateClub(state.leagues, offer.clubId)?.countryId ?? state.countryId,
  };

  state.clubId = offer.clubId;
  state.transfers.push(record);
  // Signed for somebody: the loan on the table is off it.
  state.loanOffer = null;
  // And the request has been answered by the thing it asked for. Cleared rather
  // than left to `requestStands` to ignore, so that a career carries no record
  // of wanting to leave a club it no longer plays for.
  state.transferRequest = null;


  // A move can cross a country as well as a tier, which changes the whole
  // season ahead: a new league, a new fixture list, a new table and a different
  // number of people watching. Rebuilding them here is what makes "signing for
  // a club in Spain" a real transfer rather than a change of badge.
  moveToClub(state, lookup, offer.clubId);

  // Read AFTER the move, because that is what settles which country he is in.
  const countryId = state.countryId;
  const prestige = countryPrestige(countryId);
  applyTransferEffects(
    state.player,
    clubIn(state, lookup, offer.clubId),
    prestige,
    countryId !== record.fromCountryId,
  );
  // Europe follows the CLUB, not the player: he inherits whatever European
  // place his new club earned last season, and loses whatever his old one had.
  // Signing for a club that qualified is one of the strongest reasons to move.
  state.europe = newEurope(
    state.europeanEntries,
    offer.clubId,
    state.seed,
    state.seasonNumber,
  );

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
/**
 * Push one deal on one thing.
 *
 * Lives here rather than in the screen because the answer has to be WRITTEN —
 * an improved offer is the offer he then accepts, and a withdrawn one has to be
 * gone if he closes the tab and comes back. A negotiation held only in the UI
 * would evaporate on a reload, which for a withdrawal would quietly hand the
 * offer back.
 *
 * `offerId` is null for his own club's renewal, of which there is only ever one.
 *
 * Returns null when the ask cannot be made. One case matters: a player whose
 * contract has run out and who has NO other offers cannot haggle over his
 * club's renewal, because a withdrawal there would leave him with nothing to
 * sign and a summer with no way out of it. That is also true football — a man
 * out of contract that nobody else wants has no leverage — which is why it is a
 * rule rather than a safety net bolted on afterwards.
 */
export function negotiateDeal(
  state: CareerState,
  offerId: string | null,
  ask: NegotiationAsk,
): NegotiationResult<TransferOffer> | NegotiationResult<ContractOffer> | null {
  // Seeded from what is being asked, so the same question always gets the same
  // answer — reloading and asking again cannot reroll a refusal.
  const rng = new Rng(
    `${state.seed}:s${state.seasonNumber}:negotiate:${offerId ?? 'renewal'}:${ask}`,
  );

  if (offerId === null) {
    if (!state.renewal) return null;
    if (state.offers.length === 0 && isExpired(state.contract)) return null;
    const result = negotiate(rng, state.renewal, ask);
    state.renewal = result.deal.withdrawn ? null : result.deal;
    return result;
  }

  const index = state.offers.findIndex((offer) => offer.id === offerId);
  if (index === -1) return null;
  const result = negotiate(rng, state.offers[index]!, ask);
  state.offers[index] = result.deal;
  return result;
}

/**
 * Hand in a transfer request, or take one back.
 *
 * Deliberately available at any point in a career rather than only in the
 * summer, because the moment a player wants to leave is the moment he has been
 * left out — not the moment the window opens. Handing one in during the season
 * is the version with teeth: the manager reads it before every team sheet
 * between now and the summer that might act on it.
 *
 * It is handed to the club he plays for, which on loan is the loan club rather
 * than the parent. That is the club he is being left out by, so it is the club
 * the argument is with — and a request handed in on loan expires with the loan,
 * which is the right length for an argument about a season somebody else is
 * paying for.
 */
export function requestTransfer(state: CareerState): TransferRequest {
  state.transferRequest = handInRequest(state.clubId, state.seasonNumber);
  return state.transferRequest;
}

/**
 * Take it back.
 *
 * Free, and that is a statement rather than an oversight: the price of a
 * transfer request is the matches missed while it stood, which is already paid
 * and cannot be refunded. Charging again on the way out would be punishing one
 * decision twice — and would make withdrawing something a player avoids doing,
 * which is the opposite of what a reversible lever is for.
 */
export function withdrawTransferRequest(state: CareerState): void {
  state.transferRequest = null;
}

/** Does he have one standing at the club he is currently playing for? */
export function hasTransferRequest(state: CareerState): boolean {
  return requestStands(state.transferRequest, state.clubId);
}

/**
 * How much of the world each demand leaves him, as the screen reports it.
 *
 * Computed from the career's own leagues rather than the data file, so a club
 * that has drifted up or down since the career began is counted as it is now.
 *
 * The European counts are read off the PLACES rather than off who currently
 * holds them, and that is the correct answer rather than a convenient one. The
 * demand is applied against NEXT season's qualification, which is not settled
 * until this season is played — and in a career's first season nothing has
 * qualified for anything, so counting live entries would tell a player that
 * holding out for Europe leaves him nought clubs when it will in fact leave him
 * a full field. Every competition has the same number of entrants every year
 * whoever fills them, so the number is knowable now and the names are not.
 */
export function marketReach(state: CareerState, lookup: TeamLookup): MarketReach {
  const clubs = allClubs(state, lookup);
  const clearing: Record<StandingFloor, number> = { any: 0, established: 0, big: 0, elite: 0 };
  const inEurope: Record<EuropeanDemand, number> = {
    any: 0,
    championsLeague: 0,
    europaLeague: 0,
    conferenceLeague: 0,
  };

  for (const club of clubs) {
    const appeal = clubAppeal(club, prestigeOfClub(state, club.id));
    for (const band of Object.keys(clearing) as StandingFloor[]) {
      if (appeal >= STANDING_FLOORS[band]) clearing[band] += 1;
    }
  }

  for (const tier of EUROPEAN_TIERS) {
    // Summed rather than taken as a constant, so a world with a different
    // number of countries reports its own field instead of this one's.
    inEurope[tier] = PLACES_BY_TIER[tier].reduce((total, places) => total + places, 0);
    inEurope.any += inEurope[tier];
  }

  return { clearing, inEurope, total: clubs.length };
}

export function stayAtClub(state: CareerState): Contract {
  if (!canStay(state)) {
    throw new Error('stayAtClub called with an expired contract and no renewal offered');
  }
  if (state.renewal) state.contract = acceptRenewal(state.renewal);
  state.offers = [];
  state.renewal = null;
  // Staying is a decision about the season ahead, and it closes the loan too.
  state.loanOffer = null;
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
