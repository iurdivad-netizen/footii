import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { createPlayer, currentAbility } from '../src/core/player/player.ts';
import type { Player, PlayerInit } from '../src/core/player/player.ts';
import { createTeam } from '../src/core/team/team.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import type { SeasonStats } from '../src/core/career/seasonStats.ts';
import {
  MAX_OFFERS,
  OFFER_THRESHOLD,
  abilityValue,
  applyTransferEffects,
  clubInterest,
  effectiveAbility,
  generateOffers,
  marketValue,
  offeredWage,
  positionalNeed,
  reputationRequired,
  scoutingInterest,
  squadLevel,
  squadRole,
  tacticalFit,
  transferBudget,
} from '../src/core/career/transfers.ts';
import {
  REPUTATION_TIERS,
  matchReputationGain,
  reputationTarget,
  reputationTier,
  settleReputation,
} from '../src/core/career/reputation.ts';
import {
  acceptOffer,
  clubsWatching,
  declineOffers,
  endSeason,
  recordPlayerMatch,
  startCareer,
} from '../src/simulation/CareerService.ts';
import { seasonComplete } from '../src/core/career/career.ts';

const LEAGUE = TEAMS.map((t) => t.id);
const lookup = (id: string) => getTeam(id);

/** A serviceable senior striker, with anything the test cares about overridden. */
function striker(init: Partial<PlayerInit> = {}): Player {
  return createPlayer({
    name: 'Striker',
    position: 'ST',
    age: 25,
    baseAttribute: 65,
    reputation: 55,
    potentialAbility: 75,
    attributes: { finishing: 78, movement: 72 },
    ...init,
  });
}

function season(overrides: Partial<SeasonStats> = {}): SeasonStats {
  return { ...createSeasonStats(), matches: 14, ...overrides };
}

describe('market value', () => {
  it('rises steeply with ability, because fees do', () => {
    expect(abilityValue(70)).toBeGreaterThan(abilityValue(60) * 2);
    expect(abilityValue(60)).toBeGreaterThan(abilityValue(50) * 2);
  });

  it('values the same footballer far less once he is past 30', () => {
    const peak = marketValue(striker({ age: 26 }));
    const late = marketValue(striker({ age: 33 }));
    expect(late).toBeLessThan(peak * 0.5);
  });

  it('pays a premium for a young player with headroom, and none for an old one', () => {
    const base = { baseAttribute: 60, attributes: {} };
    const prospect = createPlayer({ ...base, name: 'Kid', position: 'ST', age: 18, potentialAbility: 90 });
    const limited = createPlayer({ ...base, name: 'Kid', position: 'ST', age: 18, potentialAbility: 62 });
    const veteranHigh = createPlayer({ ...base, name: 'Old', position: 'ST', age: 31, potentialAbility: 90 });
    const veteranLow = createPlayer({ ...base, name: 'Old', position: 'ST', age: 31, potentialAbility: 62 });

    expect(marketValue(prospect)).toBeGreaterThan(marketValue(limited) * 1.3);
    // Potential nobody expects him to reach is worth nothing.
    expect(marketValue(veteranHigh)).toBeCloseTo(marketValue(veteranLow), 5);
  });

  it('moves at the margins with reputation and form', () => {
    const quiet = marketValue(striker({ reputation: 20, form: 40 }));
    const famous = marketValue(striker({ reputation: 90, form: 80 }));
    expect(famous).toBeGreaterThan(quiet);
    // ...but never enough to outweigh being a better footballer.
    expect(famous).toBeLessThan(marketValue(striker({ baseAttribute: 78, attributes: {} })));
  });
});

