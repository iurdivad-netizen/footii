import type { Presentation } from '../../core/career/ceremony.ts';

/**
 * THE PRESENTATION SCREEN
 *
 * One trophy, or one award, at a time. What is on it is decided in
 * core/career/ceremony.ts; this draws it and moves through the list.
 *
 * WHY ONE AT A TIME rather than a card per honour on a single page. A season
 * that won the league, the double and the golden boot puts three things on this
 * screen, and a page listing all three is the honours table again — which is
 * the thing that already existed and which is exactly what made a trophy feel
 * like a row. Handing them over one at a time is the difference between a
 * record and an occasion, and it costs one button.
 *
 * The counter is shown only when there is more than one, because "1 of 1" is a
 * paginator apologising for itself.
 */
export class CeremonyScreen {
  readonly element: HTMLElement;
  private index = 0;

  constructor(
    private readonly presentations: readonly Presentation[],
    private readonly onDone: () => void,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'screen ceremony-screen';
    this.render();
  }

  private render(): void {
    const item = this.presentations[this.index];
    // Nothing to present is not an error — a caller that guards on the list
    // being empty is one more thing every caller has to remember — so it
    // finishes instead, and the flow carries on to wherever it was going.
    if (!item) {
      this.onDone();
      return;
    }

    const last = this.index === this.presentations.length - 1;
    const lines = item.lines
      .map((line) => `<li>${line}</li>`)
      .join('');

    this.element.innerHTML = `
      <div class="ceremony ceremony-${item.tone}">
        <p class="ceremony-standing">${item.subtitle}</p>
        <h1 class="ceremony-title">${item.title}</h1>
        ${lines ? `<ul class="ceremony-lines">${lines}</ul>` : ''}
      </div>
      ${
        this.presentations.length > 1
          ? `<p class="hint ceremony-count">${this.index + 1} of ${this.presentations.length}</p>`
          : ''
      }
      <button class="primary" id="ceremony-next">${last ? 'Continue' : 'Next'}</button>`;

    const button = this.element.querySelector<HTMLButtonElement>('#ceremony-next');
    button?.addEventListener('click', () => {
      this.index += 1;
      if (this.index >= this.presentations.length) {
        this.onDone();
        return;
      }
      this.render();
      // Focus follows the content, so a keyboard player is not left holding a
      // button that has moved on without him. See the focus note in
      // ui/interaction/InputController.ts.
      this.element.querySelector<HTMLButtonElement>('#ceremony-next')?.focus();
    });
    // Announced rather than merely drawn: this screen appears between two
    // others without being asked for, and a live region is how somebody using a
    // screen reader finds out a cup has been won.
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
  }
}
