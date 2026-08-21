import type { AttributeWeights } from '../player/attributes.ts';
import type { Player } from '../player/player.ts';
import type { GoalkeeperAttributes, GoalkeeperState } from '../goalkeeper/goalkeeper.ts';
import type { Team, Teammate } from '../team/team.ts';
import type { Zone } from './zones.ts';

/**
 * Situation archetypes.
 *
 * Adding a new archetype means adding a template in `data/situations.ts` plus
 * (optionally) new actions in the catalogue. No engine file needs editing,
 * which is the extensibility requirement for future event types.
 */
export type SituationType =
  | 'oneOnOne'
  | 'throughBallRun'
  | 'edgeOfBox'
  | 'boxSideAttack'
  | 'wideAttack'
  | 'crossArrival'
  | 'midfieldProgression'
  | 'defensiveDuel'
  // set pieces
  | 'penalty'
  | 'freeKickDirect'
  | 'cornerAttack'
  // defensive archetypes beyond the straight duel
  | 'aerialDuel'
  | 'pressingTrap';

export const SITUATION_LABELS: Record<SituationType, string> = {
  oneOnOne: 'One-on-one',
  throughBallRun: 'Running onto a through ball',
  edgeOfBox: 'Edge of the penalty area',
  boxSideAttack: 'Side of the penalty area',
  wideAttack: 'Wide attacking position',
  crossArrival: 'Arriving on a cross',
  midfieldProgression: 'Midfield in possession',
  defensiveDuel: 'Defensive challenge',
  penalty: 'Penalty',
  freeKickDirect: 'Direct free kick',
  cornerAttack: 'Attacking a corner',
  aerialDuel: 'Aerial duel',
  pressingTrap: 'Pressing trap',
};

/** The action families the resolver knows how to score and narrate. */
export type ActionFamily = 'shot' | 'dribble' | 'pass' | 'cross' | 'header' | 'defend' | 'hold';

export type ActionKind =
  // shots
  | 'shootLeft'
  | 'shootCentre'
  | 'shootRight'
  | 'shootEarly'
  | 'shootAcrossGoal'
  | 'shootNearPost'
  | 'shootFarPost'
  | 'shootLow'
  | 'chip'
  | 'curlFarCorner'
  | 'powerDrive'
  | 'placedFinish'
  | 'firstTimeShot'
  // dribbles
  | 'roundKeeper'
  | 'cutInside'
  | 'knockPastDefender'
  | 'carryForward'
  | 'takeOnDefender'
  | 'shieldBall'
  // passes
  | 'throughBallLeft'
  | 'throughBallCentre'
  | 'throughBallRight'
  | 'switchPlay'
  | 'squarePass'
  | 'passBack'
  | 'layOff'
  | 'oneTwo'
  // crosses
  | 'crossFarPost'
  | 'crossPenaltySpot'
  | 'lowCross'
  | 'cutBack'
  | 'earlyCross'
  // headers
  | 'headerDown'
  | 'headerCorner'
  | 'headerFlickOn'
  | 'attackNearPost'
  | 'peelToFarPost'
  // penalties
  | 'penaltyPlaced'
  | 'penaltyNearPost'
  | 'penaltyPower'
  | 'penaltyTopCorner'
  | 'penaltyOpenBody'
  | 'penaltyPanenka'
  // direct free kicks
  | 'freeKickCurl'
  | 'freeKickDrive'
  | 'freeKickWhipped'
  | 'freeKickFarPost'
  | 'freeKickRolled'
  | 'freeKickShort'
  // defending
  | 'stepInAndTackle'
  | 'jockey'
  | 'interceptLine'
  | 'clearFirstTime'
  | 'shepherdWide'
  | 'headerClear'
  | 'blockRunner'
  | 'dropOffAndCover'
  | 'leaveItForTheKeeper'
  | 'pressTheCarrier'
  | 'screenThePass'
  | 'springTheTrap'
  | 'holdShape';

