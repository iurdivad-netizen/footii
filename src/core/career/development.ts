import { clamp, clamp01, round, unit } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { AttributeKey, Attributes } from '../player/attributes.ts';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../player/attributes.ts';
import type { Player } from '../player/player.ts';
import { currentAbility } from '../player/player.ts';
import { POSITION_PROFILES } from '../player/positions.ts';

/**
 * PLAYER DEVELOPMENT
 *
 * Development is applied after every match rather than once a season, because
 * the payoff has to be FELT in the core mechanic. Awareness, Composure and
 * Decision Making are three of the four attributes that set the decision
 * window, so a young player who is developing well literally gets more time to
 * think as the season goes on. That is progression you experience at the
 * keyboard, not a number on a summary screen.
 *
 * Growth per match is driven by:
 *
 *   ageFactor       - steep before 21, flat through the peak, negative after 30
 *   headroom        - how far Current Ability sits below Potential Ability
 *   performance     - match rating relative to a 6.5 baseline
 *   playingTime     - minutes actually played
 *   coaching        - club quality (a proxy for training facilities)
 *
 * POTENTIAL IS NOT A HARD CEILING. A player at his potential still creeps
 * upward slowly if he keeps performing, and potential itself drifts a little
 * each season, so two identical prospects do not have identical careers.
 */

/**
 * Growth budget, in attribute points, for a perfect development match
 * (16-year-old, unlimited headroom, full 90 minutes, excellent rating, elite
 * coaching). Everything else scales this down.
 *
 * CALIBRATION NOTE: this looks large because Current Ability is a WEIGHTED
 * AVERAGE of twenty attributes — raising CA by one point means raising the
 * whole spread by one point, i.e. spending roughly twenty attribute points.
 * An earlier value of 1.15 moved a potential-91 prospect from CA 54 to 56 over
 * five seasons, which is not a career arc. Tuned so a strong youngster gains
 * roughly 3-4 CA a season and approaches his potential in his mid-twenties.
 */
export const GROWTH_BASE = 8;

/** Equivalent budget for decline once past the peak. */
export const DECLINE_BASE = 5;

/** Fractional growth carried between matches until it is worth a full point. */
export interface DevelopmentState {
  /** Unspent growth, in attribute points. */
  pool: number;
  /** Unspent decline, in attribute points (positive number). */
  declinePool: number;
}

export function createDevelopmentState(): DevelopmentState {
  return { pool: 0, declinePool: 0 };
}

export interface DevelopmentInput {
  player: Player;
  /** Match rating, 1-10. */
  rating: number;
  /** Minutes played in the match. */
  minutes: number;
  /** Coaching quality 0-1, from the club's standing. */
  coaching: number;
}

export interface AttributeChange {
  attribute: AttributeKey;
  label: string;
  from: number;
  to: number;
}

export interface DevelopmentResult {
  changes: AttributeChange[];
  /** Growth points earned this match (before being spent). */
  growth: number;
  /** Decline points accrued this match. */
  decline: number;
  experienceGained: number;
}

/**
 * Age curve, -1 to 1.
 * Sharp growth in the teens, tapering to zero around the peak, then negative.
 */
export function ageFactor(age: number): number {
  if (age <= 16) return 1;
  if (age < 24) return 1 - (age - 16) / 10; // 1.0 at 16 -> 0.2 at 24
  if (age < 28) return 0.2 - (age - 24) * 0.05; // 0.2 -> 0.0
  if (age < 31) return 0;
  return -Math.min(1, (age - 30) * 0.18);
}

/**
 * Which attributes a player is most likely to improve, as pick weights.
 *
 * The positional and mental bonuses are combined with `max`, not by adding
 * them. Adding let an attribute that qualified for both — Composure for a
 * striker is the obvious case — stack to roughly eleven times the baseline
 * weight and run away from the rest of the player: a measured career reached
 * Composure 92 while overall ability was still 68, which is a spike in a
 * spreadsheet rather than a footballer.
 */
