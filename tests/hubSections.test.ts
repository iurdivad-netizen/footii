import { describe, expect, it } from 'vitest';
import type { HubSection } from '../src/ui/screens/hubSections.ts';
import {
  HUB_LAYOUTS,
  HUB_LAYOUT_LABELS,
  HUB_SECTION_IDS,
  HUB_SECTION_LABELS,
  isHubLayout,
  isHubSectionId,
  renderHubFolds,
  renderHubTabs,
} from '../src/ui/screens/hubSections.ts';

const SECTIONS: HubSection[] = [
  { id: 'you', label: 'You', peek: '2 goals in 4', html: '<div id="you"></div>' },
  { id: 'club', label: 'Club', peek: '1st · 3 yrs left', html: '<div id="club"></div>' },
  { id: 'career', label: 'Career', peek: '3 seasons', html: '<div id="career"></div>' },
];

/** Attributes on the element that owns `id`, for asserting on one panel at a time. */
function tagWith(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
}

describe('the sections themselves', () => {
  it('names every section it lists', () => {
    for (const id of HUB_SECTION_IDS) {
      expect(HUB_SECTION_LABELS[id]?.length, id).toBeGreaterThan(0);
    }
  });

  it('describes every layout it offers, because the setting is a sentence not a word', () => {
    // The picker on the home screen shows these strings and nothing else, so a
    // layout with a bare name would be a choice made blind.
    for (const layout of HUB_LAYOUTS) {
      expect(HUB_LAYOUT_LABELS[layout], layout).toMatch(/—/);
    }
  });

  it('recognises its own ids and refuses everything else', () => {
    // Both run over values out of a save file, which is a text file a player
    // can edit and an older version can have written.
    for (const id of HUB_SECTION_IDS) expect(isHubSectionId(id)).toBe(true);
    for (const layout of HUB_LAYOUTS) expect(isHubLayout(layout)).toBe(true);
    for (const junk of ['', 'accordion', 'You', null, undefined, 0, {}]) {
      expect(isHubSectionId(junk), String(junk)).toBe(false);
      expect(isHubLayout(junk), String(junk)).toBe(false);
    }
  });
});

describe('tabs', () => {
  it('shows exactly one panel', () => {
    const html = renderHubTabs(SECTIONS, ['club']);
    const hidden = SECTIONS.filter((section) => tagWith(html, `hub-panel-${section.id}`).includes('hidden'));
    expect(hidden.map((section) => section.id)).toEqual(['you', 'career']);
  });

  it('marks the shown tab selected, and only it', () => {
    const html = renderHubTabs(SECTIONS, ['club']);
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect(tagWith(html, 'hub-tab-club')).toContain('aria-selected="true"');
  });

  it('ties each tab to the panel it controls', () => {
    // Without this pairing a screen reader announces four buttons and four
    // regions and no relationship between them.
    const html = renderHubTabs(SECTIONS, ['you']);
    for (const section of SECTIONS) {
      expect(tagWith(html, `hub-tab-${section.id}`)).toContain(`aria-controls="hub-panel-${section.id}"`);
      expect(tagWith(html, `hub-panel-${section.id}`)).toContain(`aria-labelledby="hub-tab-${section.id}"`);
    }
  });

  it('falls back to the first tab when the remembered one is not there this week', () => {
    // A career with no honours has no Career section, and the setting outlives
    // the section: the saved choice can name something that no longer renders.
    const html = renderHubTabs(SECTIONS, ['competitions']);
    expect(tagWith(html, 'hub-tab-you')).toContain('aria-selected="true"');
    expect(tagWith(html, 'hub-panel-you')).not.toContain('hidden');
  });

  it('renders nothing at all rather than an empty tab bar', () => {
    expect(renderHubTabs([], ['you'])).toBe('');
  });

  it('carries every peek onto its tab', () => {
    const html = renderHubTabs(SECTIONS, ['you']);
    for (const section of SECTIONS) expect(html).toContain(section.peek);
  });

  it('leaves out the peek line entirely when there is nothing to peek at', () => {
    // An empty span still takes a line's worth of leading, so a section with
    // nothing to say would push the whole bar taller for no information.
    const html = renderHubTabs([{ id: 'you', label: 'You', peek: '', html: '' }], ['you']);
    expect(html).not.toContain('hub-tab-peek');
  });
});

describe('folds', () => {
  it('opens the ones the player left open and shuts the rest', () => {
    const html = renderHubFolds(SECTIONS, ['you', 'career']);
    const folds = html.split('<details').slice(1);
    expect(folds.length).toBe(3);
    expect(folds.filter((fold) => /^[^>]*\bopen\b/.test(fold)).length).toBe(2);
    expect(folds.find((fold) => fold.includes('data-hub-fold="club"'))).not.toMatch(/^[^>]*\bopen\b/);
  });

  it('renders every section, shut or not — that is the point of folds', () => {
    // Tabs hide three of four; folds hide nothing, they only collapse it. A
    // fold whose contents were omitted until opened would lose the browser's
    // find-in-page, which is half of why somebody picks this layout.
    const html = renderHubFolds(SECTIONS, []);
    for (const section of SECTIONS) expect(html).toContain(section.html);
  });

  it('uses a real disclosure element rather than a button that redraws the page', () => {
    const html = renderHubFolds(SECTIONS, ['you']);
    expect(html).toContain('<details');
    expect(html).toContain('<summary>');
  });

  it('says nothing when there is nothing to show', () => {
    expect(renderHubFolds([], ['you'])).toBe('');
  });
});

describe('the two layouts show the same career', () => {
  it('renders identical section contents, so the choice is presentation only', () => {
    // The division is defined once and drawn twice on purpose. If a card could
    // reach one layout and not the other, the setting would be a difficulty
    // level rather than a preference.
    const tabs = renderHubTabs(SECTIONS, ['you']);
    const folds = renderHubFolds(SECTIONS, ['you']);
    for (const section of SECTIONS) {
      expect(tabs, section.id).toContain(section.html);
      expect(folds, section.id).toContain(section.html);
      expect(tabs, section.id).toContain(section.label);
      expect(folds, section.id).toContain(section.label);
    }
  });
});
