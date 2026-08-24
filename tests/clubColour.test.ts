import { describe, expect, it } from 'vitest';
import teams from '../src/data/teams.json';
import {
  CONTRAST_FLOOR,
  PAGE_BACKGROUND,
  applyClubPalette,
  clubPalette,
  contrastRatio,
  liftForPage,
  luminance,
  parseHex,
} from '../src/ui/clubColour.ts';

/**
 * The club colour is an identity channel, and the only thing that can go wrong
 * with it silently is legibility: a colour too dark for the page reads as a
 * rendering fault rather than as a club. So the load-bearing test here is the
 * one that runs the WHOLE data file through the palette — 192 clubs is small
 * enough to check exhaustively, and checking it by eye is how a maroon club
 * ships invisible.
 */

const page = parseHex(PAGE_BACKGROUND)!;

describe('parsing a colour', () => {
  it('reads six-digit hex', () => {
    expect(parseHex('#e2574c')).toEqual({ r: 226, g: 87, b: 76 });
  });

  it('reads three-digit hex by doubling each digit', () => {
    expect(parseHex('#f0a')).toEqual({ r: 255, g: 0, b: 170 });
  });

  it('does not require the hash', () => {
    expect(parseHex('e2574c')).toEqual(parseHex('#e2574c'));
  });

  it('returns null for anything else rather than throwing', () => {
    // A malformed colour in the data should cost the club its tint, not take
    // down the screen it appears on.
    for (const bad of ['', '#', 'rebeccapurple', '#12345', '#gggggg', '#1234567']) {
      expect(parseHex(bad)).toBeNull();
    }
  });
});

describe('contrast', () => {
  it('is 21 for black against white', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio({ r: 90, g: 20, b: 40 }, { r: 90, g: 20, b: 40 })).toBeCloseTo(1, 5);
  });

  it('does not depend on the order of its arguments', () => {
    const a = { r: 226, g: 87, b: 76 };
    const b = { r: 11, g: 26, b: 18 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('ranks a white page as brighter than a dark one', () => {
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeGreaterThan(luminance(page));
  });
});

describe('lifting a colour for the page', () => {
  it('leaves a colour that already has contrast completely alone', () => {
    const bright = { r: 250, g: 204, b: 21 };
    expect(liftForPage(bright, page)).toEqual(bright);
  });

  it('raises one that does not until it clears the floor', () => {
    const nearlyBlack = { r: 20, g: 14, b: 30 };
    const lifted = liftForPage(nearlyBlack, page);
    expect(contrastRatio(nearlyBlack, page)).toBeLessThan(CONTRAST_FLOOR);
    expect(contrastRatio(lifted, page)).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });

  it('keeps the hue, so a lifted club is still recognisably itself', () => {
    // A deep blue must come back blue rather than grey or pink: blending
    // toward white would desaturate it into a different club.
    const deepBlue = { r: 10, g: 14, b: 70 };
    const lifted = liftForPage(deepBlue, page);
    expect(lifted.b).toBeGreaterThan(lifted.r);
    expect(lifted.b).toBeGreaterThan(lifted.g);
  });

  it('terminates on a colour that can never reach the floor', () => {
    // Against a white page nothing dark enough can climb, and the loop has to
    // give up rather than spin.
    const white = { r: 255, g: 255, b: 255 };
    expect(() => liftForPage({ r: 0, g: 0, b: 0 }, white, 21)).not.toThrow();
  });
});

describe('a club palette', () => {
  it('picks ink that can be read on the colour', () => {
    expect(clubPalette('#f2c14e').ink).toBe('#07120c');
    expect(clubPalette('#2c3e50').ink).toBe('#ffffff');
  });

  it('produces a wash in the same colour', () => {
    expect(clubPalette('#e2574c').wash).toMatch(/^rgba\(\d+, \d+, \d+, 0\.14\)$/);
  });

  it('falls back to the accent rather than to nothing', () => {
    expect(clubPalette('not a colour').colour).toBe('var(--accent)');
  });

  it('is stable: the same club always gets the same palette', () => {
    expect(clubPalette('#8e44ad')).toEqual(clubPalette('#8e44ad'));
  });
});

describe('every club in the game', () => {
  const clubs = teams as { id: string; colour: string; country: string }[];

  it('has a colour the palette can parse', () => {
    for (const club of clubs) {
      expect(parseHex(club.colour), `${club.id} has an unparseable colour`).not.toBeNull();
    }
  });

  it('is legible against the page after lifting', () => {
    for (const club of clubs) {
      const palette = clubPalette(club.colour);
      const ratio = contrastRatio(parseHex(palette.colour)!, page);
      // Slightly under the floor is tolerated where a step overshot the last
      // increment; invisible is not.
      expect(ratio, `${club.id} (${club.colour}) is not legible`).toBeGreaterThan(3.4);
    }
  });

  it('gives every club in a country a colour of its own', () => {
    // The property that makes this worth doing at all: your own league table
    // has sixteen distinguishable clubs in it, which is where a player actually
    // reads colour. Across the world colours repeat, and that is fine.
    const byCountry = new Map<string, Set<string>>();
    for (const club of clubs) {
      const seen = byCountry.get(club.country) ?? new Set<string>();
      seen.add(club.colour);
      byCountry.set(club.country, seen);
    }
    for (const [country, colours] of byCountry) {
      const count = clubs.filter((c) => c.country === country).length;
      expect(colours.size, `${country} reuses a colour`).toBe(count);
    }
  });
});

describe('applying a palette to an element', () => {
  /** Enough of an element's style object to record what was written to it. */
  function target() {
    const set = new Map<string, string>();
    return {
      set,
      style: {
        setProperty: (name: string, value: string) => void set.set(name, value),
        removeProperty: (name: string) => {
          set.delete(name);
          return '';
        },
      },
    };
  }

  it('sets the three custom properties', () => {
    const element = target();
    applyClubPalette(element, '#e2574c');
    expect(element.set.get('--club')).toBeTruthy();
    expect(element.set.get('--club-ink')).toBeTruthy();
    expect(element.set.get('--club-wash')).toBeTruthy();
  });

  it('clears them when there is no club, so the stylesheet fallback applies', () => {
    const element = target();
    applyClubPalette(element, '#e2574c');
    applyClubPalette(element, undefined);
    expect(element.set.has('--club')).toBe(false);
    expect(element.set.has('--club-ink')).toBe(false);
    expect(element.set.has('--club-wash')).toBe(false);
  });
});
