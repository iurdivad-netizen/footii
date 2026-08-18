import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { createTeam } from '../src/core/team/team.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import type { SeasonStats } from '../src/core/career/seasonStats.ts';
import {
  RENEWAL_THRESHOLD,
  WAGE_WEEKS,
  acceptRenewal,
  advanceContract,
  createContract,
  describeContract,
  fallbackContract,
  isExpired,
  isFinalSeason,
  renewalOffer,
  seasonEarnings,
} from '../src/core/career/contracts.ts';
import {
  WAGE_TOLERANCE,
  contractYears,
  offeredWage,
  wageAcceptable,
  wageDemand,
} from '../src/core/career/transfers.ts';

function striker(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({
      name: 'Contract Test',
      position: 'ST',
      age: 26,
      baseAttribute: 68,
      reputation: 55,
      attributes: { finishing: 78, movement: 74, composure: 72 },
    }),
    ...overrides,
  };
}

const bigClub = createTeam({ name: 'Big Club', base: 80, ratings: { attack: 80, midfield: 80, defence: 80 } });
const smallClub = createTeam({ name: 'Small Club', base: 44, ratings: { attack: 44, midfield: 44, defence: 44 } });

function season(overrides: Partial<SeasonStats> = {}): SeasonStats {
  return { ...createSeasonStats(), matches: 30, goals: 14, assists: 6, ...overrides };
}

describe('what a deal is worth', () => {
  it('pays more at a bigger club', () => {
    expect(offeredWage(striker(), bigClub, 'starter')).toBeGreaterThan(
      offeredWage(striker(), smallClub, 'starter'),
    );
  });

  it('pays less in a lower division, however good the club', () => {
    const top = offeredWage(striker(), bigClub, 'starter', 1);
    const second = offeredWage(striker(), bigClub, 'starter', 0.62);
    expect(second).toBeLessThan(top);
  });

  it('pays a star more than a squad player', () => {
    expect(offeredWage(striker(), bigClub, 'star')).toBeGreaterThan(
      offeredWage(striker(), bigClub, 'squad'),
    );
  });
});

describe('what a player expects', () => {
  it('rises with reputation, not only ability', () => {
    const known = striker({ reputation: 85 });
    const unknown = striker({ reputation: 20 });
    expect(wageDemand(known)).toBeGreaterThan(wageDemand(unknown));
  });

  it('is lower in a division nobody is watching', () => {
    expect(wageDemand(striker(), 0.62)).toBeLessThan(wageDemand(striker(), 1));
  });

  it('accepts slightly less than the asking price, but not much less', () => {
    const demand = 100;
    expect(wageAcceptable(demand, demand)).toBe(true);
    expect(wageAcceptable(demand * WAGE_TOLERANCE, demand)).toBe(true);
    expect(wageAcceptable(demand * WAGE_TOLERANCE - 0.01, demand)).toBe(false);
  });

  it('prices a famous player out of a club that cannot pay him', () => {
    // The whole point of the wage gate: fame is expensive to live up to.
    const star = striker({ reputation: 95, age: 27 });
    const wage = offeredWage(star, smallClub, 'star');
    expect(wageAcceptable(wage, wageDemand(star))).toBe(false);
  });
});

describe('the length of a deal', () => {
  it('gets shorter as a career runs out', () => {
    expect(contractYears(striker({ age: 20 }))).toBeGreaterThan(contractYears(striker({ age: 26 })));
    expect(contractYears(striker({ age: 26 }))).toBeGreaterThan(contractYears(striker({ age: 31 })));
    expect(contractYears(striker({ age: 34 }))).toBe(1);
  });
});

