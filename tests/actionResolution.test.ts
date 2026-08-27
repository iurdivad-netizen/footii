import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import type { ActionKind, ActionOption, OutcomeKind } from '../src/core/events/types.ts';
import { getAction } from '../src/data/actionCatalogue.ts';
import {
  GOAL_CURVE,
  RESOLUTION_WEIGHTS,
  executionQuality,
  resolveAction,
  shotGoalProbability,
  tempoAdjustment,
  SHOT_QUALITY,
  SET_PIECE_SITUATIONS,
} from '../src/simulation/ActionResolver.ts';
import { createCustomPlayer, suggestedAttributes } from '../src/core/player/playerBuilder.ts';
import type { SituationContext } from '../src/core/events/types.ts';
import { context, goalkeeperState, keeper, prospect, veteran } from './helpers.ts';

function option(kind: ActionKind, slot = 1): ActionOption {
  const definition = getAction(kind);
  return { slot, kind, label: definition.label, family: definition.family, generationFit: 0.5 };
}

/** Run the same decision many times and report the outcome distribution. */
function sample(
  ctx: SituationContext,
  kind: ActionKind,
  runs = 3000,
  opts: { timeUsed?: number; expired?: boolean } = {},
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const { outcome } = resolveAction(new Rng(`res-${i}`), ctx, {
      option: option(kind),
      timeUsed: opts.timeUsed ?? 1,
      window: 2.5,
      expired: opts.expired ?? false,
    });
    counts[outcome.kind] = (counts[outcome.kind] ?? 0) + 1;
  }
  return counts;
}

function rate(counts: Record<string, number>, kind: OutcomeKind, runs = 3000): number {
  return (counts[kind] ?? 0) / runs;
}

