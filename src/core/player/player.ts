import { clamp, clamp01, unit } from '../util/math.ts';
import type { Attributes } from './attributes.ts';
import { createAttributes } from './attributes.ts';
import type { Position } from './positions.ts';
import type { Tendencies } from './tendencies.ts';
import { createTendencies } from './tendencies.ts';

/**
 * The player the human controls.
 *
 * `condition` holds the mutable, per-match state (fatigue) plus the slower
 * career-level state (form, morale). These are deliberately separate from
 * attributes: attributes describe what the player CAN do, condition describes
 * how well they can do it today. Career mode will extend this record with
 * contract/club/season data without touching the simulation.
 */
export interface Player {
  id: string;
  name: string;
  age: number;
  position: Position;
  attributes: Attributes;
  tendencies: Tendencies;
  /** 0-100. Games played at a meaningful level; feeds the decision timer. */
  experience: number;
  /** 0-100, 50 neutral. Slow-moving confidence from recent performances. */
  form: number;
  /** 0-100, 50 neutral. */
  morale: number;
  /** 0-100. Depletes during a match; restored between matches. */
  fitness: number;
  /** 0-100 reputation, used later by the transfer system. */
  reputation: number;
  /**
   * Potential Ability, 1-99, on the same scale as `currentAbility()`.
   * Hidden from the player. Deliberately not a hard ceiling — see
   * core/career/development.ts.
   */
  potentialAbility: number;
}

/**
 * Deep copy of a player.
 *
 * Career mode keeps ONE persistent player across many matches, while the match
 * engine drains fitness as the game runs. Without a copy the engine would
 * permanently mutate the saved career player: fitness would ratchet down and
 * never recover, and a match abandoned halfway would leave the career in a
 * corrupted state. The engine therefore plays a clone, and the career layer
 * decides explicitly what carries back (see core/career/progression.ts).
 */
export function clonePlayer(player: Player): Player {
  return {
    ...player,
    attributes: { ...player.attributes },
    tendencies: { ...player.tendencies },
  };
}

export interface PlayerInit {
  id?: string;
  name: string;
  age?: number;
  position: Position;
  attributes: Partial<Attributes>;
  tendencies?: Partial<Tendencies>;
  experience?: number;
  form?: number;
  morale?: number;
  fitness?: number;
  reputation?: number;
  potentialAbility?: number;
  baseAttribute?: number;
}

export function createPlayer(init: PlayerInit): Player {
  return {
    id: init.id ?? init.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: init.name,
    age: init.age ?? 24,
    position: init.position,
    attributes: createAttributes(init.baseAttribute ?? 50, init.attributes),
    tendencies: createTendencies(init.tendencies),
    experience: init.experience ?? 50,
    form: init.form ?? 50,
    morale: init.morale ?? 50,
    fitness: init.fitness ?? 100,
    reputation: init.reputation ?? 40,
    potentialAbility: init.potentialAbility ?? 70,
  };
}

/**
 * Fatigue as 0 (fresh) to 1 (exhausted).
 * Stamina slows the rate at which fitness converts into a performance penalty.
 */
export function fatigueLevel(player: Player): number {
  const raw = 1 - clamp01(player.fitness / 100);
  const staminaRelief = 0.35 * unit(player.attributes.stamina);
  return clamp01(raw * (1 - staminaRelief));
}

/**
 * Fitness cost per minute of play, before stamina and intensity.
 *
 * CALIBRATION NOTE: this was 0.16, which cost only ~15 fitness over a full 90
 * minutes. That left fatigue effectively inert — a 0.03s decision-timer penalty
 * at the final whistle, and barely 0.02s between a Stamina 40 player and a
 * Stamina 78 one — so the attribute did nothing and the career hub always
 * reported full fitness. At 0.35 a full match costs roughly 30-40 fitness,
 * tired legs are worth about a tenth of a second of thinking time, and Stamina
 * is a reason to pick one player over another.
 */
export const EXERTION_PER_MINUTE = 0.35;

/** Drain fitness for a passage of play. Higher stamina drains slower. */
export function applyExertion(player: Player, minutes: number, intensity = 1): void {
  const staminaFactor = 1.35 - 0.7 * unit(player.attributes.stamina);
  const drain = minutes * EXERTION_PER_MINUTE * intensity * staminaFactor;
  player.fitness = clamp(player.fitness - drain, 0, 100);
}

/** Current Ability: a single 1-99 summary used for team strength and transfers. */
export function currentAbility(player: Player): number {
  const a = player.attributes;
  const technical =
    (a.shooting + a.finishing + a.passing + a.crossing + a.dribbling + a.ballControl + a.technique) /
    7;
  const mental =
    (a.positioning + a.movement + a.awareness + a.decisionMaking + a.composure + a.anticipation) / 6;
  const physical = (a.pace + a.acceleration + a.strength + a.stamina) / 4;
  const defensive = (a.heading + a.tackling + a.defensiveAwareness) / 3;
  return Math.round(technical * 0.35 + mental * 0.3 + physical * 0.2 + defensive * 0.15);
}