describe('what a club is and expects', () => {
  it('ranks the loaded clubs into a ladder of standing, budget and expectation', () => {
    const castleford = getTeam('castleford-royals');
    const seaton = getTeam('seaton-athletic');

    expect(squadLevel(castleford)).toBeGreaterThan(squadLevel(seaton));
    expect(transferBudget(castleford)).toBeGreaterThan(transferBudget(seaton) * 5);
    expect(reputationRequired(castleford)).toBeGreaterThan(reputationRequired(seaton) + 30);
  });

  it('reads positional need off the club\'s own weakest department', () => {
    // Seaton Athletic: attack 44, midfield 48, defence 62.
    const seaton = getTeam('seaton-athletic');
    expect(positionalNeed(seaton, 'ST')).toBeGreaterThan(0.9);
    expect(positionalNeed(seaton, 'CB')).toBeLessThan(0.2);
    expect(positionalNeed(seaton, 'CM')).toBeGreaterThan(positionalNeed(seaton, 'CB'));
  });
});

describe('tactical fit', () => {
  const wide = createTeam({ name: 'Wide', style: 'widePlay', base: 60 });
  const stubborn = createTeam({ name: 'Stubborn', style: 'defensive', base: 60 });

  const crosser = createPlayer({
    name: 'Crosser',
    position: 'RW',
    baseAttribute: 55,
    attributes: { crossing: 85, dribbling: 84, pace: 80, movement: 78 },
  });
  const stopper = createPlayer({
    name: 'Stopper',
    position: 'CB',
    baseAttribute: 55,
    attributes: { defensiveAwareness: 85, tackling: 84, positioning: 80, strength: 78 },
  });

  it('prefers the player built for how the club plays', () => {
    expect(tacticalFit(crosser, wide)).toBeGreaterThan(tacticalFit(crosser, stubborn));
    expect(tacticalFit(stopper, stubborn)).toBeGreaterThan(tacticalFit(stopper, wide));
  });

  it('measures shape rather than quality, so ability is not counted twice', () => {
    // A uniformly better footballer of no particular shape is no better a fit.
    const flatGood = createPlayer({ name: 'Flat', position: 'RW', baseAttribute: 80, attributes: {} });
    const flatPoor = createPlayer({ name: 'Flat', position: 'RW', baseAttribute: 45, attributes: {} });
    expect(tacticalFit(flatGood, wide)).toBeCloseTo(tacticalFit(flatPoor, wide), 1);
    expect(tacticalFit(flatGood, wide)).toBeCloseTo(0.5, 1);
  });
});

describe('club interest', () => {
  it('ignores a player it has never heard of, however good he would be', () => {
    const castleford = getTeam('castleford-royals');
    const unknown = striker({ reputation: 5, baseAttribute: 80, attributes: { finishing: 90 } });
    const interest = clubInterest({ player: unknown, team: castleford, stats: season() });
    expect(interest.reputationShortfall).toBeGreaterThan(0);
    expect(interest.score).toBeLessThan(OFFER_THRESHOLD);
  });

  it('will not bid for a player it would only use as cover', () => {
    const castleford = getTeam('castleford-royals');
    // Famous enough to be noticed, nowhere near good enough to play.
    const ordinary = striker({ reputation: 95, baseAttribute: 55, attributes: {} });
    expect(squadRole(ordinary, castleford)).toBe('squad');
    expect(clubInterest({ player: ordinary, team: castleford, stats: season() }).score).toBe(0);
  });

  it('will not bid for a player it cannot pay for', () => {
    const seaton = getTeam('seaton-athletic');
    const expensive = striker({ baseAttribute: 82, reputation: 80, attributes: {} });
    expect(marketValue(expensive)).toBeGreaterThan(transferBudget(seaton));
    const interest = clubInterest({ player: expensive, team: seaton, stats: season() });
    expect(interest.affordable).toBe(false);
    expect(interest.score).toBe(0);
  });

  it('wants a player who would improve it, in a position it is short in', () => {
    const seaton = getTeam('seaton-athletic');
    const wanted = striker({ baseAttribute: 58, reputation: 45, attributes: { finishing: 70 } });
    const interest = clubInterest({ player: wanted, team: seaton, stats: season() });
    expect(interest.score).toBeGreaterThan(OFFER_THRESHOLD);
    expect(interest.role).not.toBe('squad');
  });

  it('prices in potential for the young and not for the old', () => {
    const kid = striker({ age: 18, baseAttribute: 58, potentialAbility: 88, attributes: {} });
    const man = striker({ age: 30, baseAttribute: 58, potentialAbility: 88, attributes: {} });
    expect(effectiveAbility(kid)).toBeGreaterThan(currentAbility(kid) + 4);
    expect(effectiveAbility(man)).toBe(currentAbility(man));
  });

  it('is nudged over the line by a season of goals', () => {
    const seaton = getTeam('seaton-athletic');
    const player = striker({ baseAttribute: 58, reputation: 45, attributes: {} });
    const quiet = clubInterest({ player, team: seaton, stats: season() });
    const prolific = clubInterest({ player, team: seaton, stats: season({ goals: 12, assists: 4 }) });
    expect(prolific.score).toBeGreaterThan(quiet.score);
  });
});

