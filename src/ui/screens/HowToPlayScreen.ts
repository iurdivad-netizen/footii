import { DECISION_PACE_LABELS } from '../../simulation/DecisionTimer.ts';
import type { DecisionPace } from '../../simulation/DecisionTimer.ts';
import { MATCH_SPEEDS } from './matchSpeeds.ts';
import { HUB_LAYOUTS, HUB_LAYOUT_LABELS } from './hubSections.ts';
import { FAMILY_STYLE, LEGEND_ORDER } from '../actionFamilyStyle.ts';
import { WEEK_CHOICES, WEEK_DESCRIPTIONS, WEEK_LABELS } from '../../core/career/week.ts';

/**
 * HOW TO PLAY — the manual.
 *
 * The game had no page like this. What explanation existed was five bullets in
 * a collapsed `<details>` at the bottom of the front door, and the settings it
 * did not explain at all: a new player met a **decision pace** dropdown before
 * anything had told him that a decision was timed, and a **career hub** layout
 * dropdown before he had seen a hub.
 *
 * TWO RULES SHAPED WHAT IS ON IT.
 *
 * IT IS BUILT FROM THE REAL TABLES, not retyped from them. The pace labels, the
 * match speeds, the hub layouts, the action families and the four week choices
 * are all imported from the modules that define them, so a manual that
 * disagrees with the game is not a thing that can happen. Documentation that
 * can drift is documentation that will, and the version that drifts is worse
 * than none because it is confidently wrong.
 *
 * IT EXPLAINS THE INTERFACE, NOT THE SIMULATION. What the six options mean, what
 * the colours are for, where the cards went, what each setting changes. It
 * deliberately does not explain the resolution model or the transfer market:
 * somebody wanting that has README.md, and a manual that tried to be the README
 * would be read by nobody. The one exception is the goalkeeper's commit, which
 * is interface and mechanic at once — it is the read the whole match is built
 * around, and a player who has not been told about it is playing a different
 * and much worse game.
 *
 * REACHABLE ANY TIME, from the front door and from the welcome screen. The
 * one thing this must not be is a gate: it opens because somebody asked for it.
 */
export interface HowToPlayHandlers {
  onBack: () => void;
  /** Present only when there is somewhere to go next — the first visit. */
  onStart?: () => void;
}

export class HowToPlayScreen {
  readonly element: HTMLElement;

