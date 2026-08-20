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
  fixturesFor,
  knockoutFor,
  nextFixture,
  playerNation,
  nextMatch,
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
import { movementFor, resolveDivisions, simulateDivisionThrough } from '../core/career/divisions.ts';
import {
  CUP_KINDS,
  advanceCupTo,
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
  EUROPEAN_TIERS,
  championsLeaguePlaces,
  europeanTierOf,
  fieldFor,
  qualifyForEurope,
  visibilityOf,
} from '../core/career/europe.ts';
import type { EuropeanEntries, EuropeanState, EuropeanTier } from '../core/career/europe.ts';
import { createCareerRecords, recordSeason } from '../core/career/records.ts';
import type { Coefficients } from '../core/career/coefficients.ts';
import {
  confederationByStanding,
  countriesByStanding,
  createCoefficients,
  nationsByStanding,
  recordEuropeanSeason,
  scoreEuropeanSeason,
  scoreTournament,
} from '../core/career/coefficients.ts';
import type { InternationalState } from '../core/career/international.ts';
import {
  GROUP_ROUNDS,
  INTERNATIONAL,
  championNation,
  closeGroupRound,
  createInternational,
  tournamentFor,
  groupFixture,
  playGroupRound,
  recordGroupResult,
  startKnockout,
} from '../core/career/international.ts';
import { countryOfNation, nationalTeam } from '../core/career/nations.ts';
import type { DivisionMovement } from '../core/career/divisions.ts';
import {
  allClubIds,
  confederationOf,
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
import { knockoutRoundsPlayed } from '../core/career/calendar.ts';
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
  if (field.length < 2) return null;
  const cup = createCup(tier, tier, field);
  advanceCupTo(
    new Rng(`${state.seed}:s${state.seasonNumber}:europe:${tier}`),
    cup,
    (id) => clubIn(state, lookup, id),
    roundsReached(state, tier),
  );
  return cup;
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

  return {
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
  const kind = tournamentFor(seasonNumber);
  // A World Cup is seeded from every nation there is. A continental
  // championship is seeded from ONE confederation — and it is the PLAYER'S,
  // because his is the only one the game plays out in detail. Seeding it from
  // Europe regardless would have given a Brazilian a World Cup every other year
  // and nothing at all in between, while an Englishman got both.
  const order =
    kind === 'worldCup'
      ? nationsByStanding(record)
      : confederationByStanding(record, confederationOf(nationality));
  return createInternational(
    new Rng(`${seed}:s${seasonNumber}:${kind}:draw`),
    order,
    kind,
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
function newEurope(entries: EuropeanEntries, clubId: string): EuropeanState | null {
  const tier = europeanTierOf(entries, clubId);
  if (!tier) return null;
  const field = fieldFor(entries, tier);
  // A field of one cannot be drawn against anybody. Never happens with a full
  // world, but a partial one must degrade to "no Europe" rather than to a crash.
  if (field.length < 2) return null;
  return createCup(tier, tier, field);
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
  });

  if (leagueFixture) {
    simulateRound(state, leagueFixture.round, lookup);
  } else if (scheduled.competition === INTERNATIONAL) {
    settleInternational(state, scheduled.round, input, isHome, lookup);
  } else {
    settlePlayerTie(state, scheduled.competition, input, lookup);
  }

  return changes;
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
  });
  closeRound(knockout, nation);
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
  const scheduled = nextMatch(state);
  catchUpInternational(state, scheduled?.slotIndex ?? Number.POSITIVE_INFINITY, lookup);
  catchUpKnockouts(state, lookup);
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

  const europe = state.europe;
  if (europe && !stillIn(europe, state.clubId)) {
    playOnWithout(state, europe, roundsReached(state, europe.kind), clubs, europe.kind);
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

  // The European competition finishes too, whether or not he was still in it.
  if (state.europe) {
    finishCup(
      new Rng(`${state.seed}:s${state.seasonNumber}:europe:finish`),
      state.europe,
      (id) => clubIn(state, lookup, id),
      state.clubId,
    );
  }
  const europeanTier = state.europe?.kind ?? null;
  const wonEurope = !!state.europe && state.europe.winnerId === state.clubId;

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
    nations: scoreTournament(state.international),
  });
  const europeanOrder = countriesByStanding(state.coefficients);
  const placesAfter = championsLeaguePlaces(state.countryId, europeanOrder);

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
  const countryId = state.countryId;
  const reputation = settleReputation(state.player, {
    stats: state.seasonStats,
    leaguePosition: position,
    leagueSize: state.leagueTeamIds.length,
    clubStature: clubStature(club),
    seasonLength: fixturesFor(state, state.clubId).length,
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
    europeanTier,
    wonEurope,
    internationalRounds: state.seasonCaps,
    wonInternational,
    reachedInternationalFinal:
      !!knockout &&
      !wonInternational &&
      knockout.eliminatedInRound === (knockout.rounds.length || 0),
    reachedEuropeanFinal:
      !!state.europe && state.europe.eliminatedInRound === (state.europe.rounds.length || 0),
    benchmark,
    seasonLength: fixturesFor(state, state.clubId).length,
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
  const located = locateClub(state.leagues, state.clubId);
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

  // A new season needs new knockouts, entered by whoever is in the league now.
  // The finished ones are handed back on the season end so the review can
  // report the runs that have just been erased from the live state.
  const finishedCups = state.cups;
  const finishedEurope = state.europe;
  const finishedInternational = state.international;
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
  state.europe = newEurope(nextEuropeanEntries, state.clubId);

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

  // A move can cross a country as well as a tier, which changes the whole
  // season ahead: a new league, a new fixture list, a new table and a different
  // number of people watching. Rebuilding them here is what makes "signing for
  // a club in Spain" a real transfer rather than a change of badge.
  const located = locateClub(state.leagues, offer.clubId);
  const countryId = located?.countryId ?? state.countryId;
  const division = located?.division ?? state.division;
  if (
    countryId !== state.countryId ||
    division !== state.division ||
    !state.leagueTeamIds.includes(offer.clubId)
  ) {
    const league = leagueMembers(state.leagues, countryId, division);
    const rng = new Rng(`${state.seed}:season:${state.seasonNumber}:${offer.clubId}`);
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
  state.europe = newEurope(state.europeanEntries, offer.clubId);

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
