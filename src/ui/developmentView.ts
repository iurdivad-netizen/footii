import type { AttributeKey } from '../core/player/attributes.ts';
import { ATTRIBUTE_GROUPS } from '../core/player/attributes.ts';
import type { AttributeChange, AttributeTimeline } from '../core/career/attributeTimeline.ts';
import { attributeChanges, biggestMovers, seasonRows } from '../core/career/attributeTimeline.ts';

/**
 * THE DEVELOPMENT VIEW — a footballer across a career, as markup.
 *
 * Builders that return strings and plain geometry rather than DOM, so the parts
 * that can be wrong — a scale, a label that would collide, a sign, a sentence —
 * are tested without a browser. The panel that owns the DOM is in
 * components/DevelopmentPanel.ts and only wires events to what is here.
 *
 * THE FORM FOLLOWS THE JOB, and each choice is a rejected alternative:
 *
 *   ABILITY OVER TIME is a line. One series, one hue, so no legend box: the
 *   heading says what it is.
 *
 *   THE DECISION WINDOW IS NOT ON THAT CHART. It is seconds and ability is a
 *   rating, so putting both on one plot needs two y-axes, and two axes let the
 *   chart invent a correlation by where it draws them. It gets its own tile with
 *   its own sparkline.
 *
 *   TWENTY ATTRIBUTES are "before and after, per item", which is a dumbbell, not
 *   twenty lines: two dots and the distance between them, on one shared 0-99
 *   scale so a row of Pace can be compared with a row of Finishing. Twenty
 *   overlapping trajectories would be a hairball nobody could read.
 *
 * START AND NOW ARE TOLD APART BY MORE THAN COLOUR: start is a hollow ring and
 * now is filled. They are two greens, and under colour blindness two greens are
 * nearly one — so the shape carries what the hue cannot.
 *
 * EVERYTHING IS READABLE WITHOUT THE TOOLTIP. A tooltip enhances; the table view
 * and the per-row labels carry every value.
 */

/** Text that came from data — a name a player typed, a club — never becomes markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A signed change: +18, −6 (a real minus, not a hyphen), 0. */
export function signed(value: number, digits = 0): string {
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return digits > 0 ? (0).toFixed(digits) : '0';
  return `${value > 0 ? '+' : '−'}${fixed}`;
}

export interface Domain {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * A y-scale with clean numbers on it.
 *
 * Rounded out to multiples of `step` and never narrower than `minSpan`, so a
 * career that moved two points does not fill the whole chart with two points'
 * worth of wobble and read as a collapse.
 */
export function niceDomain(values: readonly number[], step = 5, minSpan = 10): Domain {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  if (max - min < minSpan) {
    const grow = minSpan - (max - min);
    // Split the growth, but never below zero: ability is not negative.
    min = Math.max(0, min - Math.ceil(grow / 2 / step) * step);
    max = Math.max(max, min + minSpan);
  }
  // Three to five ticks.
  const span = max - min;
  const tickStep = span <= 20 ? 5 : span <= 40 ? 10 : span <= 80 ? 20 : 25;
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / tickStep) * tickStep; tick <= max; tick += tickStep) {
    ticks.push(tick);
  }
  return { min, max, ticks };
}

/**
 * Which x-axis labels to draw.
 *
 * The last is always drawn — it is "Now" — and the ones before it are thinned by
 * a step so that none sits within a step of it. A label that would collide is
 * dropped, not squeezed: a crowded axis is worse than a sparse one.
 */
export function axisLabelIndexes(count: number, maxLabels = 9): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil(count / maxLabels);
  const last = count - 1;
  const shown: number[] = [];
  for (let i = 0; i < last; i += step) {
    if (last - i >= step) shown.push(i);
  }
  shown.push(last);
  return shown;
}

/** Up to `max` indexes spread evenly across `count`, always including both ends. */
export function evenSample(count: number, max: number): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const picked = new Set<number>();
  for (let i = 0; i < max; i++) picked.add(Math.round((i * (count - 1)) / (max - 1)));
  return [...picked].sort((a, b) => a - b);
}

export interface Tip {
  title: string;
  rows: { label: string; value: string; strong?: boolean }[];
}

