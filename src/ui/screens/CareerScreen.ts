import { ATTRIBUTE_LABELS } from '../../core/player/attributes.ts';
import type { AttributeKey } from '../../core/player/attributes.ts';
import { currentAbility } from '../../core/player/player.ts';
import { positionLabel } from '../../core/player/positions.ts';
import type { CareerState } from '../../core/career/career.ts';
import { matchesRemaining, nextFixture, seasonComplete } from '../../core/career/career.ts';
import { goalDifference, sortTable } from '../../core/career/league.ts';
import { averageRating } from '../../core/career/seasonStats.ts';
import { reputationTier } from '../../core/career/reputation.ts';
import { SQUAD_ROLE_LABELS, marketValue, scoutingInterest } from '../../core/career/transfers.ts';
import type { ClubInterest } from '../../core/career/transfers.ts';
import { describeContract } from '../../core/career/contracts.ts';
import { divisionInfo, divisionOf, divisionPrestige } from '../../core/career/divisions.ts';
import { applyStrength } from '../../core/career/clubDrift.ts';
import { summariseHonours } from '../../core/career/awards.ts';
import type { Team } from '../../core/team/team.ts';
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

  /**
   * A club as this career currently knows it.
   *
   * Ratings drift season by season, so reading them straight from the data file
   * would show a league that stopped existing several summers ago — and would
   * quietly disagree with the market, which uses the drifted values.
   */
  private club(id: string): Team {
    return applyStrength(getTeam(id), this.state.clubStrengths);
  }

  /** Prestige of the division a club is currently in. */
  private prestigeOf(id: string): number {
    return divisionPrestige(divisionOf(this.state.divisions, id) || this.state.division);
  }

  private render(): string {
    const { player } = this.state;
    const club = this.club(this.state.clubId);
    const division = divisionInfo(this.state.division);
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
            · ${division.name} · Season ${this.state.seasonNumber}
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
          </dl>
        </div>

        <div class="career-card">
          <h2>Standing</h2>
          <dl class="stat-list">
            <div><dt>Reputation</dt><dd>${Math.round(player.reputation)}</dd></div>
            <div><dt>Known as</dt><dd>${reputationTier(player.reputation).label}</dd></div>
            <div><dt>Market value</dt><dd>£${marketValue(player)}m</dd></div>
            ${player.caps > 0 ? `<div><dt>Caps</dt><dd>${player.caps}</dd></div>` : ''}
          </dl>
          ${this.renderWatchers()}
        </div>

        ${this.renderContract()}

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
          <h2>${division.name}</h2>
          ${this.renderTable()}
        </div>
        <div class="career-card">
          <h2>Key attributes</h2>
          ${this.renderAttributes()}
        </div>
      </div>

      ${this.renderHonours()}
      ${this.renderHistory()}
      ${this.renderTransfers()}

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
        const team = this.club(row.teamId);
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

  /**
   * Clubs watching but not yet bidding.
   *
   * This is the visible half of the reputation model: interest builds across a
   * season, so a run of goals reads as going somewhere long before the window
   * opens. Without it, an offer in the summer would arrive from nowhere.
   */
  private renderWatchers(): string {
    // Every club in the game, not just this division: the whole point of a
    // pyramid is that a good season down here is watched from up there.
    const watching: ClubInterest[] = scoutingInterest(
      this.state.player,
      this.state.divisions.flat().map((id) => this.club(id)),
      this.state.clubId,
      this.state.seasonStats,
      (id) => this.prestigeOf(id),
    ).slice(0, 3);

    if (watching.length === 0) {
      return `<p class="hint">Nobody is watching you yet. Reputation is built on goals, assists and ratings.</p>`;
    }
    const items = watching
      .map(
        (interest) =>
          `<li>
            <span>${getTeam(interest.clubId).name}
              <em class="watch-division">${divisionInfo(
                divisionOf(this.state.divisions, interest.clubId) || this.state.division,
              ).shortName}</em>
            </span>
            <span class="watch-level">${describeInterest(interest.score)}</span>
          </li>`,
      )
      .join('');
    return `<h3 class="watch-heading">Scouts watching</h3><ul class="watch-list">${items}</ul>`;
  }

  /**
   * The deal you are on.
   *
   * Shown every week rather than only in the summer, because the number that
   * matters is the one counting down: a player in his final season needs to
   * know it now, while there are still matches left to change somebody's mind.
   */
  private renderContract(): string {
    const contract = this.state.contract;
    if (!contract) return '';
    const club = this.club(contract.clubId);
    const final = contract.yearsRemaining <= 1;

    return `
        <div class="career-card${final ? ' contract-final' : ''}">
          <h2>Contract</h2>
          <dl class="stat-list">
            <div><dt>Club</dt><dd>${club.shortName}</dd></div>
            <div><dt>Terms</dt><dd>${describeContract(contract)}</dd></div>
            <div><dt>Role</dt><dd>${SQUAD_ROLE_LABELS[contract.role]}</dd></div>
            <div><dt>Career earnings</dt><dd>£${this.state.careerEarnings}m</dd></div>
          </dl>
          ${
            final
              ? `<p class="hint">Your deal is up at the end of this season. Play well and somebody
                 will offer you another one — play badly and you may be leaving for nothing.</p>`
              : ''
          }
        </div>`;
  }

  /**
   * The honours list.
   *
   * Deliberately the one part of the hub that only ever grows. Ability declines,
   * reputation settles, clubs come and go — a title you won eight seasons ago
   * is still there at 34, and it is the only record the game keeps that a bad
   * year cannot touch.
   */
  private renderHonours(): string {
    const honours = this.state.honours ?? [];
    if (honours.length === 0) return '';

    const summary = summariseHonours(honours)
      .map(
        (entry) =>
          `<li><span>${entry.label}</span>${entry.count > 1 ? `<em>×${entry.count}</em>` : ''}</li>`,
      )
      .join('');

    const recent = [...honours]
      .reverse()
      .slice(0, 6)
      .map(
        (honour) =>
          `<tr>
            <td>${honour.season}</td>
            <td>${getTeam(honour.clubId).shortName}</td>
            <td>${honour.label}</td>
          </tr>`,
      )
      .join('');

    return `<div class="career-card">
        <h2>Honours</h2>
        <ul class="honours-list">${summary}</ul>
        <table class="league-table">
          <thead><tr><th>S</th><th>Club</th><th>Won</th></tr></thead>
          <tbody>${recent}</tbody>
        </table>
      </div>`;
  }

  /** Every move made, so a career reads as a journey rather than a table. */
  private renderTransfers(): string {
    if (this.state.transfers.length === 0) return '';
    const rows = this.state.transfers
      .map(
        (t) =>
          `<tr>
            <td>${t.season}</td>
            <td>${t.age}</td>
            <td>${getTeam(t.fromClubId).shortName} → ${getTeam(t.toClubId).shortName}</td>
            <td>${t.free ? 'Free' : `£${t.fee}m`}</td>
            <td>£${t.wage}k</td>
          </tr>`,
      )
      .join('');
    return `<div class="career-card">
        <h2>Transfers</h2>
        <table class="league-table">
          <thead><tr><th>S</th><th>Age</th><th>Move</th><th>Fee</th><th>Wages</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  private renderHistory(): string {
    if (this.state.history.length === 0) return '';
    const rows = this.state.history
      .map(
        (h) =>
          `<tr>
            <td>${h.seasonNumber}</td>
            <td>${getTeam(h.clubId).shortName}</td>
            <td>${divisionInfo(h.division ?? 1).shortName}</td>
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
          <thead><tr><th>S</th><th>Club</th><th>Div</th><th>Age</th><th>Pos</th><th>Apps</th><th>G</th><th>A</th><th>Rating</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
}

/** Scouting interest as a phrase rather than a probability. */
function describeInterest(score: number): string {
  if (score >= 0.5) return 'Very keen';
  if (score >= 0.36) return 'Ready to bid';
  if (score >= 0.28) return 'Keeping tabs';
  return 'Aware of you';
}
