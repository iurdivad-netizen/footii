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
 *   multiplied by DECISION_SCALE, then clamped to [MIN_TIME, MAX_TIME]
 *
 * where norm(x) = (x - 50) / 50, so an attribute of 50 contributes nothing and
 * the weight is literally "MODEL UNITS gained by a 99-rated attribute".
 *
 * CALIBRATION TARGETS (see tests/decisionTimer.test.ts):
 *   - Experienced, composed player, moderate pressure  -> ~9.5-10.5s
 *   - Young, low-attribute player, moderate pressure   -> ~4.5-5.7s
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
 * Model units to seconds.
 *
 * Everything above — the base times, the weights, the pressure penalties — is
 * expressed in one internal unit, and this is what turns that unit into a
 * window on a clock. Applied at the very end, so it stretches every window
 * equally and the RELATIVE difference between a composed veteran and a
 * panicking teenager survives it exactly.
 *
 * It exists because the whole scale was wrong rather than any part of it. A
 * window of about three seconds was measured against how long a footballer has
 * on the ball, which is honest football and a poor game: three seconds is not
 * enough for a human to read six freshly generated labels AND decide between
 * them, so the mechanic was testing reading speed rather than judgement. The
 * options are the game; the clock should be pressure on a decision you have had
 * time to understand.
 *
 * Ten seconds for the player the model is centred on. Everything else follows
 * from that by the same multiplier — nothing was retuned, only rescaled.
 */
export const DECISION_SCALE = 3.3;

/**
 * Absolute floor on the decision window, in real seconds.
 *
 * A window this short is not a hard decision, it is a coin flip. Note that the
 * UI's "set" phase (see ui/interaction/readingTime.ts) handles the separate
 * problem of having enough time to READ the options — this floor is only about
 * having enough time to DECIDE once you have.
 */
export const MIN_DECISION_TIME = 3.3;
export const MAX_DECISION_TIME = 14.9;

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
  /**
   * No time limit. The scale still applies to the NOMINAL window used by the
   * resolver, but the on-screen clock never expires — see `UNTIMED_PACE`.
   */
  untimed: 2.1,
} as const;

export type DecisionPace = keyof typeof DECISION_PACE;

/**
 * Named by the window rather than the multiplier.
 *
 * "Standard — 1x" said nothing: one times what? The seconds are the number a
 * player is actually choosing between, and they only became sayable once the
 * scale was one a person could hold in their head — see DECISION_SCALE. The
 * figures are the window a composed, experienced player gets in open play, so
 * they are a centre rather than a promise: a teenager under pressure gets far
 * less, and a penalty rather more.
 */
export const DECISION_PACE_LABELS: Record<DecisionPace, string> = {
  hardcore: 'Hardcore — about 7 seconds',
  standard: 'Standard — about 10 seconds',
  relaxed: 'Relaxed — about 15 seconds',
  veryRelaxed: 'Very relaxed — about 20 seconds',
  untimed: 'No time limit — take as long as you like',
};

/**
 * The pace setting at which the clock never runs out.
 *
 * The goalkeeper still commits on his normal schedule, so the read is unchanged
 * — you simply are not punished for taking your time. Tempo is treated as
 * neutral rather than late, so there is no hidden penalty for thinking; what
 * you give up is the small bonus for deciding quickly.
 */
export const UNTIMED_PACE = 'untimed' as const satisfies DecisionPace;

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
  /**
   * What a week spent studying the opponent is worth, in model units.
   *
   * Added before the pace multiplier rather than after it, deliberately: a
   * bonus applied in seconds would be worth three times as much at Hardcore as
   * at Relaxed, and a week's homework should mean the same thing to every
   * player. Zero in a quick match, in any week not spent on it, and in every
   * caller that predates the week being a decision. See core/career/week.ts.
   */
  preparation = 0,
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

  // A week spent watching them. Recorded as a modifier like everything else, so
  // the debug panel's audit shows where the extra time came from.
  add('Prepared', preparation);

  const raw = modifiers.reduce((total, m) => total + m.seconds, template.baseTime);

  // Model units become seconds here, and the pace multiplier scales the whole
  // window INCLUDING the clamp bounds — so a relaxed setting genuinely relaxes
  // the floor rather than running into the same hard minimum.
  const factor = DECISION_SCALE * paceScale;
  const scaled = raw * factor;
  const seconds = clamp(scaled, MIN_DECISION_TIME * paceScale, MAX_DECISION_TIME * paceScale);

  // Recorded as a modifier so the debug panel's audit still adds up to the
  // window on screen: base plus every line equals the number the player sees.
  if (factor !== 1) {
    modifiers.push({
      label: paceScale === 1 ? 'Scale' : `Scale · pace x${paceScale}`,
      seconds: round(scaled - raw, 3),
    });
  }

  return {
    seconds: round(seconds, 2),
    baseTime: template.baseTime,
    modifiers,
    clamped: Math.abs(seconds - scaled) > 0.001,
  };
}
