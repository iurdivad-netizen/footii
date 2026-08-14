import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';

describe('Rng', () => {
  it('produces an identical stream for the same seed', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-1');
    const left = Array.from({ length: 50 }, () => a.next());
    const right = Array.from({ length: 50 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 20 }, (_, i) => new Rng('seed-a').next() + i * 0);
    const b = Array.from({ length: 20 }, (_, i) => new Rng('seed-b').next() + i * 0);
    expect(a[0]).not.toBe(b[0]);
  });

  it('stays within [0, 1)', () => {
    const rng = new Rng('bounds');
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() is inclusive at both ends and never exceeds them', () => {
    const rng = new Rng('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const value = rng.int(1, 6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it('weighted() respects weights within tolerance', () => {
    const rng = new Rng('weights');
    let a = 0;
    const runs = 20000;
    for (let i = 0; i < runs; i++) {
      if (rng.weighted([{ value: 'a', weight: 3 }, { value: 'b', weight: 1 }]) === 'a') a++;
    }
    expect(a / runs).toBeGreaterThan(0.72);
    expect(a / runs).toBeLessThan(0.78);
  });

  it('weighted() ignores non-positive weights', () => {
    const rng = new Rng('zero-weights');
    for (let i = 0; i < 100; i++) {
      expect(
        rng.weighted([
          { value: 'never', weight: 0 },
          { value: 'always', weight: 1 },
        ]),
      ).toBe('always');
    }
  });

  it('noise() is hard-clamped', () => {
    const rng = new Rng('noise');
    for (let i = 0; i < 10000; i++) {
      const value = rng.noise(0.1, 2);
      expect(Math.abs(value)).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('shuffle() keeps every element exactly once', () => {
    const rng = new Rng('shuffle');
    const input = [1, 2, 3, 4, 5, 6];
    const output = rng.shuffle(input);
    expect(output.slice().sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]); // original untouched
  });
});
