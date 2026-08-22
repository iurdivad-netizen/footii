import { clamp01, unit } from '../core/util/math.ts';
import { Rng } from '../core/rng.ts';
import { applyExertion, clonePlayer } from '../core/player/player.ts';
import type { Player } from '../core/player/player.ts';
import { teamStrength } from '../core/team/team.ts';
import type { ActionOption, SituationContext } from '../core/events/types.ts';
import type { MatchSetup, MatchState } from '../core/match/matchState.ts';
import { createMatchState, matchResult, pushCommentary } from '../core/match/matchState.ts';
import { applyOutcomeStats, calculateMatchRating } from '../core/match/matchStats.ts';
import { getSituationTemplate } from '../data/situations.ts';
import { generateBuildUp } from '../data/buildUp.ts';
import type { SituationTemplate } from '../data/situations.ts';
import { generateActions } from './ActionGenerator.ts';
import { calculateDecisionTime } from './DecisionTimer.ts';
import type { DecisionTimerResult } from './DecisionTimer.ts';
import { generateSituation, involvementChance } from './SituationGenerator.ts';
import { chooseInstinctiveAction } from './InstinctiveAction.ts';
import type { DecisionInput, ResolutionResult } from './ActionResolver.ts';
import { resolveAction } from './ActionResolver.ts';

/**
 * MATCH ENGINE
 *
 * A probabilistic, event-driven simulation — no per-frame physics and no
 * simulation of the other twenty-one players. Each minute is one possession
 * sequence:
 *
 *   minute -> which team has the ball -> is the player involved?
 *      no  -> simulate the sequence in the background (may produce a goal)
 *      yes -> emit an InteractiveEvent and STOP until the human decides
 *
 * The engine never touches the DOM or a timer; the UI drives it by calling
 * `step()`. That keeps the whole simulation testable and head-less.
 */

/**
 * Global scaling on how often the human is pulled into an event.
 * Raise it for a busier, more arcade-like match; lower it to make each
 * involvement feel rarer and more important. Tuned so a striker gets roughly
 * 6-9 interactive moments in a 90 minute match.
 */
export const EVENT_RATE = 0.45;

/** Probability that a non-interactive attacking sequence produces a goal. */
export const BACKGROUND_GOAL_RATE = 0.026;

export interface InteractiveEvent {
  id: number;
  minute: number;
  context: SituationContext;
  template: SituationTemplate;
  options: ActionOption[];
  timer: DecisionTimerResult;
  description: string;
  /**
   * Ordered narration beats revealed before the options appear. The last beat
   * is the situation description itself.
   */
  buildUp: string[];
  /** True when the player's team is defending (a defensive duel). */
  defending: boolean;
}

export type MatchUpdate =
  | { kind: 'background'; minute: number }
  | { kind: 'interactive'; minute: number; event: InteractiveEvent }
  | { kind: 'finished'; minute: number };

export interface DecisionSubmission {
  /** The option the human picked, or null if the timer expired. */
  option: ActionOption | null;
  timeUsed: number;
  /** True when played without a time limit. */
  untimed?: boolean;
}

export interface EventResolution {
  result: ResolutionResult;
  /** Set when the timer expired and instinct took over. */
  instinctReason?: string;
  option: ActionOption;
}

export class MatchEngine {
  readonly state: MatchState;
  readonly setup: MatchSetup;
  /**
   * The player as he exists FOR THIS MATCH. A clone, so that draining fitness
   * over 90 minutes never mutates the persistent career player.
   */
  readonly matchPlayer: Player;
  private readonly rng: Rng;
  private pendingEvent: InteractiveEvent | null = null;
  private eventCounter = 0;

  constructor(setup: MatchSetup, seed: string | number = 'match') {
    this.setup = setup;
    this.matchPlayer = clonePlayer(setup.player);
    this.rng = new Rng(seed);
    this.state = createMatchState();
    pushCommentary(
      this.state,
      `${setup.playerTeam.name} v ${setup.opponent.name}. ${setup.player.name} starts at ${setup.player.position}.`,
      'system',
    );
  }

