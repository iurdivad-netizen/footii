import { describe, expect, it } from 'vitest';
import { getTeam, TEAMS } from '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import {
  LOAN_MAX_AGE,
  LOAN_PLAYING_TIME,
  loanPitch,
  loanRole,
  loanReport,
  needsLoan,
  rankLoanClubs,
  suitableLoanClub,
} from '../src/core/career/loan.ts';
import { squadLevel } from '../src/core/career/transfers.ts';

const kid = (overrides: Partial<Player> = {}): Player => ({
  ...createPlayer({
    name: 'Prospect',
    position: 'ST',
    age: 19,
    baseAttribute: 58,
    potentialAbility: 86,
    attributes: {},
  }),
  ...overrides,
});

// A quiet season: four league matches out of thirty.
const quiet = { leagueMatches: 4, seasonLength: 30 };
const busy = { leagueMatches: 26, seasonLength: 30 };
const big = getTeam('castleford-royals');
const small = getTeam('northport-city');

describe('who needs a loan', () => {
  it('offers one to a young player who is not getting games at a big club', () => {
    expect(needsLoan(kid(), big, quiet)).toBe(true);
  });

  it('does not offer one to a player who is already playing', () => {
    expect(needsLoan(kid(), big, busy)).toBe(false);
  });

  it('does not offer one past the age where it would help', () => {
    // Beyond this he is sold, not sent out. A twenty-eight-year-old going on
    // loan to get games is a different story from the one this models.
    expect(needsLoan(kid({ age: LOAN_MAX_AGE + 1 }), big, quiet)).toBe(false);
    expect(needsLoan(kid({ age: LOAN_MAX_AGE }), big, quiet)).toBe(true);
  });

  it('does not offer one to a player his club considers a first-team player', () => {
    // Being out of the side at a club that rates you is a fight worth having.
    const good = kid({ ...kid(), age: 21 });
    expect(needsLoan(good, small, quiet)).toBe(false);
  });

  it('reads a season with no league at all as no reason to go', () => {
    expect(needsLoan(kid(), big, { leagueMatches: 0, seasonLength: 0 })).toBe(false);
  });

  it('draws the line where the constant says it does', () => {
    const length = 40;
    const under = Math.floor(LOAN_PLAYING_TIME * length) - 1;
    const over = Math.ceil(LOAN_PLAYING_TIME * length) + 1;
    expect(needsLoan(kid(), big, { leagueMatches: under, seasonLength: length })).toBe(true);
    expect(needsLoan(kid(), big, { leagueMatches: over, seasonLength: length })).toBe(false);
  });
});

describe('where he goes', () => {
  it('only considers clubs he would walk into', () => {
    // A loan that repeats the problem is worse than no loan: another year of
    // watching, and a year older.
    const strong = kid({ ...kid(), age: 21 });
    for (const club of TEAMS) {
      if (!suitableLoanClub(strong, club)) continue;
      expect(squadLevel(club)).toBeLessThan(90);
    }
  });

  it('rules out a club so far below him that the season teaches him nothing', () => {
    const weakest = [...TEAMS].sort((a, b) => squadLevel(a) - squadLevel(b))[0]!;
    const excellent = createPlayer({
      name: 'Too good',
      position: 'ST',
      age: 21,
      baseAttribute: 92,
      attributes: {},
    });
    expect(suitableLoanClub(excellent, weakest)).toBe(false);
  });

  it('ranks the strongest club he would still start at first', () => {
    const ranked = rankLoanClubs(kid({ ...kid(), age: 21 }), TEAMS);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(squadLevel(ranked[i - 1]!)).toBeGreaterThanOrEqual(squadLevel(ranked[i]!));
    }
  });

  it('never sends him somewhere he would be cover all over again', () => {
    for (const club of rankLoanClubs(kid(), TEAMS)) {
      expect(loanRole(kid(), club)).not.toBe('squad');
    }
  });

  it('says something about every club it would send him to', () => {
    for (const club of rankLoanClubs(kid(), TEAMS).slice(0, 8)) {
      expect(loanPitch(kid(), club)).toContain(club.name);
    }
  });
});

describe('how a loan reads', () => {
  it('names both clubs, because he belongs to one and plays for the other', () => {
    const report = loanReport({
      parentClubId: 'castleford-royals',
      parentClubName: 'Castleford Royals',
      clubId: 'northport-city',
      clubName: 'Northport City',
      role: 'starter',
      season: 3,
    });
    expect(report).toContain('Northport City');
    expect(report).toContain('Castleford Royals');
  });
});
