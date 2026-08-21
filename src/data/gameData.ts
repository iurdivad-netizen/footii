import teamsJson from './teams.json';
import goalkeepersJson from './goalkeepers.json';
import countriesJson from './countries.json';
import type { Country } from '../core/career/countries.ts';
import { registerCountries } from '../core/career/countries.ts';
import type { Team, TacticalStyle } from '../core/team/team.ts';
import { createTeam } from '../core/team/team.ts';
import type { Goalkeeper } from '../core/goalkeeper/goalkeeper.ts';
import { createGoalkeeper, goalkeeperQuality } from '../core/goalkeeper/goalkeeper.ts';
import type { Player } from '../core/player/player.ts';
import { createPlayer } from '../core/player/player.ts';
import type { Rng } from '../core/rng.ts';

/** Static data loading. JSON in, strongly typed domain objects out. */

interface TeamJson {
  id: string;
  name: string;
  shortName: string;
  style: string;
  colour: string;
  base: number;
  division: number;
  country: string;
  ratings: Record<string, number>;
}

interface GoalkeeperJson {
  id: string;
  name: string;
  teamId: string;
  attributes: Record<string, number>;
}

/**
 * The countries, registered with `core` before anything reads a club.
 *
 * `core` may not import `data`, so the world is injected here at module load.
 * This runs before `TEAMS` is built below, which is what lets country lookups
 * work from the first line of a career.
 */
/** Every country in the world, with a league or without one. */
export const COUNTRIES: Country[] = countriesJson as Country[];
registerCountries(COUNTRIES);

/**
 * Only the countries that have a league of their own.
 *
 * Most questions about club football mean this set: European places, a
 * browsable table, somewhere to be transferred to. The rest of the world exists
 * to field a national side.
 */
export const LEAGUE_COUNTRIES: Country[] = COUNTRIES.filter((country) => !!country.league);

export const TEAMS: Team[] = (teamsJson as TeamJson[]).map((entry) =>
  createTeam({
    id: entry.id,
    name: entry.name,
    shortName: entry.shortName,
    style: entry.style as TacticalStyle,
    colour: entry.colour,
    base: entry.base,
    division: entry.division,
    country: entry.country,
    ratings: entry.ratings,
  }),
);

/** Every club in a given starting division of a given country. */
export function teamsInDivision(division: number, country = 'england'): Team[] {
  return TEAMS.filter((team) => team.division === division && team.country === country);
}

/** Every club whose league is in this country. */
export function teamsInCountry(country: string): Team[] {
  return TEAMS.filter((team) => team.country === country);
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
 * The goalkeeper a NATIONAL side puts behind its defence.
 *
 * Nations have no keeper of their own for the same reason they have no squad:
 * there is nobody in this world to be one. So a nation borrows the best keeper
 * in its country, which is what a national side does anyway — and it means an
 * international is played against the hardest goalkeeper that country has,
 * rather than against a default one nobody chose.
 */
export function bestGoalkeeperIn(countryId: string): Goalkeeper {
  const ids = new Set(teamsInCountry(countryId).map((t) => t.id));
  const keepers = GOALKEEPERS.filter((g) => ids.has(g.teamId)).map((g) => g.goalkeeper);
  if (keepers.length === 0) return GOALKEEPERS[0]!.goalkeeper;
  return keepers.reduce((best, keeper) =>
    goalkeeperQuality(keeper) > goalkeeperQuality(best) ? keeper : best,
  );
}

/**
 * Playable presets for the vertical slice.
 *
 * These exist to make the design principles immediately legible: the veteran
 * and the prospect have very different decision windows, and the two strikers
 * with similar technique generate different chances because their tendencies
 * differ.
 */
/**
 * Forenames and surnames that belong to a country's football, split out of the
 * goalkeeper names already written for it.
 *
 * Every club in the world has a hand-authored keeper, sixteen per country, and
 * those names are the only per-country naming this game has ever needed. A
 * second footballer per club — the rival for the player's shirt — needs names
 * in the same register, and there are two ways to get them: author 192 more by
 * hand, or recombine the halves of the ones already there.
 *
 * Recombining wins, and not only on effort. The authored names ARE the
 * definition of what a name from this country sounds like, so parts of them
 * recombine into something in the same register by construction, where a
 * generator would need that judgement encoding all over again. Sixteen of each
 * half gives 256 combinations per country, which is far more than one career
 * will ever draw on.
 *
 * Built once, lazily, because most sessions never need it.
 */
let namePools: Map<string, { forenames: string[]; surnames: string[] }> | null = null;

function poolFor(countryId: string): { forenames: string[]; surnames: string[] } {
  if (!namePools) {
    namePools = new Map();
    const countryOfTeam = new Map(TEAMS.map((team) => [team.id, team.country]));
    for (const keeper of GOALKEEPERS) {
      const country = countryOfTeam.get(keeper.teamId);
      if (!country) continue;
      // Everything before the last space is the forename, so a two-part
      // surname stays whole rather than being split down the middle.
      const parts = keeper.goalkeeper.name.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const pool = namePools.get(country) ?? { forenames: [], surnames: [] };
      pool.forenames.push(parts.slice(0, -1).join(' '));
      pool.surnames.push(parts[parts.length - 1]!);
      namePools.set(country, pool);
    }
  }
  return namePools.get(countryId) ?? { forenames: [], surnames: [] };
}

/**
 * The id of a country that definitely has a pool, for the fallback above.
 *
 * Picked rather than merged, because merging halves across countries produces
 * names in no register at all — a Greek forename on a Dutch surname reads as a
 * bug where either on its own reads as a footballer.
 */
function everyCountryPool(): string {
  poolFor('');
  const first = namePools?.keys().next();
  return first && !first.done ? first.value : 'england';
}

/**
 * A footballer's name for a given country.
 *
 * Never returns a name that already belongs to a goalkeeper: recombination can
 * land back on an original pairing, and two players in the same world with the
 * same name reads as a bug even when it is a coincidence.
 */
export function playerName(rng: Rng, countryId: string): string {
  // Only the twelve countries with leagues have clubs, so only they have
  // authored keepers to draw halves from. Nothing in the game asks for a name
  // outside one of them today — a rival always belongs to the club the player
  // signed for — but falling back to the whole world's names keeps a plausible
  // footballer coming out of this rather than a placeholder, if anything ever
  // does.
  const pool = poolFor(countryId);
  if (pool.forenames.length === 0) return playerName(rng, everyCountryPool());

  const taken = new Set(GOALKEEPERS.map((entry) => entry.goalkeeper.name));
  for (let attempt = 0; attempt < 8; attempt++) {
    const forename = pool.forenames[Math.floor(rng.next() * pool.forenames.length)]!;
    const surname = pool.surnames[Math.floor(rng.next() * pool.surnames.length)]!;
    const name = `${forename} ${surname}`;
    if (!taken.has(name)) return name;
  }
  // Eight collisions in a 256-name space is not going to happen, but a loop
  // that can only exit by luck is a loop that can hang.
  return `${pool.forenames[0]} ${pool.surnames[pool.surnames.length - 1]}`;
}

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
