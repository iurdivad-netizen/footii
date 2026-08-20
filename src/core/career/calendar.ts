import type { CupKind } from './cups.ts';
import { CUP_ROUNDS } from './cups.ts';
import type { EuropeanTier } from './europe.ts';
import { EUROPEAN_TIERS, europeanCompetition, isEuropeanTier } from './europe.ts';
import type { InternationalKind } from './international.ts';
import { GROUP_ROUNDS, INTERNATIONAL, MAX_INTERNATIONAL_MATCHES } from './international.ts';

/**
 * THE SEASON CALENDAR
 *
 * A season used to be a list of league fixtures and an index into it. With two
 * cups running alongside the league, "what do I play next" stops being a
 * property of one competition and becomes a property of the SEASON, so it needs
 * something that knows about all three.
 *
 * The calendar is a list of SLOTS, in order. Each slot names a competition and
 * a round. It is deliberately not a list of matches:
 *
 *   - A league slot always produces a match, and which one is already known.
 *   - A cup slot produces a match only if the player's club is still in that
 *     cup, and against an opponent nobody can know until the previous round has
 *     been played. If he is out, the slot is simply skipped.
 *
 * That is why the calendar stores rounds rather than fixtures, and why it is
 * computed rather than stored: it is a pure function of the league's length, so
 * it costs nothing to rebuild and cannot go stale against a save.
 *
 * The interleaving is fixed rather than random. A cup round lands at the same
 * point in the season every year, which makes the shape of a season learnable —
 * you come to know that the cup starts in early autumn and the final is played
 * near the end — and it means a career can be compared season to season.
 */

export type CompetitionKind = 'league' | CupKind | EuropeanTier | InternationalKind;

export interface CalendarSlot {
  competition: CompetitionKind;
  /** League round, or cup round, counting from 1. */
  round: number;
}

/**
 * After which league round each cup round is played.
 *
 * Spread through the season and interleaved with each other, so the two cups
 * never collide and neither is decided before the league has taken shape. The
 * finals sit late, but not last: a season should not end on a cup tie the
 * player may not even be in.
 */
export const NATIONAL_CUP_SCHEDULE: readonly number[] = [5, 11, 19, 26];
export const LEAGUE_CUP_SCHEDULE: readonly number[] = [8, 14, 22, 28];

/**
 * European nights, on their own dates.
 *
 * Interleaved with both domestic cups so nothing collides, and the last of them
 * sits before the final league round: a season should not end on a European
 * final the player may not even be in.
 */
export const EUROPEAN_SCHEDULE: readonly number[] = [4, 12, 18, 24];

/**
 * International breaks, and the tournament that ends the year.
 *
 * The three group matches are played during the season, on their own dates —
 * that is what an international break IS, and putting them anywhere else would
 * make playing for your country a thing that happens instead of club football
 * rather than alongside it.
 *
 * The two knockout rounds sit AFTER the final league round, because that is
 * when a tournament is played and because it gives a career a shape a club
 * season cannot: the league is decided, the cups are won, and then the last
 * thing that happens all year is a semi-final for your country.
 */
export const INTERNATIONAL_SCHEDULE: readonly number[] = [7, 16, 21];

export function cupSchedule(kind: CupKind): readonly number[] {
  return kind === 'nationalCup' ? NATIONAL_CUP_SCHEDULE : LEAGUE_CUP_SCHEDULE;
}

/**
 * The shape of a whole season, league rounds and cup rounds in playing order.
 *
 * `leagueRounds` is however many rounds the player's own league runs to, so a
 * league of a different size still produces a sensible calendar — the cup
 * rounds are clamped into it rather than dropping off the end.
 */
