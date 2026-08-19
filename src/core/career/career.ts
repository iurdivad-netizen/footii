import { clamp, round } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { Player } from '../player/player.ts';
import { currentAbility } from '../player/player.ts';
import type { MatchStats } from '../match/matchStats.ts';
import type { AttributeChange, DevelopmentState } from './development.ts';
import { createDevelopmentState, developAfterMatch, driftPotential } from './development.ts';
import type { Attributes } from '../player/attributes.ts';
import type { Fixture, FixtureResult, TableRow } from './league.ts';
import { createSeasonStats } from './seasonStats.ts';
import type { SeasonStats } from './seasonStats.ts';
import { matchReputationGain } from './reputation.ts';
import type { TransferOffer, TransferRecord } from './transfers.ts';
import type { Contract, ContractOffer } from './contracts.ts';
import type { WorldLeagues } from './countries.ts';
import type { CupKind, CupState } from './cups.ts';
import { CUP_KINDS, opponentIn, roundName, stillIn, tieFor } from './cups.ts';
import type { EuropeanEntries, EuropeanState, EuropeanTier } from './europe.ts';
import type { CareerRecords } from './records.ts';
import { breakStreaks, recordMatch as recordMatchInBook } from './records.ts';
import type { CalendarSlot, CompetitionKind } from './calendar.ts';
import { isEuropean, isInternational, seasonCalendar } from './calendar.ts';
import type { InternationalState } from './international.ts';
import { GROUP_ROUNDS, INTERNATIONAL, KNOCKOUT_ROUNDS, groupFixture } from './international.ts';
import { isSelected, nationId } from './nations.ts';
import type { ClubStrengths } from './clubDrift.ts';
import type { Honour } from './awards.ts';

/**
 * CAREER STATE
 *
 * The persistent record of one footballer's career. Everything the game needs
 * to resume is here and nothing else: the match engine, development model and
 * league are all pure functions over this state.
 *
 * Deliberately kept serialisable (no class instances, no functions) so that
 * saving is `JSON.stringify` and loading needs no reconstruction.
 */

export interface SeasonRecord {
  seasonNumber: number;
  clubId: string;
  /** Final league position, once the season is complete. */
  position: number;
  stats: SeasonStats;
  age: number;
  /** The division it was played in, so a history reads at the right level. */
  division: number;
  /** The country it was played in. */
  countryId: string;
  /** Cups won that season, for a history that shows more than a league position. */
  cupsWon: CupKind[];
  /** The European competition played that season, if any, and how it ended. */
  europeanTier: EuropeanTier | null;
  /** True when the club won it. */
  wonEurope: boolean;
}