describe('offers', () => {
  const player = striker({ baseAttribute: 62, reputation: 55, attributes: { finishing: 72 } });

  function offers(seed: string, from = 'seaton-athletic') {
    return generateOffers(new Rng(seed), {
      player,
      currentClubId: from,
      clubs: TEAMS,
      stats: season({ goals: 11, assists: 3 }),
      season: 4,
    });
  }

  it('is deterministic from the seed', () => {
    expect(offers('summer')).toEqual(offers('summer'));
  });

  it('never comes from the club he already plays for', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      expect(offers(seed).some((o) => o.clubId === 'seaton-athletic')).toBe(false);
    }
  });

  it('always brings the keenest club, so a good season is never met with silence', () => {
    const interested = scoutingInterest(player, TEAMS, 'seaton-athletic', season({ goals: 11, assists: 3 }))
      .filter((i) => i.score >= OFFER_THRESHOLD);
    expect(interested.length).toBeGreaterThan(0);

    // Every seed produces the top club's bid; only the rest of the list varies.
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      expect(offers(seed)[0]!.clubId).toBe(interested[0]!.clubId);
    }
  });

  it('is capped and sorted, so a summer is a decision rather than a lottery win', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const list = offers(seed);
      expect(list.length).toBeLessThanOrEqual(MAX_OFFERS);
      for (let i = 1; i < list.length; i++) {
        expect(list[i - 1]!.interest).toBeGreaterThanOrEqual(list[i]!.interest);
      }
    }
  });

  it('never offers a fee a club could not pay', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      for (const offer of offers(seed)) {
        expect(offer.fee).toBeLessThanOrEqual(transferBudget(getTeam(offer.clubId)));
        expect(offer.fee).toBeGreaterThan(0);
      }
    }
  });

  it('pays more at a bigger club, and more for a star than a starter', () => {
    const big = getTeam('ashford-united');
    const small = getTeam('old-harbour');
    expect(offeredWage(player, big, 'starter')).toBeGreaterThan(offeredWage(player, small, 'starter'));
    expect(offeredWage(player, big, 'star')).toBeGreaterThan(offeredWage(player, big, 'starter'));
  });

  it('lists the clubs that are watching before any of them bid', () => {
    const watching = scoutingInterest(player, TEAMS, 'seaton-athletic', season());
    expect(watching.length).toBeGreaterThan(0);
    expect(watching.every((i) => i.clubId !== 'seaton-athletic')).toBe(true);
    for (let i = 1; i < watching.length; i++) {
      expect(watching[i - 1]!.score).toBeGreaterThanOrEqual(watching[i]!.score);
    }
  });
});

