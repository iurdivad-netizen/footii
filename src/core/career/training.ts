import { clamp, round } from '../util/math.ts';
import type { AttributeKey } from '../player/attributes.ts';
import { ATTRIBUTE_KEYS } from '../player/attributes.ts';
import type { Player } from '../player/player.ts';
import { currentAbility } from '../player/player.ts';
import { ageFactor } from './development.ts';
import type { SeasonStats } from './seasonStats.ts';
import { averageRating } from './seasonStats.ts';

/**
 * PRE-SEASON TRAINING
 *
 * Between seasons you are handed a pool of points to spend on whatever you
 * choose. This is the deliberate, player-driven half of progression:
 *
 *   - Per-match development is what the SEASON did to you. It is automatic,
 *     weighted toward your position and your mental attributes, and you have no
 *     say in it beyond playing well.
 *   - Training points are what YOU decided to work on. You place every one.
 *
 * IMPORTANT: this is not extra progression bolted on top. Part of the automatic
 * growth budget was moved here (see GROWTH_BASE in development.ts, reduced when
 * training was introduced), so the total career arc stays where it was
 * calibrated — you simply get to steer some of it.
 */

/**
 * Points awarded for a perfect development season (a 16-year-old with unlimited
 * headroom, an ever-present season and outstanding ratings). Scaled down by age,
 * headroom, playing time and performance.
 */
export const TRAINING_BASE = 20;

/**
 * Everyone who played gets at least this many. Even a 34-year-old in decline
 * can work on something, and a season that hands you nothing to spend feels
 * like a punishment rather than a career.
 */
export const TRAINING_FLOOR = 3;

/**
 * How far above your overall ability a single attribute may be trained.
 *
 * Without a limit you could funnel every point into Finishing for a decade and
 * end up a 55-ability player with 99 Finishing. The cap rises as you improve,
 * so specialising is possible and worthwhile, but only in proportion to the
 * footballer you actually are.
 */
export const TRAINING_SPREAD = 25;

export function maxTrainableValue(player: Player): number {
  return clamp(currentAbility(player) + TRAINING_SPREAD, 40, 99);
}

export interface TrainingAward {
  points: number;
  /** Human-readable reasons, shown on the training screen. */
  notes: string[];
}

/** How many points a completed season earns. */
export function calculateTrainingPoints(player: Player, stats: SeasonStats): TrainingAward {
  const notes: string[] = [];
  if (stats.matches === 0) return { points: 0, notes: ['No appearances — nothing to build on.'] };

  const age = Math.max(0, ageFactor(player.age));
  const headroom = clamp((player.potentialAbility - currentAbility(player)) / 25, 0, 1);
  const headroomFactor = 0.25 + headroom * 0.75;

  const rating = averageRating(stats);
  const performance = clamp((rating - 6.4) / 2, -0.5, 1);
  // A full season of football is 14 matches in this competition.
  const playingTime = clamp(stats.matches / 14, 0, 1);

  const raw =
    TRAINING_BASE * age * headroomFactor * (0.6 + performance * 0.4) * (0.45 + playingTime * 0.55);

  if (player.age <= 21) notes.push('Young enough to make real changes to your game.');
  else if (player.age >= 31) notes.push('At your age, training is mostly about holding on.');
  if (rating >= 7.2) notes.push(`A ${rating.toFixed(2)} average earned you extra work.`);
  else if (rating < 6.2) notes.push(`A ${rating.toFixed(2)} average limited what you took from the season.`);
  if (headroom > 0.6) notes.push('Your coaches still think there is a lot more to come.');
  else if (headroom < 0.15) notes.push('You are close to the ceiling they see for you.');

  return { points: Math.max(TRAINING_FLOOR, Math.round(raw)), notes };
}

export interface TrainingAllocation {
  /** Attribute -> points to add. */
  spend: Partial<Record<AttributeKey, number>>;
}

export interface TrainingValidation {
  valid: boolean;
  error?: string;
  spent: number;
}

export function validateAllocation(
  player: Player,
  available: number,
  allocation: TrainingAllocation,
): TrainingValidation {
  const cap = maxTrainableValue(player);
  let spent = 0;

  for (const key of ATTRIBUTE_KEYS) {
    const amount = allocation.spend[key] ?? 0;
    if (amount < 0) return { valid: false, error: 'Cannot train an attribute downward.', spent };
    if (amount === 0) continue;
    spent += amount;
    const target = player.attributes[key] + amount;
    if (target > 99) return { valid: false, error: 'Attributes cannot exceed 99.', spent };
    if (target > cap) {
      return {
        valid: false,
        error: `You cannot train any attribute past ${cap} until your overall ability improves.`,
        spent,
      };
    }
  }

  if (spent > available) {
    return { valid: false, error: `That is ${spent - available} points more than you have.`, spent };
  }
  return { valid: true, spent };
}

export interface AppliedTraining {
  attribute: AttributeKey;
  from: number;
  to: number;
}

/**
 * Apply an allocation. Any unspent points are DISCARDED rather than banked:
 * pre-season is a moment, not a savings account, and banking would let a player
 * hoard for a decade and then spike.
 */
export function applyTraining(player: Player, allocation: TrainingAllocation): AppliedTraining[] {
  const applied: AppliedTraining[] = [];
  for (const key of ATTRIBUTE_KEYS) {
    const amount = allocation.spend[key] ?? 0;
    if (amount <= 0) continue;
    const from = player.attributes[key];
    player.attributes[key] = clamp(from + amount, 1, 99);
    applied.push({ attribute: key, from, to: player.attributes[key] });
  }
  return applied;
}

/** Summary of how a player changed across a season, for the review screen. */
export interface SeasonProgress {
  abilityBefore: number;
  abilityAfter: number;
  experienceBefore: number;
  experienceAfter: number;
  /** Decision window in a benchmark one-on-one, before and after. */
  windowBefore: number;
  windowAfter: number;
  changes: { attribute: AttributeKey; label: string; from: number; to: number }[];
}

export function summariseProgress(
  before: Record<AttributeKey, number>,
  after: Record<AttributeKey, number>,
  labels: Record<AttributeKey, string>,
): SeasonProgress['changes'] {
  const changes: SeasonProgress['changes'] = [];
  for (const key of ATTRIBUTE_KEYS) {
    if (after[key] !== before[key]) {
      changes.push({ attribute: key, label: labels[key], from: before[key], to: after[key] });
    }
  }
  return changes.sort((a, b) => b.to - b.from - (a.to - a.from));
}

export function roundWindow(seconds: number): number {
  return round(seconds, 2);
}
