import { clamp } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { AttributeKey, Attributes } from './attributes.ts';
import { ATTRIBUTE_KEYS, createAttributes } from './attributes.ts';
import type { Player } from './player.ts';
import { createPlayer, currentAbility } from './player.ts';
import type { Position } from './positions.ts';
import { POSITION_PROFILES } from './positions.ts';
import type { Tendencies } from './tendencies.ts';

/**
 * CUSTOM PLAYER CREATION
 *
 * The RPG layer: instead of picking a pre-built footballer, you build one.
 *
 * Design rules:
 *   - Every attribute starts at CREATION_FLOOR and is raised by spending from a
 *     fixed pool, so every created player costs the same and none can be
 *     strictly better than another.
 *   - No attribute can exceed CREATION_CAP at creation. A 17-year-old should not
 *     start with 90 Finishing; that is what a career is for.
 *   - POTENTIAL IS NOT CHOSEN AND NEVER SHOWN. It is rolled from the career seed
 *     against your age, so a young creation carries real upside and an older one
 *     carries almost none. You find out who you are by playing.
 */

export const CREATION_FLOOR = 25;
export const CREATION_CAP = 70;

/**
 * Points available to spend above the floor.
 *
 * 20 attributes x (25 floor) is the free baseline; this pool is what shapes the
 * player. Spread evenly it puts every attribute at ~51, so a specialist still
 * has to be deliberately lopsided — which is the interesting choice.
 *
 * CALIBRATION NOTE: this was 430, which left a created player at roughly 46
 * overall against the 58 of the pre-built prospect. That made the RPG path
 * strictly worse than picking an archetype — a created 17-year-old striker
 * struggled to score at all. Set so a created player lands in the same band as
 * a young pre-build, and check `tests/playerBuilder.test.ts` if you change it.
 */
export const CREATION_POINTS = 520;

export const MIN_CREATION_AGE = 16;
export const MAX_CREATION_AGE = 34;

/** A named bundle of tendencies, offered per position for flavour. */
export interface PlayingStyle {
  id: string;
  label: string;
  description: string;
  tendencies: Partial<Tendencies>;
}

const STYLES: Record<string, PlayingStyle[]> = {
  forward: [
    {
      id: 'poacher',
      label: 'Poacher',
      description: 'Lives on the shoulder. More one-on-ones and tap-ins, less build-up.',
      tendencies: { runsBehind: 90, attacksSpace: 80, holdsPosition: 60, dropsDeep: 15, comesShort: 20 },
    },
    {
      id: 'targetMan',
      label: 'Target Man',
      description: 'Holds the ball up and attacks crosses. More aerial and box arrivals.',
      tendencies: { holdsPosition: 85, comesShort: 60, runsBehind: 30, attacksSpace: 40, dropsDeep: 40 },
    },
    {
      id: 'falseNine',
      label: 'False Nine',
      description: 'Drops between the lines. More edge-of-box and creative moments.',
      tendencies: { dropsDeep: 88, comesShort: 85, runsBehind: 25, movesIntoChannels: 60 },
    },
  ],
  wide: [
    {
      id: 'insideForward',
      label: 'Inside Forward',
      description: 'Cuts inside to shoot. More side-of-the-box chances.',
      tendencies: { cutsInside: 90, staysWide: 25, attacksSpace: 70, movesIntoChannels: 75 },
    },
    {
      id: 'touchlineWinger',
      label: 'Touchline Winger',
      description: 'Hugs the line and crosses. More wide attacks and deliveries.',
      tendencies: { staysWide: 92, cutsInside: 20, attacksSpace: 65 },
    },
    {
      id: 'invertedRunner',
      label: 'Inverted Runner',
      description: 'Attacks the channels behind the full back.',
      tendencies: { movesIntoChannels: 90, runsBehind: 80, staysWide: 45, cutsInside: 55 },
    },
  ],
  midfield: [
    {
      id: 'deepPlaymaker',
      label: 'Deep Playmaker',
      description: 'Comes short and dictates. More midfield progression moments.',
      tendencies: { comesShort: 90, dropsDeep: 82, holdsPosition: 55, presses: 40 },
    },
    {
      id: 'boxToBox',
      label: 'Box to Box',
      description: 'Covers ground both ways. A mix of everything.',
      tendencies: { presses: 75, attacksSpace: 70, comesShort: 55, runsBehind: 55 },
    },
    {
      id: 'attackingRunner',
      label: 'Attacking Runner',
      description: 'Arrives late in the box. More edge-of-box and arrivals.',
      tendencies: { runsBehind: 80, attacksSpace: 85, dropsDeep: 20, comesShort: 35 },
    },
  ],
  defender: [
    {
      id: 'stopper',
      label: 'Stopper',
      description: 'Steps in and challenges. More aggressive defensive duels.',
      tendencies: { presses: 88, holdsPosition: 45, attacksSpace: 30 },
    },
    {
      id: 'coverer',
      label: 'Coverer',
      description: 'Holds the line and reads danger. Safer, positional defending.',
      tendencies: { holdsPosition: 90, presses: 30, dropsDeep: 70 },
    },
    {
      id: 'overlapping',
      label: 'Overlapping',
      description: 'Gets forward at every chance. More wide attacking moments.',
      tendencies: { staysWide: 85, attacksSpace: 75, presses: 60, holdsPosition: 30 },
    },
  ],
};

