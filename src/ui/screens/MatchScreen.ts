import { OUTCOME_LABELS } from '../../core/events/types.ts';
import { passCompletionRate } from '../../core/match/matchStats.ts';
import type { MatchEngine } from '../../simulation/MatchEngine.ts';
import type { EventOverlay } from '../components/EventOverlay.ts';
import type { DebugPanel } from '../components/DebugPanel.ts';

import { MATCH_SPEEDS, clampSpeedIndex } from './matchSpeeds.ts';

/**
 * The match screen. Drives the engine loop, renders the running state, and
 * hands control to the event overlay whenever the engine emits an interactive
 * event. All simulation lives in the engine — this file only schedules and
 * displays.
 */
export class MatchScreen {
  readonly element: HTMLElement;
  private timeout: number | null = null;
  private speedIndex: number;
  private paused = false;
  private busy = false;
  /** The last commentary line announced, so it is never announced twice. */
  private announced = '';
  private readonly onSpeedChange: ((index: number) => void) | undefined;

  constructor(
    private readonly engine: MatchEngine,
    private readonly overlay: EventOverlay,
    private readonly debug: DebugPanel,
    private readonly onFinished: () => void,
    options: {
      speedIndex?: number;
      onSpeedChange?: (index: number) => void;
      /**
       * Walk out of the match.
       *
       * Optional because not every caller has somewhere to walk out TO, and a
       * button that led nowhere would be worse than none.
       */
      onLeave?: () => void;
    } = {},
  ) {
    this.speedIndex = clampSpeedIndex(options.speedIndex ?? 1);
    this.onSpeedChange = options.onSpeedChange;
    this.element = document.createElement('section');
    this.element.className = 'screen match-screen';
    this.element.innerHTML = `
      <div class="scoreboard">
        <div class="clock"><span id="minute">0</span>'</div>
        <div class="score" id="score"></div>
        <div class="controls">
          <button type="button" id="pause">Pause</button>
          <button type="button" id="speed"></button>
          <button type="button" id="debug-toggle" title="Toggle debug (D)">Debug</button>
          <button type="button" id="leave" class="leave">Leave</button>
        </div>
      </div>

      <div class="match-body">
        <div class="feed-column">
          <div class="outcome-banner hidden" id="outcome"></div>
          <ol class="commentary" id="commentary"></ol>
          <!--
            The commentary is rewritten whole on every frame, newest first, so
            it cannot itself be a live region: a screen reader would re-read all
            fourteen lines every time a minute ticked. This announces the newest
            line and only when it is new, which is the thing somebody would
            actually want interrupting them for.
          -->
          <p class="visually-hidden" id="commentary-live" aria-live="polite"></p>
        </div>
        <div class="stat-column">
          <h2 id="player-name"></h2>
          <dl class="stat-list" id="stats"></dl>
          <div class="fitness">
            <span>Fitness</span>
            <div class="fitness-bar"><span id="fitness-bar"></span></div>
          </div>
        </div>
      </div>`;

    this.element.appendChild(this.overlay.element);

    this.element.querySelector<HTMLButtonElement>('#pause')!.addEventListener('click', () => {
      this.togglePause();
    });
    this.element.querySelector<HTMLButtonElement>('#speed')!.addEventListener('click', () => {
      this.cycleSpeed();
    });
    this.element.querySelector<HTMLButtonElement>('#debug-toggle')!.addEventListener('click', () => {
      this.debug.toggle();
    });

    /**
     * LEAVING A MATCH THAT HAS ALREADY STARTED.
     *
     * Once a match began there was no visible way out of it. Ninety simulated
     * minutes is not long, which is why nobody noticed — until it is a phone
     * and somebody has to be somewhere, and then the only exits are closing the
     * tab or sitting through it.
     *
     * IT IS NOT AN UNDO, and that is the whole design. The rest of the match is
     * PLAYED OUT WITHOUT YOU rather than discarded, and the result stands.
     * Abandoning to the hub would have been easier to build and would have made
     * a save-scum out of the seed: every fixture is deterministic from its
     * calendar slot, so a match you could walk out of and re-enter is a match
     * you could retry until the chance went in. Leaving costs you control of
     * the remainder, which is a real price and the honest one.
     *
     * TWO PRESSES, and the first one PAUSES. The cost is not obvious from the
     * word "leave", so the armed label states it — and stopping the clock while
     * somebody reads it is the least the screen can do, given that the reason
     * they reached for the button is usually that they are out of time.
     */
    const leaveButton = this.element.querySelector<HTMLButtonElement>('#leave')!;
    if (!options.onLeave) {
      leaveButton.hidden = true;
    } else {
      leaveButton.addEventListener('click', () => {
        // A decision is on screen behind a fixed overlay covering this button,
        // so this cannot normally be reached mid-decision. Guarded anyway:
        // walking out from under an awaited promise would strand it.
        if (this.busy) return;

        if (leaveButton.dataset.armed === 'yes') {
          this.stop();
          options.onLeave!();
          return;
        }
        if (!this.paused) this.togglePause();
        leaveButton.dataset.armed = 'yes';
        leaveButton.classList.add('armed');
        leaveButton.textContent = 'Leave — the rest is played out without you';
      });

      // Disarmed by looking away, like every other guarded button here: one
      // that stayed armed would be a trap laid for later rather than a guard now.
      leaveButton.addEventListener('blur', () => {
        if (leaveButton.dataset.armed !== 'yes') return;
        delete leaveButton.dataset.armed;
        leaveButton.classList.remove('armed');
        leaveButton.textContent = 'Leave';
      });
    }

    this.element.querySelector<HTMLElement>('#player-name')!.textContent =
      `${engine.setup.player.name} · ${engine.setup.player.position}`;

    this.renderSpeed();
    this.render();
  }

