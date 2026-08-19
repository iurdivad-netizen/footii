import { clamp, clamp01, round } from '../util/math.ts';
import type { Team, TeamRatings } from '../team/team.ts';
import { teamStrength } from '../team/team.ts';
import type { Player } from '../player/player.ts';
import { countriesByPrestige, countryPrestige, getCountry } from './countries.ts';

/**
 * NATIONAL TEAMS
 *
 * A national side is the one team in football nobody owns and nobody can sign
 * for. It is also the one the game cannot store, for the same reason it could
 * not store a golden boot rival: there are no other footballers in this world.
 *
 * So a nation is DERIVED, exactly as the award benchmark is. Its players are
 * the players of its clubs, so its strength is a function of the clubs in that
 * country — specifically of the best of them, because a national side is a
 * selection and not an average. Two consequences fall out of that for free:
 *
 *   - it needs no data file, no roster and no migration
 *   - it DRIFTS with the country. A league whose clubs decline over a decade
 *     fields a weaker national side ten years later, without anything having to
 *     remember that it should.
 *
 * A nation is stronger than any one of its clubs, which is the whole point of
 * it — the shirt is a step up from anything you play in week to week, and it
 * has to feel like one.
 */

/** How many of a country's clubs a national side is drawn from. */
export const SELECTION_POOL = 5;

/**
 * The most a national side can be better than its own best club, in rating
 * points, when the rest of the country is as good as that club.
 *
 * A nation has to beat the best single club in it — otherwise being picked
 * would be a demotion and the shirt would mean nothing. But it is a LIFT on
 * that club rather than a fresh ceiling, and how much of it a country earns
 * depends on its depth (below).
 *
 * Measured: taking the best of each rating across the top five clubs instead
 * put every one of the eight nations between 0.82 and 0.97 strength, because
 * twelve independent maxima compound — a country with one good defence and a
 * different club's good attack ended up with both. That squeezed every
 * international into the top fifteen per cent of the scale and made Scotland
 * near enough England. The lift below keeps the spread of nations tracking the
 * spread of the clubs they are actually drawn from.
 */
export const NATIONAL_LIFT = 10;

/**
 * How deep a country's football is, 0-1: how close the rest of the selection
 * pool is to its best club.
 *
 * This is the number that separates two countries whose best club is the same.
 * One good club and four poor ones is a nation that fields two good players and
 * nine passengers; five good clubs is a nation with a bench. It is also why a
 * country cannot buy a national side by having one superclub.
 *
 * Measured on the shipped world it lands near 0.92 for every country, because
 * all eight leagues are generated to a similar shape — so today it is very
 * nearly a constant. It earns its place over a career rather than at kick-off:
 * clubs drift by up to twelve rating points across eighteen seasons, and a
 * country whose supporting clubs decline fields a thinner national side for it.
 */
export function selectionDepth(pool: readonly Team[]): number {
  const best = pool[0];
  if (!best || pool.length < 2) return 0;
  const bestStrength = teamStrength(best);
  if (bestStrength <= 0) return 0;
  const rest = pool.slice(1);
  const support = rest.reduce((sum, team) => sum + teamStrength(team), 0) / rest.length;
  return clamp01(support / bestStrength);
}

/** The ratings a nation fields, from the clubs it selects from. */
function nationalRatings(pool: readonly Team[]): TeamRatings {
  const best = pool[0]!;
  const lift = NATIONAL_LIFT * selectionDepth(pool);
  const keys = Object.keys(best.ratings) as (keyof TeamRatings)[];
  const ratings = {} as TeamRatings;
  for (const key of keys) {
    ratings[key] = clamp(round(best.ratings[key] + lift, 0), 1, 99);
  }
  return ratings;
}

/**
 * The national side of one country, as it currently stands.
 *
 * `clubs` is every club in that country, already carrying this career's drift —
 * pass them through the career's own lookup or the nation will be built from
 * the data file rather than from the world the player has been living in.
 */