export function seasonCalendar(
  leagueRounds: number,
  internationalMatches = MAX_INTERNATIONAL_MATCHES,
): CalendarSlot[] {
  const slots: CalendarSlot[] = [];

  // Where each cup round falls, clamped so a short league cannot lose a round.
  const placed = new Map<number, CalendarSlot[]>();
  const place = (kind: CompetitionKind, schedule: readonly number[]) => {
    for (let i = 0; i < CUP_ROUNDS; i++) {
      const preferred = schedule[i] ?? leagueRounds;
      const after = Math.min(preferred, Math.max(1, leagueRounds - (CUP_ROUNDS - 1 - i)));
      const list = placed.get(after) ?? [];
      list.push({ competition: kind, round: i + 1 });
      placed.set(after, list);
    }
  };
  place('nationalCup', NATIONAL_CUP_SCHEDULE);
  place('leagueCup', LEAGUE_CUP_SCHEDULE);
  // One set of European dates, shared by all three competitions: a club is only
  // ever in one of them, so they can never collide with each other.
  for (const tier of EUROPEAN_TIERS) place(tier, EUROPEAN_SCHEDULE);

  // Group matches, on international-break dates of their own.
  for (let i = 0; i < GROUP_ROUNDS; i++) {
    const preferred = INTERNATIONAL_SCHEDULE[i] ?? leagueRounds;
    const after = Math.min(preferred, Math.max(1, leagueRounds - (GROUP_ROUNDS - 1 - i)));
    const list = placed.get(after) ?? [];
    list.push({ competition: INTERNATIONAL, round: i + 1 });
    placed.set(after, list);
  }

  for (let round = 1; round <= leagueRounds; round++) {
    slots.push({ competition: 'league', round });
    for (const slot of placed.get(round) ?? []) slots.push(slot);
  }

  // The tournament closes the year, after every club competition is settled.
  for (let i = GROUP_ROUNDS; i < internationalMatches; i++) {
    slots.push({ competition: INTERNATIONAL, round: i + 1 });
  }

  return slots;
}

/**
 * How many matches a season could contain at most: league, both cups, and ONE
 * European competition.
 *
 * NOT the length of the calendar. The calendar carries a slot for each of the
 * three European tiers on the same dates, because it is a pure function of the
 * league's length and cannot know which one the club is in. At most one of
 * those three is ever playable, so the calendar is longer than any season can
 * be — in the same way it carries cup rounds for a cup you may go out of.
 */
export function maximumMatches(leagueRounds: number): number {
  return leagueRounds + CUP_ROUNDS * 3 + MAX_INTERNATIONAL_MATCHES;
}

/** How many slots the calendar holds, playable or not. */
export function calendarLength(leagueRounds: number): number {
  return leagueRounds + CUP_ROUNDS * (2 + EUROPEAN_TIERS.length) + MAX_INTERNATIONAL_MATCHES;
}

/**
 * How many rounds of a knockout have been played once the league has played
 * `leagueRoundsPlayed` of its own.
 *
 * Read off the calendar rather than off the schedule constants, because the
 * schedules are CLAMPED into a short league — asking the calendar is the only
 * answer that stays right for a league of any length. This is what lets a
 * competition nobody is watching be shown as far as it has actually got: a
 * background cup run to a winner in September would tell a player in October
 * who lifted a trophy that has not been played for.
 *
 * `Infinity` for the rounds played means the season is over, and every round
 * has therefore been reached.
 */
export function knockoutRoundsPlayed(
  competition: CompetitionKind,
  leagueRounds: number,
  leagueRoundsPlayed: number,
): number {
  let played = 0;
  for (const slot of seasonCalendar(leagueRounds)) {
    // A knockout slot placed "after league round N" sits behind that league
    // round in the calendar, so it counts as played the moment N does.
    if (slot.competition === 'league') {
      if (slot.round > leagueRoundsPlayed) break;
      continue;
    }
    if (slot.competition === competition) played = slot.round;
  }
  return played;
}

/** Human label for a competition, without needing a country. */
export function competitionLabel(competition: CompetitionKind): string {
  if (competition === 'league') return 'League';
  if (competition === 'nationalCup') return 'Cup';
  if (competition === 'leagueCup') return 'League Cup';
  if (competition === INTERNATIONAL) return 'International';
  return europeanCompetition(competition).short;
}

export function isInternational(competition: CompetitionKind): competition is InternationalKind {
  return competition === INTERNATIONAL;
}

/** Anything decided by a bracket rather than a table. */
export function isKnockout(competition: CompetitionKind): boolean {
  return competition !== 'league';
}

export function isCup(competition: CompetitionKind): competition is CupKind {
  return competition === 'nationalCup' || competition === 'leagueCup';
}

export function isEuropean(competition: CompetitionKind): competition is EuropeanTier {
  return competition !== INTERNATIONAL && isEuropeanTier(competition);
}
