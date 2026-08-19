import { round } from '../util/math.ts';
import type { CompetitionKind } from './calendar.ts';
import type { SeasonStats } from './seasonStats.ts';
import { averageRating } from './seasonStats.ts';

/**
 * CAREER RECORDS
 *
 * Season statistics answer "how is this year going". They are the wrong shape
 * for the question a career actually raises after a decade, which is "what kind
 * of footballer was I".
 *
 * Totals cannot answer it. Two players with 180 goals are not the same player if
 * one of them scored three in a match eleven times and the other never scored
 * more than one. What distinguishes a career is its PEAKS and its RUNS — the
 * afternoons that were not like the others — and none of that survives being
 * added up.
 *
 * So this counts the things that only make sense per match:
 *
 *   HOW BIG did a single afternoon get? Braces, hat-tricks, four- and five-goal
 *            games, the best match rating ever given, how many times a perfect
 *            ten was reached.
 *   HOW LONG did it keep going? The longest run of consecutive scoring matches,
 *            and of matches unbeaten.
 *   WHERE did it happen? The same totals split by competition, because forty
 *            league goals and forty European goals are different careers.
 *
 * Everything is accumulated as it happens, one match at a time. Nothing here can
 * be recomputed from the season statistics after the fact, which is exactly why
 * it has to be kept.
 */

/** Goals in a single match, from a brace upward. */
export interface MatchHaulRecords {
  /** Exactly two. */
  braces: number;
  /** Exactly three. */
  hatTricks: number;
  /** Exactly four. */
  fourGoalGames: number;
  /** Five or more — the afternoons people remember. */
  fivePlusGoalGames: number;
  /** The most ever scored in one match. */
  best: number;
}

/** Match ratings, at the top of the scale. */
export interface RatingRecords {
  /** A perfect ten. */
  perfect: number;
  /** Nine or better, the perfect tens included. */
  nineOrBetter: number;
  /** Eight or better. */
  eightOrBetter: number;
  /** The highest ever given. */
  best: number;
}

/** A run of matches, still going or finished. */
export interface StreakRecord {
  current: number;
  longest: number;
}

/** Appearances and returns in one competition. */
export interface CompetitionTotals {
  matches: number;
  goals: number;
  assists: number;
  ratingTotal: number;
}

export interface CareerRecords {
  hauls: MatchHaulRecords;
  ratings: RatingRecords;
  /** Consecutive matches in which he scored. */
  scoringStreak: StreakRecord;
  /** Consecutive matches his club did not lose. */
  unbeatenStreak: StreakRecord;
  /** Split by competition, because where a goal was scored matters. */
  byCompetition: Partial<Record<CompetitionKind, CompetitionTotals>>;
  /** Seasons reaching ten league goals, and twenty. */
  tenGoalSeasons: number;
  twentyGoalSeasons: number;
  /** The best single season, by goals. */
  bestSeasonGoals: number;
  /** Goals and assists in one match together, at its highest. */
  bestContributionsInAMatch: number;
}

/** A perfect ten. Floating point, so this is a threshold rather than equality. */
export const PERFECT_RATING = 9.95;

export function createCareerRecords(): CareerRecords {
  return {
    hauls: { braces: 0, hatTricks: 0, fourGoalGames: 0, fivePlusGoalGames: 0, best: 0 },
    ratings: { perfect: 0, nineOrBetter: 0, eightOrBetter: 0, best: 0 },
    scoringStreak: { current: 0, longest: 0 },
    unbeatenStreak: { current: 0, longest: 0 },
    byCompetition: {},
    tenGoalSeasons: 0,
    twentyGoalSeasons: 0,
    bestSeasonGoals: 0,
    bestContributionsInAMatch: 0,
  };
}

export interface MatchRecordInput {
  competition: CompetitionKind;
  goals: number;
  assists: number;
  /** Match rating, 1-10. */
  rating: number;
  /** 1 win, 0 draw, -1 defeat. */
  result: number;
}

/**
 * Fold one finished match into the record book.
 *
 * Called for every match, played or skipped, in every competition — a hat-trick
 * is a hat-trick whether or not you watched it.
 */
export function recordMatch(records: CareerRecords, input: MatchRecordInput): void {
  const { goals, assists, rating } = input;

  if (goals === 2) records.hauls.braces += 1;
  else if (goals === 3) records.hauls.hatTricks += 1;
  else if (goals === 4) records.hauls.fourGoalGames += 1;
  else if (goals >= 5) records.hauls.fivePlusGoalGames += 1;
  records.hauls.best = Math.max(records.hauls.best, goals);

  if (rating >= PERFECT_RATING) records.ratings.perfect += 1;
  if (rating >= 9) records.ratings.nineOrBetter += 1;
  if (rating >= 8) records.ratings.eightOrBetter += 1;
  records.ratings.best = Math.max(records.ratings.best, round(rating, 1));

  records.bestContributionsInAMatch = Math.max(
    records.bestContributionsInAMatch,
    goals + assists,
  );

  advanceStreak(records.scoringStreak, goals > 0);
  advanceStreak(records.unbeatenStreak, input.result >= 0);

  const totals = (records.byCompetition[input.competition] ??= {
    matches: 0,
    goals: 0,
    assists: 0,
    ratingTotal: 0,
  });
  totals.matches += 1;
  totals.goals += goals;
  totals.assists += assists;
  totals.ratingTotal += rating;
}

