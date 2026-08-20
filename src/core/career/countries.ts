import { clamp01 } from '../util/math.ts';
import type { Team } from '../team/team.ts';

/**
 * COUNTRIES
 *
 * The world is eight countries, each with its own league. A country is the unit
 * that answers three questions the career keeps asking:
 *
 *   HOW GOOD is the football here?   The clubs say that themselves — a league is
 *                                    strong because its clubs are, not because
 *                                    of a number attached to the country.
 *   HOW CLOSELY is it watched?       `prestige`. This scales reputation, wages
 *                                    and international selection, and it is
 *                                    deliberately NOT the same as strength: a
 *                                    league can be well watched and mediocre,
 *                                    or excellent and ignored.
 *   WHERE ARE YOU FROM?              Nationality, which decides who may pick you
 *                                    and which move counts as going abroad.
 *
 * Prestige replaced the old per-division prestige when the pyramid became a map.
 * With one tier per country the question "how big is this league" is a question
 * about the country, not about which rung of a ladder you are on.
 */

export interface Country {
  id: string;
  name: string;
  /** "English", "Spanish" — for honours that should read as football. */
  adjective: string;
  /**
   * What the league is called. Absent for a country that has no league.
   *
   * Most of the world does not have one here: a country can field a national
   * side without the game modelling its club football, which is what makes a
   * World Cup possible without a hundred and fifty leagues behind it.
   */
  league?: string;
  /** Three-letter tag for tables and chips. */
  short: string;
  /** Which continent's championship it plays in. */
  confederation: string;
  /** How closely the football world watches, 0-1. */
  prestige: number;
  /**
   * How good its national side is, 0-100 — authored, and ONLY for a country
   * with no league.
   *
   * A national side is normally derived from its country's strongest clubs,
   * which is why it needs no roster and drifts as they drift. A country with no
   * clubs has nothing to derive from, so it carries a number instead and drifts
   * on its own — see core/career/nationDrift.ts.
   */
  nationalStrength?: number;
  /** How it plays, for a country with no clubs to take a style from. */
  style?: string;
  /** Its colour, likewise. */
  colour?: string;
}

/**
 * A country that does not exist, used rather than throwing.
 *
 * A save that refers to a country the data file no longer has must degrade to
 * something renderable — the alternative is a blank page on boot, which is the
 * exact failure the career guards already exist to prevent.
 */
export const UNKNOWN_COUNTRY: Country = {
  id: 'unknown',
  name: 'Unknown',
  adjective: 'Unknown',
  league: 'Unknown league',
  short: '???',
  confederation: 'unknown',
  prestige: 0.5,
};

/**
 * The loaded countries. Set once at startup from the data file — `core` may not
 * import `data`, so the world is injected rather than read.
 */
let registry: readonly Country[] = [];

export function registerCountries(countries: readonly Country[]): void {
  registry = countries.slice();
}

export function allCountries(): readonly Country[] {
  return registry;
}

export function getCountry(id: string): Country {
  return registry.find((country) => country.id === id) ?? UNKNOWN_COUNTRY;
}

export function countryPrestige(id: string): number {
  return clamp01(getCountry(id).prestige);
}

/** The country a club plays in. */
export function countryOf(team: Team): string {
  return team.country;
}

/**
 * Does this country have a league of its own?
 *
 * The division that matters most in the registry. A country WITH a league has
 * clubs, sends them to Europe, derives its national side from them and can be
 * played in; a country WITHOUT one exists to field a national side and nothing
 * else. Almost every question about club football means the first set only, and
 * asking the registry for "every country" when you meant "every league" is how
 * a South American nation ends up in the European places table.
 */
export function hasLeague(country: Country): boolean {
  return !!country.league;
}

/** Every country that has a league, in registry order. */
export function leagueCountries(): Country[] {
  return registry.filter(hasLeague);
}

/** Which confederation a country plays in. */
export function confederationOf(countryId: string): string {
  return getCountry(countryId).confederation;
}

/** What each confederation is called. */
export const CONFEDERATION_NAMES: Record<string, string> = {
  europe: 'Europe',
  southAmerica: 'South America',
  africa: 'Africa',
  asia: 'Asia',
  northAmerica: 'North America',
};

/**
 * And what its championship is called, which is not the same word.
 *
 * "The Europe Championship" is a place with a competition bolted to it; "The
 * European Championship" is a competition. Football names these after the
 * adjective, so this carries the adjective.
 */
export const CONFEDERATION_ADJECTIVES: Record<string, string> = {
  europe: 'European',
  southAmerica: 'South American',
  africa: 'African',
  asia: 'Asian',
  northAmerica: 'North American',
};