describe('action resolution', () => {
  it('is deterministic for a fixed seed', () => {
    const ctx = context();
    const decision = { option: option('placedFinish'), timeUsed: 1, window: 2.5, expired: false };
    const a = resolveAction(new Rng('same'), ctx, decision);
    const b = resolveAction(new Rng('same'), ctx, decision);
    expect(a.outcome).toEqual(b.outcome);
    expect(a.breakdown.finalValue).toBe(b.breakdown.finalValue);
  });

  it('produces a believable one-on-one conversion rate, not a coin flip either way', () => {
    const counts = sample(context({ situationQuality: 0.75 }), 'placedFinish');
    const goals = rate(counts, 'goal');
    expect(goals).toBeGreaterThan(0.15);
    expect(goals).toBeLessThan(0.7);
  });

  it('never produces the same outcome every time (bounded, but real, uncertainty)', () => {
    const counts = sample(context(), 'placedFinish');
    expect(Object.keys(counts).length).toBeGreaterThan(2);
    for (const value of Object.values(counts)) {
      expect(value).toBeLessThan(3000);
    }
  });

  it('scores more often with a better finisher — attributes matter', () => {
    const good = sample(context({ player: veteran() }), 'placedFinish');
    const poor = sample(context({ player: prospect() }), 'placedFinish');
    expect(rate(good, 'goal')).toBeGreaterThan(rate(poor, 'goal') + 0.05);
  });

  it('scores less often against a better goalkeeper', () => {
    const weakKeeper = sample(
      context({ goalkeeper: goalkeeperState(keeper({ reflexes: 25, positioning: 25, anticipation: 25 })) }),
      'placedFinish',
    );
    const strongKeeper = sample(
      context({ goalkeeper: goalkeeperState(keeper({ reflexes: 95, positioning: 95, anticipation: 95 })) }),
      'placedFinish',
    );
    expect(rate(weakKeeper, 'goal')).toBeGreaterThan(rate(strongKeeper, 'goal') + 0.05);
  });

  it('rewards the chip only when the keeper has left his goal', () => {
    const keeperOut = sample(
      context({ goalkeeper: goalkeeperState(keeper(), { action: 'rushing', startingDepth: 0.9 }) }),
      'chip',
    );
    const keeperOnLine = sample(
      context({ goalkeeper: goalkeeperState(keeper(), { action: 'holdingLine', startingDepth: 0 }) }),
      'chip',
    );
    expect(rate(keeperOut, 'goal')).toBeGreaterThan(rate(keeperOnLine, 'goal') + 0.15);
  });

  it('rewards shooting to the side the keeper did not commit to', () => {
    const keeperWentFar = sample(
      context({ goalkeeper: goalkeeperState(keeper(), { action: 'divingFar' }) }),
      'shootLeft',
    );
    const keeperWentNear = sample(
      context({ goalkeeper: goalkeeperState(keeper(), { action: 'divingNear' }) }),
      'shootLeft',
    );
    expect(rate(keeperWentFar, 'goal')).toBeGreaterThan(rate(keeperWentNear, 'goal') + 0.05);
  });

  it('punishes predictable finishing against a keeper with high anticipation', () => {
    const naive = sample(
      context({ goalkeeper: goalkeeperState(keeper({ anticipation: 15 })) }),
      'placedFinish',
    );
    const reader = sample(
      context({ goalkeeper: goalkeeperState(keeper({ anticipation: 95 })) }),
      'placedFinish',
    );
    expect(rate(naive, 'goal')).toBeGreaterThan(rate(reader, 'goal'));
  });

  it('makes rounding the keeper viable when he rushes out and poor when he does not', () => {
    const rushing = sample(
      context({
        nearbyDefenders: 0,
        goalkeeper: goalkeeperState(keeper(), { action: 'rushing', startingDepth: 0.9 }),
      }),
      'roundKeeper',
    );
    const set = sample(
      context({
        nearbyDefenders: 0,
        goalkeeper: goalkeeperState(keeper(), { action: 'holdingLine', startingDepth: 0 }),
      }),
      'roundKeeper',
    );
    expect(rate(rushing, 'goal')).toBeGreaterThan(rate(set, 'goal') + 0.1);
  });

  it('lets a midfielder score highly through creation — a completed pass can become an assist', () => {
    const counts = sample(
      context({
        situation: 'midfieldProgression',
        zone: { third: 'attacking', channel: 'central', box: 'outside' },
        situationQuality: 0.6,
        defensivePressure: 0.2,
      }),
      'throughBallCentre',
    );
    expect(rate(counts, 'goal') + rate(counts, 'chanceCreated')).toBeGreaterThan(0.1);
  });

  it('defensive actions can win the ball or be beaten', () => {
    const counts = sample(
      context({ situation: 'defensiveDuel', zone: { third: 'defensive', box: 'outside' } }),
      'stepInAndTackle',
    );
    expect(rate(counts, 'ballWon')).toBeGreaterThan(0.05);
    expect((counts['turnover'] ?? 0) + (counts['foulCommitted'] ?? 0)).toBeGreaterThan(0);
  });

  it('an expired timer performs worse than a deliberate choice, but is not an automatic failure', () => {
    const deliberate = sample(context(), 'placedFinish', 3000, { timeUsed: 1 });
    const expired = sample(context(), 'placedFinish', 3000, { timeUsed: 2.5, expired: true });
    expect(rate(expired, 'goal')).toBeLessThan(rate(deliberate, 'goal'));
    expect(rate(expired, 'goal')).toBeGreaterThan(0);
  });

  it('final values stay inside a believable band (bounded randomness)', () => {
    const ctx = context();
    for (let i = 0; i < 4000; i++) {
      const { breakdown } = resolveAction(new Rng(`bound-${i}`), ctx, {
        option: option('placedFinish'),
        timeUsed: 1,
        window: 2.5,
        expired: false,
      });
      expect(breakdown.finalValue).toBeGreaterThan(-0.2);
      expect(breakdown.finalValue).toBeLessThan(1.5);
      expect(Math.abs(breakdown.noise)).toBeLessThanOrEqual(
        RESOLUTION_WEIGHTS.noiseSd * RESOLUTION_WEIGHTS.noiseClampSd + 1e-9,
      );
    }
  });
});

