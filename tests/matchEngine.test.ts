import { describe, expect, it } from 'vitest';
import { MatchEngine } from '../src/simulation/MatchEngine.ts';
import type { MatchSetup } from '../src/core/match/matchState.ts';
import {
  calculateMatchRating,
  compressEventDelta,
  createMatchStats,
} from '../src/core/match/matchStats.ts';
import { keeper, playerAt, team } from './helpers.ts';
import type { Position } from '../src/core/player/positions.ts';

function setup(position: Position = 'ST'): MatchSetup {
  return {
    player: playerAt(position, 65),
    playerTeam: team(),
    opponent: team(),
    opponentGoalkeeper: keeper(),
    ownGoalkeeper: keeper(),
    length: 90,
    playerTeamIsHome: true,
  };
}

/**
 * Play a whole match head-lessly, always choosing the same slot, so the engine
 * loop can be exercised without any UI.
 */
function playMatch(seed: string, position: Position = 'ST', slot = 1, timeUsedRatio = 0.5) {
  const engine = new MatchEngine(setup(position), seed);
  let events = 0;
  let guard = 0;

  while (!engine.state.finished && guard++ < 5000) {
    const update = engine.step();
    if (update.kind === 'interactive') {
      events++;
      const option = update.event.options.find((o) => o.slot === slot) ?? update.event.options[0]!;
      engine.submitDecision({
        option,
        timeUsed: update.event.timer.seconds * timeUsedRatio,
      });
    }
  }
  return { engine, events };
}

