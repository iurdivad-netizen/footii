import { describe, expect, it } from 'vitest';
import {
  MAX_DECISION_TIME,
  MIN_DECISION_TIME,
  calculateDecisionTime,
  experienceFactor,
} from '../src/simulation/DecisionTimer.ts';
import { getSituationTemplate } from '../src/data/situations.ts';
import { context, goalkeeperState, keeper, prospect, veteran } from './helpers.ts';

const oneOnOne = getSituationTemplate('oneOnOne');

describe('decision timer', () => {
  it('gives an experienced, composed player roughly 2.8-3.2s under light pressure', () => {
    const result = calculateDecisionTime(
      context({
        player: veteran(),
        defensivePressure: 0.15,
        goalkeeper: goalkeeperState(keeper({ aggression: 40 }), { startingDepth: 0.15 }),
      }),
      oneOnOne,
    );
    expect(result.seconds).toBeGreaterThanOrEqual(2.8);
    expect(result.seconds).toBeLessThanOrEqual(3.2);
  });

  it('gives a young, inexperienced player roughly 1.3-1.7s in the same situation', () => {
    const result = calculateDecisionTime(
      context({
        player: prospect(),
        defensivePressure: 0.15,
        goalkeeper: goalkeeperState(keeper({ aggression: 40 }), { startingDepth: 0.15 }),
      }),
      oneOnOne,
    );
    expect(result.seconds).toBeGreaterThanOrEqual(1.3);
    expect(result.seconds).toBeLessThanOrEqual(1.7);
  });

  it('takes substantially more time away under intense pressure', () => {
    const light = calculateDecisionTime(
      context({
        player: veteran(),
        defensivePressure: 0.1,
        goalkeeper: goalkeeperState(keeper({ aggression: 35 }), { startingDepth: 0.1 }),
      }),
      oneOnOne,
    );
    const intense = calculateDecisionTime(
      context({
        player: veteran(),
        defensivePressure: 0.95,
        nearbyDefenders: 3,
        goalkeeper: goalkeeperState(keeper({ aggression: 95 }), {
          startingDepth: 0.9,
          action: 'rushing',
        }),
      }),
      oneOnOne,
    );
    expect(intense.seconds).toBeLessThan(light.seconds - 0.6);
  });

  it('an aggressive goalkeeper rushing out shortens the window', () => {
    const calm = calculateDecisionTime(
      context({ goalkeeper: goalkeeperState(keeper({ aggression: 20 }), { startingDepth: 0.1 }) }),
      oneOnOne,
    );
    const aggressive = calculateDecisionTime(
      context({
        goalkeeper: goalkeeperState(keeper({ aggression: 95 }), {
          startingDepth: 0.9,
          action: 'rushing',
        }),
      }),
      oneOnOne,
    );
    expect(aggressive.seconds).toBeLessThan(calm.seconds);
  });

  it('ignores goalkeeper pressure when the keeper is not involved', () => {
    const midfield = getSituationTemplate('midfieldProgression');
    const withCalmKeeper = calculateDecisionTime(
      context({ goalkeeper: goalkeeperState(keeper({ aggression: 10 })) }),
      midfield,
    );
    const withAggressiveKeeper = calculateDecisionTime(
      context({
        goalkeeper: goalkeeperState(keeper({ aggression: 99 }), {
          action: 'rushing',
          startingDepth: 1,
        }),
      }),
      midfield,
    );
    expect(withAggressiveKeeper.seconds).toBe(withCalmKeeper.seconds);
  });

  it('always stays inside the clamp', () => {
    const absurdlyGood = calculateDecisionTime(
      context({
        player: veteran(),
        defensivePressure: 0,
        goalkeeper: goalkeeperState(keeper({ aggression: 1 }), { startingDepth: 0 }),
      }),
      { ...oneOnOne, baseTime: 20, difficulty: 0 },
    );
    expect(absurdlyGood.seconds).toBe(MAX_DECISION_TIME);
    expect(absurdlyGood.clamped).toBe(true);

    const impossible = calculateDecisionTime(
      context({ player: prospect(), defensivePressure: 1, nearbyDefenders: 4 }),
      { ...oneOnOne, baseTime: 0.1, difficulty: 1 },
    );
    expect(impossible.seconds).toBe(MIN_DECISION_TIME);
  });

  it('reports a modifier breakdown that reconstructs the final time', () => {
    const result = calculateDecisionTime(context(), oneOnOne);
    const rebuilt = result.modifiers.reduce((total, m) => total + m.seconds, result.baseTime);
    expect(Math.abs(rebuilt - result.seconds)).toBeLessThan(0.02);
    expect(result.modifiers.map((m) => m.label)).toContain('Awareness');
    expect(result.modifiers.map((m) => m.label)).toContain('Goalkeeper pressure');
  });

  it('fatigue shortens the window', () => {
    const fresh = calculateDecisionTime(context({ player: veteran({ fitness: 100 }) }), oneOnOne);
    const exhausted = calculateDecisionTime(context({ player: veteran({ fitness: 15 }) }), oneOnOne);
    expect(exhausted.seconds).toBeLessThan(fresh.seconds);
  });

  it('experienceFactor is monotonic and bounded', () => {
    expect(experienceFactor(0)).toBe(-1);
    expect(experienceFactor(100)).toBe(1);
    expect(experienceFactor(50)).toBeGreaterThan(experienceFactor(20));
    expect(experienceFactor(20)).toBeGreaterThan(experienceFactor(5));
  });
});
