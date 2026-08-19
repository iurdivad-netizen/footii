import type { TableRow } from './league.ts';
import { sortTable } from './league.ts';
import { countriesByPrestige, countryPrestige, getCountry } from './countries.ts';
import type { CupKind, CupState } from './cups.ts';

/**
 * EUROPEAN COMPETITIONS
 *
 * Three of them, in a strict order of standing: the Champions League, the
 * Europa League, and the Conference League below both.
 *
 * WHY THEY EXIST. The country ladder gave a career somewhere to climb, but
 * climbing it was purely a transfer decision — nothing that happened on a
 * Saturday moved you between leagues. Europe closes that loop. Finishing fourth
 * instead of fifth is now worth something concrete the following season, the
 * clubs you meet are from countries you do not play in, and a player at a
 * mid-sized club gets watched by big ones without having to sign for them first.
 *
 * WHAT DECIDES ENTRY. Where your club finished, and who won the cups:
 *
 *   - the top places in each league go to the Champions League, more of them in
 *     the leagues more people watch
 *   - the next two go to the Europa League, and the NATIONAL CUP WINNER takes
 *     one of those places
 *   - the next two go to the Conference League, and the LEAGUE CUP WINNER takes
 *     one of those
 *
 * That last part is what stops the domestic cups being a side-show: winning one
 * is a route into Europe for a club that finished nowhere, which is exactly what
 * a cup is for.
 *
 * WHAT THEY ARE. Sixteen clubs, an open draw, four rounds — mechanically the
 * same knockout as a domestic cup, and deliberately so: it is the same object
 * with a different field, so every fix to the draw or the shootout applies to
 * all five competitions at once. What differs is who is in it, how much of the
 * world is watching, and what winning it is worth.
 */

export type EuropeanTier = 'championsLeague' | 'europaLeague' | 'conferenceLeague';

export const EUROPEAN_TIERS: readonly EuropeanTier[] = [
  'championsLeague',
  'europaLeague',
  'conferenceLeague',
];

export interface EuropeanCompetition {
  id: EuropeanTier;
  name: string;
  short: string;
  /**
   * How closely it is watched, 0-1.
   *
   * Above any single country's prestige for the Champions League: a European
   * night is seen by more people than a league match anywhere, which is the
   * reason qualifying matters to a player as well as to a club.
   */
  prestige: number;
}

export const EUROPEAN_COMPETITIONS: readonly EuropeanCompetition[] = [
  { id: 'championsLeague', name: 'The Champions League', short: 'UCL', prestige: 1 },
  { id: 'europaLeague', name: 'The Europa League', short: 'UEL', prestige: 0.82 },
  { id: 'conferenceLeague', name: 'The Conference League', short: 'UECL', prestige: 0.62 },
];

export function europeanCompetition(tier: EuropeanTier): EuropeanCompetition {
  return EUROPEAN_COMPETITIONS.find((c) => c.id === tier) ?? EUROPEAN_COMPETITIONS[2]!;
}

export function isEuropeanTier(value: string): value is EuropeanTier {
  return EUROPEAN_TIERS.includes(value as EuropeanTier);
}

/** Clubs in each competition. Sixteen apiece makes a clean four-round bracket. */
export const EUROPEAN_FIELD = 16;

/** Places every country gets in the two lower competitions. */
export const EUROPA_PLACES = 2;
export const CONFERENCE_PLACES = 2;

/**
 * Champions League places per country, best-watched league first.
 *
 * Hand-tuned rather than derived, because it has to sum to exactly sixteen and
 * because the shape matters more than the formula: the big leagues get three,
 * the middle two, and the smallest one apiece. A country's league is a level,
 * and this is where that stops being flavour.
 */
export const CHAMPIONS_LEAGUE_PLACES: readonly number[] = [3, 3, 3, 2, 2, 1, 1, 1];

/** How many Champions League places this country has. */
export function championsLeaguePlaces(countryId: string): number {
  const rank = countriesByPrestige().findIndex((c) => c.id === countryId);
  if (rank === -1) return 1;
  return CHAMPIONS_LEAGUE_PLACES[rank] ?? 1;
}

/** Everything one country sends to Europe, in order of standing. */
export function europeanPlaces(countryId: string): Record<EuropeanTier, number> {
  return {
    championsLeague: championsLeaguePlaces(countryId),
    europaLeague: EUROPA_PLACES,
    conferenceLeague: CONFERENCE_PLACES,
  };
}

/** Which competition each qualified club is in, keyed by club id. */
export type EuropeanEntries = Record<string, EuropeanTier>;