  get currentEvent(): InteractiveEvent | null {
    return this.pendingEvent;
  }

  /** Share of possession for the player's team, 0-1. */
  private possessionShare(): number {
    const own = teamStrength(this.setup.playerTeam) + unit(this.setup.playerTeam.ratings.possession);
    const other = teamStrength(this.setup.opponent) + unit(this.setup.opponent.ratings.possession);
    return clamp01(own / (own + other));
  }

  /**
   * Advance the match by one minute.
   * Returns an interactive event when the human must act; the engine will not
   * advance again until `submitDecision` has been called.
   */
  step(): MatchUpdate {
    if (this.state.finished) return { kind: 'finished', minute: this.state.minute };
    if (this.pendingEvent) {
      return { kind: 'interactive', minute: this.state.minute, event: this.pendingEvent };
    }

    this.state.minute += 1;
    this.state.stats.minutes = this.state.minute;
    applyExertion(this.matchPlayer, 1, 1 + unit(this.setup.opponent.ratings.pressing) * 0.4);

    if (this.state.minute > this.setup.length) {
      this.state.finished = true;
      pushCommentary(this.state, 'Full time.', 'system');
      return { kind: 'finished', minute: this.state.minute };
    }

    const playerTeamHasBall = this.rng.chance(this.possessionShare());

    if (playerTeamHasBall) {
      const involvement = involvementChance(this.matchPlayer, this.setup.playerTeam) * EVENT_RATE;
      if (this.rng.chance(involvement)) {
        return this.createInteractiveEvent(false);
      }
      this.simulateBackgroundAttack(true);
    } else {
      const involvement =
        involvementChance(this.matchPlayer, this.setup.playerTeam, true) * EVENT_RATE * 0.5;
      if (this.rng.chance(involvement)) {
        return this.createInteractiveEvent(true);
      }
      this.simulateBackgroundAttack(false);
    }

    return { kind: 'background', minute: this.state.minute };
  }

  private simulateBackgroundAttack(playerTeamAttacking: boolean): void {
    const attacking = playerTeamAttacking ? this.setup.playerTeam : this.setup.opponent;
    const defending = playerTeamAttacking ? this.setup.opponent : this.setup.playerTeam;
    const keeper = playerTeamAttacking ? this.setup.opponentGoalkeeper : this.setup.ownGoalkeeper;

    const edge = unit(attacking.ratings.attack) - unit(defending.ratings.defence);
    const goalChance = clamp01(BACKGROUND_GOAL_RATE * (1 + edge * 1.6)) *
      (1 - unit(keeper.attributes.reflexes) * 0.3);

    if (this.rng.chance(goalChance)) {
      if (playerTeamAttacking) {
        this.state.playerTeamScore += 1;
        pushCommentary(
          this.state,
          `GOAL! ${attacking.name} score — ${this.scoreline()}.`,
          'goal',
        );
      } else {
        this.state.opponentScore += 1;
        pushCommentary(
          this.state,
          `${attacking.name} score against the run of play — ${this.scoreline()}.`,
          'danger',
        );
      }
    }
  }

  private createInteractiveEvent(defending: boolean): MatchUpdate {
    const attackingTeam = defending ? this.setup.opponent : this.setup.playerTeam;
    const defendingTeam = defending ? this.setup.playerTeam : this.setup.opponent;

    const { type, context } = generateSituation(this.rng, {
      player: this.matchPlayer,
      // Only when his own side has the ball. Defending against the opposition,
      // the people around him are not his to name.
      teammates: defending ? [] : this.setup.teammates,
      attackingTeam,
      defendingTeam,
      goalkeeper: defending ? this.setup.ownGoalkeeper : this.setup.opponentGoalkeeper,
      minute: this.state.minute,
      defending,
    });

    const template = getSituationTemplate(type);
    const timer = calculateDecisionTime(
      context,
      template,
      this.setup.paceScale ?? 1,
      this.setup.preparation ?? 0,
    );

    // The keeper's commit moment was seeded from the template's base time;
    // rescale it onto the real window so it always lands inside the window.
    context.goalkeeper.commitAt = clamp01(context.goalkeeper.commitAt / template.baseTime) * timer.seconds;

    const options = generateActions(this.rng, context, template);

    this.eventCounter += 1;
    const event: InteractiveEvent = {
      id: this.eventCounter,
      minute: this.state.minute,
      context,
      template,
      options,
      timer,
      description: template.describe(context),
      buildUp: generateBuildUp(this.rng, context, template),
      defending,
    };

    this.pendingEvent = event;
    this.state.stats.involvements += 1;
    pushCommentary(this.state, event.description, defending ? 'danger' : 'chance');

    return { kind: 'interactive', minute: this.state.minute, event };
  }

