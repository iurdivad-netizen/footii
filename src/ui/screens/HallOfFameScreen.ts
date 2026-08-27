import type { CareerLegacy } from '../../core/career/legacy.ts';
import { BALANCE_VERSION, balanceVersionOf, rankLegacies } from '../../core/career/legacy.ts';
import { positionLabel } from '../../core/player/positions.ts';
import { describeHowPlayed } from '../../core/career/howPlayed.ts';

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
          ${howPlayedTag(entry)}
          ${eraTag(entry)}

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

/**
 * How much of the career the person at the keyboard actually sat through.
 *
 * A tag beside the verdict rather than an adjustment to the score above it. The
 * two answer different questions — how good the career was, and how much of it
 * was played — and the whole point of settling CHANGELOG item 11 this way is
 * that neither has to be converted into the other. See core/career/howPlayed.ts.
 *
 * Shown only when the counts are trustworthy. An entry from before anybody was
 * counting gets no tag at all: a wall that quietly labelled those "simulated"
 * would be making an accusation out of a missing field.
 */
function howPlayedTag(entry: CareerLegacy): string {
  const summary = describeHowPlayed(entry.howPlayed, entry.appearances);
  if (!summary.reliable) return '';
  const played = Math.round((summary.playedShare ?? 0) * 100);
  return `<p class="hall-how-played" title="${summary.detail}">${summary.label} · ${played}% played</p>`;
}

/**
 * Which scoring model this career was played under.
 *
 * The wall ranks on `score`, and the goal-conversion fix moved what a score
 * MEANS: a season after it returns about a third fewer goals and roughly a
 * rating point less, and `careerScore` reads both. So an entry enshrined before
 * it sits above an identical career played after it, permanently and on nothing
 * either footballer did.
 *
 * Said rather than corrected, which is the same answer this wall already gives
 * to how much of a career was skipped. Rescaling the old scores would rewrite a
 * number a player was shown the day his career ended, and the factor doing the
 * rescaling would be a fiction — no multiplier turns a career that happened into
 * the career it would have been. A reader who can see which era an entry
 * belongs to can rank them himself; a reader shown a silently adjusted number
 * cannot. See core/career/legacy.ts.
 *
 * Only the older entries are tagged. Marking today's careers "current" would put
 * a label on every card to say nothing, and the tag would stop being a thing the
 * eye stops on.
 */
function eraTag(entry: CareerLegacy): string {
  if (balanceVersionOf(entry) >= BALANCE_VERSION) return '';
  return `<p class="hall-era" title="Goals and ratings both ran higher before that change, and the score reads both.">Scored under the older goal model</p>`;
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}
