import { OUTCOME_LABELS } from '../../core/events/types.ts';
import type { ActionOption, OutcomeKind } from '../../core/events/types.ts';
import type { InteractiveEvent } from '../../simulation/MatchEngine.ts';
import { SituationRenderer } from '../../rendering/events/SituationRenderer.ts';
import type { RenderState } from '../../rendering/events/SituationRenderer.ts';
import { sound } from '../../audio/SoundEngine.ts';
import { shouldReplay } from '../replay.ts';
import type { ReplaySetting } from '../replay.ts';
import type { InputController } from '../interaction/InputController.ts';
import { LEGEND_ORDER, familyStyle } from '../actionFamilyStyle.ts';
import { keeperStatus } from '../keeperStatus.ts';
import type { GoalkeeperAction } from '../../core/goalkeeper/goalkeeper.ts';
import { COLOURS } from '../../rendering/events/SituationRenderer.ts';
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

/**
 * What the dots on the pitch are.
 *
 * The action families had a key from the start and the pitch never did, so a
 * first-time player had to infer that blue was himself from the fact that it
 * moved. Drawn from the renderer's own palette rather than restated, because a
 * key in approximately the right colour is worse than no key.
 */
const PITCH_KEY: readonly { colour: string; label: string; hollow?: boolean }[] = [
  { colour: COLOURS.player, label: 'You' },
  { colour: COLOURS.ball, label: 'Ball' },
  // Named separately and drawn hollow, matching the pitch: a key that showed a
  // solid dot for a ring would be a key for a different picture.
  { colour: COLOURS.teammate, label: 'Team-mate', hollow: true },
  { colour: COLOURS.defender, label: 'Defender' },
  { colour: COLOURS.keeper, label: 'Keeper' },
];

/** Whether any of the six is a ball played to somebody else. */
function hasReceiverOption(event: InteractiveEvent): boolean {
  return (
    event.context.teammates.length > 0 &&
    event.options.some((option) => option.family === 'pass' || option.family === 'cross')
  );
}

export interface DecisionResult {
  option: ActionOption | null;
  timeUsed: number;
  untimed: boolean;
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
  private readonly timerCaption: HTMLElement;
  private readonly keeperStrip: HTMLElement;
  private readonly keeperState: HTMLElement;
  private readonly keeperTell: HTMLElement;
  private readonly pitchKey: HTMLElement;
  /** The last keeper state written, so the DOM is only touched when it moves. */
  private keeperShown = '';
  private readonly legend: HTMLElement;
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
  /** Half-second marks already ticked this window, so each sounds once. */
  private lastTickIndex = -1;
  /** Whether this moment has anybody to give it to. See hasReceiverOption. */
  private showTeammates = false;
  /**
   * The scene as it stood when the decision was made, kept so the resolution
   * can be animated after the engine has resolved it. The event itself is
   * gone by then — `finish` hands it back — but the picture is still owed an
   * ending.
   */
  private resolutionScene: RenderState | null = null;

  /** Pace multiplier, applied to the reading phase as well as the timer. */
  paceScale = 1;
  /**
   * When true the clock never expires. The keeper still commits on schedule, so
   * the read is unchanged — you simply get to take your time over it.
   */
  untimed = false;
  /**
   * Whether the resolution is replayed on the pitch. Held as the SETTING rather
   * than as a resolved boolean so that "follow my browser" keeps following it:
   * somebody can turn reduced motion on mid-session and the next chance obeys.
   */
  replay: ReplaySetting = 'system';

