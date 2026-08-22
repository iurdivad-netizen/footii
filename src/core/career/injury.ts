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
 * Chance of an injury in one full match by a fresh, peak-aged player.
 *
 * Calibrated against the season rather than the match, which is the only scale
 * anybody can judge it on. A busy season at a club in every competition loses
 * appreciably more, because the multipliers below are what make congestion cost
 * something.
 *
 * MEASURED, NOT DERIVED, and that distinction is the whole reason
 * `scripts/measureInjuries.ts` exists. Nothing about this number can be read off
 * the arithmetic: risk is quadratic in fitness at the final whistle, fitness is
 * whatever ninety minutes of a real match happened to leave, and a match costs
 * slightly more than a week of rest returns — so a season's worth of injuries is
 * emergent. The only honest way to set this constant is to play several hundred
 * seasons with it and count.
 *
 * At 0.035 that count was 1.29 injuries a season, 3.3 weeks out, and only a
 * quarter of seasons with no injury at all — accurate to what this comment used
 * to claim, and more than it felt like it should be from the other side of the
 * screen. Three seasons in four containing an injury is what "a lot of injuries"
 * means, even when the weeks lost are modest, because roughly half of them are
 * one-week knocks and it is the EVENT a player counts rather than the football.
 *
 * At 0.031, with the age curve below, an ordinary season carries about one
 * injury and a bit over two weeks. Noticeable when it happens, rather than a
 * recurring tax. See CHANGELOG.md, item 13.
 */
export const BASE_INJURY_RISK = 0.031;

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
  const durability = 1 - 0.3 * unit(input.stamina);
  return clamp01(BASE_INJURY_RISK * exposure * fatigue * ageRisk(input.age) * durability);
}

/**
 * How far below peak age a body stops being a young one, and how fast.
 *
 * Shared by both age curves below because they are the same fact seen twice —
 * a young body both gets hurt less and mends faster, and giving them separate
 * slopes would be inventing a difference nobody could feel. The floor exists
 * because a teenager is not made of rubber: it binds from about nineteen down,
 * so the very young are all equally durable rather than trending toward
 * invulnerable.
 */
const YOUTH_TAPER = 0.035;
const YOUTH_FLOOR = 0.7;

/** Peak age, where both curves are 1 and neither helps nor hurts. */
const PEAK_AGE = 28;

/**
 * How much more, or less, a body of this age gets hurt.
 *
 * The half of this that always existed is the top: bodies stop forgiving a hard
 * season somewhere around thirty, and every season after that costs more. The
 * half that did not is the bottom, and its absence was a real gap rather than a
 * simplification — measured over 480 seasons, a nineteen-year-old took 0.95
 * injuries a season against a twenty-eight-year-old's 1.38, which is barely
 * above noise. A teenager was exactly as fragile as a man ten years older, and
 * anybody who played a young career could feel it.
 *
 * It is worth being precise about what this does NOT claim. Real footballers do
 * not stop getting injured for being young — the medical literature has youth
 * incidence close to flat, with its own growth-related injuries. What is
 * genuinely true is that young bodies MEND faster, which is why the larger half
 * of this correction lives in `recoveryFactor` rather than here. This term is
 * the smaller, honest nod to the fact that twenty-two years old and thirty-two
 * years old are not the same body under the same workload.
 */
export function ageRisk(age: number): number {
  if (age >= PEAK_AGE) return 1 + (age - PEAK_AGE) * 0.07;
  return Math.max(YOUTH_FLOOR, 1 - (PEAK_AGE - age) * YOUTH_TAPER);
}

/**
 * How long a body of this age takes to mend, as a multiplier on the weeks.
 *
 * The better-supported half of the age correction, and the one a player feels
 * most directly, because weeks out is the number that takes matches off him. A
 * nineteen-year-old shrugs off in two weeks what keeps a thirty-four-year-old
 * out for three.
 *
 * Capped at the top so that a veteran's every knock does not become a month:
 * past the mid-thirties a career is already ending on the ageing curve in
 * `development.ts`, and it should not also be ending in the treatment room.
 */
export function recoveryFactor(age: number): number {
  if (age >= PEAK_AGE) return Math.min(1.35, 1 + (age - PEAK_AGE) * 0.045);
  return Math.max(YOUTH_FLOOR, 1 - (PEAK_AGE - age) * YOUTH_TAPER);
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
    if (roll <= seen) return diagnose(rng, band, season, input.age);
  }
  return diagnose(rng, SEVERITIES[SEVERITIES.length - 1]!, season, input.age);
}

function diagnose(
  rng: Rng,
  band: (typeof SEVERITIES)[number],
  season: number,
  age: number,
): Injury {
  const [shortest, longest] = band.weeks;
  const drawn = shortest + Math.floor(rng.next() * (longest - shortest + 1));
  // Never below a week, whatever the arithmetic says. An injury that keeps a
  // footballer out for no matches at all is not an injury, and the hub has no
  // way to render one.
  const weeks = Math.max(1, Math.round(drawn * recoveryFactor(age)));
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
