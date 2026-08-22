import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { recordPlayerMatch, startCareer } from '../src/simulation/CareerService.ts';
import type { CareerState } from '../src/core/career/career.ts';
import {
  CONFIDENCE_NEUTRAL,
  CONFIDENCE_SELECTION_BIAS,
  confidenceAfterAbsence,
  confidenceAfterMatch,
  confidenceBias,
  confidenceInterest,
  confidenceTier,
  moraleShift,
  renewalRole,
  startingConfidence,
} from '../src/core/career/confidence.ts';
import { selectionChance } from '../src/core/career/squad.ts';
import type { Rival } from '../src/core/career/squad.ts';
import { renewalOffer } from '../src/core/career/contracts.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';

const lookup = (id: string) => getTeam(id);

const striker = (overrides: Partial<Player> = {}): Player => ({
  ...createPlayer({ name: 'Test', position: 'ST', age: 26, baseAttribute: 70, attributes: {} }),
  ...overrides,
});

const rival = (overrides: Partial<Rival> = {}): Rival => ({
  name: 'Someone Else',
  age: 27,
  ability: 70,
  form: 50,
  ...overrides,
});

const selection = {
  player: striker(),
  rival: rival(),
  role: 'starter' as const,
  fitness: 90,
  importance: 0.6,
  congested: false,
};

function career(seed = 'conf'): CareerState {
  return startCareer({ player: striker(), clubId: 'northport-city', teams: TEAMS, seed });
}

function playMatch(state: CareerState, rating: number, result = 0): void {
  const stats = createMatchStats();
  stats.minutes = 90;
  recordPlayerMatch(
    state,
    {
      stats,
      rating,
      playerTeamScore: result > 0 ? 2 : 0,
      opponentScore: result < 0 ? 2 : 0,
      fitnessAtEnd: 60,
    },
    lookup,
  );
}

describe('where a manager starts', () => {
  it('begins from what the club called him when it signed him', () => {
    expect(startingConfidence('star')).toBeGreaterThan(startingConfidence('starter'));
    expect(startingConfidence('starter')).toBeGreaterThan(startingConfidence('squad'));
  });

  it('gives nobody a head start big enough to settle the argument', () => {
    // A star arrives believed in and a squad player arrives doubted, and both
    // are inside the range where a season of football decides the rest.
    for (const role of ['star', 'starter', 'squad'] as const) {
      expect(startingConfidence(role)).toBeGreaterThan(30);
      expect(startingConfidence(role)).toBeLessThan(70);
    }
  });

  it('is set from the club a career actually joins', () => {
    const state = career();
    expect(state.confidence).toBe(startingConfidence(state.contract.role));
  });
});

describe('what moves a manager', () => {
  it('rises on a good performance and falls on a poor one', () => {
    expect(confidenceAfterMatch({ confidence: 50, rating: 8.5, result: 1, importance: 0.6 }))
      .toBeGreaterThan(50);
    expect(confidenceAfterMatch({ confidence: 50, rating: 4.5, result: -1, importance: 0.6 }))
      .toBeLessThan(50);
  });

  it('moves further on a match that mattered', () => {
    const european = confidenceAfterMatch({ confidence: 50, rating: 8.5, result: 1, importance: 1 });
    const leagueCup = confidenceAfterMatch({
      confidence: 50,
      rating: 8.5,
      result: 1,
      importance: 0.26,
    });
    expect(european).toBeGreaterThan(leagueCup);
  });

  it('judges the performance ahead of the result', () => {
    // The whole reason this is not a second copy of morale: a manager watching
    // his side lose does not think less of the man who played well.
    const wellInDefeat = confidenceAfterMatch({
      confidence: 50,
      rating: 8.4,
      result: -1,
      importance: 0.6,
    });
    const poorlyInVictory = confidenceAfterMatch({
      confidence: 50,
      rating: 4.8,
      result: 1,
      importance: 0.6,
    });
    expect(wellInDefeat).toBeGreaterThan(poorlyInVictory);
  });

  it('moves more slowly than form does', () => {
    // Both read the same rating; an opinion is stickier than the evidence.
    const rating = 8.5;
    const asForm = 50 * 0.65 + Math.min(100, (rating - 4) * 16.5) * 0.35;
    const asConfidence = confidenceAfterMatch({ confidence: 50, rating, result: 0, importance: 1 });
    expect(asConfidence - 50).toBeLessThan(asForm - 50);
  });

  it('stays inside 0-100 however long a career goes badly', () => {
    let confidence = 50;
    for (let i = 0; i < 200; i++) {
      confidence = confidenceAfterMatch({ confidence, rating: 1, result: -1, importance: 1 });
    }
    expect(confidence).toBeGreaterThanOrEqual(0);

    for (let i = 0; i < 200; i++) {
      confidence = confidenceAfterMatch({ confidence, rating: 10, result: 1, importance: 1 });
    }
    expect(confidence).toBeLessThanOrEqual(100);
  });
});

