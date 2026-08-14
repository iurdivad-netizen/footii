import { clamp, round } from '../util/math.ts';
import type { OutcomeStats } from '../events/types.ts';

/** Per-match statistics for the controlled player. Extend freely for career mode. */
export interface MatchStats {
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  dribbles: number;
  dribblesAttempted: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  interceptions: number;
  bigChancesMissed: number;
  fouls: number;
  /** Number of interactive events the player was involved in. */
  involvements: number;
}

export function createMatchStats(): MatchStats {
  return {
    minutes: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    dribbles: 0,
    dribblesAttempted: 0,
    passes: 0,
    passesCompleted: 0,
    tackles: 0,
    interceptions: 0,
    bigChancesMissed: 0,
    fouls: 0,
    involvements: 0,
  };
}

export function applyOutcomeStats(stats: MatchStats, delta: OutcomeStats): void {
  stats.goals += delta.goals ?? 0;
  stats.assists += delta.assists ?? 0;
  stats.shots += delta.shots ?? 0;
  stats.shotsOnTarget += delta.shotsOnTarget ?? 0;
  stats.keyPasses += delta.keyPasses ?? 0;
  stats.dribbles += delta.dribbles ?? 0;
  stats.dribblesAttempted += delta.dribblesAttempted ?? 0;
  stats.passes += delta.passes ?? 0;
  stats.passesCompleted += delta.passesCompleted ?? 0;
  stats.tackles += delta.tackles ?? 0;
  stats.interceptions += delta.interceptions ?? 0;
  stats.bigChancesMissed += delta.bigChancesMissed ?? 0;
  stats.fouls += delta.fouls ?? 0;
}

export function passCompletionRate(stats: MatchStats): number {
  return stats.passes === 0 ? 0 : stats.passesCompleted / stats.passes;
}

export interface RatingInput {
  /** Accumulated per-event rating deltas from the resolver. */
  eventDelta: number;
  stats: MatchStats;
  /** 1 win, 0 draw, -1 defeat, from the player's team's perspective. */
  result: number;
  /** Opponent overall strength, 0-1. */
  opponentStrength: number;
}

/**
 * MATCH RATING
 *
 * Starts from 6.0 (a competent, unremarkable performance) and moves from
 * per-event contributions, so a midfielder who creates chances and wins the
 * ball can reach a high rating without ever scoring. Goals are worth the most
 * single contribution, but they are not the only route.
 *
 * Result and opponent strength apply a modest adjustment at the end: playing
 * well in a defeat still rates well, and doing it against a strong side rates
 * slightly better.
 */
/**
 * Diminishing returns on accumulated event credit.
 *
 * Without this, rating scales with the NUMBER of involvements: a striker who is
 * pulled into twelve events and does something mildly useful in each would
 * out-rate one who settled a match with two decisive moments. Beyond +/-2.5 the
 * curve compresses, so a great game still reaches 8-9 but a merely busy one
 * cannot drift into the 9s.
 */
export function compressEventDelta(delta: number): number {
  const threshold = 2.5;
  const magnitude = Math.abs(delta);
  if (magnitude <= threshold) return delta;
  return Math.sign(delta) * (threshold + Math.sqrt(magnitude - threshold));
}

export function calculateMatchRating(input: RatingInput): number {
  const { stats } = input;
  let rating = 6.0 + compressEventDelta(input.eventDelta);

  // Volume bonuses that the per-event deltas under-reward on their own.
  rating += Math.min(stats.keyPasses, 5) * 0.1;
  rating += Math.min(stats.dribbles, 6) * 0.05;
  rating += Math.min(stats.tackles + stats.interceptions, 8) * 0.06;
  rating -= Math.min(stats.fouls, 5) * 0.08;

  // Passing accuracy only matters once there is a sample.
  if (stats.passes >= 3) {
    rating += (passCompletionRate(stats) - 0.75) * 0.6;
  }

  rating += input.result * 0.25;
  rating += (input.opponentStrength - 0.5) * 0.5;

  // A quiet game regresses toward average rather than sitting at exactly 6.0.
  if (stats.involvements === 0) rating -= 0.2;

  return round(clamp(rating, 1, 10), 1);
}
