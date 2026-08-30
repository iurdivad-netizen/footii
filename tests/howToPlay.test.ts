import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DECISION_PACE_LABELS } from '../src/simulation/DecisionTimer.ts';
import type { DecisionPace } from '../src/simulation/DecisionTimer.ts';
import { MATCH_SPEEDS } from '../src/ui/screens/matchSpeeds.ts';
import { HUB_LAYOUTS, HUB_LAYOUT_LABELS } from '../src/ui/screens/hubSections.ts';
import { FAMILY_STYLE, LEGEND_ORDER } from '../src/ui/actionFamilyStyle.ts';
import { WEEK_CHOICES, WEEK_LABELS } from '../src/core/career/week.ts';

/**
 * THE MANUAL MUST NOT BE ABLE TO LIE.
 *
 * A page that explains the settings is only worth having while it agrees with
 * them, and the failure mode is silent: somebody adds a decision pace, nothing
 * breaks, no test fails, and the manual quietly describes a game that no longer
 * exists. Documentation that can drift is documentation that will, and the
 * drifted version is worse than none because it is confidently wrong.
 *
 * So the screen is BUILT from the same tables the game reads, and these check
 * that it still is — by reading the source and insisting the tables are what it
 * renders from, rather than by matching the strings it happens to produce
 * today.
 */

const source = readFileSync(
  new URL('../src/ui/screens/HowToPlayScreen.ts', import.meta.url),
  'utf8',
);

describe('the manual is generated rather than transcribed', () => {
  it('renders the decision paces from the table that defines them', () => {
    expect(source).toContain('DECISION_PACE_LABELS');
    // And no pace is written out by hand, which is how a table and a page start
    // disagreeing.
    for (const key of Object.keys(DECISION_PACE_LABELS) as DecisionPace[]) {
      const label = DECISION_PACE_LABELS[key];
      expect(source.includes(`>${label}<`)).toBe(false);
    }
  });

  it('renders the match speeds from the presets', () => {
    expect(source).toContain('MATCH_SPEEDS');
    for (const speed of MATCH_SPEEDS) {
      expect(source.includes(`>${speed.label}<`)).toBe(false);
    }
  });

  it('renders the hub layouts from the shared division', () => {
    expect(source).toContain('HUB_LAYOUT_LABELS');
    for (const layout of HUB_LAYOUTS) {
      expect(source.includes(HUB_LAYOUT_LABELS[layout])).toBe(false);
    }
  });

  it('renders the action families from the match legend', () => {
    // The colours especially: a key in approximately the right colour is worse
    // than no key at all, and hand-copied hex is how that happens.
    expect(source).toContain('FAMILY_STYLE');
    expect(source).toContain('LEGEND_ORDER');
    for (const family of LEGEND_ORDER) {
      expect(source.includes(FAMILY_STYLE[family].colour)).toBe(false);
    }
  });

  it('renders the week choices from the week model', () => {
    expect(source).toContain('WEEK_DESCRIPTIONS');
    for (const choice of WEEK_CHOICES) {
      expect(source.includes(`>${WEEK_LABELS[choice]}<`)).toBe(false);
    }
  });
});

describe('what the manual has to cover', () => {
  /**
   * The load-bearing subjects, checked by keyword rather than by wording.
   *
   * Deliberately loose: the point is that the page still ADDRESSES the thing,
   * not that it uses a sentence somebody once wrote. A test that pinned the
   * prose would be a test that made the prose unimprovable.
   */
  const subjects: [string, RegExp][] = [
    // The read the whole match is built around. A player who has not been told
    // about it is playing a different and much worse game.
    ['the keeper committing', /commits?\b/i],
    ['the keyboard', /<kbd>1<\/kbd>/],
    ['the debug panel', /<kbd>D<\/kbd>/],
    ['the hub sections', /peek/i],
    ['losing the save', /export/i],
    ['reduced motion', /reduce motion|reducing motion/i],
  ];

  for (const [subject, pattern] of subjects) {
    it(`explains ${subject}`, () => {
      expect(pattern.test(source)).toBe(true);
    });
  }
});

describe('the front door', () => {
  const menu = readFileSync(new URL('../src/ui/titleMenu.ts', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/ui/screens/HomeScreen.ts', import.meta.url), 'utf8');

  it('offers the manual as a menu entry rather than burying it in a fold', () => {
    // What this replaced: five bullets inside a collapsed <details>, below the
    // careers, the wall, the quick match, the settings and the save panel.
    // Folded, below the fold, and under five other sections is three separate
    // ways of being unread. It is one of four entries on the front door now.
    expect(menu).toContain("id: 'how'");
    expect(menu).toContain("label: 'How to play'");
  });

  it('does not offer it a second time from the careers page', () => {
    // The same guarantee from the other side: one route to the manual, not one
    // per screen. See ui/screens/HomeScreen.ts on why that page is careers
    // only.
    expect(home).not.toContain('open-how');
    expect(home).not.toContain('home-help"');
  });
});
