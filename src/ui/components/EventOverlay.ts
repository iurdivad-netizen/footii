import type { ActionOption } from '../../core/events/types.ts';
import type { InteractiveEvent } from '../../simulation/MatchEngine.ts';
import { SituationRenderer } from '../../rendering/events/SituationRenderer.ts';
import type { InputController } from '../interaction/InputController.ts';
import {
  calculateBuildUpTime,
  calculateScanTime,
  visibleBeatCount,
} from '../interaction/readingTime.ts';

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
  private readonly story: HTMLElement;
  private readonly subline: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly setLabel: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];

  private frame = 0;
  /** Timestamp at which the event appeared (start of the "set" phase). */
  private shownAt = 0;
  /** Length of the narration phase, in seconds. */
  private buildUpTime = 0;
  /** Length of the options-visible-but-clock-stopped phase, in seconds. */
  private scanTime = 0;
  private optionsRevealed = false;
  private countdownStarted = false;
  private beatsShown = 0;
  private active: InteractiveEvent | null = null;
  private settle: ((result: DecisionResult) => void) | null = null;

  /** Pace multiplier, applied to the reading phase as well as the timer. */
  paceScale = 1;

  constructor(private readonly input: InputController) {
    this.element = document.createElement('div');
    this.element.className = 'event-overlay hidden';
    this.element.innerHTML = `
      <div class="event-panel">
        <ol class="event-story"></ol>
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
    this.story = this.element.querySelector('.event-story')!;
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

    const zone = event.context.zone;
    this.subline.textContent = `${event.minute}'  ·  ${zone.channel} / ${zone.box} · ${event.context.nearbyDefenders} defender${
      event.context.nearbyDefenders === 1 ? '' : 's'
    } nearby`;

    // The story starts empty and fills a beat at a time.
    this.story.innerHTML = '';
    this.beatsShown = 0;

    // Options are built now but stay concealed until the reveal: the numbered
    // 3x2 grid is still laid out, so the shape of the interface is familiar
    // before the labels arrive, but it gives nothing away.
    event.options.forEach((option, index) => {
      const button = this.buttons[index]!;
      button.innerHTML = `<span class="option-key">${option.slot}</span><span class="option-label">${option.label}</span>`;
      button.disabled = true;
      button.classList.remove('chosen');
    });
    this.grid.classList.add('concealed');
    this.optionsRevealed = false;

    this.renderer.resize();
    this.input.setSlotHandler((slot) => this.choose(slot));

    // Phase lengths. See ui/interaction/readingTime.ts.
    this.buildUpTime = calculateBuildUpTime(event.buildUp, this.paceScale);
    this.scanTime = calculateScanTime(this.paceScale);
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
    const keeperInvolved = event.template.goalkeeperInvolved;

    // --- phase 1: BUILD-UP — the story, one beat at a time, no options ------
    if (sinceShown < this.buildUpTime) {
      const shouldShow = visibleBeatCount(sinceShown, event.buildUp, this.paceScale);
      while (this.beatsShown < shouldShow) {
        this.appendBeat(event.buildUp[this.beatsShown]!);
        this.beatsShown += 1;
      }
      this.timerBar.style.width = '100%';
      this.timerBar.classList.remove('critical');
      this.timerValue.textContent = event.timer.seconds.toFixed(2);
      this.setLabel.textContent = 'Watch it develop…';
      // The keeper has not moved and gives nothing away yet.
      this.renderer.draw({
        context: event.context,
        progress: 0,
        committed: false,
        keeperAction: 'set',
        showGoalkeeper: keeperInvolved,
      });
      this.frame = requestAnimationFrame(this.loop);
      return;
    }

    // --- phase 2: SCAN — options appear, clock still stopped ----------------
    if (!this.optionsRevealed) {
      this.optionsRevealed = true;
      // The final beat is the situation itself, and lands with the options.
      while (this.beatsShown < event.buildUp.length) {
        this.appendBeat(event.buildUp[this.beatsShown]!, true);
        this.beatsShown += 1;
      }
      this.grid.classList.remove('concealed');
      for (const button of this.buttons) button.disabled = false;
    }

    if (sinceShown < this.buildUpTime + this.scanTime) {
      this.setLabel.textContent = 'Now!';
      this.frame = requestAnimationFrame(this.loop);
      return;
    }

    if (!this.countdownStarted) {
      this.countdownStarted = true;
      this.element.classList.remove('setting');
      this.setLabel.textContent = '';
    }

    // --- phase 3: DECISION — the clock runs and the keeper commits ----------
    const elapsed = sinceShown - this.buildUpTime - this.scanTime;
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

  private appendBeat(text: string, isSituation = false): void {
    const item = document.createElement('li');
    item.className = isSituation ? 'beat beat-situation' : 'beat';
    item.textContent = text;
    this.story.appendChild(item);
  }

  private choose(slot: number): void {
    if (!this.active || !this.settle) return;
    // Input is ignored until the options are actually on screen, so a player
    // cannot fire blind during the build-up.
    if (!this.optionsRevealed) return;
    const option = this.active.options.find((o) => o.slot === slot);
    if (!option) return;
    // Deciding during the scan beat counts as the fastest possible decision
    // (timeUsed 0), so reading quickly is rewarded rather than merely allowed.
    const elapsed = Math.max(
      0,
      (performance.now() - this.shownAt) / 1000 - this.buildUpTime - this.scanTime,
    );
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
