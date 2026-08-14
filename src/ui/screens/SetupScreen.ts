import { PLAYER_PRESETS, TEAMS } from '../../data/gameData.ts';
import { positionLabel } from '../../core/player/positions.ts';
import { TACTICAL_STYLE_LABELS } from '../../core/team/team.ts';
import { DECISION_PACE, DECISION_PACE_LABELS } from '../../simulation/DecisionTimer.ts';
import type { DecisionPace } from '../../simulation/DecisionTimer.ts';

export interface SetupSelection {
  presetId: string;
  teamId: string;
  opponentId: string;
  seed: string;
  length: number;
  pace: DecisionPace;
}

export interface SetupHandlers {
  onQuickMatch: (selection: SetupSelection) => void;
  onStartCareer: (selection: SetupSelection) => void;
  /** Present only when a career is already in progress. */
  onContinueCareer?: () => void;
  careerSummary?: string;
}

/** Team selection, player selection, match seed, and the two entry points. */
export class SetupScreen {
  readonly element: HTMLElement;

  constructor(private readonly handlers: SetupHandlers) {
    this.element = document.createElement('section');
    this.element.className = 'screen setup-screen';
    this.element.innerHTML = `
      <header class="setup-header">
        <h1>FOOTII</h1>
        <p class="tagline">One player. Ninety minutes. Six choices at a time.</p>
      </header>

      <div class="setup-grid">
        <div class="field">
          <label for="preset">Your player</label>
          <select id="preset">
            ${PLAYER_PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}
          </select>
          <p class="hint" id="preset-description"></p>
        </div>

        <div class="field">
          <label for="team">Your club</label>
          <select id="team">
            ${TEAMS.map(
              (t) =>
                `<option value="${t.id}" ${t.id === 'northport-city' ? 'selected' : ''}>${t.name} — ${TACTICAL_STYLE_LABELS[t.style]}</option>`,
            ).join('')}
          </select>
        </div>

        <div class="field">
          <label for="opponent">Opponent <span class="field-note">(single match only)</span></label>
          <select id="opponent">
            ${TEAMS.map(
              (t) =>
                `<option value="${t.id}" ${t.id === 'ashford-united' ? 'selected' : ''}>${t.name} — ${TACTICAL_STYLE_LABELS[t.style]}</option>`,
            ).join('')}
          </select>
        </div>

        <div class="field">
          <label for="seed">Match seed</label>
          <input id="seed" type="text" value="footii-1" spellcheck="false" />
          <p class="hint">The same seed always produces the same match.</p>
        </div>

        <div class="field">
          <label for="pace">Decision pace</label>
          <select id="pace">
            ${(Object.keys(DECISION_PACE) as DecisionPace[])
              .map(
                (key) =>
                  `<option value="${key}" ${key === 'standard' ? 'selected' : ''}>${DECISION_PACE_LABELS[key]}</option>`,
              )
              .join('')}
          </select>
          <p class="hint">
            Stretches every decision window equally. Young, low-awareness players get very
            little time — raise this while you learn them.
          </p>
        </div>

        <div class="field">
          <label for="length">Match length</label>
          <select id="length">
            <option value="90">Full match (90 minutes)</option>
            <option value="45">Half (45 minutes)</option>
            <option value="20">Quick test (20 minutes)</option>
          </select>
        </div>
      </div>

      <div class="setup-actions">
        <button class="primary" id="start-career">Start a career</button>
        <button id="kick-off">Play a single match</button>
      </div>
      <p class="hint">
        A career follows one footballer season by season: your ratings drive development, and as
        your awareness, composure and decision making grow you get measurably more time on the ball.
      </p>

      ${
        handlers.onContinueCareer
          ? `<div class="continue-career">
               <h2>Career in progress</h2>
               <p>${handlers.careerSummary ?? ''}</p>
               <button class="primary" id="continue-career">Continue career</button>
             </div>`
          : ''
      }

      <div class="setup-notes">
        <h2>How it works</h2>
        <ul>
          <li>The match simulates itself. You are pulled in only when you can change the outcome.</li>
          <li>You get six contextual options and a decision window measured in seconds.</li>
          <li>Your window is calculated from your awareness, composure, decision making and experience — minus the pressure you are under.</li>
          <li><strong>Watch the goalkeeper.</strong> He commits partway through your window. Waiting tells you what he has done, but costs you time.</li>
          <li>Press <kbd>D</kbd> at any point to open the simulation debug panel.</li>
        </ul>
      </div>`;

    const presetSelect = this.element.querySelector<HTMLSelectElement>('#preset')!;
    const description = this.element.querySelector<HTMLElement>('#preset-description')!;
    const updateDescription = () => {
      const preset = PLAYER_PRESETS.find((p) => p.id === presetSelect.value);
      if (!preset) return;
      const player = preset.create();
      description.textContent = `${preset.description} (${positionLabel(player.position)})`;
    };
    presetSelect.addEventListener('change', updateDescription);
    updateDescription();

    const collect = (): SetupSelection => {
      const teamId = this.element.querySelector<HTMLSelectElement>('#team')!.value;
      let opponentId = this.element.querySelector<HTMLSelectElement>('#opponent')!.value;
      if (opponentId === teamId) {
        opponentId = TEAMS.find((t) => t.id !== teamId)!.id;
      }
      return {
        presetId: presetSelect.value,
        teamId,
        opponentId,
        seed: this.element.querySelector<HTMLInputElement>('#seed')!.value.trim() || 'footii',
        length: Number(this.element.querySelector<HTMLSelectElement>('#length')!.value),
        pace: this.element.querySelector<HTMLSelectElement>('#pace')!.value as DecisionPace,
      };
    };

    this.element
      .querySelector<HTMLButtonElement>('#kick-off')!
      .addEventListener('click', () => this.handlers.onQuickMatch(collect()));
    this.element
      .querySelector<HTMLButtonElement>('#start-career')!
      .addEventListener('click', () => this.handlers.onStartCareer(collect()));
    this.element
      .querySelector<HTMLButtonElement>('#continue-career')
      ?.addEventListener('click', () => this.handlers.onContinueCareer?.());
  }
}
