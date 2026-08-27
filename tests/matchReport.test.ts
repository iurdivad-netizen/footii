import { describe, expect, it } from 'vitest';
import { MILESTONE_RANGE, changesBetween } from '../src/core/career/matchReport.ts';
import type { CareerSnapshot } from '../src/core/career/matchReport.ts';
import { CONFIDENCE_NEUTRAL } from '../src/core/career/confidence.ts';
import { TRAIN_FITNESS_FLOOR } from '../src/core/career/week.ts';

/**
 * WHAT THE LAST MATCH CHANGED
 *
 * The property that matters more than any individual line is SILENCE. This
 * exists because the hub redrew with a dozen numbers moved and said nothing;
 * the fix is not to print all twelve. A strip that appeared every week would
 * train the eye to skip the week it mattered, which is the mistake this
 * codebase made once with morale and fixed once by making the moments rare.
 *
 * So most of these check that it says nothing.
 */

function snapshot(overrides: Partial<CareerSnapshot> = {}): CareerSnapshot {
  return {
    fitness: 100,
    confidence: CONFIDENCE_NEUTRAL,
    appearances: 12,
    goals: 4,
    ...overrides,
  };
}

describe('saying nothing', () => {
  it('says nothing at all about an ordinary week', () => {
    const before = snapshot();
    const after = snapshot({ fitness: 92, confidence: CONFIDENCE_NEUTRAL + 3 });
    expect(changesBetween(before, after)).toEqual([]);
  });

  it('does not report fitness that merely moved', () => {
    // Both sides of this are above the floor, so nothing about the week's
    // options has changed and there is nothing to act on.
    const before = snapshot({ fitness: 100 });
    const after = snapshot({ fitness: TRAIN_FITNESS_FLOOR + 1 });
    expect(changesBetween(before, after)).toEqual([]);
  });

  it('does not report confidence that stayed inside its band', () => {
    const before = snapshot({ confidence: 52 });
    const after = snapshot({ confidence: 56 });
    expect(changesBetween(before, after)).toEqual([]);
  });

  it('stays quiet while a milestone is still a long way off', () => {
    const before = snapshot({ appearances: 20 });
    const after = snapshot({ appearances: 21 });
    expect(changesBetween(before, after)).toEqual([]);
  });
});

describe('the manager changing his mind', () => {
  it('speaks when the band moves, not when the number does', () => {
    // 42 is the boundary between "unconvinced" and "watching".
    const changes = changesBetween(snapshot({ confidence: 40 }), snapshot({ confidence: 50 }));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.tone).toBe('good');
    expect(changes[0]!.text).toMatch(/manager/i);
  });

  it('marks a fall as bad rather than as news', () => {
    const changes = changesBetween(snapshot({ confidence: 60 }), snapshot({ confidence: 30 }));
    expect(changes[0]!.tone).toBe('bad');
  });

  it('never prints the number itself', () => {
    // He cannot see the figure and neither should the strip — the whole reason
    // confidence is shown as a band is that a two-digit number beside `Morale`
    // is what the feature was written to stop being.
    const changes = changesBetween(snapshot({ confidence: 40 }), snapshot({ confidence: 80 }));
    expect(changes[0]!.text).not.toMatch(/\b(40|80)\b/);
  });
});

describe('fitness, only where it changes the week', () => {
  it('speaks when he drops below the level extra work needs', () => {
    const changes = changesBetween(
      snapshot({ fitness: TRAIN_FITNESS_FLOOR + 5 }),
      snapshot({ fitness: TRAIN_FITNESS_FLOOR - 5 }),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.tone).toBe('bad');
    expect(changes[0]!.text).toMatch(/extra work/i);
  });

  it('speaks again when he recovers past it', () => {
    const changes = changesBetween(
      snapshot({ fitness: TRAIN_FITNESS_FLOOR - 5 }),
      snapshot({ fitness: TRAIN_FITNESS_FLOOR + 5 }),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.tone).toBe('good');
  });

  it('does not repeat itself while he stays tired', () => {
    // The event is crossing the line. Sitting below it for a month is a state,
    // and a state repeated every week is noise.
    const changes = changesBetween(
      snapshot({ fitness: TRAIN_FITNESS_FLOOR - 10 }),
      snapshot({ fitness: TRAIN_FITNESS_FLOOR - 20 }),
    );
    expect(changes).toEqual([]);
  });
});

describe('a milestone within reach', () => {
  it('counts down appearances once it is close', () => {
    const changes = changesBetween(snapshot({ appearances: 46 }), snapshot({ appearances: 48 }));
    const line = changes.find((change) => /appearance/.test(change.text));
    expect(line).toBeDefined();
    expect(line!.text).toContain('2');
    expect(line!.text).toContain('50th');
  });

  it('uses the singular for the last one', () => {
    const changes = changesBetween(snapshot({ appearances: 48 }), snapshot({ appearances: 49 }));
    const line = changes.find((change) => /appearance/.test(change.text))!;
    expect(line.text).toContain('1 match from');
  });

  it('counts down goals as well', () => {
    const changes = changesBetween(snapshot({ goals: 20 }), snapshot({ goals: 23 }));
    const line = changes.find((change) => /goal/.test(change.text))!;
    expect(line.text).toContain('25th');
  });

  it('only speaks inside its range', () => {
    const justOutside = changesBetween(
      snapshot({ appearances: 40 }),
      snapshot({ appearances: 50 - MILESTONE_RANGE - 1 }),
    );
    expect(justOutside).toEqual([]);
  });

  it('says nothing once the last milestone is behind him', () => {
    // 500 appearances is the end of the list. A career past it must not be
    // told it is "NaN matches from your undefined".
    const changes = changesBetween(snapshot({ appearances: 600 }), snapshot({ appearances: 601 }));
    expect(changes).toEqual([]);
  });

  it('never counts down to a first, however long he goes without one', () => {
    // Found by playing rather than by reading. Both milestone lists start at 1,
    // so a player yet to score is permanently within range of his "1st goal" —
    // which for a centre-back means the strip repeats that line after every
    // match for twenty matches. The moments already announce a first goal
    // properly, at the moment it happens.
    const goalless = changesBetween(
      snapshot({ appearances: 0, goals: 0 }),
      snapshot({ appearances: 0, goals: 0 }),
    );
    expect(goalless).toEqual([]);

    const stillGoalless = changesBetween(
      snapshot({ appearances: 18, goals: 0 }),
      snapshot({ appearances: 19, goals: 0 }),
    );
    expect(stillGoalless).toEqual([]);
  });
});

describe('several at once', () => {
  it('reports every line that earned its place', () => {
    const changes = changesBetween(
      snapshot({ confidence: 40, fitness: 100, appearances: 46 }),
      snapshot({ confidence: 70, fitness: TRAIN_FITNESS_FLOOR - 1, appearances: 49 }),
    );
    expect(changes.length).toBeGreaterThanOrEqual(3);
    expect(changes.some((c) => /manager/i.test(c.text))).toBe(true);
    expect(changes.some((c) => /extra work/i.test(c.text))).toBe(true);
    expect(changes.some((c) => /appearance/i.test(c.text))).toBe(true);
  });
});
