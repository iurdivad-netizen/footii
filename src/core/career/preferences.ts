/**
 * WHAT HE WANTS FROM A MOVE
 *
 * A summer used to be answered one club at a time, after the fact. Offers were
 * generated from club interest alone, and the only thing a player could say
 * about any of them was yes or no — so a footballer who had no intention of
 * leaving his country, or who had spent five seasons wanting to play in Spain,
 * had no way of saying so and no effect on who came for him.
 *
 * These are stated BEFORE the window opens, because that is the only point at
 * which they can matter. Once the offers exist it is too late for a preference
 * to be anything but a filter on a list you have already been shown.
 *
 * Three things, deliberately, and all of them blunt:
 *
 *   - SETTLED. He is not listening this summer. No club bids.
 *   - REFUSED. Countries he will not go to. Those clubs do not bid.
 *   - FAVOURED. Countries he would like. Those clubs are keener than they were.
 *
 * A refusal is absolute and a preference is only a nudge, which is the right
 * asymmetry: a player can genuinely rule a league out, and cannot make a club
 * in one want him.
 */

export interface CareerPreferences {
  /** He is happy where he is and does not want to be approached. */
  settled: boolean;
  /** Country ids he will not move to. */
  refused: string[];
  /** Country ids he would particularly like. */
  favoured: string[];
}

export function defaultPreferences(): CareerPreferences {
  return { settled: false, refused: [], favoured: [] };
}

/** Where one country stands with him. */
export type CountryStance = 'neutral' | 'favoured' | 'refused';

export function stanceOf(preferences: CareerPreferences, countryId: string): CountryStance {
  if (preferences.refused.includes(countryId)) return 'refused';
  if (preferences.favoured.includes(countryId)) return 'favoured';
  return 'neutral';
}

/**
 * Move one country to the next stance: neutral, favoured, refused, and round.
 *
 * A cycle rather than three controls per country, because there are twelve
 * countries with leagues and thirty-six switches is a settings page rather than
 * a decision. Returns new preferences; the caller's are untouched.
 */
export function cycleStance(
  preferences: CareerPreferences,
  countryId: string,
): CareerPreferences {
  const stance = stanceOf(preferences, countryId);
  const refused = preferences.refused.filter((id) => id !== countryId);
  const favoured = preferences.favoured.filter((id) => id !== countryId);

  if (stance === 'neutral') return { ...preferences, refused, favoured: [...favoured, countryId] };
  if (stance === 'favoured') return { ...preferences, refused: [...refused, countryId], favoured };
  return { ...preferences, refused, favoured };
}

/**
 * Would he consider this club at all?
 *
 * The country of his CURRENT club is never refused, whatever the list says:
 * refusing the league you already play in should mean "I will not move
 * abroad", not "I will not sign anywhere including here", and reading it the
 * second way would leave an out-of-contract player with nowhere to go.
 */
export function willConsider(
  preferences: CareerPreferences,
  countryId: string,
  currentCountryId: string,
): boolean {
  if (preferences.settled) return false;
  if (countryId === currentCountryId) return true;
  return !preferences.refused.includes(countryId);
}

/**
 * How much keener a club in a favoured country is.
 *
 * A multiplier on interest, and a small one. Wanting to play somewhere makes
 * your agent work that country and makes you easier to persuade; it does not
 * make a club that had not noticed you decide it needs you.
 */
export const FAVOURED_BOOST = 1.18;

export function interestMultiplier(preferences: CareerPreferences, countryId: string): number {
  return preferences.favoured.includes(countryId) ? FAVOURED_BOOST : 1;
}

/** One line describing the stated position, for a hub that has to show it. */
export function describePreferences(
  preferences: CareerPreferences,
  nameOf: (countryId: string) => string,
): string {
  if (preferences.settled) return 'Not looking to move. No club will approach you.';
  const parts: string[] = [];
  if (preferences.favoured.length > 0) {
    parts.push(`keen on ${preferences.favoured.map(nameOf).join(', ')}`);
  }
  if (preferences.refused.length > 0) {
    parts.push(`will not move to ${preferences.refused.map(nameOf).join(', ')}`);
  }
  if (parts.length === 0) return 'Open to anything, anywhere.';
  return `You are ${parts.join(', and ')}.`;
}
