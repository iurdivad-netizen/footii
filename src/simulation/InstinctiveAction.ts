import { clamp01, unit } from '../core/util/math.ts';
import type { Rng } from '../core/rng.ts';
import type { ActionOption, SituationContext } from '../core/events/types.ts';
import { getAction } from '../data/actionCatalogue.ts';

/**
 * INSTINCTIVE ACTION (timer expiry)
 *
 * Running out of time must never simply mean "you missed". A real footballer
 * who hasn't consciously decided still does SOMETHING, and what they do is a
 * function of who they are:
 *
 *   High composure      -> a sensible default (weights toward the best fit)
 *   High decision making-> instincts are still roughly correct
 *   High finishing      -> instinctively shoots
 *   High dribbling      -> instinctively tries to beat his man
 *   Low decision making -> effectively random
 *   Low composure       -> panics toward the highest-risk option
 *
 * The chosen action is then resolved through the normal resolver with the
 * `expired` penalty applied, so the failure is interesting rather than binary.
 */

export interface InstinctiveChoice {
  option: ActionOption;
  /** Short explanation for commentary and debug output. */
  reason: string;
}

export function chooseInstinctiveAction(
  rng: Rng,
  context: SituationContext,
  options: readonly ActionOption[],
): InstinctiveChoice {
  const a = context.player.attributes;
  const composure = unit(a.composure);
  const decisionMaking = unit(a.decisionMaking);
  const shootInstinct = unit((a.finishing + a.shooting) / 2);
  const dribbleInstinct = unit(a.dribbling);
  const passInstinct = unit(a.passing);

  // How much the player's instinct tracks the correct read at all.
  const judgement = clamp01(composure * 0.5 + decisionMaking * 0.5);
  // Panic pushes toward risk when composure is low.
  const panic = clamp01(1 - composure);

  const entries = options.map((option) => {
    const definition = getAction(option.kind);
    const fit = definition.fit(context);

    let weight = 1;
    // Sensible players gravitate to good options; poor decision-makers don't.
    weight *= 0.4 + fit * judgement * 1.6;
    // Raw instinct by action family.
    if (definition.family === 'shot' || definition.family === 'header') {
      weight *= 0.6 + shootInstinct * 1.1;
    } else if (definition.family === 'dribble') {
      weight *= 0.6 + dribbleInstinct * 1.1;
    } else if (definition.family === 'pass' || definition.family === 'cross') {
      weight *= 0.6 + passInstinct * 0.9;
    } else {
      // Safe options: composed players are happy to take them, panicking ones aren't.
      weight *= 0.5 + composure * 0.9;
    }
    // Panic bias toward the wild option.
    weight *= 1 + definition.risk * panic * 0.8;

    return { value: option, weight: Math.max(0.01, weight) };
  });

  const option = rng.weighted(entries);
  const definition = getAction(option.kind);

  let reason: string;
  if (composure < 0.4 && definition.risk > 0.3) {
    reason = 'No time to think — a panicked, instinctive attempt';
  } else if (decisionMaking < 0.4) {
    reason = 'Hesitated, then went with the first thing he saw';
  } else if (definition.family === 'shot' || definition.family === 'header') {
    reason = 'Pure striker instinct takes over';
  } else if (definition.family === 'dribble') {
    reason = 'Instinctively backs himself to beat his man';
  } else {
    reason = 'Falls back on the safe option';
  }

  return { option, reason };
}