export interface CareerState {
  player: Player;
  clubId: string;
  /** Teams contesting the league this season. */
  leagueTeamIds: string[];
  seasonNumber: number;
  fixtures: Fixture[];
  results: FixtureResult[];
  table: TableRow[];
  /** Index of the player's club's next LEAGUE fixture within `fixtures`. */
  nextFixtureIndex: number;
  /**
   * How far through the season's calendar the player is, counting cup rounds as
   * well as league rounds. `nextFixtureIndex` counts only league matches, so the
   * two advance together on a league slot and only this one advances on a cup
   * slot — see core/career/calendar.ts.
   */
  calendarIndex: number;
  /** Every competition's statistics added together: his season, in full. */
  seasonStats: SeasonStats;
  /**
   * League matches only.
   *
   * Awards are judged against a benchmark inferred from the LEAGUE table, so
   * they have to be judged on league football. Counting cup goals toward the
   * golden boot would let a good cup run win an award the league never saw.
   */
  leagueStats: SeasonStats;
  development: DevelopmentState;
  history: SeasonRecord[];
  /** Seed for this career; every season derives its own stream from it. */
  seed: string;
  /** Attribute changes from the most recent match, for the UI to highlight. */
  lastDevelopment: AttributeChange[];
  /** Fitness carried between matches, 0-100. */
  fitness: number;
  /**
   * Snapshot of the player as the season began, so the end-of-season review can
   * show exactly how far he came. Taken here rather than derived from history,
   * because history stores statistics, not attributes.
   */
  seasonStartAttributes: Attributes;
  seasonStartAbility: number;
  seasonStartExperience: number;
  /** Unspent pre-season training points. */
  trainingPoints: number;
  /**
   * Offers on the table this summer. Written at the end of a season and
   * cleared as soon as one is taken or the window is closed, so a career that
   * is mid-season never carries a stale offer.
   */
  offers: TransferOffer[];
  /** Every move made, oldest first. */
  transfers: TransferRecord[];
  /** The country whose league the player is currently playing in. */
  countryId: string;
  /** The tier within that country; 1 is its top flight. */
  division: number;
  /**
   * Every country's league membership, keyed by country id.
   *
   * Lives in the save rather than being read back from the data file because
   * promotion and relegation reshape it. The tables of the leagues the player
   * is NOT in are deliberately absent: they are a pure function of the seed and
   * are recomputed on demand, which keeps a save small and can never let a
   * stored table disagree with the season that produced it.
   */
  leagues: WorldLeagues;
  /**
   * Live club ratings, which drift season by season. Held here rather than
   * mutating the loaded teams, so two careers in the same browser cannot
   * contaminate each other and a save restores the league it remembers.
   */
  clubStrengths: ClubStrengths;
  /** The deal he is on. Always present — a career is never contract-less. */
  contract: Contract;
  /**
   * Terms his own club has put up this summer, if any. Sits alongside `offers`
   * so the transfer window can present staying as a deal rather than a refusal.
   */
  renewal: ContractOffer | null;
  /** Everything won, oldest first. The only part of a career that only grows. */
  honours: Honour[];
  /** Total wages banked across the career, in millions. */
  careerEarnings: number;
  /**
   * The player's country's two knockouts, this season.
   *
   * Only his own country's cups are kept. Every other country's are a pure
   * function of the seed and are computed when somebody asks who won one, in
   * the same spirit as the background league tables.
   */
  cups: Record<CupKind, CupState>;
  /**
   * The international season: two groups of four, then a knockout.
   *
   * Held whole rather than only the player's own nation, because the bracket is
   * seeded off BOTH groups' final tables and there would be nothing to derive
   * the other one from later. Eight rows and twelve fixtures is cheap.
   */
  international: InternationalState;
  /**
   * International appearances THIS season, counted as they happen.
   *
   * Not derivable at season end, and this is why: reputation moves match by
   * match, so a player can climb into the squad in March and play only the last
   * group match. Asking "is he selected?" in June would then credit him with a
   * campaign he was not picked for, or — climbing the other way — none of the
   * ones he was.
   */
  seasonCaps: number;
  /**
   * The European competition the player's club is in this season, if any.
   *
   * Null for a club that did not qualify, which is most clubs most years —
   * that absence is the point of the competition existing.
   */
  europe: EuropeanState | null;
  /**
   * Who qualified for what, decided at the end of last season and fixed for
   * this one. Kept whole rather than only the player's own entry, so a club he
   * transfers to mid-summer arrives with the European place it earned.
   */
  europeanEntries: EuropeanEntries;
  /**
   * The record book: the peaks and runs a career is actually remembered for.
   * Accumulated per match and impossible to recompute afterwards.
   */
  records: CareerRecords;
  /**
   * The last match played, for the hub to report.
   *
   * Exists because a skipped match returns straight to the hub rather than to a
   * full-time screen — thirty matches a season is too many to click through a
   * report for each one — so the hub has to be able to say what just happened.
   */
  lastResult: MatchResultSummary | null;
}

/** Enough of a finished match to describe it in one line. */
export interface MatchResultSummary {
  opponentId: string;
  competition: CompetitionKind;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  goals: number;
  assists: number;
  rating: number;
  /** True when it was resolved automatically rather than played. */
  skipped: boolean;
}

/** How much fitness a player recovers between fixtures. */
export const FITNESS_RECOVERY = 34;

export function fixturesFor(state: CareerState, teamId: string): Fixture[] {
  return state.fixtures.filter((f) => f.homeId === teamId || f.awayId === teamId);
}

/** The player's club's next LEAGUE fixture, or null once they are all played. */
export function nextFixture(state: CareerState): Fixture | null {
  const own = fixturesFor(state, state.clubId);
  return own[state.nextFixtureIndex] ?? null;
}

/**
 * The bracket a competition slot refers to, or null if the player is not in it.
 *
 * One lookup for all four knockouts, so `nextMatch` and everything downstream
 * never has to know whether a slot is a domestic cup or a European night.
 */
export function knockoutFor(
  state: CareerState,
  competition: CompetitionKind,
): CupState<CompetitionKind> | null {
  if (competition === 'league') return null;
  if (isInternational(competition)) return state.international?.knockout ?? null;
  if (isEuropean(competition)) {
    return state.europe && state.europe.kind === competition ? state.europe : null;
  }
  return state.cups?.[competition] ?? null;
}

