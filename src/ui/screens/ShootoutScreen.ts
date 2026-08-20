import type { ShootoutEngine } from '../../simulation/ShootoutEngine.ts';
import type { EventOverlay } from '../components/EventOverlay.ts';
import { REGULATION_KICKS } from '../../core/career/shootout.ts';
import type { ShootoutKick, ShootoutSide } from '../../core/career/shootout.ts';

/**
 * THE SHOOTOUT
 *
 * A knockout tie that finished level, played out from the spot.
 *
 * This screen exists because of what used to happen instead: nothing. The match
 * ended 1-1, the full-time screen said "Draw", and somewhere out of sight the
 * bracket rolled a number and knocked you out of the cup. The shootout has
 * always been there — it was simply never shown, and never yours to take.
 *
 * The pacing is the point. Kicks arrive one at a time with a beat between them,
 * because a shootout that resolved instantly would be a list rather than an
 * ordeal, and because the wait before your own kick is most of what a shootout
 * is. Your kick uses the ordinary event overlay, so it is the penalty you
 * already know how to take — six options, a keeper who commits inside your
 * window, and this time the tie on it.
 */

/** How long to sit on each simulated kick, in milliseconds. */
const KICK_PAUSE = 1100;

/** A longer beat before your own, because that wait is the whole feeling. */
const OWN_KICK_PAUSE = 1500;

export interface ShootoutNames {
  /** The player's side — his club, or his nation in an international. */
  player: string;
  opponent: string;
  /** What the tie was, e.g. "The English Cup — Semi-final". */
  competition: string;
}

export class ShootoutScreen {
  readonly element: HTMLElement;
  private readonly board: HTMLElement;
  private readonly commentary: HTMLElement;
  private readonly score: HTMLElement;
  private readonly status: HTMLElement;
  private stopped = false;

  constructor(
    private readonly engine: ShootoutEngine,
    private readonly overlay: EventOverlay,
    private readonly names: ShootoutNames,
    private readonly onFinished: (winner: ShootoutSide) => void,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'screen shootout-screen';
    this.element.innerHTML = `
      <header class="shootout-head">
        <p class="shootout-kicker">${names.competition}</p>
        <h1>Penalties</h1>
        <p class="hint">
          Level after ninety minutes. ${names.player} take the first kick, and you are
          <strong>number ${engine.playerTaker}</strong> in the order.
        </p>
      </header>

      <div class="shootout-score">
        <div class="shootout-team">
          <span class="shootout-name">${names.player}</span>
          <span class="shootout-value" id="shootout-player">0</span>
        </div>
        <span class="shootout-dash">—</span>
        <div class="shootout-team">
          <span class="shootout-value" id="shootout-opponent">0</span>
          <span class="shootout-name">${names.opponent}</span>
        </div>
      </div>

      <div class="shootout-board" id="shootout-board"></div>
      <p class="shootout-status" id="shootout-status">The first kick.</p>
      <ol class="shootout-commentary" id="shootout-commentary"></ol>`;

    this.element.appendChild(this.overlay.element);
    this.board = this.element.querySelector<HTMLElement>('#shootout-board')!;
    this.commentary = this.element.querySelector<HTMLElement>('#shootout-commentary')!;
    this.score = this.element.querySelector<HTMLElement>('#shootout-player')!;
    this.status = this.element.querySelector<HTMLElement>('#shootout-status')!;
    this.renderBoard();
  }

  /** Stop driving the shootout. Called when the screen is torn down. */
  stop(): void {
    this.stopped = true;
  }

  start(): void {
    void this.run();
  }

