import { PLAYER_PRESETS, TEAMS } from '../../data/gameData.ts';
import { positionLabel } from '../../core/player/positions.ts';
import { TACTICAL_STYLE_LABELS } from '../../core/team/team.ts';
import { CUSTOM_PLAYER_ID } from '../../data/gameData.ts';

export interface SetupSelection {
  /** A preset id, or CUSTOM_PLAYER_ID when using a created player. */
  presetId: string;
  teamId: string;
  opponentId: string;
  seed: string;
  length: number;
}

export interface SetupHandlers {
  mode: 'career' | 'quick';
  onStart: (selection: SetupSelection) => void;
  /**
   * Opens the creator. The current club/seed/pace selection travels with it so
   * that finishing the creator can start the game directly.
   */
  onCreatePlayer: (selection: SetupSelection) => void;
  onBack: () => void;
  /** A custom player built this session, offered alongside the pre-builds. */
  customLabel?: string;
}

/** Team selection, player selection, match seed, and the two entry points. */
export class SetupScreen {
  readonly element: HTMLElement;

  constructor(private readonly handlers: SetupHandlers) {
    this.element = document.createElement('section');
    this.element.className = 'screen setup-screen';
    this.element.innerHTML = `
      <header class="setup-header">
        <h1>${handlers.mode === 'career' ? 'New career' : 'Quick match'}</h1>
        <p class="tagline">
          ${
            handlers.mode === 'career'
              ? 'Choose who you are and where you start. The rest is up to you.'
              : 'A single match. Nothing is saved to a career.'
          }
        </p>
      </header>

      <div class="setup-grid">
        <div class="field">
          <label for="preset">Your player</label>
          <select id="preset">
            ${
              handlers.customLabel
                ? `<option value="${CUSTOM_PLAYER_ID}" selected>${handlers.customLabel}</option>`
                : ''
            }
            ${PLAYER_PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}
          </select>
          <p class="hint" id="preset-description"></p>
          <button type="button" id="create-player" class="ghost">
            ${handlers.customLabel ? 'Edit your custom player' : 'Create your own player'}
          </button>
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

        <div class="field" ${handlers.mode === 'career' ? 'hidden' : ''}>
          <label for="opponent">Opponent</label>
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

        <div class="field" ${handlers.mode === 'career' ? 'hidden' : ''}>
          <label for="length">Match length</label>
          <select id="length">
            <option value="90">Full match (90 minutes)</option>
            <option value="45">Half (45 minutes)</option>
            <option value="20">Quick test (20 minutes)</option>
          </select>
        </div>
      </div>

      <div class="setup-actions">
        <button class="primary" id="kick-off">
          ${handlers.mode === 'career' ? 'Start career' : 'Kick off'}
        </button>
        <button id="setup-back" class="ghost">Back</button>
      </div>

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
      if (presetSelect.value === CUSTOM_PLAYER_ID) {
        description.textContent = 'Your own creation. Potential is hidden.';
        return;
      }
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
      };
    };

    this.element
      .querySelector<HTMLButtonElement>('#kick-off')!
      .addEventListener('click', () => this.handlers.onStart(collect()));
    this.element
      .querySelector<HTMLButtonElement>('#setup-back')!
      .addEventListener('click', () => this.handlers.onBack());
    this.element
      .querySelector<HTMLButtonElement>('#create-player')!
      .addEventListener('click', () => this.handlers.onCreatePlayer(collect()));
  }
}
