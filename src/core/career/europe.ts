import type { TableRow } from './league.ts';
import { sortTable } from './league.ts';
import { countriesByPrestige, countryPrestige, getCountry } from './countries.ts';
import type { CupKind } from './cups.ts';
import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import { advanceCupTo } from './cups.ts';
import type { GroupStage } from './groupStage.ts';
import {
  GROUP_MATCHES,
  closeGroupRound,
  createGroupStage,
  playGroupRound,
  startKnockout,
  winnerOf,
} from './groupStage.ts';

/**
 * A fresh European season for a field of sixteen.
 *
 * The field arrives in the order `fieldFor` builds it, which is the European
 * order of countries — so it is already a seeding, and `drawGroups` snakes it
 * rather than slicing it.
 */
export function createEuropeanSeason(tier: EuropeanTier, field: readonly string[], rng: Rng) {
  return createGroupStage(tier, field, rng, GROUP_MATCHES);
}

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
 * WHAT THEY ARE. Sixteen clubs, four groups of four, then a bracket seeded off
 * the groups: quarter-final, semi-final, final. Six matches for a club that
 * goes all the way, three guaranteed for one that goes out in the group.
 *
 * They used to be a straight sixteen-club knockout, mechanically identical to a
 * domestic cup. That was wrong in a way worth stating, because it is the
 * difference between the two competitions. A cup tie is one afternoon, and that
 * is what a cup is FOR — a small club gets ninety minutes in which the gap might
 * not matter. Europe is the opposite question: which of these sixteen clubs is
 * actually the best. Deciding that by single ties meant a good side drawn badly
 * was gone in September having played once, and it meant qualifying for Europe
 * was worth exactly one European night to most clubs that managed it. A group
 * gives everybody three, makes the last one matter, and makes going out mean
 * being worse over a month rather than worse for an afternoon.
 *
 * See core/career/groupStage.ts for the machinery, which is shared with nothing
 * — and for why.
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

/**
 * The competition's name as it reads MID-SENTENCE: "the Champions League".
 *
 * The names carry their article because a heading wants one — "The Champions
 * League" is what the competition is called. Dropped into prose that already
 * has a preposition, the same string reads "in The Champions League", which is
 * a database field rather than a sentence.
 */
export function europeanNameInProse(tier: EuropeanTier): string {
  return europeanCompetition(tier).name.replace(/^The /, 'the ');
}

export function isEuropeanTier(value: string): value is EuropeanTier {
  return EUROPEAN_TIERS.includes(value as EuropeanTier);
}

/** Clubs in each competition. Sixteen apiece makes a clean four-round bracket. */
export const EUROPEAN_FIELD = 16;

/**
 * Places per country, best first, one row per competition.
 *
 * Hand-tuned rather than derived, because each row has to sum to exactly
 * sixteen and because the shape matters more than a formula.
 *
 * READ THE COLUMNS, NOT THE ROWS. Every country sends exactly FOUR clubs to
 * Europe. What climbing the order changes is not how many go, but which
 * competitions they go to:
 *
 *     rank        1  2  3  4  5  6  7  8  9 10 11 12
 *     Champions   3  3  2  2  2  1  1  1  1  0  0  0
 *     Europa      1  1  2  2  2  2  2  1  1  1  1  0
 *     Conference  0  0  0  0  0  1  1  2  2  3  3  4
 *     total       4  4  4  4  4  4  4  4  4  4  4  4
 *
 * The Europa row is a HUMP rather than a slope, and that is football rather
 * than an accident: the biggest countries send most of their allocation to the
 * Champions League and few to the Europa League, the smallest send theirs to
 * the Conference League, and the countries in the middle are the ones the Europa
 * League is mostly made of.
 *
 * The bottom three send nobody to the Champions League at all. That is a real
 * and deliberate statement about a small league — and it is the strongest
 * argument the transfer market has: if you want European nights of that kind at
 * that club, the club has to climb, and if it cannot, you have to leave.
 *
 * These rows are what the coefficient reorders. With only the Champions League
 * row responding, the countries at the bottom could climb and see nothing
 * change, because ranks six to eight all got one place each — measured on a
 * Scottish career that drove Scotland's coefficient to the best in the world
 * and moved it from eighth to seventh for no reward at all.
 */
export const CHAMPIONS_LEAGUE_PLACES: readonly number[] = [3, 3, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0];
export const EUROPA_LEAGUE_PLACES: readonly number[] = [1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 0];
export const CONFERENCE_LEAGUE_PLACES: readonly number[] = [0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4];

/** Every country sends this many clubs to Europe, whatever its standing. */
export const EUROPEAN_ENTRIES_PER_COUNTRY = 4;

/** Every competition's allocation, in order of standing. */
export const PLACES_BY_TIER: Record<EuropeanTier, readonly number[]> = {
  championsLeague: CHAMPIONS_LEAGUE_PLACES,
  europaLeague: EUROPA_LEAGUE_PLACES,
  conferenceLeague: CONFERENCE_LEAGUE_PLACES,
};

/**
 * The European order: country ids, best first.
 *
 * Passed in rather than derived here, because what decides it lives outside
 * this module — see core/career/coefficients.ts, where prestige is bent by how
 * a country's national side has been doing. Omitting it falls back to plain
 * prestige, which is what a world with no tournaments on record looks like.
 */
export type EuropeanOrder = readonly string[];

function orderOrPrestige(order?: EuropeanOrder): EuropeanOrder {
  return order && order.length > 0 ? order : countriesByPrestige().map((c) => c.id);
}

/**
 * How many places this country has in one competition.
 *
 * The DISTRIBUTIONS are fixed and the ORDER is earned. Whatever moves countries
 * around, each row is still handed out down the order, so every competition
 * always has exactly sixteen clubs in it — a country climbing a place takes one
 * off whoever it passed rather than inventing one.
 *
 * A country the order has never heard of takes the bottom row, which is what an
 * unknown country's football is worth.
 */
