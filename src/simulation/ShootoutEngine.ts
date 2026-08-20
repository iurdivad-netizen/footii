import { Rng } from '../core/rng.ts';
import type { Player } from '../core/player/player.ts';
import type { Team } from '../core/team/team.ts';
import type { Goalkeeper } from '../core/goalkeeper/goalkeeper.ts';
import type { Position } from '../core/player/positions.ts';
import {
  conversionChance,
  createShootout,
  isPlayersKick,
  nextKick,
  recordKick,
  simulateKick,
  takingOrder,
} from '../core/career/shootout.ts';
import type { ShootoutSide, ShootoutState } from '../core/career/shootout.ts';
import { generateSituation } from './SituationGenerator.ts';
import { generateActions } from './ActionGenerator.ts';
import { generateBuildUp } from '../data/buildUp.ts';
import { getSituationTemplate } from '../data/situations.ts';
import { calculateDecisionTime } from './DecisionTimer.ts';
import { chooseInstinctiveAction } from './InstinctiveAction.ts';
import { resolveAction } from './ActionResolver.ts';
import type { InteractiveEvent, DecisionSubmission } from './MatchEngine.ts';
import { clamp01 } from '../core/util/math.ts';

/**
 * DRIVING A SHOOTOUT
 *
 * The rules live in `core/career/shootout.ts`; this is what turns them into
 * something with a human in it.
 *
 * The player's kick is BUILT FROM THE SAME PENALTY the match engine uses —
 * same template, same six options, same keeper who commits partway through your
 * window. That reuse is the whole design: a shootout penalty should be exactly
 * the penalty you already know how to take, because the thing that makes it
 * different is what is riding on it, not the mechanics.
 *
 * NOTHING HERE TOUCHES THE CAREER. No statistics are applied, no rating moves,
 * no record book is written. Shootout goals are not goals — that is how
 * football counts them — and keeping the engine outside the match entirely is
 * what makes that true by construction rather than by remembering to skip it.
 */
export interface ShootoutSetup {
  player: Player;
  /** The player's club, or his nation in an international knockout. */
  playerTeam: Team;
  opponent: Team;
  /** The keeper the player's side faces. */
  opponentGoalkeeper: Goalkeeper;
  /** His own keeper, who faces the other side's kicks. */
  ownGoalkeeper: Goalkeeper;
  paceScale?: number;
}

/** What the screen should do next. */
export type ShootoutTurn =
  | { kind: 'simulated'; side: ShootoutSide; taker: number }
  | { kind: 'yours'; event: InteractiveEvent }
  | { kind: 'finished'; winner: ShootoutSide };

export class ShootoutEngine {
  readonly state: ShootoutState = createShootout();
  /** Where in his side's order the player takes his kick. */
  readonly playerTaker: number;
  private readonly rng: Rng;
  private readonly chances: Record<ShootoutSide, number>;
  private eventCounter = 0;
  private pending: InteractiveEvent | null = null;

  constructor(
    private readonly setup: ShootoutSetup,
    seed: string,
  ) {
    this.rng = new Rng(`${seed}:shootout`);
    this.playerTaker = takingOrder(
      setup.player.attributes.finishing,
      setup.player.attributes.composure,
    );
    this.chances = {
      player: conversionChance(setup.playerTeam, setup.opponentGoalkeeper),
      opponent: conversionChance(setup.opponent, setup.ownGoalkeeper),
    };
  }

  /**
   * Advance to the next kick.
   *
   * A simulated kick is taken and reported in one call; the player's own kick
   * is only PREPARED, and the caller must present it and come back with
   * `submitKick`. That split is what lets the screen put the overlay up and
   * wait, rather than the engine having to know about the UI.
   */
  advance(): ShootoutTurn {
    if (this.state.winner) return { kind: 'finished', winner: this.state.winner };

    const turn = nextKick(this.state);
    if (!turn) {
      // `nextKick` only returns null once a winner is set, so this is
      // unreachable in practice and cheap to make impossible in principle.
      const winner: ShootoutSide =
        this.state.playerScore >= this.state.opponentScore ? 'player' : 'opponent';
      this.state.winner = winner;
      return { kind: 'finished', winner };
    }

    if (isPlayersKick(turn, this.playerTaker)) {
      this.pending = this.buildPenalty();
      return { kind: 'yours', event: this.pending };
    }

    recordKick(
      this.state,
      simulateKick(
        this.rng.fork(`kick:${this.state.kicks.length}`),
        turn.side,
        turn.taker,
        this.chances[turn.side],
      ),
    );
    return { kind: 'simulated', side: turn.side, taker: turn.taker };
  }

  /**
   * Resolve the player's own kick.
   *
   * `submission.option` is null when the clock ran out, exactly as in a match,
   * and the instinctive fallback picks for him — standing over a penalty and
   * running out of time is a real way to miss one.
   */
  submitKick(submission: DecisionSubmission): { scored: boolean; commentary: string } {
    const event = this.pending;
    if (!event) throw new Error('submitKick called with no kick pending');

    if (submission.timeUsed >= event.context.goalkeeper.commitAt) {
      event.context.goalkeeper.action = event.context.goalkeeper.committedAction;
    }

    let option = submission.option;
    const expired = option === null;
    if (option === null) {
      option = chooseInstinctiveAction(this.rng, event.context, event.options).option;
    }

    const result = resolveAction(this.rng.fork(`own:${this.state.kicks.length}`), event.context, {
      option,
      timeUsed: submission.timeUsed,
      window: event.timer.seconds,
      expired,
      untimed: submission.untimed ?? false,
    });

    const scored = result.outcome.goalScored;
    // The outcome's own commentary, which already describes the kick that was
    // actually taken — a Panenka that was read reads as one.
    recordKick(this.state, {
      side: 'player',
      taker: this.playerTaker,
      scored,
      own: true,
      note: result.outcome.commentary,
    });

    this.pending = null;
    return { scored, commentary: result.outcome.commentary };
  }

  /**
   * One penalty, built exactly as the match engine builds one.
   *
   * `forceType` is the only difference: in a match the archetype is chosen from
   * what the player was doing, and here we already know what he is doing.
   */
  private buildPenalty(): InteractiveEvent {
    const rng = this.rng.fork(`penalty:${this.state.kicks.length}`);
    const { context } = generateSituation(rng, {
      player: this.setup.player,
      attackingTeam: this.setup.playerTeam,
      defendingTeam: this.setup.opponent,
      goalkeeper: this.setup.opponentGoalkeeper,
      // Past ninety minutes and past extra time. The situation model reads the
      // minute for pressure, and a shootout is the most pressured moment there is.
      minute: 120,
      defending: false,
      forceType: 'penalty',
    });

    const template = getSituationTemplate('penalty');
    const timer = calculateDecisionTime(context, template, this.setup.paceScale ?? 1);
    context.goalkeeper.commitAt =
      clamp01(context.goalkeeper.commitAt / template.baseTime) * timer.seconds;

    this.eventCounter += 1;
    return {
      id: this.eventCounter,
      minute: 120,
      context,
      template,
      options: generateActions(rng, context, template),
      timer,
      description: template.describe(context),
      buildUp: generateBuildUp(rng, context, template),
      defending: false,
    };
  }

  /** The player's position, for a screen that wants to name him properly. */
  get position(): Position {
    return this.setup.player.position;
  }
}