export function nationalTeam(countryId: string, clubs: readonly Team[]): Team {
  const country = getCountry(countryId);
  const pool = [...clubs].sort((a, b) => teamStrength(b) - teamStrength(a)).slice(0, SELECTION_POOL);

  return {
    id: nationId(countryId),
    name: country.name,
    shortName: country.short,
    // A national side plays the football its country's football is known for,
    // taken from its strongest club rather than invented separately.
    style: pool[0]?.style ?? 'balanced',
    colour: pool[0]?.colour ?? '#4aa3ff',
    division: 1,
    country: countryId,
    ratings: pool.length > 0 ? nationalRatings(pool) : blankRatings(),
  };
}

function blankRatings(): TeamRatings {
  const base = 50;
  return {
    attack: base,
    midfield: base,
    defence: base,
    possession: base,
    passing: base,
    tempo: base,
    pressing: base,
    width: base,
    crossing: base,
    counterattack: base,
    creativity: base,
    defensiveIntensity: base,
  };
}

/**
 * The id a national side goes by.
 *
 * Prefixed so it can never collide with a club id — nations and clubs share the
 * same lookup, the same fixtures and the same knockout model, and a nation that
 * answered to a club's id would quietly play its matches.
 */
export function nationId(countryId: string): string {
  return `nation:${countryId}`;
}

/** The country behind a national side's id, or null if it is not one. */
export function countryOfNation(id: string): string | null {
  return id.startsWith('nation:') ? id.slice('nation:'.length) : null;
}

export function isNation(id: string): boolean {
  return id.startsWith('nation:');
}

/**
 * THE GROUPS
 *
 * Two of four, so every nation plays every other nation in its group and the
 * table it produces is fair — the thing a four-match campaign against four of
 * seven possible opponents could never be.
 *
 * Seeded by a snake down the prestige order (1,4,5,8 and 2,3,6,7) rather than
 * drawn, so the two groups are as even as eight nations allow and neither
 * becomes the one everybody dreads. A random draw would put England, Spain and
 * Germany together roughly a fifth of the time, which reads as a bug however
 * fairly it was rolled.
 */
export const GROUP_SIZE = 4;
export const GROUP_COUNT = 2;
/** How many from each group reach the knockout. */
export const QUALIFY_PER_GROUP = 2;

export function qualifyingGroups(): string[][] {
  const ranked = countriesByPrestige().map((c) => c.id);
  const groups: string[][] = Array.from({ length: GROUP_COUNT }, () => []);
  for (const [index, id] of ranked.entries()) {
    // Snake: 0,1,1,0,0,1,1,0 — the second seed of one group is the third of the
    // other, which is what keeps the two halves level.
    const row = Math.floor(index / GROUP_COUNT);
    const inRow = index % GROUP_COUNT;
    const group = row % 2 === 0 ? inRow : GROUP_COUNT - 1 - inRow;
    groups[group]!.push(id);
  }
  return groups;
}

/** Which group a country is in, or -1 if it plays no international football. */
export function groupOf(countryId: string): number {
  return qualifyingGroups().findIndex((group) => group.includes(countryId));
}

/**
 * SELECTION
 *
 * Being picked is the whole international career: everything else follows from
 * whether the shirt is offered at all. It is decided by reputation against a bar
 * that rises with the nation's own standing, which is what makes the nationality
 * chosen at creation a decision rather than a label — a Scot is capped early and
 * often, a Spaniard has to be among the best players in the world first.
 */
export const INTERNATIONAL_REPUTATION = 58;
export const SELECTION_COMPETITION = 10;

/** The reputation a player of this nationality needs before he is picked. */
export function selectionThreshold(nationality: string): number {
  return INTERNATIONAL_REPUTATION + countryPrestige(nationality) * SELECTION_COMPETITION;
}

/** Is he in the squad? */
export function isSelected(player: Player): boolean {
  return player.reputation >= selectionThreshold(player.nationality);
}

/**
 * How far off selection he is, in reputation points. Zero once he is in.
 *
 * Shown to a player who is not picked, because "you are four points away" is a
 * season's goal and "you are not in the squad" is only an absence.
 */
export function selectionGap(player: Player): number {
  return round(Math.max(0, selectionThreshold(player.nationality) - player.reputation), 1);
}
