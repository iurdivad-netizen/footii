import { clamp, round } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import type { TableRow } from './league.ts';
import { sortTable } from './league.ts';

/**
 * CLUB DRIFT
 *
 * Clubs used to be constants. Every rating came from the JSON and never moved,
 * which quietly broke the transfer market in a way no single formula was
 * responsible for: `squadLevel`, `positionalNeed`, `transferBudget` and
 * `reputationRequired` are all derived from those ratings, so the same clubs
 * wanted you every summer for the same reason, and once you had seen one window
 * you had seen all of them.
 *
 * Here a club's QUALITY moves and its IDENTITY does not. Only attack, midfield
 * and defence drift — the three ratings that decide the table, the market and
 * the coaching. Possession, tempo, width and the rest are left alone, because
 * they are what makes a wide-play side a wide-play side, and a club that
 * gradually forgot how it plays would make tactical fit meaningless.
 *
 * The model is mean-reverting around each club's own baseline:
 *
 *   - finishing well pulls a club up, finishing badly pulls it down
 *   - the pull is toward a TARGET, and only a fraction of the way each season,
 *     so nothing lurches
 *   - the target itself is anchored to the club's baseline, so a good run makes
 *     a club better without letting it run away to 99 over twenty seasons
 *
 * Promotion and relegation need no special case: a promoted club won its
 * division and drifts up, a relegated one finished bottom and drifts down.
 */

/** The three ratings that move. Everything else about a club is fixed. */
export interface ClubStrength {
  attack: number;
  midfield: number;
  defence: number;
}

/** Live strengths for every club in a career, keyed by club id. */
export type ClubStrengths = Record<string, ClubStrength>;

/**
 * How far a club may drift from its starting ratings, in points.
 *
 * A hard leash rather than a soft one. Without it, twenty seasons of noise
 * turns the smallest club in the game into the biggest, and the ladder the
 * whole career is built on stops meaning anything.
 */
export const DRIFT_LIMIT = 11;

/** How far a season can pull the target, in points, from best to worst finish. */
export const DRIFT_SWING = 9;

/** Fraction of the way to the target a club moves in one season. */
export const DRIFT_RATE = 0.32;

/** Season-to-season noise, in points, so identical finishes are not identical. */
export const DRIFT_NOISE = 0.8;

export function strengthOf(team: Team): ClubStrength {
  return {
    attack: team.ratings.attack,
    midfield: team.ratings.midfield,
    defence: team.ratings.defence,
  };
}

/** Starting strengths for a whole career. */
export function initialStrengths(teams: readonly Team[]): ClubStrengths {
  const strengths: ClubStrengths = {};
  for (const team of teams) strengths[team.id] = strengthOf(team);
  return strengths;
}

/**
 * A club as it currently is, rather than as the data file describes it.
 *
 * Every consumer of a club — the market, the table, the situation generator,
 * the development model — goes through the career's team lookup, so overriding
 * here is enough to make drift real everywhere at once.
 */
export function applyStrength(team: Team, strengths: ClubStrengths | undefined): Team {
  const strength = strengths?.[team.id];
  if (!strength) return team;
  return {
    ...team,
    ratings: {
      ...team.ratings,
      attack: strength.attack,
      midfield: strength.midfield,
      defence: strength.defence,
    },
  };
}

/**
 * Where a club finished, as 1 for champions and 0 for bottom.
 * A one-club division is treated as a win, matching `reputationTarget`.
 */
export function finishShare(position: number, size: number): number {
  return size > 1 ? clamp((size - position) / (size - 1), 0, 1) : 1;
}

/**
 * One season of drift for one club.
 *
 * `base` is the club's rating in the data file, which the target is anchored to
 * and the result is leashed around.
 */
export function driftClub(
  rng: Rng,
  current: ClubStrength,
  base: ClubStrength,
  share: number,
): ClubStrength {
  // -1 for bottom, +1 for champions.
  const pull = (share - 0.5) * 2;

  const move = (now: number, anchor: number): number => {
    const target = anchor + pull * (DRIFT_SWING / 2);
    const moved = now + (target - now) * DRIFT_RATE + rng.noise(DRIFT_NOISE);
    return round(clamp(moved, anchor - DRIFT_LIMIT, anchor + DRIFT_LIMIT), 0);
  };

  return {
    attack: clamp(move(current.attack, base.attack), 1, 99),
    midfield: clamp(move(current.midfield, base.midfield), 1, 99),
    defence: clamp(move(current.defence, base.defence), 1, 99),
  };
}

export interface DriftSeasonInput {
  /** Live strengths, which this returns an updated copy of. */
  strengths: ClubStrengths;
  /** Every division's final table, in any order — only positions are read. */
  tables: readonly (readonly TableRow[])[];
  /** Baseline ratings from the data file. */
  lookup: (id: string) => Team;
}

/**
 * Drift every club that played a season.
 *
 * Returns a new map rather than mutating, so a caller can diff the two and show
 * which clubs strengthened — and so a failed season never half-applies.
 */
export function driftSeason(rng: Rng, input: DriftSeasonInput): ClubStrengths {
  const next: ClubStrengths = { ...input.strengths };

  for (const table of input.tables) {
    const ranked = sortTable(table);
    for (const [index, row] of ranked.entries()) {
      const base = strengthOf(input.lookup(row.teamId));
      const current = input.strengths[row.teamId] ?? base;
      next[row.teamId] = driftClub(
        rng.fork(`drift:${row.teamId}`),
        current,
        base,
        finishShare(index + 1, ranked.length),
      );
    }
  }

  return next;
}