/** Extend a run, or end it. The longest is never lowered. */
function advanceStreak(streak: StreakRecord, continued: boolean): void {
  streak.current = continued ? streak.current + 1 : 0;
  streak.longest = Math.max(streak.longest, streak.current);
}

/**
 * Fold a completed season into the record book.
 *
 * Judged on LEAGUE goals, so a twenty-goal season means the same thing in every
 * career — a cup run is a different achievement and is counted separately.
 */
export function recordSeason(records: CareerRecords, leagueStats: SeasonStats): void {
  if (leagueStats.goals >= 10) records.tenGoalSeasons += 1;
  if (leagueStats.goals >= 20) records.twentyGoalSeasons += 1;
  records.bestSeasonGoals = Math.max(records.bestSeasonGoals, leagueStats.goals);
}

/**
 * End a run of matches without ending a career.
 *
 * A streak does not survive a change of club or a summer: "eleven matches in a
 * row" means eleven consecutive matches for the same side in the same season,
 * not a number that quietly spans a transfer and three months off.
 */
export function breakStreaks(records: CareerRecords): void {
  records.scoringStreak.current = 0;
  records.unbeatenStreak.current = 0;
}

/** Totals across every competition. */
export function lifetimeTotals(records: CareerRecords): CompetitionTotals {
  const total: CompetitionTotals = { matches: 0, goals: 0, assists: 0, ratingTotal: 0 };
  for (const entry of Object.values(records.byCompetition)) {
    if (!entry) continue;
    total.matches += entry.matches;
    total.goals += entry.goals;
    total.assists += entry.assists;
    total.ratingTotal += entry.ratingTotal;
  }
  return total;
}

/** Average rating over a set of totals, or 0 if nothing has been played. */
export function averageOf(totals: CompetitionTotals): number {
  return totals.matches === 0 ? 0 : round(totals.ratingTotal / totals.matches, 2);
}

/** One line for a milestone worth showing, or nothing if it never happened. */
export interface Milestone {
  label: string;
  value: number;
  /** Context, shown under the number. */
  note: string;
}

/**
 * The record book as a list worth reading.
 *
 * Deliberately omits anything that never happened: a career that has not had a
 * five-goal game should not be told it has none, because a column of zeroes
 * hides the two lines that are actually interesting.
 */
export function milestones(records: CareerRecords): Milestone[] {
  const list: Milestone[] = [];
  const add = (label: string, value: number, note: string) => {
    if (value > 0) list.push({ label, value, note });
  };

  add('Braces', records.hauls.braces, 'Two in a match');
  add('Hat-tricks', records.hauls.hatTricks, 'Three in a match');
  add('Four-goal games', records.hauls.fourGoalGames, 'Four in a match');
  add('Five or more', records.hauls.fivePlusGoalGames, 'The ones people remember');
  add('Perfect tens', records.ratings.perfect, 'A flawless match rating');
  add('Nines or better', records.ratings.nineOrBetter, 'Outstanding performances');
  add('Eights or better', records.ratings.eightOrBetter, 'Very good performances');
  add(
    'Longest scoring run',
    records.scoringStreak.longest,
    records.scoringStreak.current > 1
      ? `Currently on ${records.scoringStreak.current}`
      : 'Consecutive matches scoring',
  );
  add(
    'Longest unbeaten run',
    records.unbeatenStreak.longest,
    records.unbeatenStreak.current > 1
      ? `Currently on ${records.unbeatenStreak.current}`
      : 'Consecutive matches without defeat',
  );
  add('Best haul', records.hauls.best, 'Most goals in one match');
  add('Best rating', records.ratings.best, 'Highest ever given');
  add('Best season', records.bestSeasonGoals, 'League goals in a season');
  add('Ten-goal seasons', records.tenGoalSeasons, 'League goals');
  add('Twenty-goal seasons', records.twentyGoalSeasons, 'League goals');

  return list;
}

/**
 * A one-line summary of a season, for a player who wants the headline.
 * Used by the review screen alongside the full statistics.
 */
export function describeSeason(stats: SeasonStats): string {
  if (stats.matches === 0) return 'A season without football.';
  const rating = averageRating(stats);
  const contributions = stats.goals + stats.assists;
  if (contributions >= 25) return `${contributions} goal contributions — a season to remember.`;
  if (stats.goals >= 15) return `${stats.goals} goals, and a ${rating.toFixed(2)} average rating.`;
  if (rating >= 7.4) return `Consistently good: ${rating.toFixed(2)} across ${stats.matches} matches.`;
  if (rating <= 6) return `A hard year — ${rating.toFixed(2)} across ${stats.matches} matches.`;
  return `${stats.matches} matches, ${stats.goals} goals, ${stats.assists} assists.`;
}
