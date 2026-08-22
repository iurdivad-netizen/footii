import type { CareerLegacy, LegacyDetail } from '../../core/career/legacy.ts';
import { renderSeasonHonours } from './CareerScreen.ts';

/**
 * A CAREER IN FULL
 *
 * The four panels that make up the complete account of a finished career: the
 * cabinet, the record book, every season and every move.
 *
 * They live here rather than on a screen because TWO screens show them, and
 * they have to be the same two screens' worth of information. The end screen
 * shows a career the moment before it stops; the wall of fame shows the same
 * career whenever you ask afterwards. If those two drifted apart, the more
 * complete view would be the one you get only once — which was exactly the
 * problem this was written to fix.
 *
 * Everything here renders from a `LegacyDetail` rather than from a live
 * `CareerState`, and that is the point rather than a convenience. It means the
 * end screen is showing you precisely what will be kept: no panel can appear
 * there and then quietly fail to survive, because both screens are reading the
 * same record. A field that did not make it into the detail is a field that is
 * missing from the end screen too, where somebody will notice.
 */

/**
 * The cabinet.
 *
 * An empty one is stated rather than hidden. Everywhere else in the game an
 * empty honours list is simply not rendered, because a hub full of blank panels
 * reads as a broken screen — but this is the last word on a career, and
 * "nothing" is a real answer to what it won.
 */
export function renderHonours(honours: readonly { label: string; count: number }[]): string {
  if (honours.length === 0) {
    return `<div class="career-card">
        <h2>Honours</h2>
        <p class="hint">Nothing. Not every career wins something, and most do not.</p>
      </div>`;
  }
  const items = honours
    .map(
      (entry) =>
        `<li><span>${entry.label}</span>${entry.count > 1 ? `<em>×${entry.count}</em>` : ''}</li>`,
    )
    .join('');
  return `<div class="career-card">
      <h2>Honours</h2>
      <ul class="honours-list">${items}</ul>
    </div>`;
}

/** The record book in full — these are the two screens where the whole thing belongs. */
export function renderRecords(detail: LegacyDetail): string {
  if (detail.records.length === 0) {
    return `<div class="career-card">
        <h2>Records</h2>
        <p class="hint">No peaks worth the name. The book stays closed.</p>
      </div>`;
  }
  const cells = detail.records
    .map(
      (entry) => `<div class="record-tile">
          <span class="record-value">${entry.value}</span>
          <span class="record-label">${entry.label}</span>
          <span class="record-note">${entry.note}</span>
        </div>`,
    )
    .join('');
  return `<div class="career-card">
      <h2>Records</h2>
      <div class="record-grid">${cells}</div>
    </div>`;
}

/**
 * Every season, in order.
 *
 * Deliberately the full list rather than the recent few the hub shows. A hub is
 * read mid-career, where last season matters most; this is read at the end,
 * where the shape of the whole thing is the point.
 */
export function renderHistory(detail: LegacyDetail): string {
  if (detail.seasons.length === 0) return '';
  const rows = detail.seasons
    .map(
      (season) =>
        `<tr>
          <td>${season.seasonNumber}</td>
          <td>${season.clubName}</td>
          <td>${season.countryShort}</td>
          <td>${season.age}</td>
          <td>${season.position}</td>
          <td>${season.matches}</td>
          <td>${season.goals}</td>
          <td>${season.assists}</td>
          <td>${season.rating.toFixed(2)}</td>
          <td>${renderSeasonHonours(detail.honours, season.seasonNumber)}</td>
        </tr>`,
    )
    .join('');
  return `<div class="career-card">
      <h2>Every season</h2>
      <table class="league-table">
        <thead>
          <tr><th>S</th><th>Club</th><th>Country</th><th>Age</th><th>Pos</th><th>Apps</th>
              <th>G</th><th>A</th><th>Rating</th><th>Won</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Where he went and what it cost, for a career that reads as a route. */
export function renderJourney(legacy: CareerLegacy, detail: LegacyDetail): string {
  const summary = `${legacy.clubs} ${legacy.clubs === 1 ? 'club' : 'clubs'} in
    ${legacy.countries} ${legacy.countries === 1 ? 'country' : 'countries'},
    £${legacy.earnings}m earned.`;

  if (detail.moves.length === 0) {
    return `<div class="career-card">
        <h2>The journey</h2>
        <p class="hint">${summary} He never moved.</p>
      </div>`;
  }
  const rows = detail.moves
    .map(
      (move) =>
        `<tr>
          <td>${move.season}</td>
          <td>${move.age}</td>
          <td>${move.fromClubName} → ${move.toClubName}</td>
          <td>${move.free ? 'Free' : `£${move.fee}m`}</td>
        </tr>`,
    )
    .join('');
  return `<div class="career-card">
      <h2>The journey</h2>
      <p class="hint">${summary}</p>
      <table class="league-table">
        <thead><tr><th>S</th><th>Age</th><th>Move</th><th>Fee</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** The six numbers a career is read on, shared by both screens. */
export function renderFigures(legacy: CareerLegacy): string {
  return `<div class="career-end-figures">
      ${figure(legacy.seasons, legacy.seasons === 1 ? 'Season' : 'Seasons')}
      ${figure(legacy.appearances, 'Appearances')}
      ${figure(legacy.goals, 'Goals')}
      ${figure(legacy.assists, 'Assists')}
      ${figure(legacy.averageRating > 0 ? legacy.averageRating.toFixed(2) : '—', 'Avg rating')}
      ${figure(legacy.caps, 'Caps')}
    </div>`;
}

function figure(value: number | string, label: string): string {
  return `<div class="career-end-figure">
      <span class="figure-value">${value}</span>
      <span class="figure-label">${label}</span>
    </div>`;
}

/**
 * All four panels, in the order both screens show them.
 *
 * One function rather than four calls at each site, so the two screens cannot
 * end up showing the same panels in a different order or quietly dropping one.
 */
export function renderCareerRecord(legacy: CareerLegacy, detail: LegacyDetail): string {
  return `
    <div class="career-end-columns">
      ${renderHonours(legacy.honours)}
      ${renderRecords(detail)}
    </div>
    ${renderHistory(detail)}
    ${renderJourney(legacy, detail)}`;
}
