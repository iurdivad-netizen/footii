/**
 * Behavioural tendencies.
 *
 * Tendencies shape EVENT GENERATION rather than event resolution. Two strikers
 * with identical technical attributes should generate visibly different games:
 * a `runsBehind` striker collects through balls and one-on-ones, while a
 * `dropsDeep` striker collects build-up and edge-of-box situations.
 *
 * Each tendency carries a strength of 0-100 (50 = neutral) so a player can be
 * described as a blend rather than a single archetype.
 */
export type TendencyKey =
  | 'runsBehind'
  | 'dropsDeep'
  | 'movesIntoChannels'
  | 'holdsPosition'
  | 'presses'
  | 'attacksSpace'
  | 'comesShort'
  | 'cutsInside'
  | 'staysWide';

export type Tendencies = Record<TendencyKey, number>;

export const TENDENCY_KEYS: readonly TendencyKey[] = [
  'runsBehind',
  'dropsDeep',
  'movesIntoChannels',
  'holdsPosition',
  'presses',
  'attacksSpace',
  'comesShort',
  'cutsInside',
  'staysWide',
];

export const TENDENCY_LABELS: Record<TendencyKey, string> = {
  runsBehind: 'Runs Behind',
  dropsDeep: 'Drops Deep',
  movesIntoChannels: 'Moves Into Channels',
  holdsPosition: 'Holds Position',
  presses: 'Presses',
  attacksSpace: 'Attacks Space',
  comesShort: 'Comes Short',
  cutsInside: 'Cuts Inside',
  staysWide: 'Stays Wide',
};

export function createTendencies(overrides: Partial<Tendencies> = {}): Tendencies {
  const base = {} as Tendencies;
  for (const key of TENDENCY_KEYS) base[key] = 50;
  return { ...base, ...overrides };
}

/** Tendency value as a multiplier around 1.0 (0 -> 0.5x, 50 -> 1.0x, 100 -> 1.5x). */
export function tendencyFactor(tendencies: Tendencies, key: TendencyKey): number {
  return 0.5 + tendencies[key] / 100;
}
