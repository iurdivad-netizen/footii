import type {
  CareerPreferences,
  EuropeanDemand,
  MarketReach,
  StandingFloor,
} from '../../core/career/preferences.ts';
import {
  EUROPEAN_DEMAND_LABELS,
  cycleStance,
  describePreferences,
  stanceOf,
} from '../../core/career/preferences.ts';
import { countriesByPrestige, getCountry, leagueName } from '../../core/career/countries.ts';
import { EUROPEAN_TIERS } from '../../core/career/europe.ts';

/**
 * WHAT YOU WANT FROM A MOVE
 *
 * Stated before the summer rather than answered during it.
 *
 * A transfer window used to be the only place a player had any say, and all he
 * could say was yes or no to whoever happened to bid. There was no way to be a
 * footballer who would not leave his country, or who had spent five seasons
 * wanting to play in Spain — the market simply did not ask.
 *
 * Every country cycles through three states on one control, because twelve
 * countries with three switches each is a settings page rather than a decision.
 * The asymmetry between the two states is deliberate and is explained on the
 * screen: ruling a country out is absolute, wanting one is only a nudge. A
 * player can genuinely refuse to go somewhere. He cannot make a club want him.
 *
 * The two DEMANDS below the countries are the same absolute statement said
 * about the club rather than about where it is: how big it has to be, and what
 * it has to be playing in. Both narrow the market and neither widens it, so
 * each one shows how many of the world's 192 clubs are left on the other side
 * of it. A player is entitled to hold out for the Champions League; he is also
 * entitled to know that it leaves twelve clubs able to bid, and that if none of
 * them wants him the summer is silent by his own choice rather than by the
 * game's.
 */
export interface PreferencesHandlers {
  onChange: (preferences: CareerPreferences) => void;
  onBack: () => void;
  /**
   * Hand in a transfer request, or take it back.
   *
   * A handler rather than part of `onChange`, because it is not a preference:
   * it changes the career rather than describing it, and it costs something the
   * moment it is pressed.
   */
  onRequestTransfer: () => void;
  onWithdrawRequest: () => void;
}

/** Whether he has one standing, and how it reads. */
export interface RequestState {
  standing: boolean;
  /** One line for the card. Empty when there is none. */
  description: string;
}

/**
 * The standing bands as the screen words them.
 *
 * The prose is here rather than beside the floors in `preferences.ts` because
 * it is the only part of a band that is about being read. The floors are the
 * model; these are what a footballer would call them.
 */
const STANDING_BANDS: readonly { id: StandingFloor; name: string; note: string }[] = [
  { id: 'any', name: 'Anywhere', note: 'Any club that wants me.' },
  {
    id: 'established',
    name: 'An established club',
    note: 'Nothing at the bottom of a small league.',
  },
  { id: 'big', name: 'A big club', note: 'Somewhere that expects to be near the top.' },
  { id: 'elite', name: 'The very top', note: 'One of the biggest clubs in the world.' },
];

/**
 * And the European ones, with `null` first because it is the default.
 *
 * Built from `EUROPEAN_TIERS` rather than written out, so a fourth competition
 * would appear here without anybody having to remember this screen exists.
 */
const EUROPEAN_BANDS: readonly { id: EuropeanDemand | null; name: string; note: string }[] = [
  { id: null, name: 'Does not matter', note: 'Europe is a bonus, not a condition.' },
  { id: 'any', name: 'European football', note: 'Any of the three competitions.' },
  ...EUROPEAN_TIERS.map((tier) => ({
    id: tier as EuropeanDemand,
    name: EUROPEAN_DEMAND_LABELS[tier].replace(/^the /, 'The '),
    note: 'That competition and no other.',
  })),
];

export class PreferencesScreen {
  readonly element: HTMLElement;

  constructor(
    private preferences: CareerPreferences,
    private readonly currentCountryId: string,
    private readonly reach: MarketReach,
    private readonly request: RequestState,
    private readonly handlers: PreferencesHandlers,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'screen preferences-screen';
    this.render();
  }