export function placesIn(
  tier: EuropeanTier,
  countryId: string,
  order?: EuropeanOrder,
): number {
  const places = PLACES_BY_TIER[tier];
  const rank = orderOrPrestige(order).indexOf(countryId);
  if (rank === -1) return places[places.length - 1] ?? 1;
  return places[rank] ?? places[places.length - 1] ?? 1;
}

/** How many Champions League places this country has. */
export function championsLeaguePlaces(countryId: string, order?: EuropeanOrder): number {
  return placesIn('championsLeague', countryId, order);
}

/** Everything one country sends to Europe, in order of standing. */
export function europeanPlaces(
  countryId: string,
  order?: EuropeanOrder,
): Record<EuropeanTier, number> {
  return {
    championsLeague: placesIn('championsLeague', countryId, order),
    europaLeague: placesIn('europaLeague', countryId, order),
    conferenceLeague: placesIn('conferenceLeague', countryId, order),
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
  /**
   * The European order, best first. Omit for plain prestige order.
   *
   * This is where the international tournament reaches club football: a
   * country that has been doing well sits higher here and sends another club
   * to the Champions League for it.
   */
  order?: EuropeanOrder;
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

    const places = europeanPlaces(countryId, input.order);
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
/**
 * A European season: the groups, and the bracket that comes out of them.
 *
 * `CupState<EuropeanTier>` until the groups were added, which is why so much of
 * the game asks it cup-shaped questions. The knockout half is still exactly a
 * cup, and is reachable as `.knockout`.
 */
export type EuropeanState = GroupStage<EuropeanTier>;

/** Group matches every club in Europe plays. */
export const EUROPEAN_GROUP_ROUNDS = GROUP_MATCHES;

/** Quarter-final, semi-final, final — the bracket eight clubs run to. */
export const EUROPEAN_KNOCKOUT_ROUNDS = 3;

/** The most European matches one club can play in a season. */
export const EUROPEAN_MATCHES = EUROPEAN_GROUP_ROUNDS + EUROPEAN_KNOCKOUT_ROUNDS;

/**
 * How far through a European season a given calendar round is.
 *
 * The calendar carries one list of European dates and the competition uses the
 * first three for groups and the rest for the bracket, so a slot's round number
 * has two different meanings depending on where it falls. This is the one place
 * that knows which.
 */
export function isGroupRound(round: number): boolean {
  return round <= EUROPEAN_GROUP_ROUNDS;
}

/** A European slot's round number, as a knockout round. */
export function knockoutRoundOf(round: number): number {
  return round - EUROPEAN_GROUP_ROUNDS;
}

/**
 * Play a European season forward to wherever the calendar has reached.
 *
 * ONE function for both halves, because "how far has this competition got" is
 * one question and the answer crosses the group/knockout boundary — a caller
 * that had to know which half it was in would have to duplicate this arithmetic
 * everywhere it asked.
 *
 * `skipId` is the player's club, whose group fixture and cup tie are left for
 * him to play. Everything else is settled around him.
 */
export function advanceEuropeanSeason(
  rng: Rng,
  state: EuropeanState,
  roundsReached: number,
  lookup: (id: string) => Team,
  skipId?: string,
): void {
  for (let round = 1; round <= Math.min(roundsReached, EUROPEAN_GROUP_ROUNDS); round += 1) {
    if (state.groupRoundsPlayed >= round) continue;
    playGroupRound(rng.fork(`group:${round}`), state, round, lookup, skipId);
    closeGroupRound(state, round);
  }

  if (roundsReached <= EUROPEAN_GROUP_ROUNDS) return;

  // The bracket cannot be built until every group is finished, which is not the
  // same as the calendar having passed the group dates: the player's own last
  // group match may still be his to play.
  const knockout = startKnockout(state);
  if (!knockout) return;
  advanceCupTo(
    rng.fork('knockout'),
    knockout,
    lookup,
    Math.min(knockoutRoundOf(roundsReached), EUROPEAN_KNOCKOUT_ROUNDS),
    skipId,
  );
}

/** Did this club win it? */
export function europeanWinner(state: EuropeanState | null): string | null {
  return winnerOf(state);
}

/**
 * Did the club reach the final and lose it?
 *
 * Read off the knockout rather than the season, because a club knocked out in
 * the group stage has no bracket record at all and must not be mistaken for a
 * beaten finalist.
 */
export function lostEuropeanFinal(state: EuropeanState | null, clubId: string): boolean {
  const knockout = state?.knockout;
  if (!knockout || knockout.winnerId === clubId) return false;
  return knockout.eliminatedInRound === (knockout.rounds.length || 0) && knockout.rounds.length > 0;
}

/**
 * How well a club would have to be doing to reach a given competition.
 *
 * Presentation only — the qualification above is the truth. Used to tell a
 * player mid-season what finishing where would be worth, which is the whole
 * reason a league position matters beyond the trophy.
 */
export function placesDescription(countryId: string, order?: EuropeanOrder): string {
  const country = getCountry(countryId);
  const places = europeanPlaces(countryId, order);
  return (
    `${country.name}: top ${places.championsLeague} into the Champions League, ` +
    `next ${places.europaLeague} into the Europa League, ` +
    `next ${places.conferenceLeague} into the Conference League.`
  );
}

/**
 * The competition a club would enter from a given league position, ignoring
 * cups. Null when the position is not good enough for Europe at all.
 */
export function tierForPosition(
  countryId: string,
  position: number,
  order?: EuropeanOrder,
): EuropeanTier | null {
  const places = europeanPlaces(countryId, order);
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
