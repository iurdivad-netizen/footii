import type { ActionOption, SituationContext } from '../core/events/types.ts';
import type { DecisionRecord } from '../core/match/matchState.ts';
import { getAction } from '../data/actionCatalogue.ts';
import type { ResolutionResult } from './ActionResolver.ts';
import type { InteractiveEvent } from './MatchEngine.ts';

/**
 * THE DECISION REVIEW — what each moment was, read back after the whistle.
 *
 * The resolver has always known why an action went the way it did: every term
 * of the resolution, the fit of the option chosen, whether the keeper had gone.
 * It told only the debug panel. This turns that into something the player is
 * shown at full time, and the interesting part is what it deliberately leaves
 * out.
 *
 * IT NEVER RANKS THE SIX. Telling somebody "the best option was 4" after every
 * moment turns a reading game into a lookup table — he stops watching the
 * keeper and starts memorising answers. And the honest ranking would be
 * discouraging for the wrong reason: the six are mostly sensible (random choice
 * rates 8.1 against a perfect read's 8.9 — see AutoPlay.ts), so a strict "you
 * picked the third best" would be noise presented as a verdict.
 *
 * So a read is one of three words, and only a CLEAR miss names an alternative:
 *
 *   best    within touching distance of the best option on the pitch
 *   sound   not the best, but nothing clearly better was on
 *   better  a clearly better ball was on — and this is the one case it is named
 *
 * THE FIT IS JUDGED WHEN HE CHOSE, not when the event appeared. The resolver
 * re-evaluates fit against the keeper's CURRENT action, which is the whole
 * point of waiting for him to commit: the far post may be the wrong shot at
 * 0.3s and the right one at 0.9s. Judging the read against the picture he
 * could not yet see would punish the patience the game is built to reward.
 *
 * NOTHING HERE TOUCHES THE RNG. Fit is a pure function of the context, so the
 * record costs six evaluations and changes no match that has ever been played.
 */

/** A fit this close to the best counts as the best read. */
export const READ_BEST_MARGIN = 0.05;

/**
 * The gap past which a better option is named.
 *
 * Measured rather than picked, over 200 matches per row with the same seeds.
 * The spread between the best and worst of the six is wide — about 0.34 of fit
 * for a striker at the median — so the first guess, 0.15, named an alternative
 * on half of all moments, which is a nag rather than a review. At 0.28:
 *
 *                               best   sound   clear miss
 *     veteran, uniformly random  25%    47%      28%
 *     veteran, auto-play         36%    47%      18%
 *     prospect, auto-play        30%    49%      21%
 *     centre back, auto-play     51%    44%       5%
 *
 * A defender's six sit closer together, so he is told about a miss less often,
 * which is right: there was less to miss.
 *
 * One more row is the reason the read is taken at the moment of choosing. A
 * policy that always takes the best option AS THE MOMENT OPENS — before the
 * keeper has committed — still gets a clear miss on 8% of moments, because the
 * keeper then went and changed which option was best. That is the mechanic,
 * showing up in the review exactly where it should.
 */
export const READ_CLEAR_GAP = 0.28;

/** Coarse read of a choice against the five it was not. */
export function readOf(
  context: SituationContext,
  options: readonly ActionOption[],
  chosen: ActionOption,
): { read: DecisionRecord['read']; betterOption?: string } {
  const chosenFit = getAction(chosen.kind).fit(context);
  let best = chosen;
  let bestFit = chosenFit;
  for (const option of options) {
    const fit = getAction(option.kind).fit(context);
    if (fit > bestFit) {
      best = option;
      bestFit = fit;
    }
  }
  const gap = bestFit - chosenFit;
  if (gap <= READ_BEST_MARGIN) return { read: 'best' };
  if (gap <= READ_CLEAR_GAP) return { read: 'sound' };
  return { read: 'better', betterOption: best.label };
}

/**
 * The part of the record that has to be read BEFORE the resolver runs.
 *
 * The resolver can move the context, so the read is taken against the picture
 * as it stood at the moment of choosing — keeper commit already applied.
 */
export function readBeforeResolution(
  event: InteractiveEvent,
  chosen: ActionOption,
  timeUsed: number,
): Pick<DecisionRecord, 'read' | 'betterOption' | 'keeper'> {
  const { read, betterOption } = readOf(event.context, event.options, chosen);
  const keeper = event.context.goalkeeper;
  return {
    read,
    ...(betterOption ? { betterOption } : {}),
    keeper: {
      commitAt: keeper.commitAt,
      action: keeper.committedAction,
      // The same comparison the engine makes when it applies the commit.
      committedFirst: timeUsed >= keeper.commitAt,
    },
  };
}

