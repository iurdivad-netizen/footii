import { clamp01, round, unit } from '../core/util/math.ts';
import type { Rng } from '../core/rng.ts';
import { weightedScore } from '../core/player/attributes.ts';
import { fatigueLevel } from '../core/player/player.ts';
import type { GoalkeeperAttributes } from '../core/goalkeeper/goalkeeper.ts';
import type {
  ActionDefinition,
  ActionOption,
  EventOutcome,
  OutcomeKind,
  SituationContext,
} from '../core/events/types.ts';
import { getAction } from '../data/actionCatalogue.ts';
import { receiverOf } from '../core/career/squad.ts';
import { DEFAULT_MATCH_IMPORTANCE } from '../core/career/confidence.ts';
import { MAVERICK_NOISE, hasTrait, traitActionBonus } from '../core/player/traits.ts';

/**
 * ACTION RESOLVER
 *
 * Deliberately NOT "button 3 = 50%". Every action is scored on a common scale
 * from independent contributions, and only then mapped to an outcome:
 *
 *   value = baseValue
 *         + EXECUTION * (executionScore - 0.5)     <- can the player do it
 *         + FIT       * (fit - 0.5)                <- was it the right idea
 *         + QUALITY   * (situationQuality - 0.5)   <- how good was the chance
 *         + TEMPO     * tempoAdjustment            <- decisiveness / rushing
 *         - GOALKEEPER* gkRelevance * (gkScore - 0.5)
 *         - DEFENDERS * defenderRelevance * defensivePressure
 *         + bounded noise
 *
 * `fit` is evaluated HERE, at the moment of the decision, so it sees the
 * goalkeeper's current action. Choosing to chip after the keeper commits to
 * rushing scores very differently from choosing it while he is still set —
 * that is the entire point of the commit mechanic.
 *
 * Randomness is bounded (clamped gaussian) so results stay believable: an
 * excellent player in a good position will not routinely produce a farce, but
 * nothing is ever certain.
 */
export const RESOLUTION_WEIGHTS = {
  execution: 0.34,
  fit: 0.28,
  quality: 0.18,
  tempo: 0.06,
  goalkeeper: 0.34,
  defenders: 0.3,
  /**
   * Execution jitter. Smaller than it was, because the goal probability curve
   * below now carries most of the uncertainty; the value itself should be
   * mostly a statement about the player and the situation.
   */
  noiseSd: 0.06,
  /**
   * Randomness is bounded, but the bound must not be so tight that an outcome
   * becomes arithmetically impossible — that turns thresholds into hard walls
   * and makes whole situations feel scripted. 2.5 sd keeps results believable
   * while leaving the improbable finish genuinely improbable rather than banned.
   */
  noiseClampSd: 2.5,
} as const;

export interface DecisionInput {
  option: ActionOption;
  /** Seconds elapsed when the choice was made. */
  timeUsed: number;
  /** Total decision window in seconds. */
  window: number;
  /** True when the timer expired and an instinctive action was substituted. */
  expired: boolean;
  /** True when playing without a time limit; tempo is then neutral. */
  untimed?: boolean;
}

export interface ResolutionTerm {
  label: string;
  value: number;
}

export interface ResolutionBreakdown {
  action: string;
  baseValue: number;
  executionScore: number;
  fit: number;
  goalkeeperScore: number;
  terms: ResolutionTerm[];
  noise: number;
  finalValue: number;
}

export interface ResolutionResult {
  outcome: EventOutcome;
  breakdown: ResolutionBreakdown;
}

/** Weighted 0-1 score of the goalkeeper attributes that oppose this action. */
export function goalkeeperOpposition(
  definition: ActionDefinition,
  attributes: GoalkeeperAttributes,
): number {
  const weights = definition.gkAttributes as Partial<Record<keyof GoalkeeperAttributes, number>>;
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights) as [keyof GoalkeeperAttributes, number][]) {
    total += unit(attributes[key]) * weight;
    weightSum += weight;
  }
  return weightSum === 0 ? 0.5 : total / weightSum;
}

/**
 * Execution quality, 0-1.
 * This is where a good decision can still be ruined: pressure, fatigue and
 * poor technique all bite here, and Composure is what protects against them.
 */
