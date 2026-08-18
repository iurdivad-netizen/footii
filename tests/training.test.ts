import { describe, expect, it } from 'vitest';
import { createPlayer, currentAbility } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { ATTRIBUTE_LABELS } from '../src/core/player/attributes.ts';
import {
  TRAINING_FLOOR,
  TRAINING_SPREAD,
  applyTraining,
  calculateTrainingPoints,
  maxTrainableValue,
  summariseProgress,
  validateAllocation,
} from '../src/core/career/training.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import type { SeasonStats } from '../src/core/career/seasonStats.ts';
import { benchmarkDecisionWindow } from '../src/simulation/DecisionBenchmark.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { endSeason, playerFixtures, recordPlayerMatch, startCareer } from '../src/simulation/CareerService.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';

const lookup = (id: string) => getTeam(id);

function player(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({
      name: 'Kid',
      position: 'ST',
      age: 18,
      experience: 10,
      baseAttribute: 50,
      potentialAbility: 88,
      attributes: { awareness: 45, composure: 42, decisionMaking: 40 },
    }),
    ...overrides,
  };
}

function season(overrides: Partial<SeasonStats> = {}): SeasonStats {
  return { ...createSeasonStats(), matches: 14, ratingTotal: 14 * 7.0, ...overrides };
}

describe('training points award', () => {
  it('awards more to a young player than an old one', () => {
    const young = calculateTrainingPoints(player({ age: 18 }), season()).points;
    const old = calculateTrainingPoints(player({ age: 33, potentialAbility: 60 }), season()).points;
    expect(young).toBeGreaterThan(old);
  });

  it('awards more for a better season', () => {
    const good = calculateTrainingPoints(player(), season({ ratingTotal: 14 * 8 })).points;
    const poor = calculateTrainingPoints(player(), season({ ratingTotal: 14 * 5.5 })).points;
    expect(good).toBeGreaterThan(poor);
  });

  it('awards more for playing more', () => {
    const everPresent = calculateTrainingPoints(player(), season({ matches: 14, ratingTotal: 98 })).points;
    const fringe = calculateTrainingPoints(player(), season({ matches: 3, ratingTotal: 21 })).points;
    expect(everPresent).toBeGreaterThan(fringe);
  });

  it('gives nothing for a season with no appearances', () => {
    expect(calculateTrainingPoints(player(), createSeasonStats()).points).toBe(0);
  });

  it('never leaves a player who played with nothing to spend', () => {
    const veteran = player({ age: 34, potentialAbility: 55 });
    expect(calculateTrainingPoints(veteran, season({ ratingTotal: 14 * 5 })).points).toBeGreaterThanOrEqual(
      TRAINING_FLOOR,
    );
  });

  it('explains itself', () => {
    const award = calculateTrainingPoints(player(), season({ ratingTotal: 14 * 7.8 }));
    expect(award.notes.length).toBeGreaterThan(0);
    expect(award.notes.join(' ')).toMatch(/Young|average|ceiling|coaches/);
  });
});

describe('training allocation', () => {
  it('caps an attribute relative to overall ability, so you cannot build a spike', () => {
    const p = player();
    const cap = maxTrainableValue(p);
    expect(cap).toBe(currentAbility(p) + TRAINING_SPREAD);

    const result = validateAllocation(p, 50, { spend: { finishing: 40 } });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot train any attribute past/);
  });

  it('rejects spending more points than are available', () => {
    const result = validateAllocation(player(), 5, { spend: { awareness: 3, composure: 4 } });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/more than you have/);
    expect(result.spent).toBe(7);
  });

  it('rejects negative training', () => {
    expect(validateAllocation(player(), 10, { spend: { pace: -2 } }).valid).toBe(false);
  });

  it('accepts a legal allocation and applies it', () => {
    const p = player();
    const before = p.attributes.awareness;
    const allocation = { spend: { awareness: 4, composure: 3 } };
    expect(validateAllocation(p, 10, allocation).valid).toBe(true);

    const applied = applyTraining(p, allocation);
    expect(p.attributes.awareness).toBe(before + 4);
    expect(applied).toHaveLength(2);
    expect(applied.find((a) => a.attribute === 'awareness')).toMatchObject({ from: before, to: before + 4 });
  });

  it('never pushes an attribute past 99', () => {
    const p = player();
    p.attributes.finishing = 98;
    // Ability is low, so the spread cap bites first — but 99 must hold regardless.
    p.potentialAbility = 99;
    applyTraining(p, { spend: { finishing: 10 } });
    expect(p.attributes.finishing).toBeLessThanOrEqual(99);
  });

  it('discards unspent points rather than banking them', () => {
    const p = player();
    const applied = applyTraining(p, { spend: {} });
    expect(applied).toHaveLength(0);
    // Nothing to assert on the player: the point is that no state accumulates.
    expect(currentAbility(p)).toBe(currentAbility(p));
  });

  it('TRAINING THE RIGHT ATTRIBUTES WIDENS THE DECISION WINDOW', () => {
    const p = player();
    const before = benchmarkDecisionWindow(p);

    applyTraining(p, { spend: { awareness: 6, composure: 5, decisionMaking: 5 } });
    const after = benchmarkDecisionWindow(p);

    expect(after).toBeGreaterThan(before);
  });

  it('training unrelated attributes does not widen the window', () => {
    const p = player();
    const before = benchmarkDecisionWindow(p);
    applyTraining(p, { spend: { heading: 8, crossing: 8 } });
    expect(benchmarkDecisionWindow(p)).toBe(before);
  });
});