  constructor(private readonly input: InputController) {
    this.element = document.createElement('div');
    this.element.className = 'event-overlay hidden';
    this.element.innerHTML = `
      <div class="event-panel">
        <ol class="event-story"></ol>
        <div class="event-subline"></div>
        <canvas class="event-canvas" width="480" height="240" aria-hidden="true"></canvas>
        <p class="pitch-key" aria-hidden="true"></p>
        <div class="keeper-strip" aria-live="polite">
          <span class="keeper-who">Keeper</span>
          <span class="keeper-state"></span>
          <span class="keeper-tell"></span>
        </div>
        <div class="timer">
          <div class="timer-bar"><span></span></div>
          <div class="timer-readout">
            <span class="timer-value">0.0</span>
            <span class="timer-caption"></span>
          </div>
        </div>
        <div class="set-label" aria-live="polite"></div>
        <div class="option-grid" role="group" aria-label="Choose an action"></div>
        <p class="family-legend" id="family-legend"></p>
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
    this.timerCaption = this.element.querySelector('.timer-caption')!;
    this.keeperStrip = this.element.querySelector('.keeper-strip')!;
    this.keeperState = this.element.querySelector('.keeper-state')!;
    this.keeperTell = this.element.querySelector('.keeper-tell')!;
    this.pitchKey = this.element.querySelector('.pitch-key')!;
    this.renderPitchKey(false);
    this.legend = this.element.querySelector('.family-legend')!;

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
      const style = familyStyle(option.family);
      button.innerHTML =
        `<span class="option-key">${option.slot}</span>` +
        `<span class="option-family">${style.tag}</span>` +
        `<span class="option-label">${option.label}</span>`;
      // The colour is set here but suppressed by CSS while the grid is
      // concealed: revealing it during the build-up would give away how many
      // shots or passes are on offer before the options themselves appear.
      button.style.setProperty('--family-colour', style.colour);
      button.dataset.family = option.family;
      button.setAttribute('aria-label', `${option.slot}. ${style.label}: ${option.label}`);
      button.disabled = true;
      button.classList.remove('chosen');
    });
    this.grid.classList.add('concealed');
    this.optionsRevealed = false;

    // The legend lists only the families actually on offer, which makes it a
    // useful summary rather than a wall of keys. Hidden until the reveal for
    // the same reason the colours are.
    const families = LEGEND_ORDER.filter((family) =>
      event.options.some((option) => option.family === family),
    );
    this.legend.innerHTML = families
      .map((family) => {
        const style = familyStyle(family);
        return `<span style="color:${style.colour}"><i></i>${style.tag}</span>`;
      })
      .join('');
    this.legend.classList.add('hidden');

    this.renderer.resize();
    this.input.setSlotHandler((slot) => this.choose(slot));

    // Phase lengths. See ui/interaction/readingTime.ts.
    this.buildUpTime = calculateBuildUpTime(event.buildUp, this.paceScale);
    this.scanTime = calculateScanTime(this.paceScale);
    this.countdownStarted = false;
    this.lastTickIndex = -1;
    // Cleared, or the last moment's outcome greets the next one.
    this.setLabel.className = 'set-label';
    this.setLabel.textContent = '';
    // The crowd notices something is on before the player is asked anything.
    sound.crowd(0.4);
    // Forced to redraw on the first frame of the new event, so a keeper who
    // happens to be doing what the last one was still gets announced.
    this.keeperShown = '';
    this.keeperStrip.classList.toggle('absent', !event.template.goalkeeperInvolved);
    // Receivers are drawn only when giving it to one of them is on the table.
    this.showTeammates = hasReceiverOption(event);
    this.renderPitchKey(this.showTeammates);
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
      // Captioned, because a bare number beside a full bar reads as a countdown
      // that has jammed. It is not counting anything yet — it is how long this
      // particular moment is going to give you, which is worth knowing before
      // it starts.
      this.showTimer(event.timer.seconds, this.untimed ? 'no limit' : 'your window');
      this.setLabel.textContent = 'Watch it develop…';
      this.showKeeper(keeperInvolved ? 'set' : null);
      // The keeper has not moved and gives nothing away yet.
      this.renderer.draw({
        context: event.context,
        progress: 0,
        committed: false,
        keeperAction: 'set',
        showGoalkeeper: keeperInvolved,
        showTeammates: this.showTeammates,
      });
      this.frame = requestAnimationFrame(this.loop);
      return;
    }

    // --- phase 2: SCAN — options appear, clock still stopped ----------------
    if (!this.optionsRevealed) {
      this.optionsRevealed = true;
      sound.reveal();
      sound.crowd(0.7);
      // The final beat is the situation itself, and lands with the options.
      while (this.beatsShown < event.buildUp.length) {
        this.appendBeat(event.buildUp[this.beatsShown]!, true);
        this.beatsShown += 1;
      }
      this.grid.classList.remove('concealed');
      this.legend.classList.remove('hidden');
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

    if (this.untimed) {
      // Show elapsed time rather than a countdown: there is nothing to run out.
      this.timerBar.style.width = '100%';
      this.timerBar.classList.remove('critical');
      this.timerValue.textContent = elapsed.toFixed(1);
      this.timerCaption.textContent = 'elapsed · no limit';
      this.setLabel.textContent = '';
    } else {
      this.timerBar.style.width = `${(1 - progress) * 100}%`;
      this.timerBar.classList.toggle('critical', remaining < window_ * 0.3);
      // One decimal, not two. Nobody has ever read a hundredth of a second off
      // a screen, and the extra digit only made the number harder to glance at
      // in precisely the moment glancing is all there is time for.
      this.showTimer(remaining, 'seconds left');
      // The clock, audibly: twice a second, weightier as it drains. Never at
      // the untimed pace — a clock you can hear is the pressure that setting
      // removes.
      const tickIndex = Math.floor(elapsed * 2);
      if (tickIndex > this.lastTickIndex) {
        this.lastTickIndex = tickIndex;
        if (tickIndex > 0) sound.clockTick(progress);
      }
    }

    this.showKeeper(keeperInvolved ? keeperAction : null);

    this.renderer.draw({
      context: event.context,
      progress,
      committed: keeperInvolved && committed,
      keeperAction: keeperInvolved ? keeperAction : 'set',
      showGoalkeeper: keeperInvolved,
      showTeammates: this.showTeammates,
    });

    if (!this.untimed && remaining <= 0) {
      sound.expire();
      this.finish(null, window_);
      return;
    }

    this.frame = requestAnimationFrame(this.loop);
  };

  /**
   * The key under the pitch.
   *
   * Rebuilt per event rather than written once, because the team-mate entry
   * only belongs there on the moments that draw one — a key naming a dot that
   * is not on the picture is worse than a shorter key.
   */
  private renderPitchKey(withTeammates: boolean): void {
    this.pitchKey.innerHTML = PITCH_KEY.filter(
      (entry) => withTeammates || entry.label !== 'Team-mate',
    )
      .map(
        (entry) =>
          `<span><i style="${
            entry.hollow
              ? `border:2px solid ${entry.colour}`
              : `background:${entry.colour}`
          }"></i>${entry.label}</span>`,
      )
      .join('');
  }

  /** The clock, and what it is a clock for. */
  private showTimer(seconds: number, caption: string): void {
    this.timerValue.textContent = seconds.toFixed(1);
    this.timerCaption.textContent = caption;
  }

  /**
   * What the keeper is doing, written where it can actually be read.
   *
   * Only touched when it CHANGES, for two reasons. Rewriting identical text
   * sixty times a second is wasted work; more importantly the strip is an
   * `aria-live` region, and rewriting it every frame would have a screen reader
   * announcing the same sentence until the window ran out. The moment he
   * commits is the one thing worth interrupting somebody to say.
   */
  private showKeeper(action: GoalkeeperAction | null): void {
    if (action === null) {
      if (this.keeperShown === 'none') return;
      this.keeperShown = 'none';
      this.keeperState.textContent = '';
      this.keeperTell.textContent = '';
      return;
    }
    if (this.keeperShown === action) return;
    this.keeperShown = action;

    const status = keeperStatus(action);
    // The commit is the one change worth a sound of its own — same rule as the
    // aria-live announcement this strip already makes.
    if (status.committed && !this.keeperStrip.classList.contains('committed')) {
      sound.keeperCommit();
    }
    this.keeperState.textContent = status.label;
    this.keeperTell.textContent = status.tell;
    this.keeperStrip.classList.toggle('committed', status.committed);
  }

  private appendBeat(text: string, isSituation = false): void {
    const item = document.createElement('li');
    item.className = isSituation ? 'beat beat-situation' : 'beat';
    item.textContent = text;
    this.story.appendChild(item);
    sound.beat();
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
    sound.choose();
    this.finish(option, Math.min(elapsed, this.active.timer.seconds));

  }

  private finish(option: ActionOption | null, timeUsed: number): void {
    cancelAnimationFrame(this.frame);
    this.input.setSlotHandler(null);
    for (const button of this.buttons) button.disabled = true;
    // "Now!" must not outlive the decision it was urging.
    this.setLabel.textContent = '';
    const event = this.active;
    // The picture the resolution will animate over: keeper committed, because
    // by the time an outcome exists he has moved whether or not the player
    // waited to see it.
    if (event) {
      const keeperInvolved = event.template.goalkeeperInvolved;
      this.resolutionScene = {
        context: event.context,
        progress: 1,
        committed: keeperInvolved,
        keeperAction: keeperInvolved ? event.context.goalkeeper.committedAction : 'set',
        showGoalkeeper: keeperInvolved,
        // Kept for the replay: the man the ball is flying to must still be on
        // the pitch when it gets there.
        showTeammates: this.showTeammates,
      };
    }
    const settle = this.settle;
    this.settle = null;
    this.active = null;
    settle?.({ option, timeUsed, untimed: this.untimed });
  }

  /**
   * Animate how the moment resolved, on the same pitch it was read on.
   *
   * Called by the screen AFTER the engine has resolved the decision, because
   * the ending cannot be drawn until it exists. Nothing about the animation is
   * new information — the outcome is already decided — it is the answer shown
   * in the picture that asked the question. The outcome cue sounds on the
   * impact frame, so what is heard lands when what is seen does.
   *
   * Skipped (sound and outcome text intact) when the Replays setting says so —
   * see ui/replay.ts — or when there is no scene to animate over. A resolution
   * with no picture is the banner's job, exactly as before.
   */
  async playResolution(outcome: OutcomeKind, option: ActionOption | null): Promise<void> {
    const scene = this.resolutionScene;
    this.resolutionScene = null;
    sound.crowd(0);
    if (!scene || !shouldReplay(this.replay)) {
      this.showOutcomeLabel(outcome);
      sound.outcome(outcome);
      return;
    }
    // The strip must agree with the picture: the canvas is about to show the
    // keeper's committed dive, so the words say so too — even for a player who
    // fired before waiting to see it.
    if (scene.showGoalkeeper) this.showKeeper(scene.keeperAction);
    await this.renderer.animateResolution(
      scene,
      {
        outcome,
        actionKind: option?.kind ?? 'shootCentre',
        family: option?.family ?? 'shot',
      },
      () => {
        this.showOutcomeLabel(outcome);
        sound.outcome(outcome);
      },
    );
  }

  /**
   * How it ended, on the line that spent the moment urging you on.
   *
   * The match screen's banner says the same thing a beat later, behind an
   * overlay that has not come down yet — so between the ball arriving and the
   * panel closing there was nothing in words at all. This fills exactly that
   * gap, in the same place the eye already is.
   */
  private showOutcomeLabel(outcome: OutcomeKind): void {
    const tone =
      outcome === 'goal'
        ? 'goal'
        : outcome === 'saved' ||
            outcome === 'chanceCreated' ||
            outcome === 'passCompleted' ||
            outcome === 'crossCompleted' ||
            outcome === 'dribbleSuccess' ||
            outcome === 'ballWon' ||
            outcome === 'held'
          ? 'good'
          : 'bad';
    this.setLabel.className = `set-label resolved tone-${tone}`;
    this.setLabel.textContent = OUTCOME_LABELS[outcome];
  }

  hide(): void {
    this.element.classList.add('hidden');
  }
}
