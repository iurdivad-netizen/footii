import { describe, expect, it } from 'vitest';
import { COVERAGE_REQUIRED, describeHowPlayed } from '../src/core/career/howPlayed.ts';
import type { HowItWasPlayed } from '../src/core/career/career.ts';
import { createHowItWasPlayed } from '../src/core/career/career.ts';
import { careerScore } from '../src/core/career/legacy.ts';

const counts = (overrides: Partial<HowItWasPlayed> = {}): HowItWasPlayed => ({
  ...createHowItWasPlayed(),
  ...overrides,
});

describe('what the counts say', () => {
  it('calls a career played out when almost all of it was', () => {
    const summary = describeHowPlayed(counts({ played: 400, skipped: 4 }), 404);
    expect(summary.label).toBe('Played out');
    expect(summary.reliable).toBe(true);
    expect(summary.playedShare).toBeCloseTo(400 / 404, 5);
  });

  it('grades the middle rather than only the ends', () => {
    const label = (played: number, skipped: number) =>
      describeHowPlayed(counts({ played, skipped }), played + skipped).label;
    expect(label(100, 0)).toBe('Played out');
    expect(label(70, 30)).toBe('Mostly played');
    expect(label(40, 60)).toBe('Part-played');
    expect(label(10, 90)).toBe('Largely simulated');
    expect(label(0, 100)).toBe('Simulated');
  });

  it('says something usable about the split', () => {
    expect(describeHowPlayed(counts({ played: 50, skipped: 0 }), 50).detail).toContain('Every one');
    expect(describeHowPlayed(counts({ played: 0, skipped: 50 }), 50).detail).toContain('without you');
    expect(describeHowPlayed(counts({ played: 30, skipped: 20 }), 50).detail).toContain('60%');
  });
});

describe('the pace it was played at', () => {
  it('reports the one most of it was played at', () => {
    const summary = describeHowPlayed(
      counts({ played: 100, paces: { standard: 70, hardcore: 30 } }),
      100,
    );
    expect(summary.dominantPace).toBe('standard');
    expect(summary.dominantShare).toBeCloseTo(0.7, 5);
  });

  it('reports an id it has never heard of, and leaves reading it to somebody else', () => {
    // The histogram is deliberately keyed loosely so a save holding counts under
    // a name this version no longer has keeps them as an unreadable tally rather
    // than failing to load. `core` therefore hands the id up untouched.
    const summary = describeHowPlayed(counts({ played: 40, paces: { leisurely: 40 } }), 40);
    expect(summary.dominantPace).toBe('leisurely');
  });

  it('has no pace at all for a career that was never played', () => {
    expect(describeHowPlayed(counts({ played: 0, skipped: 90 }), 90).dominantPace).toBeNull();
  });
});

describe('refusing to guess', () => {
  it('says nothing about a career from before anybody was counting', () => {
    // The counter can only count forward, so a long career carried through the
    // migration has counts covering only part of itself. Labelling that
    // "largely simulated" would be an accusation made out of a missing field.
    const summary = describeHowPlayed(counts({ played: 20, skipped: 2 }), 400);
    expect(summary.reliable).toBe(false);
    expect(summary.label).toBe('Not recorded');
    expect(summary.playedShare).toBeNull();
  });

  it('says nothing when there are no counts at all', () => {
    expect(describeHowPlayed(undefined, 250).reliable).toBe(false);
    expect(describeHowPlayed(counts(), 250).reliable).toBe(false);
  });

  it('trusts counts that cover the career', () => {
    const appearances = 300;
    const just = Math.ceil(appearances * COVERAGE_REQUIRED);
    expect(describeHowPlayed(counts({ played: just }), appearances).reliable).toBe(true);
    expect(describeHowPlayed(counts({ played: just - 20 }), appearances).reliable).toBe(false);
  });

  it('trusts a career whose counts exceed its appearances', () => {
    // Skipped matches are counted and are not appearances, so `counted` running
    // ahead of `appearances` is the ordinary case rather than a warning sign.
    expect(describeHowPlayed(counts({ played: 100, skipped: 200 }), 100).reliable).toBe(true);
  });

  it('is not confused by a career with no appearances yet', () => {
    expect(describeHowPlayed(counts({ played: 1 }), 0).reliable).toBe(true);
  });
});

describe('what it deliberately does not touch', () => {
  it('leaves the career score alone', () => {
    // The whole design. The item was raised as "penalise the score", and there
    // is no honest exchange rate between an hour of somebody's attention and a
    // number on a wall — so the two are reported side by side instead.
    const legacy = {
      goals: 120,
      assists: 60,
      appearances: 400,
      averageRating: 7.3,
      caps: 40,
      seasons: 14,
      honours: [],
      honourPoints: 300,
    };
    const score = careerScore(legacy);
    // There is no argument that could change it: the function cannot see the
    // counts, and this asserts that it stays that way.
    expect(careerScore({ ...legacy })).toBe(score);
    expect(Object.keys(legacy)).not.toContain('howPlayed');
  });
});
