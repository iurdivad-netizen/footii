import type { CareerState } from '../../core/career/career.ts';
import type { CareerEnding, CareerLegacy } from '../../core/career/legacy.ts';
import { isWorthRemembering } from '../../core/career/legacy.ts';
import { milestones } from '../../core/career/records.ts';
import { averageRating } from '../../core/career/seasonStats.ts';
import { getCountry, leagueName } from '../../core/career/countries.ts';
import { renderSeasonHonours } from './CareerScreen.ts';
import { positionLabel } from '../../core/player/positions.ts';
import { getTeam } from '../../data/gameData.ts';

/**
 * THE END SCREEN
 *
 * Shown when a career stops — because he retired, or because you decided you
 * were finished with him.
 *
 * This screen exists because of what used to happen instead. Abandoning a
 * career was a browser `confirm()` and then nothing: no summary, no last look,
 * eighteen seasons deleted between one click and the next. The single most
 * consequential action in the game was also the only one with no screen of its
 * own.
 *
 * So the confirmation IS the summary. You are not asked whether you are sure in
 * the abstract — you are shown exactly what you are about to stop, with the
 * honours and the record book and every season laid out, and the button to go
 * back is right there underneath it. A career that survives being read in full
 * is one you meant to end.
 */
export interface CareerEndContext {
  /** The career as it stands, for the tables that need more than a summary. */
  state: CareerState;
  /** That same career, reduced to what the wall of fame will keep. */
  legacy: CareerLegacy;
  ending: CareerEnding;
  /** True when there is no choice left — age has made it for him. */
  forced: boolean;
  /** Why he is being asked, when he is being asked. */
  reason?: string;
}

export interface CareerEndHandlers {
  /** End it: the legacy is written to the wall and the career is cleared. */
  onConfirm: () => void;
  /** Go back to it. Absent when the ending is forced. */
  onCancel?: () => void;
}

export class CareerEndScreen {
  readonly element: HTMLElement;

  constructor(context: CareerEndContext, handlers: CareerEndHandlers) {
    const { legacy, state, ending, forced } = context;
    const retiring = ending === 'retired';
    const remembered = isWorthRemembering(legacy);

    this.element = document.createElement('section');
    this.element.className = 'screen career-end-screen';
    this.element.innerHTML = `
      <header class="career-end-head">
        <p class="career-end-kicker">${retiring ? 'Retirement' : 'Ending a career'}</p>
        <h1>${legacy.name}</h1>
        <p class="career-end-detail">
          ${positionLabel(legacy.position)} · ${legacy.finalClubName} ·
          ${leagueName(legacy.finalCountryId)} · age ${legacy.ageAtEnd}
        </p>
        <p class="career-end-verdict">${legacy.verdict}</p>
        ${context.reason ? `<p class="hint">${context.reason}</p>` : ''}
      </header>

      <div class="career-end-figures">
        ${figure(legacy.seasons, legacy.seasons === 1 ? 'Season' : 'Seasons')}
        ${figure(legacy.appearances, 'Appearances')}
        ${figure(legacy.goals, 'Goals')}
        ${figure(legacy.assists, 'Assists')}
        ${figure(legacy.averageRating > 0 ? legacy.averageRating.toFixed(2) : '—', 'Avg rating')}
        ${figure(legacy.caps, 'Caps')}
      </div>

      <div class="career-end-columns">
        ${renderHonours(legacy)}
        ${renderRecords(state)}
      </div>

      ${renderHistory(state)}
      ${renderJourney(legacy, state)}

      <div class="career-end-actions">
        <p class="hint">
          ${
            remembered
              ? `This career will be kept on the wall of fame, scored at
                 <strong>${legacy.score}</strong>. Nothing else about it survives — the season,
                 the squad and the world it was played in all go.`
              : `He never played a match, so there is nothing to put on the wall. This career will
                 simply be gone.`
          }
        </p>
        <div class="career-end-buttons">
          <button class="primary" id="career-end-confirm">
            ${retiring ? 'Hang up your boots' : 'End this career'}
          </button>
          ${
            forced
              ? ''
              : `<button class="ghost" id="career-end-cancel">
                   ${retiring ? 'Play on' : 'Keep playing'}
                 </button>`
          }
        </div>
      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('#career-end-confirm')!
      .addEventListener('click', handlers.onConfirm);
    this.element
      .querySelector<HTMLButtonElement>('#career-end-cancel')
      ?.addEventListener('click', () => handlers.onCancel?.());
  }
}

function figure(value: number | string, label: string): string {
  return `<div class="career-end-figure">
      <span class="figure-value">${value}</span>
      <span class="figure-label">${label}</span>
    </div>`;
}

/**
 * The cabinet.
 *
 * An empty one is stated rather than hidden. Everywhere else in the game an
 * empty honours list is simply not rendered, because a hub full of blank
 * panels reads as a broken screen — but this is the last word on a career, and
 * "nothing" is a real answer to what it won.
 */
function renderHonours(legacy: CareerLegacy): string {
  if (legacy.honours.length === 0) {
    return `<div class="career-card">
        <h2>Honours</h2>
        <p class="hint">Nothing. Not every career wins something, and most do not.</p>
      </div>`;
  }
  const items = legacy.honours
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

/** The record book in full — this is the one screen where the whole thing belongs. */
function renderRecords(state: CareerState): string {
  const list = milestones(state.records);
  if (list.length === 0) {
    return `<div class="career-card">
        <h2>Records</h2>
        <p class="hint">No peaks worth the name. The book stays closed.</p>
      </div>`;
  }
  const cells = list
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
 * read mid-career, where last season matters most; this is read once, at the
 * end, where the shape of the whole thing is the point.
 */
function renderHistory(state: CareerState): string {
  if (state.history.length === 0) return '';
  const rows = state.history
    .map(
      (season) =>
        `<tr>
          <td>${season.seasonNumber}</td>
          <td>${clubName(season.clubId)}</td>
          <td>${getCountry(season.countryId ?? state.countryId).short}</td>
          <td>${season.age}</td>
          <td>${season.position}</td>
          <td>${season.stats.matches}</td>
          <td>${season.stats.goals}</td>
          <td>${season.stats.assists}</td>
          <td>${averageRating(season.stats).toFixed(2)}</td>
          <td>${renderSeasonHonours(state.honours ?? [], season.seasonNumber)}</td>
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
function renderJourney(legacy: CareerLegacy, state: CareerState): string {
  const moves = state.transfers ?? [];
  const summary = `${legacy.clubs} ${legacy.clubs === 1 ? 'club' : 'clubs'} in
    ${legacy.countries} ${legacy.countries === 1 ? 'country' : 'countries'},
    £${legacy.earnings}m earned.`;

  if (moves.length === 0) {
    return `<div class="career-card">
        <h2>The journey</h2>
        <p class="hint">${summary} He never moved.</p>
      </div>`;
  }
  const rows = moves
    .map(
      (move) =>
        `<tr>
          <td>${move.season}</td>
          <td>${move.age}</td>
          <td>${clubName(move.fromClubId)} → ${clubName(move.toClubId)}</td>
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

/**
 * A club name that cannot throw.
 *
 * The rest of the UI calls `getTeam` directly and is right to: it is rendering
 * a live career, and a club it cannot find is a save worth dropping. This
 * screen is rendering a career that is ENDING, and refusing to show somebody
 * their own history because one club id went stale would be the worst possible
 * moment to be strict.
 */
function clubName(id: string): string {
  try {
    return getTeam(id).shortName;
  } catch {
    return '—';
  }
}
