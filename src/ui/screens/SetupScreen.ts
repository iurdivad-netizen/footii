import { PLAYER_PRESETS, TEAMS } from '../../data/gameData.ts';
import { positionLabel } from '../../core/player/positions.ts';
import { TACTICAL_STYLE_LABELS } from '../../core/team/team.ts';

export interface SetupSelection {
  presetId: string;
  teamId: string;
  opponentId: string;
  seed: string;
  length: number;
}

/** Team selection, player selection and the match seed. */
export class SetupScreen {
  readonly element: HTMLElement;

  constructor(private readonly onStart: (selection: SetupSelection) => void) {
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

        <div class="field">
          <label for="length">Match length</label>
          <select id="length">
            <option value="90">Full match (90 minutes)</option>
            <option value="45">Half (45 minutes)</option>
            <option value="20">Quick test (20 minutes)</option>
          </select>
        </div>
      </div>

      <button class="primary" id="kick-off">Kick off</button>

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

    this.element.querySelector<HTMLButtonElement>('#kick-off')!.addEventListener('click', () => {
      const teamId = this.element.querySelector<HTMLSelectElement>('#team')!.value;
      let opponentId = this.element.querySelector<HTMLSelectElement>('#opponent')!.value;
      if (opponentId === teamId) {
        opponentId = TEAMS.find((t) => t.id !== teamId)!.id;
      }
      this.onStart({
        presetId: presetSelect.value,
        teamId,
        opponentId,
        seed: this.element.querySelector<HTMLInputElement>('#seed')!.value.trim() || 'footii',
        length: Number(this.element.querySelector<HTMLSelectElement>('#length')!.value),
      });
    });
  }
}
