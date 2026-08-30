import { gameLogo } from '../logo.ts';

/**
 * THE CAREERS PAGE
 *
 * Every career you have going, side by side, with the empty slots as real
 * places to start rather than an absence. It used to hold exactly one career,
 * because the save did — which is what made starting a second cost you the
 * first, and why the button for it said "Abandon".
 *
 * IT USED TO BE THE FRONT DOOR, and carried what a front door carries: a
 * summary of the wall, a quick match, three settings, the save panel and a link
 * to the manual. Every one of those is now an entry on the menu that opens this
 * page, so every one of them was on screen twice — and a page that offers
 * everything is a page with no answer to "where do I go".
 *
 * So this page is careers and nothing else. The rule it is now held to, and the
 * one the menu exists to make possible: EVERY SCREEN IS ONE QUESTION, or it is
 * the menu. A quick match is not a career and does not appear here; settings
 * are not a career and have a page of their own; the wall is careers that have
 * ENDED, which is a different question from the three still being played, and
 * it had a screen of its own already.
 */
export interface CareerSummary {
  name: string;
  detail: string;
  ability: number;
  /** Matches played and total in the current season. */
  played: number;
  total: number;
  goals: number;
  assists: number;
}

export interface HomeHandlers {
  /** One entry per slot, in slot order. `null` is an empty slot. */
  slots: readonly (CareerSummary | null)[];
  /** The slot that was last played, marked so a rack of three has a "yours". */
  activeSlot: number;
  onContinueCareer: (slot: number) => void;
  /**
   * Open the end screen for a career.
   *
   * Named for what it now does. This used to be `onAbandonCareer` and used to
   * mean it — a `confirm()` here, and the career was gone. Ending one is a
   * screen of its own now, so this page only opens it.
   */
  onEndCareer: (slot: number) => void;
  onStartCareer: (slot: number) => void;
  /** Anything this page needs to report, such as every slot being full. */
  status?: string;
  /**
   * Back to the menu.
   *
   * This page used to BE the front door, so it had nowhere to go back to. Now
   * that it is one entry on a menu it needs a way out, and a page you can only
   * leave by starting something is a trap.
   */
  onBack?: () => void;
}

export class HomeScreen {
  readonly element: HTMLElement;

  constructor(handlers: HomeHandlers) {
    const { slots } = handlers;
    const anyCareer = slots.some(Boolean);

    this.element = document.createElement('section');
    this.element.className = 'screen home-screen';
    this.element.innerHTML = `
      <header class="home-header">
        ${gameLogo(52)}
        <h1>Careers</h1>
        <p class="tagline">Three at once, kept apart. Playing one never touches another.</p>
        ${handlers.onBack ? `<button class="ghost" id="home-back">Back to menu</button>` : ''}
      </header>

      ${handlers.status ? `<p class="home-status">${handlers.status}</p>` : ''}

      <div class="home-careers">
        ${
          // The page is called Careers and says what they are in its own header
          // now, so repeating it here would be the same sentence twice on one
          // screen. The empty state still needs its line: a rack of three
          // blanks explains nothing on its own.
          anyCareer
            ? ''
            : `<p class="hint">
                 Build or pick a footballer and follow him season by season. Your ratings drive
                 development — and as your awareness and composure grow, you get measurably more
                 time on the ball. You can keep three careers going at once.
               </p>`
        }
        <div class="slot-rack">
          ${slots
            .map((career, slot) =>
              career
                ? this.renderCareerSlot(career, slot, slot === handlers.activeSlot)
                : // On a save with nothing in it, the first empty slot is the
                  // only thing to do, and should look like it. Once a career
                  // exists, continuing it outranks starting another.
                  this.renderEmptySlot(slot, !anyCareer && slot === slots.findIndex((c) => !c)),
            )
            .join('')}
        </div>
      </div>

      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('#home-back')
      ?.addEventListener('click', () => handlers.onBack?.());
    const slotOf = (button: HTMLElement) => Number(button.dataset.slot);
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-continue]')) {
      button.addEventListener('click', () => handlers.onContinueCareer(slotOf(button)));
    }
    // No browser dialog: the end screen shows what is about to be lost, which
    // is a better question than "are you sure?" ever was.
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-end]')) {
      button.addEventListener('click', () => handlers.onEndCareer(slotOf(button)));
    }
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-start]')) {
      button.addEventListener('click', () => handlers.onStartCareer(slotOf(button)));
    }

  }

  private renderCareerSlot(career: CareerSummary, slot: number, active: boolean): string {
    const progress = career.total > 0 ? Math.round((career.played / career.total) * 100) : 0;
    return `
      <div class="slot-card occupied${active ? ' active' : ''}">
        <div class="slot-label">
          Slot ${slot + 1}${active ? ' <em>· last played</em>' : ''}
        </div>
        <div class="career-card-head">
          <div>
            <p class="career-card-name">${career.name}</p>
            <p class="home-summary">${career.detail}</p>
          </div>
          <div class="career-ability">
            <span class="ability-value">${career.ability}</span>
            <span class="ability-label">Ability</span>
          </div>
        </div>

        <div class="career-card-stats">
          <span><strong>${career.played}</strong>/${career.total} matches</span>
          <span><strong>${career.goals}</strong> goals</span>
          <span><strong>${career.assists}</strong> assists</span>
        </div>
        <div class="season-bar"><i style="width:${progress}%"></i></div>

        <div class="career-card-actions">
          <button class="primary" data-continue data-slot="${slot}">Continue</button>
          <button class="ghost" data-end data-slot="${slot}">End career</button>
        </div>
      </div>`;
  }

  private renderEmptySlot(slot: number, primary: boolean): string {
    return `
      <div class="slot-card empty">
        <div class="slot-label">Slot ${slot + 1}</div>
        <p class="slot-empty-note">Empty. A career started here runs alongside the others.</p>
        <div class="career-card-actions">
          <button class="${primary ? 'primary' : 'ghost'}" data-start data-slot="${slot}">
            Start a career
          </button>
        </div>
      </div>`;
  }

  /**
   * Taking the save somewhere else.
   *
   * Folded away in a `<details>` because it is maintenance rather than play:
   * nobody opens the game to export a file, and it must not compete with the
   * rack. It is on the front door at all rather than buried deeper because the
   * moment it matters — a browser about to be cleared, a machine about to be
   * replaced — is a moment when nobody wants to go looking.
   */
}
