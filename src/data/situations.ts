import type { ActionKind, SituationContext, SituationType } from '../core/events/types.ts';
import type { Position } from '../core/player/positions.ts';
import type { Zone } from '../core/events/zones.ts';
import { zoneSide } from '../core/events/zones.ts';
import type { Rng } from '../core/rng.ts';

/**
 * SITUATION TEMPLATES
 *
 * A template describes one archetype of interactive moment: where it happens,
 * which positions can experience it, how much time it inherently allows, and
 * which actions are candidates for the six slots.
 *
 * ADDING A NEW EVENT TYPE: add a `SituationType`, add a template here, and
 * (if needed) add actions to the catalogue. The generator, timer, resolver and
 * UI all read from these definitions, so no engine code changes.
 *
 * Every template must supply at least 6 candidates that are always available,
 * otherwise the 1-6 interface cannot be filled.
 */

export interface CandidateAction {
  kind: ActionKind;
  /** Context-sensitive label override, e.g. near/far post depending on side. */
  label?: (context: SituationContext) => string;
  /** Ranking bias for this action within this situation. Default 1. */
  weight?: number;
  /** If present and false, the action is not offered in this context. */
  available?: (context: SituationContext) => boolean;
  /** Always include this action, regardless of ranking (e.g. the safe out). */
  guaranteed?: boolean;
}

export interface SituationTemplate {
  type: SituationType;
  /** Commentary shown when the event opens. */
  describe: (context: SituationContext) => string;
  /**
   * Base decision time in seconds, before attributes and pressure.
   * This is the "how much time does this kind of moment inherently give you"
   * term of the decision timer formula.
   */
  baseTime: number;
  /** Inherent difficulty 0-1, subtracted from the decision window. */
  difficulty: number;
  /** Range of pre-action chance quality this situation produces. */
  qualityRange: [number, number];
  /** Relative likelihood per position. Missing position = cannot occur. */
  positionWeights: Partial<Record<Position, number>>;
  /** Is the goalkeeper an active participant? */
  goalkeeperInvolved: boolean;
  /** Is the ball arriving to be struck first time? */
  firstTime: boolean;
  /** Typical defenders in the vicinity. */
  defenders: [number, number];
  /** Build the pitch zone for this situation. */
  zone: (rng: Rng, position: Position) => Zone;
  candidates: CandidateAction[];
}

function sideOf(context: SituationContext): 'left' | 'right' | 'centre' {
  return zoneSide(context.zone);
}

/** From the right, the near post is the right post; from the left, the left. */
function nearPostLabel(context: SituationContext): string {
  const side = sideOf(context);
  if (side === 'centre') return 'Near-post shot';
  return `Near-post shot (${side})`;
}

function farPostLabel(context: SituationContext): string {
  const side = sideOf(context);
  if (side === 'centre') return 'Far-post shot';
  return `Far-post shot (${side === 'left' ? 'right' : 'left'})`;
}

function pickChannel(rng: Rng, position: Position): Zone['channel'] {
  if (position === 'LW' || position === 'LB') return rng.chance(0.7) ? 'left' : 'leftHalf';
  if (position === 'RW' || position === 'RB') return rng.chance(0.7) ? 'right' : 'rightHalf';
  return rng.weighted([
    { value: 'central' as const, weight: 5 },
    { value: 'leftHalf' as const, weight: 2.5 },
    { value: 'rightHalf' as const, weight: 2.5 },
  ]);
}

