import type { SeasonStats } from './seasonStats.ts';
import { averageRating } from './seasonStats.ts';
import type { Position } from '../player/positions.ts';
import type { LeagueBenchmark } from './awards.ts';

/**
 * WHAT A PLAYER OF THE SEASON LOOKS LIKE IN HIS OWN POSITION.
 *
 * The award used to have one currency: `goals + assists` measured against the
 * division's leading attacker, whatever shirt you wore. A centre back could
 * therefore never win it — not rarely, NEVER, since the bar was a striker's
 * output and he plays a game that does not produce it. Which is a strange thing
 * for a game that lets you be a centre back to say.
 *
 * Real football does not judge them alike either. A forward's case is goals. A
 * midfielder's is what he creates and how much of the game runs through him. A
 * defender's is how little happened at his end and how much he won — the year
 * Cannavaro won the Ballon d'Or he scored twice.
 *
 * SO THE BAR IS THE SAME HEIGHT AND THE LADDER IS DIFFERENT. Every position
 * still has to out-rate the division and play most of the season; what changes
 * is the second requirement, which is measured in the currency that position
 * actually deals in. Nobody gets an easier award — a defender's volume bar is
 * as hard for a defender to reach as a striker's goals are for a striker.
 */

/** Which case a position makes for itself. */
export type AwardCase = 'forward' | 'midfielder' | 'defender';

export function awardCaseFor(position: Position): AwardCase {
  switch (position) {
    case 'ST':
    case 'LW':
    case 'RW':
      return 'forward';
    case 'AM':
    case 'CM':
    case 'DM':
      return 'midfielder';
    case 'LB':
    case 'RB':
    case 'CB':
    case 'GK':
      return 'defender';
  }
}

/**
 * DEFENSIVE ACTIONS A SEASON MUST PRODUCE, measured against what the game
 * actually generates rather than against real football's own counts.
 *
 * A centre back in this game records about 87 tackles and interceptions across
 * a 38-match season and a defensive midfielder about 80 — measured over 100
 * matches per position. The bar sits above the ordinary season so it is a
 * distinction rather than an attendance prize, and scales with the division's
 * standard the same way the striker's does.
 */
export const DEFENSIVE_SEASON = 95;

/** Creative volume a midfielder's season must produce: assists plus key passes. */
export const CREATIVE_SEASON = 45;

export interface AwardCaseInput {
  position: Position;
  stats: SeasonStats;
  benchmark: LeagueBenchmark;
  /** Share of the season played, 0-1. */
  played: number;
}

/**
 * Has he made the case his position is judged on?
 *
 * The rating test lives with the caller because it is common to all three —
 * this answers only the second half, which is where the positions differ.
 */
export function madeHisCase(input: AwardCaseInput): boolean {
  const { stats, benchmark } = input;
  // How demanding this division is, relative to a typical one. A better league
  // asks more of a defender exactly as it asks more goals of a striker.
  const standard = benchmark.bestContributions > 0 ? benchmark.bestContributions / 25 : 1;
  const scaled = (base: number) => base * Math.max(0.6, Math.min(1.6, standard));
  /**
   * Did he match the division's leading attacker?
   *
   * Guarded on the benchmark being a real number: a division whose best
   * attacker contributed nothing sets a bar of zero, which every player in
   * football clears without getting out of bed. A defender must then win it
   * the defender's way or not at all, which is the correct answer — that
   * division has no attacking standard to have matched.
   */
  const matchedTheBestAttacker =
    benchmark.bestContributions > 0 &&
    stats.goals + stats.assists >= benchmark.bestContributions;

  switch (awardCaseFor(input.position)) {
    case 'forward':
      // Unchanged, and deliberately so: this is the bar the award has always
      // had, and a striker's season is still measured in goals.
      return matchedTheBestAttacker;
    case 'midfielder':
      // What he created, with goals counting toward it but not required. A
      // midfielder who scores like a forward clears it on contributions alone.
      return (
        stats.assists + stats.keyPasses + stats.goals >= scaled(CREATIVE_SEASON) ||
        matchedTheBestAttacker
      );
    case 'defender':
      // What he stopped. Goals and assists still count — an overlapping
      // full-back's end product is part of his case — but they are no longer
      // the whole of it.
      return (
        stats.tackles + stats.interceptions >= scaled(DEFENSIVE_SEASON) ||
        matchedTheBestAttacker
      );
  }
}

/** How the honour explains itself, in the terms that won it. */
export function caseSummary(position: Position, stats: SeasonStats): string {
  const rating = averageRating(stats).toFixed(2);
  switch (awardCaseFor(position)) {
    case 'forward':
      return `A ${rating} average rating and ${stats.goals + stats.assists} goal contributions.`;
    case 'midfielder':
      return `A ${rating} average rating, ${stats.assists} assists and ${stats.keyPasses} key passes.`;
    case 'defender':
      return `A ${rating} average rating, ${stats.tackles} tackles and ${stats.interceptions} interceptions.`;
  }
}
