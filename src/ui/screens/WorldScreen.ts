import type { CareerState } from '../../core/career/career.ts';
import { goalDifference } from '../../core/career/league.ts';
import type { TableRow } from '../../core/career/league.ts';
import { getCountry, playedCountries } from '../../core/career/countries.ts';
import { squadLevel } from '../../core/career/transfers.ts';
import type { Team } from '../../core/team/team.ts';
import { TACTICAL_STYLE_LABELS } from '../../core/team/team.ts';

/**
 * THE WORLD — browsing any league
 *
 * This screen exists because of a bug that was not a crash.
 *
 * When a second division was added, nothing ever showed it. The hub rendered
 * the player's own table and only his own table, and the season review reported
 * only his own club's promotion or relegation. A whole half of the league
 * structure was implemented, tested, wired in — and completely invisible unless
 * you happened to be relegated into it. A player could finish several seasons
 * without ever learning it was there.
 *
 * That is the failure this screen is the answer to, and the lesson generalises:
 * a system the player cannot look at may as well not exist. Eight countries is
 * eight times the opportunity to make the same mistake, so every league in the
 * world is reachable here, whether or not the player has anything to do with it.
 *
 * The tables of leagues the player is not in are recomputed on demand from the
 * career seed rather than stored, so they are always live and always agree with
 * the season that will eventually settle them.
 */
export class WorldScreen {
  readonly element: HTMLElement;
  private selected: string;

  constructor(
    private readonly state: CareerState,
    private readonly deps: {
      /** A league table for any country, at the current point in the season. */
      table: (countryId: string) => TableRow[];
      /** A club as the career currently knows it, drift included. */
      club: (id: string) => Team;
      onBack: () => void;
    },
  ) {
    this.selected = state.countryId;

    this.element = document.createElement('section');
    this.element.className = 'screen world-screen';
    this.render();
  }

  private render(): void {
    const country = getCountry(this.selected);
    const isOwn = this.selected === this.state.countryId;

    this.element.innerHTML = `
      <header class="creator-header">
        <h1>The world</h1>
        <p class="hint">
          Every league, live. The tables of the leagues you are not in are played out alongside
          your own season, so what you see here is where those clubs stand today — not where they
          finished last year.
        </p>
      </header>

      <div class="country-tabs">
        ${playedCountries(this.state.leagues)
          .map((id) => {
            const c = getCountry(id);
            const own = id === this.state.countryId;
            return `<button type="button" class="country-tab${id === this.selected ? ' active' : ''}"
              data-country="${id}">${c.short}${own ? '<em>·</em>' : ''}</button>`;
          })
          .join('')}
      </div>

      <div class="career-card">
        <h2>${country.league}</h2>
        <p class="hint">
          ${country.name} · ${describePrestige(country.prestige)}
          ${isOwn ? ' · you play here' : ''}
        </p>
        ${this.renderTable()}
      </div>

      <button id="world-back" class="ghost">Back to career</button>`;

    for (const tab of this.element.querySelectorAll<HTMLButtonElement>('button[data-country]')) {
      tab.addEventListener('click', () => {
        this.selected = tab.dataset.country!;
        this.render();
      });
    }
    this.element
      .querySelector<HTMLButtonElement>('#world-back')!
      .addEventListener('click', this.deps.onBack);
  }

  private renderTable(): string {
    const table = this.deps.table(this.selected);
    if (table.length === 0) {
      return '<p class="hint">No league on record for this country.</p>';
    }

    const rows = table
      .map((row, index) => {
        const team = this.deps.club(row.teamId);
        const isPlayer = row.teamId === this.state.clubId;
        const gd = goalDifference(row);
        return `<tr class="${isPlayer ? 'own' : ''}">
            <td>${index + 1}</td>
            <td><span class="club-dot" style="background:${team.colour}"></span>${team.name}</td>
            <td class="dim">${TACTICAL_STYLE_LABELS[team.style]}</td>
            <td>${squadLevel(team)}</td>
            <td>${row.played}</td>
            <td>${row.won}</td>
            <td>${row.drawn}</td>
            <td>${row.lost}</td>
            <td>${gd > 0 ? '+' : ''}${gd}</td>
            <td><strong>${row.points}</strong></td>
          </tr>`;
      })
      .join('');

    return `<table class="league-table world-table">
        <thead>
          <tr>
            <th>#</th><th>Club</th><th>Style</th><th>Sq</th>
            <th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
}

/** Prestige as something a footballer would say rather than a number. */
function describePrestige(prestige: number): string {
  if (prestige >= 0.95) return 'One of the leagues everybody watches';
  if (prestige >= 0.85) return 'A major league';
  if (prestige >= 0.7) return 'Well followed';
  if (prestige >= 0.55) return 'Followed at home, less so abroad';
  return 'A quiet league';
}
