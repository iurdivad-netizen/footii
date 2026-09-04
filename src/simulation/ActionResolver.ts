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
  SituationType,
} from '../core/events/types.ts';
import type { Third } from '../core/events/zones.ts';
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
 *
 * THE MIDPOINT MOVED FROM 0.64 TO 0.74 when `SHOT_QUALITY` below was added, and
 * the two are one change. Its one-on-one numbers were right the day they were
 * written; what was wrong was that every speculative shot in the game reached
 * this curve carrying almost a one-on-one's value. Separating the two pushed
 * the good chances up, and the midpoint puts them back where this note says
 * they belong. Neither number is meaningful without the other.
 *
 * Steepness is deliberately untouched. Measured across five candidate values it
 * moves the outcome by almost nothing, and — because the mean shot value sits
 * BELOW the midpoint — flattening it would raise conversion rather than lower
 * it. See ROADMAP.md.
 */
export const GOAL_CURVE = { midpoint: 0.74, steepness: 11, min: 0.01, max: 0.88 } as const;

/**
 * HOW MUCH THE CHANCE ITSELF DECIDES WHETHER A SHOT GOES IN.
 *
 * Applied HERE, at the goal roll, and deliberately nowhere else. That placement
 * is the whole design of this constant and it was arrived at by measuring the
 * alternative.
 *
 * THE DEFECT IT FIXES. `RESOLUTION_WEIGHTS.quality` is 0.18, half the weight of
 * the player's own execution, so a good footballer's HOPELESS chance inherited
 * most of the value of his best one. Measured with a perfect read, by band of
 * `situationQuality`, a world-class striker converted a genuinely poor chance
 * 27.6% of the time against 44.5% for a gilt-edged one — a spread of 1.5x where
 * real football is nearer tenfold. That is what made the aggregate absurd while
 * every individual number looked defensible.
 *
 * WHY NOT SIMPLY RAISE `RESOLUTION_WEIGHTS.quality`. Because it was tried,
 * measured, and it INVERTED THE GAME. That weight feeds `value`, which every
 * family shares and which the whole decision model is ordered by — so raising
 * it makes the situation matter more and the CHOICE matter less. At 0.58,
 * choosing the worst available option outscored choosing the best at every
 * ability measured (0.68 goals a match against 0.53 at ability 55; 1.90 against
 * 1.83 at 85), because a bad shot in a good position now beat a good pass. A
 * change that makes the decision mechanic the game is built on actively harmful
 * is not a balance fix, whatever it does to the aggregate.
 *
 * So the chance's quality is separated out and applied only where it belongs:
 * to whether the SHOT goes in. `value` is untouched, so every option is still
 * ordered exactly as it was, and reading the situation is worth exactly what it
 * always was.
 *
 * WHAT IT ACTUALLY BOUGHT, measured over 150 matches a side and stated plainly
 * because the honest number is smaller than the intent:
 *
 *                        before          after
 *     poor  (<0.45)      27.6%           21.5%
 *     big   (>=0.62)     44.5%           39.3%
 *     goals per shot     0.381           0.312
 *     goals per match     2.24            1.82
 *
 * The big-chance column is the one to check against the note on GOAL_CURVE
 * below: 39.3% against the 40% that curve was built to produce, and 18.6%
 * against its 20% for a raw teenager. That calibration is now the one the game
 * actually has, rather than the one it had for its best chances and lent to all
 * the others.
 *
 * The poor-chance column moved less than it should. A hopeless chance still
 * converts better than one in five for a world-class striker, where real
 * football is nearer one in twenty, and the spread across the bands is 1.8x
 * against a real 10x. Getting the rest of the way is not a bigger constant here
 * — that was measured, and it either inverts the decision model or breaks the
 * set pieces. It is the SHOT MIX: the game hands its striker five to six
 * attempts a match, most of them decent, because he is the focus of every
 * situation it generates. That is the situation generator's business rather
 * than the resolver's, and it is recorded in ROADMAP.md rather than half-done
 * here.
 */
export const SHOT_QUALITY = 0.4;

/**
 * SET PIECES ARE EXEMPT, and this is not a special case bolted on to make tests
 * pass — it is what the adjustment is FOR.
 *
 * This term exists to discriminate between open-play chances, which arrive with
 * a `situationQuality` drawn from a range and were all being converted at
 * roughly the same rate. A set piece is not that. Each one is a named,
 * separately calibrated situation with its own quality range and its own
 * difficulty: a penalty sits at 0.88-0.95 and a direct free kick at 0.3-0.55,
 * and those numbers were tuned directly against the conversion rates they were
 * meant to produce.
 *
 * Applying a quality gradient on top of them therefore double-counts the one
 * thing they already state. Measured: with penalties included, a penalty's
 * conversion rose past every bound its own tests set, and pushing the midpoint
 * far enough to bring it back drove direct free kicks below 2% — a specialist's
 * free kick becoming rarer than a defender's. Two separately calibrated set
 * pieces cannot both survive a gradient fitted to open play, because they sit at
 * opposite ends of it.
 */
export const SET_PIECE_SITUATIONS: readonly SituationType[] = [
  'penalty',
  'freeKickDirect',
  'cornerAttack',
];

