import type { SeasonRecord } from '../../core/career/career.ts';
import type { SeasonProgress } from '../../core/career/training.ts';
import { averageRating, goalContributions } from '../../core/career/seasonStats.ts';
import { getTeam } from '../../data/gameData.ts';

/** End-of-season summary, shown once the final fixture has been played. */
export class SeasonReviewScreen {
  readonly element: HTMLElement;

  constructor(
    record: SeasonRecord,
    context: {
      champion: string;
      leagueSize: number;
      newAge: number;
      potentialHint: string;
      progress: SeasonProgress;
      /** The season before this one, for a like-for-like comparison. */
      previous?: SeasonRecord;
      trainingPoints: number;
    },
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

      ${renderProgress(context.progress)}
      ${renderComparison(record, context.previous)}

      <button class="primary" id="continue-career">
        ${
          context.trainingPoints > 0
            ? `Pre-season training — ${context.trainingPoints} points`
            : `Start season ${record.seasonNumber + 1}`
        }
      </button>`;

    this.element
      .querySelector<HTMLButtonElement>('#continue-career')!
      .addEventListener('click', onContinue);
  }
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}

/**
 * How the player changed across the season.
 *
 * The decision window is listed first and deliberately given the most weight:
 * ability is an abstraction, but "you now get half a second longer on the ball"
 * is the thing you actually experience in the next match.
 */
function renderProgress(progress: SeasonProgress): string {
  const windowDelta = progress.windowAfter - progress.windowBefore;
  const abilityDelta = progress.abilityAfter - progress.abilityBefore;
  const experienceDelta = Math.round(progress.experienceAfter - progress.experienceBefore);

  const changes = progress.changes
    .map((c) => {
      const delta = c.to - c.from;
      return `<li class="${delta > 0 ? 'up' : 'down'}">
          ${c.label} ${c.from} → <strong>${c.to}</strong>
          <span class="delta">${delta > 0 ? '+' : ''}${delta}</span>
        </li>`;
    })
    .join('');

  return `
    <div class="progress-panel">
      <h2>How you developed</h2>
      <div class="progress-headline">
        <div class="progress-stat ${windowDelta > 0 ? 'good' : windowDelta < 0 ? 'bad' : ''}">
          <span class="progress-value">${progress.windowBefore.toFixed(2)}s → ${progress.windowAfter.toFixed(2)}s</span>
          <span class="progress-label">Decision window in a standard one-on-one</span>
        </div>
        <div class="progress-stat ${abilityDelta > 0 ? 'good' : abilityDelta < 0 ? 'bad' : ''}">
          <span class="progress-value">${progress.abilityBefore} → ${progress.abilityAfter}</span>
          <span class="progress-label">Overall ability</span>
        </div>
        <div class="progress-stat">
          <span class="progress-value">+${experienceDelta}</span>
          <span class="progress-label">Experience</span>
        </div>
      </div>
      ${
        changes
          ? `<ul class="progress-changes">${changes}</ul>`
          : '<p class="hint">No attribute changes this season.</p>'
      }
    </div>`;
}

/** Season-on-season comparison, once there is something to compare against. */
function renderComparison(record: SeasonRecord, previous?: SeasonRecord): string {
  if (!previous) return '';
  const rows: [string, number, number][] = [
    ['Appearances', previous.stats.matches, record.stats.matches],
    ['Goals', previous.stats.goals, record.stats.goals],
    ['Assists', previous.stats.assists, record.stats.assists],
    ['Key passes', previous.stats.keyPasses, record.stats.keyPasses],
    ['Average rating', averageRating(previous.stats), averageRating(record.stats)],
    ['League position', previous.position, record.position],
  ];

  return `
    <div class="career-card">
      <h2>Compared with season ${previous.seasonNumber}</h2>
      <table class="league-table">
        <thead><tr><th></th><th>S${previous.seasonNumber}</th><th>S${record.seasonNumber}</th><th></th></tr></thead>
        <tbody>
          ${rows
            .map(([label, before, after]) => {
              // For league position, lower is better.
              const improved = label === 'League position' ? after < before : after > before;
              const worse = label === 'League position' ? after > before : after < before;
              const arrow = improved ? '▲' : worse ? '▼' : '–';
              return `<tr>
                  <td>${label}</td>
                  <td>${before}</td>
                  <td><strong>${after}</strong></td>
                  <td class="${improved ? 'trend-up' : worse ? 'trend-down' : ''}">${arrow}</td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}
