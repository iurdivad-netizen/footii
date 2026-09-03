import type { AttributeKey } from './attributes.ts';
import type { Channel, Third } from '../events/zones.ts';

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'ST';

export const OUTFIELD_POSITIONS: readonly Position[] = [
  'CB',
  'LB',
  'RB',
  'DM',
  'CM',
  'AM',
  'LW',
  'RW',
  'ST',
];

/**
 * Positional profile.
 *
 * Position is not a label: it drives WHERE the player tends to be, HOW OFTEN
 * they are involved in a chance, and WHICH situations they encounter. Two
 * players with identical attributes but different positions must play
 * differently, and this table is where that difference originates.
 */
export interface PositionProfile {
  position: Position;
  label: string;
  /** Base probability the player is involved in any given attacking sequence. */
  attackingInvolvement: number;
  /** Base probability of being drawn into a defensive interactive event. */
  defensiveInvolvement: number;
  /** Where this position naturally receives the ball. Weights, not probabilities. */
  zoneWeights: { third: Partial<Record<Third, number>>; channel: Partial<Record<Channel, number>> };
  /** Attributes that matter most for this role, used for generated players and UI. */
  keyAttributes: readonly AttributeKey[];
}

/**
 * The three attributes that set the decision window, whoever you are.
 *
 * They are key for EVERY position — the timer reads them directly (see
 * simulation/DecisionTimer.ts) — but only the goalkeeper profile happens to
 * list any of them, so a screen that showed a position's `keyAttributes` alone
 * would drop the three that the whole game is played through.
 */
export const WINDOW_ATTRIBUTES: readonly AttributeKey[] = [
  'awareness',
  'decisionMaking',
  'composure',
];

/**
 * What matters most for a footballer in this position.
 *
 * One answer, in one place, because four screens ask the question — the
 * creator, the training grid, the hub's "Key attributes" card and the season
 * review — and two of them used to answer it with a hardcoded list that was
 * the same for a centre back as for a striker.
 */
export function keyAttributesFor(position: Position): Set<AttributeKey> {
  return new Set(POSITION_PROFILES[position].keyAttributes);
}

/**
 * What a summary of this position should show: what the role needs, plus the
 * three the decision window is made of. Ordered role-first, since that is what
 * differs between two players looking at the same card.
 */
export function summaryAttributesFor(position: Position): AttributeKey[] {
  const keys = POSITION_PROFILES[position].keyAttributes;
  return [...keys, ...WINDOW_ATTRIBUTES.filter((key) => !keys.includes(key))];
}

export const POSITION_PROFILES: Record<Position, PositionProfile> = {
  GK: {
    position: 'GK',
    label: 'Goalkeeper',
    attackingInvolvement: 0.01,
    defensiveInvolvement: 0.3,
    zoneWeights: { third: { defensive: 1 }, channel: { central: 1 } },
    keyAttributes: ['positioning', 'anticipation', 'composure', 'awareness'],
  },
  CB: {
    position: 'CB',
    label: 'Centre Back',
    attackingInvolvement: 0.06,
    defensiveInvolvement: 0.42,
    zoneWeights: {
      third: { defensive: 6, middle: 3, attacking: 1 },
      channel: { central: 7, leftHalf: 2, rightHalf: 2 },
    },
    keyAttributes: ['defensiveAwareness', 'tackling', 'heading', 'strength', 'positioning'],
  },
  LB: {
    position: 'LB',
    label: 'Left Back',
    attackingInvolvement: 0.13,
    defensiveInvolvement: 0.32,
    zoneWeights: {
      third: { defensive: 4, middle: 4, attacking: 2 },
      channel: { left: 7, leftHalf: 3 },
    },
    keyAttributes: ['pace', 'crossing', 'stamina', 'tackling', 'defensiveAwareness'],
  },
  RB: {
    position: 'RB',
    label: 'Right Back',
    attackingInvolvement: 0.13,
    defensiveInvolvement: 0.32,
    zoneWeights: {
      third: { defensive: 4, middle: 4, attacking: 2 },
      channel: { right: 7, rightHalf: 3 },
    },
    keyAttributes: ['pace', 'crossing', 'stamina', 'tackling', 'defensiveAwareness'],
  },
  DM: {
    position: 'DM',
    label: 'Defensive Midfielder',
    attackingInvolvement: 0.11,
    defensiveInvolvement: 0.38,
    zoneWeights: {
      third: { defensive: 4, middle: 6, attacking: 1 },
      channel: { central: 6, leftHalf: 2, rightHalf: 2 },
    },
    keyAttributes: ['passing', 'defensiveAwareness', 'tackling', 'awareness', 'decisionMaking'],
  },
  CM: {
    position: 'CM',
    label: 'Central Midfielder',
    attackingInvolvement: 0.18,
    defensiveInvolvement: 0.26,
    zoneWeights: {
      third: { defensive: 2, middle: 6, attacking: 3 },
      channel: { central: 5, leftHalf: 3, rightHalf: 3 },
    },
    keyAttributes: ['passing', 'awareness', 'decisionMaking', 'stamina', 'ballControl'],
  },
  AM: {
    position: 'AM',
    label: 'Attacking Midfielder',
    attackingInvolvement: 0.25,
    defensiveInvolvement: 0.12,
    zoneWeights: {
      third: { middle: 4, attacking: 6 },
      channel: { central: 6, leftHalf: 3, rightHalf: 3 },
    },
    keyAttributes: ['passing', 'technique', 'decisionMaking', 'dribbling', 'awareness'],
  },
  LW: {
    position: 'LW',
    label: 'Left Winger',
    attackingInvolvement: 0.24,
    defensiveInvolvement: 0.1,
    zoneWeights: {
      third: { middle: 3, attacking: 7 },
      channel: { left: 6, leftHalf: 4 },
    },
    keyAttributes: ['dribbling', 'pace', 'crossing', 'acceleration', 'technique'],
  },
  RW: {
    position: 'RW',
    label: 'Right Winger',
    attackingInvolvement: 0.24,
    defensiveInvolvement: 0.1,
    zoneWeights: {
      third: { middle: 3, attacking: 7 },
      channel: { right: 6, rightHalf: 4 },
    },
    keyAttributes: ['dribbling', 'pace', 'crossing', 'acceleration', 'technique'],
  },
  ST: {
    position: 'ST',
    label: 'Striker',
    attackingInvolvement: 0.3,
    defensiveInvolvement: 0.07,
    zoneWeights: {
      third: { middle: 2, attacking: 8 },
      channel: { central: 7, leftHalf: 2, rightHalf: 2 },
    },
    keyAttributes: ['finishing', 'movement', 'composure', 'positioning', 'acceleration'],
  },
};

export function positionLabel(position: Position): string {
  return POSITION_PROFILES[position].label;
}
