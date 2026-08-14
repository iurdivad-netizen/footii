import { round } from '../util/math.ts';

/**
 * Season statistics for the controlled player.
 *
 * Superset of MatchStats plus season-only aggregates. Kept as a flat, plain
 * object so it serialises directly into the save file, and so new fields can be
 * added without a migration (missing numbers default to 0 on load).
 */
export interface SeasonStats {
  matches: number;
  starts: number;
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
  ratingTotal: number;
  bestRating: number;
  wins: number;
  draws: number;
  defeats: number;
}

export function createSeasonStats(): SeasonStats {
  return {
    matches: 0,
    starts: 0,
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
    ratingTotal: 0,
    bestRating: 0,
    wins: 0,
    draws: 0,
    defeats: 0,
  };
}

export function averageRating(stats: SeasonStats): number {
  return stats.matches === 0 ? 0 : round(stats.ratingTotal / stats.matches, 2);
}

export function goalsPerMatch(stats: SeasonStats): number {
  return stats.matches === 0 ? 0 : round(stats.goals / stats.matches, 2);
}

export function goalContributions(stats: SeasonStats): number {
  return stats.goals + stats.assists;
}
