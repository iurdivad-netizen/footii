import { createGoalkeeper } from '../core/goalkeeper/goalkeeper.ts';
import type { GoalkeeperState } from '../core/goalkeeper/goalkeeper.ts';
import { createTeam } from '../core/team/team.ts';
import type { Player } from '../core/player/player.ts';
import type { SituationContext } from '../core/events/types.ts';
import { getSituationTemplate } from '../data/situations.ts';
import { calculateDecisionTime } from './DecisionTimer.ts';

/**
 * DECISION BENCHMARK
 *
 * A fixed, neutral one-on-one used purely as a yardstick: how long would this
 * player have to think in a standard chance?
 *
 * This exists because it is the single most meaningful progress number in the
 * game. Ability is an abstraction; "your decision window went from 1.32s to
 * 1.66s" is the thing you actually experience at the keyboard. Everything about
 * the benchmark is held constant — same opponent, same keeper, same pressure —
 * so the only variable is the player.
 *
 * It is never used by the match engine, only for reporting.
 */

const BENCHMARK_TEAM = createTeam({ name: 'Benchmark', base: 60 });

const BENCHMARK_KEEPER = createGoalkeeper({ name: 'Benchmark Keeper', base: 60, attributes: {} });

const BENCHMARK_GOALKEEPER_STATE: GoalkeeperState = {
  keeper: BENCHMARK_KEEPER,
  action: 'set',
  committedAction: 'advancing',
  commitAt: 1,
  startingDepth: 0.3,
};

/** Decision window, in seconds, for this player in a standard one-on-one. */
export function benchmarkDecisionWindow(player: Player, paceScale = 1): number {
  const template = getSituationTemplate('oneOnOne');
  const context: SituationContext = {
    situation: 'oneOnOne',
    zone: { third: 'attacking', channel: 'central', box: 'inside' },
    player,
    goalkeeper: BENCHMARK_GOALKEEPER_STATE,
    attackingTeam: BENCHMARK_TEAM,
    teammates: [],
    defendingTeam: BENCHMARK_TEAM,
    nearbyDefenders: 1,
    defensivePressure: 0.3,
    situationQuality: 0.7,
    firstTime: false,
    transition: false,
    minute: 45,
  };
  return calculateDecisionTime(context, template, paceScale).seconds;
}