export interface QualificationInput {
  /** Every country's final league table this season. */
  tables: Record<string, readonly TableRow[]>;
  /** National cup winner per country, if there is one. */
  nationalCupWinners: Record<string, string | null>;
  /** League cup winner per country, if there is one. */
  leagueCupWinners: Record<string, string | null>;
}

/**
 * Work out who plays in Europe next season.
 *
 * Order within a country is league position, with the two cup winners inserted:
 * the national cup winner takes a Europa place and the league cup winner a
 * Conference place, unless they have already qualified higher on merit — in
 * which case the place passes down the league table rather than going unused.
 */
export function qualifyForEurope(input: QualificationInput): EuropeanEntries {
  const entries: EuropeanEntries = {};

  for (const [countryId, table] of Object.entries(input.tables)) {
    const ranked = sortTable(table).map((row) => row.teamId);
    if (ranked.length === 0) continue;

    const places = europeanPlaces(countryId);
    const taken = new Set<string>();

    /** Give a named club a place, unless it already has a better one. */
    const award = (clubId: string | null | undefined, tier: EuropeanTier): boolean => {
      if (!clubId || taken.has(clubId)) return false;
      taken.add(clubId);
      entries[clubId] = tier;
      return true;
    };

    /** Fill `count` places from the league table, skipping clubs already in. */
    let next = 0;
    const fillFromTable = (count: number, tier: EuropeanTier): void => {
      let filled = 0;
      while (filled < count && next < ranked.length) {
        if (award(ranked[next], tier)) filled += 1;
        next += 1;
      }
    };

    // The Champions League places go strictly on merit, top of the table down.
    fillFromTable(places.championsLeague, 'championsLeague');

    // A cup winner takes the FIRST place of its competition and the league fills
    // whatever is left. A club that already qualified higher keeps its higher
    // place, and the place it would have taken passes down the table rather
    // than going unused.
    const nationalCupWinner = award(input.nationalCupWinners[countryId], 'europaLeague');
    fillFromTable(places.europaLeague - (nationalCupWinner ? 1 : 0), 'europaLeague');

    const leagueCupWinner = award(input.leagueCupWinners[countryId], 'conferenceLeague');
    fillFromTable(places.conferenceLeague - (leagueCupWinner ? 1 : 0), 'conferenceLeague');
  }

  return entries;
}

/** Every club in one European competition. */
export function fieldFor(entries: EuropeanEntries, tier: EuropeanTier): string[] {
  return Object.entries(entries)
    .filter(([, value]) => value === tier)
    .map(([clubId]) => clubId);
}

/** The competition a club is in this season, if any. */
export function europeanTierOf(entries: EuropeanEntries, clubId: string): EuropeanTier | null {
  return entries[clubId] ?? null;
}

/** The state of one European competition, reusing the knockout model wholesale. */
export type EuropeanState = CupState<EuropeanTier>;

/**
 * How well a club would have to be doing to reach a given competition.
 *
 * Presentation only — the qualification above is the truth. Used to tell a
 * player mid-season what finishing where would be worth, which is the whole
 * reason a league position matters beyond the trophy.
 */
export function placesDescription(countryId: string): string {
  const country = getCountry(countryId);
  const cl = championsLeaguePlaces(countryId);
  return (
    `${country.name}: top ${cl} into the Champions League, ` +
    `next ${EUROPA_PLACES} into the Europa League, ` +
    `next ${CONFERENCE_PLACES} into the Conference League.`
  );
}

/**
 * The competition a club would enter from a given league position, ignoring
 * cups. Null when the position is not good enough for Europe at all.
 */
export function tierForPosition(countryId: string, position: number): EuropeanTier | null {
  const places = europeanPlaces(countryId);
  if (position <= places.championsLeague) return 'championsLeague';
  if (position <= places.championsLeague + places.europaLeague) return 'europaLeague';
  if (position <= places.championsLeague + places.europaLeague + places.conferenceLeague) {
    return 'conferenceLeague';
  }
  return null;
}

/**
 * How much of the football world watches a club's season, 0-1.
 *
 * A European run is seen by more people than the league it came from, so a
 * player at a small club who reaches the Champions League is genuinely more
 * visible than his league alone would make him. Feeds reputation and wages.
 */
export function visibilityOf(countryId: string, tier: EuropeanTier | null): number {
  const league = countryPrestige(countryId);
  if (!tier) return league;
  // The better of the two, nudged: playing in Europe cannot make you LESS seen.
  return Math.max(league, (league + europeanCompetition(tier).prestige) / 2);
}

/** Which domestic cup, if any, hands out a place in this competition. */
export function cupRouteInto(tier: EuropeanTier): CupKind | null {
  if (tier === 'europaLeague') return 'nationalCup';
  if (tier === 'conferenceLeague') return 'leagueCup';
  return null;
}
