import type { AttributeKey } from '../../core/player/attributes.ts';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../../core/player/attributes.ts';
import type { Player } from '../../core/player/player.ts';
import { currentAbility } from '../../core/player/player.ts';
import { POSITION_PROFILES } from '../../core/player/positions.ts';
import type { TrainingAllocation } from '../../core/career/training.ts';
import { maxTrainableValue, validateAllocation } from '../../core/career/training.ts';
import { benchmarkDecisionWindow } from '../../simulation/DecisionBenchmark.ts';

/** Attribute groups, matching the creator's layout. */
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
 * PRE-SEASON TRAINING
 *
 * Spend the points earned by the season just finished. This is the deliberate
 * half of progression: per-match development is what happened TO you, this is
 * what you choose to work on.
 *
 * The live decision-window readout is the important part of the screen. Putting
 * points into Awareness, Composure or Decision Making visibly moves the number
 * that governs how much time you get on the ball, so the connection between an
 * abstract attribute and the moment-to-moment game is never hidden.
 */
export class TrainingScreen {
  readonly element: HTMLElement;
  private readonly spend = new Map<AttributeKey, number>();
  private readonly cap: number;
  private readonly baseWindow: number;

  constructor(
    private readonly player: Player,
    private readonly available: number,
    notes: string[],
    private readonly onConfirm: (allocation: TrainingAllocation) => void,
  ) {
    this.cap = maxTrainableValue(player);
    this.baseWindow = benchmarkDecisionWindow(player);

    this.element = document.createElement('section');
    this.element.className = 'screen creator-screen training-screen';
    this.element.innerHTML = `
      <header class="creator-header">
        <h1>Pre-season training</h1>
        <p class="hint">
          A summer's work. Spend your points wherever you like — nothing can be trained past
          <strong>${this.cap}</strong> until your overall ability improves, and unspent points do
          not carry over.
        </p>
        ${notes.length ? `<ul class="training-notes">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      </header>

      <div class="creator-summary">
        <div class="points" id="tr-points"></div>
        <div class="creator-actions">
          <button id="tr-reset" type="button">Reset</button>
          <button id="tr-confirm" type="button" class="primary">Start next season</button>
        </div>
      </div>
      <p class="creator-errors" id="tr-errors"></p>

      <div class="creator-groups" id="tr-groups"></div>`;

    this.renderAttributes();
    this.renderSummary();
    this.wire();
  }

  private wire(): void {
    this.element.querySelector<HTMLElement>('#tr-groups')!.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-attr]');
      if (!button) return;
      const key = button.dataset.attr as AttributeKey;
      this.adjust(key, Number(button.dataset.delta));
    });

    this.element.querySelector<HTMLButtonElement>('#tr-reset')!.addEventListener('click', () => {
      this.spend.clear();
      this.renderAttributes();
      this.renderSummary();
    });

    this.element.querySelector<HTMLButtonElement>('#tr-confirm')!.addEventListener('click', () => {
      const allocation = this.allocation();
      const result = validateAllocation(this.player, this.available, allocation);
      const errors = this.element.querySelector<HTMLElement>('#tr-errors')!;
      if (!result.valid) {
        errors.textContent = result.error ?? 'That allocation is not valid.';
        return;
      }
      errors.textContent = '';
      this.onConfirm(allocation);
    });
  }

  private spent(): number {
    let total = 0;
    for (const value of this.spend.values()) total += value;
    return total;
  }

  private adjust(key: AttributeKey, delta: number): void {
    const current = this.spend.get(key) ?? 0;
    const next = current + delta;
    if (next < 0) return;
    if (delta > 0) {
      if (this.spent() >= this.available) return;
      if (this.player.attributes[key] + next > Math.min(99, this.cap)) return;
    }
    if (next === 0) this.spend.delete(key);
    else this.spend.set(key, next);
    this.renderRow(key);
    this.renderSummary();
  }

  private allocation(): TrainingAllocation {
    const spend: TrainingAllocation['spend'] = {};
    for (const [key, value] of this.spend) spend[key] = value;
    return { spend };
  }

  /** The player as he would be if the current allocation were applied. */
  private preview(): Player {
    const attributes = { ...this.player.attributes };
    for (const [key, value] of this.spend) attributes[key] = attributes[key] + value;
    return { ...this.player, attributes };
  }

  private renderAttributes(): void {
    const keys = new Set<AttributeKey>(POSITION_PROFILES[this.player.position].keyAttributes);
    this.element.querySelector<HTMLElement>('#tr-groups')!.innerHTML = GROUPS.map(
      (group) => `
        <div class="creator-group">
          <h2>${group.title}</h2>
          ${group.keys.map((key) => this.rowHtml(key, keys.has(key))).join('')}
        </div>`,
    ).join('');
  }

  private rowHtml(key: AttributeKey, isKey: boolean): string {
    const added = this.spend.get(key) ?? 0;
    const base = this.player.attributes[key];
    const total = base + added;
    const atCap = total >= Math.min(99, this.cap);
    return `
      <div class="creator-row ${isKey ? 'key-attr' : ''} ${atCap ? 'at-cap' : ''}" data-row="${key}">
        <span class="creator-name">${ATTRIBUTE_LABELS[key]}${isKey ? ' <em>key</em>' : ''}</span>
        <button type="button" data-attr="${key}" data-delta="-1" aria-label="Remove a point from ${ATTRIBUTE_LABELS[key]}">−</button>
        <span class="creator-bar"><i style="width:${total}%"></i></span>
        <span class="creator-value">${total}${added ? `<em class="gain">+${added}</em>` : ''}</span>
        <button type="button" data-attr="${key}" data-delta="1" aria-label="Add a point to ${ATTRIBUTE_LABELS[key]}">+</button>
      </div>`;
  }

  private renderRow(key: AttributeKey): void {
    const row = this.element.querySelector<HTMLElement>(`[data-row="${key}"]`);
    if (!row) return;
    const keys = new Set<AttributeKey>(POSITION_PROFILES[this.player.position].keyAttributes);
    row.outerHTML = this.rowHtml(key, keys.has(key));
  }

  private renderSummary(): void {
    const remaining = this.available - this.spent();
    const preview = this.preview();
    const window_ = benchmarkDecisionWindow(preview);
    const windowDelta = window_ - this.baseWindow;

    this.element.querySelector<HTMLElement>('#tr-points')!.innerHTML = `
      <span class="points-value ${remaining === 0 ? 'done' : ''}">${remaining}</span>
      <span class="points-label">points left</span>
      <span class="points-ability">Ability ${currentAbility(preview)}</span>
      <span class="points-window ${windowDelta > 0.004 ? 'good' : ''}">
        Decision window ${window_.toFixed(2)}s${windowDelta > 0.004 ? ` (+${windowDelta.toFixed(2)})` : ''}
      </span>`;
  }
}

/** Attributes that can still be trained, for callers that want to check first. */
export function trainableAttributes(player: Player): AttributeKey[] {
  const cap = Math.min(99, maxTrainableValue(player));
  return ATTRIBUTE_KEYS.filter((key) => player.attributes[key] < cap);
}
