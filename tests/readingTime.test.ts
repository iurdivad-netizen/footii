import { describe, expect, it } from 'vitest';
import {
  MAX_SET_TIME,
  MIN_SET_TIME,
  calculateSetTime,
} from '../src/ui/interaction/readingTime.ts';
import { Rng } from '../src/core/rng.ts';
import { generateActions } from '../src/simulation/ActionGenerator.ts';
import { SITUATION_TEMPLATES } from '../src/data/situations.ts';
import type { SituationType } from '../src/core/events/types.ts';
import { context } from './helpers.ts';

function optionsFor(type: SituationType, seed = 'set') {
  return generateActions(new Rng(seed), context({ situation: type }), SITUATION_TEMPLATES[type]);
}

describe('reading ("set") phase', () => {
  it('gives enough time to read a realistic six-option menu', () => {
    // Measured average across generated events is ~95 characters of label text.
    const options = optionsFor('oneOnOne');
    const characters = options.reduce((n, o) => n + o.label.length, 0);
    const setTime = calculateSetTime(options);
    expect(characters).toBeGreaterThan(40);
    expect(setTime).toBeGreaterThanOrEqual(MIN_SET_TIME);
    expect(setTime).toBeLessThanOrEqual(MAX_SET_TIME);
  });

  it('scales with the amount of text, so wordy menus are not a hidden penalty', () => {
    const terse = [{ slot: 1, kind: 'chip', label: 'Chip', family: 'shot', generationFit: 0.5 }];
    const wordy = [
      {
        slot: 1,
        kind: 'chip',
        label: 'Chip the keeper and hope he has come far enough off his line',
        family: 'shot',
        generationFit: 0.5,
      },
    ];
    expect(calculateSetTime(wordy as never)).toBeGreaterThan(calculateSetTime(terse as never));
  });

  it('is bounded at both ends', () => {
    const huge = Array.from({ length: 6 }, (_, i) => ({
      slot: i + 1,
      kind: 'chip',
      label: 'x'.repeat(200),
      family: 'shot',
      generationFit: 0.5,
    }));
    expect(calculateSetTime(huge as never)).toBe(MAX_SET_TIME);
    expect(calculateSetTime([])).toBe(MIN_SET_TIME);
  });

  it('scales with the pace setting', () => {
    const options = optionsFor('oneOnOne');
    expect(calculateSetTime(options, 2)).toBeCloseTo(calculateSetTime(options, 1) * 2, 5);
  });

  it('covers every situation archetype', () => {
    for (const type of Object.keys(SITUATION_TEMPLATES) as SituationType[]) {
      const setTime = calculateSetTime(optionsFor(type, `s-${type}`));
      expect(setTime, type).toBeGreaterThanOrEqual(MIN_SET_TIME);
    }
  });
});