export function executionQuality(
  definition: ActionDefinition,
  context: SituationContext,
  decision: DecisionInput,
): number {
  const raw = weightedScore(context.player.attributes, definition.execution);

  const composure = unit(context.player.attributes.composure);
  const pressurePenalty = context.defensivePressure * (0.26 - 0.16 * composure);
  const fatiguePenalty = fatigueLevel(context.player) * 0.14;
  const formBonus = ((context.player.form - 50) / 50) * 0.03;

  // An instinctive (timed-out) action is executed less cleanly. Kept modest on
  // purpose: the real cost of running out of time is that instinct often picks
  // a WORSE OPTION (see InstinctiveAction), not that the attempt is doomed.
  const expiredPenalty = decision.expired ? 0.06 + (1 - composure) * 0.1 : 0;

  // Deciding in the last sliver of the window is a rushed action.
  const lateness = decision.window > 0 ? decision.timeUsed / decision.window : 0;
  const rushPenalty =
    !decision.expired && !decision.untimed && lateness > 0.85 ? 0.05 * (1 - composure) : 0;

  return clamp01(raw - pressurePenalty - fatiguePenalty - expiredPenalty - rushPenalty + formBonus);
}

/**
 * Tempo adjustment, -1 to 1.
 * Acting quickly is rewarded slightly (defenders and keepers have less time to
 * adjust), but only up to a point — this must never be large enough to make
 * "always press 1 instantly" a winning strategy, because waiting for the
 * keeper's commit is worth far more than the tempo bonus.
 */
export function tempoAdjustment(decision: DecisionInput): number {
  // Worse than the latest possible deliberate choice, but nowhere near a
  // guaranteed failure — see the expiry note in `executionQuality`.
  if (decision.expired) return -0.5;
  // Without a clock there is no rushing and no dawdling: taking your time is
  // the point of the mode, so it must not carry a hidden penalty.
  if (decision.untimed) return 0;
  if (decision.window <= 0) return 0;
  const used = clamp01(decision.timeUsed / decision.window);
  if (used < 0.35) return 0.5;
  if (used < 0.7) return 0.2;
  if (used < 0.9) return 0;
  return -0.4;
}

export function resolveAction(
  rng: Rng,
  context: SituationContext,
  decision: DecisionInput,
): ResolutionResult {
  const definition = getAction(decision.option.kind);

  const executionScore = executionQuality(definition, context, decision);
  // Fit is re-evaluated now, against the goalkeeper's CURRENT action.
  const fit = definition.fit(context);
  const gkScore = goalkeeperOpposition(definition, context.goalkeeper.keeper.attributes);
  const tempo = tempoAdjustment(decision);

  const terms: ResolutionTerm[] = [
    { label: 'Execution', value: RESOLUTION_WEIGHTS.execution * (executionScore - 0.5) },
    { label: 'Decision fit', value: RESOLUTION_WEIGHTS.fit * (fit - 0.5) },
    { label: 'Chance quality', value: RESOLUTION_WEIGHTS.quality * (context.situationQuality - 0.5) },
    { label: 'Tempo', value: RESOLUTION_WEIGHTS.tempo * tempo },
    {
      label: 'Goalkeeper',
      value: -RESOLUTION_WEIGHTS.goalkeeper * definition.gkRelevance * (gkScore - 0.5),
    },
    {
      label: 'Defensive pressure',
      value: -RESOLUTION_WEIGHTS.defenders * definition.defenderRelevance * context.defensivePressure,
    },
  ];

  // What he is known for. A term rather than a multiplier somewhere upstream,
  // so it shows up in the debug panel's audit beside everything else that made
  // this outcome — a trait the player cannot see the effect of is a trait he
  // has no reason to believe in. See core/player/traits.ts.
  const traitBonus = traitActionBonus(context.player.traits, {
    family: definition.family,
    insideBox: context.zone.box === 'inside',
    importance: context.importance ?? DEFAULT_MATCH_IMPORTANCE,
  });
  if (traitBonus !== 0) terms.push({ label: 'Reputation', value: traitBonus });

  // A maverick's jitter is wider in BOTH directions, which is the whole of what
  // the word means here. Nothing about this makes him better on average; it
  // makes him less predictable, and the goal-probability curve downstream turns
  // that into more of the afternoons nobody forgets and more of the other kind.
  const spread = hasTrait(context.player.traits, 'maverick')
    ? RESOLUTION_WEIGHTS.noiseSd * MAVERICK_NOISE
    : RESOLUTION_WEIGHTS.noiseSd;
  const noise = rng.noise(spread, RESOLUTION_WEIGHTS.noiseClampSd);
  const finalValue =
    definition.baseValue + terms.reduce((total, term) => total + term.value, 0) + noise;

  const outcome = mapToOutcome(rng, definition, context, decision, finalValue, executionScore);

  return {
    outcome,
    breakdown: {
      action: decision.option.label,
      baseValue: definition.baseValue,
      executionScore: round(executionScore, 3),
      fit: round(fit, 3),
      goalkeeperScore: round(gkScore, 3),
      terms: terms.map((term) => ({ label: term.label, value: round(term.value, 3) })),
      noise: round(noise, 3),
      finalValue: round(finalValue, 3),
    },
  };
}

