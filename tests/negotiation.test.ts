import { describe, expect, it } from 'vitest';
import {
  MAX_YEARS,
  WAGE_RISE,
  agreementChance,
  canAsk,
  negotiate,
  promotedRole,
  withdrawalChance,
} from '../src/core/career/negotiation.ts';
import type { Negotiable, NegotiationAsk } from '../src/core/career/negotiation.ts';
import {
  cycleStance,
  defaultPreferences,
  describePreferences,
  interestMultiplier,
  stanceOf,
  willConsider,
} from '../src/core/career/preferences.ts';
import { Rng } from '../src/core/rng.ts';
import { generateOffers } from '../src/core/career/transfers.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { TEAMS } from '../src/data/gameData.ts';
import { initialLeagues, locateClub } from '../src/core/career/countries.ts';

/**
 * HAVING A POSITION
 *
 * Two things that were previously done TO the player: the terms of a contract,
 * and which clubs came for him. What both tests care about is that the answer
 * is a real one — that pushing can fail, and that a stated preference actually
 * changes the market rather than filtering a list that had already been decided.
 */

function deal(overrides: Partial<Negotiable> = {}): Negotiable {
  return { wage: 40, years: 3, role: 'starter', interest: 0.6, notes: [], ...overrides };
}

/** Run the same ask over many seeds and count what came back. */
function outcomes(base: Negotiable, ask: NegotiationAsk, runs = 400) {
  const tally = { improved: 0, refused: 0, withdrawn: 0 };
  for (let seed = 0; seed < runs; seed += 1) {
    tally[negotiate(new Rng(`ask:${seed}`), base, ask).outcome] += 1;
  }
  return tally;
}

describe('pushing a club on a deal', () => {
  it('raises the wage when they agree, and leaves everything else alone', () => {
    const base = deal({ interest: 0.95 });
    const result = negotiate(new Rng('generous'), base, 'wage');

    if (result.outcome === 'improved') {
      expect(result.deal.wage).toBeCloseTo(base.wage * (1 + WAGE_RISE), 1);
      expect(result.deal.years).toBe(base.years);
      expect(result.deal.role).toBe(base.role);
    }
    // Whatever happened, the ask is spent.
    expect(result.deal.negotiated).toBe(true);
  });

  it('never signs anybody for longer than the cap', () => {
    const result = negotiate(new Rng('long'), deal({ years: MAX_YEARS - 1, interest: 0.95 }), 'years');
    expect(result.deal.years).toBeLessThanOrEqual(MAX_YEARS);
  });

  it('will not be asked twice', () => {
    const once = negotiate(new Rng('first'), deal(), 'wage');
    expect(canAsk(once.deal, 'wage')).toBe(false);
    expect(canAsk(once.deal, 'years')).toBe(false);

    const twice = negotiate(new Rng('second'), once.deal, 'wage');
    expect(twice.outcome).toBe('refused');
    expect(twice.deal.wage).toBe(once.deal.wage);
  });

  it('does not offer an ask that cannot go anywhere', () => {
    expect(canAsk(deal({ years: MAX_YEARS }), 'years')).toBe(false);
    expect(canAsk(deal({ role: 'star' }), 'role')).toBe(false);
    // Money always can.
    expect(canAsk(deal({ years: MAX_YEARS, role: 'star' }), 'wage')).toBe(true);
  });

  it('climbs the squad ladder one rung at a time, and stops at the top', () => {
    expect(promotedRole('squad')).toBe('starter');
    expect(promotedRole('starter')).toBe('star');
    expect(promotedRole('star')).toBeNull();
  });

  it('gives a keen club a much better chance of saying yes', () => {
    expect(agreementChance(deal({ interest: 0.9 }), 'wage')).toBeGreaterThan(
      agreementChance(deal({ interest: 0.3 }), 'wage'),
    );
  });

  it('makes a promise about playing time the hardest thing to get', () => {
    const keen = deal({ interest: 0.7 });
    expect(agreementChance(keen, 'role')).toBeLessThan(agreementChance(keen, 'years'));
    expect(agreementChance(keen, 'years')).toBeLessThan(agreementChance(keen, 'wage'));
  });
});

describe('the risk that makes the ask a decision', () => {
  it('lets a lukewarm club walk away', () => {
    const tally = outcomes(deal({ interest: 0.28 }), 'role');
    expect(tally.withdrawn).toBeGreaterThan(0);
    expect(tally.refused).toBeGreaterThan(0);
  });

  it('almost never loses the offer of a club that badly wants him', () => {
    expect(withdrawalChance(deal({ interest: 0.95 }), 'wage')).toBeLessThan(0.05);
    const tally = outcomes(deal({ interest: 0.95 }), 'wage');
    expect(tally.improved).toBeGreaterThan(tally.withdrawn * 10);
  });

  it('keeps walking away rarer than simply saying no', () => {
    // The tuning that matters: if asking regularly cost you the move, players
    // would learn never to ask, which is the state this replaced.
    for (const interest of [0.3, 0.5, 0.7, 0.9]) {
      const tally = outcomes(deal({ interest }), 'wage');
      expect(tally.withdrawn).toBeLessThan(tally.improved + tally.refused);
    }
  });

  it('marks a withdrawn deal as gone, not merely unchanged', () => {
    let withdrawn: Negotiable | null = null;
    for (let seed = 0; seed < 400 && !withdrawn; seed += 1) {
      const result = negotiate(new Rng(`w:${seed}`), deal({ interest: 0.1 }), 'role');
      if (result.outcome === 'withdrawn') withdrawn = result.deal;
    }
    expect(withdrawn).not.toBeNull();
    expect(withdrawn!.withdrawn).toBe(true);
    expect(canAsk(withdrawn!, 'wage')).toBe(false);
  });
});

