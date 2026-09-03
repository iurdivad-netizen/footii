import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OUTFIELD_POSITIONS,
  POSITION_PROFILES,
  WINDOW_ATTRIBUTES,
  keyAttributesFor,
  summaryAttributesFor,
} from '../src/core/player/positions.ts';

/**
 * "KEY ATTRIBUTES" MUST MEAN THIS POSITION'S.
 *
 * The hub card is titled "Key attributes" and rendered the same eight for
 * everybody: a centre back was shown Finishing and Dribbling and never Tackling
 * or Defensive Awareness, which is not a summary of him — it is a summary of a
 * forward. The creator and the training grid had asked the position all along,
 * so the game gave two different answers to one question depending on which
 * screen you were standing on.
 *
 * These pin the shared answer, and that the screens read it rather than
 * carrying lists of their own.
 */

describe('what a position needs', () => {
  it('gives every position a non-empty set', () => {
    for (const position of OUTFIELD_POSITIONS) {
      expect(keyAttributesFor(position).size).toBeGreaterThan(0);
    }
  });

  it('actually differs by position — a centre back is not a striker', () => {
    const cb = keyAttributesFor('CB');
    const st = keyAttributesFor('ST');
    expect(cb.has('tackling')).toBe(true);
    expect(cb.has('defensiveAwareness')).toBe(true);
    expect(cb.has('finishing')).toBe(false);
    expect(st.has('finishing')).toBe(true);
    expect(st.has('tackling')).toBe(false);
  });

  it('summarises with the role first and the decision window always', () => {
    for (const position of OUTFIELD_POSITIONS) {
      const summary = summaryAttributesFor(position);
      const keys = POSITION_PROFILES[position].keyAttributes;
      // Every one the role asks for, in the profile's own order, before anything else.
      expect(summary.slice(0, keys.length)).toEqual([...keys]);
      // And the three the timer reads, whoever you are.
      for (const window of WINDOW_ATTRIBUTES) expect(summary).toContain(window);
      // Never the same attribute twice.
      expect(new Set(summary).size).toBe(summary.length);
    }
  });

  it('does not mark the window attributes key unless the role asks for them', () => {
    // The mark means "your position needs this". A mark on every row means nothing.
    expect(keyAttributesFor('ST').has('awareness')).toBe(false);
    expect(keyAttributesFor('CM').has('awareness')).toBe(true);
  });
});

describe('the screens that answer it', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  const screens: [string, string][] = [
    ['the career hub', '../src/ui/screens/CareerScreen.ts'],
    ['the season review', '../src/ui/screens/SeasonReviewScreen.ts'],
    ['the player creator', '../src/ui/screens/PlayerCreatorScreen.ts'],
    ['the training grid', '../src/ui/screens/TrainingScreen.ts'],
  ];

  for (const [name, path] of screens) {
    it(`${name} asks the position rather than carrying its own list`, () => {
      const source = read(path);
      expect(source).toMatch(/keyAttributesFor|POSITION_PROFILES\[[^\]]+\]\.keyAttributes/);
    });
  }

  it('leaves no hardcoded attribute list on the hub card', () => {
    // The exact shape of the bug: a literal list of attribute names, the same
    // for every footballer, under a heading promising the opposite.
    const source = read('../src/ui/screens/CareerScreen.ts');
    expect(source).not.toMatch(/'awareness',\s*'decisionMaking',\s*'composure',\s*'finishing'/);
  });
});