  private render(): void {
    const preferences = this.preferences;
    const reach = this.reach;
    // Countries with leagues of their own, which `countriesByPrestige` already
    // limits itself to: a country with no clubs has nothing to move to, so
    // offering it would be offering a choice that cannot happen.
    const countries = countriesByPrestige();

    this.element.innerHTML = `
      <header class="creator-header">
        <h1>What you want from a move</h1>
        <p class="hint">
          Said now, before the summer. Clubs are approached — or not — on this, so it changes who
          bids rather than only what you are shown.
        </p>
      </header>

      <div class="career-card">
        <label class="settled-row">
          <input type="checkbox" id="pref-settled" ${preferences.settled ? 'checked' : ''} />
          <span>
            <strong>Happy where I am.</strong>
            Nobody approaches you this summer. Your own club can still offer you new terms.
          </span>
        </label>
      </div>

      <div class="career-card ${preferences.settled ? 'muted' : ''}">
        <h2>Countries</h2>
        <p class="hint">
          Click a country to cycle it: <em class="stance-key favoured">would love to</em> →
          <em class="stance-key refused">will not go</em> → back to neither. Refusing one is
          absolute; wanting one only makes its clubs keener.
        </p>
        <div class="country-stances">
          ${countries
            .map((country) => {
              const stance = stanceOf(preferences, country.id);
              const home = country.id === this.currentCountryId;
              return `<button class="stance ${stance}${home ? ' home' : ''}"
                        data-country="${country.id}">
                  <span class="stance-name">${country.name}</span>
                  <span class="stance-note">${
                    home
                      ? 'Where you play now'
                      : stance === 'favoured'
                        ? 'Would love to'
                        : stance === 'refused'
                          ? 'Will not go'
                          : leagueName(country.id)
                  }</span>
                </button>`;
            })
            .join('')}
        </div>
        ${
          preferences.refused.includes(this.currentCountryId)
            ? `<p class="hint">
                 Refusing ${getCountry(this.currentCountryId).name} means you will not move
                 abroad from it — it never stops you staying, or signing at home.
               </p>`
            : ''
        }
      </div>

      <div class="career-card ${preferences.settled ? 'muted' : ''}">
        <h2>How big a club</h2>
        <p class="hint">
          The least you will move for. Absolute, like refusing a country: a club below the bar does
          not bid at all. It cannot make a bigger club want you — it can only turn a smaller one's
          offer into no offer.
        </p>
        <div class="demand-bands">
          ${STANDING_BANDS.map((band) => {
            const chosen = preferences.standing === band.id;
            const clubs = reach.clearing[band.id] ?? 0;
            return `<button class="band${chosen ? ' chosen' : ''}" data-standing="${band.id}">
                <span class="band-name">${band.name}</span>
                <span class="band-note">${band.note}</span>
                <span class="band-count">${clubs} of ${reach.total} clubs</span>
              </button>`;
          }).join('')}
        </div>
      </div>

      <div class="career-card ${preferences.settled ? 'muted' : ''}">
        <h2>European football</h2>
        <p class="hint">
          Read against next season's qualification, because that is the season the move is for.
          The strictest thing on this screen: holding out for one competition means only the clubs
          in it may bid, and only the ones that want you will.
        </p>
        <div class="demand-bands">
          ${EUROPEAN_BANDS.map((band) => {
            const chosen = preferences.european === band.id;
            const clubs = band.id === null ? reach.total : (reach.inEurope[band.id] ?? 0);
            return `<button class="band${chosen ? ' chosen' : ''}"
                      data-european="${band.id ?? 'none'}">
                <span class="band-name">${band.name}</span>
                <span class="band-note">${band.note}</span>
                <span class="band-count">${clubs} of ${reach.total} clubs</span>
              </button>`;
          }).join('')}
        </div>
      </div>

      <p class="preferences-summary">${describePreferences(preferences, (id) => getCountry(id).name)}</p>

      <div class="career-card request-card${this.request.standing ? ' standing' : ''}">
        <h2>Asking to leave</h2>
        ${
          this.request.standing
            ? `<p>${this.request.description}</p>
               <p class="hint">
                 While it stands, more clubs bid and they pay less for you — and the manager has a
                 reason to give your shirt to somebody who will still be here in August. Your club
                 will not offer you new terms either.
               </p>
               <button class="ghost" id="pref-withdraw">Take the request back</button>
               <p class="hint">
                 Taking it back costs nothing more. The matches you were left out of are already
                 gone, and no withdrawal reaches them.
               </p>`
            : `<p class="hint">
                 The one thing in the market you decide on your own. It does not need the club's
                 permission, and it is not free: more clubs come for you and they come cheaper,
                 but the manager plans without you and your club stops offering you new terms.
                 You can take it back at any time.
               </p>
               <button class="ghost" id="pref-request">Hand in a transfer request</button>`
        }
      </div>

      <button class="primary" id="pref-back">Back to the career</button>`;

    this.element
      .querySelector<HTMLInputElement>('#pref-settled')!
      .addEventListener('change', (event) => {
        this.update({
          ...this.preferences,
          settled: (event.target as HTMLInputElement).checked,
        });
      });

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-country]')) {
      button.addEventListener('click', () => {
        this.update(cycleStance(this.preferences, button.dataset.country!));
      });
    }

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-standing]')) {
      button.addEventListener('click', () => {
        this.update({ ...this.preferences, standing: button.dataset.standing as StandingFloor });
      });
    }

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-european]')) {
      button.addEventListener('click', () => {
        const value = button.dataset.european!;
        this.update({
          ...this.preferences,
          european: value === 'none' ? null : (value as EuropeanDemand),
        });
      });
    }

    // Both go straight out to the career rather than through `update`, because
    // neither is a preference: the screen does not own the answer and must not
    // pretend to by re-rendering from its own copy of it.
    this.element
      .querySelector<HTMLButtonElement>('#pref-request')
      ?.addEventListener('click', this.handlers.onRequestTransfer);
    this.element
      .querySelector<HTMLButtonElement>('#pref-withdraw')
      ?.addEventListener('click', this.handlers.onWithdrawRequest);

    this.element
      .querySelector<HTMLButtonElement>('#pref-back')!
      .addEventListener('click', this.handlers.onBack);
  }

  /**
   * Save and redraw.
   *
   * Every click writes. There is no confirm step because there is nothing to
   * confirm — a preference is not an action, and a screen that made you press
   * Save to say you would like to play in Italy would be a form.
   */
  private update(preferences: CareerPreferences): void {
    this.preferences = preferences;
    this.handlers.onChange(preferences);
    this.render();
  }
}
