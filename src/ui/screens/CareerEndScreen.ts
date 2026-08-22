import type { CareerEnding, CareerLegacy } from '../../core/career/legacy.ts';
import { isWorthRemembering } from '../../core/career/legacy.ts';
import { leagueName } from '../../core/career/countries.ts';
import { renderCareerRecord, renderFigures } from './careerRecord.ts';
import { positionLabel } from '../../core/player/positions.ts';

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
 *
 * WHAT IT RENDERS FROM changed, and the change is worth stating. The four
 * panels used to be built from the live `CareerState`, which meant this screen
 * could show you things the wall of fame would never keep — so the fullest view
 * of a career existed exactly once, in the moment you were deciding to destroy
 * it. They are now built from the legacy's own `detail`, the same record the
 * wall stores, which makes this screen an honest preview rather than a farewell
 * to information nobody would see again. See ui/screens/careerRecord.ts.
 */
export interface CareerEndContext {
  /**
   * The career, reduced to what the wall of fame will keep — which is now
   * everything this screen shows. It used to take the live `CareerState`
   * beside this for the tables; it does not any more, and the fact that it
   * does not is the guarantee that nothing here is about to be lost.
   */
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
    const { legacy, ending, forced } = context;
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

      ${renderFigures(legacy)}

      ${legacy.detail ? renderCareerRecord(legacy, legacy.detail) : ''}

      <div class="career-end-actions">
        <p class="hint">
          ${
            remembered
              ? `This career will be kept on the wall of fame, scored at
                 <strong>${legacy.score}</strong> — everything on this screen with it, readable
                 from the wall whenever you want it. What goes is the career itself: the season
                 you were in, the squad and the world it was played in.`
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