/**
 * The midpoint set pieces still use: the one this curve had before the split.
 *
 * Exempting them from the quality gradient is only half of leaving them alone.
 * The midpoint moved from 0.64 to 0.74 to offset that gradient for OPEN PLAY,
 * and a set piece that skipped the gradient but inherited the offset would be
 * harder than it was for no reason at all — the offset exists to cancel
 * something a set piece never received.
 *
 * So they keep the old midpoint, which is not a legacy quirk but the precise
 * statement that set-piece conversion is unchanged by any of this. A penalty
 * converts today exactly what it converted before, and the tests that pin it
 * are the same tests, passing on the same numbers.
 */
export const SET_PIECE_MIDPOINT = 0.64;

/**
 * WHERE THE CURVE SITS FOR EACH SET PIECE, MEASURED AGAINST REAL FOOTBALL.
 *
 * One shared midpoint could not serve all three, because the three are nothing
 * like each other and the audit showed exactly how far apart they had drifted:
 *
 *   penalty       52.0% measured against 76-79% in the real game — a penalty
 *                 that a competent taker loses half the time is not a penalty.
 *   cornerAttack  20.6% measured against 10-12% for a shot from a corner. A
 *                 corner is the least productive attacking set piece there is,
 *                 and it was the third most reliable way to score in this game.
 *   freeKickDirect 6.3% against a real 5-8% — already right, so it keeps the
 *                 shared midpoint and is untouched.
 *
 * A lower midpoint is an easier chance. These are the only three situations the
 * gradient exempts, so this table is complete: everything else is open play and
 * reads GOAL_CURVE.midpoint.
 */
export const SET_PIECE_MIDPOINTS: Partial<Record<SituationType, number>> = {
  penalty: 0.57,
  cornerAttack: 0.735,
};

/**
 * The chance a shot goes in.
 *
 * `quality` and `situation` are both optional so the curve can still be
 * reasoned about and tested on its own, and so that any caller predating the
 * split behaves exactly as it did — 0.5 is the neutral chance and contributes
 * nothing.
 */
export function shotGoalProbability(
  value: number,
  quality = 0.5,
  situation?: SituationType,
): number {
  const exempt = situation !== undefined && SET_PIECE_SITUATIONS.includes(situation);
  const adjusted = exempt ? value : value + SHOT_QUALITY * (quality - 0.5);
  const midpoint = exempt
    ? (SET_PIECE_MIDPOINTS[situation!] ?? SET_PIECE_MIDPOINT)
    : GOAL_CURVE.midpoint;
  const raw = 1 / (1 + Math.exp(-(adjusted - midpoint) * GOAL_CURVE.steepness));
  return clamp01(Math.min(GOAL_CURVE.max, Math.max(GOAL_CURVE.min, raw)));
}

/**
 * HOW GOOD A BALL HAS TO BE TO FIND ITS MAN.
 *
 * Every pass and every cross used to clear the same bar — `value >= 0.5` — and
 * the audit showed what that costs. A cross found a team-mate 51-66% of the
 * time against a real 20-25%, while a ball played in midfield completed 44%
 * against a real ~85%. The model was not merely mis-levelled, it was INVERTED:
 * hardest where football is easiest, easiest where football is hardest.
 *
 * One rule fixes both, and it is the rule real football runs on — a pass gets
 * harder the further forward it goes and harder again if it leaves the ground:
 *
 *   A CROSS is the hardest ball in the game. It is long, it is airborne, it is
 *   contested by defenders facing their own goal, and most of them do not come
 *   off. It carries by far the biggest penalty here.
 *
 *   THE FINAL THIRD is where defences are compact and the passing lanes are
 *   short. A little harder than neutral.
 *
 *   MIDFIELD AND BEHIND is where a professional footballer completes almost
 *   everything he tries. Substantially easier, which is what turns a
 *   midfielder from a man who loses the ball every other touch into one who
 *   keeps it.
 *
 * Pressure counts on top, because a marked man plays a worse ball than a free
 * one — and because it makes the bar something the player's own reading of the
 * situation can move.
 */
export const PASS_BAR = {
  base: 0.5,
  cross: 0.08,
  attackingThird: 0.0,
  ownHalfOrMidfield: -0.2,
  pressure: 0.04,
} as const;

export function passCompletionBar(isCross: boolean, third: Third, defensivePressure: number): number {
  const zone = third === 'attacking' ? PASS_BAR.attackingThird : PASS_BAR.ownHalfOrMidfield;
  return clamp01(
    PASS_BAR.base +
      (isCross ? PASS_BAR.cross : 0) +
      zone +
      clamp01(defensivePressure) * PASS_BAR.pressure,
  );
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

  if (rng.chance(shotGoalProbability(value, context.situationQuality, context.situation))) {
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
  const bar = passCompletionBar(isCross, context.zone.third, context.defensivePressure);
  const completed = value >= bar;

  if (!completed) {
    // "Cut out" rather than "given away" is a near miss, so it scales with the
    // bar the ball actually had to clear instead of a fixed 0.4.
    if (value >= bar - 0.1) {
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
