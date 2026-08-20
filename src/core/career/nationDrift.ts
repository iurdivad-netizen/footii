import { clamp, round } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import { allCountries, getCountry, hasLeague } from './countries.ts';

/**
 * NATIONS THAT DRIFT WITHOUT CLUBS
 *
 * A national side is normally derived from its country's five strongest clubs,
 * and it gets its whole history for free: clubs drift season by season, so the
 * nation drifts with them, and a country whose football declines over a decade
 * fields a weaker side for it without anything having had to remember that it
 * should.
 *
 * Most of the world has no clubs here. Those nations carry an authored strength
 * instead — and an authored number does not move. Left alone, Brazil would
 * field precisely the same side in season eighteen as in season one while every
 * European nation drifted by up to a dozen rating points around it. Over a
 * career the two halves of the world would come apart: the derived nations
 * would spread out and the authored ones would stand in a line.
 *
 * So they get their own drift. It is deliberately the same SHAPE as club drift —
 * a small seeded step each season, pulled back toward where the country started
 * — but it needs its own model because there is no league table to read.
 *
 * PULLED BACK TOWARD THE AUTHORED STRENGTH, which is the important half. A pure
 * random walk over eighteen seasons wanders: run enough careers and some of them
 * have Brazil at 60 and Panama at 80, which is not a golden generation, it is a
 * broken world. Mean reversion makes a country's authored strength what it is
 * ABOUT — the level it returns to — while still allowing a decade in which it is
 * genuinely better or worse than that.
 */

/** How far a nation can move in one season, in rating points. */
export const NATION_DRIFT_STEP = 2.2;

/**
 * How hard a nation is pulled back toward its authored strength each season.
 *
 * At 0.25 a country four points clear of its own level gives back one of them a
 * year, so a good generation lasts several seasons rather than either evaporating
 * or becoming permanent.
 */
export const NATION_REVERSION = 0.25;

/** How far from its authored strength a nation can ever get. */
export const NATION_DRIFT_LIMIT = 8;

/**
 * How far each league-less nation currently sits from its authored strength.
 *
 * Deltas rather than absolutes, exactly as club drift stores them, so the data
 * file stays the truth about where a country belongs and the save carries only
 * what this career has done to it.
 */
export type NationStrengths = Record<string, number>;

export function initialNationStrengths(): NationStrengths {
  return {};
}

/** How far this nation has drifted, in rating points. Zero for a country with clubs. */
export function nationAdjustment(strengths: NationStrengths, countryId: string): number {
  return strengths[countryId] ?? 0;
}

/**
 * Move every league-less nation on one season.
 *
 * Countries WITH leagues are left alone: their sides are derived from clubs that
 * have just drifted on their own, and drifting them twice would move them at
 * double the rate of everybody else.
 */
export function driftNations(rng: Rng, strengths: NationStrengths): NationStrengths {
  const next: NationStrengths = { ...strengths };

  for (const country of allCountries()) {
    if (hasLeague(country)) continue;
    const current = next[country.id] ?? 0;
    const step = rng.noise(NATION_DRIFT_STEP);
    const pull = -current * NATION_REVERSION;
    next[country.id] = round(
      clamp(current + step + pull, -NATION_DRIFT_LIMIT, NATION_DRIFT_LIMIT),
      2,
    );
  }

  return next;
}

/**
 * What a nation's strength currently is, authored plus drift.
 *
 * Presentation and comparison only — the side itself is built by
 * `nationalTeam`, which takes the adjustment and applies the country's style to
 * it. Returns 0 for a country with clubs, whose strength is a question about
 * its clubs rather than about a number.
 */
export function currentNationStrength(
  strengths: NationStrengths,
  countryId: string,
): number {
  const country = getCountry(countryId);
  if (hasLeague(country) || country.nationalStrength === undefined) return 0;
  return round(
    clamp(country.nationalStrength + nationAdjustment(strengths, countryId), 1, 99),
    1,
  );
}
