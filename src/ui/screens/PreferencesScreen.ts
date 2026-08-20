import type { CareerPreferences } from '../../core/career/preferences.ts';
import { cycleStance, describePreferences, stanceOf } from '../../core/career/preferences.ts';
import { countriesByPrestige, getCountry, leagueName } from '../../core/career/countries.ts';

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
 */
export interface PreferencesHandlers {
  onChange: (preferences: CareerPreferences) => void;
  onBack: () => void;
}

export class PreferencesScreen {
  readonly element: HTMLElement;

  constructor(
    private preferences: CareerPreferences,
    private readonly currentCountryId: string,
    private readonly handlers: PreferencesHandlers,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'screen preferences-screen';
    this.render();
  }

  private render(): void {
    const preferences = this.preferences;
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

      <p class="preferences-summary">${describePreferences(preferences, (id) => getCountry(id).name)}</p>

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
