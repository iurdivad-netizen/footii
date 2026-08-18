import teamsJson from './teams.json';
import goalkeepersJson from './goalkeepers.json';
import type { Team, TacticalStyle } from '../core/team/team.ts';
import { createTeam } from '../core/team/team.ts';
import type { Goalkeeper } from '../core/goalkeeper/goalkeeper.ts';
import { createGoalkeeper } from '../core/goalkeeper/goalkeeper.ts';
import type { Player } from '../core/player/player.ts';
import { createPlayer } from '../core/player/player.ts';

/** Static data loading. JSON in, strongly typed domain objects out. */

interface TeamJson {
  id: string;
  name: string;
  shortName: string;
  style: string;
  colour: string;
  base: number;
  division: number;
  ratings: Record<string, number>;
}

interface GoalkeeperJson {
  id: string;
  name: string;
  teamId: string;
  attributes: Record<string, number>;
}

export const TEAMS: Team[] = (teamsJson as TeamJson[]).map((entry) =>
  createTeam({
    id: entry.id,
    name: entry.name,
    shortName: entry.shortName,
    style: entry.style as TacticalStyle,
    colour: entry.colour,
    base: entry.base,
    division: entry.division,
    ratings: entry.ratings,
  }),
);

/** Every club in a given starting division. */
export function teamsInDivision(division: number): Team[] {
  return TEAMS.filter((team) => team.division === division);
}

interface GoalkeeperEntry {
  goalkeeper: Goalkeeper;
  teamId: string;
}

export const GOALKEEPERS: GoalkeeperEntry[] = (goalkeepersJson as GoalkeeperJson[]).map((entry) => ({
  teamId: entry.teamId,
  goalkeeper: createGoalkeeper({ id: entry.id, name: entry.name, attributes: entry.attributes }),
}));

export function getTeam(id: string): Team {
  const team = TEAMS.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team: ${id}`);
  return team;
}

export function getGoalkeeperForTeam(teamId: string): Goalkeeper {
  const entry = GOALKEEPERS.find((g) => g.teamId === teamId);
  if (!entry) throw new Error(`No goalkeeper for team: ${teamId}`);
  return entry.goalkeeper;
}

/**
 * Playable presets for the vertical slice.
 *
 * These exist to make the design principles immediately legible: the veteran
 * and the prospect have very different decision windows, and the two strikers
 * with similar technique generate different chances because their tendencies
 * differ.
 */
export interface PlayerPreset {
  id: string;
  label: string;
  description: string;
  create: () => Player;
}

/** Marker used by the UI for "build your own" rather than a pre-built player. */
export const CUSTOM_PLAYER_ID = '__custom__';

export const PLAYER_PRESETS: PlayerPreset[] = [
  {
    id: 'veteran-striker',
    label: 'Ray Bellingham — ST, 29',
    description:
      'Experienced penalty-box striker. A long decision window and cold finishing, but no longer quick.',
    create: () =>
      createPlayer({
        name: 'Ray Bellingham',
        age: 29,
        position: 'ST',
        experience: 88,
        reputation: 72,
        potentialAbility: 78,
        baseAttribute: 62,
        attributes: {
          finishing: 84,
          shooting: 78,
          technique: 74,
          composure: 82,
          awareness: 85,
          decisionMaking: 88,
          anticipation: 80,
          positioning: 86,
          movement: 78,
          heading: 76,
          pace: 58,
          acceleration: 56,
          stamina: 62,
          dribbling: 62,
        },
        tendencies: { holdsPosition: 70, runsBehind: 45, dropsDeep: 55, attacksSpace: 50 },
      }),
  },
  {
    id: 'young-prospect',
    label: 'Kai Ferreira — ST, 18',
    description:
      'Explosive teenage prospect. Frighteningly quick and direct, but the game still moves too fast for him.',
    create: () =>
      createPlayer({
        name: 'Kai Ferreira',
        age: 18,
        position: 'ST',
        experience: 12,
        reputation: 30,
        potentialAbility: 88,
        baseAttribute: 50,
        attributes: {
          finishing: 62,
          shooting: 58,
          technique: 60,
          composure: 42,
          awareness: 45,
          decisionMaking: 40,
          anticipation: 44,
          positioning: 52,
          movement: 68,
          pace: 88,
          acceleration: 90,
          stamina: 78,
          dribbling: 72,
          ballControl: 62,
        },
        tendencies: { runsBehind: 85, attacksSpace: 82, holdsPosition: 25, dropsDeep: 25 },
      }),
  },
  {
    id: 'creative-winger',
    label: 'Milo Sandoval — RW, 23',
    description:
      'Right winger who cuts inside. Generates wide attacks and side-of-the-box chances rather than tap-ins.',
    create: () =>
      createPlayer({
        name: 'Milo Sandoval',
        age: 23,
        position: 'RW',
        experience: 52,
        reputation: 55,
        potentialAbility: 84,
        baseAttribute: 58,
        attributes: {
          dribbling: 84,
          technique: 82,
          crossing: 74,
          ballControl: 80,
          pace: 80,
          acceleration: 82,
          finishing: 66,
          shooting: 70,
          composure: 64,
          awareness: 66,
          decisionMaking: 62,
          movement: 74,
          passing: 70,
        },
        tendencies: { cutsInside: 80, staysWide: 45, attacksSpace: 65, movesIntoChannels: 70 },
      }),
  },
  {
    id: 'deep-playmaker',
    label: 'Anton Reisz — CM, 26',
    description:
      'Midfield playmaker. Rarely gets a shot, but a high rating is available through chance creation.',
    create: () =>
      createPlayer({
        name: 'Anton Reisz',
        age: 26,
        position: 'CM',
        experience: 70,
        reputation: 60,
        potentialAbility: 82,
        baseAttribute: 60,
        attributes: {
          passing: 86,
          technique: 80,
          awareness: 84,
          decisionMaking: 82,
          composure: 76,
          ballControl: 78,
          stamina: 76,
          tackling: 64,
          defensiveAwareness: 66,
          shooting: 68,
          finishing: 54,
          pace: 60,
        },
        tendencies: { comesShort: 78, dropsDeep: 70, holdsPosition: 60, presses: 55 },
      }),
  },
  {
    id: 'ball-playing-defender',
    label: 'Femi Adebayo — CB, 25',
    description:
      'Centre back. Mostly defensive duels and build-up — a completely different game to the striker.',
    create: () =>
      createPlayer({
        name: 'Femi Adebayo',
        age: 25,
        position: 'CB',
        experience: 64,
        reputation: 55,
        potentialAbility: 80,
        baseAttribute: 58,
        attributes: {
          tackling: 82,
          defensiveAwareness: 84,
          heading: 82,
          strength: 84,
          anticipation: 78,
          positioning: 78,
          composure: 72,
          passing: 72,
          awareness: 70,
          decisionMaking: 72,
          pace: 68,
          finishing: 38,
        },
        tendencies: { holdsPosition: 80, presses: 60, dropsDeep: 60 },
      }),
  },
];

export function getPreset(id: string): PlayerPreset {
  const preset = PLAYER_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}