/** The nation the player turns out for. */
export function playerNation(state: CareerState): string {
  return nationId(state.player.nationality);
}

/**
 * The international match this slot refers to, if the player has one.
 *
 * International slots carry rounds 1 to 5: the first three are group matches,
 * which are fixtures like a league round, and the last two are the knockout,
 * which is a bracket like a cup. One competition, two shapes, because that is
 * what a tournament is.
 */
export function internationalMatch(
  state: CareerState,
  slotIndex: number,
  round: number,
): ScheduledMatch | null {
  // Not picked, no international season. This is the whole point of the
  // competition: it is the one thing in a career he can be left out of.
  if (!isSelected(state.player)) return null;
  const international = state.international;
  if (!international) return null;
  const nation = playerNation(state);

  if (round <= GROUP_ROUNDS) {
    const fixture = groupFixture(international, nation, round);
    if (!fixture) return null;
    // Already settled — the round was played around him while he was elsewhere.
    if (international.results.some((r) => r.round === round && r.homeId === fixture.homeId)) {
      return null;
    }
    return {
      competition: INTERNATIONAL,
      slotIndex,
      round,
      opponentId: fixture.homeId === nation ? fixture.awayId : fixture.homeId,
      home: fixture.homeId === nation,
      roundLabel: `Group match ${round}`,
    };
  }

  const knockout = international.knockout;
  if (!knockout || !stillIn(knockout, nation)) return null;
  const koRound = round - GROUP_ROUNDS;
  const drawn = knockout.rounds[koRound - 1];
  const tie = drawn ? tieFor(drawn, nation) : null;
  // Already played. The calendar index normally moves past a played slot on its
  // own, so this only bites for a caller that SCANS the season rather than
  // walking it — `matchesRemaining` would otherwise count a finished tie as one
  // still to come.
  if (tie?.winnerId) return null;
  return {
    competition: INTERNATIONAL,
    slotIndex,
    round,
    opponentId: tie ? opponentIn(tie, nation) : '',
    home: tie ? tie.homeId === nation : true,
    roundLabel: roundName(koRound, KNOCKOUT_ROUNDS),
  };
}

/** The season's shape: league rounds and cup rounds in playing order. */
export function calendarFor(state: CareerState): CalendarSlot[] {
  return seasonCalendar(fixturesFor(state, state.clubId).length);
}

/** One entry in the season, resolved to an actual match the player will play. */
export interface ScheduledMatch {
  competition: CompetitionKind;
  /**
   * Where this match sits in the season calendar.
   *
   * Load-bearing. `nextMatch` walks FORWARD past slots that are not the
   * player's — a cup he is out of — so the slot he plays is frequently not the
   * one the index currently points at. Advancing the index by one after a match
   * therefore leaves it trailing, and the season starts offering matches that
   * have already been played: a won cup final gets replayed, and losing the
   * replay hands the trophy to the opponent.
   */
  slotIndex: number;
  /** League round, or cup round. */
  round: number;
  opponentId: string;
  home: boolean;
  /** Present for cup ties; names the round as "Semi-final" and so on. */
  roundLabel?: string;
}

/**
 * What the player actually plays next, across all three competitions.
 *
 * Cup slots for a cup he is out of are SKIPPED rather than played, which is why
 * this walks the calendar rather than indexing it: being knocked out means the
 * rest of that competition's slots simply are not his matches. Returns null
 * once nothing is left, which is what ends the season.
 */
export function nextMatch(state: CareerState): ScheduledMatch | null {
  const calendar = calendarFor(state);
  const fixtures = fixturesFor(state, state.clubId);

  for (let i = state.calendarIndex; i < calendar.length; i++) {
    const slot = calendar[i]!;

    if (slot.competition === 'league') {
      const fixture = fixtures[state.nextFixtureIndex];
      if (!fixture) continue;
      return {
        competition: 'league',
        slotIndex: i,
        round: slot.round,
        opponentId: fixture.homeId === state.clubId ? fixture.awayId : fixture.homeId,
        home: fixture.homeId === state.clubId,
      };
    }

    if (isInternational(slot.competition)) {
      const international = internationalMatch(state, i, slot.round);
      if (!international) continue;
      return international;
    }

    const cup = knockoutFor(state, slot.competition);
    if (!cup || !stillIn(cup, state.clubId)) continue;

    // The tie itself is only drawn when the round is opened, which the career
    // service does at the moment the match is about to be played. Until then
    // all that is known is that there IS a match — the opponent is decided by
    // the round before it, which may only just have finished.
    const drawn = cup.rounds[slot.round - 1];
    const tie = drawn ? tieFor(drawn, state.clubId) : null;
    return {
      competition: slot.competition,
      slotIndex: i,
      round: slot.round,
      opponentId: tie ? opponentIn(tie, state.clubId) : '',
      home: tie ? tie.homeId === state.clubId : true,
      roundLabel: roundName(slot.round),
    };
  }

  return null;
}

