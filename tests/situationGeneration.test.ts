import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import {
  chooseSituationType,
  createGoalkeeperState,
  generateSituation,
  involvementChance,
} from '../src/simulation/SituationGenerator.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { createTeam } from '../src/core/team/team.ts';
import type { SituationType } from '../src/core/events/types.ts';
import { SITUATION_TEMPLATES } from '../src/data/situations.ts';
import { keeper, playerAt, team } from './helpers.ts';

function distribution(
  seedPrefix: string,
  player: ReturnType<typeof playerAt>,
  attackingTeam = team(),
  runs = 2000,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const type = chooseSituationType(new Rng(`${seedPrefix}-${i}`), player, attackingTeam);
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

describe('situation generation — position behaviour', () => {
  it('a striker and a defensive midfielder do not play the same game', () => {
    const striker = distribution('st', playerAt('ST'));
    const dm = distribution('dm', playerAt('DM'));

    // The striker gets the chances; the midfielder gets the build-up.
    expect(striker['oneOnOne'] ?? 0).toBeGreaterThan(dm['oneOnOne'] ?? 0);
    expect(dm['midfieldProgression'] ?? 0).toBeGreaterThan(striker['midfieldProgression'] ?? 0);
  });

  it('wingers generate wide attacks that strikers do not', () => {
    const winger = distribution('rw', playerAt('RW'));
    const striker = distribution('st2', playerAt('ST'));
    expect(winger['wideAttack'] ?? 0).toBeGreaterThan((striker['wideAttack'] ?? 0) * 2);
  });

  it('never generates a situation a position cannot experience', () => {
    for (const position of ['ST', 'CM', 'CB', 'RW'] as const) {
      const counts = distribution(`valid-${position}`, playerAt(position), team(), 600);
      for (const type of Object.keys(counts) as SituationType[]) {
        expect(
          SITUATION_TEMPLATES[type].positionWeights[position],
          `${position} should not get ${type}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('tendencies differentiate two technically identical strikers', () => {
    const runner = createPlayer({
      name: 'Runner',
      position: 'ST',
      baseAttribute: 60,
      attributes: {},
      tendencies: { runsBehind: 95, attacksSpace: 90, dropsDeep: 10, comesShort: 10 },
    });
    const dropper = createPlayer({
      name: 'Dropper',
      position: 'ST',
      baseAttribute: 60,
      attributes: {},
      tendencies: { runsBehind: 10, attacksSpace: 15, dropsDeep: 95, comesShort: 90 },
    });

    const runnerCounts = distribution('runner', runner);
    const dropperCounts = distribution('dropper', dropper);

    const runnerThrough = (runnerCounts['oneOnOne'] ?? 0) + (runnerCounts['throughBallRun'] ?? 0);
    const dropperThrough = (dropperCounts['oneOnOne'] ?? 0) + (dropperCounts['throughBallRun'] ?? 0);
    expect(runnerThrough).toBeGreaterThan(dropperThrough);
    expect(dropperCounts['edgeOfBox'] ?? 0).toBeGreaterThan(runnerCounts['edgeOfBox'] ?? 0);
  });

  it('team style shapes the chances a team creates', () => {
    const wide = createTeam({ name: 'Wide', base: 60, style: 'widePlay', ratings: { width: 90, crossing: 90 } });
    const possession = createTeam({
      name: 'Poss',
      base: 60,
      style: 'possession',
      ratings: { possession: 90, passing: 90, width: 35, crossing: 35 },
    });
    const wideCounts = distribution('wide', playerAt('RW'), wide);
    const possCounts = distribution('poss', playerAt('RW'), possession);
    expect(wideCounts['wideAttack'] ?? 0).toBeGreaterThan(possCounts['wideAttack'] ?? 0);
  });

  it('defending and attacking draw from disjoint pools', () => {
    for (let i = 0; i < 200; i++) {
      const defending = chooseSituationType(new Rng(`def-${i}`), playerAt('CB'), team(), {
        defending: true,
      });
      expect(SITUATION_TEMPLATES[defending].defensive, defending).toBe(true);

      const attacking = chooseSituationType(new Rng(`att-${i}`), playerAt('CB'), team());
      expect(SITUATION_TEMPLATES[attacking].defensive, attacking).toBe(false);
    }
  });

  it('a defending striker presses; a defending centre back defends his box', () => {
    const defensive = (seedPrefix: string, position: 'ST' | 'CB') => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < 1500; i++) {
        const type = chooseSituationType(new Rng(`${seedPrefix}-${i}`), playerAt(position), team(), {
          defending: true,
        });
        counts[type] = (counts[type] ?? 0) + 1;
      }
      return counts;
    };

    const striker = defensive('press-st', 'ST');
    const centreBack = defensive('press-cb', 'CB');

    // The striker's defensive work is the press, not the last-ditch tackle.
    expect(striker['pressingTrap'] ?? 0).toBeGreaterThan(striker['defensiveDuel'] ?? 0);
    expect(centreBack['defensiveDuel'] ?? 0).toBeGreaterThan(centreBack['pressingTrap'] ?? 0);
    expect(centreBack['aerialDuel'] ?? 0).toBeGreaterThan(striker['aerialDuel'] ?? 0);
  });

  it('the opponent\u2019s style shapes the defending you are asked to do', () => {
    const defensiveCounts = (seedPrefix: string, opponent: ReturnType<typeof createTeam>) => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < 1500; i++) {
        const type = chooseSituationType(new Rng(`${seedPrefix}-${i}`), playerAt('CB'), opponent, {
          defending: true,
        });
        counts[type] = (counts[type] ?? 0) + 1;
      }
      return counts;
    };

    const direct = createTeam({
      name: 'Long Ball',
      base: 60,
      style: 'direct',
      ratings: { crossing: 85 },
    });
    const possession = createTeam({
      name: 'Passers',
      base: 60,
      style: 'possession',
      ratings: { possession: 90, crossing: 30 },
    });

    const vsDirect = defensiveCounts('vs-direct', direct);
    const vsPossession = defensiveCounts('vs-poss', possession);

    // A direct side makes you head balls; a possession side invites the press.
    expect(vsDirect['aerialDuel'] ?? 0).toBeGreaterThan(vsPossession['aerialDuel'] ?? 0);
    expect(vsPossession['pressingTrap'] ?? 0).toBeGreaterThan(vsDirect['pressingTrap'] ?? 0);
  });

  it('set pieces are rare enough to stay special', () => {
    const counts = distribution('rare', playerAt('ST'), team(), 4000);
    const setPieces =
      (counts['penalty'] ?? 0) + (counts['freeKickDirect'] ?? 0);
    // A penalty every few matches, not every few minutes.
    expect(setPieces / 4000).toBeLessThan(0.05);
    expect(counts['penalty'] ?? 0).toBeGreaterThan(0);
  });
});

describe('generated situation context', () => {
  it('produces coherent, bounded context values', () => {
    for (let i = 0; i < 500; i++) {
      const { context } = generateSituation(new Rng(`ctx-${i}`), {
        player: playerAt('ST'),
        attackingTeam: team(),
        defendingTeam: team(),
        goalkeeper: keeper(),
        minute: 40,
      });
      expect(context.nearbyDefenders).toBeGreaterThanOrEqual(0);
      expect(context.nearbyDefenders).toBeLessThanOrEqual(4);
      expect(context.defensivePressure).toBeGreaterThanOrEqual(0);
      expect(context.defensivePressure).toBeLessThanOrEqual(1);
      expect(context.situationQuality).toBeGreaterThanOrEqual(0);
      expect(context.situationQuality).toBeLessThanOrEqual(1);
      expect(context.goalkeeper.commitAt).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const request = {
      player: playerAt('ST'),
      attackingTeam: team(),
      defendingTeam: team(),
      goalkeeper: keeper(),
      minute: 12,
    };
    const a = generateSituation(new Rng('fixed-sit'), request);
    const b = generateSituation(new Rng('fixed-sit'), request);
    expect(a.type).toBe(b.type);
    expect(a.context.zone).toEqual(b.context.zone);
    expect(a.context.situationQuality).toBe(b.context.situationQuality);
  });

  it('a stronger defence produces tougher situations', () => {
    const weak = createTeam({ name: 'Weak', base: 40, ratings: { defence: 25, defensiveIntensity: 25 } });
    const strong = createTeam({ name: 'Strong', base: 85, ratings: { defence: 95, defensiveIntensity: 95 } });

    const measure = (defendingTeam: ReturnType<typeof createTeam>) => {
      let pressure = 0;
      const runs = 400;
      for (let i = 0; i < runs; i++) {
        const { context } = generateSituation(new Rng(`d-${i}`), {
          player: playerAt('ST'),
          attackingTeam: team(),
          defendingTeam,
          goalkeeper: keeper(),
          minute: 20,
        });
        pressure += context.defensivePressure;
      }
      return pressure / runs;
    };

    expect(measure(strong)).toBeGreaterThan(measure(weak));
  });
});

describe('goalkeeper state', () => {
  it('always starts set and commits within the window', () => {
    for (let i = 0; i < 300; i++) {
      const state = createGoalkeeperState(new Rng(`gk-${i}`), keeper(), 'oneOnOne', 2.5);
      expect(state.action).toBe('set');
      expect(state.commitAt).toBeGreaterThanOrEqual(0);
      expect(state.commitAt).toBeLessThanOrEqual(2.5);
      expect(state.startingDepth).toBeGreaterThanOrEqual(0);
      expect(state.startingDepth).toBeLessThanOrEqual(1);
    }
  });

  it('aggressive keepers start further off their line and commit earlier', () => {
    const measure = (aggression: number) => {
      let depth = 0;
      let commit = 0;
      const runs = 500;
      for (let i = 0; i < runs; i++) {
        const state = createGoalkeeperState(new Rng(`agg-${i}`), keeper({ aggression }), 'oneOnOne', 2.5);
        depth += state.startingDepth;
        commit += state.commitAt;
      }
      return { depth: depth / runs, commit: commit / runs };
    };
    const passive = measure(15);
    const aggressive = measure(95);
    expect(aggressive.depth).toBeGreaterThan(passive.depth);
    expect(aggressive.commit).toBeLessThan(passive.commit);
  });

  it('aggressive keepers rush out more often', () => {
    const rushRate = (aggression: number) => {
      let rushing = 0;
      const runs = 1000;
      for (let i = 0; i < runs; i++) {
        const state = createGoalkeeperState(new Rng(`rush-${i}`), keeper({ aggression }), 'oneOnOne', 2.5);
        if (state.committedAction === 'rushing') rushing++;
      }
      return rushing / runs;
    };
    expect(rushRate(95)).toBeGreaterThan(rushRate(10));
  });
});

describe('involvement', () => {
  it('scales with position — strikers are involved in attacks far more than centre backs', () => {
    expect(involvementChance(playerAt('ST'), team())).toBeGreaterThan(
      involvementChance(playerAt('CB'), team()) * 3,
    );
  });

  it('inverts for defensive involvement', () => {
    expect(involvementChance(playerAt('CB'), team(), true)).toBeGreaterThan(
      involvementChance(playerAt('ST'), team(), true),
    );
  });

  it('stays a probability', () => {
    for (const position of ['ST', 'CM', 'CB', 'LW', 'DM'] as const) {
      const value = involvementChance(playerAt(position, 99), team());
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