describe('moving club', () => {
  it('unsettles form, lifts morale and lends the new club\'s standing', () => {
    const player = striker({ form: 80, morale: 40, reputation: 30 });
    applyTransferEffects(player, getTeam('castleford-royals'));
    expect(player.form).toBeLessThan(80);
    expect(player.form).toBeGreaterThan(50);
    expect(player.morale).toBeGreaterThan(40);
    expect(player.reputation).toBeGreaterThan(30);
  });

  it('never lends standing when dropping to a smaller club', () => {
    const player = striker({ reputation: 90 });
    applyTransferEffects(player, getTeam('seaton-athletic'));
    expect(player.reputation).toBe(90);
  });
});

describe('reputation', () => {
  it('names every band, in ascending order', () => {
    for (let i = 1; i < REPUTATION_TIERS.length; i++) {
      expect(REPUTATION_TIERS[i]!.from).toBeGreaterThan(REPUTATION_TIERS[i - 1]!.from);
    }
    expect(reputationTier(0).label).toBe('Unknown');
    expect(reputationTier(100).label).toBe('World class');
    expect(reputationTier(REPUTATION_TIERS[2]!.from).label).toBe(REPUTATION_TIERS[2]!.label);
  });

  it('rewards goals most, and a big stage a little', () => {
    const base = { assists: 0, rating: 7, reputation: 40 };
    const scored = matchReputationGain({ ...base, goals: 2, clubStature: 0.6 });
    const assisted = matchReputationGain({ ...base, goals: 0, assists: 2, clubStature: 0.6 });
    expect(scored).toBeGreaterThan(assisted);
    expect(matchReputationGain({ ...base, goals: 2, clubStature: 0.9 })).toBeGreaterThan(scored);
  });

  it('saturates, so fame has a ceiling that volume alone cannot reach', () => {
    const input = { goals: 2, assists: 1, rating: 7.6, clubStature: 0.7 };
    const early = matchReputationGain({ ...input, reputation: 25 });
    const late = matchReputationGain({ ...input, reputation: 92 });
    expect(late).toBeLessThan(early * 0.6);
    expect(late).toBeGreaterThan(0);
  });

  it('costs something to be anonymous', () => {
    const gain = { goals: 0, assists: 0, clubStature: 0.6, reputation: 60 };
    expect(matchReputationGain({ ...gain, rating: 5.2 })).toBeLessThan(0);
    expect(matchReputationGain({ ...gain, rating: 6.5 })).toBe(0);
  });

  it('settles toward what the season justifies rather than jumping to it', () => {
    const player = striker({ reputation: 90, baseAttribute: 55, attributes: {} });
    const settlement = settleReputation(player, {
      stats: season({ goals: 1 }),
      leaguePosition: 8,
      leagueSize: 8,
      clubStature: 0.5,
      seasonLength: 14,
    });
    expect(settlement.target).toBeLessThan(settlement.before);
    expect(settlement.after).toBeLessThan(settlement.before);
    // Inertia: fame does not evaporate in one summer.
    expect(settlement.after).toBeGreaterThan(settlement.target);
    expect(player.reputation).toBe(settlement.after);
  });

  it('rates a title-winning, prolific season above a bottom-placed quiet one', () => {
    const player = striker();
    const shared = { clubStature: 0.7, seasonLength: 14 };
    const great = reputationTarget(player, {
      ...shared,
      stats: season({ goals: 14, assists: 6 }),
      leaguePosition: 1,
      leagueSize: 8,
    });
    const poor = reputationTarget(player, {
      ...shared,
      stats: season({ goals: 1 }),
      leaguePosition: 8,
      leagueSize: 8,
    });
    expect(great).toBeGreaterThan(poor + 15);
  });

  it('slides a player who did not play at all', () => {
    const player = striker({ reputation: 70 });
    const settlement = settleReputation(player, {
      stats: season({ matches: 0 }),
      leaguePosition: 4,
      leagueSize: 8,
      clubStature: 0.6,
      seasonLength: 14,
    });
    expect(settlement.delta).toBeLessThan(0);
    expect(settlement.notes[0]).toMatch(/out of sight/);
  });
});

