import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { ATTRIBUTE_KEYS } from '../src/core/player/attributes.ts';
import { currentAbility } from '../src/core/player/player.ts';
import { OUTFIELD_POSITIONS, POSITION_PROFILES } from '../src/core/player/positions.ts';
import {
  CREATION_CAP,
  CREATION_FLOOR,
  CREATION_POINTS,
  blankAttributes,
  createCustomPlayer,
  pointsRemaining,
  pointsSpent,
  rollPotential,
  startingExperience,
  stylesForPosition,
  suggestedAttributes,
  validateSpec,
} from '../src/core/player/playerBuilder.ts';
import { calculateDecisionTime } from '../src/simulation/DecisionTimer.ts';
import { getSituationTemplate } from '../src/data/situations.ts';
import { context } from './helpers.ts';

function spec(overrides: Partial<Parameters<typeof validateSpec>[0]> = {}) {
  return {
    name: 'Test Player',
    age: 18,
    position: 'ST' as const,
    attributes: suggestedAttributes('ST'),
    tendencies: {},
    ...overrides,
  };
}

describe('custom player creation', () => {
  it('starts every attribute at the floor with the full pool unspent', () => {
    const attributes = blankAttributes();
    for (const key of ATTRIBUTE_KEYS) expect(attributes[key]).toBe(CREATION_FLOOR);
    expect(pointsSpent(attributes)).toBe(0);
    expect(pointsRemaining(attributes)).toBe(CREATION_POINTS);
  });

  it('suggests a build that spends exactly the pool, for every position', () => {
    for (const position of OUTFIELD_POSITIONS) {
      const attributes = suggestedAttributes(position);
      expect(pointsRemaining(attributes), position).toBe(0);
      for (const key of ATTRIBUTE_KEYS) {
        expect(attributes[key], `${position}/${key}`).toBeGreaterThanOrEqual(CREATION_FLOOR);
        expect(attributes[key], `${position}/${key}`).toBeLessThanOrEqual(CREATION_CAP);
      }
    }
  });

  it('weights the suggested build toward the position key attributes', () => {
    for (const position of OUTFIELD_POSITIONS) {
      const attributes = suggestedAttributes(position);
      const keys = POSITION_PROFILES[position].keyAttributes;
      const keyAverage = keys.reduce((n, k) => n + attributes[k], 0) / keys.length;
      const allAverage =
        ATTRIBUTE_KEYS.reduce((n, k) => n + attributes[k], 0) / ATTRIBUTE_KEYS.length;
      expect(keyAverage, position).toBeGreaterThan(allAverage);
    }
  });

  it('gives every created player the same budget, so none is strictly better', () => {
    const striker = suggestedAttributes('ST');
    const defender = suggestedAttributes('CB');
    expect(pointsSpent(striker)).toBe(pointsSpent(defender));
    expect(pointsSpent(striker)).toBe(CREATION_POINTS);
  });

  it('rejects an incomplete or over-spent build', () => {
    const under = blankAttributes();
    expect(validateSpec(spec({ attributes: under })).valid).toBe(false);
    expect(validateSpec(spec({ attributes: under })).errors[0]).toMatch(/still have/);

    const over = suggestedAttributes('ST');
    over.finishing = Math.min(CREATION_CAP, over.finishing + 5);
    if (pointsRemaining(over) < 0) {
      expect(validateSpec(spec({ attributes: over })).valid).toBe(false);
    }
  });

  it('rejects a missing name and an out-of-range age', () => {
    expect(validateSpec(spec({ name: '   ' })).valid).toBe(false);
    expect(validateSpec(spec({ age: 12 })).valid).toBe(false);
    expect(validateSpec(spec({ age: 99 })).valid).toBe(false);
    expect(validateSpec(spec()).valid).toBe(true);
  });

  it('rejects an attribute above the creation cap', () => {
    const attributes = suggestedAttributes('ST');
    attributes.finishing = 95;
    expect(validateSpec(spec({ attributes })).valid).toBe(false);
  });

  it('scales starting experience with age', () => {
    expect(startingExperience(16)).toBeLessThan(startingExperience(22));
    expect(startingExperience(22)).toBeLessThan(startingExperience(30));
    expect(startingExperience(16)).toBeGreaterThan(0);
    expect(startingExperience(34)).toBeLessThanOrEqual(92);
  });

  it('rolls more hidden potential for younger players', () => {
    const average = (age: number) => {
      let total = 0;
      const runs = 300;
      for (let i = 0; i < runs; i++) total += rollPotential(new Rng(`p-${i}`), age, 55);
      return total / runs;
    };
    expect(average(17)).toBeGreaterThan(average(22));
    expect(average(22)).toBeGreaterThan(average(26));
    expect(average(26)).toBeGreaterThan(average(31));
  });

  it('never rolls potential below current ability', () => {
    for (let i = 0; i < 200; i++) {
      expect(rollPotential(new Rng(`n-${i}`), 30, 80)).toBeGreaterThanOrEqual(80);
      expect(rollPotential(new Rng(`n-${i}`), 17, 90)).toBeLessThanOrEqual(99);
    }
  });

  it('creates a usable player with hidden potential above his ability', () => {
    const player = createCustomPlayer(new Rng('create'), spec());
    expect(player.name).toBe('Test Player');
    expect(player.position).toBe('ST');
    expect(player.age).toBe(18);
    expect(player.fitness).toBe(100);
    expect(player.potentialAbility).toBeGreaterThanOrEqual(currentAbility(player));
    expect(player.experience).toBe(startingExperience(18));
  });

  it('applies the chosen playing style as tendencies', () => {
    const styles = stylesForPosition('ST');
    const poacher = styles.find((s) => s.id === 'poacher')!;
    const player = createCustomPlayer(new Rng('style'), spec({ tendencies: poacher.tendencies }));
    expect(player.tendencies.runsBehind).toBe(90);
    expect(player.tendencies.dropsDeep).toBe(15);
  });

  it('offers styles for every outfield position', () => {
    for (const position of OUTFIELD_POSITIONS) {
      const styles = stylesForPosition(position);
      expect(styles.length, position).toBeGreaterThanOrEqual(3);
      expect(new Set(styles.map((s) => s.id)).size).toBe(styles.length);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = createCustomPlayer(new Rng('same'), spec());
    const b = createCustomPlayer(new Rng('same'), spec());
    expect(a.potentialAbility).toBe(b.potentialAbility);
    expect(a.attributes).toEqual(b.attributes);
  });

  it('a created teenager faces a tighter decision window than a created veteran', () => {
    // Same points, different age: experience alone should separate them.
    const template = getSituationTemplate('oneOnOne');
    const windowFor = (age: number) => {
      const player = createCustomPlayer(new Rng('w'), spec({ age }));
      return calculateDecisionTime(context({ player, defensivePressure: 0.3 }), template).seconds;
    };
    expect(windowFor(30)).toBeGreaterThan(windowFor(16));
  });
});