describe('an absence never digs the hole deeper', () => {
  it('pulls a low view up toward neutral rather than further down', () => {
    // The trap this deliberately refuses to build: being left out is already
    // the punishment for low confidence, so it must not also be the cause.
    expect(confidenceAfterAbsence(20, false)).toBeGreaterThan(20);
    expect(confidenceAfterAbsence(20, false)).toBeLessThanOrEqual(CONFIDENCE_NEUTRAL);
  });

  it('pulls a high view down toward neutral', () => {
    expect(confidenceAfterAbsence(90, false)).toBeLessThan(90);
    expect(confidenceAfterAbsence(90, false)).toBeGreaterThanOrEqual(CONFIDENCE_NEUTRAL);
  });

  it('forgets an injury faster than an omission', () => {
    expect(confidenceAfterAbsence(20, true)).toBeGreaterThan(confidenceAfterAbsence(20, false));
  });

  it('converges on neutral rather than overshooting it', () => {
    // It settles a shade short of neutral rather than exactly on it, because
    // the value is rounded to a tenth and the last step is smaller than that.
    // Worth pinning: the property that matters is that a long absence cannot
    // carry a manager PAST indifference into a view he never formed.
    let confidence = 10;
    for (let i = 0; i < 500; i++) confidence = confidenceAfterAbsence(confidence, false);
    expect(confidence).toBeGreaterThan(CONFIDENCE_NEUTRAL - 1);
    expect(confidence).toBeLessThanOrEqual(CONFIDENCE_NEUTRAL);

    let high = 90;
    for (let i = 0; i < 500; i++) high = confidenceAfterAbsence(high, false);
    expect(high).toBeLessThan(CONFIDENCE_NEUTRAL + 1);
    expect(high).toBeGreaterThanOrEqual(CONFIDENCE_NEUTRAL);
  });
});

describe('what a manager decides', () => {
  it('is worth a real but bounded amount in selection', () => {
    expect(confidenceBias(100)).toBeCloseTo(CONFIDENCE_SELECTION_BIAS, 6);
    expect(confidenceBias(0)).toBeCloseTo(-CONFIDENCE_SELECTION_BIAS, 6);
    expect(confidenceBias(CONFIDENCE_NEUTRAL)).toBe(0);
  });

  it('changes whether an evenly matched player is picked', () => {
    const trusted = selectionChance({ ...selection, confidence: 90 });
    const doubted = selectionChance({ ...selection, confidence: 15 });
    expect(trusted).toBeGreaterThan(doubted);
  });

  it('cannot make a bad player undroppable', () => {
    // A manager can talk himself into a footballer; he cannot make one good.
    const outclassed = { ...selection, rival: rival({ ability: 92 }), confidence: 100 };
    expect(selectionChance(outclassed)).toBeLessThan(0.5);
  });

  it('leaves a career that has never had one selected exactly as before', () => {
    // Every save written before managers had a view. Neutral is the only
    // reading that changes nobody's team sheet.
    const { confidence: _omitted, ...withoutConfidence } = { ...selection, confidence: undefined };
    expect(selectionChance(withoutConfidence)).toBe(
      selectionChance({ ...selection, confidence: CONFIDENCE_NEUTRAL }),
    );
  });
});

