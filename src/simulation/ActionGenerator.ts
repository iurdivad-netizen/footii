import type { Rng } from '../core/rng.ts';
import type { ActionOption, SituationContext } from '../core/events/types.ts';
import { getAction } from '../data/actionCatalogue.ts';
import type { CandidateAction, SituationTemplate } from '../data/situations.ts';

/**
 * ACTION GENERATOR
 *
 * Turns a situation into exactly six numbered options.
 *
 * Ranking rules, in order:
 *   1. Candidates whose `available` predicate fails are dropped.
 *   2. `guaranteed` candidates are always included (each situation keeps its
 *      characteristic choices — the chip and the round-the-keeper in a 1v1 —
 *      plus at least one low-risk out, so there is always a "safe" answer).
 *   3. Remaining slots go to the highest scoring candidates, where
 *        score = contextual fit * template weight * small random jitter.
 *      The jitter matters: it means the same situation does not always offer
 *      an identical menu, so the player must actually read the options.
 *   4. The final six are shuffled into slots 1-6 by a stable, seeded shuffle
 *      so that muscle memory cannot substitute for reading the situation.
 *
 * NOTE: fit is used for RANKING only. It is never shown to the player as a
 * probability — design principle 28 (the player must never know the odds).
 */

export const OPTION_COUNT = 6;

interface ScoredCandidate {
  candidate: CandidateAction;
  fit: number;
  score: number;
}

export function generateActions(
  rng: Rng,
  context: SituationContext,
  template: SituationTemplate,
): ActionOption[] {
  const available = template.candidates.filter(
    (candidate) => candidate.available?.(context) !== false,
  );

  const scored: ScoredCandidate[] = available.map((candidate) => {
    const definition = getAction(candidate.kind);
    const fit = definition.fit(context);
    const weight = candidate.weight ?? 1;
    // Jitter is multiplicative and modest: it reorders near-equal options
    // without ever promoting a genuinely poor option above a strong one.
    const jitter = rng.range(0.85, 1.15);
    return { candidate, fit, score: (0.25 + fit) * weight * jitter };
  });

  const chosen: ScoredCandidate[] = [];
  const remaining: ScoredCandidate[] = [];

  for (const entry of scored) {
    if (entry.candidate.guaranteed && chosen.length < OPTION_COUNT) chosen.push(entry);
    else remaining.push(entry);
  }

  remaining.sort((a, b) => b.score - a.score);
  for (const entry of remaining) {
    if (chosen.length >= OPTION_COUNT) break;
    chosen.push(entry);
  }

  if (chosen.length < OPTION_COUNT) {
    throw new Error(
      `Situation "${template.type}" produced only ${chosen.length} options; templates must always be able to fill ${OPTION_COUNT} slots.`,
    );
  }

  return rng.shuffle(chosen).map((entry, index) => {
    const definition = getAction(entry.candidate.kind);
    return {
      slot: index + 1,
      kind: definition.kind,
      label: entry.candidate.label?.(context) ?? definition.label,
      family: definition.family,
      generationFit: entry.fit,
    } satisfies ActionOption;
  });
}
