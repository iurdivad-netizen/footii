import type { CareerState } from '../../core/career/career.ts';
import { goalDifference } from '../../core/career/league.ts';
import type { TableRow } from '../../core/career/league.ts';
import {
  confederationOf,
  getCountry,
  leagueName,
  playedCountries,
} from '../../core/career/countries.ts';
import { squadLevel } from '../../core/career/transfers.ts';
import type { Team } from '../../core/team/team.ts';
import { TACTICAL_STYLE_LABELS } from '../../core/team/team.ts';
import { CUP_KINDS, cupName, roundName, totalRounds } from '../../core/career/cups.ts';
import type { CupKind, CupState } from '../../core/career/cups.ts';
import {
  EUROPEAN_TIERS,
  europeanCompetition,
  europeanPlaces,
  placesDescription,
} from '../../core/career/europe.ts';
import type { EuropeanTier } from '../../core/career/europe.ts';
import {
  COEFFICIENT_WINDOW,
  countriesByStanding,
  createCoefficients,
  standingsTable,
} from '../../core/career/coefficients.ts';
import { countryOfNation, nationId } from '../../core/career/nations.ts';
import {
  GROUP_ROUNDS,
  KNOCKOUT_ROUNDS,
  groupTable,
  nationGroups,
  tournamentName,
} from '../../core/career/international.ts';

/**
 * THE WORLD — browsing every competition there is
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
 * That is the failure this screen is the answer to, and the lesson generalises
 * — which is exactly how it was learned a second time. Four competitions were
 * added after this screen was written: two domestic cups per country, three
 * European competitions and an international tournament. This screen showed
 * league tables and nothing else, so of the five competitions in the world, one
 * was browsable. The bracket a cup is actually about — who else is in it, who
 * you might meet, which of the big clubs went out on a Tuesday night — was
 * state the game held and never once drew.
 *
 * So the world is now browsed by COMPETITION as well as by country:
 *
 *   LEAGUES        every country's table, live.
 *   CUPS           both knockouts in any country, drawn as far as the season
 *                  has got.
 *   EUROPE         all three competitions, including the two the player's club
 *                  did not qualify for — those are the ones he is playing to
 *                  reach, so they are exactly the ones worth being able to see.
 *   INTERNATIONAL  both groups and the bracket, whether or not he is in the
 *                  squad.
 *
 * Everything the player is not himself part of is recomputed on demand from the
 * career seed rather than stored, so it is always live and can never disagree
 * with the season that will eventually settle it.
 */

/** Which competition the browser is showing. */
type View = 'leagues' | 'cups' | 'europe' | 'international';

const VIEW_LABELS: Record<View, string> = {
  leagues: 'Leagues',
  cups: 'Cups',
  europe: 'Europe',
  international: 'International',
};

export interface WorldScreenDeps {
  /** A league table for any country, at the current point in the season. */
  table: (countryId: string) => TableRow[];
  /** A club as the career currently knows it, drift included. */
  club: (id: string) => Team;
  /** A country's cup as it stands today, or null if it has none. */
  cup: (countryId: string, kind: CupKind) => CupState<CupKind> | null;
  /** One European competition as it stands today, or null before anyone has qualified. */
  europe: (tier: EuropeanTier) => CupState<EuropeanTier> | null;
  onBack: () => void;
}

export class WorldScreen {
  readonly element: HTMLElement;
  private selected: string;
  private view: View = 'leagues';

  constructor(
    private readonly state: CareerState,
    private readonly deps: WorldScreenDeps,
  ) {
    this.selected = state.countryId;

    this.element = document.createElement('section');
    this.element.className = 'screen world-screen';
    this.render();
  }

  /**
   * The European order as it currently stands, best first.
   *
   * Earned from the international tournament rather than fixed — see
   * core/career/coefficients.ts — so every number this screen quotes about
   * European places has to be read off it rather than off prestige.
   */
  private get order(): string[] {
    return countriesByStanding(this.state.coefficients ?? createCoefficients());
  }