  /**
   * Resolve the pending interactive event.
   * `submission.option` is null when the decision timer expired, in which case
   * an instinctive action is chosen from the player's profile.
   */
  submitDecision(submission: DecisionSubmission): EventResolution {
    const event = this.pendingEvent;
    if (!event) throw new Error('submitDecision called with no pending event');

    // Apply the goalkeeper's commit if it happened before the decision.
    if (submission.timeUsed >= event.context.goalkeeper.commitAt) {
      event.context.goalkeeper.action = event.context.goalkeeper.committedAction;
    }

    let option = submission.option;
    let instinctReason: string | undefined;
    const expired = option === null;

    if (option === null) {
      const instinct = chooseInstinctiveAction(this.rng, event.context, event.options);
      option = instinct.option;
      instinctReason = instinct.reason;
    }

    const decision: DecisionInput = {
      option,
      timeUsed: submission.timeUsed,
      window: event.timer.seconds,
      expired,
      untimed: submission.untimed ?? false,
    };

    const result = resolveAction(this.rng, event.context, decision);
    this.applyOutcome(result, event);

    this.pendingEvent = null;
    return { result, option, instinctReason };
  }

  private applyOutcome(result: ResolutionResult, event: InteractiveEvent): void {
    const { outcome } = result;
    applyOutcomeStats(this.state.stats, outcome.stats);
    this.state.eventRatingDelta += outcome.ratingDelta;
    // Kept alongside the count rather than instead of it: two assists is the
    // number, and who scored them is the story.
    if (outcome.assistedBy) this.state.assisted.push(outcome.assistedBy);

    if (outcome.goalScored) {
      this.state.playerTeamScore += 1;
      pushCommentary(this.state, `${outcome.commentary} ${this.scoreline()}`, 'goal');
      return;
    }

    // A defensive event lost badly can concede.
    if (event.defending && outcome.kind === 'turnover') {
      const conceded = this.rng.chance(0.35);
      pushCommentary(this.state, outcome.commentary, 'danger');
      if (conceded) {
        this.state.opponentScore += 1;
        pushCommentary(
          this.state,
          `${this.setup.opponent.name} punish the mistake — ${this.scoreline()}.`,
          'danger',
        );
      }
      return;
    }

    pushCommentary(
      this.state,
      outcome.commentary,
      outcome.kind === 'saved' || outcome.kind === 'chanceCreated' ? 'chance' : 'normal',
    );
  }

  scoreline(): string {
    const { playerTeam, opponent, playerTeamIsHome } = this.setup;
    const playerScore = this.state.playerTeamScore;
    const oppScore = this.state.opponentScore;
    return playerTeamIsHome
      ? `${playerTeam.shortName} ${playerScore}-${oppScore} ${opponent.shortName}`
      : `${opponent.shortName} ${oppScore}-${playerScore} ${playerTeam.shortName}`;
  }

  /** Final rating; valid at any point but meaningful at full time. */
  rating(): number {
    return calculateMatchRating({
      eventDelta: this.state.eventRatingDelta,
      stats: this.state.stats,
      result: matchResult(this.state),
      opponentStrength: teamStrength(this.setup.opponent),
    });
  }
}