  start(): void {
    this.scheduleTick(400);
  }

  stop(): void {
    if (this.timeout !== null) window.clearTimeout(this.timeout);
    this.timeout = null;
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.element.querySelector<HTMLButtonElement>('#pause')!.textContent = this.paused
      ? 'Resume'
      : 'Pause';
    if (!this.paused && !this.busy) this.scheduleTick(120);
    else this.stop();
  }

  cycleSpeed(): void {
    this.speedIndex = (this.speedIndex + 1) % MATCH_SPEEDS.length;
    this.renderSpeed();
    // Remember it: changing speed mid-match is a preference, not a one-off.
    this.onSpeedChange?.(this.speedIndex);
  }

  private renderSpeed(): void {
    this.element.querySelector<HTMLButtonElement>('#speed')!.textContent =
      MATCH_SPEEDS[this.speedIndex]!.label;
  }

  private scheduleTick(delay = MATCH_SPEEDS[this.speedIndex]!.ms): void {
    this.stop();
    this.timeout = window.setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    if (this.paused || this.busy) return;

    const update = this.engine.step();
    this.render();

    if (update.kind === 'finished') {
      this.stop();
      this.onFinished();
      return;
    }

    if (update.kind === 'interactive') {
      this.busy = true;
      this.stop();
      this.debug.recordEvent(update.event);

      const decision = await this.overlay.present(update.event);
      const resolution = this.engine.submitDecision({
        option: decision.option,
        timeUsed: decision.timeUsed,
        untimed: decision.untimed,
      });
      this.debug.recordResolution(resolution);
      this.overlay.hide();

      this.showOutcome(resolution.result.outcome.kind, resolution.instinctReason);
      this.render();

      this.busy = false;
      if (!this.paused) this.scheduleTick(900);
      return;
    }

    this.scheduleTick();
  }

  private showOutcome(kind: keyof typeof OUTCOME_LABELS, instinctReason?: string): void {
    const banner = this.element.querySelector<HTMLElement>('#outcome')!;
    banner.textContent = instinctReason
      ? `${OUTCOME_LABELS[kind]} — ${instinctReason}`
      : OUTCOME_LABELS[kind];
    banner.className = `outcome-banner tone-${kind === 'goal' ? 'goal' : kind === 'saved' || kind === 'chanceCreated' || kind === 'ballWon' || kind === 'dribbleSuccess' ? 'good' : 'bad'}`;
    window.setTimeout(() => banner.classList.add('hidden'), 2200);
  }

  private render(): void {
    const { state } = this.engine;
    this.element.querySelector<HTMLElement>('#minute')!.textContent = String(
      Math.min(state.minute, this.engine.setup.length),
    );
    this.element.querySelector<HTMLElement>('#score')!.textContent = this.engine.scoreline();

    const feed = this.element.querySelector<HTMLElement>('#commentary')!;
    const recent = state.commentary.slice(-14).reverse();
    feed.innerHTML = recent
      .map((line) => `<li class="tone-${line.tone}"><span>${line.minute}'</span> ${line.text}</li>`)
      .join('');

    // Announce the newest line, once. Compared against what was last announced
    // rather than against a length, because the feed is a rolling window and
    // its length stops changing long before the match does.
    const latest = state.commentary[state.commentary.length - 1];
    if (latest && latest.text !== this.announced) {
      this.announced = latest.text;
      this.element.querySelector<HTMLElement>('#commentary-live')!.textContent =
        `${latest.minute} minutes. ${latest.text}`;
    }

    const s = state.stats;
    const stats: [string, string][] = [
      ['Goals', String(s.goals)],
      ['Assists', String(s.assists)],
      ['Shots (on target)', `${s.shots} (${s.shotsOnTarget})`],
      ['Key passes', String(s.keyPasses)],
      ['Dribbles', `${s.dribbles}/${s.dribblesAttempted}`],
      ['Passes', `${s.passesCompleted}/${s.passes} (${Math.round(passCompletionRate(s) * 100)}%)`],
      ['Tackles / int.', `${s.tackles} / ${s.interceptions}`],
      ['Big chances missed', String(s.bigChancesMissed)],
      ['Involvements', String(s.involvements)],
      ['Rating', this.engine.rating().toFixed(1)],
    ];
    this.element.querySelector<HTMLElement>('#stats')!.innerHTML = stats
      .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
      .join('');

    const fitness = this.engine.matchPlayer.fitness;
    const bar = this.element.querySelector<HTMLElement>('#fitness-bar')!;
    bar.style.width = `${fitness}%`;
    bar.classList.toggle('low', fitness < 40);
  }
}
