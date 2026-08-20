import type { Player } from '../../core/player/player.ts';
import type { Team } from '../../core/team/team.ts';
import { leagueName } from '../../core/career/countries.ts';
import { squadLevel } from '../../core/career/transfers.ts';
import { describeFailure, perceivedLevel } from '../../core/career/trial.ts';

/**
 * THE VERDICT ON A TRIAL
 *
 * Whether they signed him, and where he goes if they did not.
 *
 * The number is shown, deliberately. A trial you fail without being told the bar
 * or the mark is a refusal dressed up as football, and the whole reason a trial
 * exists rather than a filtered club list is that reaching above yourself should
 * be a decision you can weigh — which means seeing what it needed and what you
 * managed.
 *
 * A failed trial is never a dead end. There is always somewhere that would have
 * taken him anyway, and the screen offers it directly rather than sending him
 * back to the menu to work it out. Going back is still there for somebody who
 * would rather aim somewhere else entirely.
 */
export interface TrialResult {
  club: Team;
  player: Player;
  rating: number;
  required: number;
  passed: boolean;
  /** Where he would go instead. Null only if literally nobody would have him. */
  fallback: Team | null;
}

export interface TrialHandlers {
  /** Start the career at this club. */
  onAccept: (clubId: string) => void;
  /** Back to the setup screen to choose again. */
  onBack: () => void;
}

export class TrialResultScreen {
  readonly element: HTMLElement;

  constructor(result: TrialResult, handlers: TrialHandlers) {
    const { club, player, rating, required, passed, fallback } = result;

    this.element = document.createElement('section');
    this.element.className = `screen trial-screen ${passed ? 'passed' : 'failed'}`;
    this.element.innerHTML = `
      <header class="trial-head">
        <p class="trial-kicker">Trial at ${club.name}</p>
        <h1>${passed ? 'They have seen enough' : 'Not this time'}</h1>
      </header>

      <div class="trial-marks">
        <div class="trial-mark">
          <span class="trial-value ${passed ? 'good' : 'bad'}">${rating.toFixed(1)}</span>
          <span class="trial-label">Your rating</span>
        </div>
        <span class="trial-versus">v</span>
        <div class="trial-mark">
          <span class="trial-value">${required.toFixed(1)}</span>
          <span class="trial-label">What they wanted</span>
        </div>
      </div>

      <p class="trial-verdict">
        ${
          passed
            ? `${club.name} have offered you a place. You start in ${leagueName(club.country)}
               with a squad rated ${squadLevel(club)} around you — above the ${perceivedLevel(player)}
               they were looking at.`
            : `${club.name} pass. ${describeFailure(rating, required)}`
        }
      </p>

      <div class="trial-actions">
        ${
          passed
            ? `<button class="primary" data-sign="${club.id}">Sign for ${club.shortName}</button>`
            : fallback
              ? `<p class="hint">
                   ${fallback.name} would take you today — ${leagueName(fallback.country)}, squad
                   rated ${squadLevel(fallback)}. It is a smaller start and it is a real one.
                 </p>
                 <button class="primary" data-sign="${fallback.id}">Sign for ${fallback.shortName}</button>`
              : `<p class="hint">
                   Nobody at this level would take you yet. Aim lower and build a reputation first.
                 </p>`
        }
        <button class="ghost" id="trial-back">
          ${passed ? 'Choose somewhere else' : 'Try a different club'}
        </button>
      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('[data-sign]')
      ?.addEventListener('click', (event) => {
        handlers.onAccept((event.currentTarget as HTMLElement).dataset.sign!);
      });
    this.element
      .querySelector<HTMLButtonElement>('#trial-back')!
      .addEventListener('click', handlers.onBack);
  }
}
