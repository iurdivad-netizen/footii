import type { Player } from '../../core/player/player.ts';
import type { Team } from '../../core/team/team.ts';
import { TACTICAL_STYLE_LABELS } from '../../core/team/team.ts';
import { getCountry, leagueName } from '../../core/career/countries.ts';
import { clubStanding, reachOf, trialRequirement } from '../../core/career/trial.ts';
import type { ClubStanding } from '../../core/career/trial.ts';
import { squadLevel } from '../../core/career/transfers.ts';
import { clubPalette } from '../clubColour.ts';

/**
 * WHERE THE CAREER BEGINS, AS SOMETHING YOU CAN ACTUALLY READ
 *
 * Choosing a club was a `<select>` with 192 options in it. On a phone it
 * truncated mid-word; on a desktop it was a scrolling column of names. And it
 * withheld everything the game already knew: `core/career/trial.ts` works out
 * for every single club whether it would sign you, trial you or not look at
 * you, and the dropdown compressed that into three `<optgroup>` headings and a
 * disabled attribute. The league, the strength of the squad, what kind of
 * football they play — all of it was in the data and none of it was on the
 * screen, at the one moment it decides the next fifteen years.
 *
 * WHY COUNTRY IS THE TOP LEVEL, and this was measured rather than assumed. The
 * obvious structure is by band — sign you / trial / out of reach — and it turns
 * out to organise almost nothing: a young prospect has 108 clubs that would
 * sign him and 66 that would trial him, so "reachable" is 174 of 192 and the
 * band separates nothing. What actually divides the world is the twelve
 * countries, sixteen clubs each. So the country comes first, the band is a
 * badge on each card, and the question the screen asks is the one a footballer
 * would ask: where do you want to play.
 *
 * SORTED BY THE STRENGTH OF THE SQUAD, strongest first. That is the ladder the
 * dropdown hid completely — clubs were in data-file order, so the difference
 * between the best side in the country and its worst was invisible until a
 * season had been played.
 *
 * OUT-OF-REACH CLUBS ARE STILL SHOWN, greyed and unpickable. Hiding them would
 * be tidier and would cost the player the thing worth knowing: that the club he
 * has heard of is up there, and what it would take. A ladder you cannot see the
 * top of is not a ladder.
 */

export interface ClubPickerHandlers {
  /** Fired whenever the selection changes. */
  onSelect: (clubId: string) => void;
  /**
   * Whether to apply the trial gate.
   *
   * Career mode bands every club against the player; a quick match is a
   * friendly against anybody, so the bands would be a rule invented for an
   * occasion that has none.
   */
  banded: boolean;
}

export class ClubPicker {
  readonly element: HTMLElement;
  private player: Player | null = null;
  private countryId: string;
  private selectedId: string;

  constructor(
    private readonly teams: readonly Team[],
    initialClubId: string,
    private readonly handlers: ClubPickerHandlers,
  ) {
    this.selectedId = initialClubId;
    this.countryId = this.countryOf(initialClubId);

    this.element = document.createElement('div');
    this.element.className = 'club-picker';
    // Clicks are caught once on the container rather than bound per card, so
    // the list can be re-rendered on every country change without leaking a
    // listener for each of the sixteen clubs it replaces.
    this.element.addEventListener('click', (event) => this.onClick(event));
    this.render();
  }

  /** The club currently chosen. */
  get value(): string {
    return this.selectedId;
  }

  /**
   * Point the picker at a different footballer.
   *
   * The bands depend on WHO is asking — a veteran and a seventeen-year-old are
   * not offered the same clubs — so changing the player rebuilds the list. The
   * current choice survives if it is still reachable and falls back to the
   * strongest club that would take him if it is not, which is both the sensible
   * default and the one that cannot leave an unpickable club selected.
   */
  setPlayer(player: Player | null): void {
    this.player = player;
    if (this.standingOf(this.selectedId) === 'closed') {
      const fallback = this.clubsIn(this.countryId).find(
        (team) => this.standingOf(team.id) !== 'closed',
      );
      if (fallback) {
        this.selectedId = fallback.id;
        this.handlers.onSelect(this.selectedId);
      }
    }
    this.render();
  }

  private countryOf(clubId: string): string {
    return this.teams.find((team) => team.id === clubId)?.country ?? 'england';
  }

