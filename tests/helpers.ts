import { createGoalkeeper } from '../src/core/goalkeeper/goalkeeper.ts';
import type { Goalkeeper, GoalkeeperState } from '../src/core/goalkeeper/goalkeeper.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import type { Position } from '../src/core/player/positions.ts';
import { createTeam } from '../src/core/team/team.ts';
import type { Team } from '../src/core/team/team.ts';
import type { SituationContext, SituationType } from '../src/core/events/types.ts';
import type { Zone } from '../src/core/events/zones.ts';

/** Shared fixtures so tests describe intent rather than construction. */

export function veteran(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({
      name: 'Veteran',
      position: 'ST',
      experience: 90,
      baseAttribute: 60,
      attributes: {
        awareness: 85,
        composure: 82,
        decisionMaking: 88,
        finishing: 84,
        technique: 78,
        movement: 76,
      },
    }),
    ...overrides,
  };
}

export function prospect(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({
      name: 'Prospect',
      position: 'ST',
      experience: 8,
      baseAttribute: 50,
      attributes: {
        awareness: 45,
        composure: 42,
        decisionMaking: 40,
        finishing: 55,
        technique: 52,
        movement: 60,
      },
    }),
    ...overrides,
  };
}

export function playerAt(position: Position, base = 60): Player {
  return createPlayer({ name: `Test ${position}`, position, baseAttribute: base, attributes: {} });
}

export function keeper(overrides: Partial<Goalkeeper['attributes']> = {}): Goalkeeper {
  return createGoalkeeper({ name: 'Test Keeper', base: 55, attributes: overrides });
}

export function team(overrides: Partial<Team> = {}): Team {
  return { ...createTeam({ name: 'Test Team', base: 60 }), ...overrides };
}

export function goalkeeperState(
  gk: Goalkeeper = keeper(),
  overrides: Partial<GoalkeeperState> = {},
): GoalkeeperState {
  return {
    keeper: gk,
    action: 'set',
    committedAction: 'advancing',
    commitAt: 1,
    startingDepth: 0.3,
    ...overrides,
  };
}

export interface ContextOverrides {
  situation?: SituationType;
  zone?: Partial<Zone>;
  player?: Player;
  goalkeeper?: GoalkeeperState;
  nearbyDefenders?: number;
  defensivePressure?: number;
  situationQuality?: number;
  firstTime?: boolean;
  transition?: boolean;
  attackingTeam?: Team;
  defendingTeam?: Team;
}

export function context(overrides: ContextOverrides = {}): SituationContext {
  return {
    situation: overrides.situation ?? 'oneOnOne',
    zone: {
      third: 'attacking',
      channel: 'central',
      box: 'inside',
      ...overrides.zone,
    },
    player: overrides.player ?? veteran(),
    goalkeeper: overrides.goalkeeper ?? goalkeeperState(),
    attackingTeam: overrides.attackingTeam ?? team(),
    defendingTeam: overrides.defendingTeam ?? team(),
    nearbyDefenders: overrides.nearbyDefenders ?? 1,
    defensivePressure: overrides.defensivePressure ?? 0.3,
    situationQuality: overrides.situationQuality ?? 0.7,
    firstTime: overrides.firstTime ?? false,
    transition: overrides.transition ?? false,
    minute: 30,
  };
}
