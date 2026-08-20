import { describe, expect, it } from 'vitest';
import { TEAMS, COUNTRIES, getTeam, teamsInCountry } from '../src/data/gameData.ts';
import {
  UNKNOWN_COUNTRY,
  allClubIds,
  countriesByPrestige,
  countryPrestige,
  getCountry,
  initialLeagues,
  isMoveAbroad,
  leagueMembers,
  locateClub,
  playedCountries,
  prestigeStep,
} from '../src/core/career/countries.ts';

describe('the world as data', () => {
  it('has twelve countries of sixteen clubs each', () => {
    expect(COUNTRIES).toHaveLength(12);
    expect(TEAMS).toHaveLength(192);
    for (const country of COUNTRIES) {
      expect(teamsInCountry(country.id), country.id).toHaveLength(16);
    }
  });

  it('gives every club a country that exists', () => {
    for (const team of TEAMS) {
      expect(COUNTRIES.some((c) => c.id === team.country), team.id).toBe(true);
    }
  });

  it('gives every club a unique id and every country a unique tag', () => {
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(TEAMS.length);
    expect(new Set(COUNTRIES.map((c) => c.short)).size).toBe(COUNTRIES.length);
  });

  it('ranks the leagues into a ladder worth climbing', () => {
    const ranked = countriesByPrestige();
    expect(ranked[0]!.id).toBe('england');
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.prestige).toBeGreaterThanOrEqual(ranked[i]!.prestige);
    }
    // A real spread, or the whole idea of moving country means nothing.
    expect(ranked[0]!.prestige - ranked[ranked.length - 1]!.prestige).toBeGreaterThan(0.3);
  });

  it('makes a strong league genuinely stronger than a weak one', () => {
    const best = (id: string) =>
      Math.max(...teamsInCountry(id).map((t) => t.ratings.attack));
    expect(best('spain')).toBeGreaterThan(best('scotland'));
    expect(best('england')).toBeGreaterThan(best('netherlands'));
  });

  it('describes an unknown country rather than throwing', () => {
    expect(getCountry('atlantis')).toBe(UNKNOWN_COUNTRY);
    expect(countryPrestige('atlantis')).toBe(UNKNOWN_COUNTRY.prestige);
  });
});

describe('placing clubs in the world', () => {
  const leagues = initialLeagues(TEAMS);

  it('puts every club in exactly one league', () => {
    const all = allClubIds(leagues);
    expect(all).toHaveLength(TEAMS.length);
    expect(new Set(all).size).toBe(TEAMS.length);
  });

  it('gives every country one tier of sixteen', () => {
    for (const country of COUNTRIES) {
      expect(leagues[country.id], country.id).toHaveLength(1);
      expect(leagueMembers(leagues, country.id, 1), country.id).toHaveLength(16);
    }
  });

  it('locates a club by country and tier', () => {
    const spanish = teamsInCountry('spain')[0]!;
    expect(locateClub(leagues, spanish.id)).toEqual({ countryId: 'spain', division: 1 });
    expect(locateClub(leagues, 'no-such-club')).toBeNull();
  });

  it('returns an empty league rather than throwing for one that does not exist', () => {
    expect(leagueMembers(leagues, 'atlantis')).toEqual([]);
    expect(leagueMembers(leagues, 'spain', 9)).toEqual([]);
  });

  it('lists every country that has a league, best watched first', () => {
    const played = playedCountries(leagues);
    expect(played).toHaveLength(12);
    expect(played[0]).toBe('england');
  });

  it('places a club with a nonsense tier rather than losing it', () => {
    const broken = [{ ...getTeam(TEAMS[0]!.id), division: 0 }];
    const built = initialLeagues(broken);
    expect(allClubIds(built)).toEqual([broken[0]!.id]);
  });
});

describe('moving between countries', () => {
  it('knows which way a move goes', () => {
    expect(prestigeStep('scotland', 'england')).toBeGreaterThan(0);
    expect(prestigeStep('england', 'scotland')).toBeLessThan(0);
    expect(prestigeStep('england', 'england')).toBe(0);
  });

  it('knows when a move crosses a border', () => {
    expect(isMoveAbroad('england', 'spain')).toBe(true);
    expect(isMoveAbroad('spain', 'spain')).toBe(false);
  });
});