// --------------------------------------------------------------- outcomes ---

function outcome(
  kind: OutcomeKind,
  commentary: string,
  options: Partial<Omit<EventOutcome, 'kind' | 'commentary'>> = {},
): EventOutcome {
  return {
    kind,
    commentary,
    retainedPossession: options.retainedPossession ?? false,
    goalScored: options.goalScored ?? false,
    ratingDelta: options.ratingDelta ?? 0,
    stats: options.stats ?? {},
    // Spread rather than defaulted: absent means "nobody was named", and an
    // explicit `undefined` key would serialise into the save as a null.
    ...(options.assistedBy ? { assistedBy: options.assistedBy } : {}),
  };
}

/**
 * GOAL PROBABILITY
 *
 * A logistic curve over the resolution value, NOT a threshold.
 *
 * This replaced `value >= 0.70 -> goal`, which was quietly broken. Because the
 * noise is clamped, a hard threshold near the top of the value distribution
 * walls players out arithmetically rather than making them unlikely: a created
 * 17-year-old striker converted a CLEAN one-on-one 3.7% of the time and could
 * play two seasons without scoring, while the same threshold barely troubled a
 * veteran. Player quality became hypersensitive — a tiny change in value swung
 * conversion from impossible to routine.
 *
 * A curve keeps the same ordering (better players and better reads still score
 * far more often) but nothing is ever impossible or certain. Calibrated so a
 * clean one-on-one converts around 40% for a good finisher and around 20% for a
 * raw teenager, which is roughly what real one-on-ones look like.
 */
export const GOAL_CURVE = { midpoint: 0.64, steepness: 11, min: 0.01, max: 0.88 } as const;

export function shotGoalProbability(value: number): number {
  const raw = 1 / (1 + Math.exp(-(value - GOAL_CURVE.midpoint) * GOAL_CURVE.steepness));
  return clamp01(Math.min(GOAL_CURVE.max, Math.max(GOAL_CURVE.min, raw)));
}

/** Chance a completed pass into the final third actually creates something. */
export function chanceCreationProbability(value: number): number {
  return clamp01(1 / (1 + Math.exp(-(value - 0.6) * 9)));
}

/** Was this a chance the player really should have taken? */
function isBigChance(context: SituationContext): boolean {
  return context.situationQuality >= 0.62;
}

function mapToOutcome(
  rng: Rng,
  definition: ActionDefinition,
  context: SituationContext,
  decision: DecisionInput,
  value: number,
  executionScore: number,
): EventOutcome {
  const player = context.player.name;
  const keeper = context.goalkeeper.keeper.name;
  const label = decision.option.label.toLowerCase();

  switch (definition.family) {
    case 'shot':
    case 'header':
      return resolveShot(rng, context, value, label, player, keeper, definition);
    case 'dribble':
      return resolveDribble(rng, context, value, executionScore, label, player, keeper, definition);
    case 'cross':
    case 'pass':
      return resolvePassOrCross(rng, context, value, label, player, definition);
    case 'defend':
      return resolveDefensive(rng, value, label, player, definition);
    case 'hold':
    default:
      return value >= 0.5
        ? outcome('held', `${player} holds the ball up and keeps possession.`, {
            retainedPossession: true,
            ratingDelta: 0.1,
            stats: {},
          })
        : outcome('turnover', `${player} is muscled off the ball.`, {
            ratingDelta: -0.25,
            stats: {},
          });
  }
}

