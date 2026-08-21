import type { Rng } from '../rng.ts';
import { clamp01, unit } from '../util/math.ts';

/**
 * INJURIES
 *
 * The thing that finally makes "how much of the season did you play" a real
 * question rather than a rhetorical one.
 *
 * Two levers in this game have always been written, tested and unreachable,
 * because the player starts every fixture there is and always has:
 *
 *   - Reputation weights playing time. With a full season every season, the
 *     ratio was 1 in every season anybody had ever played.
 *   - Individual awards need 60% of a league season. Same reason: always 100%.
 *
 * The roadmap listed injuries as blocked on squad context, and for a long time
 * that was right — an injury with no teammates meant a match was skipped and
 * nothing else. It is not right any more. Missing matches now moves both of
 * those levers on its own, because both are measured against the LEAGUE's own
 * fixture list, and a player in the treatment room is not in the side. No
 * teammate has to exist for that to be true.
 *
 * WHAT CAUSES ONE. Fatigue, mostly, and that is the point. The risk is
 * quadratic in how empty a player was at the final whistle, so the danger is
 * concentrated exactly where football puts it: at the end of a hard match, in a
 * week that already had one. Fixture congestion — a real number since the
 * season started being measured in weeks — is therefore the engine driving
 * this, rather than a dice roll that happens to fire sometimes.
 *
 * WHEN IT IS FOUND. At full time, never mid-match. A player who pulls up in the
 * 62nd minute is a better simulation and a worse game: it would end the one
 * thing the player came to do, halfway through, on a roll they cannot see or
 * influence. Diagnosing at the whistle keeps the match intact and puts the bad
 * news where a footballer actually gets it.
 */

/**
 * How bad it is.
 *
 * Four bands rather than a continuum, because a duration in weeks is what the
 * player acts on and a band is what they remember. The names are the ones
 * football uses, so nobody has to learn a scale.
 */
export type InjurySeverity = 'knock' | 'strain' | 'tear' | 'rupture';

export interface Injury {
  severity: InjurySeverity;
  /** What to call it on the hub. */
  label: string;
  /** Weeks it was diagnosed at, so the hub can say how far through it is. */
  weeks: number;
  /** Weeks of football still to be missed. Zero means fit. */
  weeksRemaining: number;
  /** The season it happened in, for the record book. */
  season: number;
}

/**
 * Chance of an injury in one full match by a fresh, average-aged player.
 *
 * Calibrated against the season rather than the match, which is the only scale
 * anybody can judge it on: this works out at roughly one and a half injuries
 * across a forty-match season, averaging two and a half weeks each, so an
 * ordinary career loses about a month a year. A busy season at a club in every
 * competition loses appreciably more, because the multipliers below are what
 * make congestion cost something.
 */
export const BASE_INJURY_RISK = 0.035;

/** The bands, their share of injuries, and how long they keep a player out. */
const SEVERITIES: readonly {
  severity: InjurySeverity;
  label: string;
  /** Share of all injuries, and they must sum to 1. */
  share: number;
  /** Weeks out, inclusive of both ends. */
  weeks: [number, number];
}[] = [
  // Most injuries are nothing: a dead leg, a rolled ankle, one match missed.
  { severity: 'knock', label: 'A knock', share: 0.55, weeks: [1, 1] },
  { severity: 'strain', label: 'A strain', share: 0.28, weeks: [2, 3] },
  { severity: 'tear', label: 'A torn muscle', share: 0.13, weeks: [4, 7] },
  // Rare on purpose. A season-ending injury should be a thing that happened to
  // a career, not a thing that happens most years.
  { severity: 'rupture', label: 'A rupture', share: 0.04, weeks: [9, 16] },
];

export interface InjuryRiskInput {
  /** Fitness at the final whistle, 0-100. */
  fitnessAtEnd: number;
  /** Minutes played, so a substitute risks less than a man who played 90. */
  minutes: number;
  age: number;
  /** Stamina, which is what makes one player more durable than another. */
  stamina: number;
}

/**
 * The chance this match ends with an injury, 0-1.
 *
 * Quadratic in fatigue rather than linear, deliberately. A linear term would
 * spread the risk evenly across every level of tiredness and make a hard season
 * feel like a slightly unluckier version of an easy one. Squaring it puts most
 * of the danger in the last stretch — the second match of a congested week, the
 * end of a European run — which is both where football puts it and where the
 * player can see the cause.
 */
export function injuryRisk(input: InjuryRiskInput): number {
  const exposure = clamp01(input.minutes / 90);
  const emptied = 1 - clamp01(input.fitnessAtEnd / 100);
  const fatigue = 1 + 2.2 * emptied * emptied;
  // Bodies stop forgiving a hard season somewhere around thirty.
  const age = input.age <= 28 ? 1 : 1 + (input.age - 28) * 0.07;
  const durability = 1 - 0.3 * unit(input.stamina);
  return clamp01(BASE_INJURY_RISK * exposure * fatigue * age * durability);
}

/**
 * Roll for an injury at the final whistle, or return null for a clean bill.
 *
 * Takes the season so the injury can say when it happened without the caller
 * having to remember to stamp it.
 */
export function rollInjury(rng: Rng, input: InjuryRiskInput, season: number): Injury | null {
  if (!rng.chance(injuryRisk(input))) return null;

  // Which band, by share. Walked rather than indexed so the shares stay
  // readable numbers that sum to one instead of cumulative thresholds nobody
  // can check by eye.
  const roll = rng.next();
  let seen = 0;
  for (const band of SEVERITIES) {
    seen += band.share;
    if (roll <= seen) return diagnose(rng, band, season);
  }
  return diagnose(rng, SEVERITIES[SEVERITIES.length - 1]!, season);
}

function diagnose(
  rng: Rng,
  band: (typeof SEVERITIES)[number],
  season: number,
): Injury {
  const [shortest, longest] = band.weeks;
  const weeks = shortest + Math.floor(rng.next() * (longest - shortest + 1));
  return {
    severity: band.severity,
    label: band.label,
    weeks,
    weeksRemaining: weeks,
    season,
  };
}

/**
 * Move an injury on by however many weeks have passed, or heal it.
 *
 * Returns null once there is nothing left to serve, so the caller stores the
 * result directly and a healed player is represented by the absence of an
 * injury rather than by an injury with zero weeks left. One state for "fit",
 * not two.
 */
export function advanceInjury(injury: Injury | null, weeks: number): Injury | null {
  if (!injury) return null;
  const remaining = injury.weeksRemaining - Math.max(0, weeks);
  if (remaining <= 0) return null;
  return { ...injury, weeksRemaining: remaining };
}

/** How an injury reads on the hub: what it is, and how long is left. */
export function injuryReport(injury: Injury): string {
  const weeks = injury.weeksRemaining;
  return `${injury.label} — ${weeks} ${weeks === 1 ? 'week' : 'weeks'} out`;
}