/** Immutable definition of an action, from the catalogue. */
export interface ActionDefinition {
  kind: ActionKind;
  /** Default label. Templates may override for context (e.g. near/far post). */
  label: string;
  family: ActionFamily;
  /**
   * Baseline value on the resolution scale before any player, context or
   * opposition adjustment. Roughly "how good is this action, executed
   * averagely, in the situation where it belongs".
   */
  baseValue: number;
  /** What executing this action depends on. Weights should sum to 1. */
  execution: AttributeWeights;
  /** 0-1: how much goalkeeper quality suppresses this action. */
  gkRelevance: number;
  /** Which keeper attributes oppose this action. Weights should sum to 1. */
  gkAttributes: Partial<Record<keyof GoalkeeperAttributes, number>>;
  /** 0-1: how much nearby defenders suppress this action. */
  defenderRelevance: number;
  /** 0-1: how badly a failure hurts (turnover vs harmless miss). */
  risk: number;
  /**
   * Contextual appropriateness, 0-1, evaluated against the live situation.
   * This is the "did you read the game correctly" term, and it is kept
   * completely separate from execution so that a good choice can still be
   * botched and a bad choice can still be rescued by talent.
   */
  fit: (context: SituationContext) => number;
  /** Short explanation shown in debug mode for why fit is what it is. */
  fitNote?: (context: SituationContext) => string;
}

/** A generated, numbered option presented to the human player. */
export interface ActionOption {
  /** 1-6, matching the keyboard key. */
  slot: number;
  kind: ActionKind;
  label: string;
  family: ActionFamily;
  /** Fit at generation time — used for ranking and debug, never shown as odds. */
  generationFit: number;
}

/**
 * Everything an action's `fit` function and the resolver are allowed to see.
 * Keeping this as one explicit object means new context can be added without
 * changing every action signature.
 */
export interface SituationContext {
  situation: SituationType;
  zone: Zone;
  player: Player;
  goalkeeper: GoalkeeperState;
  attackingTeam: Team;
  defendingTeam: Team;
  /** Named teammates who could receive a pass. Empty when nobody is named. */
  teammates: readonly Teammate[];
  /** Number of defenders able to affect the action, 0-4. */
  nearbyDefenders: number;
  /** 0-1 aggregate defensive pressure (proximity + team intensity). */
  defensivePressure: number;
  /** 0-1 how promising the chance is before the player does anything. */
  situationQuality: number;
  /** True if the ball is arriving at pace and a first-time action is natural. */
  firstTime: boolean;
  /** True if this is a fast transition (counterattack). */
  transition: boolean;
  minute: number;
}

export type OutcomeKind =
  | 'goal'
  | 'saved'
  | 'missed'
  | 'blocked'
  | 'deflected'
  | 'post'
  | 'chanceCreated'
  | 'passCompleted'
  | 'passIntercepted'
  | 'dribbleSuccess'
  | 'dribbleFailed'
  | 'crossCompleted'
  | 'crossCleared'
  | 'ballWon'
  | 'foulCommitted'
  | 'turnover'
  | 'held';

export const OUTCOME_LABELS: Record<OutcomeKind, string> = {
  goal: 'GOAL',
  saved: 'Saved',
  missed: 'Missed',
  blocked: 'Blocked',
  deflected: 'Deflected',
  post: 'Off the woodwork',
  chanceCreated: 'Chance created',
  passCompleted: 'Pass completed',
  passIntercepted: 'Intercepted',
  dribbleSuccess: 'Beat his man',
  dribbleFailed: 'Dispossessed',
  crossCompleted: 'Cross found its man',
  crossCleared: 'Cross cleared',
  ballWon: 'Ball won',
  foulCommitted: 'Foul',
  turnover: 'Possession lost',
  held: 'Possession retained',
};

/** Statistical consequences of an outcome, applied to the player's match record. */
export interface OutcomeStats {
  shots?: number;
  shotsOnTarget?: number;
  goals?: number;
  assists?: number;
  keyPasses?: number;
  dribbles?: number;
  dribblesAttempted?: number;
  passes?: number;
  passesCompleted?: number;
  tackles?: number;
  interceptions?: number;
  bigChancesMissed?: number;
  fouls?: number;
}

export interface EventOutcome {
  kind: OutcomeKind;
  /** Human-readable commentary line. */
  commentary: string;
  /** Did the attacking team keep the ball? */
  retainedPossession: boolean;
  /** Did this outcome score a goal for the player's team? */
  goalScored: boolean;
  /** Contribution to the match rating, positive or negative. */
  ratingDelta: number;
  stats: OutcomeStats;
  /**
   * The teammate who scored from the player's pass.
   *
   * Set only on a goal the player assisted, so the full-time report can say who
   * finished it. Absent when nobody was named — a quick match, or a save from
   * before teammates existed — and the commentary says "a teammate" instead.
   */
  assistedBy?: string;
}
