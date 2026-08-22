import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import {
  STANDING_FLOORS,
  defaultPreferences,
  describePreferences,
  meetsDemands,
} from '../src/core/career/preferences.ts';
import type { CareerPreferences } from '../src/core/career/preferences.ts';
import {
  REQUEST_FEE_DISCOUNT,
  REQUEST_SELECTION_BIAS,
  describeRequest,
  handInRequest,
  requestStands,
} from '../src/core/career/transferRequest.ts';
import {
  MAX_OFFERS,
  REQUESTED_MAX_OFFERS,
  clubAppeal,
  generateOffers,
} from '../src/core/career/transfers.ts';
import type { EuropeanTier } from '../src/core/career/europe.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { seasonComplete } from '../src/core/career/career.ts';
import { pickSide, selectionChance } from '../src/core/career/squad.ts';
import type { Rival } from '../src/core/career/squad.ts';
import { allClubIds, countryPrestige, initialLeagues, locateClub } from '../src/core/career/countries.ts';
import {
  acceptOffer,
  endSeason,
  hasTransferRequest,
  recordPlayerMatch,
  marketReach,
  requestTransfer,
  startCareer,
  withdrawTransferRequest,
} from '../src/simulation/CareerService.ts';

/**
 * WHAT HE WILL MOVE FOR, AND ASKING TO GO
 *
 * Two features that share a screen and nothing else. The demands narrow who is
 * allowed to bid; the request changes how badly they want to — and costs him
 * his place while it stands.
 *
 * Every test here is about the MARKET rather than about the screen, for the
 * reason the country preferences already had one: a demand that only hid
 * finished offers would be cosmetic, and would pass a test that checked what
 * was displayed.
 */

const leagues = initialLeagues(TEAMS);
const countryOf = (id: string) => locateClub(leagues, id)?.countryId ?? 'england';
const prestigeOf = (id: string) => countryPrestige(countryOf(id));
const lookup = (id: string) => getTeam(id);

function goodSeason() {
  return { ...createSeasonStats(), matches: 34, goals: 22, assists: 9, ratingTotal: 34 * 7.6 };
}

function striker(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({
      name: 'Wanted',
      position: 'ST',
      age: 24,
      baseAttribute: 76,
      reputation: 72,
      attributes: { finishing: 82, movement: 78, composure: 76 },
    }),
    ...overrides,
  };
}

/** A footballer of a stated standard, for the tests that are about ability. */
function strikerOf(baseAttribute: number, age = 26): Player {
  return createPlayer({ name: 'Wanted', position: 'ST', age, baseAttribute, attributes: {} });
}

interface MarketOptions {
  preferences?: CareerPreferences;
  europeanTierOf?: (clubId: string) => EuropeanTier | null;
  transferRequested?: boolean;
  seed?: string;
}

function offers(options: MarketOptions = {}) {
  return generateOffers(new Rng(options.seed ?? 'market'), {
    player: striker(),
    currentClubId: 'northport-city',
    clubs: TEAMS,
    stats: goodSeason(),
    season: 4,
    countryOf,
    prestigeOf,
    preferences: options.preferences ?? defaultPreferences(),
    europeanTierOf: options.europeanTierOf,
    transferRequested: options.transferRequested,
  });
}

/** Appeal of a club as the market sees it, for asserting against a floor. */
const appealOf = (id: string) => clubAppeal(getTeam(id), prestigeOf(id));

describe('how big a club he will move for', () => {
  it('is a floor on the club rather than a filter on the list', () => {
    const open = offers();
    expect(open.length).toBeGreaterThan(0);

    const demanding = offers({ preferences: { ...defaultPreferences(), standing: 'big' } });
    for (const offer of demanding) {
      expect(appealOf(offer.clubId)).toBeGreaterThanOrEqual(STANDING_FLOORS.big);
    }
  });

  it('narrows the market rather than widening it', () => {
    const any = offers().length;
    const established = offers({
      preferences: { ...defaultPreferences(), standing: 'established' },
    }).length;
    const elite = offers({ preferences: { ...defaultPreferences(), standing: 'elite' } }).length;

    expect(established).toBeLessThanOrEqual(any);
    expect(elite).toBeLessThanOrEqual(established);
  });

  it('can leave him with no offers at all, which is his own choice', () => {
    // A striker good enough for several clubs, holding out for the twelve
    // biggest in the world. Silence is the honest answer, not a bug.
    expect(offers({ preferences: { ...defaultPreferences(), standing: 'elite' } })).toEqual([]);
  });

  it('never blocks the club he already plays for, which never bids anyway', () => {
    const demanding = offers({ preferences: { ...defaultPreferences(), standing: 'elite' } });
    expect(demanding.every((offer) => offer.clubId !== 'northport-city')).toBe(true);
  });
});

