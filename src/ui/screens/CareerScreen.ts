import { ATTRIBUTE_LABELS } from '../../core/player/attributes.ts';
import type { AttributeKey } from '../../core/player/attributes.ts';
import { currentAbility } from '../../core/player/player.ts';
import { positionLabel } from '../../core/player/positions.ts';
import type { CareerState } from '../../core/career/career.ts';
import { matchesRemaining, nextFixture, seasonComplete } from '../../core/career/career.ts';
import { goalDifference, sortTable } from '../../core/career/league.ts';
import { averageRating } from '../../core/career/seasonStats.ts';
import { getTeam } from '../../data/gameData.ts';

/**
 * CAREER HUB
 *
 * The screen between matches: who you are, how you are developing, where the
 * season stands, and the next fixture. Everything here is read-only — the
 * career state is only ever mutated by the career service.
 */
export class CareerScreen {
  readonly element: HTMLElement;

  constructor(
    private readonly state: CareerState,
    handlers: { onPlay: () => void; onEndSeason: () => void; onQuit: () => void },
  ) {
    this.element = document.createElement('section');
    this.element.className = 'screen career-screen';
    this.element.innerHTML = this.render();

    this.element
      .querySelector<HTMLButtonElement>('#play-match')
      ?.addEventListener('click', handlers.onPlay);
    this.element
      .querySelector<HTMLButtonElement>('#end-season')
      ?.addEventListener('click', handlers.onEndSeason);
    this.element
      .querySelector<HTMLButtonElement>('#quit-career')
      ?.addEventListener('click', handlers.onQuit);
  }

  private render(): string {
    const { player } = this.state;
    const club = getTeam(this.state.clubId);
    const fixture = nextFixture(this.state);
    const done = seasonComplete(this.state);
    const stats = this.state.seasonStats;

    const opponentId = fixture
      ? fixture.homeId === this.state.clubId
        ? fixture.awayId
        : fixture.homeId
      : null;
    const venue = fixture ? (fixture.homeId === this.state.clubId ? 'Home' : 'Away') : '';

    return `
      <header class="career-header">
        <div>
          <h1>${player.name}</h1>
          <p class="career-sub">
            ${positionLabel(player.position)} · age ${player.age} · ${club.name}
            · Season ${this.state.seasonNumber}
          </p>
        </div>
        <div class="career-ability">
          <span class="ability-value">${currentAbility(player)}</span>
          <span class="ability-label">Ability</span>
        </div>
      </header>

      ${this.renderDevelopment()}

      <div class="career-grid">
        <div class="career-card">
          <h2>Next match</h2>
          ${
            done
              ? `<p class="career-done">Season complete — ${this.state.seasonStats.matches} matches played.</p>
                 <button class="primary" id="end-season">End of season review</button>`
              : `<p class="fixture">
                   <strong>${getTeam(opponentId!).name}</strong>
                   <span class="venue">${venue}</span>
                 </p>
                 <p class="hint">${matchesRemaining(this.state)} matches left this season</p>
                 <button class="primary" id="play-match">Play match</button>`
          }
        </div>

        <div class="career-card">
          <h2>Condition</h2>
          <dl class="stat-list">
            <div><dt>Fitness</dt><dd>${Math.round(this.state.fitness)}</dd></div>
            <div><dt>Form</dt><dd>${Math.round(player.form)}</dd></div>
            <div><dt>Morale</dt><dd>${Math.round(player.morale)}</dd></div>
            <div><dt>Experience</dt><dd>${Math.round(player.experience)}</dd></div>
            <div><dt>Reputation</dt><dd>${Math.round(player.reputation)}</dd></div>
          </dl>
        </div>

        <div class="career-card">
          <h2>Season ${this.state.seasonNumber}</h2>
          <dl class="stat-list">
            <div><dt>Matches</dt><dd>${stats.matches}</dd></div>
            <div><dt>Goals</dt><dd>${stats.goals}</dd></div>
            <div><dt>Assists</dt><dd>${stats.assists}</dd></div>
            <div><dt>Key passes</dt><dd>${stats.keyPasses}</dd></div>
            <div><dt>Average rating</dt><dd>${stats.matches ? averageRating(stats).toFixed(2) : '—'}</dd></div>
            <div><dt>Best rating</dt><dd>${stats.bestRating ? stats.bestRating.toFixed(1) : '—'}</dd></div>
          </dl>
        </div>
      </div>

      <div class="career-grid wide">
        <div class="career-card">
          <h2>League table</h2>
          ${this.renderTable()}
        </div>
        <div class="career-card">
          <h2>Key attributes</h2>
          ${this.renderAttributes()}
        </div>
      </div>

      ${this.renderHistory()}

      <button id="quit-career" class="ghost">Leave career</button>`;
  }

  /** Attribute changes from the last match, so progression is visible. */
  private renderDevelopment(): string {
    const changes = this.state.lastDevelopment;
    if (!changes || changes.length === 0) return '';
    // Collapse repeats: an attribute may tick up more than once in a match.
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
        <h2>Development since your last match</h2>
        <ul class="development-list">${items}</ul>
      </div>`;
  }

  private renderTable(): string {
    const rows = sortTable(this.state.table)
      .map((row, index) => {
        const team = getTeam(row.teamId);
        const isPlayer = row.teamId === this.state.clubId;
        const gd = goalDifference(row);
        return `<tr class="${isPlayer ? 'own' : ''}">
            <td>${index + 1}</td>
            <td>${team.shortName}</td>
            <td>${row.played}</td>
            <td>${row.won}</td>
            <td>${row.drawn}</td>
            <td>${row.lost}</td>
            <td>${gd > 0 ? '+' : ''}${gd}</td>
            <td><strong>${row.points}</strong></td>
          </tr>`;
      })
      .join('');
    return `<table class="league-table">
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  private renderAttributes(): string {
    const keys: AttributeKey[] = [
      'awareness',
      'decisionMaking',
      'composure',
      'finishing',
      'technique',
      'passing',
      'dribbling',
      'pace',
    ];
    const rows = keys
      .map((key) => {
        const value = this.state.player.attributes[key];
        return `<div class="attr-row">
            <span class="attr-name">${ATTRIBUTE_LABELS[key]}</span>
            <span class="attr-bar"><i style="width:${value}%"></i></span>
            <span class="attr-value">${value}</span>
          </div>`;
      })
      .join('');
    return `<div class="attr-list">${rows}</div>
      <p class="hint">Awareness, Composure and Decision Making set your decision window.</p>`;
  }

  private renderHistory(): string {
    if (this.state.history.length === 0) return '';
    const rows = this.state.history
      .map(
        (h) =>
          `<tr>
            <td>${h.seasonNumber}</td>
            <td>${getTeam(h.clubId).shortName}</td>
            <td>${h.age}</td>
            <td>${h.position}</td>
            <td>${h.stats.matches}</td>
            <td>${h.stats.goals}</td>
            <td>${h.stats.assists}</td>
            <td>${averageRating(h.stats).toFixed(2)}</td>
          </tr>`,
      )
      .join('');
    return `<div class="career-card">
        <h2>Career history</h2>
        <table class="league-table">
          <thead><tr><th>S</th><th>Club</th><th>Age</th><th>Pos</th><th>Apps</th><th>G</th><th>A</th><th>Rating</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
}
