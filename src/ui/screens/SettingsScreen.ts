import { DECISION_PACE_LABELS } from '../../simulation/DecisionTimer.ts';
import type { DecisionPace } from '../../simulation/DecisionTimer.ts';
import type { GameSettings } from '../../persistence/storage.ts';
import { MATCH_SPEEDS } from '../screens/matchSpeeds.ts';
import { HUB_LAYOUTS, HUB_LAYOUT_LABELS } from './hubSections.ts';
import type { HubLayout } from './hubSections.ts';

/**
 * SETTINGS, AND THE SAVE THEY LIVE IN
 *
 * Both of these used to be on the front door, which used to be the careers
 * page, and the front door is a menu now — so a menu entry called Settings was
 * scrolling a page called Careers to a block two thirds of the way down it.
 * That is a link that lands somewhere and hopes, and the fix is the page it was
 * pretending to open.
 *
 * WHY THE SAVE PANEL COMES WITH THEM rather than staying with the careers. It
 * is the obvious place for it — the careers are what the file contains — and it
 * is the wrong one: export and import are about the BROWSER, not about any
 * career, and importing replaces all three of them at once. It belongs with the
 * other things that are true of the whole installation rather than of one
 * footballer.
 *
 * NOTHING HERE IS ABOUT A CAREER, AND NOTHING ON THE CAREERS PAGE IS ABOUT
 * SETTINGS. That is the whole point of the split: a page that offers everything
 * offers no answer to "where do I go", and every screen in this game is now
 * either one question or the menu.
 */
export interface SettingsHandlers {
  settings: GameSettings;
  onSettingsChange: (settings: Partial<GameSettings>) => void;
  onExport: () => void;
  onImport: (text: string) => void;
  onBack: () => void;
  /** The outcome of the last export or import, if there was one. */
  status?: string;
}

export class SettingsScreen {
  readonly element: HTMLElement;

  constructor(handlers: SettingsHandlers) {
    const { settings } = handlers;

    this.element = document.createElement('section');
    this.element.className = 'screen settings-screen';
    this.element.innerHTML = `
      <header class="home-header">
        <h1>Settings</h1>
        <p class="tagline">Saved between sessions and applied to every match.</p>
        <button class="ghost" id="settings-back">Back to menu</button>
      </header>

      ${handlers.status ? `<p class="home-status">${handlers.status}</p>` : ''}

      <div class="home-settings">
        <h2>How you want to play</h2>
        <div class="settings-row">
          <div class="field">
            <label for="home-pace">Decision pace</label>
            <select id="home-pace">
              ${(Object.keys(DECISION_PACE_LABELS) as DecisionPace[])
                .map(
                  (key) =>
                    `<option value="${key}" ${key === settings.pace ? 'selected' : ''}>${DECISION_PACE_LABELS[key]}</option>`,
                )
                .join('')}
            </select>
            <p class="hint" id="pace-note"></p>
          </div>
          <div class="field">
            <label for="home-speed">Match speed</label>
            <select id="home-speed">
              ${MATCH_SPEEDS.map(
                (speed, index) =>
                  `<option value="${index}" ${index === settings.matchSpeed ? 'selected' : ''}>${speed.label} — ${speed.description}</option>`,
              ).join('')}
            </select>
            <p class="hint">How fast the simulated minutes tick by between your moments.</p>
          </div>
          <div class="field">
            <label for="home-sound">Sound</label>
            <select id="home-sound">
              <option value="on" ${settings.sound ? 'selected' : ''}>On</option>
              <option value="off" ${settings.sound ? '' : 'selected'}>Off</option>
            </select>
            <p class="hint">
              The crowd, the clock, the keeper's commit and the outcome — all synthesized in the
              browser, nothing downloaded. Everything audible is also on screen, so muting loses
              nothing you need.
            </p>
          </div>
          <div class="field">
            <label for="home-hub">Career hub</label>
            <select id="home-hub">
              ${HUB_LAYOUTS.map(
                (key) =>
                  `<option value="${key}" ${key === settings.hubLayout ? 'selected' : ''}>${HUB_LAYOUT_LABELS[key]}</option>`,
              ).join('')}
            </select>
            <p class="hint">
              Where the cards you do not need every week go. The next match and the week are
              pinned either way.
            </p>
          </div>
        </div>
      </div>

      <div class="home-card save-data-card">
        <h2>Your save</h2>
        <p class="hint">
          Everything — every career, the wall of fame and your preferences — lives in this
          browser's storage, and nowhere else. Clearing site data deletes it, and another browser
          or another machine will not have it. Exporting writes the lot to a file you keep.
        </p>
        <div class="save-actions">
          <button class="ghost" id="export-save">Export to a file</button>
          <button class="ghost" id="import-save">Import from a file</button>
          <input type="file" id="import-file" accept="application/json,.json" hidden />
        </div>
        <p class="hint">
          Importing <strong>replaces</strong> everything in this browser with the contents of the
          file. It is not a merge — a half-imported save would have careers from one machine and a
          wall from another. Export first if what is here is worth keeping.
        </p>
      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('#settings-back')!
      .addEventListener('click', handlers.onBack);

    this.element
      .querySelector<HTMLButtonElement>('#export-save')!
      .addEventListener('click', handlers.onExport);

    // The file input does the picking; the button in front of it does the
    // asking, because a bare <input type="file"> cannot be styled and reads as
    // a form control on a screen that has none.
    const file = this.element.querySelector<HTMLInputElement>('#import-file');
    this.element
      .querySelector<HTMLButtonElement>('#import-save')!
      .addEventListener('click', () => file?.click());
    file?.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      const text = await chosen.text();
      // Cleared so that picking the SAME file twice fires `change` both times.
      file.value = '';
      handlers.onImport(text);
    });

    const paceSelect = this.element.querySelector<HTMLSelectElement>('#home-pace')!;
    const paceNote = this.element.querySelector<HTMLElement>('#pace-note')!;
    const updatePaceNote = () => {
      paceNote.textContent =
        paceSelect.value === 'untimed'
          ? 'The keeper still commits on schedule, so the read is unchanged — you just are not rushed.'
          : 'Stretches every decision window equally, keeping the gap between players intact.';
    };
    paceSelect.addEventListener('change', () => {
      updatePaceNote();
      handlers.onSettingsChange({ pace: paceSelect.value as DecisionPace });
    });
    updatePaceNote();

    const soundSelect = this.element.querySelector<HTMLSelectElement>('#home-sound')!;
    soundSelect.addEventListener('change', () => {
      handlers.onSettingsChange({ sound: soundSelect.value === 'on' });
    });

    const hubSelect = this.element.querySelector<HTMLSelectElement>('#home-hub')!;
    hubSelect.addEventListener('change', () => {
      handlers.onSettingsChange({ hubLayout: hubSelect.value as HubLayout });
    });

    const speedSelect = this.element.querySelector<HTMLSelectElement>('#home-speed')!;
    speedSelect.addEventListener('change', () => {
      handlers.onSettingsChange({ matchSpeed: Number(speedSelect.value) });
    });
  }
}
