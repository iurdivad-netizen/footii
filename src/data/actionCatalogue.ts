import { clamp01, unit } from '../core/util/math.ts';
import type { ActionDefinition, ActionKind, SituationContext } from '../core/events/types.ts';
import { goalAngleFactor, goalDistanceFactor, zoneSide } from '../core/events/zones.ts';

/**
 * ACTION CATALOGUE
 *
 * Each action answers three separate questions:
 *   1. `fit`        - was this the right idea here? (reading the game)
 *   2. `execution`  - can this player physically pull it off? (attributes)
 *   3. `gkRelevance` / `defenderRelevance` - how much the opposition suppresses it
 *
 * Keeping them separate is what lets a brilliant choice fail and a poor choice
 * be rescued, which is design principle 13.
 *
 * BALANCING NOTE: `baseValue` is on the resolution scale where ~0.5 is a
 * coin-flip quality attempt for that action family. Tune `baseValue` to change
 * how often an action family succeeds overall; tune `fit` to change WHEN it is
 * the right call.
 */

/** Off-the-line-ness of the keeper right now, 0 (on line) to 1 (way out). */
export function keeperExposure(context: SituationContext): number {
  const { goalkeeper } = context;
  const byAction =
    goalkeeper.action === 'rushing'
      ? 1
      : goalkeeper.action === 'advancing'
        ? 0.65
        : goalkeeper.action === 'goingToGround'
          ? 0.8
          : goalkeeper.action === 'holdingLine'
            ? 0.05
            : 0.3;
  return clamp01(byAction * 0.75 + goalkeeper.startingDepth * 0.25);
}

/** Has the keeper already thrown himself one way? */
export function keeperCommitted(context: SituationContext): 'near' | 'far' | 'ground' | 'none' {
  switch (context.goalkeeper.action) {
    case 'divingNear':
      return 'near';
    case 'divingFar':
      return 'far';
    case 'goingToGround':
      return 'ground';
    default:
      return 'none';
  }
}

/**
 * Penalty applied to obvious, readable actions against a keeper who reads the
 * game well. This is how "Anticipation makes predictable finishing less
 * effective" is implemented.
 */
function predictabilityPenalty(context: SituationContext, predictability: number): number {
  return predictability * unit(context.goalkeeper.keeper.attributes.anticipation) * 0.35;
}

/** Convenience builder so each entry only states what makes it distinctive. */
function action(
  kind: ActionKind,
  definition: Omit<ActionDefinition, 'kind'>,
): [ActionKind, ActionDefinition] {
  return [kind, { kind, ...definition }];
}