export const SITUATION_TEMPLATES: Record<SituationType, SituationTemplate> = {
  oneOnOne: {
    type: 'oneOnOne',
    describe: (c) => `${c.player.name} is clean through on ${c.goalkeeper.keeper.name}!`,
    baseTime: 2.0,
    difficulty: 0.45,
    qualityRange: [0.62, 0.9],
    positionWeights: { ST: 6, LW: 3, RW: 3, AM: 2.5, CM: 1 },
    goalkeeperInvolved: true,
    firstTime: false,
    defenders: [0, 1],
    zone: (rng, position) => ({
      third: 'attacking',
      channel: position === 'LW' ? 'leftHalf' : position === 'RW' ? 'rightHalf' : 'central',
      box: rng.chance(0.7) ? 'inside' : 'edge',
    }),
    candidates: [
      { kind: 'shootLeft', weight: 1 },
      { kind: 'shootCentre', weight: 0.9 },
      { kind: 'shootRight', weight: 1 },
      { kind: 'chip', weight: 1.1, guaranteed: true },
      { kind: 'roundKeeper', weight: 1.1, guaranteed: true },
      { kind: 'shootEarly', weight: 1 },
      { kind: 'shootLow', weight: 0.9 },
      { kind: 'placedFinish', weight: 0.9 },
      { kind: 'squarePass', weight: 0.7 },
    ],
  },

  throughBallRun: {
    type: 'throughBallRun',
    describe: (c) =>
      `${c.player.name} runs onto the through ball with the defence turned${
        c.nearbyDefenders > 1 ? ', but there is cover' : ''
      }.`,
    baseTime: 1.85,
    difficulty: 0.5,
    qualityRange: [0.5, 0.82],
    positionWeights: { ST: 5, LW: 3, RW: 3, AM: 2, CM: 1, LB: 0.5, RB: 0.5 },
    goalkeeperInvolved: true,
    firstTime: true,
    defenders: [0, 2],
    zone: (rng, position) => ({
      third: 'attacking',
      channel: pickChannel(rng, position),
      box: rng.chance(0.45) ? 'inside' : 'edge',
    }),
    candidates: [
      { kind: 'firstTimeShot', weight: 1.2 },
      { kind: 'knockPastDefender', weight: 1.1 },
      { kind: 'shootAcrossGoal', weight: 1 },
      { kind: 'chip', weight: 0.9 },
      { kind: 'shootEarly', weight: 1 },
      { kind: 'roundKeeper', weight: 0.9 },
      { kind: 'squarePass', weight: 0.8, guaranteed: true },
      { kind: 'cutBack', weight: 0.7, available: (c) => sideOf(c) !== 'centre' },
    ],
  },

  edgeOfBox: {
    type: 'edgeOfBox',
    describe: (c) => `The ball drops to ${c.player.name} on the edge of the area.`,
    baseTime: 1.7,
    difficulty: 0.55,
    qualityRange: [0.3, 0.6],
    positionWeights: { ST: 3, AM: 4, CM: 3, LW: 2, RW: 2, DM: 1.5, LB: 0.6, RB: 0.6, CB: 0.4 },
    goalkeeperInvolved: true,
    firstTime: false,
    defenders: [1, 3],
    zone: (rng, position) => ({
      third: 'attacking',
      channel: pickChannel(rng, position),
      box: 'edge',
    }),
    candidates: [
      { kind: 'powerDrive', weight: 1.2 },
      { kind: 'curlFarCorner', weight: 1.2 },
      { kind: 'firstTimeShot', weight: 1 },
      { kind: 'oneTwo', weight: 1 },
      { kind: 'takeOnDefender', weight: 0.9 },
      { kind: 'squarePass', weight: 0.9 },
      { kind: 'passBack', weight: 0.7, guaranteed: true },
      { kind: 'throughBallCentre', weight: 0.8 },
    ],
  },

  boxSideAttack: {
    type: 'boxSideAttack',
    describe: (c) =>
      `${c.player.name} gets into the ${sideOf(c)} side of the penalty area.`,
    baseTime: 1.75,
    difficulty: 0.5,
    qualityRange: [0.42, 0.72],
    positionWeights: { ST: 3, LW: 4, RW: 4, AM: 2.5, LB: 1.5, RB: 1.5, CM: 1 },
    goalkeeperInvolved: true,
    firstTime: false,
    defenders: [1, 3],
    zone: (rng, position) => ({
      third: 'attacking',
      channel:
        position === 'LW' || position === 'LB'
          ? 'leftHalf'
          : position === 'RW' || position === 'RB'
            ? 'rightHalf'
            : rng.chance(0.5)
              ? 'leftHalf'
              : 'rightHalf',
      box: 'inside',
    }),
    candidates: [
      { kind: 'shootFarPost', label: farPostLabel, weight: 1.1 },
      { kind: 'shootNearPost', label: nearPostLabel, weight: 1 },
      { kind: 'lowCross', weight: 1 },
      { kind: 'cutBack', weight: 1.2, guaranteed: true },
      { kind: 'shootAcrossGoal', weight: 1.1 },
      { kind: 'crossPenaltySpot', weight: 0.9 },
      { kind: 'cutInside', weight: 0.9 },
      { kind: 'squarePass', weight: 0.7 },
    ],
  },

  wideAttack: {
    type: 'wideAttack',
    describe: (c) => `${c.player.name} is away down the ${sideOf(c)} wing.`,
    baseTime: 2.1,
    difficulty: 0.35,
    qualityRange: [0.25, 0.55],
    positionWeights: { LW: 5, RW: 5, LB: 3, RB: 3, ST: 1, AM: 1.5, CM: 0.8 },
    goalkeeperInvolved: false,
    firstTime: false,
    defenders: [1, 3],
    zone: (rng, position) => ({
      third: 'attacking',
      channel:
        position === 'LW' || position === 'LB'
          ? 'left'
          : position === 'RW' || position === 'RB'
            ? 'right'
            : rng.chance(0.5)
              ? 'left'
              : 'right',
      box: 'outside',
    }),
    candidates: [
      { kind: 'crossFarPost', weight: 1.1 },
      { kind: 'crossPenaltySpot', weight: 1 },
      { kind: 'lowCross', weight: 1 },
      { kind: 'cutInside', weight: 1.1, guaranteed: true },
      { kind: 'earlyCross', weight: 0.9 },
      { kind: 'takeOnDefender', weight: 1 },
      { kind: 'passBack', weight: 0.7, guaranteed: true },
      { kind: 'cutBack', weight: 0.9 },
    ],
  },

  crossArrival: {
    type: 'crossArrival',
    describe: (c) => `The cross comes in and ${c.player.name} attacks it.`,
    baseTime: 1.35,
    difficulty: 0.65,
    qualityRange: [0.45, 0.78],
    positionWeights: { ST: 5, AM: 2, LW: 1.5, RW: 1.5, CM: 1, CB: 0.6 },
    goalkeeperInvolved: true,
    firstTime: true,
    defenders: [1, 3],
    zone: () => ({ third: 'attacking', channel: 'central', box: 'inside' }),
    candidates: [
      { kind: 'headerDown', weight: 1.2, guaranteed: true },
      { kind: 'headerCorner', weight: 1.1 },
      { kind: 'firstTimeShot', weight: 1.1 },
      { kind: 'headerFlickOn', weight: 0.8 },
      { kind: 'placedFinish', weight: 1 },
      { kind: 'shootLow', weight: 0.9 },
      { kind: 'squarePass', weight: 0.6 },
    ],
  },

  midfieldProgression: {
    type: 'midfieldProgression',
    describe: (c) => `${c.player.name} picks the ball up in midfield and looks up.`,
    baseTime: 2.4,
    difficulty: 0.25,
    qualityRange: [0.12, 0.4],
    positionWeights: { CM: 5, DM: 4, AM: 3, CB: 1.5, LB: 1.5, RB: 1.5, LW: 1, RW: 1, ST: 0.6 },
    goalkeeperInvolved: false,
    firstTime: false,
    defenders: [1, 3],
    zone: (rng, position) => ({
      third: 'middle',
      channel: pickChannel(rng, position),
      box: 'outside',
    }),
    candidates: [
      { kind: 'throughBallLeft', weight: 1 },
      { kind: 'throughBallCentre', weight: 1 },
      { kind: 'throughBallRight', weight: 1 },
      { kind: 'switchPlay', weight: 1 },
      { kind: 'carryForward', weight: 1.1, guaranteed: true },
      { kind: 'powerDrive', weight: 0.6 },
      { kind: 'oneTwo', weight: 0.9 },
      { kind: 'passBack', weight: 0.6 },
    ],
  },

  defensiveDuel: {
    type: 'defensiveDuel',
    describe: (c) => `Danger — ${c.player.name} is the last line of resistance.`,
    baseTime: 1.6,
    difficulty: 0.55,
    qualityRange: [0.3, 0.7],
    positionWeights: { CB: 5, LB: 4, RB: 4, DM: 4, CM: 2.5, AM: 1, LW: 0.8, RW: 0.8, ST: 0.4 },
    goalkeeperInvolved: false,
    firstTime: false,
    defenders: [0, 1],
    zone: (rng, position) => ({
      third: 'defensive',
      channel: pickChannel(rng, position),
      box: rng.chance(0.35) ? 'edge' : 'outside',
    }),
    candidates: [
      { kind: 'stepInAndTackle', weight: 1.1 },
      { kind: 'jockey', weight: 1.1, guaranteed: true },
      { kind: 'interceptLine', weight: 1 },
      { kind: 'clearFirstTime', weight: 1 },
      { kind: 'shepherdWide', weight: 1 },
      { kind: 'shieldBall', weight: 0.7 },
    ],
  },
};

export const SITUATION_TYPES = Object.keys(SITUATION_TEMPLATES) as SituationType[];

export function getSituationTemplate(type: SituationType): SituationTemplate {
  return SITUATION_TEMPLATES[type];
}
