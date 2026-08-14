import type { ActionOption } from '../../core/events/types.ts';
import type { InteractiveEvent } from '../../simulation/MatchEngine.ts';
import { SituationRenderer } from '../../rendering/events/SituationRenderer.ts';
import type { InputController } from '../interaction/InputController.ts';
import { calculateSetTime } from '../interaction/readingTime.ts';

/**
 * The interactive event overlay — the visual centrepiece.
 *
 * Timing is driven by `performance.now()` inside a requestAnimationFrame loop
 * rather than by setInterval, so the elapsed time recorded for a decision is
 * the real elapsed time, and the timer bar never drifts.
 */

export interface DecisionResult {
  option: ActionOption | null;
  timeUsed: number;
}

export class EventOverlay {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: SituationRenderer;
  private readonly timerBar: HTMLElement;
  private readonly timerValue: HTMLElement;
  private readonly headline: HTMLElement;
  private readonly subline: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly setLabel: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];

  private frame = 0;
  /** Timestamp at which the event appeared (start of the "set" phase). */
  private shownAt = 0;
  /** Length of the "set" phase in seconds; the clock starts after it. */
  private setTime = 0;
  private countdownStarted = false;
  private active: InteractiveEvent | null = null;
  private settle: ((result: DecisionResult) => void) | null = null;

  /** Pace multiplier, applied to the reading phase as well as the timer. */
  paceScale = 1;

  constructor(private readonly input: InputController) {
    this.element = document.createElement('div');
    this.element.className = 'event-overlay hidden';
    this.element.innerHTML = `
      <div class="event-panel">
        <div class="event-headline"></div>
        <div class="event-subline"></div>
        <canvas class="event-canvas" width="480" height="240" aria-hidden="true"></canvas>
        <div class="timer">
          <div class="timer-bar"><span></span></div>
          <div class="timer-value">0.00</div>
        </div>
        <div class="set-label" aria-live="polite"></div>
        <div class="option-grid" role="group" aria-label="Choose an action"></div>
        <p class="event-hint">Press <kbd>1</kbd>-<kbd>6</kbd> or tap an option</p>
      </div>`;

    this.canvas = this.element.querySelector('.event-canvas')!;
    this.renderer = new SituationRenderer(this.canvas);
    this.timerBar = this.element.querySelector('.timer-bar span')!;
    this.timerValue = this.element.querySelector('.timer-value')!;
    this.headline = this.element.querySelector('.event-headline')!;
    this.subline = this.element.querySelector('.event-subline')!;
    this.grid = this.element.querySelector('.option-grid')!;
    this.setLabel = this.element.querySelector('.set-label')!;

    for (let slot = 1; slot <= 6; slot++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option';
      button.dataset.slot = String(slot);
      button.addEventListener('click', () => this.choose(slot));
      this.grid.appendChild(button);
      this.buttons.push(button);
    }

    window.addEventListener('resize', () => {
      if (this.active) this.renderer.resize();
    });
  }

  /** Show the event and resolve once the human decides or the timer expires. */
  present(event: InteractiveEvent): Promise<DecisionResult> {
    this.active = event;
    this.element.classList.remove('hidden');
    this.element.classList.toggle('defending', event.defending);

    this.headline.textContent = event.description;
    const zone = event.context.zone;
    this.subline.textContent = `${event.minute}'  ·  ${zone.channel} / ${zone.box} · ${event.context.nearbyDefenders} defender${
      event.context.nearbyDefenders === 1 ? '' : 's'
    } nearby`;

    event.options.forEach((option, index) => {
      const button = this.buttons[index]!;
      button.innerHTML = `<span class="option-key">${option.slot}</span><span class="option-label">${option.label}</span>`;
      button.disabled = false;
      button.classList.remove('chosen');
    });

    this.renderer.resize();
    this.input.setSlotHandler((slot) => this.choose(slot));

    // The "set" phase: options are readable and selectable, but the decision
    // clock has not started yet. See ui/interaction/readingTime.ts for why.
    this.setTime = calculateSetTime(event.options, this.paceScale);
    this.countdownStarted = false;
    this.shownAt = performance.now();
    this.element.classList.add('setting');

    return new Promise<DecisionResult>((resolve) => {
      this.settle = resolve;
      this.loop();
    });
  }

  private loop = (): void => {
    if (!this.active || !this.settle) return;
    const event = this.active;
    const sinceShown = (performance.now() - this.shownAt) / 1000;

    // --- "set" phase: read the situation, clock not yet running --------------
    if (sinceShown < this.setTime) {
      const countIn = this.setTime - sinceShown;
      this.timerBar.style.width = '100%';
      this.timerBar.classList.remove('critical');
      this.timerValue.textContent = event.timer.seconds.toFixed(2);
      this.setLabel.textContent = `Set… ${countIn.toFixed(1)}`;
      // The keeper is still set and has given nothing away.
      this.renderer.draw({
        context: event.context,
        progress: 0,
        committed: false,
        keeperAction: 'set',
        showGoalkeeper: event.template.goalkeeperInvolved,
      });
      this.frame = requestAnimationFrame(this.loop);
      return;
    }

    if (!this.countdownStarted) {
      this.countdownStarted = true;
      this.element.classList.remove('setting');
      this.setLabel.textContent = '';
    }

    const elapsed = sinceShown - this.setTime;
    const window_ = event.timer.seconds;
    const remaining = Math.max(0, window_ - elapsed);
    const progress = window_ > 0 ? Math.min(1, elapsed / window_) : 1;

    const committed = elapsed >= event.context.goalkeeper.commitAt;
    const keeperAction = committed
      ? event.context.goalkeeper.committedAction
      : event.context.goalkeeper.action;

    this.timerBar.style.width = `${(1 - progress) * 100}%`;
    this.timerBar.classList.toggle('critical', remaining < window_ * 0.3);
    this.timerValue.textContent = remaining.toFixed(2);

    const keeperInvolved = event.template.goalkeeperInvolved;
    this.renderer.draw({
      context: event.context,
      progress,
      committed: keeperInvolved && committed,
      keeperAction: keeperInvolved ? keeperAction : 'set',
      showGoalkeeper: keeperInvolved,
    });

    if (remaining <= 0) {
      this.finish(null, window_);
      return;
    }

    this.frame = requestAnimationFrame(this.loop);
  };

  private choose(slot: number): void {
    if (!this.active || !this.settle) return;
    const option = this.active.options.find((o) => o.slot === slot);
    if (!option) return;
    // Deciding during the "set" phase counts as the fastest possible decision
    // (timeUsed 0), so reading quickly is rewarded rather than merely allowed.
    const elapsed = Math.max(0, (performance.now() - this.shownAt) / 1000 - this.setTime);
    this.buttons[slot - 1]?.classList.add('chosen');
    this.finish(option, Math.min(elapsed, this.active.timer.seconds));
  }

  private finish(option: ActionOption | null, timeUsed: number): void {
    cancelAnimationFrame(this.frame);
    this.input.setSlotHandler(null);
    for (const button of this.buttons) button.disabled = true;
    const settle = this.settle;
    this.settle = null;
    this.active = null;
    settle?.({ option, timeUsed });
  }

  hide(): void {
    this.element.classList.add('hidden');
  }
}
