import { ATTRIBUTE_LABELS } from '../../core/player/attributes.ts';
import { requestStands } from '../../core/career/transferRequest.ts';
import { CONFIDENCE_NEUTRAL, confidenceTier } from '../../core/career/confidence.ts';
import { TRAITS } from '../../core/player/traits.ts';
import type { WeekChoice } from '../../core/career/week.ts';
import { WEEK_DESCRIPTIONS, WEEK_LABELS } from '../../core/career/week.ts';
import type { WeekAhead } from '../../simulation/CareerService.ts';
import type { HubLayout, HubSection } from './hubSections.ts';
import { HUB_SECTION_IDS, HUB_SECTION_LABELS, renderHubFolds, renderHubTabs } from './hubSections.ts';
import { competitionsPeek } from '../hubPeek.ts';
import {
  objectiveAchieved,
  objectiveProgress,
  objectiveSummary,
} from '../../core/career/objective.ts';
import { applyClubPalette } from '../clubColour.ts';
import type { AttributeKey } from '../../core/player/attributes.ts';
import type { CompetitionKind } from '../../core/career/calendar.ts';
import { currentAbility } from '../../core/player/player.ts';
import { positionLabel } from '../../core/player/positions.ts';
import type { CareerState } from '../../core/career/career.ts';
import {
  calendarFor,
  matchesRemaining,
  nextMatch,
  seasonComplete,
} from '../../core/career/career.ts';
import type { ScheduledMatch } from '../../core/career/career.ts';
import type { TeamSheet } from '../../core/career/squad.ts';
import { loanReport } from '../../core/career/loan.ts';
import { CUP_KINDS, cupName, roundName, stillIn, totalRounds } from '../../core/career/cups.ts';
import {
  competitionLabel,
  isEuropean,
  isInternational,
  isSuperCup,
} from '../../core/career/calendar.ts';
import { superCupName } from '../../core/career/superCup.ts';
import { EUROPEAN_GROUP_ROUNDS, EUROPEAN_KNOCKOUT_ROUNDS, europeanWinner } from '../../core/career/europe.ts';
// Aliased: the international module has its own of the same names, for its own
// state shape, and this screen renders both.
import {
  groupIndexOf as europeanGroupIndex,
  groupPositionOf as europeanGroupPosition,
  groupTableOf as europeanGroupTable,
  reachedKnockout as reachedEuropeanKnockout,
} from '../../core/career/groupStage.ts';
import {
  europeanCompetition,
  europeanNameInProse,
  europeanPlaces,
  europeanTierOf,
  placesDescription,
  tierForPosition,
} from '../../core/career/europe.ts';
import { countriesByStanding, createCoefficients } from '../../core/career/coefficients.ts';
import { milestones } from '../../core/career/records.ts';
import {
  KNOCKOUT_ROUNDS,
  tournamentName,
  groupIndexOf,
  groupTable,
  reachedKnockout,
} from '../../core/career/international.ts';
import {
  countryOfNation,
  isSelected,
  nationId,
  nationalTeam,
  selectionGap,
  worldCupPlaces,
} from '../../core/career/nations.ts';
import { goalDifference, sortTable, tablePosition } from '../../core/career/league.ts';
import { averageRating } from '../../core/career/seasonStats.ts';
import { reputationTier } from '../../core/career/reputation.ts';
import { SQUAD_ROLE_LABELS, marketValue, scoutingInterest } from '../../core/career/transfers.ts';
import type { ClubInterest } from '../../core/career/transfers.ts';
import { describeContract } from '../../core/career/contracts.ts';
import {
  allClubIds,
  confederationName,
  confederationOf,
  countryPrestige,
  getCountry,
  leagueMembers,
  leagueName,
  locateClub,
} from '../../core/career/countries.ts';
import { applyStrength } from '../../core/career/clubDrift.ts';
import { honoursInSeason, summariseHonours } from '../../core/career/awards.ts';
import type { Honour } from '../../core/career/awards.ts';
import type { Team } from '../../core/team/team.ts';
import { getTeam } from '../../data/gameData.ts';

/**
 * How many diary lines the hub shows.
 *
 * Twelve rather than the eighty the save keeps: enough to cover the current
 * season and a little before it, which is what somebody between matches is
 * actually looking for. The rest is what the end-of-career screen is for.
 */
