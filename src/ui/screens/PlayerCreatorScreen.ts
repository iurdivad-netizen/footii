import type { AttributeKey, Attributes } from '../../core/player/attributes.ts';
import { ATTRIBUTE_LABELS } from '../../core/player/attributes.ts';
import { currentAbility } from '../../core/player/player.ts';
import type { Position } from '../../core/player/positions.ts';
import { OUTFIELD_POSITIONS, POSITION_PROFILES } from '../../core/player/positions.ts';
import type { CustomPlayerSpec, PlayingStyle } from '../../core/player/playerBuilder.ts';
import {
  allConfederations,
  confederationName,
  countriesIn,
} from '../../core/career/countries.ts';
import {
  CREATION_CAP,
  CREATION_FLOOR,
  CREATION_POINTS,
  MAX_CREATION_AGE,
  MIN_CREATION_AGE,
  pointsRemaining,
  startingExperience,
  stylesForPosition,
  suggestedAttributes,
  matchStyle,
  validateSpec,
} from '../../core/player/playerBuilder.ts';
import { createPlayer } from '../../core/player/player.ts';

/** Attribute groups, purely for laying the creator out legibly. */
const GROUPS: { title: string; keys: AttributeKey[] }[] = [
  {
    title: 'Technical',
    keys: ['shooting', 'finishing', 'passing', 'crossing', 'dribbling', 'ballControl', 'technique', 'heading'],
  },
  {
    title: 'Mental',
    keys: ['awareness', 'decisionMaking', 'composure', 'anticipation', 'positioning', 'movement'],
  },
  { title: 'Physical', keys: ['pace', 'acceleration', 'strength', 'stamina'] },
  { title: 'Defensive', keys: ['tackling', 'defensiveAwareness'] },
];

/**
 * PLAYER CREATOR
 *
 * Build a footballer by spending a fixed pool of attribute points. Everything
 * here is presentation over `core/player/playerBuilder.ts`, which owns the
 * rules — the pool, the caps and the hidden potential roll.
 */