export function confederationName(confederation: string): string {
  return CONFEDERATION_NAMES[confederation] ?? 'The world';
}

export function confederationAdjective(confederation: string): string {
  return CONFEDERATION_ADJECTIVES[confederation] ?? 'World';
}

/** Every confederation there is, in the order the registry lists them. */
export function allConfederations(): string[] {
  const seen: string[] = [];
  for (const country of registry) {
    if (!seen.includes(country.confederation)) seen.push(country.confederation);
  }
  return seen;
}

/** Every country in one confederation. */
export function countriesIn(confederation: string): Country[] {
  return registry.filter((country) => country.confederation === confederation);
}

/** What a country's league is called, or a plain statement that it has none. */
export function leagueName(countryId: string): string {
  return getCountry(countryId).league ?? 'No league of its own';
}

/**
 * Countries ranked by how closely they are watched, best first.
 *
 * LEAGUE COUNTRIES ONLY. This ranking exists to hand out European places and to
 * seed a European draw, and a country with no clubs can do neither. For a
 * ranking of every nation in the world — which is what a World Cup is seeded
 * off — see `nationsByPrestige`.
 */
export function countriesByPrestige(): Country[] {
  return leagueCountries().sort((a, b) => b.prestige - a.prestige);
}

/** Every country in the world ranked by how closely it is watched, best first. */
export function nationsByPrestige(): Country[] {
  return registry.slice().sort((a, b) => b.prestige - a.prestige);
}

/**
 * How much of a step abroad a move is, -1 to 1.
 *
 * Positive means the destination is watched more closely than where he is now.
 * Used by the market to tell a genuine step up from a lateral move to a league
 * nobody follows, which a squad-level comparison alone cannot see: the best club
 * in a small country can have a stronger squad than a mid-table club in a big
 * one and still be the smaller move.
 */
export function prestigeStep(fromCountryId: string, toCountryId: string): number {
  return countryPrestige(toCountryId) - countryPrestige(fromCountryId);
}

/**
 * Does this move cross a border?
 *
 * Worth its own function because moving abroad is not merely a different badge:
 * it unsettles form more, and clubs are warier of a player who has never done
 * it. See `applyTransferEffects` and `clubInterest`.
 */
export function isMoveAbroad(fromCountryId: string, toCountryId: string): boolean {
  return fromCountryId !== toCountryId;
}

/**
 * Every country's league pyramid, keyed by country id.
 *
 * The shape is `country -> tier -> club ids`, so each country owns its own
 * pyramid and promotion or relegation in one cannot disturb another. Today
 * every country has exactly one tier; a club whose `division` is not 1 is still
 * placed by its own number, so adding a second tier is a data change.
 */
export type WorldLeagues = Record<string, string[][]>;

export function initialLeagues(teams: readonly Team[]): WorldLeagues {
  const leagues: WorldLeagues = {};

  for (const team of teams) {
    const country = team.country || UNKNOWN_COUNTRY.id;
    // A club with a nonsense tier goes into the top one rather than vanishing:
    // a data error must not silently shrink a league below a playable size.
    const tier = Number.isInteger(team.division) && team.division > 0 ? team.division : 1;
    const pyramid = (leagues[country] ??= []);
    while (pyramid.length < tier) pyramid.push([]);
    pyramid[tier - 1]!.push(team.id);
  }

  return leagues;
}

/** Where a club sits in the world, or null if it sits nowhere. */
export function locateClub(
  leagues: WorldLeagues,
  clubId: string,
): { countryId: string; division: number } | null {
  for (const [countryId, pyramid] of Object.entries(leagues)) {
    const index = pyramid.findIndex((tier) => tier.includes(clubId));
    if (index !== -1) return { countryId, division: index + 1 };
  }
  return null;
}

/** The clubs in one league. Empty rather than throwing for an unknown one. */
export function leagueMembers(
  leagues: WorldLeagues,
  countryId: string,
  division = 1,
): string[] {
  return (leagues[countryId]?.[division - 1] ?? []).slice();
}

/** Every club in the world, across every country and tier. */
export function allClubIds(leagues: WorldLeagues): string[] {
  return Object.values(leagues).flat(2);
}

/** Country ids that actually have a league, in registry order. */
export function playedCountries(leagues: WorldLeagues): string[] {
  const present = new Set(Object.keys(leagues));
  const ordered = registry.filter((c) => present.has(c.id)).map((c) => c.id);
  // Anything in the save the registry has never heard of still gets listed, so
  // a browsable world never silently loses a league.
  for (const id of present) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}