describe('transfers within a career', () => {
  function career(player = striker({ baseAttribute: 60, reputation: 50, attributes: {} })) {
    return startCareer({ player, clubId: 'seaton-athletic', leagueTeamIds: LEAGUE, seed: 'move' });
  }

  function playSeason(state: ReturnType<typeof startCareer>, rating: number, goals: number) {
    while (!seasonComplete(state)) {
      const stats = createMatchStats();
      stats.minutes = 90;
      stats.goals = goals;
      recordPlayerMatch(
        state,
        { stats, rating, playerTeamScore: goals, opponentScore: 0, fitnessAtEnd: 45 },
        lookup,
      );
    }
  }

  it('starts a career with an empty window and no move history', () => {
    const state = career();
    expect(state.offers).toEqual([]);
    expect(state.transfers).toEqual([]);
  });

  it('settles reputation and puts any offers on the state at the end of a season', () => {
    const state = career();
    playSeason(state, 7.8, 1);
    const before = state.player.reputation;
    const outcome = endSeason(state, lookup);

    expect(outcome.reputation.before).toBeCloseTo(before, 1);
    expect(state.player.reputation).toBe(outcome.reputation.after);
    expect(outcome.offers).toBe(state.offers);
    expect(outcome.offers.every((o) => o.season === outcome.record.seasonNumber)).toBe(true);
  });

  it('brings offers to a player who plays well and none to one who does not', () => {
    const good = career();
    playSeason(good, 8.2, 1);
    const wanted = endSeason(good, lookup).offers;

    const anonymous = career(striker({ baseAttribute: 44, reputation: 6, attributes: {} }));
    playSeason(anonymous, 5.4, 0);
    const ignored = endSeason(anonymous, lookup).offers;

    expect(wanted.length).toBeGreaterThan(0);
    expect(ignored).toHaveLength(0);
  });

  it('moves the player, records the move and closes the window on acceptance', () => {
    const state = career();
    playSeason(state, 8.2, 1);
    const outcome = endSeason(state, lookup);
    const offer = outcome.offers[0]!;

    const record = acceptOffer(state, offer.id, lookup);

    expect(state.clubId).toBe(offer.clubId);
    expect(record.fromClubId).toBe('seaton-athletic');
    expect(record.toClubId).toBe(offer.clubId);
    expect(record.age).toBe(state.player.age);
    expect(state.transfers).toEqual([record]);
    expect(state.offers).toEqual([]);
  });

  it('keeps the club and clears the window when everything is turned down', () => {
    const state = career();
    playSeason(state, 8.2, 1);
    endSeason(state, lookup);

    declineOffers(state);
    expect(state.clubId).toBe('seaton-athletic');
    expect(state.offers).toEqual([]);
    expect(state.transfers).toEqual([]);
  });

  it('refuses an offer that is not on the table', () => {
    const state = career();
    expect(() => acceptOffer(state, 's1:ashford-united', lookup)).toThrow(/No such offer/);
  });

  it('plays on at the new club, with its fixtures and its coaching', () => {
    const state = career();
    playSeason(state, 8.2, 1);
    const offer = endSeason(state, lookup).offers[0]!;
    acceptOffer(state, offer.id, lookup);

    playSeason(state, 7.5, 1);
    expect(state.seasonStats.matches).toBeGreaterThan(0);
    expect(state.history[0]!.clubId).toBe('seaton-athletic');
    const second = endSeason(state, lookup);
    expect(second.record.clubId).toBe(offer.clubId);
  });

  it('shows who is watching during the season', () => {
    const state = career(striker({ baseAttribute: 62, reputation: 52, attributes: {} }));
    playSeason(state, 8, 1);
    const watching = clubsWatching(state, lookup);
    expect(watching.length).toBeGreaterThan(0);
    expect(watching.every((i) => i.clubId !== state.clubId)).toBe(true);
  });
});