describe('execution quality', () => {
  it('separates choosing from executing: pressure degrades execution, composure protects', () => {
    const definition = getAction('placedFinish');
    const decision = { option: option('placedFinish'), timeUsed: 1, window: 2.5, expired: false };

    const calm = executionQuality(definition, context({ defensivePressure: 0 }), decision);
    const pressured = executionQuality(definition, context({ defensivePressure: 1 }), decision);
    expect(pressured).toBeLessThan(calm);

    const composed = executionQuality(
      definition,
      context({ player: veteran(), defensivePressure: 1 }),
      decision,
    );
    const nervy = executionQuality(
      definition,
      context({ player: prospect(), defensivePressure: 1 }),
      decision,
    );
    // The composed player loses less of his execution to the same pressure.
    const composedCalm = executionQuality(
      definition,
      context({ player: veteran(), defensivePressure: 0 }),
      decision,
    );
    const nervyCalm = executionQuality(
      definition,
      context({ player: prospect(), defensivePressure: 0 }),
      decision,
    );
    expect(composedCalm - composed).toBeLessThan(nervyCalm - nervy);
  });

  it('fatigue degrades execution', () => {
    const definition = getAction('placedFinish');
    const decision = { option: option('placedFinish'), timeUsed: 1, window: 2.5, expired: false };
    const fresh = executionQuality(definition, context({ player: veteran({ fitness: 100 }) }), decision);
    const tired = executionQuality(definition, context({ player: veteran({ fitness: 10 }) }), decision);
    expect(tired).toBeLessThan(fresh);
  });
});

describe('tempo', () => {
  it('slightly rewards decisiveness and penalises leaving it to the last instant', () => {
    const early = tempoAdjustment({ option: option('shootLeft'), timeUsed: 0.2, window: 2, expired: false });
    const late = tempoAdjustment({ option: option('shootLeft'), timeUsed: 1.95, window: 2, expired: false });
    expect(early).toBeGreaterThan(late);
    expect(
      tempoAdjustment({ option: option('shootLeft'), timeUsed: 2, window: 2, expired: true }),
    ).toBeLessThan(late);
  });

  it('the tempo bonus is small enough that waiting to read the keeper still wins', () => {
    // Deciding instantly while the keeper is set, versus waiting for him to rush out and chipping.
    const instant = sample(
      context({ goalkeeper: goalkeeperState(keeper(), { action: 'set', startingDepth: 0.3 }) }),
      'chip',
      2000,
      { timeUsed: 0.1 },
    );
    const informed = sample(
      context({ goalkeeper: goalkeeperState(keeper(), { action: 'rushing', startingDepth: 0.9 }) }),
      'chip',
      2000,
      { timeUsed: 2.0 },
    );
    expect(rate(informed, 'goal', 2000)).toBeGreaterThan(rate(instant, 'goal', 2000));
  });
});