const DIARY_LENGTH = 12;

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
    /**
     * The manager's decision for the next fixture.
     *
     * Passed in rather than computed here, because this screen is a renderer:
     * everything on it is read off the career, and selection is a question for
     * the career service. Computing it here would also mean computing it on
     * every redraw, which is exactly the thing the seeded decision exists to
     * avoid.
     */
    private readonly teamSheet: TeamSheet,
    /**
     * The week in front of him: what he may do with it, and what he has already
     * decided. Passed in for the same reason the team sheet is — this screen
     * renders a career, it does not decide one.
     */
    private readonly week: WeekAhead,
    /**
     * How he wants the twelve occasional cards arranged, and which sections he
     * left open. Both come from the saved settings — see hubSections.ts.
     */
    private readonly layout: HubLayout,
    private readonly open: readonly string[],
    handlers: {
      onPlay: () => void;
      onSkip: () => void;
      /** Let the fixture pass: he is injured and the club plays without him. */
      onMiss: () => void;
      onWorld: () => void;
      onEndSeason: () => void;
      onQuit: () => void;
      /** Open the panel where he says what he wants from a move. */
      onPreferences: () => void;
      /** Spend the week before the next fixture. */
      onWeek: (choice: WeekChoice) => void;
      /**
       * He opened or closed a section.
       *
       * Reported rather than stored here, because where it belongs is the
       * settings block — the hub is a renderer, and a preference that lived in
       * a screen would be forgotten the moment the screen was rebuilt, which
       * is after every single match.
       */
      onSections: (open: string[]) => void;
    },
  ) {
    this.element = document.createElement('section');
    this.element.className = 'screen career-screen';
    this.element.innerHTML = this.render();

    // The club's colour, for this screen's subtree only. Set here rather than
    // in the markup because it is three custom properties rather than one
    // style, and because the stylesheet — not this screen — decides what a club
    // colour is allowed to be used for. See ui/clubColour.ts.
    applyClubPalette(this.element, this.club(this.state.clubId).colour);

    this.element
      .querySelector<HTMLButtonElement>('#play-match')
      ?.addEventListener('click', handlers.onPlay);
    this.element
      .querySelector<HTMLButtonElement>('#skip-match')
      ?.addEventListener('click', handlers.onSkip);
    this.element
      .querySelector<HTMLButtonElement>('#miss-match')
      ?.addEventListener('click', handlers.onMiss);
    this.element
      .querySelector<HTMLButtonElement>('#browse-world')
      ?.addEventListener('click', handlers.onWorld);
    this.element
      .querySelector<HTMLButtonElement>('#transfer-preferences')
      ?.addEventListener('click', handlers.onPreferences);
    this.element
      .querySelector<HTMLButtonElement>('#end-season')
      ?.addEventListener('click', handlers.onEndSeason);
    this.element
      .querySelector<HTMLButtonElement>('#quit-career')
      ?.addEventListener('click', handlers.onQuit);
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-week]')) {
      button.addEventListener('click', () => handlers.onWeek(button.dataset.week as WeekChoice));
    }

    // Tabs switch in place rather than re-rendering the hub. Rebuilding the
    // whole screen to show a different panel would scroll the page back to the
    // top and re-run every card's markup, which is a lot of work to look at a
    // contract.
    for (const tab of this.element.querySelectorAll<HTMLButtonElement>('[data-hub-tab]')) {
      tab.addEventListener('click', () => {
        const id = tab.dataset.hubTab!;
        for (const other of this.element.querySelectorAll<HTMLButtonElement>('[data-hub-tab]')) {
          other.setAttribute('aria-selected', String(other === tab));
        }
        for (const panel of this.element.querySelectorAll<HTMLElement>('.hub-panel')) {
          panel.hidden = panel.id !== `hub-panel-${id}`;
        }
        handlers.onSections([id]);
      });
    }

    // Folds report the whole open set, because several can be open at once and
    // the setting has to describe the screen rather than the last click.
    for (const fold of this.element.querySelectorAll<HTMLDetailsElement>('[data-hub-fold]')) {
      fold.addEventListener('toggle', () => {
        const open = [...this.element.querySelectorAll<HTMLDetailsElement>('[data-hub-fold]')]
          .filter((one) => one.open)
          .map((one) => one.dataset.hubFold!);
        handlers.onSections(open);
      });
    }
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

  /**
   * Any side the player might face, club or country.
   *
   * `club` goes through the team data file, which has never heard of a nation —
   * so an international fixture rendered through it throws and takes the hub
   * down with it.
   */
  /**
   * How many weeks this season runs to.
   *
   * Read off the player's OWN calendar rather than from the cap, because a
   * small league finishes inside it — telling somebody it is week 12 of 40 when
   * their season ends in week 30 would misdescribe how much football is left.
   */
  private seasonWeeks(): number {
    return calendarFor(this.state).reduce((last, slot) => Math.max(last, slot.week), 1);
  }

  /**
   * Is there another match for this player in the same week as this one?
   *
   * Worth saying out loud on the card, because it is the only warning he gets
   * that he will go into the next match short of rest — and, unlike everything
   * else on this screen, it is a consequence of a fixture he has not played yet.
   */
  private sharesItsWeek(scheduled: ScheduledMatch): boolean {
    const after = { ...this.state, calendarIndex: scheduled.slotIndex + 1 };
    const next = nextMatch(after);
    return !!next && next.week === scheduled.week;
  }

  private side(id: string): Team {
    const country = countryOfNation(id);
    if (!country) return this.club(id);
    return nationalTeam(
      country,
      leagueMembers(this.state.leagues, country, 1).map((clubId) => this.club(clubId)),
    );
  }

  /** The country a club currently plays in. */
  private countryOf(id: string): string {
    return locateClub(this.state.leagues, id)?.countryId ?? this.state.countryId;
  }

  /** Prestige of the league a club currently plays in. */
  private prestigeOf(id: string): number {
    return countryPrestige(this.countryOf(id));
  }

  private render(): string {
    const { player } = this.state;
    const club = this.club(this.state.clubId);
    const country = getCountry(this.state.countryId);
    const scheduled = nextMatch(this.state);
    const done = seasonComplete(this.state);
    const injury = this.state.injury;
    const sheet = this.teamSheet;
    const venue = scheduled ? (scheduled.home ? 'Home' : 'Away') : '';

    return `
      <header class="career-header">
        <div>
          <h1>${player.name}</h1>
          <p class="career-sub">
            ${positionLabel(player.position)} · age ${player.age}
            · <span class="club-mark" aria-hidden="true"></span>${club.name}
            · ${leagueName(country.id)} · Season ${this.state.seasonNumber}
          </p>
        </div>
        <div class="career-ability">
          <span class="ability-value">${currentAbility(player)}</span>
          <span class="ability-label">Ability</span>
        </div>
      </header>

      ${this.renderLoan()}
      ${this.renderLastResult()}
      ${this.renderChanges()}
      ${this.renderTimeline()}
      ${this.renderMoments()}
      ${this.renderDevelopment()}

      <div class="career-grid pinned">
        <div class="career-card">
          <h2>Next match</h2>
          ${
            done
              ? `<p class="career-done">Season complete — ${this.state.seasonStats.matches} matches played.</p>
                 <button class="primary" id="end-season">End of season review</button>`
              : `<p class="competition-tag ${scheduled!.competition}">
                   ${
                     scheduled!.competition === 'league'
                       ? `${leagueName(country.id)} · round ${scheduled!.round}`
                       : `${this.competitionName(scheduled!.competition)} · ${scheduled!.roundLabel}`
                   }
                 </p>
                 <p class="fixture">
                   <strong>${
                     scheduled!.opponentId
                       ? this.side(scheduled!.opponentId).name
                       : 'Awaiting the draw'
                   }</strong>
                   <span class="venue">${venue}</span>
                 </p>
                 <p class="hint">
                   Week ${scheduled!.week} of ${this.seasonWeeks()} ·
                   ${matchesRemaining(this.state)} matches left this season${
                     this.sharesItsWeek(scheduled!)
                       ? ' · <strong class="congested">a second match this week</strong>'
                       : ''
                   }
                 </p>
                 ${
                   injury
                     ? `<p class="injury-out">
                          <strong>${injury.label}</strong> — ${injury.weeksRemaining}
                          ${injury.weeksRemaining === 1 ? 'week' : 'weeks'} out.
                          The club plays this one without you.
                        </p>
                        <button class="primary" id="miss-match">Watch from the stand</button>`
                     : !sheet.selected
                       ? `<p class="benched">
                            <strong>Left out.</strong> ${sheet.note}
                          </p>
                          <button class="primary" id="miss-match">Watch from the bench</button>`
                       : `${sheet.note ? `<p class="team-sheet">${sheet.note}</p>` : ''}
                          <button class="primary" id="play-match">Play match</button>
                          <button class="ghost skip-match" id="skip-match">Skip — let him play it</button>`
                 }`
          }
        </div>

        ${this.renderWeek()}
      </div>

      ${this.renderStrip()}
      ${this.renderSections()}

      <button id="quit-career" class="ghost">Leave career</button>`;
  }

  /**
   * What happened in the last match.
   *
   * Exists for skipping. A played match ends on a full-time report; a skipped
   * one returns straight here, so without this the season would advance in
   * silence and you would have no idea whether you had scored.
   */
  private renderLastResult(): string {
    const last = this.state.lastResult;
    if (!last) return '';

    // A knockout settled from the spot has a verdict its scoreline does not
    // show: 1-1 is the same line whether you went through or went out.
    const verdict = last.shootout
      ? last.shootout.won
        ? 'win'
        : 'loss'
      : last.goalsFor > last.goalsAgainst
        ? 'win'
        : last.goalsFor < last.goalsAgainst
          ? 'loss'
          : 'draw';
    const contributions = [
      last.goals > 0 ? `${last.goals} goal${last.goals === 1 ? '' : 's'}` : '',
      last.assists > 0 ? `${last.assists} assist${last.assists === 1 ? '' : 's'}` : '',
    ].filter(Boolean);

    return `<div class="last-result ${verdict}">
        <span class="last-result-score">
          ${last.goalsFor}–${last.goalsAgainst}
        </span>
        <span class="last-result-detail">
          ${competitionLabel(last.competition ?? 'league')} ·
          ${last.home ? 'v' : 'away to'} ${this.side(last.opponentId).name}${
            // A match he was not in has no rating and no contributions to
            // report. Printing "rated 0.0" would read as a performance rather
            // than as an absence.
            last.missed
              ? ' · you were injured'
              : ` · rated ${last.rating.toFixed(1)}${contributions.length ? ` · ${contributions.join(', ')}` : ''}`
          }
        </span>
        ${
          last.shootout
            ? `<span class="last-result-tag pens">
                 ${last.shootout.won ? 'Won' : 'Lost'} on pens
                 ${last.shootout.scored}-${last.shootout.conceded}
               </span>`
            : ''
        }
        ${last.skipped ? '<span class="last-result-tag">Skipped</span>' : ''}
        ${last.missed ? '<span class="last-result-tag missed">Missed</span>' : ''}
      </div>`;
  }

  /**
   * The loan he is away on, if he is.
   *
   * Above everything else on the screen, because it changes what every other
   * card on it means: the club in the header is not the club that owns him, and
   * the season he is playing belongs to somebody else's league.
   */
  private renderLoan(): string {
    const loan = this.state.loan;
    if (!loan) return '';
    return `<div class="loan-banner">
        <strong>On loan</strong> — ${loanReport(loan)} Back in the summer.
      </div>`;
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
  /**
   * WHERE HE STANDS, AS A ROW OF CHIPS
   *
   * This was two cards — Condition and Standing — holding eleven numbers
   * between them, and both were among the emptiest panels on the hub: a
   * six-row list in a card sized by whatever happened to be beside it. As
   * chips they are one line, they read left to right rather than as two
   * columns to compare, and the two emptiest panels stop existing.
   *
   * The manager keeps his own chip and his own colour, because he is the one
   * value here that is a judgement rather than a measurement.
   */
  private renderStrip(): string {
    const { player } = this.state;
    const injury = this.state.injury;
    // In words rather than as a figure, deliberately. The number beside
    // `Morale` is what the confidence feature exists to stop being — a stat the
    // player watches move and can do nothing with — so what he is shown is the
    // band and not the arithmetic. See core/career/confidence.ts.
    const manager = confidenceTier(this.state.confidence ?? CONFIDENCE_NEUTRAL);
    const trusted = (this.state.confidence ?? CONFIDENCE_NEUTRAL) >= 58;

    const chip = (label: string, value: string, tone = '') =>
      `<span class="hub-chip ${tone}"><i>${label}</i><b>${value}</b></span>`;

    return `
      <div class="hub-strip">
        ${chip('Fitness', String(Math.round(this.state.fitness)), this.state.fitness < 70 ? 'warn' : 'good')}
        ${injury ? chip('Injured', `${injury.label} · ${injury.weeksRemaining}w`, 'warn') : ''}
        ${chip('Form', String(Math.round(player.form)))}
        ${chip('Morale', String(Math.round(player.morale)))}
        ${chip('Manager', manager.label, trusted ? 'good' : 'warn')}
        ${this.state.rival ? chip('Competing with', `${this.state.rival.name} · ${this.state.rival.ability}`) : ''}
        ${chip('Reputation', `${Math.round(player.reputation)} · ${reputationTier(player.reputation).label}`)}
        ${chip('Value', `£${marketValue(player)}m`)}
        ${player.caps > 0 ? chip('Caps', String(player.caps)) : ''}
      </div>`;
  }

  /**
   * The twelve cards nobody needs every week, in whichever shape he chose.
   *
   * The DIVISION lives in ui/screens/hubSections.ts and is shared by both
   * layouts; only the presentation differs here. Sections that would be empty
   * are dropped rather than rendered as a heading with nothing under it — a
   * first-season career has no honours, no transfers and no history, and three
   * empty folds would be a worse hub than the one this replaced.
   */
  private renderSections(): string {
    const sections = this.sections().filter((section) => section.html.trim().length > 0);
    if (sections.length === 0) return '';
    const laid =
      this.layout === 'folds'
        ? `<div class="hub-folds">${renderHubFolds(sections, this.open)}</div>`
        : renderHubTabs(sections, this.open);
    return laid + this.renderStillToCome(sections);
  }

  /**
   * WHAT IS NOT ON THE HUB YET, AND WILL BE.
   *
   * Empty sections are dropped — a first-season career has no honours, no
   * transfers and no history, and three empty folds would be a worse hub than
   * the one the sections replaced. That decision is right and this does not
   * reverse it.
   *
   * What it fixes is the consequence nobody had accounted for: a career on its
   * first day shows THREE sections where the manual describes four, and nothing
   * anywhere says the fourth is coming. The player cannot tell an empty career
   * from a broken screen, and the one reading he can make unaided — that this
   * is all there is — is the wrong one.
   *
   * ONE LINE, and it names the sections rather than reassuring in general. "It
   * fills up as you play" is the sort of sentence that could be written without
   * looking at the career; naming Career specifically is a fact about this one.
   *
   * IT REMOVES ITSELF. Once every section has something in it the line has
   * nothing left to promise, and a hub that permanently explained itself would
   * be a hub with a permanent apology on it.
   */
  private renderStillToCome(shown: readonly HubSection[]): string {
    const present = new Set(shown.map((section) => section.id));
    const missing = HUB_SECTION_IDS.filter((id) => !present.has(id));
    if (missing.length === 0) return '';

    const names = missing.map((id) => HUB_SECTION_LABELS[id]);
    const list =
      names.length === 1
        ? names[0]!
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;

    return `
      <p class="hub-still-to-come">
        ${list} ${names.length === 1 ? 'appears' : 'appear'} here once there is something to put
        in ${names.length === 1 ? 'it' : 'them'} — honours you win, clubs you move to, seasons you
        finish.
      </p>`;
  }

  private sections(): HubSection[] {
    const { player } = this.state;
    const stats = this.state.seasonStats;
    const country = getCountry(this.state.countryId);
    const traits = player.traits ?? [];
    const honours = this.state.honours ?? [];
    const position = tablePosition(this.state.table, this.state.clubId);

    const card = (title: string, body: string) =>
      `<div class="career-card"><h2>${title}</h2>${body}</div>`;

    return [
      {
        id: 'you',
        label: HUB_SECTION_LABELS.you,
        peek: [
          traits.length > 0 ? `${traits.length} trait${traits.length === 1 ? '' : 's'}` : '',
          stats.matches > 0 ? `${stats.matches} apps · ${averageRating(stats).toFixed(2)}` : 'no apps yet',
        ]
          .filter(Boolean)
          .join(' · '),
        html: `<div class="career-grid">
          ${this.renderTraits()}
          ${card(
            `Season ${this.state.seasonNumber}`,
            `<dl class="stat-list">
              <div><dt>Matches</dt><dd>${stats.matches}</dd></div>
              <div><dt>Goals</dt><dd>${stats.goals}</dd></div>
              <div><dt>Assists</dt><dd>${stats.assists}</dd></div>
              <div><dt>Key passes</dt><dd>${stats.keyPasses}</dd></div>
              <div><dt>Average rating</dt><dd>${stats.matches ? averageRating(stats).toFixed(2) : '—'}</dd></div>
              <div><dt>Best rating</dt><dd>${stats.bestRating ? stats.bestRating.toFixed(1) : '—'}</dd></div>
            </dl>`,
          )}
          ${card('Key attributes', this.renderAttributes())}
          ${this.renderRecords()}
        </div>`,
      },
      {
        id: 'club',
        label: HUB_SECTION_LABELS.club,
        peek: [
          // The demand leads, because it is the one line on this tab that can
          // change what he does this week rather than merely describe him.
          this.state.objective
            ? objectiveSummary(this.state.objective, this.state.seasonStats)
            : '',
          position > 0 ? `${ordinal(position)} in the league` : '',
          `${this.state.contract.yearsRemaining} yr${this.state.contract.yearsRemaining === 1 ? '' : 's'} left`,
        ]
          .filter(Boolean)
          .join(' · '),
        html: `<div class="career-grid">
          ${this.renderObjective()}
          ${this.renderContract()}
          ${card('Scouts and standing', this.renderWatchers() || '<p class="hint">Nobody is watching you yet.</p>')}
          ${card(
            leagueName(country.id),
            `${this.renderTable()}
             <button class="ghost" id="browse-world">Other leagues around the world</button>
             <button class="ghost" id="transfer-preferences">${preferenceLabel(this.state)}</button>`,
          )}
        </div>`,
      },
      {
        id: 'competitions',
        label: HUB_SECTION_LABELS.competitions,
        peek: competitionsPeek({
          cups: this.state.cups,
          clubId: this.state.clubId,
          countryId: this.state.countryId,
          europe: this.state.europe,
        }),
        html: `<div class="career-grid">
          ${this.renderCups()}
          ${this.renderEurope()}
          ${this.renderNation()}
        </div>`,
      },
      {
        id: 'career',
        label: HUB_SECTION_LABELS.career,
        peek: [
          honours.length > 0 ? `${honours.length} honour${honours.length === 1 ? '' : 's'}` : '',
          this.state.transfers.length > 0
            ? `${this.state.transfers.length} move${this.state.transfers.length === 1 ? '' : 's'}`
            : '',
          this.state.history.length > 0 ? `${this.state.history.length} seasons` : '',
          // Last, and only when there is nothing else to say. A first-season
          // career has a diary and no honours, no moves and no history, so
          // without this its Career tab would peek as an empty string — which
          // is the one thing the peek exists to prevent.
          honours.length === 0 && this.state.transfers.length === 0 && this.state.history.length === 0
            ? `${(this.state.moments ?? []).length} moment${(this.state.moments ?? []).length === 1 ? '' : 's'}`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        html: `${this.renderDiary()}${this.renderHonours()}${this.renderHistory()}${this.renderTransfers()}`,
      },
    ];
  }


  /**
   * WHAT THE LAST MATCH CHANGED.
   *
   * Directly under the scoreline, because it is the rest of the sentence the
   * scoreline started. The hub used to redraw with a dozen numbers in new
   * positions and nothing saying which had moved.
   *
   * ABSENT MOST WEEKS, and that is the feature rather than a gap in it — the
   * model only speaks when something crossed a line the player can act on. A
   * strip that appeared every week would train the eye to skip the week it
   * mattered. See core/career/matchReport.ts for which lines those are.
   */
  private renderChanges(): string {
    const changes = this.state.lastChanges ?? [];
    if (changes.length === 0) return '';
    const items = changes
      .map((change) => `<li class="change-${change.tone}">${change.text}</li>`)
      .join('');
    // A live region for the same reason the moments are one: this appears
    // because a match resolved, not because anything was pressed.
    return `<ul class="change-strip" role="status" aria-live="polite">${items}</ul>`;
  }

  /**
   * THE SEASON SO FAR, AS A SHAPE.
   *
   * The hub could say what happened last Saturday and nothing about the shape
   * of the year around it — a run of four wins and a run of four defeats looked
   * identical from here, which is most of what a season feels like.
   *
   * One dot per match, oldest first, in the order they were played. Colour
   * carries the result and a title carries the detail, but neither is the only
   * channel: the dot's LETTER says the same thing, so the strip works without
   * colour. That is the rule the action families already follow.
   *
   * A missed match gets its own mark rather than being left out. An absence is
   * exactly the thing a timeline should show — dropping it would draw a season
   * that looks continuous when it was not.
   */
  private renderTimeline(): string {
    const played = this.state.seasonResults ?? [];
    if (played.length === 0) return '';

    const dots = played
      .map((match) => {
        const won = match.shootout
          ? match.shootout.won
          : match.goalsFor > match.goalsAgainst;
        const lost = match.shootout
          ? !match.shootout.won
          : match.goalsFor < match.goalsAgainst;
        const kind = match.missed ? 'missed' : won ? 'win' : lost ? 'loss' : 'draw';
        const letter = match.missed ? '·' : won ? 'W' : lost ? 'L' : 'D';
        const label =
          `${competitionLabel(match.competition ?? 'league')} ` +
          `${match.home ? 'v' : 'away to'} ${this.side(match.opponentId).shortName} ` +
          `${match.goalsFor}–${match.goalsAgainst}` +
          (match.missed ? ' (missed)' : match.goals > 0 ? ` (${match.goals})` : '');
        return `<li class="tl-${kind}" title="${label}"><span aria-hidden="true">${letter}</span><span class="visually-hidden">${label}</span>${
          // A goal is marked on the dot itself: scanning for the afternoons he
          // scored is the single most likely reason to look at this strip.
          match.goals > 0 ? `<i class="tl-scored" aria-hidden="true"></i>` : ''
        }</li>`;
      })
      .join('');

    const next = nextMatch(this.state);
    const upcoming = next
      ? `<li class="tl-next" title="Next: ${this.side(next.opponentId).shortName}"><span aria-hidden="true">→</span><span class="visually-hidden">Next match</span></li>`
      : '';

    return `
      <div class="season-timeline">
        <h2 class="visually-hidden">Your season so far</h2>
        <ol class="tl-dots">${dots}${upcoming}</ol>
      </div>`;
  }

  /**
   * What was worth remarking on about the last match.
   *
   * Above the development report and below the score, which is where it belongs
   * chronologically: this is the part of the match somebody would tell you
   * about. Absent entirely on an ordinary afternoon, which is most of them —
   * a strip that appeared every week would train the eye to skip the one week
   * it said something.
   */
  private renderMoments(): string {
    const moments = this.state.lastMoments ?? [];
    if (moments.length === 0) return '';
    const lines = moments
      .map(
        (moment) =>
          `<li class="moment moment-${moment.kind}">${moment.text}</li>`,
      )
      .join('');
    // A live region, because it appears after a match resolves rather than in
    // response to anything the player just pressed — the one thing on this hub
    // that arrives unannounced.
    return `<div class="moments-banner" role="status" aria-live="polite"><ul>${lines}</ul></div>`;
  }

  /**
   * What he is known for.
   *
   * The description rather than the mechanic, because the mechanic is supposed
   * to be felt in the match rather than read on the hub — and because a list of
   * modifiers would turn a record of the career into a character sheet.
   */
  private renderTraits(): string {
    const traits = this.state.player.traits ?? [];
    if (traits.length === 0) return '';
    const items = traits
      .map((id) => {
        const trait = TRAITS[id];
        if (!trait) return '';
        return `<li>
          <span class="trait-name">${trait.label}${trait.doubleEdged ? ' <em>cuts both ways</em>' : ''}</span>
          <span class="trait-note">${trait.description}</span>
        </li>`;
      })
      .join('');
    return `
      <div class="career-card">
        <h2>Known for</h2>
        <ul class="trait-list">${items}</ul>
      </div>`;
  }

  /**
   * The week before the next fixture.
   *
   * Rendered as four buttons and then, once one is pressed, as what it did —
   * never as both. A choice that stayed on screen after being made would invite
   * the player to press another one, and the whole weight of this decision is
   * that there is one of it.
   */
  private renderWeek(): string {
    if (seasonComplete(this.state)) return '';
    if (!this.week.options) {
      return `
        <div class="career-card week-card">
          <h2>The week</h2>
          <p class="week-idle">${this.week.reason}</p>
        </div>`;
    }

    if (this.week.plan) {
      return `
        <div class="career-card week-card">
          <h2>The week</h2>
          <p class="week-spent">
            <strong>${WEEK_LABELS[this.week.plan.choice]}.</strong>
            ${this.week.plan.note}
          </p>
        </div>`;
    }

    const buttons = this.week.options
      .map(
        ({ choice, available, reason }) => `
          <button class="week-option" data-week="${choice}" ${available ? '' : 'disabled'}>
            <span class="week-option-label">${WEEK_LABELS[choice]}</span>
            <span class="week-option-note">
              ${available ? WEEK_DESCRIPTIONS[choice] : reason}
            </span>
          </button>`,
      )
      .join('');

    return `
      <div class="career-card week-card">
        <h2>The week</h2>
        <p class="hint">Seven days before this one. You get one of them.</p>
        <div class="week-options">${buttons}</div>
      </div>`;
  }

  private renderWatchers(): string {
    // Every club in the game, not just this division: the whole point of a
    // pyramid is that a good season down here is watched from up there.
    const watching: ClubInterest[] = scoutingInterest(
      this.state.player,
      allClubIds(this.state.leagues).map((id: string) => this.club(id)),
      this.state.clubId,
      this.state.seasonStats,
      (id) => this.prestigeOf(id),
      (id) => this.countryOf(id),
    ).slice(0, 3);

    if (watching.length === 0) {
      return `<p class="hint">Nobody is watching you yet. Reputation is built on goals, assists and ratings.</p>`;
    }
    const items = watching
      .map((interest) => {
        // Which competition the club is in THIS season. A club watching you
        // from the Champions League is a different proposition to one watching
        // from mid-table, and the difference was invisible until it was said.
        const tier = europeanTierOf(this.state.europeanEntries ?? {}, interest.clubId);
        return `<li>
            <span>${getTeam(interest.clubId).name}
              <em class="watch-division">${getCountry(
                this.countryOf(interest.clubId),
              ).short}</em>
              ${tier ? `<em class="watch-europe">${europeanCompetition(tier).short}</em>` : ''}
            </span>
            <span class="watch-level">${describeInterest(interest.score)}</span>
          </li>`;
      })
      .join('');
    return `<h3 class="watch-heading">Scouts watching</h3><ul class="watch-list">${items}</ul>`;
  }

  /** What a competition is called, wherever it is played. */
  private competitionName(competition: CompetitionKind): string {
    if (competition === 'league') return leagueName(this.state.countryId);
    if (isSuperCup(competition)) return superCupName(this.state.countryId);
    if (isInternational(competition)) return getCountry(this.state.player.nationality).name;
    if (isEuropean(competition)) return europeanCompetition(competition).name;
    return cupName(competition, this.state.countryId);
  }

  /**
   * The international season: whether he is in the squad, and how his country
   * is doing whether he is or not.
   *
   * The not-picked case is the one that matters. A player outside the squad
   * needs to know EXACTLY how far outside — "four points of reputation away" is
   * something to play for, and "not in the squad" is only an absence. His
   * country plays the tournament either way, and watching it without him is the
   * point of the competition existing.
   */
  private renderNation(): string {
    const international = this.state.international;
    const nation = getCountry(this.state.player.nationality);
    const me = nationId(this.state.player.nationality);
    const selected = isSelected(this.state.player);
    const gap = selectionGap(this.state.player);

    const standing = groupIndexOf(international, me);
    // Not every country is in the tournament: it holds eight and the world has
    // twelve. Saying so plainly matters more than the table would — without it
    // a player whose reputation clears the bar simply never gets a fixture and
    // is left to work out why on his own.
    const competition = tournamentName(
      international.kind ?? 'continental',
      confederationOf(this.state.player.nationality),
    );
    // Not qualifying is the ordinary case for most of the world in a World Cup
    // year, and it has to read as football rather than as an empty card. How
    // FAR outside is the part worth saying: a nation two places off its
    // confederation's quota has something to play for.
    const missedOut =
      standing === -1
        ? `<p class="hint">
             ${nation.name} did not qualify for ${competition.replace(/^The /, 'the ')}.
             ${confederationName(confederationOf(this.state.player.nationality))} has
             ${worldCupPlaces(confederationOf(this.state.player.nationality))} places, filled by
             its highest-standing nations — so it is finishing above its neighbours that gets
             ${nation.name} there, not finishing above the world.
           </p>`
        : '';
    const tier = '';
    const table =
      standing === -1
        ? ''
        : `<table class="league-table">
            <thead><tr><th>#</th><th>Nation</th><th>P</th><th>Pts</th></tr></thead>
            <tbody>${groupTable(international, standing)
              .map(
                (row, index) => `<tr class="${row.teamId === me ? 'own' : ''}">
                    <td>${index + 1}</td>
                    <td>${getCountry(countryOfNation(row.teamId) ?? '').name}</td>
                    <td>${row.played}</td>
                    <td>${row.points}</td>
                  </tr>`,
              )
              .join('')}</tbody>
          </table>`;

    const knockout = international.knockout;
    let run = '';
    if (knockout) {
      // Three different absences, and they are not the same sentence: never
      // qualified, knocked out of the tournament, and beaten to the trophy by
      // somebody else. Reading survivors alone conflates the first two, and a
      // nation that lost a semi-final was told it went out in the group stage.
      const qualified = reachedKnockout(international, me);
      if (knockout.winnerId === me) run = '<strong>Champions.</strong>';
      else if (!qualified) run = 'Out at the group stage.';
      else if (knockout.eliminatedInRound !== null) {
        run = `Out in the ${roundName(knockout.eliminatedInRound, international.knockoutRounds ?? KNOCKOUT_ROUNDS).toLowerCase()}.`;
      } else if (knockout.winnerId) {
        run = `Won by ${getCountry(countryOfNation(knockout.winnerId) ?? '').name}.`;
      } else {
        run = `Through to the ${roundName(knockout.rounds.length || 1, international.knockoutRounds ?? KNOCKOUT_ROUNDS).toLowerCase()}.`;
      }
    }

    const status = selected
      ? `<p class="hint">You are in the ${nation.name} squad.</p>`
      : `<p class="hint">Not in the ${nation.name} squad — ${gap} more reputation and you are.</p>`;

    // What the shirt is worth to the country, not just to him. A tournament run
    // moves the nation up the European order, and that is the one way a career
    // changes football beyond its own club — worth saying on the card where the
    // tournament lives rather than only in the world browser.
    const order = countriesByStanding(this.state.coefficients ?? createCoefficients());
    const rank = order.indexOf(this.state.player.nationality);
    const places = europeanPlaces(this.state.player.nationality, order);
    const worth =
      rank === -1
        ? ''
        : `<p class="hint">${ordinal(rank + 1)} in the European order, so ${nation.name} sends
             ${places.championsLeague} to the Champions League and ${places.europaLeague} to the
             Europa League. How this side does decides that.</p>`;

    return `
      <div class="career-card">
        <h2>${nation.name} <em class="own-tag">${competition}</em></h2>
        ${status}
        ${missedOut}
        ${tier}
        ${table}
        ${run ? `<p class="hint">${run}</p>` : ''}
        ${worth}
      </div>`;
  }

  /**
   * The European run, and — when there is not one — what it would take to get
   * there.
   *
   * The second half matters more than the first. A club outside Europe needs to
   * know that finishing fourth instead of fifth is worth a season of European
   * football, because that is the whole reason a mid-table league position is
   * worth caring about at all.
   */
  private renderEurope(): string {
    const europe = this.state.europe;
    const position = tablePosition(this.state.table, this.state.clubId);

    if (!europe) {
      // Before a ball is kicked the table is every club on nothing, so a
      // position read off it is an artefact of the ordering rather than form.
      // Say what the places ARE instead of pretending to project a season.
      const played = this.state.table.find((row) => row.teamId === this.state.clubId)?.played ?? 0;
      const order = countriesByStanding(this.state.coefficients ?? createCoefficients());
      const target = tierForPosition(this.state.countryId, Math.max(1, position), order);
      const hint =
        played === 0
          ? placesDescription(this.state.countryId, order)
          : target
            ? `On current form you would qualify for ${europeanNameInProse(target)} next season.`
            : `Finish higher, or win a cup, and you are in Europe next season.`;
      return `
        <div class="career-card">
          <h2>Europe</h2>
          <p class="hint">Not in Europe this season. ${hint}</p>
        </div>`;
    }

    const competition = europeanCompetition(europe.kind);
    const knockout = europe.knockout;
    const rounds = EUROPEAN_KNOCKOUT_ROUNDS;
    const reached = knockout?.rounds.length ?? 0;
    const group = europeanGroupIndex(europe, this.state.clubId);
    const table = group === -1 ? [] : europeanGroupTable(europe, group);
    const winnerId = europeanWinner(europe);

    // The survivor count is shown for as long as the competition is running,
    // whether or not he is still in it. It used to be hidden the moment he went
    // out, because back then the rest of it was not played until the season was
    // resolved and the number would sit frozen at whatever it was on the night
    // he lost. The competition now plays on round by round, so the count is live
    // again — and watching it come down to the club that knocked you out is a
    // better answer to "how did that end" than silence.
    let status: string;
    let tone = '';
    if (winnerId === this.state.clubId) {
      status = 'Champions of Europe';
      tone = 'won';
    } else if (knockout?.eliminatedInRound != null) {
      status = `Out in the ${roundName(knockout.eliminatedInRound, rounds).toLowerCase()}`;
      tone = 'out';
    } else if (europe.groupRoundsPlayed < EUROPEAN_GROUP_ROUNDS) {
      // Still in the group, where the standing IS the story: going out here is
      // finishing third over three matches rather than losing one night.
      const place = europeanGroupPosition(europe, this.state.clubId);
      status =
        europe.groupRoundsPlayed === 0
          ? 'Group stage to come'
          : `${ordinal(place)} in the group, ${europe.groupRoundsPlayed} of ${EUROPEAN_GROUP_ROUNDS} played`;
      tone = place > 0 && place <= 2 ? 'alive' : '';
    } else if (!reachedEuropeanKnockout(europe, this.state.clubId)) {
      status = 'Out in the group stage';
      tone = 'out';
    } else if (reached === 0) {
      status = 'Through to the knockout';
      tone = 'alive';
    } else {
      status = `In the ${roundName(reached, rounds).toLowerCase()}`;
      tone = 'alive';
    }

    return `
        <div class="career-card european-card">
          <h2>${competition.name}</h2>
          <dl class="stat-list">
            <div class="cup-row ${tone}"><dt>Progress</dt><dd>${status}</dd></div>
            ${
              winnerId
                ? `<div><dt>Won by</dt><dd>${getTeam(winnerId).name}</dd></div>`
                : knockout
                  ? `<div><dt>Clubs</dt><dd>${knockout.survivors.length} still in</dd></div>`
                  : ''
            }
          </dl>
          ${
            table.length > 0 && !knockout
              ? `<table class="league-table group-table">
                   <thead><tr><th>Group</th><th>P</th><th>Pts</th></tr></thead>
                   <tbody>
                     ${table
                       .map(
                         (row) =>
                           `<tr class="${row.teamId === this.state.clubId ? 'own' : ''}">
                              <td>${getTeam(row.teamId).shortName}</td>
                              <td>${row.played}</td>
                              <td>${row.points}</td>
                            </tr>`,
                       )
                       .join('')}
                   </tbody>
                 </table>
                 <p class="hint">Top two go through.</p>`
              : `<p class="hint">
                   Sixteen clubs, four groups, then a bracket. Seen by more people than your league.
                 </p>`
          }
        </div>`;
  }

  /**
   * How the two knockouts are going.
   *
   * A cup run is the only part of a season that can end abruptly, so it needs
   * showing while it is still alive rather than only in the review — the whole
   * point of a knockout is knowing, before you play, that this is the one that
   * could finish it.
   */
  private renderCups(): string {
    const cups = this.state.cups;
    if (!cups) return '';

    const rows = CUP_KINDS.map((kind) => {
      const cup = cups[kind];
      if (!cup) return '';
      const rounds = totalRounds(cup);
      const reached = cup.rounds.length;

      let status: string;
      let tone = '';
      if (cup.winnerId === this.state.clubId) {
        status = 'Won it';
        tone = 'won';
      } else if (cup.eliminatedInRound !== null) {
        // The cup carries on without him on its own dates, so by the end of the
        // season it has a winner — and who beat you to it is the other half of
        // "we went out in the quarter-final".
        const lifted = cup.winnerId ? ` · won by ${getTeam(cup.winnerId).name}` : '';
        status = `Out in the ${roundName(cup.eliminatedInRound, rounds).toLowerCase()}${lifted}`;
        tone = 'out';
      } else if (!stillIn(cup, this.state.clubId)) {
        status = 'Not involved';
        tone = 'out';
      } else if (reached === 0) {
        status = 'Not started';
      } else {
        status = `In the ${roundName(reached, rounds).toLowerCase()}`;
        tone = 'alive';
      }

      return `<div class="cup-row ${tone}">
          <dt>${cupName(kind, this.state.countryId)}</dt>
          <dd>${status}</dd>
        </div>`;
    }).join('');

    return `
        <div class="career-card">
          <h2>Cups</h2>
          <dl class="stat-list">${rows}</dl>
        </div>`;
  }

  /**
   * The deal you are on.
   *
   * Shown every week rather than only in the summer, because the number that
   * matters is the one counting down: a player in his final season needs to
   * know it now, while there are still matches left to change somebody's mind.
   */
  /**
   * WHAT HE WAS ASKED FOR, AND HOW FAR ALONG HE IS.
   *
   * The manager's confidence has been on this hub for a while and it has always
   * been a verdict without a question: a tier label that moved for reasons the
   * player could watch but never read. This is the question — said in August,
   * visible all season, settled in the summer.
   *
   * TWO BARS RATHER THAN ONE, because the two halves fail differently and the
   * difference is the useful part: not being picked and not delivering are
   * separate problems with separate answers, and a single blended percentage
   * would hide which one he has. See core/career/objective.ts.
   *
   * The bars are `--accent`, not `--club`. This is progress, which is a thing
   * the interface says about YOU; the club colour is identity and says only
   * which club is asking. Mixing them is the exact confusion the palette note
   * at the top of style.css exists to prevent.
   */
  private renderObjective(): string {
    const objective = this.state.objective;
    if (!objective) return '';

    const stats = this.state.seasonStats;
    const progress = objectiveProgress(objective, stats);
    const contributions = stats.goals + stats.assists;
    const done = objectiveAchieved(objective, stats);

    const bar = (label: string, have: number, want: number, share: number) => `
      <div class="objective-line${have >= want ? ' met' : ''}">
        <div class="objective-head">
          <span>${label}</span>
          <span class="objective-count">${have}<span class="objective-of"> / ${want}</span></span>
        </div>
        <div class="objective-track" role="img" aria-label="${have} of ${want} ${label.toLowerCase()}">
          <span class="objective-fill" style="width: ${(share * 100).toFixed(1)}%"></span>
        </div>
      </div>`;

    return `
      <div class="career-card objective-card${done ? ' objective-done' : ''}">
        <h2>What he wants this season</h2>
        <p class="objective-brief">${objective.brief}</p>
        ${bar('Appearances', stats.matches, objective.appearances, progress.appearances)}
        ${bar('Goals and assists', contributions, objective.contributions, progress.contributions)}
        ${
          done
            ? `<p class="objective-verdict">Done — everything from here is on top of what he asked for.</p>`
            : ''
        }
      </div>`;
  }

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
  /**
   * THE CAREER IN ITS OWN WORDS, WHILE IT IS STILL BEING PLAYED.
   *
   * The moment log has been accumulating since moments existed — `state.moments`
   * holds the last eighty things worth remarking on — and until now the only
   * place it could be READ in full was the end-of-career screen and the summer
   * news. So the game wrote a diary the player was shown once, after it was too
   * late to be the person in it.
   *
   * That is the whole of this card: the same log, on the hub, newest first.
   * Nothing new is recorded and nothing is computed — if this had needed a new
   * counter it would have been the mistake the moments file warns about, where
   * a career already in progress gets an empty feature.
   *
   * NEWEST FIRST, which is the opposite of the end screen. The orders are
   * different because the questions are: a finished career is read from the
   * beginning as a story, and a live one is checked from the top for what just
   * happened. `careerRecord.ts` keeps its own order for its own reason.
   *
   * TWELVE, not eighty. Enough to cover the season you are in and a little
   * before it; the rest is what the end screen is for. A card that scrolled for
   * a page would be a section of its own rather than a card in one.
   */
  private renderDiary(): string {
    const moments = this.state.moments ?? [];
    if (moments.length === 0) return '';

    const shown = [...moments].reverse().slice(0, DIARY_LENGTH);
    const items = shown
      .map(
        (moment) =>
          `<li class="moment-${moment.kind}"><span class="moment-season">S${moment.season}</span> ${moment.text}</li>`,
      )
      .join('');

    // Said only when there is more, and phrased as a fact about this card
    // rather than about the save: the older ones are still on the end screen,
    // and only the ones past MOMENT_LIMIT have actually gone.
    const more =
      moments.length > DIARY_LENGTH
        ? `<p class="hint">The ${moments.length - DIARY_LENGTH} before these are kept for the end of your career.</p>`
        : '';

    return `
      <div class="career-card">
        <h2>Your career so far</h2>
        <ul class="moment-log">${items}</ul>
        ${more}
      </div>`;
  }

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

  /**
   * The record book.
   *
   * Totals cannot say what kind of footballer somebody was — two players with
   * the same goals are different players if one of them scored three in a match
   * eleven times. These are the peaks and the runs, and nothing here can be
   * recomputed from a season's statistics afterwards.
   */
  private renderRecords(): string {
    // `records` is required on the career and filled by the migration, so a
    // save that reaches here always has one; an empty book is the real case,
    // and it means a career that has not yet done anything worth listing.
    const list = milestones(this.state.records);
    if (list.length === 0) return '';

    const cells = list
      .map(
        (entry) => `<div class="record-tile">
            <span class="record-value">${entry.value}</span>
            <span class="record-label">${entry.label}</span>
            <span class="record-note">${entry.note}</span>
          </div>`,
      )
      .join('');

    return `<div class="career-card">
        <h2>Records</h2>
        <div class="record-grid">${cells}</div>
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

  /**
   * Every season, and everything it won.
   *
   * The last column used to be a 🏆 or a 🥈 and nothing more, so a season that
   * took the league, the double and a European trophy read identically to one
   * that scraped a minor cup — and a golden boot did not appear at all. The
   * honours list already held all of it, labelled in the country's own words.
   */
  private renderHistory(): string {
    if (this.state.history.length === 0) return '';
    const honours = this.state.honours ?? [];
    const rows = this.state.history
      .map(
        (h) =>
          `<tr>
            <td>${h.seasonNumber}</td>
            <td>${getTeam(h.clubId).shortName}</td>
            <td>${getCountry(h.countryId ?? this.state.countryId).short}</td>
            <td>${h.age}</td>
            <td>${h.position}</td>
            <td>${h.stats.matches}</td>
            <td>${h.stats.goals}</td>
            <td>${h.stats.assists}</td>
            <td>${averageRating(h.stats).toFixed(2)}</td>
            <td>${renderSeasonHonours(honours, h.seasonNumber)}</td>
          </tr>`,
      )
      .join('');
    return `<div class="career-card">
        <h2>Career history</h2>
        <table class="league-table">
          <thead><tr><th>S</th><th>Club</th><th>Div</th><th>Age</th><th>Pos</th><th>Apps</th><th>G</th><th>A</th><th>Rating</th><th>Won</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
}

/**
 * One season's honours, as badges for a table cell.
 *
 * Shared with the end screen, which shows the same history for a career that
 * has stopped. The `title` attribute carries the honour's own one-line detail,
 * so a badge that has to be short is still readable in full on hover.
 */
export function renderSeasonHonours(honours: readonly Honour[], season: number): string {
  const won = honoursInSeason(honours, season);
  if (won.length === 0) return '<span class="season-honours-none">—</span>';
  return `<span class="season-honours">${won
    .map(
      (entry) =>
        `<em class="season-honour ${entry.tone}" title="${entry.detail}">${entry.label}</em>`,
    )
    .join('')}</span>`;
}

/**
 * What the button says about the position he has taken.
 *
 * The label carries the state rather than a badge beside it, because this is
 * the only place in the hub where a setting has consequences somebody could
 * forget having chosen — a summer in which nobody bids should never be a
 * mystery.
 */
function preferenceLabel(state: CareerState): string {
  const preferences = state.preferences;
  if (!preferences) return 'What you want from a move';
  // Said first and on its own, because it is the only one of these that is
  // costing him something every week it stands. A player being left out should
  // never have to open a screen to find out why.
  if (requestStands(state.transferRequest, state.clubId)) {
    return 'You have asked to leave — take it back';
  }
  if (preferences.settled) return 'Not looking to move — change that';
  const stated =
    preferences.favoured.length +
    preferences.refused.length +
    (preferences.standing !== 'any' ? 1 : 0) +
    (preferences.european ? 1 : 0);
  return stated > 0
    ? `What you want from a move · ${stated} stated`
    : 'What you want from a move';
}

/** Scouting interest as a phrase rather than a probability. */
function describeInterest(score: number): string {
  if (score >= 0.5) return 'Very keen';
  if (score >= 0.36) return 'Ready to bid';
  if (score >= 0.28) return 'Keeping tabs';
  return 'Aware of you';
}

/** "1st", "2nd" — the European order reads as a placing, not an index. */
function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}
