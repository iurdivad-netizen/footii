import { clamp01, unit } from '../core/util/math.ts';
import { Rng } from '../core/rng.ts';
import type { ActionOption, SituationContext } from '../core/events/types.ts';
import { getAction } from '../data/actionCatalogue.ts';
import type { DecisionSubmission, MatchEngine } from './MatchEngine.ts';

/**
 * AUTO-PLAY — "skip this match"
 *
 * A season is thirty league matches, and playing every one of them is a
 * commitment the game should ask for rather than assume. Skipping has to
 * resolve a match without playing it.
 *
 * THE OBVIOUS APPROACH IS THE WRONG ONE. Inventing a statistical model of a
 * match — draw some goals, draw a rating, move on — would give the career two
 * different sources of truth about what a footballer does, and they would drift
 * apart the moment either was tuned. A skipped season and a played season would
 * stop being comparable, which makes every number the career keeps meaningless.
 *
 * So a skipped match is a REAL match. The same engine, the same situation
 * generator, the same goalkeeper, the same resolver, the same statistics, the
 * same rating, the same fatigue. The only thing that changes is who decides:
 * instead of a human choosing from six options against a clock, the policy
 * below chooses.
 *
 * THE POLICY HAS TO BE FAIR IN BOTH DIRECTIONS. It must not be a punishment —
 * a player who skips should not quietly wreck his career — and it must not be
 * an exploit, or skipping becomes the optimal way to play. It therefore sits
 * deliberately between the two things the engine already knows how to do:
 *
 *   WORSE than a human who reads the situation and picks the best option, since
 *   that is the skill the whole game is built around and it should be worth
 *   something.
 *   BETTER than `chooseInstinctiveAction`, which is what happens when nobody
 *   decides at all — skipping is not the same as letting the clock run out.
 *
 * The gap between those two is the value of turning up, and it is measured in
 * tests rather than asserted here.
 */

/**
 * How sharply the policy favours the best-fitting option.
 *
 * Applied as an exponent on each option's fit, so 1 is "pick roughly in
 * proportion to how good the options are" and higher values converge on always
 * taking the best one. Scaled by the player's own judgement below, so a poor
 * decision-maker auto-plays like a poor decision-maker.
 */
export const AUTO_SHARPNESS = 2.6;

/**
 * Where in the decision window an automatic choice lands.
 *
 * The resolver rewards deciding early and punishes dawdling (`tempoAdjustment`),
 * so this is not cosmetic — it is part of how good auto-play is. A competent
 * player mostly decides in the comfortable middle band, sometimes sees it
 * immediately, and occasionally leaves it late. Never expires: running the clock
 * down is what NOT deciding looks like, and this is a decision.
 */
export const AUTO_TEMPO = { quick: 0.25, steady: 0.6, late: 0.93 } as const;

/**
 * How often a plainly wrong option still gets taken.
 *
 * The single most important number here. Without a floor the policy converges
 * on the best option for any competent player, and skipping becomes the
 * strongest way to play the game — which would make the decision mechanic the
 * whole thing is built around optional. Footballers pick the wrong pass.
 *
 * CALIBRATION NOTE, because the obvious baseline is the wrong one. Letting the
 * timer expire is NOT the floor for choosing badly: expiry carries its own
 * execution and tempo penalties on top of a poor choice, so it sits far below
 * anything a deliberate decision can reach. Measured over 300 matches with the
 * veteran striker preset, deliberate choices span roughly:
 *
 *     always the worst option   6.9
 *     uniformly at random       8.1
 *     always the best option    8.9
 *     (letting the clock expire 6.8 — a different thing entirely)
 *
 * The six options a situation offers are mostly sensible, so choosing at random
 * is already close to choosing well, and the room a human's reading buys is the
 * narrow band at the top. Auto-play is tuned to sit just above random: better
 * than no judgement, clearly worse than a good read, so playing a match is
 * worth something and skipping one is not a punishment.
 */
export const AUTO_OPTION_FLOOR = 0.05;

/**
 * Choose an action the way the player himself would, given time to think.
 *
 * Same shape as `chooseInstinctiveAction` — weight the options, pick one — but
 * judgement enters as an EXPONENT rather than a linear nudge, which is what
 * makes a considered decision better than a reflex. A player with high
 * composure and decision-making converges on the best available option; a poor
 * one spreads across the six almost evenly, and will pick a bad one often.
 */
export function autoChooseAction(
  rng: Rng,
  context: SituationContext,
  options: readonly ActionOption[],
): ActionOption {
  const a = context.player.attributes;
  // The same three attributes that set the decision window decide how well the
  // time gets used, so auto-play improves as the player develops.
  const judgement = clamp01(
    unit(a.decisionMaking) * 0.45 + unit(a.composure) * 0.3 + unit(a.awareness) * 0.25,
  );
  const sharpness = 0.5 + judgement * AUTO_SHARPNESS;

  const entries = options.map((option) => {
    const fit = clamp01(getAction(option.kind).fit(context));
    // A floor, so even a poor option is occasionally taken — footballers do
    // make bad choices, and a policy that never did would out-play a human.
    return { value: option, weight: AUTO_OPTION_FLOOR + fit ** sharpness };
  });

  return rng.weighted(entries);
}

/** How long the automatic decision takes, as a share of the window. */
export function autoTimeUsed(rng: Rng, context: SituationContext, window: number): number {
  const a = context.player.attributes;
  const sharp = clamp01(unit(a.awareness) * 0.5 + unit(a.anticipation) * 0.5);
  const roll = rng.next();
  // Reading the game quickly is what buys the early-decision bonus.
  const share =
    roll < 0.08 + sharp * 0.17
      ? AUTO_TEMPO.quick
      : roll < 0.82
        ? AUTO_TEMPO.steady
        : AUTO_TEMPO.late;
  return window * share;
}

/** One automatic decision, in the shape the engine expects. */
export function autoDecision(
  rng: Rng,
  context: SituationContext,
  options: readonly ActionOption[],
  window: number,
): DecisionSubmission {
  return {
    option: autoChooseAction(rng, context, options),
    timeUsed: autoTimeUsed(rng, context, window),
  };
}

/**
 * Play a match to full time without a human.
 *
 * Drives the ordinary engine loop, so everything a played match produces — the
 * scoreline, the statistics, the commentary, the fatigue left at the whistle —
 * exists afterwards exactly as if it had been played.
 *
 * Deterministic from `seed`: skipping the same match twice gives the same
 * result, so a skipped match is as reproducible as a played one and the career
 * seed still describes the whole career.
 */
export function runMatchAutomatically(engine: MatchEngine, seed: string): void {
  const rng = new Rng(`${seed}:auto`);
  // A hard ceiling on iterations. The engine terminates on its own, but a
  // headless loop that could not terminate would hang the browser tab rather
  // than fail, and that is not a trade worth making for one line.
  const limit = 10000;

  for (let i = 0; i < limit; i++) {
    const update = engine.step();
    if (update.kind === 'finished') return;
    if (update.kind !== 'interactive') continue;

    const event = update.event;
    engine.submitDecision(autoDecision(rng, event.context, event.options, event.timer.seconds));
  }

  throw new Error('runMatchAutomatically: match did not finish');
}
