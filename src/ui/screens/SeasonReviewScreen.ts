import type { SeasonRecord } from '../../core/career/career.ts';
import { averageRating, goalContributions } from '../../core/career/seasonStats.ts';
import { getTeam } from '../../data/gameData.ts';

/** End-of-season summary, shown once the final fixture has been played. */
export class SeasonReviewScreen {
  readonly element: HTMLElement;

  constructor(
    record: SeasonRecord,
    context: { champion: string; leagueSize: number; newAge: number; potentialHint: string },
    onContinue: () => void,
  ) {
    const stats = record.stats;
    const club = getTeam(record.clubId);
    const champion = getTeam(context.champion);
    const won = context.champion === record.clubId;

    this.element = document.createElement('section');
    this.element.className = 'screen fulltime-screen';
    this.element.innerHTML = `
      <h1>Season ${record.seasonNumber} review</h1>
      <p class="ft-score">
        ${club.name} finished <strong>${ordinal(record.position)}</strong> of ${context.leagueSize}
        ${won ? '<span class="verdict win">Champions</span>' : ''}
      </p>
      ${won ? '' : `<p class="hint">${champion.name} won the league.</p>`}

      <div class="ft-rating">
        <span class="ft-rating-value">${stats.matches ? averageRating(stats).toFixed(2) : '—'}</span>
        <span class="ft-rating-label">Average rating</span>
      </div>

      <div class="ft-columns">
        <div>
          <h2>Your season</h2>
          <dl class="stat-list">
            <div><dt>Appearances</dt><dd>${stats.matches}</dd></div>
            <div><dt>Goals</dt><dd>${stats.goals}</dd></div>
            <div><dt>Assists</dt><dd>${stats.assists}</dd></div>
            <div><dt>Goal contributions</dt><dd>${goalContributions(stats)}</dd></div>
            <div><dt>Key passes</dt><dd>${stats.keyPasses}</dd></div>
            <div><dt>Shots (on target)</dt><dd>${stats.shots} (${stats.shotsOnTarget})</dd></div>
            <div><dt>Best rating</dt><dd>${stats.bestRating ? stats.bestRating.toFixed(1) : '—'}</dd></div>
            <div><dt>Big chances missed</dt><dd>${stats.bigChancesMissed}</dd></div>
          </dl>
        </div>
        <div>
          <h2>Club record</h2>
          <dl class="stat-list">
            <div><dt>Won</dt><dd>${stats.wins}</dd></div>
            <div><dt>Drawn</dt><dd>${stats.draws}</dd></div>
            <div><dt>Lost</dt><dd>${stats.defeats}</dd></div>
            <div><dt>Tackles / int.</dt><dd>${stats.tackles} / ${stats.interceptions}</dd></div>
            <div><dt>Dribbles</dt><dd>${stats.dribbles}/${stats.dribblesAttempted}</dd></div>
            <div><dt>Age next season</dt><dd>${context.newAge}</dd></div>
          </dl>
          <p class="hint">${context.potentialHint}</p>
        </div>
      </div>

      <button class="primary" id="continue-career">Start season ${record.seasonNumber + 1}</button>`;

    this.element
      .querySelector<HTMLButtonElement>('#continue-career')!
      .addEventListener('click', onContinue);
  }
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}