  /**
   * The countries this picker actually has clubs in, strongest league first.
   *
   * Derived from the teams rather than read off `allCountries()`, which returns
   * FORTY-EIGHT — the world has that many countries because international
   * football needs them, and only twelve of them have a club competition. A
   * picker built from the registry offered thirty-six countries with nothing
   * behind them, which is what the first version of this did.
   *
   * Ordered by prestige so the row reads as the ladder it is, rather than in
   * whatever order the data file happens to hold.
   */
  private countries(): { id: string; name: string }[] {
    const ids = [...new Set(this.teams.map((team) => team.country))];
    return ids
      .map((id) => getCountry(id))
      .sort((a, b) => b.prestige - a.prestige)
      .map((country) => ({ id: country.id, name: country.name }));
  }

  private clubsIn(countryId: string): Team[] {
    return this.teams
      .filter((team) => team.country === countryId)
      .sort((a, b) => squadLevel(b) - squadLevel(a));
  }

  private standingOf(clubId: string): ClubStanding {
    const team = this.teams.find((t) => t.id === clubId);
    if (!team || !this.handlers.banded || !this.player) return 'open';
    return clubStanding(this.player, team);
  }

  private onClick(event: Event): void {
    const target = event.target as HTMLElement | null;

    const country = target?.closest<HTMLElement>('[data-country]');
    if (country) {
      this.countryId = country.dataset.country!;
      this.render();
      return;
    }

    const club = target?.closest<HTMLButtonElement>('[data-club]');
    if (club && !club.disabled) {
      this.selectedId = club.dataset.club!;
      this.handlers.onSelect(this.selectedId);
      this.render();
    }
  }

  private render(): void {
    this.element.innerHTML = `
      ${this.renderCountries()}
      ${this.renderClubs()}`;
  }

  /**
   * The twelve countries, each with what it would mean to go there.
   *
   * The count is of clubs that would have him, not of clubs — "9 would sign
   * you" says something about him and the country at once, and it is the number
   * that decides whether opening it is worth the tap. Absent when the picker is
   * not banding, because then it would just say sixteen twelve times.
   */
  private renderCountries(): string {
    const chips = this.countries()
      .map((country) => {
        const clubs = this.clubsIn(country.id);
        const open = this.handlers.banded
          ? clubs.filter((team) => this.standingOf(team.id) === 'open').length
          : 0;
        const current = country.id === this.countryId;
        // Where the chosen club actually is. Without this, browsing away from
        // your choice leaves nothing on screen pointing back at it — the club
        // list shows sixteen other clubs and no indication that the one you
        // picked is two countries to the left.
        const holdsChoice = this.countryOf(this.selectedId) === country.id;
        return `
          <button
            type="button"
            class="country-chip${current ? ' current' : ''}${holdsChoice ? ' holds-choice' : ''}"
            data-country="${country.id}"
            aria-pressed="${current}"
          >
            <span class="country-name">
              ${country.name}${holdsChoice ? '<span class="chosen-dot" aria-label="your club is here">●</span>' : ''}
            </span>
            <span class="country-league">${leagueName(country.id)}</span>
            ${
              this.handlers.banded
                ? `<span class="country-open">${open} would sign you</span>`
                : ''
            }
          </button>`;
      })
      .join('');

    return `<div class="country-row" role="group" aria-label="Country">${chips}</div>`;
  }

  private renderClubs(): string {
    const clubs = this.clubsIn(this.countryId);
    const country = getCountry(this.countryId);
    const cards = clubs.map((team) => this.renderClub(team)).join('');

    return `
      <div class="club-list" role="radiogroup" aria-label="Clubs in ${country.name}">
        ${cards}
      </div>`;
  }

  private renderClub(team: Team): string {
    const standing = this.standingOf(team.id);
    const selected = team.id === this.selectedId;
    const level = squadLevel(team);
    const palette = clubPalette(team.colour);

    // The one number that matters and the one sentence that matters. A trial
    // says what it would take, because "trial" on its own is a label rather
    // than a decision.
    const verdict =
      standing === 'open'
        ? 'Would sign you'
        : standing === 'trial' && this.player
          ? `Trial — ${trialRequirement(reachOf(this.player, team))} rating needed`
          : standing === 'trial'
            ? 'Trial'
            : 'Out of your reach';

    return `
      <button
        type="button"
        class="club-card club-${standing}${selected ? ' selected' : ''}"
        data-club="${team.id}"
        role="radio"
        aria-checked="${selected}"
        ${standing === 'closed' ? 'disabled' : ''}
        style="--club: ${palette.colour}"
      >
        <span class="club-card-top">
          <span class="club-mark" aria-hidden="true"></span>
          <span class="club-card-name">${team.name}</span>
          <span class="club-card-level" title="Squad strength">${level}</span>
        </span>
        <span class="club-card-style">${TACTICAL_STYLE_LABELS[team.style]}</span>
        <span class="club-card-verdict">${verdict}</span>
      </button>`;
  }
}
