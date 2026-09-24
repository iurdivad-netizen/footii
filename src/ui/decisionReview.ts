import { OUTCOME_LABELS, SITUATION_LABELS } from '../core/events/types.ts';
import type { OutcomeKind } from '../core/events/types.ts';
import type { DecisionRecord } from '../core/match/matchState.ts';
import {
  keeperMattered,
  summariseDecisions,
  termBaseline,
  whatDecidedIt,
} from '../simulation/DecisionReview.ts';
import { keeperStatus } from './keeperStatus.ts';

/**
 * YOUR DECISIONS — the full-time review of every moment he was pulled into.
 *
 * A string builder rather than a component, so the full-time screen stays one
 * template and this can be tested without a DOM. What it says, and what it
 * refuses to say, is decided in simulation/DecisionReview.ts; this file only
 * puts it into words.
 *
 * Each row answers four questions in the order a player asks them: what did I
 * do and what came of it, was it the right thing, how long did I take — and
 * for a shot, had the keeper gone yet — and what actually decided it.
 */

/** Same three-way split the match's own outcome banner uses. */
export function outcomeTone(kind: OutcomeKind): 'goal' | 'good' | 'bad' {
  if (kind === 'goal') return 'goal';
  return kind === 'saved' ||
    kind === 'chanceCreated' ||
    kind === 'ballWon' ||
    kind === 'dribbleSuccess' ||
    kind === 'passCompleted' ||
    kind === 'crossCompleted' ||
    kind === 'held'
    ? 'good'
    : 'bad';
}

const seconds = (value: number) => `${value.toFixed(1)}s`;

/** Whether the choice was the right one, in words. */
export function readLine(record: DecisionRecord): string {
  if (record.expired) {
    return `The clock ran out${record.instinctReason ? ` — ${record.instinctReason}` : ''}`;
  }
  if (record.read === 'best') return 'The right read';
  if (record.read === 'sound') return 'A sound read';
  return `A better ball was on: ${record.betterOption ?? 'another option'}`;
}

/** How long he took, against what he had. */
export function timeLine(record: DecisionRecord): string {
  if (record.expired) return `all ${seconds(record.window)}`;
  if (record.untimed) return `${seconds(record.timeUsed)}, no clock`;
  return `${seconds(record.timeUsed)} of ${seconds(record.window)}`;
}

/**
 * Whether the keeper had gone when he chose — the read the match is built on.
 *
 * Only for shots and headers: for a pass in midfield the keeper's commit is a
 * fact about somebody forty yards away, and printing it would teach the player
 * to watch the wrong thing.
 */
export function keeperLine(record: DecisionRecord): string {
  if (!keeperMattered(record)) return '';
  const went = keeperStatus(record.keeper.action).label.toLowerCase();
  return record.keeper.committedFirst
    ? `after the keeper committed — ${went}`
    : `before the keeper committed (${went} at ${seconds(record.keeper.commitAt)})`;
}

export function renderDecisionReview(records: readonly DecisionRecord[]): string {
  if (records.length === 0) return '';

  const summary = summariseDecisions(records);
  const parts = [
    `${summary.total} decision${summary.total === 1 ? '' : 's'}`,
    `${summary.best} right read${summary.best === 1 ? '' : 's'}`,
    summary.clearMisses > 0
      ? `${summary.clearMisses} clear miss${summary.clearMisses === 1 ? '' : 'es'}`
      : '',
    summary.expired > 0
      ? `clock ran out ${summary.expired === 1 ? 'once' : `${summary.expired} times`}`
      : '',
    summary.keeperMoments > 0
      ? `waited for the keeper on ${summary.waitedForKeeper} of ${summary.keeperMoments} shot${summary.keeperMoments === 1 ? '' : 's'}`
      : '',
  ].filter(Boolean);

  const baseline = termBaseline(records);
  const rows = records
    .map((record) => {
      const { helped, hurt } = whatDecidedIt(record, baseline);
      const why = [helped ? `Helped: ${helped}` : '', hurt ? `Hurt: ${hurt}` : '']
        .filter(Boolean)
        .join(' · ');
      const detail = [timeLine(record), keeperLine(record)].filter(Boolean).join(' · ');
      const read = record.expired ? 'expired' : record.read;
      return `<li class="decision read-${read}">
          <span class="decision-minute">${record.minute}'</span>
          <div class="decision-body">
            <p class="decision-head">
              <strong>${record.chosen.label}</strong>
              <span class="decision-situation">${SITUATION_LABELS[record.situation]}</span>
              <span class="decision-outcome tone-${outcomeTone(record.outcome)}">${OUTCOME_LABELS[record.outcome]}</span>
            </p>
            <p class="decision-read">${readLine(record)}</p>
            <p class="decision-detail">${detail}</p>
            ${why ? `<p class="decision-why">${why}</p>` : ''}
          </div>
        </li>`;
    })
    .join('');

  return `<section class="ft-decisions" aria-labelledby="ft-decisions-heading">
      <h2 id="ft-decisions-heading">Your decisions</h2>
      <p class="decision-summary">${parts.join(' · ')}</p>
      <ol class="decision-list">${rows}</ol>
    </section>`;
}