  constructor(handlers: HowToPlayHandlers) {
    this.element = document.createElement('section');
    this.element.className = 'screen how-screen';
    this.element.innerHTML = `
      <header class="how-header">
        <h1>How to play</h1>
        <p class="hint">
          What the screens do and what each setting changes. Everything here can be changed later,
          and nothing here is permanent.
        </p>
      </header>

      ${this.renderContents()}
      ${this.sections().map((section) => section.html).join('')}

      <div class="how-actions">
        ${handlers.onStart ? `<button class="primary" id="how-start">Start a career</button>` : ''}
        <button class="ghost" id="how-back">Back</button>
      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('#how-back')!
      .addEventListener('click', handlers.onBack);
    this.element
      .querySelector<HTMLButtonElement>('#how-start')
      ?.addEventListener('click', () => handlers.onStart?.());
  }

  /**
   * The page, as a list, so the contents cannot fall out of step with it.
   *
   * Measured at 4,000px on a phone — which is fine for a document and hopeless
   * without a way in, so the contents above are built from this same array
   * rather than typed alongside it. A hand-written contents list is a promise
   * that the next section added will silently not appear in it.
   */
  private sections(): { id: string; title: string; html: string }[] {
    return [
      { id: 'match', title: 'The match', html: this.renderMatch() },
      { id: 'options', title: 'Reading the six options', html: this.renderOptions() },
      { id: 'hub', title: 'The career hub', html: this.renderHub() },
      { id: 'week', title: 'The week before a match', html: this.renderWeek() },
      { id: 'settings', title: 'The settings', html: this.renderSettings() },
      { id: 'keys', title: 'Keyboard, and getting to it', html: this.renderKeys() },
      { id: 'careers', title: 'Careers, and keeping them', html: this.renderCareers() },
    ];
  }

  /**
   * Jump links rather than a collapsed accordion.
   *
   * An accordion would make the page short and every answer one click further
   * away, which is the wrong trade for a reference: somebody opens this because
   * they already have a question, and the fastest page is the one where
   * everything is present and reachable.
   */
  private renderContents(): string {
    const items = this.sections()
      .map((section) => `<li><a href="#how-${section.id}">${section.title}</a></li>`)
      .join('');
    return `<nav class="how-contents" aria-label="Contents"><ul>${items}</ul></nav>`;
  }

  private card(title: string, body: string, id?: string): string {
    return `<section class="how-card"${id ? ` id="how-${id}"` : ''}><h2>${title}</h2>${body}</section>`;
  }

  private renderMatch(): string {
    return this.card(
      'The match',
      `<p>
         Ninety minutes play themselves. You are pulled in only where you could change what
         happens — a chance, a duel, a ball at your feet — which is somewhere between five and ten
         times in a match.
       </p>
       <ol class="how-steps">
         <li><strong>The build-up.</strong> A line or two of what is happening, so you know where
             you are before anything is asked of you.</li>
         <li><strong>Six options, and the clock starts.</strong> How long you get comes from your
             awareness, composure, decision making and experience, minus the pressure you are
             under. A better footballer genuinely gets more time to think.</li>
         <li><strong>The goalkeeper commits.</strong> Partway through your window he moves, and the
             screen shows it. Waiting tells you what he has done; it also spends the time you
             were given. That trade is the game.</li>
       </ol>
       <p>
         The scoreboard carries <strong>Pause</strong>, the <strong>speed</strong>, and
         <strong>Leave</strong>. Leaving is not an undo — the rest of the match is played out
         without you and the result stands — so it takes two presses and the second one says so.
       </p>
       <p class="hint">
         Letting the clock run out is not a free pass — an instinctive action is played for you,
         and it is worse than any deliberate choice. Deciding badly beats not deciding.
       </p>`,
      'match',
    );
  }

  private renderOptions(): string {
    const families = LEGEND_ORDER.map((family) => {
      const style = FAMILY_STYLE[family];
      return `<li>
          <span class="how-family-tag" style="color: ${style.colour}">
            <i style="background: ${style.colour}"></i>${style.tag}
          </span>
          <span>${style.label}</span>
        </li>`;
    }).join('');

    return this.card(
      'Reading the six options',
      `<p>
         Each option is tinted and tagged by what kind of action it is, so the shape of your
         choices is readable before you have read a word of them.
       </p>
       <ul class="how-families">${families}</ul>
       <p class="hint">
         The tag is there as well as the colour on purpose: the grouping has to work for a
         colour-blind player, and a key in approximately the right colour is worse than no key.
       </p>`,
      'options',
    );
  }

  private renderHub(): string {
    const layouts = HUB_LAYOUTS.map(
      (key) => `<li><strong>${HUB_LAYOUT_LABELS[key]}</strong></li>`,
    ).join('');

    return this.card(
      'The career hub',
      `<p>
         The screen between matches. Four things stay pinned at the top because they matter every
         week — your last result, what was worth remarking on, the next match, and the week in
         front of you. Everything else lives in four sections: <strong>You</strong>,
         <strong>Club</strong>, <strong>Competitions</strong> and <strong>Career</strong>.
       </p>
       <p>
         Each section carries a <strong>peek</strong> beside its name — <em>Club · 1st · 3 yrs
         left</em> — so you can tell whether it is worth opening without opening it.
       </p>
       <ul class="how-list">${layouts}</ul>
       <p class="hint">
         Which of those you get is yours to choose, on the front door or in preferences. The
         division into sections is identical either way, so switching never moves anything.
       </p>`,
      'hub',
    );
  }

  private renderWeek(): string {
    const choices = WEEK_CHOICES.map(
      (choice) =>
        `<li><strong>${WEEK_LABELS[choice]}</strong> — ${WEEK_DESCRIPTIONS[choice]}</li>`,
    ).join('');

    return this.card(
      'The week before a match',
      `<p>
         One decision between fixtures, spent on the next one. Every option costs you what the
         other three would have given, and the choice cannot be taken back.
       </p>
       <ul class="how-list">${choices}</ul>
       <p class="hint">
         While you are injured there is no week to plan — you are in the treatment room and the
         fixture is going to pass without you.
       </p>`,
      'week',
    );
  }

  private renderSettings(): string {
    const paces = (Object.keys(DECISION_PACE_LABELS) as DecisionPace[])
      .map((key) => `<li><strong>${DECISION_PACE_LABELS[key]}</strong></li>`)
      .join('');
    const speeds = MATCH_SPEEDS.map(
      (speed) => `<li><strong>${speed.label}</strong> — ${speed.description}</li>`,
    ).join('');

    return this.card(
      'The settings, and what each one changes',
      `<h3>Decision pace</h3>
       <p>
         How long you get to choose. It stretches every window by the same factor, so the gap
         between a sharp footballer and a slow one is kept intact whichever you pick.
       </p>
       <ul class="how-list">${paces}</ul>
       <p class="hint">
         The default is no time limit, and it is the honest default: a two-second window on six
         options you have never read before is a reflex test rather than a decision. The keeper
         still commits on schedule at that setting, so the read is unchanged — you are simply not
         rushed.
       </p>

       <h3>Match speed</h3>
       <p>How fast the simulated minutes tick by between your moments. It never changes how long
          you get to decide, and it can be changed <strong>during a match</strong> — the button on
          the scoreboard cycles through these, and the change is remembered.</p>
       <ul class="how-list">${speeds}</ul>

       <h3>Career hub</h3>
       <p>Tabs or folds, as above. A matter of taste rather than difficulty.</p>`,
      'settings',
    );
  }

  private renderKeys(): string {
    return this.card(
      'Keyboard, and getting to it',
      `<ul class="how-list how-keys">
         <li><kbd>1</kbd>–<kbd>6</kbd> choose an option during a moment.</li>
         <li><kbd>Tab</kbd> moves between controls; the focus ring is always visible.</li>
         <li><kbd>Enter</kbd> or <kbd>Space</kbd> presses whatever is focused.</li>
         <li><kbd>D</kbd> opens the simulation debug panel, which shows exactly how the last
             action was resolved.</li>
       </ul>
       <p class="hint">
         The whole match can be played from the keyboard. If your system is set to reduce motion
         the interface honours it — the timer bar is deliberately exempt, because reducing motion
         must not become reducing information.
       </p>`,
      'keys',
    );
  }

  private renderCareers(): string {
    return this.card(
      'Careers, and keeping them',
      `<ul class="how-list">
         <li><strong>Three slots.</strong> Three careers at once, kept apart — playing one never
             touches another.</li>
         <li><strong>A quick match</strong> is a single game against anybody, on a separate
             record. Nothing in it touches a career.</li>
         <li><strong>The wall of fame</strong> keeps careers that have ended, ranked.</li>
         <li><strong>Export and import.</strong> Everything is saved in this browser, which means
             clearing site data would end it. The export on the front door is the copy that
             survives that.</li>
       </ul>`,
      'careers',
    );
  }
}