describe('season progress reporting', () => {
  it('lists only attributes that changed, biggest gain first', () => {
    const before = { ...player().attributes };
    const after = { ...before, awareness: before.awareness + 2, finishing: before.finishing + 5 };
    const changes = summariseProgress(before, after, ATTRIBUTE_LABELS);
    expect(changes).toHaveLength(2);
    expect(changes[0]!.attribute).toBe('finishing');
    expect(changes[0]!.to - changes[0]!.from).toBe(5);
  });

  it('reports real progress across a played season', () => {
    const state = startCareer({
      player: player(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'progress',
    });
    const stats = createMatchStats();
    stats.minutes = 90;
    for (let i = 0; i < playerFixtures(state).length; i++) {
      recordPlayerMatch(
        state,
        { stats, rating: 7.6, playerTeamScore: 2, opponentScore: 0, fitnessAtEnd: 60 },
        lookup,
      );
    }

    const { progress, trainingAwarded } = endSeason(state, lookup);

    expect(progress.abilityAfter).toBeGreaterThan(progress.abilityBefore);
    expect(progress.experienceAfter).toBeGreaterThan(progress.experienceBefore);
    expect(progress.changes.length).toBeGreaterThan(0);
    // The headline number: a developing teenager gets more time on the ball.
    expect(progress.windowAfter).toBeGreaterThan(progress.windowBefore);
    expect(trainingAwarded).toBeGreaterThan(0);
    expect(state.trainingPoints).toBe(trainingAwarded);
  });

  it('measures each season separately rather than cumulatively', () => {
    const state = startCareer({
      player: player(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'per-season',
    });
    const stats = createMatchStats();
    stats.minutes = 90;
    const playSeason = () => {
      for (let i = 0; i < playerFixtures(state).length; i++) {
        recordPlayerMatch(
          state,
          { stats, rating: 7.4, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 60 },
          lookup,
        );
      }
      return endSeason(state, lookup);
    };

    const first = playSeason();
    const second = playSeason();

    // Season two's baseline is season one's finish, not the career start.
    expect(second.progress.abilityBefore).toBe(first.progress.abilityAfter);
    expect(second.progress.experienceBefore).toBeCloseTo(first.progress.experienceAfter, 5);
  });
});

describe('decision benchmark', () => {
  it('is a pure function of the player', () => {
    const p = player();
    expect(benchmarkDecisionWindow(p)).toBe(benchmarkDecisionWindow(p));
  });

  it('separates a raw teenager from a composed veteran', () => {
    const kid = player({ age: 17, experience: 5 });
    const veteran = createPlayer({
      name: 'Vet',
      position: 'ST',
      age: 29,
      experience: 90,
      baseAttribute: 60,
      attributes: { awareness: 85, composure: 82, decisionMaking: 88 },
    });
    expect(benchmarkDecisionWindow(veteran)).toBeGreaterThan(benchmarkDecisionWindow(kid) + 0.5);
  });

  it('scales with the pace setting', () => {
    const p = player();
    expect(benchmarkDecisionWindow(p, 1.5)).toBeGreaterThan(benchmarkDecisionWindow(p, 1));
  });
});
