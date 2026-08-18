import { describe, expect, it } from 'vitest';
import { FAMILY_STYLE, LEGEND_ORDER, familyStyle } from '../src/ui/actionFamilyStyle.ts';
import { ACTION_CATALOGUE } from '../src/data/actionCatalogue.ts';
import type { ActionFamily } from '../src/core/events/types.ts';

describe('action family colours', () => {
  it('covers every family used by the action catalogue', () => {
    // Guards against adding an action family and forgetting to colour it,
    // which would leave those options untinted and untagged.
    const used = new Set<ActionFamily>(
      Object.values(ACTION_CATALOGUE).map((definition) => definition.family),
    );
    for (const family of used) {
      expect(FAMILY_STYLE[family], `no style for "${family}"`).toBeDefined();
      expect(familyStyle(family).tag.length).toBeGreaterThan(1);
      expect(familyStyle(family).colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('lists every styled family in the legend order, exactly once', () => {
    expect([...LEGEND_ORDER].sort()).toEqual(
      (Object.keys(FAMILY_STYLE) as ActionFamily[]).sort(),
    );
    expect(new Set(LEGEND_ORDER).size).toBe(LEGEND_ORDER.length);
  });

  it('gives every family a distinct colour and tag, or the coding is useless', () => {
    const colours = Object.values(FAMILY_STYLE).map((s) => s.colour.toLowerCase());
    const tags = Object.values(FAMILY_STYLE).map((s) => s.tag);
    expect(new Set(colours).size).toBe(colours.length);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('keeps the tags short enough to sit on a button', () => {
    for (const style of Object.values(FAMILY_STYLE)) {
      expect(style.tag.length).toBeLessThanOrEqual(5);
      expect(style.tag).toBe(style.tag.toUpperCase());
    }
  });

  it('uses the colours asked for: shots red, passes blue, defending white', () => {
    // Sanity-check the hues rather than exact values, so they can be nudged.
    const hex = (c: string) => ({
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
    });
    const shot = hex(FAMILY_STYLE.shot.colour);
    expect(shot.r).toBeGreaterThan(shot.g + 60);
    expect(shot.r).toBeGreaterThan(shot.b + 60);

    const pass = hex(FAMILY_STYLE.pass.colour);
    expect(pass.b).toBeGreaterThan(pass.r + 40);

    const defend = hex(FAMILY_STYLE.defend.colour);
    expect(Math.min(defend.r, defend.g, defend.b)).toBeGreaterThan(200);
  });
});
