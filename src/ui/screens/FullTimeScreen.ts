import { passCompletionRate } from '../../core/match/matchStats.ts';
import { matchResult } from '../../core/match/matchState.ts';
import type { MatchEngine } from '../../simulation/MatchEngine.ts';
import type { AttributeChange } from '../../core/career/development.ts';

/**
 * The totals panel shown beside the match statistics.
 *
 * Supplied by the caller rather than read from storage, because career and
 * quick-match totals are two SEPARATE ledgers: a career must show career
 * numbers, and a one-off match must show one-off numbers. Reading a single
 * global record here was showing quick-match totals inside a career.
 */
export interface TotalsView {
  heading: string;
  rows: [string, string][];
}

export interface FullTimeOptions {
  /** Label for the continue button. */
  continueLabel?: string;
  /** Attribute changes earned in this match, shown in career mode. */
  development?: AttributeChange[];
  totals?: TotalsView;
}

/** Full-time summary for both quick matches and career fixtures. */
export class FullTimeScreen {
  readonly element: HTMLElement;

  constructor(engine: MatchEngine, onContinue: () => void, options: FullTimeOptions = {}) {
    const { state } = engine;
    const s = state.stats;
    const rating = engine.rating();
    const result = matchResult(state);
    const verdict = result > 0 ? 'Win' : result < 0 ? 'Defeat' : 'Draw';

    this.element = document.createElement('section');
    this.element.className = 'screen fulltime-screen';
    this.element.innerHTML = `
      <h1>Full time</h1>
      <p class="ft-score">${engine.scoreline()} <span class="verdict ${verdict.toLowerCase()}">${verdict}</span></p>

      <div class="ft-rating">
        <span class="ft-rating-value">${rating.toFixed(1)}</span>
        <span class="ft-rating-label">Match rating</span>
      </div>

      ${renderDevelopment(options.development)}

      <div class="ft-columns">
        <div>
          <h2>This match</h2>
          <dl class="stat-list">
            <div><dt>Goals</dt><dd>${s.goals}</dd></div>
            <div><dt>Assists</dt><dd>${s.assists}</dd></div>
            <div><dt>Shots (on target)</dt><dd>${s.shots} (${s.shotsOnTarget})</dd></div>
            <div><dt>Key passes</dt><dd>${s.keyPasses}</dd></div>
            <div><dt>Dribbles</dt><dd>${s.dribbles}/${s.dribblesAttempted}</dd></div>
            <div><dt>Pass completion</dt><dd>${Math.round(passCompletionRate(s) * 100)}%</dd></div>
            <div><dt>Tackles / interceptions</dt><dd>${s.tackles} / ${s.interceptions}</dd></div>
            <div><dt>Big chances missed</dt><dd>${s.bigChancesMissed}</dd></div>
            <div><dt>Involvements</dt><dd>${s.involvements}</dd></div>
          </dl>
        </div>
        ${
          options.totals
            ? `<div>
                 <h2>${options.totals.heading}</h2>
                 <dl class="stat-list">
                   ${options.totals.rows
                     .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
                     .join('')}
                 </dl>
               </div>`
            : ''
        }
      </div>

      <button class="primary" id="continue">${options.continueLabel ?? 'Continue'}</button>`;

    this.element.querySelector<HTMLButtonElement>('#continue')!.addEventListener('click', onContinue);
  }
}

/** Attribute gains earned in this match — the visible payoff for playing well. */
function renderDevelopment(changes?: AttributeChange[]): string {
  if (!changes || changes.length === 0) return '';
  const merged = new Map<string, { label: string; from: number; to: number }>();
  for (const change of changes) {
    const existing = merged.get(change.attribute);
    if (existing) existing.to = change.to;
    else merged.set(change.attribute, { label: change.label, from: change.from, to: change.to });
  }
  const items = [...merged.values()]
    .map(
      (c) =>
        `<li class="${c.to > c.from ? 'up' : 'down'}">${c.label} ${c.from} → <strong>${c.to}</strong></li>`,
    )
    .join('');
  return `<div class="development-banner">
      <h2>Development</h2>
      <ul class="development-list">${items}</ul>
    </div>`;
}
