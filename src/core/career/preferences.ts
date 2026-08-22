import type { EuropeanTier } from './europe.ts';

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
 * Five things, deliberately, and all of them blunt:
 *
 *   - SETTLED. He is not listening this summer. No club bids.
 *   - REFUSED. Countries he will not go to. Those clubs do not bid.
 *   - FAVOURED. Countries he would like. Those clubs are keener than they were.
 *   - STANDING. How big a club has to be before he will move to it at all.
 *   - EUROPE. European football he insists the move comes with.
 *
 * A refusal is absolute and a preference is only a nudge, which is the right
 * asymmetry: a player can genuinely rule a league out, and cannot make a club
 * in one want him. The two demands added later sit on the ABSOLUTE side of that
 * line, and they are the same statement as a refused country said about a
 * different property of the club — "not there" and "not that small" are both
 * things a footballer gets to mean.
 *
 * WHAT A DEMAND CANNOT DO is conjure the offer it describes. Ruling out
 * everything below the top of the world does not make one of those clubs bid;
 * it only means that if none of them does, nobody does. That is the honest
 * reading of an ultimatum and the screen says so, because a player who sets an
 * impossible bar and hears silence should know which of the two he chose.
 */

/**
 * How big a club has to be before he will move to it.
 *
 * Measured against `clubAppeal` — the club's own standing multiplied by the
 * stage its league plays on — because that is the number that already answers
 * "is this a step up", and answering it any other way would give the game two
 * disagreeing definitions of a big club.
 *
 * Four bands rather than a slider. A slider on a 0-1 number nobody can see is a
 * request for a decision the player has no way to make, and it would invite the
 * false precision of picking 0.63 over 0.61. The floors are set off the world
 * as it actually is: 141 of the 192 clubs clear `established`, 48 clear `big`
 * and 12 clear `elite`. Each band is therefore a real narrowing rather than a
 * label, and the screen reports the count so the choice is made with it.
 */
export type StandingFloor = 'any' | 'established' | 'big' | 'elite';

export const STANDING_FLOORS: Record<StandingFloor, number> = {
  any: 0,
  established: 0.42,
  big: 0.62,
  elite: 0.76,
};

/**
 * European football he insists a move comes with.
 *
 * `null` is no demand at all, and it is not the same as 'any': the first says
 * he does not mind, the second says the club must be in one of the three. A
 * specific tier is the strictest thing on the screen — twelve clubs a season
 * are in the Champions League, and only the ones that also want him can bid.
 *
 * Read against NEXT season's qualification rather than this one's, because that
 * is the season the move is for. A club that has just qualified is a club with
 * European football to offer; one that has just fallen out of it is not, whatever
 * it did last year.
 */
export type EuropeanDemand = 'any' | EuropeanTier;

export interface CareerPreferences {
  /** He is happy where he is and does not want to be approached. */
  settled: boolean;
  /** Country ids he will not move to. */
  refused: string[];
  /** Country ids he would particularly like. */
  favoured: string[];
  /** The least a club may be and still be worth moving to. */
  standing: StandingFloor;
  /** European football the move must come with. Null when he has not asked. */
  european: EuropeanDemand | null;
}

export function defaultPreferences(): CareerPreferences {
  return { settled: false, refused: [], favoured: [], standing: 'any', european: null };
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

/** What a club is, in the terms the two demands are stated in. */
export interface ClubProspect {
  /** `clubAppeal`, 0-1: the club's standing on the stage its league plays on. */
  appeal: number;
  /** Which European competition it is in NEXT season, or null for none. */
  europeanTier: EuropeanTier | null;
}

/**
 * Does this club meet what he has demanded of a move?
 *
 * Separate from `willConsider` because it asks about the CLUB rather than about
 * where the club is, and because it has no equivalent of the current-country
 * exemption: these demands are conditions on moving, and a club he already
 * plays for never bids for him in the first place. Keeping his own renewal out
 * of reach of them is therefore automatic rather than a special case — which is
 * the intended reading. Setting an impossible bar should leave him where he is,
 * not leave him with nowhere at all.
 */
export function meetsDemands(preferences: CareerPreferences, club: ClubProspect): boolean {
  if (club.appeal < STANDING_FLOORS[preferences.standing]) return false;
  if (!preferences.european) return true;
  if (!club.europeanTier) return false;
  return preferences.european === 'any' || preferences.european === club.europeanTier;
}

/**
 * How much of the world each demand leaves him.
 *
 * Lives beside the demands rather than beside the screen that shows it, because
 * it is a fact about them: a band whose count nobody can see is a bar set in
 * the dark, and every caller that offers the choice owes the player the number.
 * The counting itself belongs to whoever holds the clubs — see `marketReach`.
 */
export interface MarketReach {
  /** How many clubs in the world clear each standing floor. */
  clearing: Record<StandingFloor, number>;
  /** How many are in each European competition, and in any of them. */
  inEurope: Record<EuropeanDemand, number>;
  /** Clubs in the world, so a count can be shown against a total. */
  total: number;
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

/** What each band is called where it has to read as a sentence. */
export const STANDING_LABELS: Record<StandingFloor, string> = {
  any: 'anywhere',
  established: 'an established club',
  big: 'a big club',
  elite: 'one of the biggest in the world',
};

/** And each demand. Written to follow "only for a club in". */
export const EUROPEAN_DEMAND_LABELS: Record<EuropeanDemand, string> = {
  any: 'Europe',
  championsLeague: 'the Champions League',
  europaLeague: 'the Europa League',
  conferenceLeague: 'the Conference League',
};

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
  if (preferences.standing !== 'any') {
    parts.push(`moving only for ${STANDING_LABELS[preferences.standing]}`);
  }
  if (preferences.european) {
    parts.push(`holding out for ${EUROPEAN_DEMAND_LABELS[preferences.european]}`);
  }
  if (parts.length === 0) return 'Open to anything, anywhere.';
  return `You are ${parts.join(', and ')}.`;
}
