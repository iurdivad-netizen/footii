import { describe, expect, it } from 'vitest';
import {
  SEASON_WEEK_CAP,
  seasonCalendar,
  seasonWeeks,
  NATIONAL_CUP_SCHEDULE,
  LEAGUE_CUP_SCHEDULE,
  EUROPEAN_SCHEDULE,
} from '../src/core/career/calendar.ts';
import { GROUP_ROUNDS, INTERNATIONAL, MAX_INTERNATIONAL_MATCHES } from '../src/core/career/international.ts';
import { SUPER_CUP } from '../src/core/career/superCup.ts';
import { CONGESTED_RECOVERY, FITNESS_RECOVERY, fitnessRecovery } from '../src/core/career/career.ts';

/**
 * THE SEASON IN WEEKS
 *
 * A slot used to be the only unit of time the calendar had, which meant every
 * match was equally spaced by definition and a new competition could only ever
 * make the season longer. Weeks separate "how many matches" from "how long the
 * season is": several slots share a week, so competitions are added by filling
 * midweeks rather than by extending the year.
 *
 * These are the invariants that has to keep.
 */
const LEAGUE_SIZES = [14, 22, 30, 38];

describe('a season measured in weeks', () => {
  it('never runs past the cap, whatever the league is', () => {
    for (const rounds of LEAGUE_SIZES) {
      expect(seasonWeeks(rounds)).toBeLessThanOrEqual(SEASON_WEEK_CAP);
      for (const slot of seasonCalendar(rounds)) {
        expect(slot.week).toBeLessThanOrEqual(SEASON_WEEK_CAP);
      }
    }
  });

  it('holds more matches than it has weeks, which is the whole point', () => {
    // If this ever inverts, competitions have gone back to costing season
    // length rather than midweeks.
    const calendar = seasonCalendar(30);
    expect(calendar.length).toBeGreaterThan(seasonWeeks(30));
  });

  it('runs weeks forward, never backward, through the calendar', () => {
    for (const rounds of LEAGUE_SIZES) {
      let last = 0;
      for (const slot of seasonCalendar(rounds)) {
        expect(slot.week).toBeGreaterThanOrEqual(last);
        last = slot.week;
      }
    }
  });

  it('starts every week at one or more, so no slot is outside the season', () => {
    for (const rounds of LEAGUE_SIZES) {
      for (const slot of seasonCalendar(rounds)) expect(slot.week).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives the super cup a week of its own, before the league starts', () => {
    const calendar = seasonCalendar(30);
    const superCup = calendar.filter((s) => s.competition === SUPER_CUP);
    expect(superCup).toHaveLength(1);
    expect(superCup[0]!.week).toBe(1);
    // Nothing else is played that week.
    expect(calendar.filter((s) => s.week === 1)).toHaveLength(1);
  });

  it('plays a cup tie or a European night in the SAME week as a league round', () => {
    // A midweek fixture, which is the mechanism the whole change rests on.
    const calendar = seasonCalendar(30);
    const leagueWeeks = new Set(
      calendar.filter((s) => s.competition === 'league').map((s) => s.week),
    );
    const midweek = calendar.filter(
      (s) => s.competition !== 'league' && s.competition !== SUPER_CUP && s.round <= GROUP_ROUNDS,
    );
    expect(midweek.length).toBeGreaterThan(0);
    for (const slot of midweek) {
      if (slot.competition === INTERNATIONAL && slot.round > GROUP_ROUNDS) continue;
      expect(leagueWeeks.has(slot.week)).toBe(true);
    }
  });

  it('never leaves more than a fortnight between league rounds', () => {
    // Without the cap on spacing, a small league would spread itself so thin
    // that a player would never be tired and the fitness model would switch off.
    for (const rounds of LEAGUE_SIZES) {
      const weeks = seasonCalendar(rounds)
        .filter((s) => s.competition === 'league')
        .map((s) => s.week);
      for (let i = 1; i < weeks.length; i++) {
        expect(weeks[i]! - weeks[i - 1]!).toBeLessThanOrEqual(2);
      }
    }
  });

  it('gives each international knockout round a week to itself at the end', () => {
    const calendar = seasonCalendar(30, MAX_INTERNATIONAL_MATCHES);
    const knockout = calendar.filter(
      (s) => s.competition === INTERNATIONAL && s.round > GROUP_ROUNDS,
    );
    expect(knockout.length).toBeGreaterThan(0);
    const lastLeagueWeek = Math.max(
      ...calendar.filter((s) => s.competition === 'league').map((s) => s.week),
    );
    const weeks = knockout.map((s) => s.week);
    expect(new Set(weeks).size).toBe(knockout.length);
    for (const week of weeks) expect(week).toBeGreaterThan(lastLeagueWeek);
  });

  it('reports the last week actually used, not the cap', () => {
    for (const rounds of LEAGUE_SIZES) {
      const calendar = seasonCalendar(rounds);
      const last = Math.max(...calendar.map((s) => s.week));
      expect(seasonWeeks(rounds)).toBe(last);
    }
    // A short league genuinely finishes early rather than being padded out.
    expect(seasonWeeks(14)).toBeLessThan(SEASON_WEEK_CAP);
  });

  it('keeps every competition it had before, on the same schedule', () => {
    // Weeks were added to the slots, not instead of them: adding a clock must
    // not have quietly dropped a cup round.
    const calendar = seasonCalendar(30);
    expect(calendar.filter((s) => s.competition === 'nationalCup')).toHaveLength(
      NATIONAL_CUP_SCHEDULE.length,
    );
    expect(calendar.filter((s) => s.competition === 'leagueCup')).toHaveLength(
      LEAGUE_CUP_SCHEDULE.length,
    );
    expect(calendar.filter((s) => s.competition === 'championsLeague')).toHaveLength(
      EUROPEAN_SCHEDULE.length,
    );
  });
});

describe('what a week is worth in fitness', () => {
  it('recovers exactly what it always did across one clear week', () => {
    // The median case must be untouched, or every existing career is retuned.
    expect(fitnessRecovery(1)).toBe(FITNESS_RECOVERY);
  });

  it('recovers far less when the next match is the same week', () => {
    expect(fitnessRecovery(0)).toBe(CONGESTED_RECOVERY);
    expect(fitnessRecovery(0)).toBeLessThan(fitnessRecovery(1));
  });

  it('recovers more across a rest week than a playing one', () => {
    expect(fitnessRecovery(2)).toBeGreaterThan(fitnessRecovery(1));
  });

  it('treats a negative gap as congestion rather than as negative rest', () => {
    // Defensive: a gap can only be negative if a caller has its slots the wrong
    // way round, and healing a player for that would be worse than not.
    expect(fitnessRecovery(-3)).toBe(CONGESTED_RECOVERY);
  });
});