export function developmentWeights(player: Player): Map<AttributeKey, number> {
  const weights = new Map<AttributeKey, number>();
  const ability = currentAbility(player);

  const keyAttributes = new Set<AttributeKey>(POSITION_PROFILES[player.position].keyAttributes);
  // Mental attributes track experience: young players "learn the game" long
  // before their body changes. This is also what widens the decision window,
  // so it is deliberately generous for inexperienced players.
  const greenness = 1 - unit(player.experience);
  const mental = new Set<AttributeKey>([
    'awareness',
    'decisionMaking',
    'composure',
    'anticipation',
    'positioning',
  ]);

  for (const key of ATTRIBUTE_KEYS) {
    // The attributes that matter for the role improve fastest — that is what
    // training time is spent on.
    const keyBonus = keyAttributes.has(key) ? 1.6 : 0;
    const mentalBonus = mental.has(key) ? 0.5 + greenness * 1.4 : 0;
    let weight = 0.35 + Math.max(keyBonus, mentalBonus);

    // Physical attributes stop improving early.
    if (player.age > 25 && (key === 'pace' || key === 'acceleration' || key === 'stamina')) {
      weight *= 0.25;
    }

    // Diminishing returns on an attribute that has already outrun the player.
    const overshoot = Math.max(0, player.attributes[key] - (ability + 10)) / 14;
    if (overshoot > 0) weight *= Math.max(0.04, 1 - overshoot);

    // Nothing can grow past 99.
    if (player.attributes[key] >= 99) weight = 0;

    weights.set(key, weight);
  }
  return weights;
}

/** Attributes that decay first once a player is past his peak. */
const DECLINE_ORDER: readonly AttributeKey[] = [
  'pace',
  'acceleration',
  'stamina',
  'strength',
  'dribbling',
  'movement',
];

function spend(rng: Rng, attributes: Attributes, weights: Map<AttributeKey, number>): AttributeKey | null {
  const entries = [...weights.entries()]
    .filter(([key, weight]) => weight > 0 && attributes[key] < 99)
    .map(([value, weight]) => ({ value, weight }));
  if (entries.length === 0) return null;
  return rng.weighted(entries);
}

export function developAfterMatch(
  rng: Rng,
  state: DevelopmentState,
  input: DevelopmentInput,
): DevelopmentResult {
  const { player, rating, minutes, coaching } = input;

  const ability = currentAbility(player);
  // Headroom: rapid while far below potential, and never quite zero — a player
  // at his ceiling can still eke out small gains.
  const headroom = clamp01((player.potentialAbility - ability) / 25);
  const headroomFactor = 0.12 + headroom * 0.88;

  const age = ageFactor(player.age);
  const performance = clamp((rating - 6.5) / 2.5, -0.8, 1.2);
  const playingTime = clamp01(minutes / 90);

  let growth = 0;
  let decline = 0;

  if (age > 0) {
    growth =
      GROWTH_BASE *
      age *
      headroomFactor *
      playingTime *
      (0.55 + performance * 0.45) *
      (0.7 + coaching * 0.6);
    growth = Math.max(0, growth);
  } else if (age < 0) {
    decline = DECLINE_BASE * -age * (0.6 + (1 - playingTime) * 0.4);
  }

  state.pool += growth;
  state.declinePool += decline;

  const changes: AttributeChange[] = [];

  // Spend whole points of growth.
  const weights = developmentWeights(player);
  while (state.pool >= 1) {
    state.pool -= 1;
    const key = spend(rng, player.attributes, weights);
    if (!key) break;
    const from = player.attributes[key];
    player.attributes[key] = clamp(from + 1, 1, 99);
    changes.push({ attribute: key, label: ATTRIBUTE_LABELS[key], from, to: player.attributes[key] });
  }

  // Spend whole points of decline.
  while (state.declinePool >= 1) {
    state.declinePool -= 1;
    const candidates = DECLINE_ORDER.filter((key) => player.attributes[key] > 1);
    if (candidates.length === 0) break;
    const key = rng.pick(candidates);
    const from = player.attributes[key];
    player.attributes[key] = clamp(from - 1, 1, 99);
    changes.push({ attribute: key, label: ATTRIBUTE_LABELS[key], from, to: player.attributes[key] });
  }

  // Experience accrues fastest in the first seasons, matching the sqrt-shaped
  // experienceFactor used by the decision timer.
  const experienceGained = round((minutes / 90) * 1.6 * (1 - unit(player.experience) * 0.6), 3);
  player.experience = clamp(player.experience + experienceGained, 0, 100);

  return { changes, growth: round(growth, 3), decline: round(decline, 3), experienceGained };
}

/**
 * Yearly potential drift, applied at each birthday.
 * Potential is a projection, not a fact: a player who has been performing may
 * be re-rated upward, and one who stalled may be marked down. This is what
 * stops potential being deterministic.
 */
export function driftPotential(rng: Rng, player: Player, averageRating: number): number {
  const performanceSignal = clamp((averageRating - 6.6) / 1.5, -1, 1);
  const youth = player.age <= 21 ? 1 : player.age <= 25 ? 0.5 : 0.15;
  const drift = Math.round(rng.range(-2, 2) + performanceSignal * 3 * youth);
  const before = player.potentialAbility;
  player.potentialAbility = clamp(before + drift, currentAbility(player), 99);
  return player.potentialAbility - before;
}
