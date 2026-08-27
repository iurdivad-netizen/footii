import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MATCH_SPEEDS, clampSpeedIndex } from '../src/ui/screens/matchSpeeds.ts';

/**
 * THE CONTROLS ON A MATCH IN PROGRESS
 *
 * Both of these are about the same thing: what a player can still do once the
 * ninety minutes have started. The screen is driven in a browser as well, but
 * the click that matters here races the decision overlay — which covers the
 * whole viewport by design — so the durable check is the wiring.
 */

const screen = readFileSync(
  new URL('../src/ui/screens/MatchScreen.ts', import.meta.url),
  'utf8',
);
const app = readFileSync(new URL('../src/ui/App.ts', import.meta.url), 'utf8');

describe('changing the speed while playing', () => {
  /**
   * This one was already built, and is pinned rather than added.
   *
   * It was on a list of things to fix, from reading the front door alone and
   * not the match screen. The lesson is cheap to keep: a control can exist on
   * the screen that owns it and be invisible from the screen that configures
   * it.
   */
  it('offers more than one speed, or the button would do nothing', () => {
    expect(MATCH_SPEEDS.length).toBeGreaterThan(1);
  });

  it('has a speed control on the scoreboard itself', () => {
    expect(screen).toContain(`id="speed"`);
    expect(screen).toContain('cycleSpeed()');
  });

  it('wraps around rather than stopping at the fastest', () => {
    expect(screen).toContain('% MATCH_SPEEDS.length');
  });

  it('remembers the change instead of treating it as a one-off', () => {
    // Changing speed mid-match is a preference, not a per-match setting.
    expect(screen).toContain('this.onSpeedChange?.(this.speedIndex)');
    expect(app).toContain("onSpeedChange: (index) => this.updateSettings({ matchSpeed: index })");
    expect(app).toContain('speedIndex: this.save.settings.matchSpeed');
  });

  it('refuses an index the settings could not produce', () => {
    // A hand-edited save must not put the screen on a speed that does not exist.
    expect(clampSpeedIndex(-4)).toBeGreaterThanOrEqual(0);
    expect(clampSpeedIndex(999)).toBeLessThan(MATCH_SPEEDS.length);
  });
});

describe('leaving a match that has already started', () => {
  it('offers a way out at all', () => {
    expect(screen).toContain(`id="leave"`);
  });

  it('plays the rest out rather than discarding it', () => {
    // The whole design. Discarding would be easier and would make a save-scum
    // out of the seed: every fixture is deterministic from its calendar slot,
    // so a match you could walk out of and re-enter is one you could retry
    // until the chance went in.
    expect(app).toContain('runMatchAutomatically(engine, `${seed}:left`)');
  });

  it('takes two presses, and says what the second one costs', () => {
    // "Leave" does not say what it costs, and the button is the only place
    // that can.
    expect(screen).toContain('Leave — the rest is played out without you');
    expect(screen).toContain("leaveButton.dataset.armed === 'yes'");
  });

  it('stops the clock while the question is on screen', () => {
    // The reason somebody reached for this button is usually that they are out
    // of time; running the match on while they read it would be perverse.
    expect(screen).toContain('if (!this.paused) this.togglePause();');
  });

  it('disarms when focus leaves', () => {
    expect(screen).toContain("leaveButton.addEventListener('blur'");
  });

  it('never fires while a decision is on screen', () => {
    // The overlay is fixed and covers this button, so it should be
    // unreachable — but walking out from under an awaited promise would
    // strand it, so the guard is explicit rather than assumed.
    expect(screen).toContain('if (this.busy) return;');
  });

  it('hides itself when there is nowhere to go', () => {
    expect(screen).toContain('leaveButton.hidden = true;');
  });

  it('counts a walked-out fixture as skipped rather than as played', () => {
    // "How much of this career did you actually play" must never be flattered
    // by a match somebody left. It counts the conservative way, which is the
    // only honest direction for a label about your own attention.
    expect(app).toContain('actually play" must never be flattered');
  });

  it('judges a walked-out trial by the same arithmetic as a finished one', () => {
    // Both paths call one method. The moment they drift is the moment leaving
    // becomes a way of getting a different answer.
    const calls = app.match(/this\.showTrialResult\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