/**
 * Where the calendar actually stands, skipping slots that are not the player's.
 * The season is over when nothing playable is left.
 */
export function seasonComplete(state: CareerState): boolean {
  return nextMatch(state) === null;
}

export function matchesRemaining(state: CareerState): number {
  const calendar = calendarFor(state);
  const fixtures = fixturesFor(state, state.clubId);
  let remaining = 0;
  let leaguePlayed = state.nextFixtureIndex;
  const counted = new Set<CompetitionKind>();

  for (let i = state.calendarIndex; i < calendar.length; i++) {
    const slot = calendar[i]!;
    if (slot.competition === 'league') {
      if (fixtures[leaguePlayed]) {
        remaining += 1;
        leaguePlayed += 1;
      }
      continue;
    }
    if (isInternational(slot.competition)) {
      // An international is his COUNTRY's match, not his club's, so it cannot
      // be counted by asking whether his club is still in something. Each group
      // round he is picked for is a match he will play; the knockout counts as
      // one more, on the same "only the next round" rule as a cup.
      if (!internationalMatch(state, i, slot.round)) continue;
      if (slot.round > GROUP_ROUNDS) {
        if (counted.has(slot.competition)) continue;
        counted.add(slot.competition);
      }
      remaining += 1;
      continue;
    }

    // Only the NEXT round of each live cup counts. Whether he plays the round
    // after that depends on a result nobody has yet, so counting every
    // remaining round would advertise a 47-match season to a player whose cup
    // runs will almost certainly end sooner.
    const cup = knockoutFor(state, slot.competition);
    if (cup && stillIn(cup, state.clubId) && !counted.has(slot.competition)) {
      counted.add(slot.competition);
      remaining += 1;
    }
  }

  return remaining;
}

export interface MatchOutcomeInput {
  stats: MatchStats;
  rating: number;
  /** 1 win, 0 draw, -1 defeat. */
  result: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Coaching quality of the player's club, 0-1. */
  coaching: number;
  /** Standing of the player's club, 0-1; how widely the match was watched. */
  clubStature: number;
  /** How closely the division is watched, 0-1. */
  divisionPrestige: number;
  /** Fitness left at the final whistle. */
  fitnessAtEnd: number;
  /** Which competition it was, so league statistics stay separable. */
  competition: CompetitionKind;
  /** The calendar slot it was played in, so the season advances past it. */
  slotIndex: number;
}

/** Fold one match into a running set of statistics. */
function addMatchToStats(
  season: SeasonStats,
  stats: MatchStats,
  rating: number,
  result: number,
): void {
  season.matches += 1;
  season.starts += 1;
  season.minutes += stats.minutes;
  season.goals += stats.goals;
  season.assists += stats.assists;
  season.shots += stats.shots;
  season.shotsOnTarget += stats.shotsOnTarget;
  season.keyPasses += stats.keyPasses;
  season.dribbles += stats.dribbles;
  season.dribblesAttempted += stats.dribblesAttempted;
  season.passes += stats.passes;
  season.passesCompleted += stats.passesCompleted;
  season.tackles += stats.tackles;
  season.interceptions += stats.interceptions;
  season.bigChancesMissed += stats.bigChancesMissed;
  season.fouls += stats.fouls;
  season.ratingTotal += rating;
  season.bestRating = Math.max(season.bestRating, rating);
  if (result > 0) season.wins += 1;
  else if (result < 0) season.defeats += 1;
  else season.draws += 1;
}

/**
 * Fold one completed match into the career: season statistics, form, morale,
 * development, experience and fitness recovery.
 *
 * This is the ONLY place a match is allowed to change the persistent player,
 * which is why the engine plays a clone.
 */