export interface DevelopmentInput {
  name: string;
  positionLabel: string;
  keyKeys: ReadonlySet<AttributeKey>;
  timeline: AttributeTimeline;
  /** The benchmark decision window at each point, in seconds. */
  windows: readonly number[];
  clubName: (id: string) => string;
  filter: 'all' | 'key';
  view: 'chart' | 'table';
  /** Draw the line chart for a narrow screen. See WIDE and COMPACT. */
  compact?: boolean;
}

export interface RenderedDevelopment {
  html: string;
  /** Tooltip content, keyed by the `data-tip` on the element that shows it. */
  tips: Record<string, Tip>;
  /** How many points the line chart has, for keyboard stepping. */
  chartPoints: number;
}

// ------------------------------------------------------------- sparkline ---

/**
 * A twelve-point-style sparkline: the history in the de-emphasis colour, the
 * latest step in the accent, and a marked end. No axes and no labels — it says
 * "which way", and the number beside it says how far.
 */
export function renderSparkline(values: readonly number[], width = 120, height = 34): string {
  if (values.length < 2) return '';
  const pad = 5;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const xs = values.map((_, i) => pad + (i * (width - pad * 2)) / (values.length - 1));
  const ys = values.map((v) => height - pad - ((v - lo) / span) * (height - pad * 2));
  const path = (from: number, to: number) =>
    xs
      .slice(from, to + 1)
      .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[from + i]!.toFixed(1)}`)
      .join(' ');
  const last = values.length - 1;
  return `<svg class="dev-spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">
      <path class="dev-spark-history" d="${path(0, last)}" />
      <path class="dev-spark-now" d="${path(last - 1, last)}" />
      <circle class="dev-spark-ring" cx="${xs[last]!.toFixed(1)}" cy="${ys[last]!.toFixed(1)}" r="6" />
      <circle class="dev-spark-end" cx="${xs[last]!.toFixed(1)}" cy="${ys[last]!.toFixed(1)}" r="4" />
    </svg>`;
}

// ------------------------------------------------------------------ tiles ---

function deltaClass(delta: number): string {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
}

function renderTiles(input: DevelopmentInput): string {
  const { points } = input.timeline;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const since = `since ${first.label.toLowerCase()}`;
  const abilityDelta = last.ability - first.ability;
  const windowDelta = input.windows[input.windows.length - 1]! - input.windows[0]!;
  const seasons = points.filter((point) => point.kind === 'season-end').length;

  return `<div class="dev-tiles">
      <div class="dev-tile">
        <span class="dev-tile-label">Overall ability</span>
        <span class="dev-tile-value">${last.ability}</span>
        <span class="dev-tile-delta ${deltaClass(abilityDelta)}">${abilityDelta === 0 ? 'No change' : signed(abilityDelta)} ${since}</span>
      </div>
      <div class="dev-tile">
        <span class="dev-tile-label">Decision window</span>
        <span class="dev-tile-value">${input.windows[input.windows.length - 1]!.toFixed(2)}s</span>
        <span class="dev-tile-delta ${deltaClass(windowDelta)}">${Math.abs(windowDelta) < 0.005 ? 'No change' : `${signed(windowDelta, 2)}s`} ${since}</span>
        ${renderSparkline(input.windows)}
      </div>
      <div class="dev-tile">
        <span class="dev-tile-label">Seasons on record</span>
        <span class="dev-tile-value">${seasons}</span>
        <span class="dev-tile-delta flat">age ${first.age} to ${last.age}</span>
      </div>
    </div>`;
}

// ------------------------------------------------------------ line chart ---

/**
 * TWO SIZES OF CHART, because the drawing is scaled to its container.
 *
 * An SVG's text is sized in the units of its viewBox, so a chart drawn 640 wide
 * and shown 320 wide has its 11px axis labels at 5.5px — legible on a desktop and
 * a smudge on a phone. The compact layout is drawn at roughly the width it will
 * be shown, so its text is close to the size it says it is, and it carries fewer
 * labels because there is less room for them.
 */
const WIDE = { width: 640, height: 250, left: 38, right: 48, top: 16, bottom: 46 } as const;
const COMPACT = { width: 360, height: 240, left: 34, right: 40, top: 16, bottom: 46 } as const;
const dims = (compact: boolean) => (compact ? COMPACT : WIDE);

/** Where each point sits, for the line and for the hit areas. */
export function chartLayout(
  count: number,
  compact = false,
): { xs: number[]; plotWidth: number; plotHeight: number } {
  const CHART = dims(compact);
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const xs = Array.from({ length: count }, (_, i) =>
    count === 1 ? CHART.left + plotWidth / 2 : CHART.left + (i * plotWidth) / (count - 1),
  );
  return { xs, plotWidth, plotHeight };
}

function renderAbilityChart(input: DevelopmentInput, tips: Record<string, Tip>): string {
  const { points } = input.timeline;
  const compact = input.compact ?? false;
  const CHART = dims(compact);
  const values = points.map((point) => point.ability);
  const domain = niceDomain(values);
  const { xs, plotWidth, plotHeight } = chartLayout(points.length, compact);
  const y = (value: number) =>
    CHART.top + plotHeight - ((value - domain.min) / (domain.max - domain.min)) * plotHeight;
  const baseline = CHART.top + plotHeight;

  const line = points
    .map((_, i) => `${i === 0 ? 'M' : 'L'}${xs[i]!.toFixed(1)} ${y(values[i]!).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${xs[xs.length - 1]!.toFixed(1)} ${baseline} L${xs[0]!.toFixed(1)} ${baseline} Z`;

  const grid = domain.ticks
    .map(
      (tick) => `<line class="dev-grid" x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" />
        <text class="dev-axis" x="${CHART.left - 8}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${tick}</text>`,
    )
    .join('');

  const labelled = new Set(axisLabelIndexes(points.length, compact ? 5 : 9));
  const xLabels = points
    .map((point, i) =>
      labelled.has(i)
        ? `<text class="dev-axis" x="${xs[i]!.toFixed(1)}" y="${baseline + 18}" text-anchor="middle">${escapeHtml(point.short)}</text>
           <text class="dev-axis dev-axis-faint" x="${xs[i]!.toFixed(1)}" y="${baseline + 33}" text-anchor="middle">${point.age}y</text>`
        : '',
    )
    .join('');

  // Two dots per point: a surface-coloured ring underneath and the accent above,
  // so a dot stays legible where it crosses the line.
  const markers = points
    .map(
      (_, i) => `<circle class="dev-ring" cx="${xs[i]!.toFixed(1)}" cy="${y(values[i]!).toFixed(1)}" r="7" />
        <circle class="dev-marker" data-marker="${i}" cx="${xs[i]!.toFixed(1)}" cy="${y(values[i]!).toFixed(1)}" r="5" />`,
    )
    .join('');

  // Only the ends are labelled: the extremes carry the story and the rest is the
  // tooltip's, and a number beside every dot goes unread.
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const endLabels = `<text class="dev-value" x="${xs[0]!.toFixed(1)}" y="${(y(first.ability) - 12).toFixed(1)}" text-anchor="${points.length > 1 ? 'start' : 'middle'}">${first.ability}</text>
      ${
        points.length > 1
          ? `<text class="dev-value" x="${(xs[xs.length - 1]! + 12).toFixed(1)}" y="${(y(last.ability) + 4).toFixed(1)}" text-anchor="start">${last.ability}</text>`
          : ''
      }`;

  // The hit areas: a full-height column per point, at least 24px wide, so the
  // pointer aims at a season and not at a two-pixel line.
  const columnWidth = Math.max(24, points.length > 1 ? plotWidth / (points.length - 1) : plotWidth);
  const hits = points
    .map((point, i) => {
      const id = `a${i}`;
      const rows: Tip['rows'] = [
        { label: 'Overall ability', value: String(point.ability), strong: true },
        { label: 'Age', value: String(point.age) },
        { label: 'Decision window', value: `${input.windows[i]!.toFixed(2)}s` },
      ];
      if (point.clubId) rows.push({ label: 'Club', value: input.clubName(point.clubId) });
      tips[id] = { title: point.label, rows };
      return `<rect class="dev-hit" data-tip="${id}" data-index="${i}" x="${(xs[i]! - columnWidth / 2).toFixed(1)}" y="${CHART.top}" width="${columnWidth.toFixed(1)}" height="${plotHeight}" />`;
    })
    .join('');

  const summary = `Overall ability went from ${first.ability} at ${first.label.toLowerCase()} to ${last.ability} now, across ${points.length} recorded points.`;

  return `<svg class="dev-chart" viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-label="${escapeHtml(summary)}">
      ${grid}
      <path class="dev-area" d="${area}" />
      <path class="dev-line" d="${line}" />
      <line class="dev-cross" x1="0" x2="0" y1="${CHART.top}" y2="${baseline}" hidden />
      ${markers}
      ${endLabels}
      ${xLabels}
      ${hits}
    </svg>`;
}