describe('the European football he holds out for', () => {
  /** A world in which four named clubs qualified, and nobody else did. */
  const qualified: Record<string, EuropeanTier> = {
    'castleford-royals': 'championsLeague',
    'real-valmorena': 'championsLeague',
    'ac-verdenza': 'europaLeague',
    'sv-weissbrunn': 'conferenceLeague',
  };
  const europeanTierOf = (id: string) => qualified[id] ?? null;

  it('lets only clubs in Europe bid when any of the three will do', () => {
    const held = offers({
      preferences: { ...defaultPreferences(), european: 'any' },
      europeanTierOf,
    });
    for (const offer of held) expect(qualified[offer.clubId]).toBeDefined();
  });

  it('lets only one competition bid when he names one', () => {
    const held = offers({
      preferences: { ...defaultPreferences(), european: 'europaLeague' },
      europeanTierOf,
    });
    for (const offer of held) expect(qualified[offer.clubId]).toBe('europaLeague');
  });

  it('treats no demand and "any" as different things', () => {
    const none = meetsDemands(defaultPreferences(), { appeal: 0.5, europeanTier: null });
    const any = meetsDemands(
      { ...defaultPreferences(), european: 'any' },
      { appeal: 0.5, europeanTier: null },
    );
    expect(none).toBe(true);
    expect(any).toBe(false);
  });

  it('brings nobody when the caller never said who qualified', () => {
    // The safe default rather than the flattering one: a market that was not
    // told who is in Europe must not invent it.
    expect(offers({ preferences: { ...defaultPreferences(), european: 'any' } })).toEqual([]);
  });

  it('stacks with the standing floor rather than replacing it', () => {
    const both = meetsDemands(
      { ...defaultPreferences(), standing: 'elite', european: 'any' },
      { appeal: 0.5, europeanTier: 'championsLeague' },
    );
    expect(both).toBe(false);
  });
});

describe('asking to leave', () => {
  const rival: Rival = { name: 'Someone Else', age: 27, ability: 70, form: 50 };
  const base = {
    player: strikerOf(70),
    rival,
    role: 'starter' as const,
    fitness: 90,
    importance: 0.6,
    congested: false,
  };

  it('makes more clubs bid, which needs the cap raised rather than interest', () => {
    // The point the implementation turns on: offers are capped, and for a
    // player worth bidding on the cap binds before interest does. A multiplier
    // alone reorders the same three clubs and delivers nothing.
    const quiet = offers({ seed: 'busy' });
    const asked = offers({ seed: 'busy', transferRequested: true });
    expect(quiet.length).toBe(MAX_OFFERS);
    expect(asked.length).toBeGreaterThan(quiet.length);
    expect(asked.length).toBeLessThanOrEqual(REQUESTED_MAX_OFFERS);
  });

  it('cuts the fee, which is what widens the market at the bottom', () => {
    const [quiet] = offers({ seed: 'fee' });
    const asked = offers({ seed: 'fee', transferRequested: true }).find(
      (offer) => offer.clubId === quiet!.clubId,
    );
    expect(asked).toBeDefined();
    // Not exactly the discount, because a fee is also clamped to the buyer's
    // budget — but it can only ever be lower.
    expect(asked!.fee).toBeLessThan(quiet!.fee);
    expect(asked!.fee).toBeGreaterThanOrEqual(quiet!.fee * REQUEST_FEE_DISCOUNT - 0.01);
  });

  it('costs him his place in the side', () => {
    const kept = selectionChance(base);
    const asked = selectionChance({ ...base, requested: true });
    expect(asked).toBeLessThan(kept);
  });

  it('is a bias rather than a bar, so a good enough player still plays', () => {
    const undroppable = { ...base, player: strikerOf(95) };
    expect(selectionChance({ ...undroppable, requested: true })).toBeGreaterThan(0.5);
  });

  it('is worse than what his contract calls him', () => {
    // Deliberately: being told you want to leave is a bigger thing than being
    // signed as a squad player.
    expect(REQUEST_SELECTION_BIAS).toBeLessThan(-0.14);
  });

  it('says so on the team sheet when he is left out for it', () => {
    const sheet = pickSide(new Rng('sheet'), {
      ...base,
      player: strikerOf(40),
      requested: true,
    });
    expect(sheet.selected).toBe(false);
    expect(sheet.note).toContain('asked to leave');
  });

  it('stands only at the club it was handed to', () => {
    const request = handInRequest('northport-city', 3);
    expect(requestStands(request, 'northport-city')).toBe(true);
    expect(requestStands(request, 'castleford-royals')).toBe(false);
    expect(requestStands(null, 'northport-city')).toBe(false);
  });

  it('reads as how long he has been asking', () => {
    const request = handInRequest('northport-city', 3);
    expect(describeRequest(request, 3)).toContain('asked to leave');
    expect(describeRequest(request, 4)).toContain('last summer');
    expect(describeRequest(request, 7)).toContain('4 seasons');
  });
});

