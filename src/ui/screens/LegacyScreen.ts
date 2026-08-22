import type { CareerLegacy } from '../../core/career/legacy.ts';
import { getCountry } from '../../core/career/countries.ts';
import { renderCareerRecord, renderFigures } from './careerRecord.ts';
import { positionLabel } from '../../core/player/positions.ts';

/**
 * ONE CAREER ON THE WALL, IN FULL
 *
 * The wall of fame used to be the end of the line. A career was played for
 * eighteen seasons, shown to you once on the end screen with every season and
 * every move and the whole record book, and then reduced to a card: six
 * numbers, a list of trophies and a one-line verdict. Everything else was
 * thrown away at the moment it stopped being addable to.
 *
 * That was the wrong way round. A live career is the one you can always look
 * at — it is right there in the hub. A finished one is the only kind that can
 * never be re-read from its own state, so it is the one that most needs
 * keeping. The wall could rank a career it could no longer show you.
 *
 * So the card stays exactly as it was, because a wall is meant to be scanned,
 * and clicking one opens this: the same panels the end screen showed, from the
 * same `LegacyDetail` it showed them from. Not a similar screen — the same
 * renderers, so the two cannot drift.
 *
 * WHAT AN OLDER ENTRY GETS. Careers enshrined before the detail was kept have
 * none, and nothing can reconstruct it: the state it would have come from was
 * deleted when the career ended. Those entries show everything the card holds
 * and say plainly that the rest was not kept — which is the same choice made
 * everywhere else a counter arrived after the game did. Inventing a history
 * would be worse than admitting to a gap.
 */
export interface LegacyHandlers {
  onBack: () => void;
  /** Remove this career from the wall. */
  onRemove: (id: string) => void;
}

export class LegacyScreen {
  readonly element: HTMLElement;

  constructor(
    legacy: CareerLegacy,
    /** Where it sits on the wall, so the screen can say so. */
    rank: number,
    handlers: LegacyHandlers,
  ) {
    const detail = legacy.detail;

    this.element = document.createElement('section');
    this.element.className = 'screen career-end-screen legacy-screen';
    this.element.innerHTML = `
      <header class="career-end-head">
        <p class="career-end-kicker">
          ${ordinal(rank)} on the wall · scored ${legacy.score}
        </p>
        <h1>${legacy.name}</h1>
        <p class="career-end-detail">
          ${positionLabel(legacy.position)} · ${legacy.finalClubName} ·
          ${getCountry(legacy.finalCountryId).name} ·
          ${legacy.seasons} ${legacy.seasons === 1 ? 'season' : 'seasons'} ·
          ${legacy.ending === 'retired' ? 'retired' : 'ended'} at ${legacy.ageAtEnd}
        </p>
        <p class="career-end-verdict">${legacy.verdict}</p>
      </header>

      ${renderFigures(legacy)}

      <p class="legacy-line">
        ${legacy.clubs} ${legacy.clubs === 1 ? 'club' : 'clubs'},
        ${legacy.countries} ${legacy.countries === 1 ? 'country' : 'countries'},
        £${legacy.earnings}m earned,
        ${legacy.titles} ${legacy.titles === 1 ? 'league title' : 'league titles'}.
        Finished at ${legacy.abilityAtEnd}, on
        ${new Date(legacy.endedAt).toLocaleDateString()}.
      </p>

      ${detail ? renderCareerRecord(legacy, detail) : renderWithoutDetail(legacy)}

      <div class="career-end-actions">
        <div class="career-end-buttons">
          <button class="primary" id="legacy-back">Back to the wall</button>
          <button class="ghost danger" id="legacy-remove" data-armed="no">
            Remove from the wall
          </button>
        </div>
      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('#legacy-back')!
      .addEventListener('click', handlers.onBack);

    // Two presses, as on the wall itself. Removing one career is smaller than
    // clearing the whole thing and still permanent, and it is reached here by
    // somebody who came to READ rather than to delete — so a single click that
    // destroyed what they opened would be exactly the wrong behaviour.
    const remove = this.element.querySelector<HTMLButtonElement>('#legacy-remove')!;
    remove.addEventListener('click', () => {
      if (remove.dataset.armed === 'yes') {
        handlers.onRemove(legacy.id);
        return;
      }
      remove.dataset.armed = 'yes';
      remove.textContent = 'Really remove him? This cannot be undone';
    });
  }
}

/**
 * What an entry from before the detail existed can still show.
 *
 * The cabinet and the highlights, both of which the card has always held, and
 * one sentence saying why there is no season table. Stated rather than left as
 * an absence: a screen that silently showed less for some entries than others
 * would read as broken rather than as honest.
 */
function renderWithoutDetail(legacy: CareerLegacy): string {
  const honours = legacy.honours
    .map(
      (entry) =>
        `<li><span>${entry.label}</span>${entry.count > 1 ? `<em>×${entry.count}</em>` : ''}</li>`,
    )
    .join('');
  const highlights = legacy.highlights
    .map(
      (peak) => `<div class="record-tile">
          <span class="record-value">${peak.value}</span>
          <span class="record-label">${peak.label}</span>
          <span class="record-note">${peak.note}</span>
        </div>`,
    )
    .join('');

  return `
    <div class="career-end-columns">
      <div class="career-card">
        <h2>Honours</h2>
        ${
          honours
            ? `<ul class="honours-list">${honours}</ul>`
            : '<p class="hint">Nothing. Not every career wins something, and most do not.</p>'
        }
      </div>
      <div class="career-card">
        <h2>Records</h2>
        ${
          highlights
            ? `<div class="record-grid">${highlights}</div>`
            : '<p class="hint">No peaks worth the name.</p>'
        }
      </div>
    </div>
    <div class="career-card">
      <h2>Every season</h2>
      <p class="hint">
        Not kept. This career was finished before the wall started keeping a season-by-season
        record, and nothing can reconstruct one — the career it would have come from was deleted
        the moment it ended. Everything above is what the wall has always held.
      </p>
    </div>`;
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}
