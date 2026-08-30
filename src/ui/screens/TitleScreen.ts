import { gameLogo } from '../logo.ts';
import { titleMenu } from '../titleMenu.ts';
import type { TitleEntryId } from '../titleMenu.ts';
import type { CareerSummary } from './HomeScreen.ts';

/**
 * THE TITLE SCREEN
 *
 * The front door used to be the careers page: a rack of three slots, the wall
 * of fame, a quick match, three settings and the save panel, in one scrolling
 * column. Everything a player could want was on it, which is the problem — the
 * one thing he wants every time he opens the game, *carry on with the career I
 * was playing*, was a card among six other things and below a heading.
 *
 * So the door is a menu now, and the careers page is what one of its entries
 * opens. Nothing has been taken away; it has been put in an order.
 *
 * WHICH ENTRIES APPEAR AND IN WHAT ORDER is decided in ui/titleMenu.ts, where
 * it can be read without a browser. This file draws them, adds the one thing a
 * list of entries cannot carry — the season's numbers under the career being
 * resumed — and wires the presses.
 */
export interface TitleHandlers {
  /** The career that would be resumed, or null when the save is empty. */
  current: CareerSummary | null;
  /** How many careers are on the save at all. Decides the second entry's name. */
  careerCount: number;
  onContinue: () => void;
  /** The careers page: another career, a different one, or the first one. */
  onCareers: () => void;
  onQuickMatch: () => void;
  onHowToPlay: () => void;
  onHallOfFame: () => void;
  /** The careers page again, opened at the settings. */
  onSettings: () => void;
  /** Careers already finished, so the wall is offered only once it exists. */
  hallOfFameCount: number;
}

export class TitleScreen {
  readonly element: HTMLElement;

  constructor(handlers: TitleHandlers) {
    const { current } = handlers;
    const entries = titleMenu({ current, careerCount: handlers.careerCount });

    this.element = document.createElement('section');
    this.element.className = 'screen title-screen';
    this.element.innerHTML = `
      <header class="title-header">
        ${gameLogo(112)}
        <h1 class="title-wordmark">FOOTII</h1>
        <p class="title-tagline">One player. Ninety minutes. Six choices at a time.</p>
      </header>

      <nav class="title-menu" aria-label="Main menu">
        ${entries
          .map(
            (entry) => `
              <button class="title-entry${entry.primary ? ' title-primary' : ''}"
                      id="title-${entry.id}">
                <span class="title-entry-label">${entry.label}</span>
                <span class="title-entry-detail">${entry.detail}</span>
                ${
                  // The season under the career being resumed. It belongs to
                  // the drawing rather than to the menu model: it is the one
                  // line here that is a readout instead of a choice.
                  entry.id === 'continue' && current
                    ? `<span class="title-entry-detail">
                         ${current.played} of ${current.total} matches ·
                         ${current.goals} goals · ${current.assists} assists
                       </span>`
                    : ''
                }
              </button>`,
          )
          .join('')}
      </nav>

      <div class="title-secondary">
        ${
          handlers.hallOfFameCount > 0
            ? `<button class="ghost" id="title-wall">Wall of fame (${handlers.hallOfFameCount})</button>`
            : ''
        }
        <button class="ghost" id="title-settings">Settings</button>
      </div>`;

    const press: Record<TitleEntryId, () => void> = {
      continue: handlers.onContinue,
      careers: handlers.onCareers,
      quick: handlers.onQuickMatch,
      how: handlers.onHowToPlay,
    };
    for (const entry of entries) {
      this.element
        .querySelector<HTMLButtonElement>(`#title-${entry.id}`)
        ?.addEventListener('click', press[entry.id]);
    }

    this.element
      .querySelector<HTMLButtonElement>('#title-wall')
      ?.addEventListener('click', handlers.onHallOfFame);
    this.element
      .querySelector<HTMLButtonElement>('#title-settings')
      ?.addEventListener('click', handlers.onSettings);
  }
}