describe('a transfer request inside a career', () => {
  function career() {
    return startCareer({
      player: striker(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'request',
    });
  }

  it('starts with none, and can be handed in and taken back', () => {
    const state = career();
    expect(hasTransferRequest(state)).toBe(false);

    requestTransfer(state);
    expect(hasTransferRequest(state)).toBe(true);
    expect(state.transferRequest!.clubId).toBe('northport-city');
    expect(state.transferRequest!.season).toBe(state.seasonNumber);

    withdrawTransferRequest(state);
    expect(hasTransferRequest(state)).toBe(false);
    expect(state.transferRequest).toBeNull();
  });

  /** Play out every fixture of the season, so the summer can be reached. */
  function playSeason(state: ReturnType<typeof career>): void {
    while (!seasonComplete(state)) {
      const stats = createMatchStats();
      stats.minutes = 90;
      stats.goals = 1;
      recordPlayerMatch(
        state,
        { stats, rating: 7.4, playerTeamScore: 2, opponentScore: 1, fitnessAtEnd: 55 },
        lookup,
      );
    }
  }

  it('stops his own club offering him new terms', () => {
    const withRequest = career();
    const without = career();
    // A deal in its final season, so the summer has to resolve it — a renewal
    // is only ever offered to a player whose contract has actually run out.
    for (const state of [withRequest, without]) {
      state.contract.yearsRemaining = 1;
      playSeason(state);
    }
    requestTransfer(withRequest);

    endSeason(withRequest, lookup);
    endSeason(without, lookup);

    expect(without.renewal).not.toBeNull();
    expect(withRequest.renewal).toBeNull();
  });

  it('is cleared by the move it asked for', () => {
    const state = career();
    playSeason(state);
    requestTransfer(state);
    const summer = endSeason(state, lookup);
    // The request boosted interest, so a summer with no offers at all would
    // make this vacuous rather than passing.
    expect(summer.offers.length).toBeGreaterThan(0);

    acceptOffer(state, summer.offers[0]!.id, lookup);
    expect(state.transferRequest).toBeNull();
    expect(hasTransferRequest(state)).toBe(false);
  });
});

describe('how much of the world a demand leaves him', () => {
  it('counts the clubs that clear each bar, against the world he plays in', () => {
    const state = startCareer({
      player: striker(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'reach',
    });
    const reach = marketReach(state, lookup);

    expect(reach.total).toBe(allClubIds(state.leagues).length);
    expect(reach.clearing.any).toBe(reach.total);
    expect(reach.clearing.established).toBeLessThan(reach.clearing.any);
    expect(reach.clearing.big).toBeLessThan(reach.clearing.established);
    expect(reach.clearing.elite).toBeLessThan(reach.clearing.big);
    expect(reach.clearing.elite).toBeGreaterThan(0);
  });

  it('counts Europe by competition, and the three add up to the whole', () => {
    const state = startCareer({
      player: striker(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'reach',
    });
    const { inEurope } = marketReach(state, lookup);
    expect(inEurope.championsLeague + inEurope.europaLeague + inEurope.conferenceLeague).toBe(
      inEurope.any,
    );
    expect(inEurope.any).toBeGreaterThan(0);
  });
});

describe('what the stated position reads as', () => {
  it('says both demands in words', () => {
    const line = describePreferences(
      { ...defaultPreferences(), standing: 'big', european: 'championsLeague' },
      (id) => id,
    );
    expect(line).toContain('a big club');
    expect(line).toContain('the Champions League');
  });

  it('still says nothing when nothing has been demanded', () => {
    expect(describePreferences(defaultPreferences(), (id) => id)).toBe('Open to anything, anywhere.');
  });
});
