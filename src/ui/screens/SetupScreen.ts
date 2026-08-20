import { PLAYER_PRESETS, TEAMS, getPreset } from '../../data/gameData.ts';
import type { Player } from '../../core/player/player.ts';
import { positionLabel } from '../../core/player/positions.ts';
import { TACTICAL_STYLE_LABELS } from '../../core/team/team.ts';
import type { Team } from '../../core/team/team.ts';
import { getCountry } from '../../core/career/countries.ts';
import { clubStanding, describeTrial, reachOf, trialRequirement } from '../../core/career/trial.ts';
import type { ClubStanding } from '../../core/career/trial.ts';
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
  /**
   * That custom player himself, when there is one.
   *
   * The club list is banded by who you are — see core/career/trial.ts — so the
   * screen needs the actual player and not only his label. Without it a created
   * player would be offered the pre-build's clubs, which is a different list.
   */
  customPlayer?: Player;
}

/** Team selection, player selection, match seed, and the two entry points. */
export class SetupScreen {
  readonly element: HTMLElement;

  /**
   * The player a preset id refers to.
   *
   * Falls back to the young prospect for a custom slot with nothing built yet,
   * which is what the career flow does with it too.
   */
  private playerFor(presetId: string): Player {
    if (presetId === CUSTOM_PLAYER_ID) {
      return this.handlers.customPlayer ?? getPreset('young-prospect').create();
    }
    return (PLAYER_PRESETS.find((p) => p.id === presetId) ?? PLAYER_PRESETS[0]!).create();
  }

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
          <select id="team"></select>
          <p class="hint" id="club-note"></p>
        </div>

        <div class="field" ${handlers.mode === 'career' ? 'hidden' : ''}>
          <label for="opponent">Opponent</label>
          <select id="opponent">
            ${TEAMS.map(
              (t) =>
                `<option value="${t.id}" ${t.id === 'ashford-united' ? 'selected' : ''}>${clubOption(t)}</option>`,
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
    // The club list depends on WHO you are, so it is rebuilt whenever the
    // player changes: a veteran and a seventeen-year-old are not offered the
    // same clubs, and a list that did not move would be offering one of them a
    // lie. Only in career mode — a quick match is a friendly against anybody.
    const teamSelect = this.element.querySelector<HTMLSelectElement>('#team')!;
    const clubNote = this.element.querySelector<HTMLElement>('#club-note')!;

    const renderClubs = () => {
      const previous = teamSelect.value;
      if (handlers.mode !== 'career') {
        teamSelect.innerHTML = TEAMS.map(
          (t) => `<option value="${t.id}">${clubOption(t)}</option>`,
        ).join('');
        clubNote.textContent = '';
        teamSelect.value = previous || 'northport-city';
        return;
      }

      const player = this.playerFor(presetSelect.value);
      const banded: Record<ClubStanding, Team[]> = { open: [], trial: [], closed: [] };
      for (const team of TEAMS) banded[clubStanding(player, team)].push(team);

      const group = (standing: ClubStanding, label: string) => {
        const clubs = banded[standing];
        if (clubs.length === 0) return '';
        return `<optgroup label="${label} (${clubs.length})">${clubs
          .map(
            (t) =>
              `<option value="${t.id}" ${standing === 'closed' ? 'disabled' : ''}>${clubOption(t)}${
                standing === 'trial' ? ` — trial, ${trialRequirement(reachOf(player, t))} needed` : ''
              }</option>`,
          )
          .join('')}</optgroup>`;
      };

      teamSelect.innerHTML =
        group('open', 'Would sign you') +
        group('trial', 'Would give you a trial') +
        group('closed', 'Out of your reach');

      // Keep the choice if it is still available; otherwise fall to the best
      // club that would simply take him, which is the sensible default.
      const stillThere = [...banded.open, ...banded.trial].some((t) => t.id === previous);
      teamSelect.value = stillThere
        ? previous
        : (banded.open[0] ?? banded.trial[0] ?? TEAMS[0]!).id;
      updateClubNote();
    };

    const updateClubNote = () => {
      if (handlers.mode !== 'career') return;
      const team = TEAMS.find((t) => t.id === teamSelect.value);
      if (!team) return;
      const player = this.playerFor(presetSelect.value);
      if (clubStanding(player, team) !== 'trial') {
        clubNote.textContent = 'They would take you. Pick them and the season starts.';
        clubNote.classList.remove('trial');
        return;
      }
      const required = trialRequirement(reachOf(player, team));
      clubNote.textContent = `A trial: one match for ${team.shortName}, and you need a ${required} rating. ${describeTrial(required)}`;
      clubNote.classList.add('trial');
    };

    teamSelect.addEventListener('change', updateClubNote);
    presetSelect.addEventListener('change', () => {
      updateDescription();
      renderClubs();
    });
    updateDescription();
    renderClubs();

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

/**
 * A club in a dropdown.
 *
 * The division belongs here rather than in a separate control: starting in the
 * second division is the closest thing the game has to a difficulty setting —
 * worse team-mates, weaker chances, and a promotion to earn before anyone in
 * the division above will look at you — so it has to be visible at the moment
 * you pick a club, not discovered a season later.
 */
function clubOption(team: Team): string {
  return `${team.name} — ${TACTICAL_STYLE_LABELS[team.style]} (${getCountry(team.country).short})`;
}
