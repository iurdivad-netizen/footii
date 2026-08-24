/**
 * HOW THE HUB IS DIVIDED, AND WHY IT IS DIVIDED ONCE
 *
 * A mature career renders SIXTEEN cards on the hub — everything from the next
 * fixture to the season-by-season history — in one flat grid, every week, all
 * shouting at the same volume. On a phone that was three and a half thousand
 * pixels of scrolling; on a desktop it was rows stretched to their tallest card
 * and a great deal of empty panel underneath the short ones.
 *
 * The fix is not fewer cards. Every one of them earns its place at some point
 * in a season; the problem is that only four of them earn it EVERY week. So
 * four stay pinned — the last result, what just happened, the next match, and
 * the week — and the other twelve go into four named sections.
 *
 * TWO LAYOUTS, ONE DIVISION. The sections can be shown as tabs or as folds, and
 * that is a player setting rather than a decision taken here. What matters is
 * that the DIVISION is defined exactly once, in this file: two layouts that
 * disagreed about which card belongs where would be two hubs, and the second
 * one would drift.
 *
 * EVERY SECTION CARRIES A PEEK. A tab that reads `Club · 1st · 3 yrs left` tells
 * you whether to open it without opening it, which is the one thing tabs
 * otherwise cost you against a flat page. The folds get the same line for the
 * same reason: a shut section that says nothing is a section you have to open
 * to find out whether it was worth opening.
 */

export type HubSectionId = 'you' | 'club' | 'competitions' | 'career';

export interface HubSection {
  id: HubSectionId;
  label: string;
  /**
   * A few words on what is inside, shown beside the label.
   *
   * Built by the screen from the live career, because it is the whole point:
   * a peek assembled from anything other than the actual contents would be a
   * decoration that happened to look like information.
   */
  peek: string;
  /** The rendered cards. Empty sections are dropped before this is used. */
  html: string;
}

export const HUB_SECTION_IDS: readonly HubSectionId[] = [
  'you',
  'club',
  'competitions',
  'career',
];

export const HUB_SECTION_LABELS: Record<HubSectionId, string> = {
  you: 'You',
  club: 'Club',
  competitions: 'Competitions',
  career: 'Career',
};

/**
 * The two shapes the sections can take.
 *
 * `tabs` shows one section at a time behind a tab bar; `folds` shows all four
 * as collapsible rows. They are offered as a choice rather than settled here
 * because the trade is genuinely a matter of taste — tabs are shorter and cost
 * a navigation model, folds are longer and cost nothing to learn — and neither
 * answer is right for everybody.
 */
export type HubLayout = 'tabs' | 'folds';

export const HUB_LAYOUT_LABELS: Record<HubLayout, string> = {
  tabs: 'Tabs — one section at a time, shortest page',
  folds: 'Folds — all sections listed, open the ones you want',
};

export const HUB_LAYOUTS: readonly HubLayout[] = ['tabs', 'folds'];

/** Is this a layout this version knows how to render? */
export function isHubLayout(value: unknown): value is HubLayout {
  return value === 'tabs' || value === 'folds';
}

export function isHubSectionId(value: unknown): value is HubSectionId {
  return HUB_SECTION_IDS.includes(value as HubSectionId);
}

/**
 * The tab bar, and the section it is showing.
 *
 * `open` is the sections the player has left open. In tabs it is read as "the
 * one to show", and a value naming a section that does not exist this week —
 * a career with no honours yet has no Career section — falls back to the first
 * one there is rather than showing an empty screen.
 */
export function renderHubTabs(sections: readonly HubSection[], open: readonly string[]): string {
  if (sections.length === 0) return '';
  const wanted = sections.find((section) => open.includes(section.id)) ?? sections[0]!;

  const tabs = sections
    .map(
      (section) => `
        <button
          type="button"
          class="hub-tab"
          role="tab"
          id="hub-tab-${section.id}"
          aria-controls="hub-panel-${section.id}"
          aria-selected="${section.id === wanted.id}"
          data-hub-tab="${section.id}"
        >
          <span class="hub-tab-label">${section.label}</span>
          ${section.peek ? `<span class="hub-tab-peek">${section.peek}</span>` : ''}
        </button>`,
    )
    .join('');

  const panels = sections
    .map(
      (section) => `
        <div
          class="hub-panel"
          id="hub-panel-${section.id}"
          role="tabpanel"
          aria-labelledby="hub-tab-${section.id}"
          ${section.id === wanted.id ? '' : 'hidden'}
        >${section.html}</div>`,
    )
    .join('');

  return `
    <div class="hub-tabs" role="tablist" aria-label="Career sections">${tabs}</div>
    ${panels}`;
}

/**
 * The same sections as folds.
 *
 * `<details>` rather than a hand-rolled toggle, so it opens without JavaScript,
 * is keyboard-operable for free, and is announced as a disclosure rather than
 * as a button that mysteriously changes the page.
 */
export function renderHubFolds(sections: readonly HubSection[], open: readonly string[]): string {
  return sections
    .map(
      (section) => `
        <details class="hub-fold" data-hub-fold="${section.id}" ${open.includes(section.id) ? 'open' : ''}>
          <summary>
            <span class="hub-fold-label">${section.label}</span>
            ${section.peek ? `<span class="hub-fold-peek">${section.peek}</span>` : ''}
          </summary>
          <div class="hub-fold-body">${section.html}</div>
        </details>`,
    )
    .join('');
}