export const ACTION_CATALOGUE: Record<ActionKind, ActionDefinition> = Object.fromEntries([
  // ---------------------------------------------------------------- shots ---
  action('shootLeft', {
    label: 'Shoot left',
    family: 'shot',
    baseValue: 0.5,
    execution: { finishing: 0.45, technique: 0.25, composure: 0.3 },
    gkRelevance: 0.85,
    gkAttributes: { reflexes: 0.55, positioning: 0.25, anticipation: 0.2 },
    defenderRelevance: 0.3,
    risk: 0.2,
    fit: (c) => {
      const committed = keeperCommitted(c);
      let value = 0.55;
      if (committed === 'far') value += 0.3; // keeper went the other way
      if (committed === 'near') value -= 0.25;
      if (committed === 'ground') value += 0.12;
      value -= keeperExposure(c) * 0.1; // less room when he closes the angle
      return clamp01(value - predictabilityPenalty(c, 0.3));
    },
    fitNote: (c) =>
      keeperCommitted(c) === 'far' ? 'Keeper committed the other way' : 'Keeper still covering',
  }),

  action('shootCentre', {
    label: 'Shoot centre',
    family: 'shot',
    baseValue: 0.46,
    execution: { finishing: 0.5, composure: 0.3, shooting: 0.2 },
    gkRelevance: 0.95,
    gkAttributes: { reflexes: 0.4, positioning: 0.35, anticipation: 0.25 },
    defenderRelevance: 0.3,
    risk: 0.2,
    fit: (c) => {
      const committed = keeperCommitted(c);
      let value = 0.4;
      if (committed === 'ground') value += 0.4; // he's gone to ground, go over/through
      if (committed === 'near' || committed === 'far') value += 0.22;
      if (c.goalkeeper.action === 'set') value -= 0.2;
      return clamp01(value - predictabilityPenalty(c, 0.6));
    },
    fitNote: (c) =>
      keeperCommitted(c) !== 'none' ? 'Keeper has committed' : 'Keeper is set and centred',
  }),

  action('shootRight', {
    label: 'Shoot right',
    family: 'shot',
    baseValue: 0.5,
    execution: { finishing: 0.45, technique: 0.25, composure: 0.3 },
    gkRelevance: 0.85,
    gkAttributes: { reflexes: 0.55, positioning: 0.25, anticipation: 0.2 },
    defenderRelevance: 0.3,
    risk: 0.2,
    fit: (c) => {
      const committed = keeperCommitted(c);
      let value = 0.55;
      if (committed === 'near') value += 0.3;
      if (committed === 'far') value -= 0.25;
      if (committed === 'ground') value += 0.12;
      value -= keeperExposure(c) * 0.1;
      return clamp01(value - predictabilityPenalty(c, 0.3));
    },
    fitNote: (c) =>
      keeperCommitted(c) === 'near' ? 'Keeper committed the other way' : 'Keeper still covering',
  }),

  action('shootEarly', {
    label: 'Shoot early',
    family: 'shot',
    baseValue: 0.44,
    execution: { shooting: 0.4, finishing: 0.3, technique: 0.3 },
    gkRelevance: 0.7,
    gkAttributes: { reflexes: 0.5, positioning: 0.3, decisionMaking: 0.2 },
    defenderRelevance: 0.15, // the whole point is beating the block
    risk: 0.25,
    fit: (c) => {
      // Strong before the keeper is set, and when defenders are closing fast.
      let value = 0.45;
      if (c.goalkeeper.action === 'set') value += 0.1;
      if (c.goalkeeper.action === 'advancing') value += 0.25;
      if (c.goalkeeper.action === 'rushing') value += 0.1;
      if (keeperCommitted(c) !== 'none') value -= 0.15; // too late, he's already reacting
      value += c.defensivePressure * 0.2;
      value -= goalDistanceFactor(c.zone) * 0.2;
      return clamp01(value);
    },
    fitNote: () => 'Beats the block, but the keeper may not have moved yet',
  }),

  action('shootAcrossGoal', {
    label: 'Shoot across goal',
    family: 'shot',
    baseValue: 0.48,
    execution: { finishing: 0.4, technique: 0.35, composure: 0.25 },
    gkRelevance: 0.8,
    gkAttributes: { reflexes: 0.45, positioning: 0.35, anticipation: 0.2 },
    defenderRelevance: 0.25,
    risk: 0.2,
    fit: (c) => {
      // The percentage finish from an angle: away from the keeper, inviting a rebound.
      let value = 0.5 + goalAngleFactor(c.zone) * 0.2;
      value += keeperExposure(c) * 0.15;
      if (keeperCommitted(c) === 'near') value += 0.2;
      return clamp01(value - predictabilityPenalty(c, 0.25));
    },
  }),

  action('shootNearPost', {
    label: 'Near-post shot',
    family: 'shot',
    baseValue: 0.44,
    execution: { finishing: 0.35, shooting: 0.35, technique: 0.3 },
    gkRelevance: 0.95,
    gkAttributes: { positioning: 0.45, reflexes: 0.35, anticipation: 0.2 },
    defenderRelevance: 0.25,
    risk: 0.25,
    fit: (c) => {
      // Only viable if the keeper has drifted off his near post.
      let value = 0.35;
      const gk = c.goalkeeper.keeper.attributes;
      value += (1 - unit(gk.positioning)) * 0.35; // poor positioning leaves the gap
      if (keeperCommitted(c) === 'far') value += 0.3;
      if (c.goalkeeper.action === 'advancing') value += 0.1;
      return clamp01(value - predictabilityPenalty(c, 0.45));
    },
    fitNote: (c) =>
      unit(c.goalkeeper.keeper.attributes.positioning) < 0.5
        ? 'Keeper positioning is suspect'
        : 'Keeper guards his near post well',
  }),

  action('shootFarPost', {
    label: 'Far-post shot',
    family: 'shot',
    baseValue: 0.5,
    execution: { finishing: 0.35, technique: 0.35, composure: 0.3 },
    gkRelevance: 0.85,
    gkAttributes: { reflexes: 0.5, positioning: 0.3, anticipation: 0.2 },
    defenderRelevance: 0.25,
    risk: 0.2,
    fit: (c) => {
      let value = 0.55;
      if (keeperCommitted(c) === 'near') value += 0.25;
      if (keeperCommitted(c) === 'far') value -= 0.3;
      value += keeperExposure(c) * 0.1;
      return clamp01(value - predictabilityPenalty(c, 0.3));
    },
  }),

  action('shootLow', {
    label: 'Low shot',
    family: 'shot',
    baseValue: 0.5,
    execution: { finishing: 0.4, technique: 0.3, composure: 0.3 },
    gkRelevance: 0.85,
    gkAttributes: { reflexes: 0.45, handling: 0.2, positioning: 0.35 },
    defenderRelevance: 0.35,
    risk: 0.2,
    fit: (c) => {
      let value = 0.55;
      // A tall keeper coming out is beaten low; a keeper already down is not.
      if (c.goalkeeper.action === 'rushing') value += 0.15;
      if (c.goalkeeper.action === 'goingToGround') value -= 0.3;
      return clamp01(value - predictabilityPenalty(c, 0.35));
    },
  }),

  action('chip', {
    label: 'Chip the keeper',
    family: 'shot',
    baseValue: 0.4,
    execution: { technique: 0.5, composure: 0.3, finishing: 0.2 },
    gkRelevance: 0.6,
    gkAttributes: { positioning: 0.5, anticipation: 0.3, reflexes: 0.2 },
    defenderRelevance: 0.2,
    risk: 0.35, // a bad chip is embarrassing and gives the ball away
    fit: (c) => {
      // The signature read: only right when the keeper has left his goal.
      const exposure = keeperExposure(c);
      let value = 0.1 + exposure * 0.85;
      if (c.goalkeeper.action === 'goingToGround') value += 0.15;
      if (c.goalkeeper.action === 'holdingLine') value -= 0.1;
      return clamp01(value);
    },
    fitNote: (c) =>
      keeperExposure(c) > 0.6 ? 'Keeper has left his goal' : 'Keeper is still deep in his goal',
  }),

  action('curlFarCorner', {
    label: 'Curl to the far corner',
    family: 'shot',
    baseValue: 0.48,
    execution: { technique: 0.4, shooting: 0.3, finishing: 0.3 },
    gkRelevance: 0.9,
    gkAttributes: { reflexes: 0.55, positioning: 0.25, anticipation: 0.2 },
    defenderRelevance: 0.2,
    risk: 0.2,
    fit: (c) => {
      // The half-space specialty.
      const side = zoneSide(c.zone);
      let value = side === 'centre' ? 0.4 : 0.65;
      if (c.zone.box === 'edge') value += 0.1;
      if (keeperCommitted(c) === 'near') value += 0.2;
      value -= c.defensivePressure * 0.15;
      return clamp01(value - predictabilityPenalty(c, 0.2));
    },
  }),

  action('powerDrive', {
    label: 'Drive it low and hard',
    family: 'shot',
    // Long shots are low percentage but must never be a DEAD option. Because
    // resolution noise is clamped, an action whose typical value sits too far
    // below the goal threshold can never score at all, which would make the
    // long-range choice a trap rather than a gamble. This base is set so a good
    // striker of the ball still scores from range a few percent of the time.
    baseValue: 0.52,
    execution: { shooting: 0.55, technique: 0.2, composure: 0.25 },
    gkRelevance: 0.8,
    gkAttributes: { reflexes: 0.6, handling: 0.25, positioning: 0.15 },
    defenderRelevance: 0.3,
    risk: 0.2,
    fit: (c) => {
      let value = 0.4 + goalDistanceFactor(c.zone) * 0.3; // the long-range option
      value += (1 - unit(c.goalkeeper.keeper.attributes.reflexes)) * 0.2;
      value -= c.defensivePressure * 0.2;
      return clamp01(value);
    },
  }),

  action('placedFinish', {
    label: 'Side-foot it',
    family: 'shot',
    baseValue: 0.52,
    execution: { finishing: 0.45, composure: 0.35, technique: 0.2 },
    gkRelevance: 0.85,
    gkAttributes: { reflexes: 0.4, positioning: 0.3, anticipation: 0.3 },
    defenderRelevance: 0.35,
    risk: 0.15,
    fit: (c) => {
      // The sensible, low-variance finish. Rarely wrong, rarely brilliant.
      let value = 0.6 - goalDistanceFactor(c.zone) * 0.25;
      value -= c.defensivePressure * 0.15;
      return clamp01(value - predictabilityPenalty(c, 0.5));
    },
  }),

  action('firstTimeShot', {
    label: 'Hit it first time',
    family: 'shot',
    baseValue: 0.44,
    execution: { technique: 0.4, finishing: 0.35, composure: 0.25 },
    gkRelevance: 0.75,
    gkAttributes: { reflexes: 0.6, positioning: 0.2, anticipation: 0.2 },
    defenderRelevance: 0.15,
    risk: 0.25,
    fit: (c) => {
      let value = c.firstTime ? 0.7 : 0.3;
      value += c.defensivePressure * 0.15; // no time for a touch anyway
      if (c.goalkeeper.action === 'set') value -= 0.05;
      return clamp01(value);
    },
    fitNote: (c) => (c.firstTime ? 'Ball is arriving to be struck' : 'A touch is available'),
  }),

  // ------------------------------------------------------------- dribbles ---
  action('roundKeeper', {
    label: 'Round the keeper',
    family: 'dribble',
    baseValue: 0.42,
    execution: { dribbling: 0.4, ballControl: 0.25, composure: 0.2, acceleration: 0.15 },
    gkRelevance: 0.8,
    gkAttributes: { oneOnOne: 0.5, decisionMaking: 0.2, anticipation: 0.2, positioning: 0.1 },
    defenderRelevance: 0.5, // a covering defender ruins this
    risk: 0.45,
    fit: (c) => {
      const exposure = keeperExposure(c);
      let value = 0.15 + exposure * 0.7;
      if (c.goalkeeper.action === 'goingToGround') value += 0.15;
      value -= c.nearbyDefenders * 0.12; // recovery runners
      return clamp01(value);
    },
    fitNote: (c) =>
      c.nearbyDefenders > 1 ? 'Defenders are recovering' : 'Space to take it round him',
  }),

  action('cutInside', {
    label: 'Cut inside',
    family: 'dribble',
    baseValue: 0.48,
    execution: { dribbling: 0.45, ballControl: 0.3, technique: 0.25 },
    gkRelevance: 0.05,
    gkAttributes: { positioning: 1 },
    defenderRelevance: 0.6,
    risk: 0.35,
    fit: (c) => {
      let value = zoneSide(c.zone) === 'centre' ? 0.25 : 0.6;
      value += (c.player.tendencies.cutsInside - 50) / 200;
      value -= c.nearbyDefenders * 0.08;
      return clamp01(value);
    },
  }),

  action('knockPastDefender', {
    label: 'Knock it past him',
    family: 'dribble',
    baseValue: 0.46,
    execution: { pace: 0.35, acceleration: 0.3, ballControl: 0.2, dribbling: 0.15 },
    gkRelevance: 0.1,
    gkAttributes: { aggression: 1 },
    defenderRelevance: 0.55,
    risk: 0.4,
    fit: (c) => {
      let value = 0.35 + (c.transition ? 0.25 : 0);
      value += (c.player.tendencies.attacksSpace - 50) / 200;
      value -= c.nearbyDefenders * 0.07;
      return clamp01(value);
    },
  }),

  action('carryForward', {
    label: 'Carry it forward',
    family: 'dribble',
    baseValue: 0.55,
    execution: { ballControl: 0.35, dribbling: 0.3, pace: 0.2, awareness: 0.15 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0.45,
    risk: 0.25,
    fit: (c) => {
      let value = 0.55 - c.defensivePressure * 0.35;
      if (c.transition) value += 0.2;
      if (c.zone.third === 'middle') value += 0.1;
      return clamp01(value);
    },
  }),

  action('takeOnDefender', {
    label: 'Take him on',
    family: 'dribble',
    baseValue: 0.44,
    execution: { dribbling: 0.5, ballControl: 0.25, acceleration: 0.25 },
    gkRelevance: 0.05,
    gkAttributes: { positioning: 1 },
    defenderRelevance: 0.65,
    risk: 0.4,
    fit: (c) => clamp01(0.5 - (c.nearbyDefenders - 1) * 0.12 + (c.transition ? 0.1 : 0)),
  }),

  action('shieldBall', {
    label: 'Shield and wait for support',
    family: 'hold',
    baseValue: 0.62,
    execution: { strength: 0.45, ballControl: 0.3, composure: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0.4,
    risk: 0.1,
    fit: (c) => clamp01(0.45 + c.defensivePressure * 0.25 - c.situationQuality * 0.3),
    fitNote: (c) =>
      c.situationQuality > 0.6 ? 'Wastes a promising position' : 'Safe under pressure',
  }),

  // --------------------------------------------------------------- passes ---
  action('throughBallLeft', {
    label: 'Through ball left',
    family: 'pass',
    baseValue: 0.5,
    execution: { passing: 0.45, awareness: 0.25, technique: 0.3 },
    gkRelevance: 0.15,
    gkAttributes: { anticipation: 0.6, positioning: 0.4 },
    defenderRelevance: 0.4,
    risk: 0.3,
    fit: (c) => throughBallFit(c, 'left'),
  }),

  action('throughBallCentre', {
    label: 'Through ball centre',
    family: 'pass',
    baseValue: 0.46,
    execution: { passing: 0.45, awareness: 0.3, technique: 0.25 },
    gkRelevance: 0.25,
    gkAttributes: { anticipation: 0.6, positioning: 0.4 },
    defenderRelevance: 0.5, // straight through the middle is the crowded route
    risk: 0.35,
    fit: (c) => throughBallFit(c, 'centre'),
  }),

  action('throughBallRight', {
    label: 'Through ball right',
    family: 'pass',
    baseValue: 0.5,
    execution: { passing: 0.45, awareness: 0.25, technique: 0.3 },
    gkRelevance: 0.15,
    gkAttributes: { anticipation: 0.6, positioning: 0.4 },
    defenderRelevance: 0.4,
    risk: 0.3,
    fit: (c) => throughBallFit(c, 'right'),
  }),

  action('switchPlay', {
    label: 'Switch the play',
    family: 'pass',
    baseValue: 0.58,
    execution: { passing: 0.5, technique: 0.25, awareness: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0.2,
    risk: 0.2,
    fit: (c) => {
      let value = 0.45 + c.defensivePressure * 0.2;
      value += unit(c.attackingTeam.ratings.width) * 0.15;
      value -= c.situationQuality * 0.25; // don't switch away from a good chance
      return clamp01(value);
    },
  }),

  action('squarePass', {
    label: 'Square ball to a teammate',
    family: 'pass',
    baseValue: 0.58,
    execution: { passing: 0.4, awareness: 0.35, composure: 0.25 },
    gkRelevance: 0.35,
    gkAttributes: { anticipation: 0.5, positioning: 0.3, decisionMaking: 0.2 },
    defenderRelevance: 0.35,
    risk: 0.3,
    fit: (c) => {
      // Unselfish and often correct in the box, but a keeper who reads it wins.
      let value = 0.45 + c.defensivePressure * 0.2;
      if (c.zone.box === 'inside') value += 0.1;
      value += unit(c.attackingTeam.ratings.creativity) * 0.1;
      return clamp01(value - predictabilityPenalty(c, 0.3));
    },
  }),

  action('passBack', {
    label: 'Lay it back',
    family: 'pass',
    baseValue: 0.66,
    execution: { passing: 0.45, composure: 0.3, awareness: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0.25,
    risk: 0.15,
    fit: (c) => clamp01(0.45 + c.defensivePressure * 0.2 - c.situationQuality * 0.35),
    fitNote: (c) => (c.situationQuality > 0.6 ? 'Throws away a big chance' : 'Keeps possession'),
  }),

  action('layOff', {
    label: 'Lay it off and spin',
    family: 'pass',
    baseValue: 0.62,
    execution: { passing: 0.35, ballControl: 0.35, awareness: 0.3 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0.3,
    risk: 0.2,
    fit: (c) =>
      clamp01(0.45 + (c.player.tendencies.comesShort - 50) / 200 + c.defensivePressure * 0.15),
  }),

  action('oneTwo', {
    label: 'Play a one-two',
    family: 'pass',
    baseValue: 0.55,
    execution: { passing: 0.35, technique: 0.25, movement: 0.25, awareness: 0.15 },
    gkRelevance: 0.1,
    gkAttributes: { anticipation: 1 },
    defenderRelevance: 0.45,
    risk: 0.3,
    fit: (c) => {
      let value = 0.4 + unit(c.attackingTeam.ratings.passing) * 0.25;
      if (c.attackingTeam.style === 'possession') value += 0.12;
      value -= c.nearbyDefenders * 0.05;
      return clamp01(value);
    },
  }),

  // -------------------------------------------------------------- crosses ---
  action('crossFarPost', {
    label: 'Cross to the far post',
    family: 'cross',
    baseValue: 0.5,
    execution: { crossing: 0.55, technique: 0.25, awareness: 0.2 },
    gkRelevance: 0.35,
    gkAttributes: { positioning: 0.4, handling: 0.3, decisionMaking: 0.3 },
    defenderRelevance: 0.3,
    risk: 0.25,
    fit: (c) => clamp01(crossBaseFit(c) + (keeperExposure(c) > 0.5 ? 0.15 : 0)),
  }),

  action('crossPenaltySpot', {
    label: 'Cross to the penalty spot',
    family: 'cross',
    baseValue: 0.48,
    execution: { crossing: 0.55, technique: 0.2, awareness: 0.25 },
    gkRelevance: 0.55, // the keeper's zone
    gkAttributes: { positioning: 0.35, handling: 0.35, decisionMaking: 0.3 },
    defenderRelevance: 0.35,
    risk: 0.25,
    fit: (c) => clamp01(crossBaseFit(c) - keeperExposure(c) * 0.2),
  }),

  action('lowCross', {
    label: 'Low cross',
    family: 'cross',
    baseValue: 0.5,
    execution: { crossing: 0.5, technique: 0.3, composure: 0.2 },
    gkRelevance: 0.4,
    gkAttributes: { positioning: 0.4, reflexes: 0.3, decisionMaking: 0.3 },
    defenderRelevance: 0.45,
    risk: 0.3,
    fit: (c) => clamp01(crossBaseFit(c) + 0.08 - c.nearbyDefenders * 0.05),
  }),

  action('cutBack', {
    label: 'Cut it back',
    family: 'cross',
    baseValue: 0.58,
    execution: { crossing: 0.4, awareness: 0.3, composure: 0.3 },
    gkRelevance: 0.15, // behind the keeper
    gkAttributes: { positioning: 0.6, decisionMaking: 0.4 },
    defenderRelevance: 0.35,
    risk: 0.25,
    fit: (c) => {
      // The high-percentage modern option, best from deep and wide positions.
      let value = 0.55 + goalAngleFactor(c.zone) * 0.2;
      value += keeperExposure(c) * 0.15;
      value += unit(c.attackingTeam.ratings.creativity) * 0.1;
      value -= c.nearbyDefenders * 0.04;
      return clamp01(value);
    },
    fitNote: () => 'Takes the keeper out of the picture',
  }),

  action('earlyCross', {
    label: 'Whip in an early ball',
    family: 'cross',
    baseValue: 0.45,
    execution: { crossing: 0.6, technique: 0.2, awareness: 0.2 },
    gkRelevance: 0.4,
    gkAttributes: { positioning: 0.4, handling: 0.3, decisionMaking: 0.3 },
    defenderRelevance: 0.2,
    risk: 0.3,
    fit: (c) => {
      let value = crossBaseFit(c) - 0.05;
      if (c.attackingTeam.style === 'direct') value += 0.15;
      value += c.defensivePressure * 0.15; // before the defence can set
      return clamp01(value);
    },
  }),

  // -------------------------------------------------------------- headers ---
  action('headerDown', {
    label: 'Head it down',
    family: 'header',
    baseValue: 0.52,
    execution: { heading: 0.5, composure: 0.25, positioning: 0.25 },
    gkRelevance: 0.75,
    gkAttributes: { reflexes: 0.5, positioning: 0.3, handling: 0.2 },
    defenderRelevance: 0.35,
    risk: 0.2,
    fit: (c) => clamp01(0.6 - keeperExposure(c) * 0.15),
    fitNote: () => 'The coached finish — hard to keep out low',
  }),

  action('headerCorner', {
    label: 'Head it into the corner',
    family: 'header',
    baseValue: 0.46,
    execution: { heading: 0.45, technique: 0.3, composure: 0.25 },
    gkRelevance: 0.85,
    gkAttributes: { reflexes: 0.55, positioning: 0.3, anticipation: 0.15 },
    defenderRelevance: 0.3,
    risk: 0.25,
    fit: (c) => clamp01(0.5 + (keeperCommitted(c) !== 'none' ? 0.2 : 0)),
  }),

  action('headerFlickOn', {
    label: 'Flick it on',
    family: 'header',
    baseValue: 0.55,
    execution: { heading: 0.4, awareness: 0.35, positioning: 0.25 },
    gkRelevance: 0.1,
    gkAttributes: { positioning: 1 },
    defenderRelevance: 0.3,
    risk: 0.25,
    fit: (c) => clamp01(0.4 + unit(c.attackingTeam.ratings.creativity) * 0.2),
  }),

  // ------------------------------------------------------------ defending ---
  action('stepInAndTackle', {
    label: 'Step in and tackle',
    family: 'defend',
    baseValue: 0.5,
    execution: { tackling: 0.5, anticipation: 0.25, strength: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.5, // beaten here and the attacker is through
    fit: (c) => clamp01(0.45 + (c.player.tendencies.presses - 50) / 200 - c.situationQuality * 0.15),
  }),

  action('jockey', {
    label: 'Jockey and delay',
    family: 'defend',
    baseValue: 0.62,
    execution: { defensiveAwareness: 0.4, pace: 0.25, composure: 0.35 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.15,
    fit: (c) => clamp01(0.55 + c.situationQuality * 0.15),
    fitNote: () => 'Low risk — buys time for support to arrive',
  }),

  action('interceptLine', {
    label: 'Read it and intercept',
    family: 'defend',
    baseValue: 0.46,
    execution: { anticipation: 0.45, defensiveAwareness: 0.35, acceleration: 0.2 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.45,
    fit: (c) => clamp01(0.4 + unit(c.player.attributes.anticipation) * 0.25),
  }),

  action('clearFirstTime', {
    label: 'Clear it first time',
    family: 'defend',
    baseValue: 0.66,
    execution: { defensiveAwareness: 0.3, strength: 0.35, heading: 0.35 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.1,
    fit: (c) => clamp01(0.45 + c.defensivePressure * 0.3),
  }),

  action('shepherdWide', {
    label: 'Shepherd him wide',
    family: 'defend',
    baseValue: 0.6,
    execution: { defensiveAwareness: 0.4, pace: 0.3, positioning: 0.3 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.2,
    fit: (c) => clamp01(0.5 + (c.zone.channel === 'central' ? 0.15 : -0.1)),
  }),
]) as Record<ActionKind, ActionDefinition>;

// ------------------------------------------------------------- helpers -----

function throughBallFit(context: SituationContext, side: 'left' | 'centre' | 'right'): number {
  const { attackingTeam, player } = context;
  let value = 0.45;
  // Teams that break quickly and players who look for runners find these passes.
  value += unit(attackingTeam.ratings.creativity) * 0.15;
  if (attackingTeam.style === 'counterattack' || context.transition) value += 0.15;
  if (attackingTeam.style === 'direct') value += 0.08;
  value += (player.tendencies.runsBehind - 50) / 400; // a teammate profile proxy
  // Playing into the channel the player is already facing is easier.
  const zoneSideValue = zoneSide(context.zone);
  if (side === zoneSideValue) value += 0.08;
  if (side === 'centre') value -= context.nearbyDefenders * 0.05;
  value -= context.defensivePressure * 0.15;
  return clamp01(value);
}

function crossBaseFit(context: SituationContext): number {
  const { attackingTeam } = context;
  let value = 0.4;
  value += unit(attackingTeam.ratings.crossing) * 0.2;
  value += unit(attackingTeam.ratings.width) * 0.1;
  if (attackingTeam.style === 'widePlay') value += 0.15;
  if (attackingTeam.style === 'possession') value -= 0.08;
  // Crossing from a central position is rarely the idea.
  if (zoneSide(context.zone) === 'centre') value -= 0.3;
  return clamp01(value);
}

export function getAction(kind: ActionKind): ActionDefinition {
  const definition = ACTION_CATALOGUE[kind];
  if (!definition) throw new Error(`Unknown action kind: ${kind}`);
  return definition;
}
