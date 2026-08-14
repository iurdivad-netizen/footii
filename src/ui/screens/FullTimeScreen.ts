import { passCompletionRate } from '../../core/match/matchStats.ts';
import { matchResult } from '../../core/match/matchState.ts';
import type { MatchEngine } from '../../simulation/MatchEngine.ts';
import type { CareerRecord } from '../../persistence/storage.ts';

/** Full-time summary, including the running career totals held in localStorage. */
export class FullTimeScreen {
  readonly element: HTMLElement;

  constructor(engine: MatchEngine, career: CareerRecord, onPlayAgain: () => void) {
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
        <div>
          <h2>Career so far</h2>
          <dl class="stat-list">
            <div><dt>Matches</dt><dd>${career.matches}</dd></div>
            <div><dt>Goals</dt><dd>${career.goals}</dd></div>
            <div><dt>Assists</dt><dd>${career.assists}</dd></div>
            <div><dt>Shots</dt><dd>${career.shots}</dd></div>
            <div><dt>Key passes</dt><dd>${career.keyPasses}</dd></div>
            <div><dt>Average rating</dt><dd>${career.matches > 0 ? (career.ratingTotal / career.matches).toFixed(2) : '—'}</dd></div>
            <div><dt>Best rating</dt><dd>${career.bestRating.toFixed(1)}</dd></div>
            <div><dt>Record (W-D-L)</dt><dd>${career.wins}-${career.draws}-${career.defeats}</dd></div>
          </dl>
        </div>
      </div>

      <button class="primary" id="play-again">Play another match</button>`;

    this.element
      .querySelector<HTMLButtonElement>('#play-again')!
      .addEventListener('click', onPlayAgain);
  }
}