export function applyMatchToCareer(
  rng: Rng,
  state: CareerState,
  input: MatchOutcomeInput,
): AttributeChange[] {
  const { stats, rating, result } = input;

  // Every match feeds the season total; only league matches feed the league
  // ledger the awards are judged on. Accumulating both here rather than at the
  // call site means the two can never drift apart.
  addMatchToStats(state.seasonStats, stats, rating, result);
  if (input.competition === 'league') {
    addMatchToStats(state.leagueStats, stats, rating, result);
  }

  // A cap is a match played in the shirt, counted here rather than inferred.
  if (input.competition === INTERNATIONAL) state.seasonCaps += 1;

  // The record book takes every match in every competition: a hat-trick is a
  // hat-trick whether it came in the league or a European quarter-final.
  recordMatchInBook(state.records, {
    competition: input.competition,
    goals: stats.goals,
    assists: stats.assists,
    rating,
    result,
  });

  // Form is a moving average of recent ratings, expressed on the 0-100 scale
  // the timer and resolver expect. It moves quickly but not instantly.
  const ratingAsForm = clamp((rating - 4) * 16.5, 0, 100);
  state.player.form = round(state.player.form * 0.65 + ratingAsForm * 0.35, 1);

  // Morale follows results more than personal performance.
  const moraleTarget = result > 0 ? 78 : result < 0 ? 34 : 52;
  state.player.morale = round(
    state.player.morale * 0.7 + (moraleTarget + (rating - 6.5) * 6) * 0.3,
    1,
  );
  state.player.morale = clamp(state.player.morale, 0, 100);

  const development = developAfterMatch(rng, state.development, {
    player: state.player,
    rating,
    minutes: stats.minutes,
    coaching: input.coaching,
  });

  // Reputation moves fast on goals and standout ratings; the summer settles it
  // back toward what the season as a whole justifies (see reputation.ts).
  const reputationGain = matchReputationGain({
    goals: stats.goals,
    assists: stats.assists,
    rating,
    clubStature: input.clubStature,
    reputation: state.player.reputation,
    divisionPrestige: input.divisionPrestige,
  });
  state.player.reputation = clamp(state.player.reputation + reputationGain, 0, 100);

  // Fitness: what was left at the whistle, plus recovery before the next game.
  state.fitness = clamp(input.fitnessAtEnd + FITNESS_RECOVERY, 0, 100);
  state.player.fitness = state.fitness;

  if (input.competition === 'league') state.nextFixtureIndex += 1;
  // Past the slot that was PLAYED, not one past where the walk started.
  state.calendarIndex = input.slotIndex + 1;
  state.lastDevelopment = development.changes;
  return development.changes;
}

/**
 * Close the season: archive it, age the player, drift his potential and reset
 * for the next campaign. The caller supplies the new fixtures and table.
 */
export function advanceSeason(
  rng: Rng,
  state: CareerState,
  position: number,
  next: {
    fixtures: Fixture[];
    table: TableRow[];
    leagueTeamIds: string[];
    division: number;
    countryId: string;
  },
): SeasonRecord {
  const record: SeasonRecord = {
    seasonNumber: state.seasonNumber,
    clubId: state.clubId,
    position,
    stats: state.seasonStats,
    age: state.player.age,
    division: state.division,
    countryId: state.countryId,
    cupsWon: CUP_KINDS.filter((kind) => state.cups?.[kind]?.winnerId === state.clubId),
    europeanTier: state.europe?.kind ?? null,
    wonEurope: state.europe?.winnerId === state.clubId,
  };
  state.history.push(record);

  const averageRating =
    state.seasonStats.matches > 0 ? state.seasonStats.ratingTotal / state.seasonStats.matches : 6;

  state.player.age += 1;
  driftPotential(rng, state.player, averageRating);

  state.seasonNumber += 1;
  state.seasonStats = createSeasonStats();
  state.leagueStats = createSeasonStats();
  state.seasonCaps = 0;
  state.calendarIndex = 0;
  // A run does not span a summer: "eleven in a row" has to mean eleven
  // consecutive matches, not a number that quietly skips three months off.
  breakStreaks(state.records);
  state.fixtures = next.fixtures;
  state.table = next.table;
  state.leagueTeamIds = next.leagueTeamIds;
  state.division = next.division;
  state.countryId = next.countryId;
  state.results = [];
  state.nextFixtureIndex = 0;
  state.development = createDevelopmentState();
  state.lastDevelopment = [];
  // Last season's final match must not greet the player on the first day of the
  // new one — the hub reports it as "your last match".
  state.lastResult = null;
  state.fitness = 100;
  state.player.fitness = 100;

  // Re-baseline for the new season. Note this happens AFTER ageing and
  // potential drift, so next season's review measures the new season only.
  state.seasonStartAttributes = { ...state.player.attributes };
  state.seasonStartAbility = currentAbility(state.player);
  state.seasonStartExperience = state.player.experience;

  return record;
}

export function careerAbility(state: CareerState): number {
  return currentAbility(state.player);
}
