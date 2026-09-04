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
    // "to a teammate" was fine while nobody in the squad had a name. Now that
    // the outcome says who got on the end of it, the label doubled up: "square
    // ball to a teammate is finished off first time by Grant Tunnicliffe".
    label: 'Square ball across',
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

  // --------------------------------------------------------- corner runs ---
  // Two halves of one read. The keeper at a corner is choosing whether to come
  // and claim, and these two options are worth the opposite of each other
  // depending on what he does — which is the commit mechanic in the air.
  action('attackNearPost', {
    label: 'Attack it at the near post',
    family: 'header',
    baseValue: 0.5,
    execution: { movement: 0.35, heading: 0.4, acceleration: 0.25 },
    gkRelevance: 0.6, // the near post is the keeper's own six-yard box
    gkAttributes: { positioning: 0.4, handling: 0.35, decisionMaking: 0.25 },
    defenderRelevance: 0.4,
    risk: 0.3,
    fit: (c) => {
      // Getting in front of your marker only works while the keeper stays put.
      // The moment he comes to claim, the near post is the worst place to be.
      let value = 0.62 - keeperExposure(c) * 0.45;
      value -= (c.nearbyDefenders - 1) * 0.05;
      return clamp01(value);
    },
    fitNote: (c) => (keeperExposure(c) > 0.5 ? 'The keeper is coming for it' : 'The keeper stays'),
  }),

  action('peelToFarPost', {
    label: 'Peel off to the far post',
    family: 'header',
    baseValue: 0.44,
    execution: { positioning: 0.35, heading: 0.35, movement: 0.3 },
    gkRelevance: 0.25,
    gkAttributes: { positioning: 0.5, decisionMaking: 0.3, handling: 0.2 },
    defenderRelevance: 0.2,
    risk: 0.25,
    fit: (c) => {
      // The mirror image of the near post: a keeper who commits to the ball
      // leaves the back of the six-yard box completely unguarded.
      let value = 0.42 + keeperExposure(c) * 0.35;
      value += unit(c.player.attributes.heading) * 0.1;
      return clamp01(value);
    },
    fitNote: (c) => (keeperExposure(c) > 0.5 ? 'Nobody is on the back post' : 'The keeper is set'),
  }),

  // ------------------------------------------------------------ penalties ---
  // Penalties are the purest form of the commit mechanic: no defenders, no
  // angle, only whether you moved before the keeper did.
  //
  // CALIBRATION: a penalty already collects a large constant bonus from chance
  // quality (~0.9, the highest in the game) and loses almost nothing to
  // defenders, so these base values are LOWER than the open-play shots and
  // still land a competent taker at roughly the real three-in-four. The spread
  // between the options is almost entirely `fit`, which is to say the read: the
  // same taker converts about four in five having waited for the keeper to go,
  // and closer to two in five having guessed.
  action('penaltyPlaced', {
    label: 'Side-foot it into the corner',
    family: 'shot',
    baseValue: 0.55,
    execution: { composure: 0.4, technique: 0.3, finishing: 0.3 },
    gkRelevance: 0.5,
    gkAttributes: { anticipation: 0.4, reflexes: 0.35, positioning: 0.25 },
    defenderRelevance: 0,
    risk: 0.15,
    fit: (c) => {
      // The percentage penalty. Never wrong, never devastating.
      const committed = keeperCommitted(c);
      let value = 0.62;
      if (committed !== 'none') value += 0.1;
      return clamp01(value - predictabilityPenalty(c, 0.35));
    },
    fitNote: () => 'The percentage penalty',
  }),

  action('penaltyNearPost', {
    label: 'Hard and low to the near corner',
    family: 'shot',
    baseValue: 0.54,
    execution: { finishing: 0.4, technique: 0.3, composure: 0.3 },
    gkRelevance: 0.6, // the corner keepers actually reach
    gkAttributes: { anticipation: 0.45, reflexes: 0.35, positioning: 0.2 },
    defenderRelevance: 0,
    risk: 0.2,
    fit: (c) => {
      const committed = keeperCommitted(c);
      let value = 0.55;
      if (committed === 'far') value += 0.3;
      if (committed === 'near') value -= 0.35;
      if (committed === 'ground') value += 0.1;
      return clamp01(value - predictabilityPenalty(c, 0.55));
    },
    fitNote: (c) =>
      keeperCommitted(c) === 'near' ? 'He has gone that way' : 'That corner is open',
  }),

  action('penaltyPower', {
    label: 'Blast it down the middle',
    family: 'shot',
    baseValue: 0.53,
    execution: { shooting: 0.4, strength: 0.3, composure: 0.3 },
    gkRelevance: 0.25, // power beats a keeper who guessed right
    gkAttributes: { reflexes: 0.5, positioning: 0.3, anticipation: 0.2 },
    defenderRelevance: 0,
    risk: 0.3,
    fit: (c) => {
      // Down the middle is empty the instant he dives — and a wall if he doesn't.
      const committed = keeperCommitted(c);
      let value = 0.35;
      if (committed === 'near' || committed === 'far') value += 0.4;
      if (committed === 'ground') value += 0.3;
      if (c.goalkeeper.action === 'holdingLine') value -= 0.2;
      return clamp01(value - predictabilityPenalty(c, 0.5));
    },
    fitNote: (c) => (keeperCommitted(c) !== 'none' ? 'The middle is empty' : 'He is still stood up'),
  }),

  action('penaltyTopCorner', {
    label: 'Go for the top corner',
    family: 'shot',
    baseValue: 0.5,
    execution: { technique: 0.45, composure: 0.3, shooting: 0.25 },
    gkRelevance: 0.12, // unsaveable if it lands — the risk is missing the goal
    gkAttributes: { reflexes: 0.7, positioning: 0.3 },
    defenderRelevance: 0,
    risk: 0.4,
    fit: () => 0.6,
    fitNote: () => 'Unsaveable if it lands — all on the technique',
  }),

  action('penaltyOpenBody', {
    label: 'Wait, then open the body the other way',
    family: 'shot',
    baseValue: 0.52,
    execution: { composure: 0.4, technique: 0.3, anticipation: 0.3 },
    gkRelevance: 0.2,
    gkAttributes: { anticipation: 0.6, reflexes: 0.4 },
    defenderRelevance: 0,
    risk: 0.35,
    fit: (c) => {
      // Only exists as an idea once he has actually moved. Choose it while he
      // is still balanced and you have simply passed it to him.
      const committed = keeperCommitted(c);
      if (committed === 'none') return 0.12;
      return clamp01(0.85 - predictabilityPenalty(c, 0.2));
    },
    fitNote: (c) =>
      keeperCommitted(c) === 'none' ? 'He has not moved yet' : 'He has thrown himself one way',
  }),

  action('penaltyPanenka', {
    label: 'Chip it down the middle',
    family: 'shot',
    baseValue: 0.48,
    execution: { technique: 0.45, composure: 0.4, finishing: 0.15 },
    gkRelevance: 0.3,
    gkAttributes: { anticipation: 0.5, reflexes: 0.3, decisionMaking: 0.2 },
    defenderRelevance: 0,
    risk: 0.55, // the most public way to fail in football
    fit: (c) => {
      const committed = keeperCommitted(c);
      let value = 0.2;
      if (committed === 'ground') value += 0.65;
      else if (committed !== 'none') value += 0.5;
      if (c.goalkeeper.action === 'holdingLine') value -= 0.15;
      return clamp01(value - predictabilityPenalty(c, 0.3));
    },
    fitNote: (c) =>
      keeperCommitted(c) === 'none' ? 'He is still on his feet — this is madness' : 'He has gone',
  }),

  // ------------------------------------------------------- direct free kicks ---
  // Direct free kicks convert at well under one in ten, so the shooting options
  // carry deliberately low base values: the interesting choice is usually
  // whether to shoot at all, and the delivery options are genuinely competitive.
  action('freeKickCurl', {
    label: 'Curl it over the wall',
    family: 'shot',
    baseValue: 0.34,
    execution: { technique: 0.4, shooting: 0.35, composure: 0.25 },
    gkRelevance: 0.7,
    gkAttributes: { reflexes: 0.45, positioning: 0.35, anticipation: 0.2 },
    defenderRelevance: 0.1, // the wall, not the defenders around him
    risk: 0.25,
    fit: (c) => {
      let value = 0.6 - goalAngleFactor(c.zone) * 0.35 - goalDistanceFactor(c.zone) * 0.25;
      value += unit(c.player.attributes.technique) * 0.2;
      return clamp01(value);
    },
    fitNote: (c) => (goalAngleFactor(c.zone) > 0.5 ? 'A tight angle to bend it in' : 'Central range'),
  }),

  action('freeKickDrive', {
    label: 'Drive it under the wall',
    family: 'shot',
    baseValue: 0.32,
    execution: { shooting: 0.45, technique: 0.3, strength: 0.25 },
    gkRelevance: 0.8,
    gkAttributes: { reflexes: 0.5, positioning: 0.25, handling: 0.25 },
    defenderRelevance: 0.15,
    risk: 0.3,
    fit: (c) => {
      // A shot that trades placement for surprise: worth more from further out,
      // where the keeper expects a cross, and against a keeper who reads poorly.
      let value = 0.4 + goalDistanceFactor(c.zone) * 0.2;
      value -= unit(c.goalkeeper.keeper.attributes.anticipation) * 0.15;
      return clamp01(value);
    },
  }),

  action('freeKickWhipped', {
    label: 'Whip it into the six-yard box',
    family: 'cross',
    baseValue: 0.52,
    execution: { crossing: 0.5, technique: 0.3, awareness: 0.2 },
    gkRelevance: 0.5, // straight into the area he is allowed to punch
    gkAttributes: { positioning: 0.35, handling: 0.35, decisionMaking: 0.3 },
    defenderRelevance: 0.3,
    risk: 0.3,
    fit: (c) => {
      let value = 0.45 + goalAngleFactor(c.zone) * 0.25 + goalDistanceFactor(c.zone) * 0.15;
      value += unit(c.attackingTeam.ratings.crossing) * 0.15;
      value -= keeperExposure(c) * 0.2;
      return clamp01(value);
    },
    fitNote: (c) =>
      goalAngleFactor(c.zone) > 0.5 ? 'Too wide to shoot — deliver it' : 'Shooting range',
  }),

  action('freeKickFarPost', {
    label: 'Hang it up to the far post',
    family: 'cross',
    baseValue: 0.5,
    execution: { crossing: 0.45, technique: 0.3, awareness: 0.25 },
    gkRelevance: 0.2, // beyond where he can realistically come
    gkAttributes: { positioning: 0.5, decisionMaking: 0.3, handling: 0.2 },
    defenderRelevance: 0.25,
    risk: 0.25,
    fit: (c) => {
      let value = 0.45 + unit(c.attackingTeam.ratings.crossing) * 0.15;
      value += keeperExposure(c) * 0.2;
      value -= c.nearbyDefenders * 0.03;
      return clamp01(value);
    },
  }),

  action('freeKickRolled', {
    label: 'Roll it sideways for the shot',
    family: 'pass',
    baseValue: 0.55,
    execution: { passing: 0.4, awareness: 0.35, composure: 0.25 },
    gkRelevance: 0.1,
    gkAttributes: { anticipation: 1 },
    defenderRelevance: 0.2,
    risk: 0.25,
    fit: (c) => {
      // Worth it when the angle is good enough that the second player has a
      // shot, and when the side around you can actually strike a ball.
      let value = 0.5 - goalAngleFactor(c.zone) * 0.3;
      value += unit(c.attackingTeam.ratings.creativity) * 0.2;
      return clamp01(value);
    },
  }),

  action('freeKickShort', {
    label: 'Play it short and rebuild',
    family: 'pass',
    baseValue: 0.68,
    execution: { passing: 0.4, composure: 0.35, awareness: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0.15,
    risk: 0.1,
    fit: (c) => {
      let value = 0.45 + unit(c.attackingTeam.ratings.possession) * 0.2;
      value -= c.situationQuality * 0.3; // wasteful from a shooting position
      return clamp01(value);
    },
    fitNote: (c) => (c.situationQuality > 0.5 ? 'Wastes the set piece' : 'Keeps the ball'),
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

  // ------------------------------------------------- defending a ball in the air ---
  // NOTE: in a defensive event the goalkeeper in context is the player's OWN
  // keeper, so `gkRelevance` must stay at zero — it is an opposition term. Where
  // the keeper matters to a defender he is read inside `fit` instead.
  action('headerClear', {
    label: 'Attack it and head it clear',
    family: 'defend',
    baseValue: 0.6,
    execution: { heading: 0.45, strength: 0.3, defensiveAwareness: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.2,
    fit: (c) => clamp01(0.62 - c.situationQuality * 0.12),
    fitNote: () => 'The defender’s first instinct, and usually right',
  }),

  action('blockRunner', {
    label: 'Get across the runner',
    family: 'defend',
    baseValue: 0.52,
    execution: { strength: 0.4, positioning: 0.35, anticipation: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.5, // in the box this is how penalties are given away
    fit: (c) => clamp01(0.45 + c.defensivePressure * 0.2 - (c.zone.box === 'inside' ? 0.15 : 0)),
    fitNote: (c) => (c.zone.box === 'inside' ? 'Inside the box — careful' : 'Fair contact'),
  }),

  action('dropOffAndCover', {
    label: 'Drop off and cover the space',
    family: 'defend',
    baseValue: 0.57,
    execution: { defensiveAwareness: 0.45, positioning: 0.3, pace: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.15,
    fit: (c) => clamp01(0.45 + c.situationQuality * 0.25),
    fitNote: () => 'Concedes the ball, protects the goal',
  }),

  action('leaveItForTheKeeper', {
    label: 'Leave it for the keeper',
    family: 'defend',
    baseValue: 0.58,
    execution: { awareness: 0.4, decisionMaking: 0.35, composure: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.45, // a mix-up with your own keeper is a goal
    fit: (c) => {
      // The one action whose read is your OWN goalkeeper: leaving it to a
      // decisive, aggressive keeper is free, leaving it to a passive one is how
      // defenders end up apologising to the crowd.
      const a = c.goalkeeper.keeper.attributes;
      return clamp01(0.2 + unit(a.aggression) * 0.35 + unit(a.decisionMaking) * 0.3);
    },
    fitNote: (c) =>
      unit(c.goalkeeper.keeper.attributes.aggression) > 0.55
        ? 'He comes for these'
        : 'He tends to stay',
  }),

  // ------------------------------------------------------- pressing traps ---
  action('pressTheCarrier', {
    label: 'Sprint at the man on the ball',
    family: 'defend',
    baseValue: 0.48,
    execution: { acceleration: 0.4, tackling: 0.3, stamina: 0.3 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.55, // beaten by the press and the shape is gone
    fit: (c) => {
      let value = 0.4 + (c.player.tendencies.presses - 50) / 200;
      value += unit(c.defendingTeam.ratings.pressing) * 0.25;
      value -= c.situationQuality * 0.2; // pressing while exposed is how goals start
      return clamp01(value);
    },
    fitNote: (c) =>
      c.situationQuality > 0.55 ? 'They are already dangerous' : 'The moment to go',
  }),

  action('screenThePass', {
    label: 'Cut the passing lane',
    family: 'defend',
    baseValue: 0.54,
    execution: { anticipation: 0.4, defensiveAwareness: 0.35, positioning: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.25,
    fit: (c) => clamp01(0.45 + unit(c.player.attributes.anticipation) * 0.25),
  }),

  action('springTheTrap', {
    label: 'Show him inside to the cover',
    family: 'defend',
    baseValue: 0.5,
    execution: { defensiveAwareness: 0.35, positioning: 0.35, anticipation: 0.3 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.35,
    fit: (c) => {
      // A trap only exists if there is somebody to trap him against.
      let value = 0.35 + c.defensivePressure * 0.35;
      value += unit(c.defendingTeam.ratings.defensiveIntensity) * 0.15;
      return clamp01(value);
    },
    fitNote: (c) => (c.defensivePressure > 0.45 ? 'Support is there' : 'He would be on his own'),
  }),

  action('holdShape', {
    label: 'Hold your shape',
    family: 'defend',
    baseValue: 0.6,
    execution: { defensiveAwareness: 0.4, positioning: 0.35, composure: 0.25 },
    gkRelevance: 0,
    gkAttributes: {},
    defenderRelevance: 0,
    risk: 0.08,
    fit: (c) => clamp01(0.55 - unit(c.defendingTeam.ratings.pressing) * 0.15),
    fitNote: () => 'Nothing gained, nothing given away',
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

/**
 * HOW GOOD AN IDEA A CROSS IS, GIVEN THAT MOST OF THEM DO NOT COME OFF.
 *
 * The base was 0.4 when a cross found its man 51-66% of the time. Completion
 * has since been calibrated to the real 23%, and this number was left behind:
 * every reading of the game — the player's, and auto-play's, which chooses on
 * fit — was still being told crossing was as good an option as it used to be.
 *
 * It showed up as auto-play losing to CHOOSING AT RANDOM, which is the one
 * thing the skip policy must never do. Random crossed 9% of the time and
 * auto-play 13%, and the extra four points were coming straight off its rating.
 *
 * Lowered to match the odds the action now actually carries. A cross out wide
 * with a good crosser in a wide-playing side is still a fine idea; it is simply
 * no longer a better one than shooting from a position you could shoot from.
 */
function crossBaseFit(context: SituationContext): number {
  const { attackingTeam } = context;
  let value = 0.28;
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
