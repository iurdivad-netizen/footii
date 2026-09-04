import { describe, expect, it } from 'vitest';
import {
  GOAL_CURVE,
  PASS_BAR,
  SET_PIECE_MIDPOINT,
  SET_PIECE_MIDPOINTS,
  passCompletionBar,
  shotGoalProbability,
} from '../src/simulation/ActionResolver.ts';

/**
 * CALIBRATED AGAINST REAL FOOTBALL, AND PINNED HERE.
 *
 * Every situation was audited by playing 200+ full matches under the auto-play
 * policy — typical play rather than best-case, so the numbers compare fairly
 * with published rates. Four were wrong, and three of the four were wrong in
 * the same direction: the game was more forgiving than football.
 *
 *   penalty            52.0% -> 75.0%   (real 76-79%)
 *   corner, per shot   20.6% -> 11.2%   (real 10-12%)
 *   crosses completed  51-66% -> 23%    (real 20-25%)
 *   midfield passes    44.4% -> 82.9%   (real ~85%)
 *
 * These tests pin the SHAPE of that calibration — the orderings and the
 * relationships — rather than re-running the matches, which would take minutes.
 * The measured rates live in the README table beside them.
 */

describe('set pieces are not one thing', () => {
  it('makes a penalty the best chance in football and a corner one of the worst', () => {
    const penalty = SET_PIECE_MIDPOINTS.penalty!;
    const corner = SET_PIECE_MIDPOINTS.cornerAttack!;
    // A lower midpoint is an easier chance.
    expect(penalty).toBeLessThan(corner);
    // And both are meaningfully away from the shared default they used to share.
    expect(penalty).toBeLessThan(SET_PIECE_MIDPOINT);
    expect(corner).toBeGreaterThan(SET_PIECE_MIDPOINT);
  });

  it('leaves the direct free kick alone, because it was already right', () => {
    // Measured at 6.3% against a real 5-8%. A calibration that "fixed" it would
    // have been a change made for tidiness rather than for football.
    expect(SET_PIECE_MIDPOINTS.freeKickDirect).toBeUndefined();
  });

  it('converts a penalty far more often than a corner struck just as well', () => {
    // Compared at IDENTICAL strike quality, which is the honest comparison: the
    // difference is then entirely the situation and not the execution. A corner
    // met perfectly is still a good chance — it is the typical one that should
    // not be, and the measured 11.2% comes from the values corners actually
    // produce rather than from the top of the curve.
    for (const struck of [0.5, 0.6, 0.75]) {
      const pen = shotGoalProbability(struck, 0.5, 'penalty');
      const corner = shotGoalProbability(struck, 0.5, 'cornerAttack');
      expect(pen).toBeGreaterThan(corner * 1.5);
    }
    // A typical corner header, not a perfect one.
    expect(shotGoalProbability(0.6, 0.5, 'cornerAttack')).toBeLessThan(0.25);
    // A penalty struck averagely is still a goal more often than not.
    expect(shotGoalProbability(0.6, 0.5, 'penalty')).toBeGreaterThan(0.5);
  });

  it('still exempts set pieces from the open-play quality gradient', () => {
    // A named, fixed situation has no "how good was this chance" to read.
    for (const situation of ['penalty', 'cornerAttack', 'freeKickDirect'] as const) {
      expect(shotGoalProbability(0.7, 0.1, situation)).toBe(
        shotGoalProbability(0.7, 0.9, situation),
      );
    }
    // Open play does read it.
    expect(shotGoalProbability(0.7, 0.9, 'oneOnOne')).toBeGreaterThan(
      shotGoalProbability(0.7, 0.1, 'oneOnOne'),
    );
  });

  it('leaves open play on its own midpoint', () => {
    expect(GOAL_CURVE.midpoint).toBe(0.74);
  });
});

describe('how hard a ball is to complete', () => {
  const clear = 0;
  const pressed = 1;

  it('makes a cross much harder than a pass, everywhere', () => {
    for (const third of ['attacking', 'middle', 'defensive'] as const) {
      expect(passCompletionBar(true, third, clear)).toBeGreaterThan(
        passCompletionBar(false, third, clear),
      );
    }
  });

  it('makes the final third harder than midfield', () => {
    // The inversion this fixed: the model was hardest where football is easiest.
    expect(passCompletionBar(false, 'attacking', clear)).toBeGreaterThan(
      passCompletionBar(false, 'middle', clear),
    );
    expect(passCompletionBar(false, 'middle', clear)).toBe(
      passCompletionBar(false, 'defensive', clear),
    );
  });

  it('makes a marked man play a worse ball than a free one', () => {
    expect(passCompletionBar(false, 'attacking', pressed)).toBeGreaterThan(
      passCompletionBar(false, 'attacking', clear),
    );
  });

  it('keeps every bar inside the value range a pass can actually reach', () => {
    for (const isCross of [true, false]) {
      for (const third of ['attacking', 'middle', 'defensive'] as const) {
        for (const pressure of [0, 0.5, 1]) {
          const bar = passCompletionBar(isCross, third, pressure);
          expect(bar).toBeGreaterThan(0.2);
          expect(bar).toBeLessThan(0.85);
        }
      }
    }
  });

  it('is a cross penalty, not a cross prohibition', () => {
    // Crosses were completing 51-66% against a real 20-25%. Overcorrecting to
    // near-zero would have made every crossing option a dead slot on the grid —
    // measured at 3.6% on the first calibration pass, which is why the penalty
    // came back down.
    expect(PASS_BAR.cross).toBeGreaterThan(0.04);
    expect(PASS_BAR.cross).toBeLessThan(0.14);
  });
});
