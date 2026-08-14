import { unit } from '../util/math.ts';

/**
 * Goalkeeper attributes. Same 1-99 scale as outfield attributes.
 *
 *   Reflexes       -> saving shots that are already on target
 *   Positioning    -> how much of the goal is realistically available
 *   Anticipation   -> reading the striker; punishes predictable choices
 *   oneOnOne       -> handling an attacker running through
 *   Aggression     -> willingness to leave the line (shrinks the decision window)
 *   Decision Making-> whether the keeper commits at the right moment
 *   Handling       -> whether a save is held or spilled into a rebound
 *   Distribution   -> what happens to possession after the save (career-mode hook)
 */
export interface GoalkeeperAttributes {
  reflexes: number;
  positioning: number;
  anticipation: number;
  oneOnOne: number;
  aggression: number;
  decisionMaking: number;
  handling: number;
  distribution: number;
}

export interface Goalkeeper {
  id: string;
  name: string;
  attributes: GoalkeeperAttributes;
}

export interface GoalkeeperInit {
  id?: string;
  name: string;
  attributes: Partial<GoalkeeperAttributes>;
  base?: number;
}

export function createGoalkeeper(init: GoalkeeperInit): Goalkeeper {
  const base = init.base ?? 50;
  return {
    id: init.id ?? init.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: init.name,
    attributes: {
      reflexes: base,
      positioning: base,
      anticipation: base,
      oneOnOne: base,
      aggression: base,
      decisionMaking: base,
      handling: base,
      distribution: base,
      ...init.attributes,
    },
  };
}

/**
 * What the keeper is doing at the moment the player commits to an action.
 *
 * This is the heart of the goalkeeper-as-variable design. The keeper starts
 * `set` and COMMITS partway through the decision window. Waiting for the commit
 * gives the attacker information (some options become far stronger, others
 * far weaker) but burns the clock. That trade-off is where human skill lives.
 */
export type GoalkeeperAction =
  | 'set' // still balanced on the line, nothing given away
  | 'advancing' // closing the angle, but still upright
  | 'rushing' // committed off the line at pace
  | 'divingNear' // committed to the near post
  | 'divingFar' // committed to the far post
  | 'goingToGround' // spread low, gone early
  | 'holdingLine'; // stayed deep, giving up the angle

export const GOALKEEPER_ACTION_LABELS: Record<GoalkeeperAction, string> = {
  set: 'Set and balanced',
  advancing: 'Advancing off his line',
  rushing: 'Rushing out',
  divingNear: 'Committed near post',
  divingFar: 'Committed far post',
  goingToGround: 'Gone to ground early',
  holdingLine: 'Staying on his line',
};

/** Live goalkeeper state for a single interactive event. */
export interface GoalkeeperState {
  keeper: Goalkeeper;
  /** Current action at the time of reading. */
  action: GoalkeeperAction;
  /** The action the keeper will switch to when the window elapses past `commitAt`. */
  committedAction: GoalkeeperAction;
  /** Seconds into the decision window at which the keeper commits. */
  commitAt: number;
  /** How far off the line the keeper starts, 0 (on line) to 1 (well advanced). */
  startingDepth: number;
}

/** Overall shot-stopping quality, 0-1. */
export function goalkeeperQuality(keeper: Goalkeeper): number {
  const a = keeper.attributes;
  return unit(
    a.reflexes * 0.3 +
      a.positioning * 0.25 +
      a.anticipation * 0.2 +
      a.oneOnOne * 0.15 +
      a.decisionMaking * 0.1,
  );
}

/**
 * How much pressure the keeper exerts on the attacker's decision window.
 * Aggressive keepers who are already advancing take time away.
 */
export function goalkeeperPressure(state: GoalkeeperState): number {
  const a = state.keeper.attributes;
  const aggression = unit(a.aggression);
  const closing = state.action === 'rushing' ? 1 : state.action === 'advancing' ? 0.6 : 0.25;
  return (0.45 * aggression + 0.35 * state.startingDepth + 0.2 * closing) * closing;
}