describe('what he wants from a move', () => {
  it('starts open to anything', () => {
    const preferences = defaultPreferences();
    expect(preferences.settled).toBe(false);
    expect(willConsider(preferences, 'spain', 'england')).toBe(true);
    expect(interestMultiplier(preferences, 'spain')).toBe(1);
  });

  it('cycles a country through both stances and back to neither', () => {
    let preferences = defaultPreferences();
    expect(stanceOf(preferences, 'spain')).toBe('neutral');

    preferences = cycleStance(preferences, 'spain');
    expect(stanceOf(preferences, 'spain')).toBe('favoured');

    preferences = cycleStance(preferences, 'spain');
    expect(stanceOf(preferences, 'spain')).toBe('refused');

    preferences = cycleStance(preferences, 'spain');
    expect(stanceOf(preferences, 'spain')).toBe('neutral');
    // And it is genuinely off both lists, not merely off one.
    expect(preferences.favoured).not.toContain('spain');
    expect(preferences.refused).not.toContain('spain');
  });

  it('never leaves a country on both lists at once', () => {
    let preferences = defaultPreferences();
    preferences = cycleStance(preferences, 'italy');
    preferences = cycleStance(preferences, 'italy');
    expect(preferences.favoured).not.toContain('italy');
    expect(preferences.refused).toContain('italy');
  });

  it('shuts a refused country out completely', () => {
    const preferences = { ...defaultPreferences(), refused: ['spain'] };
    expect(willConsider(preferences, 'spain', 'england')).toBe(false);
    expect(willConsider(preferences, 'italy', 'england')).toBe(true);
  });

  it('never shuts him out of the country he already plays in', () => {
    // Refusing your own league has to mean "I will not move abroad", not "I
    // will not sign anywhere" — the second reading strands an out-of-contract
    // player with nowhere at all to go.
    const preferences = { ...defaultPreferences(), refused: ['england'] };
    expect(willConsider(preferences, 'england', 'england')).toBe(true);
  });

  it('stops everybody when he says he is settled', () => {
    const preferences = { ...defaultPreferences(), settled: true };
    expect(willConsider(preferences, 'spain', 'england')).toBe(false);
    // Including his own country: settled means nobody approaches him at all.
    expect(willConsider(preferences, 'england', 'england')).toBe(false);
  });

  it('makes a favoured country keener, but only a nudge', () => {
    const preferences = { ...defaultPreferences(), favoured: ['spain'] };
    const boost = interestMultiplier(preferences, 'spain');
    expect(boost).toBeGreaterThan(1);
    // A preference must not be able to conjure interest that was not there.
    expect(boost).toBeLessThan(1.3);
    expect(interestMultiplier(preferences, 'italy')).toBe(1);
  });

  it('says what has been stated, in words', () => {
    const name = (id: string) => id.toUpperCase();
    expect(describePreferences(defaultPreferences(), name)).toContain('anywhere');
    expect(describePreferences({ ...defaultPreferences(), settled: true }, name)).toContain(
      'Not looking to move',
    );
    expect(
      describePreferences(
        { ...defaultPreferences(), favoured: ['spain'], refused: ['italy'] },
        name,
      ),
    ).toBe('You are keen on SPAIN, and will not move to ITALY.');
  });
});


/**
 * PREFERENCES AT THE MARKET, NOT AT THE SCREEN
 *
 * The distinction the whole feature turns on. A preference that only hid offers
 * would be cosmetic — the clubs would still have bid, and saying you will not
 * leave England would change nothing except what you were shown.
 */


const leagues = initialLeagues(TEAMS);
const countryOf = (id: string) => locateClub(leagues, id)?.countryId ?? 'england';

/** A season good enough that several clubs come for him. */
function goodSeason() {
  return { ...createSeasonStats(), matches: 34, goals: 22, assists: 9, ratingTotal: 34 * 7.6 };
}

function striker() {
  return createPlayer({
    name: 'Wanted',
    position: 'ST',
    age: 24,
    baseAttribute: 76,
    reputation: 72,
    attributes: { finishing: 82, movement: 78, composure: 76 },
  });
}

function offersWith(preferences: Parameters<typeof generateOffers>[1]['preferences']) {
  return generateOffers(new Rng('market'), {
    player: striker(),
    currentClubId: 'northport-city',
    clubs: TEAMS,
    stats: goodSeason(),
    season: 4,
    countryOf,
    preferences,
  });
}

describe('preferences reach the market', () => {
  it('brings nobody at all when he says he is settled', () => {
    expect(offersWith({ ...defaultPreferences(), settled: true })).toEqual([]);
  });

  it('keeps a refused country out of the offers entirely', () => {
    const open = offersWith(defaultPreferences());
    // Pick a country that actually bid, so the test is about the refusal rather
    // than about a country nobody was interested from.
    const countries = [...new Set(open.map((offer) => countryOf(offer.clubId)))];
    const refusedCountry = countries.find((id) => id !== 'england');
    expect(refusedCountry).toBeDefined();

    const filtered = offersWith({ ...defaultPreferences(), refused: [refusedCountry!] });
    expect(filtered.every((offer) => countryOf(offer.clubId) !== refusedCountry)).toBe(true);
  });

  it('never refuses him his own country, so he always has somewhere to sign', () => {
    const everywhere = [...new Set(TEAMS.map((team) => countryOf(team.id)))];
    const offers = offersWith({ ...defaultPreferences(), refused: everywhere });
    expect(offers.every((offer) => countryOf(offer.clubId) === 'england')).toBe(true);
  });
});
