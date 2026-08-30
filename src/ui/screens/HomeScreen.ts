import { DECISION_PACE_LABELS } from '../../simulation/DecisionTimer.ts';
import type { DecisionPace } from '../../simulation/DecisionTimer.ts';
import type { GameSettings } from '../../persistence/storage.ts';
import { MATCH_SPEEDS } from '../screens/matchSpeeds.ts';
import { HUB_LAYOUTS, HUB_LAYOUT_LABELS } from './hubSections.ts';
import type { HubLayout } from './hubSections.ts';
import type { CareerLegacy } from '../../core/career/legacy.ts';
import { rankLegacies } from '../../core/career/legacy.ts';
import { gameLogo } from '../logo.ts';

/**
 * HOME SCREEN
 *
 * The front door: pick a career, and set how you want to play, before
 * configuring anything about a specific match.
 *
 * It used to offer exactly one career, because the save held exactly one. That
 * is what made starting a second career cost you the first, and it is why the
 * button for it said "Abandon". The front door is now a rack of slots: every
 * career you have going, side by side, with the empty ones as real places to
 * start rather than an absence.
 *
 * Decision pace lives here rather than on the setup screen because it is a
 * global preference about difficulty, not a property of one match — and because
 * passing it per match meant it was never saved, so reloading silently reverted
 * a deliberately relaxed game to Standard.
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
   * screen of its own now, so the home screen only opens it.
   */
  onEndCareer: (slot: number) => void;
  onStartCareer: (slot: number) => void;
  onQuickMatch: () => void;
  /** Finished careers, for the wall. */
  hallOfFame?: readonly CareerLegacy[];
  onHallOfFame?: () => void;
  /** The manual. Always reachable, never a gate. */
  onHowToPlay?: () => void;
  onExport?: () => void;
  onImport?: (text: string) => void;
  /** The outcome of the last export or import, if there was one. */
  status?: string;
  settings: GameSettings;
  onSettingsChange: (settings: Partial<GameSettings>) => void;
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
    const { settings, slots } = handlers;
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

      ${this.renderHallOfFame(handlers.hallOfFame ?? [])}

      <div class="home-modes single">
        <button class="home-mode" id="quick-match">
          <span class="mode-icon" aria-hidden="true">▶</span>
          <span class="mode-title">Quick match</span>
          <span class="mode-desc">
            A single game, any player against any opponent. Kept on a separate record — nothing
            here touches a career.
          </span>
          <span class="mode-cta">Play one match →</span>
        </button>
      </div>

      <div class="home-settings">
        <h2>How you want to play</h2>
        <p class="hint">Saved between sessions and applied to every match.</p>
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

      ${this.renderSaveData()}

      <div class="home-help-row">
        <button class="ghost" id="open-how">How to play</button>
        <p class="hint">
          What the screens do, what each setting changes, and the one read the whole match is
          built around.
        </p>
      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('#home-back')
      ?.addEventListener('click', () => handlers.onBack?.());
    this.element
      .querySelector<HTMLButtonElement>('#quick-match')!
      .addEventListener('click', handlers.onQuickMatch);
    this.element
      .querySelector<HTMLButtonElement>('#open-hall')
      ?.addEventListener('click', () => handlers.onHallOfFame?.());
    this.element
      .querySelector<HTMLButtonElement>('#open-how')
      ?.addEventListener('click', () => handlers.onHowToPlay?.());

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

    this.element
      .querySelector<HTMLButtonElement>('#export-save')
      ?.addEventListener('click', () => handlers.onExport?.());

    // The file input does the picking; the button in front of it does the
    // asking, because a bare <input type="file"> cannot be styled and reads as
    // a form control on a screen that has none.
    const file = this.element.querySelector<HTMLInputElement>('#import-file');
    this.element
      .querySelector<HTMLButtonElement>('#import-save')
      ?.addEventListener('click', () => file?.click());
    file?.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      const text = await chosen.text();
      // Cleared so that picking the SAME file twice fires `change` both times.
      file.value = '';
      handlers.onImport?.(text);
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

    const hubSelect = this.element.querySelector<HTMLSelectElement>('#home-hub')!;
    hubSelect.addEventListener('change', () => {
      handlers.onSettingsChange({ hubLayout: hubSelect.value as HubLayout });
    });

    const speedSelect = this.element.querySelector<HTMLSelectElement>('#home-speed')!;
    speedSelect.addEventListener('change', () => {
      handlers.onSettingsChange({ matchSpeed: Number(speedSelect.value) });
    });
  }

  /**
   * The wall, in miniature.
   *
   * Three entries and a way in. The home screen's job is to say that finished
   * careers are kept and that these ones will be too — the full list is a
   * screen of its own, and putting it here would bury the rack above it.
   *
   * Nothing is rendered until a career has actually finished. An empty wall
   * with an explanation would be a panel about a feature rather than a feature,
   * and the front door already has enough to read.
   */
  private renderHallOfFame(entries: readonly CareerLegacy[]): string {
    if (entries.length === 0) return '';
    const top = rankLegacies(entries).slice(0, 3);
    const rows = top
      .map(
        (entry, index) =>
          `<li>
            <span class="hall-mini-rank">${index + 1}</span>
            <span class="hall-mini-name">${entry.name}</span>
            <span class="hall-mini-note">
              ${entry.goals} goals · ${entry.seasons} ${entry.seasons === 1 ? 'season' : 'seasons'}
            </span>
            <span class="hall-mini-score">${entry.score}</span>
          </li>`,
      )
      .join('');

    return `
      <div class="home-card hall-mini">
        <div class="hall-mini-head">
          <h2>Wall of fame</h2>
          <button class="ghost small" id="open-hall">
            ${entries.length} finished ${entries.length === 1 ? 'career' : 'careers'} →
          </button>
        </div>
        <ol class="hall-mini-list">${rows}</ol>
      </div>`;
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
  private renderSaveData(): string {
    return `
      <details class="home-help save-data">
        <summary>Your save</summary>
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
      </details>`;
  }
}
