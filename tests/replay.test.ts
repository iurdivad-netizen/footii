import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  REPLAY_LABELS,
  REPLAY_SETTINGS,
  isReplaySetting,
  shouldReplay,
} from '../src/ui/replay.ts';
import { defaultSettings, migrate, emptyCareer, SAVE_VERSION } from '../src/persistence/storage.ts';

/**
 * THE REPLAY IS A CHOICE, NOT A RULE NOBODY CAN SEE.
 *
 * The resolution animation used to be governed entirely by
 * `prefers-reduced-motion`: correct as a default, wrong as the only option.
 * Somebody whose system asked for reduced motion got no replay, no way to turn
 * it on, and — the part that actually cost — nothing on screen saying why, so
 * a working feature was indistinguishable from a broken one. It was reported
 * as exactly that.
 */

describe('resolving the setting', () => {
  it('always replays on Always, whatever the system says', () => {
    expect(shouldReplay('on', true)).toBe(true);
    expect(shouldReplay('on', false)).toBe(true);
  });

  it('never replays on Never, whatever the system says', () => {
    expect(shouldReplay('off', true)).toBe(false);
    expect(shouldReplay('off', false)).toBe(false);
  });

  it('follows the browser on Follow, in both directions', () => {
    expect(shouldReplay('system', true)).toBe(false);
    expect(shouldReplay('system', false)).toBe(true);
  });

  it('names every setting it offers', () => {
    for (const setting of REPLAY_SETTINGS) {
      expect(REPLAY_LABELS[setting]).toBeTruthy();
    }
  });
});

describe('what a save carries', () => {
  it('defaults to following the browser, so accessibility still wins untouched', () => {
    expect(defaultSettings().replay).toBe('system');
  });

  it('gives a save written before the setting existed the default', () => {
    const migrated = migrate({ version: 1, career: emptyCareer() } as never)!;
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.settings.replay).toBe('system');
  });

  it('falls back rather than trusting a value this version has never heard of', () => {
    // A hand-edited or downgraded save must not be able to leave the game in a
    // state that matches no branch and silently never replays.
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careers: [null, null, null],
      settings: { ...defaultSettings(), replay: 'sometimes' },
    } as never)!;
    expect(migrated.settings.replay).toBe('system');
  });

  it('keeps a real choice through a migration', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careers: [null, null, null],
      settings: { ...defaultSettings(), replay: 'on' },
    } as never)!;
    expect(migrated.settings.replay).toBe('on');
  });

  it('recognises exactly the settings it offers', () => {
    for (const setting of REPLAY_SETTINGS) expect(isReplaySetting(setting)).toBe(true);
    for (const value of ['', 'reduce', 'true', null, undefined, 1]) {
      expect(isReplaySetting(value)).toBe(false);
    }
  });
});

describe('the screens that honour it', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('is asked by the overlay rather than the media query directly', () => {
    const overlay = read('../src/ui/components/EventOverlay.ts');
    expect(overlay).toMatch(/shouldReplay\(this\.replay\)/);
    // The old rule: a hardcoded media-query check with no way to override it.
    expect(overlay).not.toMatch(/prefers-reduced-motion/);
  });

  it('is applied from the saved settings', () => {
    expect(read('../src/ui/App.ts')).toMatch(/this\.overlay\.replay = this\.save\.settings\.replay/);
  });

  it('says on the settings screen which way Follow has currently gone', () => {
    // A three-way control that still did not report the system's answer would
    // have moved the mystery rather than solved it.
    const settings = read('../src/ui/screens/SettingsScreen.ts');
    expect(settings).toMatch(/prefersReducedMotion\(\)/);
    expect(settings).toMatch(/reduced motion/i);
  });
});
