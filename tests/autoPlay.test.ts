import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { MatchEngine } from '../src/simulation/MatchEngine.ts';
import { autoChooseAction, autoTimeUsed, runMatchAutomatically } from '../src/simulation/AutoPlay.ts';
import { getGoalkeeperForTeam, getPreset, getTeam } from '../src/data/gameData.ts';
import { getAction } from '../src/data/actionCatalogue.ts';
import { context } from './helpers.ts';

/**
 * Auto-play is the "skip this match" policy. What matters is not that it plays
 * well but that it plays FAIRLY: better than nobody deciding, worse than a good
 * read, and driven by the player's own judgement rather than by luck.
 */

function engineFor(presetId: string, seed: string): MatchEngine {
  const playerTeam = getTeam('vale-park');
  const opponent = getTeam('northport-city');
  return new MatchEngine(
    {
      player: getPreset(presetId).create(),
      playerTeam,
      opponent,
      opponentGoalkeeper: getGoalkeeperForTeam(opponent.id),
      ownGoalkeeper: getGoalkeeperForTeam(playerTeam.id),
      length: 90,
      playerTeamIsHome: true,
      paceScale: 1,
    },
    seed,
  );
}

type Policy = 'auto' | 'random' | 'best' | 'worst';

/** Play one match under a fixed decision policy and report the rating. */
function play(policy: Policy, seed: string, presetId = 'veteran-striker'): number {
  const engine = engineFor(presetId, seed);
  if (policy === 'auto') {
    runMatchAutomatically(engine, seed);
    return engine.rating();
  }

  const rng = new Rng(`${seed}:policy`);
  for (let i = 0; i < 10000; i++) {
    const update = engine.step();
    if (update.kind === 'finished') break;
    if (update.kind !== 'interactive') continue;

    const { options, context: ctx, timer } = update.event;
    const byFit = [...options].sort(
      (a, b) => getAction(b.kind).fit(ctx) - getAction(a.kind).fit(ctx),
    );
    const option =
      policy === 'random' ? rng.pick(options) : policy === 'best' ? byFit[0]! : byFit[byFit.length - 1]!;
    // `best` decides early as well as correctly, because that is what playing
    // well actually looks like: reading the situation buys you the time bonus
    // as well as the right option. The other policies take the middle of the
    // window, so choice quality is compared like for like.
    const share = policy === 'best' ? 0.22 : 0.6;
    engine.submitDecision({ option, timeUsed: timer.seconds * share });
  }
  return engine.rating();
}

function averageRating(policy: Policy, matches: number, presetId?: string): number {
  let total = 0;
  for (let i = 0; i < matches; i++) total += play(policy, `m${i}`, presetId);
  return total / matches;
}

describe('choosing an action automatically', () => {
  it('is deterministic from its rng', () => {
    const ctx = context();
    const options = optionsFor();
    expect(autoChooseAction(new Rng('same'), ctx, options).kind).toBe(
      autoChooseAction(new Rng('same'), ctx, options).kind,
    );
  });

  it('always returns one of the options it was given', () => {
    const ctx = context();
    const options = optionsFor();
    for (let i = 0; i < 50; i++) {
      const chosen = autoChooseAction(new Rng(`o${i}`), ctx, options);
      expect(options).toContain(chosen);
    }
  });

  it('never runs the clock down, because deciding is the point', () => {
    // Expiry carries its own penalties on top of a poor choice. Auto-play is a
    // decision, so it must always land inside the window.
    const ctx = context();
    for (let i = 0; i < 50; i++) {
      const used = autoTimeUsed(new Rng(`t${i}`), ctx, 4);
      expect(used).toBeGreaterThan(0);
      expect(used).toBeLessThan(4);
    }
  });
});

describe('how well a skipped match is played', () => {
  // 120 matches per policy: enough to separate the policies, quick enough to
  // stay in a unit-test suite.
  const MATCHES = 120;
  const auto = averageRating('auto', MATCHES);
  const random = averageRating('random', MATCHES);
  const best = averageRating('best', MATCHES);
  const worst = averageRating('worst', MATCHES);

  it('beats choosing at random, because the player has judgement', () => {
    expect(auto).toBeGreaterThan(random);
  });

  it('loses to a good read, so playing a match is worth something', () => {
    // The gap here IS the value of turning up. If it ever closed, skipping
    // would become the strongest way to play and the decision mechanic the
    // whole game is built around would be optional.
    expect(auto).toBeLessThan(best);
    expect(best - auto).toBeGreaterThan(0.25);
  });

  it('sits well clear of choosing badly', () => {
    expect(auto).toBeGreaterThan(worst + 1);
  });

  it('is better for a player who reads the game than one who does not', () => {
    // The veteran has Decision Making 88; the prospect has 40. Skipping costs a
    // raw teenager far more than it costs a seasoned professional, which is a
    // real reason to play a young player's matches yourself.
    const veteran = averageRating('auto', 60, 'veteran-striker');
    const prospect = averageRating('auto', 60, 'young-prospect');
    expect(veteran).toBeGreaterThan(prospect + 1);
  });
});

describe('running a match to full time', () => {
  it('finishes the match and leaves a complete set of statistics', () => {
    const engine = engineFor('veteran-striker', 'full');
    runMatchAutomatically(engine, 'full');

    expect(engine.state.finished).toBe(true);
    expect(engine.state.stats.minutes).toBeGreaterThanOrEqual(90);
    expect(engine.rating()).toBeGreaterThan(0);
    expect(engine.currentEvent).toBeNull();
  });

  it('drains fitness exactly as a played match does', () => {
    const engine = engineFor('veteran-striker', 'tired');
    runMatchAutomatically(engine, 'tired');
    expect(engine.matchPlayer.fitness).toBeLessThan(100);
  });

  it('never touches the persistent player', () => {
    const engine = engineFor('veteran-striker', 'clone');
    const before = engine.setup.player.fitness;
    runMatchAutomatically(engine, 'clone');
    expect(engine.setup.player.fitness).toBe(before);
  });

  it('is reproducible, so a skipped match is as deterministic as a played one', () => {
    const a = engineFor('veteran-striker', 'repeat');
    const b = engineFor('veteran-striker', 'repeat');
    runMatchAutomatically(a, 'repeat');
    runMatchAutomatically(b, 'repeat');

    expect(a.state.playerTeamScore).toBe(b.state.playerTeamScore);
    expect(a.state.opponentScore).toBe(b.state.opponentScore);
    expect(a.state.stats).toEqual(b.state.stats);
    expect(a.rating()).toBe(b.rating());
  });

  it('produces different matches from different seeds', () => {
    const ratings = new Set<number>();
    for (let i = 0; i < 12; i++) ratings.add(play('auto', `vary${i}`));
    expect(ratings.size).toBeGreaterThan(4);
  });
});

/** Six plausible options, taken from a real generated situation. */
function optionsFor() {
  const engine = engineFor('veteran-striker', 'options');
  for (let i = 0; i < 10000; i++) {
    const update = engine.step();
    if (update.kind === 'interactive') return update.event.options;
    if (update.kind === 'finished') break;
  }
  throw new Error('no interactive event generated');
}