/** Which style set suits a position. */
export function stylesForPosition(position: Position): PlayingStyle[] {
  switch (position) {
    case 'ST':
      return STYLES.forward!;
    case 'LW':
    case 'RW':
      return STYLES.wide!;
    case 'AM':
    case 'CM':
    case 'DM':
      return STYLES.midfield!;
    default:
      return STYLES.defender!;
  }
}

/** Points spent above the floor. */
export function pointsSpent(attributes: Attributes): number {
  return ATTRIBUTE_KEYS.reduce((total, key) => total + (attributes[key] - CREATION_FLOOR), 0);
}

export function pointsRemaining(attributes: Attributes): number {
  return CREATION_POINTS - pointsSpent(attributes);
}

/** A blank slate: every attribute at the floor, full pool unspent. */
export function blankAttributes(): Attributes {
  return createAttributes(CREATION_FLOOR);
}

/**
 * A sensible starting allocation for a position, so the creator opens on
 * something playable rather than a wall of 25s. Spends most of the pool on the
 * role's key attributes and leaves the rest for the player to place.
 */
export function suggestedAttributes(position: Position): Attributes {
  const attributes = blankAttributes();
  const profile = POSITION_PROFILES[position];
  const keys = new Set<AttributeKey>(profile.keyAttributes);

  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = keys.has(key) ? 60 : 40;
  }
  // Trim or top up to land exactly on the pool.
  let remaining = pointsRemaining(attributes);
  const order = [...ATTRIBUTE_KEYS].sort((a, b) => (keys.has(b) ? 1 : 0) - (keys.has(a) ? 1 : 0));
  let index = 0;
  while (remaining !== 0 && index < order.length * 60) {
    const key = order[index % order.length]!;
    if (remaining > 0 && attributes[key] < CREATION_CAP) {
      attributes[key] += 1;
      remaining -= 1;
    } else if (remaining < 0 && attributes[key] > CREATION_FLOOR) {
      attributes[key] -= 1;
      remaining += 1;
    }
    index += 1;
  }
  return attributes;
}

export interface CustomPlayerSpec {
  name: string;
  age: number;
  position: Position;
  attributes: Attributes;
  tendencies: Partial<Tendencies>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSpec(spec: CustomPlayerSpec): ValidationResult {
  const errors: string[] = [];
  if (!spec.name.trim()) errors.push('Your player needs a name.');
  if (spec.name.length > 30) errors.push('That name is too long.');
  if (spec.age < MIN_CREATION_AGE || spec.age > MAX_CREATION_AGE) {
    errors.push(`Age must be between ${MIN_CREATION_AGE} and ${MAX_CREATION_AGE}.`);
  }
  const remaining = pointsRemaining(spec.attributes);
  if (remaining < 0) errors.push(`You have spent ${-remaining} points too many.`);
  if (remaining > 0) errors.push(`You still have ${remaining} points to spend.`);
  for (const key of ATTRIBUTE_KEYS) {
    const value = spec.attributes[key];
    if (value < CREATION_FLOOR || value > CREATION_CAP) {
      errors.push(`Attributes must be between ${CREATION_FLOOR} and ${CREATION_CAP}.`);
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Starting experience by age. A 16-year-old has never played a senior match;
 * a 30-year-old has played hundreds. This matters immediately because
 * experience is a term in the decision timer.
 */
export function startingExperience(age: number): number {
  return clamp(Math.round((age - 15) * 7.5), 2, 92);
}

/**
 * Roll a hidden potential. Younger players carry far more upside, and the
 * spread is wide enough that two identical creations can have very different
 * ceilings — you only find out by playing.
 */
export function rollPotential(rng: Rng, age: number, ability: number): number {
  const band =
    age <= 19
      ? [16, 34]
      : age <= 23
        ? [9, 24]
        : age <= 27
          ? [4, 14]
          : [0, 6];
  return clamp(ability + rng.int(band[0]!, band[1]!), ability, 99);
}

export function createCustomPlayer(rng: Rng, spec: CustomPlayerSpec): Player {
  const player = createPlayer({
    name: spec.name.trim(),
    age: spec.age,
    position: spec.position,
    attributes: spec.attributes,
    tendencies: spec.tendencies,
    experience: startingExperience(spec.age),
    reputation: clamp(10 + (spec.age - 16) * 2, 5, 55),
    fitness: 100,
  });
  player.potentialAbility = rollPotential(rng, spec.age, currentAbility(player));
  return player;
}