/** Assemble the full record once the moment has resolved. */
export function recordDecision(
  event: InteractiveEvent,
  before: ReturnType<typeof readBeforeResolution>,
  decision: {
    option: ActionOption;
    timeUsed: number;
    expired: boolean;
    untimed: boolean;
    instinctReason?: string;
  },
  result: ResolutionResult,
): DecisionRecord {
  return {
    minute: event.minute,
    situation: event.context.situation,
    defending: event.defending,
    chosen: { slot: decision.option.slot, label: decision.option.label, family: decision.option.family },
    expired: decision.expired,
    ...(decision.instinctReason ? { instinctReason: decision.instinctReason } : {}),
    untimed: decision.untimed,
    timeUsed: decision.timeUsed,
    window: event.timer.seconds,
    keeper: before.keeper,
    read: before.read,
    ...(before.betterOption ? { betterOption: before.betterOption } : {}),
    terms: result.breakdown.terms.map((term) => ({ label: term.label, value: term.value })),
    outcome: result.outcome.kind,
  };
}

// ------------------------------------------------------------ reading it ---

/**
 * What each resolution term is, in words, for when it helped and when it hurt.
 *
 * "Decision fit" is left out on purpose: the read line already says whether the
 * choice was right, and saying it twice would make the choice look like the
 * only thing that decides a moment — which is exactly the misconception this
 * review exists to correct. Execution, the keeper and the pressure matter too.
 *
 * The words are comparative because the judgement is (see `whatDecidedIt`).
 */
const TERM_WORDS: Record<string, { helped: string; hurt: string }> = {
  Execution: { helped: 'cleaner execution than usual', hurt: 'scrappier execution than usual' },
  'Chance quality': { helped: 'a better chance than most', hurt: 'a poorer chance than most' },
  Tempo: { helped: 'deciding earlier', hurt: 'deciding later' },
  Goalkeeper: { helped: 'a keeper weaker at this', hurt: 'a keeper stronger at this' },
  'Defensive pressure': { helped: 'more space than usual', hurt: 'more pressure than usual' },
  Reputation: { helped: 'what you are known for', hurt: 'what you are known for' },
};

/** Below this a difference is noise, and naming it would be inventing a reason. */
export const TERM_MATTERED = 0.02;

/** Each term's average over a match, missing terms counted as zero. */
export function termBaseline(records: readonly DecisionRecord[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const record of records) {
    for (const term of record.terms) totals[term.label] = (totals[term.label] ?? 0) + term.value;
  }
  const baseline: Record<string, number> = {};
  for (const [label, total] of Object.entries(totals)) {
    baseline[label] = records.length > 0 ? total / records.length : 0;
  }
  return baseline;
}

/**
 * The term that set this moment apart most in each direction, in words.
 *
 * JUDGED AGAINST THE REST OF THE MATCH, NOT AGAINST ZERO. The first version
 * named the largest raw term, and on a real match it printed "Helped: clean
 * execution · Hurt: the pressure on you" on nine rows out of ten — because a
 * good player's execution is always positive and defensive pressure can only
 * ever subtract. A reason that appears on every row is not a reason, it is
 * the strip this codebase keeps learning the eye skips. Against the match's
 * own average, the line names what was DIFFERENT about this moment: the one
 * he took early, the one where the space closed, the keeper who was good at
 * exactly this.
 *
 * A match of one moment has nothing to compare with, so it names nothing —
 * which is the honest answer.
 */
export function whatDecidedIt(
  record: DecisionRecord,
  baseline: Record<string, number>,
): { helped?: string; hurt?: string } {
  let up: { label: string; value: number } | undefined;
  let down: { label: string; value: number } | undefined;
  const labels = new Set([...record.terms.map((t) => t.label), ...Object.keys(baseline)]);
  for (const label of labels) {
    if (!TERM_WORDS[label]) continue;
    const value = record.terms.find((t) => t.label === label)?.value ?? 0;
    const deviation = value - (baseline[label] ?? 0);
    if (deviation >= TERM_MATTERED && (!up || deviation > up.value)) up = { label, value: deviation };
    if (deviation <= -TERM_MATTERED && (!down || deviation < down.value)) {
      down = { label, value: deviation };
    }
  }
  return {
    ...(up ? { helped: TERM_WORDS[up.label]!.helped } : {}),
    ...(down ? { hurt: TERM_WORDS[down.label]!.hurt } : {}),
  };
}

/** Whether the keeper's commit is part of this moment's story. */
export function keeperMattered(record: DecisionRecord): boolean {
  return !record.defending && (record.chosen.family === 'shot' || record.chosen.family === 'header');
}

export interface DecisionSummary {
  total: number;
  best: number;
  clearMisses: number;
  expired: number;
  /** Shots and headers taken after the keeper had already gone. */
  waitedForKeeper: number;
  keeperMoments: number;
}

export function summariseDecisions(records: readonly DecisionRecord[]): DecisionSummary {
  const keeperMoments = records.filter(keeperMattered);
  return {
    total: records.length,
    best: records.filter((r) => r.read === 'best' && !r.expired).length,
    clearMisses: records.filter((r) => r.read === 'better' && !r.expired).length,
    expired: records.filter((r) => r.expired).length,
    waitedForKeeper: keeperMoments.filter((r) => r.keeper.committedFirst).length,
    keeperMoments: keeperMoments.length,
  };
}
