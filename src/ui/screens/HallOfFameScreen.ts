import type { CareerLegacy } from '../../core/career/legacy.ts';
import { rankLegacies } from '../../core/career/legacy.ts';
import { positionLabel } from '../../core/player/positions.ts';

/**
 * THE WALL OF FAME
 *
 * Every career this browser has finished, best first.
 *
 * The one thing in the game that outlives a career. A career in a slot is
 * eventually ended, and the slot reused; without this there would be no reason
 * for the tenth career to be different from the first, and no record that the
 * first had ever happened.
 *
 * The ranking is `careerScore`, which is blunt on purpose: it exists to put the
 * best career at the top, not to settle an argument. What it is made of is
 * shown on every card, so a placing you disagree with can at least be read.
 *
 * THE CARD IS A SUMMARY AND STAYS ONE. A wall is meant to be scanned — twenty
 * careers each showing every season they played would be a filing cabinet
 * rather than a wall. So the card is unchanged and the whole of it is a button:
 * clicking one opens the career in full, on the same screen the end screen
 * uses. A button rather than a click handler on the article, because a wall
 * somebody navigates by keyboard should reach the same places as one navigated
 * by mouse — and the Remove button sits OUTSIDE it, since a button inside a
 * button is neither valid nor clickable.
 *
 * CLEARING IS DELIBERATE, AND SEPARATE. Wiping the wall never touches the
 * career being played, and ending a career never touches the wall — they are
 * two different kinds of loss and running them together would make one of them
 * a surprise. The clear is a two-step press rather than a browser dialog, for
 * the same reason the end screen replaced one: an action this final deserves a
 * button that says what it is about to do.
 */
export interface HallOfFameHandlers {
  onBack: () => void;
  /** Wipe the whole wall. */
  onClear: () => void;
  /** Remove one career from it. */
  onRemove: (id: string) => void;
  /** Open one career in full. */
  onOpen: (id: string) => void;
}

export class HallOfFameScreen {
  readonly element: HTMLElement;

  constructor(
    entries: readonly CareerLegacy[],
    handlers: HallOfFameHandlers,
    /** A career just enshrined, to pick out of a list it has joined. */
    highlightId?: string,
  ) {
    const ranked = rankLegacies(entries);

    this.element = document.createElement('section');
    this.element.className = 'screen hall-screen';
    this.element.innerHTML = `
      <header class="hall-head">
        <h1>Wall of fame</h1>
        <p class="hint">
          ${
            ranked.length === 0
              ? `Nothing here yet. Every career you retire or end is kept here — what it won, what
                 it scored, and how it ranks against the others.`
              : `${ranked.length} finished ${ranked.length === 1 ? 'career' : 'careers'}, ranked by
                 what they won, produced and lasted.`
          }
        </p>
      </header>

      ${
        highlightId && ranked.some((entry) => entry.id === highlightId)
          ? `<p class="hall-new">Added to the wall at
               ${ordinal(ranked.findIndex((entry) => entry.id === highlightId) + 1)}.</p>`
          : ''
      }

      <div class="hall-list">
        ${ranked.map((entry, index) => card(entry, index + 1, entry.id === highlightId)).join('')}
      </div>

      <div class="hall-actions">
        <button class="primary" id="hall-back">Back to menu</button>
        ${
          ranked.length > 0
            ? `<button class="ghost danger" id="hall-clear" data-armed="no">Clear the wall</button>`
            : ''
        }
      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('#hall-back')!
      .addEventListener('click', handlers.onBack);

    // Two presses, and the button says so in between. A misclick on the first
    // press costs nothing; leaving the screen disarms it, because the state
    // lives on the button and the button is rebuilt every time.
    const clear = this.element.querySelector<HTMLButtonElement>('#hall-clear');
    clear?.addEventListener('click', () => {
      if (clear.dataset.armed === 'yes') {
        handlers.onClear();
        return;
      }
      clear.dataset.armed = 'yes';
      clear.textContent = 'Really clear it? This cannot be undone';
    });

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-remove]')) {
      button.addEventListener('click', () => handlers.onRemove(button.dataset.remove!));
    }

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-open]')) {
      button.addEventListener('click', () => handlers.onOpen(button.dataset.open!));
    }
  }
}

function card(entry: CareerLegacy, rank: number, isNew: boolean): string {
  const honours = entry.honours
    .map(
      (honour) =>
        `<li><span>${honour.label}</span>${honour.count > 1 ? `<em>×${honour.count}</em>` : ''}</li>`,
    )
    .join('');

  const highlights = entry.highlights
    .map((peak) => `<li><strong>${peak.value}</strong> ${peak.label.toLowerCase()}</li>`)
    .join('');

  return `
    <article class="hall-card${isNew ? ' new' : ''}">
      <div class="hall-rank">${rank}</div>
      <button class="hall-open" data-open="${entry.id}">
        <div class="hall-body">
          <div class="hall-card-head">
            <div>
              <h2>${entry.name}</h2>
              <p class="hall-detail">
                ${positionLabel(entry.position)} · ${entry.finalClubName} ·
                ${entry.finalCountryShort} · ${entry.seasons}
                ${entry.seasons === 1 ? 'season' : 'seasons'} ·
                ${entry.ending === 'retired' ? 'retired' : 'ended'} at ${entry.ageAtEnd}
              </p>
            </div>
            <div class="hall-score">
              <span class="score-value">${entry.score}</span>
              <span class="score-label">${entry.ending === 'retired' ? 'Retired' : 'Ended'}</span>
            </div>
          </div>

          <p class="hall-verdict">${entry.verdict}</p>

          <div class="hall-figures">
            <span><strong>${entry.appearances}</strong> apps</span>
            <span><strong>${entry.goals}</strong> goals</span>
            <span><strong>${entry.assists}</strong> assists</span>
            <span><strong>${entry.averageRating > 0 ? entry.averageRating.toFixed(2) : '—'}</strong> rating</span>
            <span><strong>${entry.caps}</strong> caps</span>
            <span><strong>£${entry.earnings}m</strong> earned</span>
          </div>

          ${honours ? `<ul class="honours-list">${honours}</ul>` : '<p class="hint">No honours.</p>'}
          ${highlights ? `<ul class="hall-highlights">${highlights}</ul>` : ''}

          <span class="hall-open-hint">Read this career in full →</span>
        </div>
      </button>
      <div class="hall-card-actions">
        <button class="ghost small" data-remove="${entry.id}">Remove</button>
      </div>
    </article>`;
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}
