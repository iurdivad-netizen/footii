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
  /** Index of the player's club's next fixture within `fixtures`. */
  nextFixtureIndex: number;
  seasonStats: SeasonStats;
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
}

/** How much fitness a player recovers between fixtures. */
export const FITNESS_RECOVERY = 34;

export function fixturesFor(state: CareerState, teamId: string): Fixture[] {
  return state.fixtures.filter((f) => f.homeId === teamId || f.awayId === teamId);
}

/** The player's club's next fixture, or null when the season is complete. */
export function nextFixture(state: CareerState): Fixture | null {
  const own = fixturesFor(state, state.clubId);
  return own[state.nextFixtureIndex] ?? null;
}

export function seasonComplete(state: CareerState): boolean {
  return nextFixture(state) === null;
}

export function matchesRemaining(state: CareerState): number {
  return Math.max(0, fixturesFor(state, state.clubId).length - state.nextFixtureIndex);
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
  /** Fitness left at the final whistle. */
  fitnessAtEnd: number;
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
  const season = state.seasonStats;

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
  });
  state.player.reputation = clamp(state.player.reputation + reputationGain, 0, 100);

  // Fitness: what was left at the whistle, plus recovery before the next game.
  state.fitness = clamp(input.fitnessAtEnd + FITNESS_RECOVERY, 0, 100);
  state.player.fitness = state.fitness;

  state.nextFixtureIndex += 1;
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
  next: { fixtures: Fixture[]; table: TableRow[]; leagueTeamIds: string[] },
): SeasonRecord {
  const record: SeasonRecord = {
    seasonNumber: state.seasonNumber,
    clubId: state.clubId,
    position,
    stats: state.seasonStats,
    age: state.player.age,
  };
  state.history.push(record);

  const averageRating =
    state.seasonStats.matches > 0 ? state.seasonStats.ratingTotal / state.seasonStats.matches : 6;

  state.player.age += 1;
  driftPotential(rng, state.player, averageRating);

  state.seasonNumber += 1;
  state.seasonStats = createSeasonStats();
  state.fixtures = next.fixtures;
  state.table = next.table;
  state.leagueTeamIds = next.leagueTeamIds;
  state.results = [];
  state.nextFixtureIndex = 0;
  state.development = createDevelopmentState();
  state.lastDevelopment = [];
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