// -------------------------------------------------------------- dumbbells ---

/** The sentence above the rows: who moved most, in words. */
export function moversSentence(changes: readonly AttributeChange[]): string {
  const { gained, slipped } = biggestMovers(changes);
  const list = (items: AttributeChange[]) =>
    items.map((item) => `${item.label} ${signed(item.delta)}`).join(', ');
  const parts = [
    gained.length ? `Biggest gains: ${list(gained)}.` : '',
    slipped.length ? `Slipped: ${list(slipped)}.` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : 'No attribute has moved yet.';
}

/** A change's words for a screen reader, which cannot see the two dots. */
export function changeSentence(change: AttributeChange, startLabel: string): string {
  const movement =
    change.delta === 0
      ? 'unchanged'
      : change.delta > 0
        ? `up ${change.delta}`
        : `down ${Math.abs(change.delta)}`;
  return `${change.label}: ${change.start} at ${startLabel.toLowerCase()}, ${change.now} now, ${movement}`;
}

function renderDumbbells(
  input: DevelopmentInput,
  changes: readonly AttributeChange[],
  tips: Record<string, Tip>,
): string {
  const { points } = input.timeline;
  const startLabel = points[0]!.label;
  const shown = (change: AttributeChange) =>
    input.filter === 'all' || input.keyKeys.has(change.key);

  const groups = ATTRIBUTE_GROUPS.map((group) => {
    const rows = changes.filter((change) => change.group === group.label && shown(change));
    if (rows.length === 0) return '';
    const body = rows
      .map((change) => {
        const id = `r${change.key}`;
        const sample = evenSample(points.length, 10);
        tips[id] = {
          title: change.label,
          rows: sample.map((i) => ({
            label: points[i]!.label,
            value: String(change.series[i]),
            strong: i === points.length - 1,
          })),
        };
        const low = Math.min(change.start, change.now);
        const isKey = input.keyKeys.has(change.key);
        return `<div class="dev-row" role="listitem" tabindex="0" data-tip="${id}" aria-label="${escapeHtml(changeSentence(change, startLabel))}">
            <span class="dev-name">${escapeHtml(change.label)}${isKey ? ' <em class="dev-key">key</em>' : ''}</span>
            <span class="dev-track">
              <i class="dev-conn" style="left:${low}%;width:${Math.abs(change.delta)}%"></i>
              <i class="dev-dot dev-start" style="left:${change.start}%"></i>
              <i class="dev-dot dev-now" style="left:${change.now}%"></i>
            </span>
            <span class="dev-values"><span>${change.start} → ${change.now}</span><b class="dev-delta ${deltaClass(change.delta)}">${signed(change.delta)}</b></span>
          </div>`;
      })
      .join('');
    return `<section class="dev-group" aria-label="${group.label}">
        <h4>${group.label}</h4>
        <div role="list">${body}</div>
      </section>`;
  }).join('');

  const scale = [0, 25, 50, 75, 100]
    .map((tick) => `<span style="left:${tick}%">${tick}</span>`)
    .join('');

  return `<div class="dev-legend" aria-hidden="true">
      <span><i class="dev-dot dev-start"></i>${escapeHtml(startLabel)}</span>
      <span><i class="dev-dot dev-now"></i>Now</span>
    </div>
    <div class="dev-scale" aria-hidden="true"><span></span><span class="dev-scale-track">${scale}</span><span></span></div>
    ${groups}`;
}

// ----------------------------------------------------------------- tables ---

function renderSeasonTable(input: DevelopmentInput): string {
  const rows = seasonRows(input.timeline)
    .map(({ point, abilityDelta }, i) => {
      const club = point.clubId ? escapeHtml(input.clubName(point.clubId)) : '—';
      // A change of nothing is not printed: a "0" after the ability on the last
      // row, where nothing has been played since the row above, is noise.
      const change =
        abilityDelta === null || abilityDelta === 0
          ? ''
          : ` <span class="dev-delta ${deltaClass(abilityDelta)}">${signed(abilityDelta)}</span>`;
      // Both labels are in the markup and CSS shows one: "End of season 3" is
      // the row's name where there is room and "S3" where there is not. Whichever
      // is hidden is out of the accessibility tree too, so it is read once.
      return `<tr>
          <th scope="row"><span class="dev-long">${escapeHtml(point.label)}</span><span class="dev-short">${escapeHtml(point.short)}</span></th>
          <td class="dev-age">${point.age}</td>
          <td>${club}</td>
          <td>${point.ability}${change}</td>
          <td>${input.windows[i]!.toFixed(2)}s</td>
        </tr>`;
    })
    .join('');
  return `<div class="dev-table-wrap" tabindex="0" role="region" aria-label="Season by season, scrollable">
      <table class="dev-table dev-seasons">
        <caption>Season by season</caption>
        <thead><tr><th scope="col">Point</th><th scope="col" class="dev-age">Age</th><th scope="col">Club</th><th scope="col">Ability</th><th scope="col">Window</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderAttributeTable(input: DevelopmentInput, changes: readonly AttributeChange[]): string {
  const { points } = input.timeline;
  const head = points
    .map(
      (point) =>
        `<th scope="col">${escapeHtml(point.short)}<small>${point.age}y</small></th>`,
    )
    .join('');
  const body = ATTRIBUTE_GROUPS.map((group) => {
    const rows = changes.filter(
      (change) =>
        change.group === group.label &&
        (input.filter === 'all' || input.keyKeys.has(change.key)),
    );
    if (rows.length === 0) return '';
    const cols = points.length + 2;
    return `<tr class="dev-table-group"><th scope="colgroup" colspan="${cols}">${group.label}</th></tr>${rows
      .map(
        (change) => `<tr>
          <th scope="row">${escapeHtml(change.label)}${input.keyKeys.has(change.key) ? ' <em class="dev-key">key</em>' : ''}</th>
          ${change.series.map((value) => `<td>${value}</td>`).join('')}
          <td><span class="dev-delta ${deltaClass(change.delta)}">${signed(change.delta)}</span></td>
        </tr>`,
      )
      .join('')}`;
  }).join('');
  return `<div class="dev-table-wrap" tabindex="0" role="region" aria-label="Attribute values at each point, scrollable">
      <table class="dev-table dev-attrs">
        <caption class="visually-hidden">Every attribute at every recorded point</caption>
        <thead><tr><th scope="col">Attribute</th>${head}<th scope="col">Change</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

// ------------------------------------------------------------------- page ---

/** What to tell somebody about how much of the career was recorded. */
export function recordNote(timeline: AttributeTimeline): string {
  const first = timeline.points[0]!;
  if (!timeline.complete) {
    return `The record begins at ${first.label.toLowerCase()}. Seasons played before the game kept a record of attributes cannot be recovered, so earlier development is not shown.`;
  }
  if (timeline.points.length <= 2) {
    return 'No season has finished yet, so there is no career to chart. This is where he started and where he is; it fills in each summer.';
  }
  return '';
}

export function renderDevelopment(input: DevelopmentInput): RenderedDevelopment {
  const tips: Record<string, Tip> = {};
  const changes = attributeChanges(input.timeline);
  const note = recordNote(input.timeline);

  const attributes =
    input.view === 'table'
      ? renderAttributeTable(input, changes)
      : `<p class="dev-movers">${escapeHtml(moversSentence(changes))}</p>
         <div class="dev-rows">${renderDumbbells(input, changes, tips)}</div>`;

  const html = `
    ${note ? `<p class="dev-note">${escapeHtml(note)}</p>` : ''}
    ${renderTiles(input)}
    <section class="dev-section">
      <h3>Overall ability, by season</h3>
      <div class="dev-chart-wrap" tabindex="0" aria-describedby="dev-chart-help">
        ${renderAbilityChart(input, tips)}
      </div>
      <p class="dev-help" id="dev-chart-help">Hover or use the left and right arrow keys to read a season.</p>
    </section>
    <section class="dev-section">
      <h3>Every attribute, ${escapeHtml(input.timeline.points[0]!.label.toLowerCase())} to now</h3>
      ${attributes}
    </section>
    <section class="dev-section">
      <h3>The seasons</h3>
      ${renderSeasonTable(input)}
    </section>`;

  return { html, tips, chartPoints: input.timeline.points.length };
}