describe('goal probability curve', () => {
  it('is monotonic in value and never certain or impossible', () => {
    let previous = -1;
    for (let v = 0; v <= 1.2; v += 0.05) {
      const p = shotGoalProbability(v);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
    expect(shotGoalProbability(-5)).toBeGreaterThanOrEqual(GOAL_CURVE.min);
    expect(shotGoalProbability(5)).toBeLessThanOrEqual(GOAL_CURVE.max);
  });

  it('converts a clean one-on-one at a believable rate for a good finisher', () => {
    const counts = sample(
      context({
        player: veteran(),
        nearbyDefenders: 0,
        defensivePressure: 0.15,
        situationQuality: 0.85,
      }),
      'placedFinish',
    );
    const goals = rate(counts, 'goal');
    expect(goals).toBeGreaterThan(0.25);
    expect(goals).toBeLessThan(0.65);
  });

  it('REGRESSION: a raw teenager can still score from a clean chance', () => {
    // A created 17-year-old converted a clean one-on-one 3.7% of the time when
    // "goal" was a hard threshold: it sat above his entire value distribution,
    // so he could play two seasons without scoring. A curve makes him unlikely,
    // never impossible.
    const kid = createCustomPlayer(new Rng('kid'), {
      name: 'Kid',
      age: 17,
      position: 'ST',
      attributes: suggestedAttributes('ST'),
      tendencies: {},
    });
    const counts = sample(
      context({ player: kid, nearbyDefenders: 0, defensivePressure: 0.15, situationQuality: 0.85 }),
      'placedFinish',
    );
    const goals = rate(counts, 'goal');
    expect(goals).toBeGreaterThan(0.1);
    // ...but still clearly worse than a seasoned finisher.
    const senior = rate(
      sample(
        context({
          player: veteran(),
          nearbyDefenders: 0,
          defensivePressure: 0.15,
          situationQuality: 0.85,
        }),
        'placedFinish',
      ),
      'goal',
    );
    expect(senior).toBeGreaterThan(goals + 0.08);
  });

  it('no situation is walled off entirely, however poor the attempt', () => {
    // The failure mode being guarded against is arithmetic impossibility, not
    // improbability: every shot must retain some chance of going in.
    const hopeless = sample(
      context({
        player: prospect(),
        nearbyDefenders: 4,
        defensivePressure: 1,
        situationQuality: 0.1,
        zone: { third: 'attacking', channel: 'right', box: 'outside' },
      }),
      'powerDrive',
      6000,
    );
    expect(hopeless['goal'] ?? 0).toBeGreaterThan(0);
    expect(rate(hopeless, 'goal', 6000)).toBeLessThan(0.1);
  });
});

describe('untimed mode', () => {
  it('treats tempo as neutral rather than late', () => {
    const late = tempoAdjustment({
      option: option('placedFinish'),
      timeUsed: 1.95,
      window: 2,
      expired: false,
    });
    const untimed = tempoAdjustment({
      option: option('placedFinish'),
      timeUsed: 30,
      window: 2,
      expired: false,
      untimed: true,
    });
    expect(late).toBeLessThan(0);
    expect(untimed).toBe(0);
  });

  it('does not apply the rushed-execution penalty', () => {
    const definition = getAction('placedFinish');
    const ctx = context();
    const timed = executionQuality(definition, ctx, {
      option: option('placedFinish'),
      timeUsed: 1.99,
      window: 2,
      expired: false,
    });
    const untimed = executionQuality(definition, ctx, {
      option: option('placedFinish'),
      timeUsed: 1.99,
      window: 2,
      expired: false,
      untimed: true,
    });
    expect(untimed).toBeGreaterThan(timed);
  });

  it('still lets an expired timer override it', () => {
    expect(
      tempoAdjustment({
        option: option('placedFinish'),
        timeUsed: 2,
        window: 2,
        expired: true,
        untimed: true,
      }),
    ).toBeLessThan(0);
  });
});

/**
 * THE CHANCE ITSELF, AND WHERE IT IS ALLOWED TO COUNT.
 *
 * `SHOT_QUALITY` exists because a good footballer's hopeless chance used to
 * convert almost as well as his best one — measured at 27.6% against 44.5% for
 * a world-class striker, a spread of 1.5x where real football is nearer
 * tenfold. These pin the two properties that fix depends on, both of which are
 * easy to undo by accident.
 */
describe('chance quality in the goal roll', () => {
  it('makes a poor chance convert worse than a good one, all else equal', () => {
    const poor = shotGoalProbability(0.7, 0.3);
    const fair = shotGoalProbability(0.7, 0.5);
    const good = shotGoalProbability(0.7, 0.9);
    expect(poor).toBeLessThan(fair);
    expect(fair).toBeLessThan(good);
    // And by a margin worth having: the whole defect was that this spread was
    // too narrow to matter.
    expect(good / poor).toBeGreaterThan(3);
  });

  it('leaves set pieces entirely alone, at both ends of the quality range', () => {
    // A penalty sits at 0.88-0.95 quality and a direct free kick at 0.3-0.55.
    // Both are separately calibrated situations, so neither may be re-graded by
    // a gradient fitted to open play — and because they sit at opposite ends of
    // it, including them moves them in opposite directions.
    for (const situation of SET_PIECE_SITUATIONS) {
      const high = shotGoalProbability(0.7, 0.92, situation);
      const low = shotGoalProbability(0.7, 0.42, situation);
      expect(high).toBe(low);
    }
  });

  it('resolves a set piece on the midpoint it was calibrated against', () => {
    // Exempting them from the gradient is only half of leaving them alone: the
    // open-play midpoint moved to offset that gradient, and a set piece must
    // not inherit an offset for something it never received.
    const openPlay = shotGoalProbability(0.7, 0.5);
    const setPiece = shotGoalProbability(0.7, 0.5, 'penalty');
    expect(setPiece).toBeGreaterThan(openPlay);
  });

  it('treats a missing quality as neutral, so an old caller is unchanged', () => {
    expect(shotGoalProbability(0.7)).toBe(shotGoalProbability(0.7, 0.5));
  });

  it('still never reaches certainty or impossibility', () => {
    expect(shotGoalProbability(5, 1)).toBeLessThanOrEqual(GOAL_CURVE.max);
    expect(shotGoalProbability(-5, 0)).toBeGreaterThanOrEqual(GOAL_CURVE.min);
    expect(SHOT_QUALITY).toBeGreaterThan(0);
  });
});
