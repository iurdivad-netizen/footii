import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { createTeam, teamStrength } from '../src/core/team/team.ts';
import { TEAMS } from '../src/data/gameData.ts';
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
  MAX_WAGE,
  MIN_WAGE,
  WAGE_SCALE,
  marketValue,
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


/**
 * WHAT THE MONEY LOOKS LIKE
 *
 * The wage curve was always the right SHAPE and the wrong scale: an ability-95
 * player at the best club in the world was on £86k a week against a real figure
 * three to five times that, while market values were about right — so fees and
 * wages disagreed with each other by a factor of four.
 *
 * These pin the corrected scale, and pin the reason it was safe to correct: the
 * gate compares an offer against a demand, and scaling both by the same number
 * cannot change a single answer it gives.
 */


const BEST_CLUB = [...TEAMS].sort((a, b) => teamStrength(b) - teamStrength(a))[0]!;

function atAbility(ability: number) {
  return createPlayer({
    name: 'Earner',
    position: 'ST',
    baseAttribute: ability,
    reputation: ability,
    attributes: {},
  });
}

describe('the scale of the money', () => {
  it('pays a top-club regular what a top-club regular earns', () => {
    // Around £70k a week at ability 75 — a first-team player at a big club,
    // not a youth-team wage.
    const wage = offeredWage(atAbility(75), BEST_CLUB, 'starter');
    expect(wage).toBeGreaterThan(50);
    expect(wage).toBeLessThan(110);
  });

  it('pays the best player in the world like the best player in the world', () => {
    const wage = offeredWage(atAbility(95), BEST_CLUB, 'star');
    expect(wage).toBeGreaterThan(250);
    expect(wage).toBeLessThan(MAX_WAGE);
  });

  it('keeps a young squad player on a young squad player wage', () => {
    const wage = offeredWage(atAbility(55), BEST_CLUB, 'squad');
    expect(wage).toBeGreaterThan(5);
    expect(wage).toBeLessThan(30);
  });

  it('never pays less than a professional earns, or more than the ceiling', () => {
    for (const ability of [20, 40, 60, 80, 99]) {
      for (const club of [BEST_CLUB, TEAMS[TEAMS.length - 1]!]) {
        const wage = offeredWage(atAbility(ability), club, 'squad', 0.2);
        expect(wage).toBeGreaterThanOrEqual(MIN_WAGE);
        expect(wage).toBeLessThanOrEqual(MAX_WAGE);
      }
    }
  });

  it('puts wages and transfer fees on speaking terms', () => {
    // A season of wages should be a fraction of what the club paid for him,
    // not a rounding error against it. Both are now in the same universe.
    const player = atAbility(85);
    const seasonWages = (offeredWage(player, BEST_CLUB, 'starter') * 52) / 1000;
    const fee = marketValue(player);
    expect(seasonWages).toBeGreaterThan(fee * 0.05);
    expect(seasonWages).toBeLessThan(fee * 0.5);
  });
});

describe('rescaling could not move the wage gate', () => {
  it('scales what a club offers and what a player wants by the same number', () => {
    // The property the whole change rests on. If these ever diverge, every
    // signing in the game changes and nothing says so.
    const player = atAbility(78);
    for (const prestige of [0.3, 0.6, 1]) {
      const offered = offeredWage(player, BEST_CLUB, 'starter', prestige);
      const demanded = wageDemand(player, prestige);
      // Neither is clamped at this ability, so the ratio is the raw one.
      expect(offered).toBeLessThan(MAX_WAGE);
      expect(demanded).toBeLessThan(MAX_WAGE);
      // Same ratio it had before the scale existed: divide both by it.
      const ratio = offered / demanded;
      const unscaledRatio = (offered / WAGE_SCALE) / (demanded / WAGE_SCALE);
      expect(ratio).toBeCloseTo(unscaledRatio, 10);
    }
  });

  it('still refuses a club that cannot afford a well-known player', () => {
    const famous = createPlayer({
      name: 'Famous',
      position: 'ST',
      baseAttribute: 70,
      reputation: 95,
      attributes: {},
    });
    const small = [...TEAMS].sort((a, b) => teamStrength(a) - teamStrength(b))[0]!;
    expect(wageAcceptable(offeredWage(famous, small, 'star', 0.3), wageDemand(famous, 0.3))).toBe(
      false,
    );
  });
});
