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
function nationalRatings(pool: readonly Team[], adjustment = 0): TeamRatings {
  const best = pool[0]!;
  const lift = NATIONAL_LIFT * selectionDepth(pool);
  const keys = Object.keys(best.ratings) as (keyof TeamRatings)[];
  const ratings = {} as TeamRatings;
  for (const key of keys) {
    ratings[key] = clamp(round(best.ratings[key] + lift + adjustment, 0), 1, 99);
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
export function nationalTeam(
  countryId: string,
  clubs: readonly Team[],
  strengthAdjustment = 0,
): Team {
  const country = getCountry(countryId);
  const pool = [...clubs].sort((a, b) => teamStrength(b) - teamStrength(a)).slice(0, SELECTION_POOL);

  // A country with clubs derives its side from them. A country without any
  // carries an authored strength instead — see `authoredRatings`.
  const derived = pool.length > 0;

  return {
    id: nationId(countryId),
    name: country.name,
    shortName: country.short,
    // A national side plays the football its country's football is known for,
    // taken from its strongest club where there is one and authored where there
    // is not.
    style: (derived ? pool[0]?.style : (country.style as Team['style'])) ?? 'balanced',
    colour: (derived ? pool[0]?.colour : country.colour) ?? '#4aa3ff',
    division: 1,
    country: countryId,
    ratings: derived
      ? nationalRatings(pool, strengthAdjustment)
      : authoredRatings(country.nationalStrength, country.style, strengthAdjustment),
  };
}

/**
 * The ratings of a national side with no clubs behind it.
 *
 * Built from one authored number the way a club is built from its standing:
 * every rating starts at the base and the country's style bends it, so a
 * counter-attacking nation really does counter-attack rather than merely
 * being labelled that way. Without this a league-less country fielded a side of
 * flat fifties — every nation outside Europe identical, and none of them moving
 * while the European ones drifted with their clubs for eighteen seasons.
 */
function authoredRatings(
  strength: number | undefined,
  style: string | undefined,
  adjustment: number,
): TeamRatings {
  const base = clamp(round((strength ?? 50) + adjustment, 0), 1, 99);
  const shape = STYLE_SHAPE[style ?? 'balanced'] ?? {};
  const ratings = blankRatings();
  for (const key of Object.keys(ratings) as (keyof TeamRatings)[]) {
    ratings[key] = clamp(round(base + (shape[key] ?? 0), 0), 1, 99);
  }
  return ratings;
}

/**
 * How each style bends a side's ratings away from its base.
 *
 * The same shape the world generator applies to clubs, so an authored nation
 * and a derived one are recognisably the same kind of team. Kept here rather
 * than imported because `core` may not read `data`.
 */
const STYLE_SHAPE: Record<string, Partial<Record<keyof TeamRatings, number>>> = {
  possession: { possession: 16, passing: 14, creativity: 10, tempo: -8, width: -6, crossing: -6 },
  counterattack: { counterattack: 20, tempo: 14, possession: -14, creativity: -2, pressing: -4 },
  highPress: { pressing: 20, defensiveIntensity: 12, tempo: 12, possession: -2 },
  direct: { tempo: 8, crossing: 8, width: 6, possession: -18, creativity: -14, passing: -10 },
  widePlay: { crossing: 20, width: 18, creativity: 2, possession: -6 },
  defensive: { defensiveIntensity: 20, possession: -14, tempo: -10, creativity: -14, pressing: -8 },
  balanced: {},
};

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
 * THE TOURNAMENTS
 *
 * Two of them, played in alternate years, so a career gets about nine of each:
 *
 *   CONTINENTAL   eight nations from ONE confederation, two groups of four,
 *                 then a four-team knockout. Your country's own championship.
 *   WORLD CUP     sixteen nations from every confederation, four groups of
 *                 four, then an eight-team knockout.
 *
 * WHY ALTERNATE RATHER THAN ADD. The README's original argument against a
 * biennial cycle still holds: a career is eighteen-odd seasons and a peak is
 * perhaps six of them, so a tournament every other year is a tournament most
 * careers glimpse. Alternating keeps one every single season — so nothing is
 * lost — while making each of them an event rather than the same eight teams
 * every June.
 *
 * A GROUP IS ALWAYS FOUR, in both. Everybody plays everybody in it, three
 * matches each, and the table that produces is fair — the thing a campaign
 * against some of the field could never be. Only the NUMBER of groups differs,
 * which is why one model serves both.
 *
 * NOT EVERY COUNTRY IS IN EITHER. The world has forty-four nations, the World
 * Cup sixteen and a continental championship eight, so qualifying is an
 * achievement rather than an entitlement — and what qualifies you is your
 * STANDING, which your clubs and your national side both move.
 *
 * Seeded by a snake down that order (1,4,5,8 and 2,3,6,7 for two groups) rather
 * than drawn, so the groups are as even as the field allows and none becomes
 * the one everybody dreads. A random draw would put the three strongest
 * together often enough to read as a bug however fairly it was rolled.
 */
export const GROUP_SIZE = 4;
/** How many from each group reach the knockout. */
export const QUALIFY_PER_GROUP = 2;

/** A championship of eight: two groups of four, then four into a bracket. */
export const CONTINENTAL_GROUPS = 2;
/** A tournament of sixteen: four groups of four, then eight into a bracket. */
export const WORLD_CUP_GROUPS = 4;

/** Kept for the smaller of the two shapes, which is the older of them. */
export const GROUP_COUNT = CONTINENTAL_GROUPS;

/** How many nations each shape holds. */
export const CONTINENTAL_FIELD = GROUP_SIZE * CONTINENTAL_GROUPS;
export const WORLD_CUP_FIELD = GROUP_SIZE * WORLD_CUP_GROUPS;
/** Kept under its old name for the smaller shape. */
export const TOURNAMENT_FIELD = CONTINENTAL_FIELD;

/**
 * THE THREE WORLD TIERS
 *
 * The club game has three European competitions so that a club outside the
 * elite still has European nights. The international game had one, and the
 * consequence was measurable: over eight seasons, twenty-five of forty-four
 * nations never kicked a ball, and four of them — Belgium, Greece, Scotland,
 * Austria — were countries a player can BE from, so choosing that nationality
 * silently meant no caps for an entire career.
 *
 * So the world tournaments are tiered exactly as the European ones are. Every
 * nation is in one of them, seeded by standing, and moves between them season
 * to season as its standing moves — which is a climb the coefficient already
 * knows how to produce.
 */
export const WORLD_TIERS = ['worldCup', 'challengeCup', 'conferenceCup'] as const;
export type WorldTier = (typeof WORLD_TIERS)[number];

/** How many nations each world tier holds — the same sixteen, three times over. */
export const WORLD_TIER_FIELD = WORLD_CUP_FIELD;

/** Which world tier a nation is in, given the world order. */
export function worldTierOf(order: readonly string[], countryId: string): WorldTier {
  const rank = order.indexOf(countryId);
  if (rank === -1) return WORLD_TIERS[WORLD_TIERS.length - 1]!;
  const tier = Math.floor(rank / WORLD_TIER_FIELD);
  return WORLD_TIERS[Math.min(tier, WORLD_TIERS.length - 1)]!;
}

/** The sixteen nations of one world tier, best first. */
export function worldTierField(order: readonly string[], tier: WorldTier): string[] {
  const index = WORLD_TIERS.indexOf(tier);
  return order.slice(index * WORLD_TIER_FIELD, (index + 1) * WORLD_TIER_FIELD);
}

/**
 * Snake-seed a field into groups.
 *
 * The snake — 0,1,1,0,0,1,1,0 for two groups — puts the second seed of one
 * group in the third slot of the other, which is what keeps the halves level.
 */
function snake(field: readonly string[], groupCount: number): string[][] {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  for (const [index, id] of field.entries()) {
    const row = Math.floor(index / groupCount);
    const inRow = index % groupCount;
    const group = row % 2 === 0 ? inRow : groupCount - 1 - inRow;
    groups[group]!.push(id);
  }
  return groups;
}

/**
 * The groups of a continental championship, from an ordered list of countries.
 *
 * The order is passed in rather than read from prestige here, because what
 * decides it lives outside this module — see core/career/coefficients.ts, where
 * prestige is bent by how a country's clubs and national side have been doing.
 * Omitting it falls back to plain prestige, which is what a world with nothing
 * on record looks like.
 */
export function qualifyingGroups(order?: readonly string[]): string[][] {
  const ranked = (order && order.length > 0 ? order.slice() : countriesByPrestige().map((c) => c.id))
    .slice(0, CONTINENTAL_FIELD);
  return snake(ranked, CONTINENTAL_GROUPS);
}

/**
 * The World Cup field: the top sixteen of the world order.
 *
 * It was once the best of each confederation on a quota, which sounds fairer
 * and was in fact a worse world: a quota guarantees the weakest confederation's
 * best nation a place it has not earned while shutting out a better nation from
 * a stronger one, and it makes the World Cup the one competition in the game
 * that standing does not decide. Every nation now plays in the tier its
 * standing puts it in, and every confederation keeps its own championship where
 * a quota is exactly the right idea.
 */
export function worldCupField(order: readonly string[]): string[] {
  return worldTierField(order, 'worldCup');
}

/** The groups of one world tier, from a world order. */
export function worldTierGroups(order: readonly string[], tier: WorldTier): string[][] {
  return snake(worldTierField(order, tier), WORLD_CUP_GROUPS);
}

/** The groups of a World Cup specifically. */
export function worldCupGroups(order: readonly string[]): string[][] {
  return worldTierGroups(order, 'worldCup');
}

/**
 * The groups of one confederation's championship.
 *
 * Every member plays: eight for four of the confederations and sixteen for
 * Europe, which is why the two shapes are the only two shapes in the game.
 */
export function continentalGroups(field: readonly string[]): string[][] {
  const groups = field.length > CONTINENTAL_FIELD ? WORLD_CUP_GROUPS : CONTINENTAL_GROUPS;
  return snake(field.slice(0, groups * GROUP_SIZE), groups);
}

/** Which group a country is in, or -1 if it plays no international football. */
export function groupOf(countryId: string, order?: readonly string[]): number {
  return qualifyingGroups(order).findIndex((group) => group.includes(countryId));
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