function resolveShot(
  rng: Rng,
  context: SituationContext,
  value: number,
  label: string,
  player: string,
  keeper: string,
  definition: ActionDefinition,
): EventOutcome {
  const big = isBigChance(context);

  if (rng.chance(shotGoalProbability(value))) {
    return outcome('goal', `${player} goes for the ${label} — and it's in! GOAL!`, {
      goalScored: true,
      ratingDelta: 1.6,
      stats: { shots: 1, shotsOnTarget: 1, goals: 1 },
    });
  }

  // Not a goal. How it missed still depends on how good the attempt was.
  if (value >= 0.55 && rng.chance(0.07)) {
    return outcome('post', `${player} tries the ${label} — off the woodwork!`, {
      ratingDelta: 0.1,
      stats: { shots: 1, bigChancesMissed: big ? 1 : 0 },
    });
  }

  const onTarget = clamp01(0.2 + (value - 0.3) * 1.05);
  if (rng.chance(onTarget)) {
    const handling = unit(context.goalkeeper.keeper.attributes.handling);
    const spilled = rng.chance(clamp01(0.4 - handling * 0.35));
    return outcome(
      'saved',
      spilled
        ? `${player} forces ${keeper} into a save, and he can only parry it!`
        : `${player} goes for the ${label}, but ${keeper} saves.`,
      {
        retainedPossession: spilled,
        ratingDelta: big ? -0.1 : 0.2,
        stats: { shots: 1, shotsOnTarget: 1, bigChancesMissed: big ? 1 : 0 },
      },
    );
  }

  if (context.nearbyDefenders > 0 && definition.defenderRelevance >= 0.3 && rng.chance(0.45)) {
    return outcome('blocked', `${player} shoots, but it's blocked by a defender.`, {
      ratingDelta: -0.1,
      stats: { shots: 1, bigChancesMissed: big ? 1 : 0 },
    });
  }

  return outcome(
    'missed',
    big
      ? `${player} tries the ${label} — and drags it wide! A dreadful miss.`
      : `${player} tries the ${label}, but it's wide.`,
    {
      ratingDelta: big ? -0.65 : -0.25,
      stats: { shots: 1, bigChancesMissed: big ? 1 : 0 },
    },
  );
}

function resolveDribble(
  rng: Rng,
  context: SituationContext,
  value: number,
  executionScore: number,
  label: string,
  player: string,
  keeper: string,
  definition: ActionDefinition,
): EventOutcome {
  const success = value >= 0.52;

  if (!success) {
    const foulDrawn = rng.chance(0.18);
    if (foulDrawn) {
      return outcome('held', `${player} goes for the ${label} and is fouled — free kick.`, {
        retainedPossession: true,
        ratingDelta: 0.15,
        stats: { dribblesAttempted: 1 },
      });
    }
    return outcome('dribbleFailed', `${player} tries to ${label}, but is dispossessed.`, {
      ratingDelta: -0.2 - definition.risk * 0.3,
      stats: { dribblesAttempted: 1 },
    });
  }

  // Beating the goalkeeper leaves an open goal — but it still has to be finished.
  if (definition.kind === 'roundKeeper') {
    const finish = clamp01(0.55 + executionScore * 0.4 - context.nearbyDefenders * 0.16);
    if (rng.chance(finish)) {
      return outcome('goal', `${player} takes it round ${keeper} and rolls it in! GOAL!`, {
        goalScored: true,
        ratingDelta: 1.7,
        stats: { shots: 1, shotsOnTarget: 1, goals: 1, dribbles: 1, dribblesAttempted: 1 },
      });
    }
    return outcome('missed', `${player} rounds ${keeper} but a defender gets back to clear it!`, {
      ratingDelta: -0.35,
      stats: { shots: 1, dribbles: 1, dribblesAttempted: 1, bigChancesMissed: 1 },
    });
  }

  return outcome('dribbleSuccess', `${player} beats his man with the ${label}.`, {
    retainedPossession: true,
    ratingDelta: 0.3,
    stats: { dribbles: 1, dribblesAttempted: 1 },
  });
}

