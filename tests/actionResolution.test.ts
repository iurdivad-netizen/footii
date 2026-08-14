import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import type { ActionKind, ActionOption, OutcomeKind } from '../src/core/events/types.ts';
import { getAction } from '../src/data/actionCatalogue.ts';
import {
  RESOLUTION_WEIGHTS,
  executionQuality,
  resolveAction,
  tempoAdjustment,
} from '../src/simulation/ActionResolver.ts';
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
