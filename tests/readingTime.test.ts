import { describe, expect, it } from 'vitest';
import {
  MAX_BUILD_UP_TIME,
  MIN_BUILD_UP_TIME,
  SCAN_SECONDS,
  calculateBuildUpTime,
  calculateScanTime,
  visibleBeatCount,
} from '../src/ui/interaction/readingTime.ts';
import { Rng } from '../src/core/rng.ts';
import { generateBuildUp } from '../src/data/buildUp.ts';
import { SITUATION_TEMPLATES } from '../src/data/situations.ts';
import type { SituationType } from '../src/core/events/types.ts';
import { context } from './helpers.ts';

const TYPES = Object.keys(SITUATION_TEMPLATES) as SituationType[];

function beatsFor(type: SituationType, seed = 'b') {
  return generateBuildUp(new Rng(seed), context({ situation: type }), SITUATION_TEMPLATES[type]);
}

describe('build-up narration', () => {
  it('produces ordered beats ending with the situation description', () => {
    for (const type of TYPES) {
      const ctx = context({ situation: type });
      const template = SITUATION_TEMPLATES[type];
      const beats = generateBuildUp(new Rng(`x-${type}`), ctx, template);
      expect(beats.length, type).toBeGreaterThanOrEqual(3);
      expect(beats[beats.length - 1], type).toBe(template.describe(ctx));
    }
  });

  it('never produces an empty or undefined beat', () => {
    for (const type of TYPES) {
      for (let seed = 0; seed < 25; seed++) {
        for (const beat of beatsFor(type, `s-${seed}`)) {
          expect(beat, `${type}/${seed}`).toBeTruthy();
          expect(typeof beat).toBe('string');
          expect(beat.length).toBeGreaterThan(3);
        }
      }
    }
  });

  it('is deterministic for a fixed seed', () => {
    expect(beatsFor('oneOnOne', 'fixed')).toEqual(beatsFor('oneOnOne', 'fixed'));
  });

  it('varies between events so the narration does not feel canned', () => {
    const seen = new Set(
      Array.from({ length: 30 }, (_, i) => beatsFor('oneOnOne', `v-${i}`).join('|')),
    );
    expect(seen.size).toBeGreaterThan(4);
  });

  it('reflects a counterattack in the story', () => {
    const beats = generateBuildUp(
      new Rng('counter'),
      context({ transition: true }),
      SITUATION_TEMPLATES.oneOnOne,
    );
    expect(beats[0]!.toLowerCase()).toMatch(/break|counter|turnover|win the ball/);
  });

  it('calls out an unusually open or crowded chance', () => {
    const open = generateBuildUp(
      new Rng('open'),
      context({ nearbyDefenders: 0 }),
      SITUATION_TEMPLATES.oneOnOne,
    ).join(' ');
    expect(open.toLowerCase()).toMatch(/nobody near|acres of space/);

    const crowded = generateBuildUp(
      new Rng('crowd'),
      context({ nearbyDefenders: 4 }),
      SITUATION_TEMPLATES.crossArrival,
    ).join(' ');
    expect(crowded.toLowerCase()).toMatch(/bodies everywhere|packed/);
  });
});

describe('event pacing', () => {
  it('holds the build-up long enough to follow, and bounds it at both ends', () => {
    for (const type of TYPES) {
      const time = calculateBuildUpTime(beatsFor(type, `p-${type}`));
      expect(time, type).toBeGreaterThanOrEqual(MIN_BUILD_UP_TIME);
      expect(time, type).toBeLessThanOrEqual(MAX_BUILD_UP_TIME);
    }
    expect(calculateBuildUpTime(Array.from({ length: 40 }, (_, i) => `beat ${i}`))).toBe(
      MAX_BUILD_UP_TIME,
    );
    expect(calculateBuildUpTime(['only one'])).toBe(MIN_BUILD_UP_TIME);
  });

  it('keeps the scan beat short — the options are not a free planning phase', () => {
    expect(calculateScanTime()).toBe(SCAN_SECONDS);
    expect(SCAN_SECONDS).toBeLessThan(0.8);
  });

  it('scales both phases with the pace setting', () => {
    const beats = beatsFor('oneOnOne');
    expect(calculateBuildUpTime(beats, 2)).toBeCloseTo(calculateBuildUpTime(beats, 1) * 2, 5);
    expect(calculateScanTime(2)).toBeCloseTo(calculateScanTime(1) * 2, 5);
  });

  it('reveals beats progressively and never overshoots the held beats', () => {
    const beats = beatsFor('oneOnOne');
    const held = beats.length - 1;
    const total = calculateBuildUpTime(beats);

    expect(visibleBeatCount(0, beats)).toBe(1);
    expect(visibleBeatCount(total * 0.99, beats)).toBe(held);
    // Never reveals the final (situation) beat during the build-up.
    expect(visibleBeatCount(total * 2, beats)).toBe(held);
    expect(visibleBeatCount(total * 2, beats)).toBeLessThan(beats.length);

    let previous = 0;
    for (let t = 0; t <= total; t += total / 20) {
      const count = visibleBeatCount(t, beats);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });
});
