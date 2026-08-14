import { ATTRIBUTE_LABELS } from '../../core/player/attributes.ts';
import { GOALKEEPER_ACTION_LABELS } from '../../core/goalkeeper/goalkeeper.ts';
import { SITUATION_LABELS } from '../../core/events/types.ts';
import { zoneLabel } from '../../core/events/zones.ts';
import type { EventResolution, InteractiveEvent } from '../../simulation/MatchEngine.ts';

/**
 * SIMULATION DEBUG MODE
 *
 * Shows exactly how the last event was computed: the decision timer's modifier
 * breakdown, the generated options and their fit, every term of the resolution
 * score, and the seed. This is the balancing tool — if a number in here looks
 * wrong, the gameplay is wrong.
 *
 * Toggled with the D key.
 */
export class DebugPanel {
  readonly element: HTMLElement;
  private visible = false;
  private lastEvent: InteractiveEvent | null = null;
  private lastResolution: EventResolution | null = null;
  private seed = '';

  constructor() {
    this.element = document.createElement('aside');
    this.element.className = 'debug-panel hidden';
    this.element.innerHTML = '<h2>Debug</h2><div class="debug-body">No event yet.</div>';
  }

  setSeed(seed: string): void {
    this.seed = seed;
    this.render();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.element.classList.toggle('hidden', !this.visible);
    this.render();
  }

  recordEvent(event: InteractiveEvent): void {
    this.lastEvent = event;
    this.lastResolution = null;
    this.render();
  }

  recordResolution(resolution: EventResolution): void {
    this.lastResolution = resolution;
    this.render();
  }

  private render(): void {
    if (!this.visible) return;
    const body = this.element.querySelector('.debug-body')!;
    if (!this.lastEvent) {
      body.innerHTML = `<p class="debug-empty">Seed: <code>${this.seed}</code></p><p class="debug-empty">Waiting for the first interactive event.</p>`;
      return;
    }

    const event = this.lastEvent;
    const c = event.context;
    const player = c.player;
    const gk = c.goalkeeper.keeper;

    const timerRows = event.timer.modifiers
      .map(
        (m) =>
          `<tr><td>${m.label}</td><td class="${m.seconds >= 0 ? 'pos' : 'neg'}">${m.seconds >= 0 ? '+' : ''}${m.seconds.toFixed(2)}</td></tr>`,
      )
      .join('');

    const optionRows = event.options
      .map(
        (o) =>
          `<tr><td>${o.slot}. ${o.label}</td><td>${o.family}</td><td>${o.generationFit.toFixed(2)}</td></tr>`,
      )
      .join('');

    const keyAttributes = (['awareness', 'decisionMaking', 'composure', 'finishing', 'technique', 'dribbling', 'passing'] as const)
      .map((key) => `<tr><td>${ATTRIBUTE_LABELS[key]}</td><td>${player.attributes[key]}</td></tr>`)
      .join('');

    const gkAttributes = Object.entries(gk.attributes)
      .map(([key, value]) => `<tr><td>${key}</td><td>${value}</td></tr>`)
      .join('');

    const resolution = this.lastResolution;
    const resolutionHtml = resolution
      ? `
        <h3>Resolution — ${resolution.result.breakdown.action}</h3>
        ${resolution.instinctReason ? `<p class="debug-note">Timer expired: ${resolution.instinctReason}</p>` : ''}
        <table>
          <tr><td>Base value</td><td>${resolution.result.breakdown.baseValue.toFixed(2)}</td></tr>
          <tr><td>Execution score</td><td>${resolution.result.breakdown.executionScore.toFixed(3)}</td></tr>
          <tr><td>Decision fit</td><td>${resolution.result.breakdown.fit.toFixed(3)}</td></tr>
          <tr><td>GK opposition</td><td>${resolution.result.breakdown.goalkeeperScore.toFixed(3)}</td></tr>
          ${resolution.result.breakdown.terms
            .map(
              (t) =>
                `<tr><td>${t.label}</td><td class="${t.value >= 0 ? 'pos' : 'neg'}">${t.value >= 0 ? '+' : ''}${t.value.toFixed(3)}</td></tr>`,
            )
            .join('')}
          <tr><td>Random noise</td><td class="${resolution.result.breakdown.noise >= 0 ? 'pos' : 'neg'}">${resolution.result.breakdown.noise.toFixed(3)}</td></tr>
          <tr class="total"><td>FINAL VALUE</td><td>${resolution.result.breakdown.finalValue.toFixed(3)}</td></tr>
          <tr class="total"><td>Outcome</td><td>${resolution.result.outcome.kind}</td></tr>
        </table>`
      : '<p class="debug-note">Awaiting decision…</p>';

    body.innerHTML = `
      <p class="debug-meta">Seed <code>${this.seed}</code> · event #${event.id} · minute ${event.minute}</p>
      <h3>Situation</h3>
      <table>
        <tr><td>Type</td><td>${SITUATION_LABELS[c.situation]}</td></tr>
        <tr><td>Zone</td><td>${zoneLabel(c.zone)}</td></tr>
        <tr><td>Chance quality</td><td>${c.situationQuality.toFixed(2)}</td></tr>
        <tr><td>Defenders</td><td>${c.nearbyDefenders} (pressure ${c.defensivePressure.toFixed(2)})</td></tr>
        <tr><td>Transition</td><td>${c.transition ? 'yes' : 'no'}</td></tr>
        <tr><td>GK start</td><td>${GOALKEEPER_ACTION_LABELS[c.goalkeeper.action]}</td></tr>
        <tr><td>GK commits to</td><td>${GOALKEEPER_ACTION_LABELS[c.goalkeeper.committedAction]} at ${c.goalkeeper.commitAt.toFixed(2)}s</td></tr>
      </table>

      <h3>Decision timer</h3>
      <table>
        <tr><td>BASE TIME</td><td>${event.timer.baseTime.toFixed(2)}</td></tr>
        ${timerRows}
        <tr class="total"><td>FINAL TIME</td><td>${event.timer.seconds.toFixed(2)} sec</td></tr>
      </table>

      <h3>Generated options (fit)</h3>
      <table>${optionRows}</table>

      ${resolutionHtml}

      <h3>Player</h3>
      <table>${keyAttributes}<tr><td>Experience</td><td>${player.experience}</td></tr><tr><td>Fitness</td><td>${player.fitness.toFixed(0)}</td></tr></table>

      <h3>Goalkeeper — ${gk.name}</h3>
      <table>${gkAttributes}</table>`;
  }
}