describe('what a manager is worth at renewal time', () => {
  const club = getTeam('northport-city');

  const offerWith = (confidence: number) =>
    renewalOffer({
      player: striker({ reputation: 62 }),
      club,
      stats: { ...createSeasonStats(), matches: 30, goals: 14, ratingTotal: 30 * 7.1 },
      season: 4,
      prestige: 1,
      confidence,
    });

  it('offers better terms to a player his manager wants kept', () => {
    const trusted = offerWith(92);
    const doubted = offerWith(30);
    expect(trusted).not.toBeNull();
    expect(trusted!.interest).toBeGreaterThan(doubted!.interest);
  });

  it('can promote the club\'s word for him on a season of being trusted', () => {
    const neutral = renewalRole('squad', CONFIDENCE_NEUTRAL);
    expect(neutral).toBe('squad');
    expect(renewalRole('squad', 85)).toBe('starter');
    expect(renewalRole('starter', 85)).toBe('star');
  });

  it('demotes it when the manager has stopped believing', () => {
    expect(renewalRole('star', 12)).toBe('starter');
    expect(renewalRole('starter', 12)).toBe('squad');
    // Nowhere further down to go.
    expect(renewalRole('squad', 12)).toBe('squad');
  });

  it('moves at most one step, so it is a verdict rather than a slider', () => {
    expect(renewalRole('squad', 100)).toBe('starter');
    expect(renewalRole('star', 0)).toBe('starter');
  });

  it('renews an older save exactly as it always did', () => {
    const withoutConfidence = renewalOffer({
      player: striker({ reputation: 62 }),
      club,
      stats: { ...createSeasonStats(), matches: 30, goals: 14, ratingTotal: 30 * 7.1 },
      season: 4,
      prestige: 1,
    });
    expect(withoutConfidence?.interest).toBeCloseTo(offerWith(CONFIDENCE_NEUTRAL)!.interest, 6);
    expect(confidenceInterest(CONFIDENCE_NEUTRAL)).toBe(1);
  });
});

describe('morale finally has something to be about', () => {
  it('is dragged up by a manager who believes in him and down by one who does not', () => {
    expect(moraleShift(90)).toBeGreaterThan(0);
    expect(moraleShift(10)).toBeLessThan(0);
    expect(moraleShift(CONFIDENCE_NEUTRAL)).toBe(0);
  });

  it('leaves the result the bigger term, which is what morale has always been', () => {
    // Being frozen out at a winning club still beats being adored at a losing
    // one. The gap between a win and a defeat is 78 - 34 = 44.
    expect(Math.abs(moraleShift(0))).toBeLessThan(44);
    expect(Math.abs(moraleShift(100))).toBeLessThan(44);
  });

  it('leaves the same career happier when the manager rates him', () => {
    const trusted = career('morale-trusted');
    const doubted = career('morale-trusted');
    trusted.confidence = 95;
    doubted.confidence = 5;

    // The identical match, in the identical career, at two different standings.
    playMatch(trusted, 7.0);
    playMatch(doubted, 7.0);

    expect(trusted.player.morale).toBeGreaterThan(doubted.player.morale);
  });
});

describe('a career keeps its manager honest', () => {
  it('climbs on a run of good performances and falls on a run of bad ones', () => {
    const good = career('run-good');
    const bad = career('run-bad');
    const start = good.confidence;

    for (let i = 0; i < 6; i++) playMatch(good, 8.4, 1);
    for (let i = 0; i < 6; i++) playMatch(bad, 4.6, -1);

    expect(good.confidence).toBeGreaterThan(start);
    expect(bad.confidence).toBeLessThan(start);
  });

  it('describes itself in words the player can act on', () => {
    expect(confidenceTier(5).label).toBe('Out of favour');
    expect(confidenceTier(CONFIDENCE_NEUTRAL).label).toBe('Watching');
    expect(confidenceTier(95).label).toBe('Untouchable');
    // Every band says something, because a blank line on the hub reads as a bug.
    for (const value of [0, 20, 35, 50, 65, 80, 100]) {
      expect(confidenceTier(value).note.length).toBeGreaterThan(0);
    }
  });
});
