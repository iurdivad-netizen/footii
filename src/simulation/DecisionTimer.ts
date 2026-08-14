import { clamp, norm, round, unit } from '../core/util/math.ts';
import { fatigueLevel } from '../core/player/player.ts';
import { goalkeeperPressure } from '../core/goalkeeper/goalkeeper.ts';
import type { SituationContext } from '../core/events/types.ts';
import type { SituationTemplate } from '../data/situations.ts';

/**
 * DECISION TIMER
 *
 * The single most important number in the game: how long the human has to read
 * a football situation and choose one of six options.
 *
 * FORMULA
 *
 *   T = BaseSituationTime
 *     + AWARENESS_WEIGHT      * norm(awareness)
 *     + COMPOSURE_WEIGHT      * norm(composure)
 *     + DECISION_WEIGHT       * norm(decisionMaking)
 *     + EXPERIENCE_WEIGHT     * experienceFactor
 *     - DEFENDER_WEIGHT       * defensivePressure
 *     - GOALKEEPER_WEIGHT     * goalkeeperPressure
 *     - DIFFICULTY_WEIGHT     * situationDifficulty
 *     + temporary modifiers   (fatigue, form, morale)
 *
 *   clamped to [MIN_TIME, MAX_TIME]
 *
 * where norm(x) = (x - 50) / 50, so an attribute of 50 contributes nothing and
 * the weight is literally "seconds gained by a 99-rated attribute".
 *
 * CALIBRATION TARGETS (see tests/decisionTimer.test.ts):
 *   - Experienced, composed player, moderate pressure  -> ~2.8-3.2s
 *   - Young, low-attribute player, moderate pressure   -> ~1.3-1.7s
 *   - Either player under intense pressure             -> substantially less
 *
 * All weights are exported so they can be tuned from one place.
 */
export const TIMER_WEIGHTS = {
  awareness: 0.55,
  composure: 0.35,
  decisionMaking: 0.35,
  experience: 0.3,
  defenderPressure: 0.55,
  goalkeeperPressure: 0.45,
  difficulty: 0.4,
  fatigue: 0.3,
  form: 0.12,
  morale: 0.08,
} as const;

/**
 * Absolute floor on the decision window.
 *
 * Raised from 0.8s after play-testing: a young, low-attribute player was
 * bottoming out on the floor for ~10% of his events, and a sub-second window is
 * not a hard decision, it is a coin flip. Note that the UI's "set" phase (see
 * ui/interaction/readingTime.ts) handles the separate problem of having enough
 * time to READ the options — this floor is only about having enough time to
 * DECIDE once you have.
 */
export const MIN_DECISION_TIME = 1.0;
export const MAX_DECISION_TIME = 4.5;

/**
 * Global pace multiplier applied to the final window.
 *
 * This is a player-facing accessibility and difficulty control, deliberately
 * kept separate from the attribute weights: it stretches or compresses every
 * window equally, so the RELATIVE difference between a composed veteran and a
 * panicking teenager is preserved at every setting.
 */
export const DECISION_PACE = {
  hardcore: 0.75,
  standard: 1,
  relaxed: 1.5,
  veryRelaxed: 2.1,
} as const;

export type DecisionPace = keyof typeof DECISION_PACE;

export const DECISION_PACE_LABELS: Record<DecisionPace, string> = {
  hardcore: 'Hardcore — 0.75x',
  standard: 'Standard — 1x',
  relaxed: 'Relaxed — 1.5x',
  veryRelaxed: 'Very relaxed — 2.1x',
};

export interface TimerModifier {
  label: string;
  seconds: number;
}

export interface DecisionTimerResult {
  /** Final decision window in seconds. */
  seconds: number;
  baseTime: number;
  modifiers: TimerModifier[];
  /** True if the clamp changed the computed value. */
  clamped: boolean;
}

/**
 * Experience factor, -1 to 1.
 * Deliberately non-linear: the jump from 0 to 40 experience matters far more
 * than the jump from 60 to 100. A player's first season should feel frantic.
 */
export function experienceFactor(experience: number): number {
  const e = clamp(experience, 0, 100) / 100;
  return clamp(Math.sqrt(e) * 2 - 1, -1, 1);
}

export function calculateDecisionTime(
  context: SituationContext,
  template: SituationTemplate,
  paceScale = 1,
): DecisionTimerResult {
  const { attributes } = context.player;
  const modifiers: TimerModifier[] = [];

  const add = (label: string, seconds: number) => {
    if (Math.abs(seconds) >= 0.005) modifiers.push({ label, seconds: round(seconds, 3) });
  };

  add('Awareness', TIMER_WEIGHTS.awareness * norm(attributes.awareness));
  add('Composure', TIMER_WEIGHTS.composure * norm(attributes.composure));
  add('Decision Making', TIMER_WEIGHTS.decisionMaking * norm(attributes.decisionMaking));
  add('Experience', TIMER_WEIGHTS.experience * experienceFactor(context.player.experience));

  add('Defender pressure', -TIMER_WEIGHTS.defenderPressure * context.defensivePressure);

  if (context.goalkeeper && template.goalkeeperInvolved) {
    add('Goalkeeper pressure', -TIMER_WEIGHTS.goalkeeperPressure * goalkeeperPressure(context.goalkeeper));
  }

  add('Situation difficulty', -TIMER_WEIGHTS.difficulty * template.difficulty);

  // --- temporary modifiers ------------------------------------------------
  add('Fatigue', -TIMER_WEIGHTS.fatigue * fatigueLevel(context.player));
  add('Form', TIMER_WEIGHTS.form * norm(context.player.form));
  add('Morale', TIMER_WEIGHTS.morale * norm(context.player.morale));

  // A high-press opponent squeezes time everywhere on the pitch.
  const pressing = unit(context.defendingTeam.ratings.pressing);
  add('Opponent pressing', -0.2 * (pressing - 0.5) * 2 * 0.5);

  const raw = modifiers.reduce((total, m) => total + m.seconds, template.baseTime);

  // The pace multiplier scales the whole window, including the clamp bounds, so
  // that a relaxed setting genuinely relaxes the floor rather than running into
  // the same hard minimum.
  const scaled = raw * paceScale;
  const seconds = clamp(scaled, MIN_DECISION_TIME * paceScale, MAX_DECISION_TIME * paceScale);

  if (paceScale !== 1) {
    modifiers.push({ label: `Pace setting (x${paceScale})`, seconds: round(scaled - raw, 3) });
  }

  return {
    seconds: round(seconds, 2),
    baseTime: template.baseTime,
    modifiers,
    clamped: Math.abs(seconds - scaled) > 0.001,
  };
}