  /** Country tabs steer the leagues and the cups; the rest are worldwide. */
  private get byCountry(): boolean {
    return this.view === 'leagues' || this.view === 'cups';
  }

  private render(): void {
    this.element.innerHTML = `
      <header class="creator-header">
        <h1>The world</h1>
        <p class="hint">${HINTS[this.view]}</p>
      </header>

      <div class="view-tabs">
        ${(Object.keys(VIEW_LABELS) as View[])
          .map(
            (view) => `<button type="button" class="view-tab${view === this.view ? ' active' : ''}"
              data-view="${view}">${VIEW_LABELS[view]}</button>`,
          )
          .join('')}
      </div>

      ${this.byCountry ? this.renderCountryTabs() : ''}
      ${this.renderView()}

      <button id="world-back" class="ghost">Back to career</button>`;

    for (const tab of this.element.querySelectorAll<HTMLButtonElement>('button[data-view]')) {
      tab.addEventListener('click', () => {
        this.view = tab.dataset.view as View;
        this.render();
      });
    }
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

  private renderCountryTabs(): string {
    return `
      <div class="country-tabs">
        ${playedCountries(this.state.leagues)
          .map((id) => {
            const c = getCountry(id);
            const own = id === this.state.countryId;
            return `<button type="button" class="country-tab${id === this.selected ? ' active' : ''}"
              data-country="${id}">${c.short}${own ? '<em>·</em>' : ''}</button>`;
          })
          .join('')}
      </div>`;
  }

  private renderView(): string {
    if (this.view === 'leagues') return this.renderLeague();
    if (this.view === 'cups') return this.renderCups();
    if (this.view === 'europe') return this.renderEurope();
    return this.renderInternational();
  }

  // ------------------------------------------------------------- leagues ---

  private renderLeague(): string {
    const country = getCountry(this.selected);
    const isOwn = this.selected === this.state.countryId;
    return `
      <div class="career-card">
        <h2>${leagueName(country.id)}</h2>
        <p class="hint">
          ${country.name} · ${describePrestige(country.prestige)}
          ${isOwn ? ' · you play here' : ''}
        </p>
        ${this.renderTable()}
      </div>`;
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

  // ---------------------------------------------------------------- cups ---

  private renderCups(): string {
    return CUP_KINDS.map((kind) => {
      const cup = this.deps.cup(this.selected, kind);
      return `
        <div class="career-card">
          <h2>${cupName(kind, this.selected)}</h2>
          ${
            cup
              ? this.renderBracket(cup, (id) => this.deps.club(id).name)
              : '<p class="hint">No cup on record for this country.</p>'
          }
        </div>`;
    }).join('');
  }

  // -------------------------------------------------------------- europe ---

  private renderEurope(): string {
    const cards = EUROPEAN_TIERS.map((tier) => {
      const competition = europeanCompetition(tier);
      const cup = this.deps.europe(tier);
      const mine = this.state.europe?.kind === tier;
      return `
        <div class="career-card${mine ? ' european-card' : ''}">
          <h2>${competition.name}${mine ? ' <em class="own-tag">your competition</em>' : ''}</h2>
          ${
            cup
              ? this.renderBracket(cup, (id) => this.deps.club(id).name)
              : `<p class="hint">Not being played this season — nobody has qualified yet.</p>`
          }
        </div>`;
    }).join('');

    return `
      <p class="hint world-note">${placesDescription(this.state.countryId, this.order)}</p>
      ${cards}`;
  }

  // ------------------------------------------------------- international ---

  private renderInternational(): string {
    const international = this.state.international;
    const me = nationId(this.state.player.nationality);
    const nationName = (id: string) => getCountry(countryOfNation(id) ?? '').name;

    const groups = Array.from({ length: nationGroups(international).length }, (_, group) => {
      const rows = groupTable(international, group);
      const body = rows
        .map(
          (row, index) => `<tr class="${row.teamId === me ? 'own' : ''}">
              <td>${index + 1}</td>
              <td>${nationName(row.teamId)}</td>
              <td>${row.played}</td>
              <td>${row.won}</td>
              <td>${row.drawn}</td>
              <td>${row.lost}</td>
              <td><strong>${row.points}</strong></td>
            </tr>`,
        )
        .join('');
      return `
        <div class="career-card">
          <h2>Group ${String.fromCharCode(65 + group)}</h2>
          <table class="league-table">
            <thead><tr><th>#</th><th>Nation</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>`;
    }).join('');

    // Nations that have not kicked a ball yet still deserve naming: the draw is
    // known from the start of the season and is half of what a group stage is.
    const drawn = nationGroups(international)
      .map(
        (group, index) =>
          `Group ${String.fromCharCode(65 + index)}: ${group.map(nationName).join(', ')}`,
      )
      .join(' · ');

    const knockout = international.knockout;
    const bracket = knockout
      ? this.renderBracket(knockout, nationName, international.knockoutRounds ?? KNOCKOUT_ROUNDS)
      : `<p class="hint">The top two of each group reach the ${roundName(
          1,
          international.knockoutRounds ?? KNOCKOUT_ROUNDS,
        ).toLowerCase()}s. ${
          international.groupRoundsPlayed >= GROUP_ROUNDS
            ? 'The bracket is about to be drawn.'
            : `${GROUP_ROUNDS - international.groupRoundsPlayed} group round${
                GROUP_ROUNDS - international.groupRoundsPlayed === 1 ? '' : 's'
              } still to play.`
        }</p>`;

    const competition = tournamentName(
      international.kind ?? 'continental',
      confederationOf(this.state.player.nationality),
    );

    return `
      <h2 class="world-heading">${competition}</h2>
      <p class="hint world-note">${drawn}</p>
      <div class="career-grid">${groups}</div>
      <div class="career-card">
        <h2>Knockout</h2>
        ${bracket}
      </div>
      ${this.renderStandings()}`;
  }

  /**
   * What the tournament is FOR, beyond the trophy.
   *
   * The international competition used to change nothing outside the player's
   * own honours list: five matches a year that the world forgot by August. It
   * now decides how many clubs each country sends to each European competition,
   * and this table is where that becomes something you can look at. Without it
   * the mechanic would be the third system in this game to be implemented,
   * tested and invisible.
   */
  private renderStandings(): string {
    const rows = standingsTable(this.state.coefficients ?? createCoefficients())
      .map((row, index) => {
        const country = getCountry(row.countryId);
        const places = europeanPlaces(row.countryId, this.order);
        const home = row.countryId === this.state.player.nationality;
        const playsHere = row.countryId === this.state.countryId;
        const nudge = row.nudge === 0 ? '—' : `${row.nudge > 0 ? '+' : ''}${row.nudge.toFixed(2)}`;
        return `<tr class="${home || playsHere ? 'own' : ''}">
            <td>${index + 1}</td>
            <td>${country.name}${home ? '<em class="own-tag">yours</em>' : ''}</td>
            <td>${row.seasons === 0 ? '—' : row.clubs.toFixed(2)}</td>
            <td>${nationCell(row)}</td>
            <td class="dim">${nudge}</td>
            <td><strong>${places.championsLeague}</strong></td>
            <td>${places.europaLeague}</td>
            <td>${places.conferenceLeague}</td>
          </tr>`;
      })
      .join('');

    return `
      <div class="career-card">
        <h2>European places</h2>
        <p class="hint">
          How well a country's football has been going decides how many clubs it sends to each
          European competition, over the last ${COEFFICIENT_WINDOW} seasons. <strong>Clubs</strong>
          is what its clubs averaged in Europe, per club it entered — so a country is measured on
          how its clubs did, not on how many it sent. <strong>Nation</strong> is what its national
          side averaged per tournament. The two together move a country up or down the order it
          started in, weighted toward the clubs as football weights them. Climbing does not send
          more clubs to Europe; it sends the same number to better competitions.
        </p>
        <table class="league-table">
          <thead>
            <tr>
              <th>#</th><th>Country</th><th>Clubs</th><th>Nation</th><th>Move</th>
              <th>UCL</th><th>UEL</th><th>UECL</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ------------------------------------------------------------- bracket ---

  /**
   * A knockout as far as it has been played.
   *
   * Rounds that have not been drawn are simply absent rather than blank: a
   * bracket showing four empty rounds in September implies the draw exists and
   * is being withheld, when in fact a cup tie has no opponent until the round
   * before it has finished. That is a fact about cups worth showing rather than
   * hiding.
   */
  private renderBracket(
    cup: CupState<string>,
    name: (id: string) => string,
    rounds = totalRounds(cup),
  ): string {
    if (cup.rounds.length === 0) {
      return `<p class="hint">Not drawn yet — ${cup.survivors.length} clubs will enter.</p>`;
    }

    const columns = cup.rounds
      .map((round) => {
        const ties = round.ties
          .map((tie) => {
            const involved = tie.homeId === this.state.clubId || tie.awayId === this.state.clubId;
            const score =
              tie.homeGoals === undefined
                ? '<span class="tie-score dim">v</span>'
                : `<span class="tie-score">${tie.homeGoals}–${tie.awayGoals}</span>`;
            const shootout = tie.penalties ? '<em class="tie-pens">pens</em>' : '';
            const side = (id: string) =>
              `<span class="${tie.winnerId === id ? 'tie-through' : 'tie-out'}">${name(id)}</span>`;
            return `<li class="${involved ? 'own' : ''}">
                ${side(tie.homeId)}${score}${side(tie.awayId)}${shootout}
              </li>`;
          })
          .join('');
        return `
          <div class="bracket-round">
            <h3>${roundName(round.round, rounds)}</h3>
            <ul class="bracket-ties">${ties}</ul>
          </div>`;
      })
      .join('');

    const winner = cup.winnerId
      ? `<p class="bracket-winner"><strong>${name(cup.winnerId)}</strong> lifted it.</p>`
      : `<p class="hint">${cup.survivors.length} still in.</p>`;

    return `<div class="bracket">${columns}</div>${winner}`;
  }
}

/** What each view is for, said once at the top rather than repeated per card. */
const HINTS: Record<View, string> = {
  leagues:
    'Every league, live. The tables of the leagues you are not in are played out alongside your ' +
    'own season, so what you see here is where those clubs stand today — not where they finished ' +
    'last year.',
  cups:
    'Both knockouts in every country, drawn as far as the season has got. An open draw: the two ' +
    'best clubs in a country can meet in the first round, and often do.',
  europe:
    'All three competitions, including the two your club did not qualify for — those are the ones ' +
    'a season is played to reach.',
  international:
    'The tournament, whether or not you are in the squad. A World Cup in odd seasons and your own ' +
    "confederation's championship in even ones — groups of four, then the top two of each cross " +
    'into the knockout.',
};

/**
 * What a country's national record reads as.
 *
 * Three different things, and conflating the last two was a small lie: a season
 * one world shows "—" because nothing has been played anywhere yet, while a
 * country that has been missing tournaments shows "out". Both were "out" until
 * this, which told a player in his first September that England had failed to
 * qualify for something.
 */
function nationCell(row: { seasons: number; tournaments: number; nations: number }): string {
  if (row.seasons === 0) return '—';
  if (row.tournaments === 0) return '<em class="dim">out</em>';
  return row.nations.toFixed(2);
}

/** Prestige as something a footballer would say rather than a number. */
function describePrestige(prestige: number): string {
  if (prestige >= 0.95) return 'One of the leagues everybody watches';
  if (prestige >= 0.85) return 'A major league';
  if (prestige >= 0.7) return 'Well followed';
  if (prestige >= 0.55) return 'Followed at home, less so abroad';
  return 'A quiet league';
}
