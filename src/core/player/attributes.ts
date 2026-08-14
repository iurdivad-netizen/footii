/**
 * Player attributes.
 *
 * Scale: 1-99, where 50 is a competent senior professional, 75+ is top-league
 * quality and 90+ is world class. All engine formulas consume attributes via
 * `norm()` (=> -1..1) or `unit()` (=> 0..1) so weights stay comparable.
 *
 * DESIGN RULE: not every attribute affects every situation. The mapping below
 * is the contract the rest of the engine honours, and is deliberately narrow so
 * that improving a specific attribute has a legible effect on gameplay.
 *
 *   Awareness         -> how fast the situation is understood (decision timer)
 *   Decision Making   -> quality of the option chosen (timer + instinct fallback)
 *   Composure         -> executing under pressure; shrinks the pressure penalty
 *   Anticipation      -> reading the goalkeeper / defender movement
 *   Finishing         -> quality of the final shot from close range
 *   Shooting          -> power & accuracy from distance
 *   Technique         -> execution of technically difficult actions (chips, curls)
 *   Passing           -> through balls, key passes, switches
 *   Crossing          -> delivery from wide areas
 *   Dribbling         -> beating an opponent / rounding the keeper
 *   Ball Control      -> first touch, keeping the ball in tight areas
 *   Positioning       -> likelihood of being in useful positions (event frequency)
 *   Movement          -> creating space / arriving on dangerous passes
 *   Pace              -> exploiting space once it exists
 *   Acceleration      -> reaching a developing opportunity first
 *   Strength          -> holding off contact, winning physical duels
 *   Stamina           -> resistance to fatigue over 90 minutes
 *   Heading           -> aerial finishing and defending
 *   Tackling          -> winning the ball in a challenge
 *   Defensive Awareness -> reading danger, interceptions, positioning off the ball
 */
export interface Attributes {
  pace: number;
  acceleration: number;
  shooting: number;
  finishing: number;
  passing: number;
  crossing: number;
  dribbling: number;
  ballControl: number;
  technique: number;
  strength: number;
  stamina: number;
  positioning: number;
  movement: number;
  awareness: number;
  decisionMaking: number;
  composure: number;
  anticipation: number;
  heading: number;
  tackling: number;
  defensiveAwareness: number;
}

export type AttributeKey = keyof Attributes;

export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  'pace',
  'acceleration',
  'shooting',
  'finishing',
  'passing',
  'crossing',
  'dribbling',
  'ballControl',
  'technique',
  'strength',
  'stamina',
  'positioning',
  'movement',
  'awareness',
  'decisionMaking',
  'composure',
  'anticipation',
  'heading',
  'tackling',
  'defensiveAwareness',
] as const;

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  pace: 'Pace',
  acceleration: 'Acceleration',
  shooting: 'Shooting',
  finishing: 'Finishing',
  passing: 'Passing',
  crossing: 'Crossing',
  dribbling: 'Dribbling',
  ballControl: 'Ball Control',
  technique: 'Technique',
  strength: 'Strength',
  stamina: 'Stamina',
  positioning: 'Positioning',
  movement: 'Movement',
  awareness: 'Awareness',
  decisionMaking: 'Decision Making',
  composure: 'Composure',
  anticipation: 'Anticipation',
  heading: 'Heading',
  tackling: 'Tackling',
  defensiveAwareness: 'Defensive Awareness',
};

/**
 * A weighted set of attributes, used to describe what an action's execution
 * depends on. Weights are expected to sum to 1 (asserted in tests) so that the
 * resulting execution score stays on a common 0-1 scale across all actions.
 */
export type AttributeWeights = Partial<Record<AttributeKey, number>>;

export function createAttributes(base: number, overrides: Partial<Attributes> = {}): Attributes {
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) attributes[key] = base;
  return { ...attributes, ...overrides };
}

/** Weighted 0-1 execution score for an action. */
export function weightedScore(attributes: Attributes, weights: AttributeWeights): number {
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    total += ((attributes[key] - 1) / 98) * weight;
    weightSum += weight;
  }
  return weightSum === 0 ? 0.5 : total / weightSum;
}
