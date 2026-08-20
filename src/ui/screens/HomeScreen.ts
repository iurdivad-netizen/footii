import { DECISION_PACE_LABELS } from '../../simulation/DecisionTimer.ts';
import type { DecisionPace } from '../../simulation/DecisionTimer.ts';
import type { GameSettings } from '../../persistence/storage.ts';
import { MATCH_SPEEDS } from '../screens/matchSpeeds.ts';
import type { CareerLegacy } from '../../core/career/legacy.ts';
import { rankLegacies } from '../../core/career/legacy.ts';

/**
 * HOME SCREEN
 *
 * The front door: pick a mode, and set how you want to play, before configuring
 * anything about a specific match.
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
  onNewCareer: () => void;
  onQuickMatch: () => void;
  onContinueCareer?: () => void;
  /**
   * Open the end screen for the saved career.
   *
   * Named for what it now does. This used to be `onAbandonCareer` and used to
   * mean it — a `confirm()` here, and the career was gone. Ending one is a
   * screen of its own now, so the home screen only opens it.
   */
  onEndCareer?: () => void;
  career?: CareerSummary;
  /** Finished careers, for the wall. */
  hallOfFame?: readonly CareerLegacy[];
  onHallOfFame?: () => void;
  settings: GameSettings;
  onSettingsChange: (settings: Partial<GameSettings>) => void;
}

export class HomeScreen {
  readonly element: HTMLElement;

  constructor(handlers: HomeHandlers) {
    const { career, settings } = handlers;

    this.element = document.createElement('section');
    this.element.className = 'screen home-screen';
    this.element.innerHTML = `
      <header class="home-header">
        <div class="home-crest" aria-hidden="true">
          <span class="crest-ring"></span>
          <span class="crest-dot"></span>
        </div>
        <h1>FOOTII</h1>
        <p class="tagline">One player. Ninety minutes. Six choices at a time.</p>
      </header>

      ${career ? this.renderCareerCard(career) : ''}
      ${this.renderHallOfFame(handlers.hallOfFame ?? [])}

      <div class="home-modes">
        <button class="home-mode" id="new-career">
          <span class="mode-icon" aria-hidden="true">◎</span>
          <span class="mode-title">${career ? 'New career' : 'Career'}</span>
          <span class="mode-desc">
            Build or pick a footballer and follow him season by season. Your ratings drive
            development — and as your awareness and composure grow, you get measurably more time
            on the ball.
          </span>
          <span class="mode-cta">Start a career →</span>
        </button>

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
        </div>
      </div>

      <details class="home-help">
        <summary>How it works</summary>
        <ul>
          <li>The match simulates itself. You are pulled in only when you can change the outcome.</li>
          <li>Each chance is told as a short build-up, then six options appear and the clock starts.</li>
          <li>Your decision window comes from your awareness, composure, decision making and
              experience — minus the pressure you are under.</li>
          <li><strong>Watch the goalkeeper.</strong> He commits partway through your window.
              Waiting tells you what he has done, but costs you time.</li>
          <li>Press <kbd>D</kbd> at any point for the simulation debug panel.</li>
        </ul>
      </details>`;

    this.element
      .querySelector<HTMLButtonElement>('#new-career')!
      .addEventListener('click', handlers.onNewCareer);
    this.element
      .querySelector<HTMLButtonElement>('#quick-match')!
      .addEventListener('click', handlers.onQuickMatch);
    this.element
      .querySelector<HTMLButtonElement>('#continue-career')
      ?.addEventListener('click', () => handlers.onContinueCareer?.());
    // No browser dialog: the end screen shows what is about to be lost, which
    // is a better question than "are you sure?" ever was.
    this.element
      .querySelector<HTMLButtonElement>('#end-career')
      ?.addEventListener('click', () => handlers.onEndCareer?.());
    this.element
      .querySelector<HTMLButtonElement>('#open-hall')
      ?.addEventListener('click', () => handlers.onHallOfFame?.());

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

    const speedSelect = this.element.querySelector<HTMLSelectElement>('#home-speed')!;
    speedSelect.addEventListener('change', () => {
      handlers.onSettingsChange({ matchSpeed: Number(speedSelect.value) });
    });
  }

  /**
   * The wall, in miniature.
   *
   * Three entries and a way in. The home screen's job is to say that finished
   * careers are kept and that this one will be too — the full list is a screen
   * of its own, and putting it here would bury the button that starts a game.
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

  private renderCareerCard(career: CareerSummary): string {
    const progress = career.total > 0 ? Math.round((career.played / career.total) * 100) : 0;
    return `
      <div class="home-card featured">
        <div class="career-card-head">
          <div>
            <h2>Continue career</h2>
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
          <button class="primary" id="continue-career">Continue</button>
          <button class="ghost" id="end-career">End career</button>
        </div>
      </div>`;
  }
}