function resolvePassOrCross(
  rng: Rng,
  context: SituationContext,
  value: number,
  label: string,
  player: string,
  definition: ActionDefinition,
): EventOutcome {
  const isCross = definition.family === 'cross';
  const completed = value >= 0.5;

  if (!completed) {
    if (value >= 0.4) {
      return outcome(
        isCross ? 'crossCleared' : 'passIntercepted',
        isCross
          ? `${player} delivers the ${label}, but it's headed clear.`
          : `${player} goes for the ${label}, but it's cut out.`,
        {
          ratingDelta: -0.15,
          stats: { passes: 1 },
        },
      );
    }
    return outcome('turnover', `${player}'s ${label} is poor and possession is gone.`, {
      ratingDelta: -0.3,
      stats: { passes: 1 },
    });
  }

  // A completed pass/cross into a dangerous area creates a chance for a
  // teammate. Whether they score is out of the player's hands — but the assist
  // is not, which is how a midfielder earns a high rating without scoring.
  //
  // BALANCING NOTE: this bar is deliberately high. When it was low, laying the
  // ball off became the mathematically best answer to almost every situation,
  // including a one-on-one, which is both bad football and a degenerate
  // strategy. Creating a chance must be a good outcome, never a safer way of
  // scoring than shooting.
  const dangerous =
    context.zone.third === 'attacking' && rng.chance(chanceCreationProbability(value));
  if (!dangerous) {
    return outcome(
      isCross ? 'crossCompleted' : 'passCompleted',
      `${player} finds a teammate with the ${label}.`,
      {
        retainedPossession: true,
        ratingDelta: 0.08,
        stats: { passes: 1, passesCompleted: 1 },
      },
    );
  }

  const teammateFinishing = clamp01(
    unit(context.attackingTeam.ratings.attack) * 0.55 + (value - 0.5) * 0.6 + 0.05,
  );
  // Who the ball found. Drawn ONCE, before the finish is rolled, so the same
  // man is named whether he scores or misses — a chance created and a chance
  // taken are the same pass to two different endings, and naming two different
  // players for them would read as two different passes.
  const receiver = receiverOf(rng, context.teammates);
  const receiverName = receiver ? receiver.name : 'a teammate';

  if (rng.chance(teammateFinishing * 0.45)) {
    return outcome(
      'goal',
      `${player}'s ${label} is finished off first time by ${receiverName}! GOAL — and an assist!`,
      {
        goalScored: true,
        ratingDelta: 1.0,
        stats: { passes: 1, passesCompleted: 1, keyPasses: 1, assists: 1 },
        assistedBy: receiver?.name,
      },
    );
  }

  return outcome(
    'chanceCreated',
    `${player}'s ${label} puts ${receiverName} in, but the chance goes begging.`,
    {
      retainedPossession: false,
      ratingDelta: 0.3,
      stats: { passes: 1, passesCompleted: 1, keyPasses: 1 },
    },
  );
}

function resolveDefensive(
  rng: Rng,
  value: number,
  label: string,
  player: string,
  definition: ActionDefinition,
): EventOutcome {
  if (value >= 0.6) {
    const isIntercept = definition.kind === 'interceptLine';
    return outcome('ballWon', `${player} times the ${label} perfectly and wins the ball.`, {
      retainedPossession: true,
      ratingDelta: 0.4,
      stats: isIntercept ? { interceptions: 1 } : { tackles: 1 },
    });
  }

  if (value >= 0.45) {
    return outcome('held', `${player} does enough to delay the attack until support arrives.`, {
      retainedPossession: false,
      ratingDelta: 0.2,
      stats: {},
    });
  }

  if (rng.chance(definition.risk * 0.5)) {
    return outcome('foulCommitted', `${player} mistimes the ${label} and gives away a free kick.`, {
      ratingDelta: -0.4,
      stats: { fouls: 1 },
    });
  }

  return outcome('turnover', `${player} is beaten by the attacker — the danger is real now.`, {
    ratingDelta: -0.5 - definition.risk * 0.3,
    stats: {},
  });
}