  /**
   * Walk the shootout to its end.
   *
   * One loop rather than a chain of timeouts: every step either waits a beat or
   * waits for a human, and `await` says that far more plainly than a callback
   * would. `stopped` is checked after every wait, because the player can leave
   * the screen mid-shootout by reloading and the loop must not outlive it.
   */
  private async run(): Promise<void> {
    for (;;) {
      if (this.stopped) return;
      const turn = this.engine.advance();

      if (turn.kind === 'finished') {
        this.renderBoard();
        this.finish(turn.winner);
        return;
      }

      if (turn.kind === 'simulated') {
        const kick = this.engine.state.kicks[this.engine.state.kicks.length - 1]!;
        this.report(kick);
        this.renderBoard();
        await this.pause(KICK_PAUSE);
        continue;
      }

      // The player's own. Announce it, let it land, then hand over the overlay.
      this.status.textContent = this.engine.state.suddenDeath
        ? 'Sudden death. This one is yours.'
        : 'Your kick.';
      this.status.classList.add('yours');
      await this.pause(OWN_KICK_PAUSE);
      if (this.stopped) return;

      const decision = await this.overlay.present(turn.event);
      const outcome = this.engine.submitKick({
        option: decision.option,
        timeUsed: decision.timeUsed,
        untimed: decision.untimed,
      });
      this.overlay.hide();
      this.status.classList.remove('yours');

      this.report(this.engine.state.kicks[this.engine.state.kicks.length - 1]!, outcome.scored);
      this.renderBoard();
      await this.pause(KICK_PAUSE);
    }
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private report(kick: ShootoutKick, ownScored?: boolean): void {
    const line = document.createElement('li');
    const who = kick.side === 'player' ? this.names.player : this.names.opponent;
    line.className = kick.scored ? 'scored' : 'missed';
    if (kick.own) line.classList.add('own');
    line.innerHTML = `<span class="shootout-taker">${who} ${kick.taker}</span> ${kick.note}`;
    this.commentary.appendChild(line);
    this.commentary.scrollTop = this.commentary.scrollHeight;

    const state = this.engine.state;
    this.score.textContent = String(state.playerScore);
    this.element.querySelector<HTMLElement>('#shootout-opponent')!.textContent = String(
      state.opponentScore,
    );

    if (ownScored !== undefined) return;
    this.status.textContent = state.suddenDeath ? 'Sudden death.' : 'Next up.';
  }

  /**
   * The grid of kicks, both sides.
   *
   * Shows the five regulation slots always, so you can see how many are left,
   * and grows into sudden death only once it gets there. A shootout you cannot
   * count is a shootout you cannot feel.
   */
  private renderBoard(): void {
    const state = this.engine.state;
    const rounds = Math.max(
      REGULATION_KICKS,
      Math.max(
        state.kicks.filter((k) => k.side === 'player').length,
        state.kicks.filter((k) => k.side === 'opponent').length,
      ),
    );

    const row = (side: ShootoutSide, label: string) => {
      const mine = state.kicks.filter((kick) => kick.side === side);
      const cells = Array.from({ length: rounds }, (_, index) => {
        const kick = mine[index];
        if (!kick) return `<span class="kick pending"></span>`;
        const classes = ['kick', kick.scored ? 'scored' : 'missed'];
        if (kick.own) classes.push('own');
        return `<span class="${classes.join(' ')}">${kick.scored ? '●' : '○'}</span>`;
      }).join('');
      return `<div class="shootout-row">
          <span class="shootout-row-name">${label}</span>
          <span class="shootout-kicks">${cells}</span>
        </div>`;
    };

    this.board.innerHTML =
      row('player', this.names.player) + row('opponent', this.names.opponent);
  }

  private finish(winner: ShootoutSide): void {
    const won = winner === 'player';
    this.status.textContent = won
      ? `${this.names.player} win the shootout ${this.engine.state.playerScore}-${this.engine.state.opponentScore}.`
      : `${this.names.opponent} win the shootout ${this.engine.state.opponentScore}-${this.engine.state.playerScore}.`;
    this.status.classList.add(won ? 'won' : 'lost');

    const button = document.createElement('button');
    button.className = 'primary';
    button.id = 'shootout-continue';
    button.textContent = won ? 'Through' : 'Out';
    button.addEventListener('click', () => this.onFinished(winner));
    this.element.appendChild(button);
  }
}