/** Quotes and angle brackets, so a name with one in it cannot break the field. */
function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export class PlayerCreatorScreen {
  readonly element: HTMLElement;
  private position: Position = 'ST';
  private attributes: Attributes;
  private styles: PlayingStyle[];
  private styleId: string;

  constructor(
    private readonly handlers: { onConfirm: (spec: CustomPlayerSpec) => void; onCancel: () => void },
    private readonly forCareer: boolean,
    /** What finishing the creator will start, e.g. "Northport City". */
    private readonly destination: string = '',
    /**
     * The build to open on, when there is one to edit.
     *
     * The setup screen relabels its button to "Edit your custom player" as soon
     * as a creation exists, and an edit that opens on a blank striker is not an
     * edit — it is the same create it was before, with a different word on it.
     * The SPEC is what is reopened rather than the built player, deliberately:
     * the spec is what somebody typed, while the player carries a rolled
     * potential and, later in a career, attributes that training moved. Editing
     * re-rolls potential, which is the honest consequence of building a
     * different footballer.
     */
    private readonly initial?: CustomPlayerSpec,
  ) {
    this.position = initial?.position ?? this.position;
    this.attributes = initial ? { ...initial.attributes } : suggestedAttributes(this.position);
    this.styles = stylesForPosition(this.position);
    this.styleId = (initial ? matchStyle(this.styles, initial.tendencies) : this.styles[0])!.id;

    this.element = document.createElement('section');
    this.element.className = 'screen creator-screen';
    this.element.innerHTML = `
      <header class="creator-header">
        <h1>${this.initial ? 'Edit your player' : 'Create your player'}</h1>
        <p class="hint">
          Spend ${CREATION_POINTS} points across the attributes. Nothing may start above
          ${CREATION_CAP} — the rest is what a career is for.
          <strong>Your potential is hidden</strong>, and the younger you start the more of it you
          are likely to have.
        </p>
      </header>

      <div class="creator-identity">
        <div class="field">
          <label for="cp-name">Name</label>
          <input id="cp-name" type="text" maxlength="30" placeholder="Your footballer"
            value="${escapeAttribute(this.initial?.name ?? '')}" />
        </div>
        <div class="field">
          <label for="cp-position">Position</label>
          <select id="cp-position">
            ${OUTFIELD_POSITIONS.map(
              (p) =>
                `<option value="${p}" ${p === this.position ? 'selected' : ''}>${POSITION_PROFILES[p].label}</option>`,
            ).join('')}
          </select>
        </div>
        <div class="field">
          <label for="cp-nationality">Nationality</label>
          <select id="cp-nationality">
            ${allConfederations()
              .map(
                (confederation) => `<optgroup label="${confederationName(confederation)}">
                  ${countriesIn(confederation)
                    .map(
                      (c) =>
                        `<option value="${c.id}" ${c.id === (this.initial?.nationality ?? 'england') ? 'selected' : ''}>${c.name}</option>`,
                    )
                    .join('')}
                </optgroup>`,
              )
              .join('')}
          </select>
          <p class="hint">
            Who may pick you, which move counts as going home, and which championship you play in
            the summers between World Cups. A country whose football is watched everywhere asks
            far more of you before it picks you.
          </p>
        </div>
        <div class="field">
          <label for="cp-age">Age <span id="cp-age-value">${this.startingAge()}</span></label>
          <input id="cp-age" type="range" min="${MIN_CREATION_AGE}" max="${MAX_CREATION_AGE}" value="${this.startingAge()}" />
          <p class="hint" id="cp-age-note"></p>
        </div>
        <div class="field">
          <label for="cp-style">Playing style</label>
          <select id="cp-style"></select>
          <p class="hint" id="cp-style-note"></p>
        </div>
      </div>

      <div class="creator-summary">
        <div class="points" id="cp-points"></div>
        <div class="creator-actions">
          <button id="cp-suggest" type="button">Reset to a ${''}sensible build</button>
          <button id="cp-cancel" type="button" class="ghost">Back</button>
          <button id="cp-confirm" type="button" class="primary">
            ${this.forCareer ? 'Start career' : 'Kick off'}
          </button>
        </div>
      </div>
      <p class="creator-errors" id="cp-errors"></p>
      ${
        this.destination
          ? `<p class="creator-destination">
               ${this.forCareer ? 'Starting a career at' : 'Playing for'}
               <strong>${this.destination}</strong>. Go back to change club.
             </p>`
          : ''
      }

      <div class="creator-groups" id="cp-groups"></div>`;

    this.wire();
    this.renderStyles();
    this.renderAttributes();
    this.renderSummary();
  }

  private wire(): void {
    const positionSelect = this.element.querySelector<HTMLSelectElement>('#cp-position')!;
    positionSelect.addEventListener('change', () => {
      this.position = positionSelect.value as Position;
      this.attributes = suggestedAttributes(this.position);
      this.styles = stylesForPosition(this.position);
      this.styleId = this.styles[0]!.id;
      this.renderStyles();
      this.renderAttributes();
      this.renderSummary();
    });

    const ageInput = this.element.querySelector<HTMLInputElement>('#cp-age')!;
    ageInput.addEventListener('input', () => {
      this.element.querySelector<HTMLElement>('#cp-age-value')!.textContent = ageInput.value;
      this.renderSummary();
    });

    const styleSelect = this.element.querySelector<HTMLSelectElement>('#cp-style')!;
    styleSelect.addEventListener('change', () => {
      this.styleId = styleSelect.value;
      this.renderStyleNote();
    });

    this.element.querySelector<HTMLButtonElement>('#cp-suggest')!.addEventListener('click', () => {
      this.attributes = suggestedAttributes(this.position);
      this.renderAttributes();
      this.renderSummary();
    });

    this.element
      .querySelector<HTMLButtonElement>('#cp-cancel')!
      .addEventListener('click', this.handlers.onCancel);

    this.element.querySelector<HTMLButtonElement>('#cp-confirm')!.addEventListener('click', () => {
      const spec = this.spec();
      const result = validateSpec(spec);
      const errors = this.element.querySelector<HTMLElement>('#cp-errors')!;
      if (!result.valid) {
        errors.textContent = result.errors[0]!;
        return;
      }
      errors.textContent = '';
      this.handlers.onConfirm(spec);
    });

    // Attribute +/- via delegation, so re-rendering never loses listeners.
    this.element.querySelector<HTMLElement>('#cp-groups')!.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-attr]');
      if (!button) return;
      const key = button.dataset.attr as AttributeKey;
      const delta = Number(button.dataset.delta);
      this.adjust(key, delta);
    });
  }

  private adjust(key: AttributeKey, delta: number): void {
    const next = this.attributes[key] + delta;
    if (next < CREATION_FLOOR || next > CREATION_CAP) return;
    if (delta > 0 && pointsRemaining(this.attributes) <= 0) return;
    this.attributes[key] = next;
    this.renderAttributeRow(key);
    this.renderSummary();
  }

  /** The age to open on: the one being edited, or the mode's default. */
  private startingAge(): number {
    return this.initial?.age ?? (this.forCareer ? 17 : 24);
  }

  private spec(): CustomPlayerSpec {
    const style = this.styles.find((s) => s.id === this.styleId) ?? this.styles[0]!;
    return {
      name: this.element.querySelector<HTMLInputElement>('#cp-name')!.value,
      age: Number(this.element.querySelector<HTMLInputElement>('#cp-age')!.value),
      position: this.position,
      attributes: this.attributes,
      tendencies: style.tendencies,
      nationality:
        this.element.querySelector<HTMLSelectElement>('#cp-nationality')?.value ?? 'england',
    };
  }

  private renderStyles(): void {
    const select = this.element.querySelector<HTMLSelectElement>('#cp-style')!;
    select.innerHTML = this.styles
      .map((s) => `<option value="${s.id}">${s.label}</option>`)
      .join('');
    select.value = this.styleId;
    this.renderStyleNote();
  }

  private renderStyleNote(): void {
    const style = this.styles.find((s) => s.id === this.styleId);
    this.element.querySelector<HTMLElement>('#cp-style-note')!.textContent = style?.description ?? '';
  }

  private renderAttributes(): void {
    const keys = new Set<AttributeKey>(POSITION_PROFILES[this.position].keyAttributes);
    this.element.querySelector<HTMLElement>('#cp-groups')!.innerHTML = GROUPS.map(
      (group) => `
        <div class="creator-group">
          <h2>${group.title}</h2>
          ${group.keys
            .map(
              (key) => `
              <div class="creator-row ${keys.has(key) ? 'key-attr' : ''}" data-row="${key}">
                <span class="creator-name">${ATTRIBUTE_LABELS[key]}${keys.has(key) ? ' <em>key</em>' : ''}</span>
                <button type="button" data-attr="${key}" data-delta="-1" aria-label="Lower ${ATTRIBUTE_LABELS[key]}">−</button>
                <span class="creator-bar"><i style="width:${this.attributes[key]}%"></i></span>
                <span class="creator-value">${this.attributes[key]}</span>
                <button type="button" data-attr="${key}" data-delta="1" aria-label="Raise ${ATTRIBUTE_LABELS[key]}">+</button>
              </div>`,
            )
            .join('')}
        </div>`,
    ).join('');
  }

  /** Update one row in place — re-rendering the whole grid on every click loses focus. */
  private renderAttributeRow(key: AttributeKey): void {
    const row = this.element.querySelector<HTMLElement>(`[data-row="${key}"]`);
    if (!row) return;
    row.querySelector<HTMLElement>('.creator-value')!.textContent = String(this.attributes[key]);
    row.querySelector<HTMLElement>('.creator-bar i')!.style.width = `${this.attributes[key]}%`;
  }

  private renderSummary(): void {
    const remaining = pointsRemaining(this.attributes);
    const age = Number(this.element.querySelector<HTMLInputElement>('#cp-age')!.value);

    const preview = createPlayer({
      name: 'preview',
      position: this.position,
      attributes: this.attributes,
      experience: startingExperience(age),
    });

    const points = this.element.querySelector<HTMLElement>('#cp-points')!;
    points.innerHTML = `
      <span class="points-value ${remaining === 0 ? 'done' : remaining < 0 ? 'over' : ''}">${remaining}</span>
      <span class="points-label">points left</span>
      <span class="points-ability">Ability ${currentAbility(preview)}</span>`;

    const note =
      age <= 19
        ? 'Teenagers start raw but carry the most hidden potential — and the shortest decision windows.'
        : age <= 23
          ? 'A young senior: some experience already, still plenty of room to grow.'
          : age <= 27
            ? 'At or near his peak. Limited growth left, but comfortable on the ball from the start.'
            : 'A veteran. Very little development ahead, and physical decline is coming.';
    this.element.querySelector<HTMLElement>('#cp-age-note')!.textContent = note;
  }
}