describe('match engine', () => {
  it('plays a complete match and finishes', () => {
    const { engine } = playMatch('m1');
    expect(engine.state.finished).toBe(true);
    expect(engine.state.minute).toBeGreaterThan(90);
    expect(engine.state.commentary.length).toBeGreaterThan(3);
  });

  it('is fully deterministic for a fixed seed', () => {
    const a = playMatch('determinism');
    const b = playMatch('determinism');
    expect(a.engine.state.playerTeamScore).toBe(b.engine.state.playerTeamScore);
    expect(a.engine.state.opponentScore).toBe(b.engine.state.opponentScore);
    expect(a.engine.state.stats).toEqual(b.engine.state.stats);
    expect(a.events).toBe(b.events);
    expect(a.engine.state.commentary).toEqual(b.engine.state.commentary);
  });

  it('produces different matches for different seeds', () => {
    const results = new Set<string>();
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const { engine } = playMatch(seed);
      results.add(`${engine.state.playerTeamScore}-${engine.state.opponentScore}-${engine.state.stats.shots}`);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('gives a striker a sensible number of interactive moments per match', () => {
    let total = 0;
    const matches = 12;
    for (let i = 0; i < matches; i++) total += playMatch(`rate-${i}`, 'ST').events;
    const average = total / matches;
    expect(average).toBeGreaterThan(2);
    expect(average).toBeLessThan(16);
  });

  it('involves a striker in more attacking moments than a centre back', () => {
    const strikerEvents = Array.from({ length: 8 }, (_, i) => playMatch(`fw-${i}`, 'ST').events);
    const defenderEvents = Array.from({ length: 8 }, (_, i) => playMatch(`df-${i}`, 'CB').events);
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean(strikerEvents)).toBeGreaterThan(mean(defenderEvents));
  });

  it('produces believable scorelines across many matches', () => {
    let totalGoals = 0;
    const matches = 30;
    for (let i = 0; i < matches; i++) {
      const { engine } = playMatch(`score-${i}`);
      totalGoals += engine.state.playerTeamScore + engine.state.opponentScore;
      expect(engine.state.playerTeamScore).toBeLessThan(10);
      expect(engine.state.opponentScore).toBeLessThan(10);
    }
    const perMatch = totalGoals / matches;
    expect(perMatch).toBeGreaterThan(0.5);
    expect(perMatch).toBeLessThan(7);
  });

  it('drains the match player fitness over 90 minutes', () => {
    const { engine } = playMatch('fitness');
    expect(engine.matchPlayer.fitness).toBeLessThan(100);
    expect(engine.matchPlayer.fitness).toBeGreaterThanOrEqual(0);
  });

  it('never mutates the persistent career player', () => {
    const config = setup();
    const before = JSON.parse(JSON.stringify(config.player));
    const engine = new MatchEngine(config, 'no-mutation');
    let guard = 0;
    while (!engine.state.finished && guard++ < 5000) {
      const update = engine.step();
      if (update.kind === 'interactive') {
        engine.submitDecision({ option: update.event.options[0]!, timeUsed: 0.5 });
      }
    }
    // The engine plays a clone: fitness drained there, career player untouched.
    expect(engine.matchPlayer.fitness).toBeLessThan(100);
    expect(config.player).toEqual(before);
    expect(config.player.attributes).not.toBe(engine.matchPlayer.attributes);
  });

  it('resolves an expired timer without a chosen option', () => {
    const engine = new MatchEngine(setup(), 'expiry');
    let handled = false;
    let guard = 0;
    while (!engine.state.finished && guard++ < 5000) {
      const update = engine.step();
      if (update.kind === 'interactive') {
        const resolution = engine.submitDecision({
          option: null,
          timeUsed: update.event.timer.seconds,
        });
        expect(resolution.option).toBeDefined();
        expect(resolution.instinctReason).toBeTruthy();
        handled = true;
      }
    }
    expect(handled).toBe(true);
  });

  it('will not advance while an interactive event is pending', () => {
    const engine = new MatchEngine(setup(), 'pending');
    let guard = 0;
    while (guard++ < 5000) {
      const update = engine.step();
      if (update.kind === 'interactive') {
        const minute = engine.state.minute;
        const again = engine.step();
        expect(again.kind).toBe('interactive');
        expect(engine.state.minute).toBe(minute);
        break;
      }
      if (update.kind === 'finished') break;
    }
    expect(guard).toBeLessThan(5000);
  });

  it('throws if a decision is submitted with no pending event', () => {
    const engine = new MatchEngine(setup(), 'no-event');
    expect(() => engine.submitDecision({ option: null, timeUsed: 0 })).toThrow();
  });

  it('rescales the goalkeeper commit onto the real decision window', () => {
    const engine = new MatchEngine(setup(), 'commit');
    let guard = 0;
    while (guard++ < 5000) {
      const update = engine.step();
      if (update.kind === 'finished') break;
      if (update.kind === 'interactive') {
        const { event } = update;
        expect(event.context.goalkeeper.commitAt).toBeGreaterThanOrEqual(0);
        expect(event.context.goalkeeper.commitAt).toBeLessThanOrEqual(event.timer.seconds);
        engine.submitDecision({ option: event.options[0]!, timeUsed: 0.1 });
      }
    }
  });

  it('applies the goalkeeper commit only when the decision came after it', () => {
    const engine = new MatchEngine(setup(), 'commit-apply');
    let guard = 0;
    while (guard++ < 5000) {
      const update = engine.step();
      if (update.kind === 'finished') break;
      if (update.kind === 'interactive') {
        const { event } = update;
        if (event.context.goalkeeper.commitAt <= 0.01) {
          engine.submitDecision({ option: event.options[0]!, timeUsed: 0 });
          continue;
        }
        engine.submitDecision({ option: event.options[0]!, timeUsed: 0 });
        expect(event.context.goalkeeper.action).toBe('set');
        return;
      }
    }
  });
});

describe('match rating', () => {
  const base = { result: 0, opponentStrength: 0.5 };

  it('starts around 6 for an uneventful match', () => {
    const stats = createMatchStats();
    stats.involvements = 1;
    expect(calculateMatchRating({ ...base, eventDelta: 0, stats })).toBeCloseTo(6, 1);
  });

  it('rewards goals heavily', () => {
    const stats = createMatchStats();
    stats.goals = 2;
    stats.involvements = 4;
    expect(calculateMatchRating({ ...base, eventDelta: 3.2, stats })).toBeGreaterThan(8.5);
  });

  it('lets a midfielder rate highly without scoring', () => {
    const stats = createMatchStats();
    stats.assists = 1;
    stats.keyPasses = 4;
    stats.passes = 10;
    stats.passesCompleted = 9;
    stats.tackles = 3;
    stats.interceptions = 2;
    stats.involvements = 8;
    const rating = calculateMatchRating({ ...base, eventDelta: 2.1, stats });
    expect(rating).toBeGreaterThan(7.5);
    expect(stats.goals).toBe(0);
  });

  it('punishes missed big chances', () => {
    const stats = createMatchStats();
    stats.shots = 4;
    stats.bigChancesMissed = 3;
    stats.involvements = 4;
    expect(calculateMatchRating({ ...base, eventDelta: -1.8, stats })).toBeLessThan(5);
  });

  it('stays within 1-10', () => {
    const stats = createMatchStats();
    stats.involvements = 5;
    expect(calculateMatchRating({ ...base, eventDelta: 99, stats })).toBeLessThanOrEqual(10);
    expect(calculateMatchRating({ ...base, eventDelta: -99, stats })).toBeGreaterThanOrEqual(1);
  });

  it('compresses accumulated credit so a busy match cannot out-rate a decisive one', () => {
    expect(compressEventDelta(1.5)).toBe(1.5);
    expect(compressEventDelta(-1.5)).toBe(-1.5);
    // Ten small positive contributions must not beat two decisive ones.
    expect(compressEventDelta(6)).toBeLessThan(6);
    expect(compressEventDelta(6)).toBeGreaterThan(compressEventDelta(4));

    const busy = createMatchStats();
    busy.involvements = 12;
    busy.passes = 12;
    busy.passesCompleted = 11;
    const decisive = createMatchStats();
    decisive.involvements = 3;
    decisive.goals = 2;

    const busyRating = calculateMatchRating({ ...base, eventDelta: 1.2, stats: busy });
    const decisiveRating = calculateMatchRating({ ...base, eventDelta: 3.2, stats: decisive });
    expect(decisiveRating).toBeGreaterThan(busyRating);
  });

  it('adjusts for result and opponent strength', () => {
    const stats = createMatchStats();
    stats.involvements = 3;
    const win = calculateMatchRating({ eventDelta: 0.5, stats, result: 1, opponentStrength: 0.5 });
    const loss = calculateMatchRating({ eventDelta: 0.5, stats, result: -1, opponentStrength: 0.5 });
    expect(win).toBeGreaterThan(loss);

    const vsStrong = calculateMatchRating({ eventDelta: 0.5, stats, result: 0, opponentStrength: 0.95 });
    const vsWeak = calculateMatchRating({ eventDelta: 0.5, stats, result: 0, opponentStrength: 0.1 });
    expect(vsStrong).toBeGreaterThan(vsWeak);
  });
});