describe('a contract running down', () => {
  it('starts on the terms the club would offer', () => {
    const contract = createContract(striker(), bigClub, 'starter', 3);
    expect(contract.clubId).toBe(bigClub.id);
    expect(contract.wage).toBe(offeredWage(striker(), bigClub, 'starter'));
    expect(contract.signedSeason).toBe(3);
    expect(isExpired(contract)).toBe(false);
  });

  it('banks a season of wages and takes a year off the clock', () => {
    const contract = createContract(striker(), bigClub, 'starter', 1, 1, 3);
    const earned = advanceContract(contract);
    expect(earned).toBeCloseTo((contract.wage * WAGE_WEEKS) / 1000, 1);
    expect(contract.yearsRemaining).toBe(2);
  });

  it('expires once the clock reaches zero, and never goes negative', () => {
    const contract = createContract(striker(), bigClub, 'starter', 1, 1, 1);
    advanceContract(contract);
    expect(isExpired(contract)).toBe(true);
    advanceContract(contract);
    expect(contract.yearsRemaining).toBe(0);
  });

  it('flags the final season before it becomes a problem', () => {
    const contract = createContract(striker(), bigClub, 'starter', 1, 1, 2);
    expect(isFinalSeason(contract)).toBe(false);
    advanceContract(contract);
    expect(isFinalSeason(contract)).toBe(true);
  });

  it('describes itself in terms a player would be told', () => {
    const contract = createContract(striker(), bigClub, 'starter', 1, 1, 3);
    expect(describeContract(contract)).toContain('3 seasons remaining');
    contract.yearsRemaining = 1;
    expect(describeContract(contract)).toContain('Final season');
    contract.yearsRemaining = 0;
    expect(describeContract(contract)).toContain('Expired');
  });

  it('values a season at fifty-two weeks of wages', () => {
    const contract = createContract(striker(), bigClub, 'starter', 1);
    expect(seasonEarnings(contract)).toBeCloseTo((contract.wage * 52) / 1000, 2);
  });
});

describe('renewing', () => {
  it('offers new terms to a player the club still wants', () => {
    const player = striker({ reputation: 60 });
    const offer = renewalOffer({
      player,
      club: smallClub,
      stats: season(),
      season: 4,
      prestige: 0.62,
    });
    expect(offer).not.toBeNull();
    expect(offer!.clubId).toBe(smallClub.id);
    expect(offer!.years).toBe(contractYears(player));
    expect(offer!.interest).toBeGreaterThanOrEqual(RENEWAL_THRESHOLD);
  });

  it('offers nothing to a player the club has no use for', () => {
    // Far below the squad's level: the club would never play him, so it does
    // not pretend to want him at renewal time either.
    const journeyman = striker({ reputation: 10, age: 35 });
    journeyman.attributes = { ...journeyman.attributes };
    for (const key of Object.keys(journeyman.attributes) as (keyof typeof journeyman.attributes)[]) {
      journeyman.attributes[key] = 30;
    }
    expect(
      renewalOffer({ player: journeyman, club: bigClub, stats: season(), season: 4, prestige: 1 }),
    ).toBeNull();
  });

  it('loses a player it cannot pay, however much it wants him', () => {
    const star = striker({ reputation: 96, age: 26 });
    expect(
      renewalOffer({ player: star, club: smallClub, stats: season(), season: 4, prestige: 0.62 }),
    ).toBeNull();
  });

  it('turns an accepted renewal into the deal he is now on', () => {
    const offer = renewalOffer({
      player: striker(),
      club: smallClub,
      stats: season(),
      season: 6,
      prestige: 0.62,
    })!;
    const contract = acceptRenewal(offer);
    expect(contract.clubId).toBe(offer.clubId);
    expect(contract.wage).toBe(offer.wage);
    expect(contract.yearsRemaining).toBe(offer.years);
    expect(contract.signedSeason).toBe(6);
    expect(isExpired(contract)).toBe(false);
  });
});

describe('the safety net', () => {
  it('is worse than a negotiated deal, and only ever one season', () => {
    const player = striker();
    const fallback = fallbackContract(player, smallClub, 5);
    expect(fallback.yearsRemaining).toBe(1);
    expect(fallback.wage).toBeLessThan(offeredWage(player, smallClub, 'starter'));
    expect(isExpired(fallback)).toBe(false);
  });

  it('always produces a usable contract, however finished the player is', () => {
    const finished = striker({ age: 39, reputation: 1 });
    const fallback = fallbackContract(finished, smallClub, 12);
    expect(fallback.wage).toBeGreaterThanOrEqual(1);
    expect(fallback.clubId).toBe(smallClub.id);
  });
});
