import { clamp, clamp01, remap, round, unit } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { AttributeKey } from '../player/attributes.ts';
import type { Player } from '../player/player.ts';
import { currentAbility } from '../player/player.ts';
import type { Position } from '../player/positions.ts';
import type { TacticalStyle, Team } from '../team/team.ts';
import type { SeasonStats } from './seasonStats.ts';
import { clubStature } from './reputation.ts';

/**
 * TRANSFERS
 *
 * Clubs decide what you are worth and whether they want you. Nothing here is a
 * dice roll dressed as a market: an offer is the output of five questions a
 * real club would ask, and every one of them is answerable from state the
 * career layer already keeps.
 *
 *   1. Have we heard of him?      reputation vs the club's own standing
 *   2. Would he improve us?       ability (plus potential, if he is young)
 *                                 against the level of the squad
 *   3. Do we need him?            his position against our weakest department
 *   4. Does he suit how we play?  his attributes against our tactical style
 *   5. Can we afford him?         his market value against our budget
 *
 * DESIGN RULE: a club only bids for a player it intends to PLAY. Squad rotation
 * is not modelled yet, so an offer that quietly meant "you will sit on the
 * bench" would be a promise the simulation cannot keep. Clubs that would only
 * use you as cover simply do not come — see `SQUAD_ROLE_FLOOR`.
 *
 * A transfer is mechanically real rather than cosmetic. Your club decides the
 * quality of the chances you get (team ratings feed the situation generator),
 * the coaching you receive (development rate), where you finish (reputation),
 * and who watches you next. Moving up is the way a career goes somewhere.
 */

export type SquadRole = 'star' | 'starter' | 'squad';

export const SQUAD_ROLE_LABELS: Record<SquadRole, string> = {
  star: 'Star player',
  starter: 'First-team regular',
  squad: 'Squad player',
};

/**
 * How far below a club's squad level you may sit and still be signed as a
 * first-team player. Below it the club would be buying cover, which the game
 * cannot yet simulate, so no offer is made at all.
 */
export const SQUAD_ROLE_FLOOR = 3;

/** Interest below this is a scout in the stands, not an offer. */
export const OFFER_THRESHOLD = 0.36;

/** Most offers a single summer will produce, best first. */
export const MAX_OFFERS = 3;

/** Interest above this is worth telling the player about during the season. */
export const SCOUTING_THRESHOLD = 0.2;

// --------------------------------------------------------------- value ---

/**
 * Value of a given ability, in millions, before any player-specific modifier.
 *
 * Exponential, because football fees are: the gap between a 60 and a 70 is a
 * few million, the gap between an 80 and a 90 is most of a stadium. Club budgets
 * are expressed on the same curve, so "what we can pay" and "what he is worth"
 * are always the same units.
 */
export function abilityValue(ability: number): number {
  return 2 ** ((ability - 44) / 7);
}

/**
 * Age multiplier on value: flat through the peak, then a cliff.
 * A 34-year-old is worth a fraction of the same footballer at 26, however well
 * he is playing — which is exactly why the last move of a career has to be made
 * before it is obviously needed.
 */
export function ageValueMultiplier(age: number): number {
  if (age <= 23) return 1.05;
  if (age <= 27) return 1;
  if (age <= 29) return 0.85;
  return clamp(0.7 - (age - 30) * 0.13, 0.08, 0.7);
}

/**
 * Market value in millions.
 *
 * Ability is the bulk of it; potential is a premium only the young command;
 * reputation and form move it at the margins. Deliberately a pure function of
 * the player, so the hub can show it at any moment and the market cannot
 * disagree with the screen.
 */
export function marketValue(player: Player): number {
  const ability = currentAbility(player);
  const headroom = clamp(player.potentialAbility - ability, 0, 30) / 30;
  const youth = clamp((26 - player.age) / 8, 0, 1);
  const potentialPremium = 1 + headroom * youth * 0.9;
  const profile = 0.85 + unit(player.reputation) * 0.3;
  const formModifier = 0.92 + unit(player.form) * 0.16;

  const value =
    abilityValue(ability) * ageValueMultiplier(player.age) * potentialPremium * profile * formModifier;
  return round(value, value < 10 ? 2 : 1);
}

/** The playing level of a club's existing squad, on the 1-99 ability scale. */
export function squadLevel(team: Team): number {
  const r = team.ratings;
  return Math.round(r.attack * 0.35 + r.midfield * 0.35 + r.defence * 0.3);
}

/**
 * What a club can spend, in millions.
 *
 * Pitched at a player some way better than the squad it already has, because a
 * market value carries premiums a bare ability does not — potential, fame, form
 * — and a budget set at the squad's own level left the smallest clubs unable to
 * afford anybody who would improve them, which killed the bottom of the market
 * entirely. Affordability is meant to stop a struggling side buying a star, not
 * to stop it signing a decent footballer.
 */
export function transferBudget(team: Team): number {
  return round(abilityValue(squadLevel(team) + 12), 1);
}

/**
 * Reputation a club expects before it will look at you.
 *
 * The ladder this produces is the spine of the career: the bottom clubs will
 * take a nobody, the champions want a name. Climbing it is the point.
 */
export function reputationRequired(team: Team): number {
  return round(remap(clubStature(team), 0.45, 0.9, 20, 82), 1);
}

// ----------------------------------------------------------- squad need ---

type Department = 'attack' | 'midfield' | 'defence';

const POSITION_DEPARTMENT: Record<Position, Department> = {
  GK: 'defence',
  CB: 'defence',
  LB: 'defence',
  RB: 'defence',
  DM: 'midfield',
  CM: 'midfield',
  AM: 'attack',
  LW: 'attack',
  RW: 'attack',
  ST: 'attack',
};

/**
 * How badly a club needs a player in your position, 0-1.
 *
 * Read straight off the club's own ratings: a side whose attack is ten points
 * below the rest of it is in the market for a forward. No separate squad data
 * is invented, so the need a club advertises is the same weakness you can see
 * in the league table.
 */
export function positionalNeed(team: Team, position: Position): number {
  const r = team.ratings;
  const average = (r.attack + r.midfield + r.defence) / 3;
  const department = POSITION_DEPARTMENT[position];
  const rating = department === 'attack' ? r.attack : department === 'midfield' ? r.midfield : r.defence;
  return clamp01(0.5 + (average - rating) / 12);
}

// -------------------------------------------------------- tactical fit ---

/**
 * What each style asks of a player. Weights, not thresholds — a style is a
 * preference for a kind of footballer, not a checklist.
 *
 * These mirror the biases the situation generator already applies: a wide-play
 * club produces crossing situations, so it wants a player who can cross; a
 * counterattacking club produces transition one-on-ones, so it wants pace.
 * Signing for a club that plays to your strengths is therefore not flavour —
 * you will be handed more of the situations you are good at.
 */
export const STYLE_WEIGHTS: Record<TacticalStyle, Partial<Record<AttributeKey, number>>> = {
  possession: { passing: 3, technique: 2, ballControl: 2, composure: 2, awareness: 2, decisionMaking: 1 },
  counterattack: { pace: 3, acceleration: 3, movement: 2, anticipation: 1, dribbling: 1, finishing: 1 },
  highPress: { stamina: 3, anticipation: 2, tackling: 2, acceleration: 2, defensiveAwareness: 1, strength: 1 },
  direct: { strength: 3, heading: 3, shooting: 2, finishing: 1, movement: 1, pace: 1 },
  widePlay: { crossing: 3, dribbling: 3, pace: 2, movement: 2, technique: 1 },
  defensive: { defensiveAwareness: 3, tackling: 3, positioning: 2, strength: 2, heading: 1, composure: 1 },
  balanced: { awareness: 1, decisionMaking: 1, technique: 1, passing: 1, movement: 1, positioning: 1 },
};

/**
 * How well a player suits a style, 0-1, with 0.5 meaning "no particular view".
 *
 * Measured RELATIVE to the player's own overall level, so this answers "is he
 * the right kind of footballer for us" and not "is he good". Ability is already
 * asked about separately, and a metric that answered both would count it twice
 * and make every good player a perfect fit for everyone.
 */
export function tacticalFit(player: Player, team: Team): number {
  const weights = STYLE_WEIGHTS[team.style];
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    total += unit(player.attributes[key]) * weight;
    weightSum += weight;
  }
  const styleScore = weightSum > 0 ? total / weightSum : 0.5;
  const overall = unit(currentAbility(player));
  return clamp01(0.5 + (styleScore - overall) * 2.5);
}

// ------------------------------------------------------------ interest ---

export interface InterestInput {
  player: Player;
  /** The club considering a move. */
  team: Team;
  /** Season just completed, for the club to judge him on. */
  stats: SeasonStats;
  /**
   * The club he already plays for, when there is one. A side well below his
   * current club knows it is unlikely to tempt him and mostly does not try.
   */
  currentClub?: Team;
}

export interface ClubInterest {
  clubId: string;
  /** 0-1. Above OFFER_THRESHOLD a bid is possible. */
  score: number;
  role: SquadRole;
  /** Ability once youth potential is priced in, on the 1-99 scale. */
  effectiveAbility: number;
  fit: number;
  need: number;
  /** Reputation the club expects, minus what he has. Positive means short. */
  reputationShortfall: number;
  affordable: boolean;
  /** Human-readable reasons this club is or is not interested. */
  notes: string[];
}

/**
 * The ability a club is really buying.
 *
 * Clubs sign young players for what they will become; they sign anyone else for
 * what they are. Half the visible headroom counts, and only while the player is
 * young enough for it to arrive.
 */
export function effectiveAbility(player: Player): number {
  const ability = currentAbility(player);
  const headroom = clamp(player.potentialAbility - ability, 0, 25);
  const youth = clamp((26 - player.age) / 8, 0, 1);
  return round(ability + headroom * youth * 0.5, 1);
}

/** Where a club would see the player in its own side. */
export function squadRole(player: Player, team: Team): SquadRole {
  const gap = effectiveAbility(player) - squadLevel(team);
  if (gap >= 5) return 'star';
  if (gap >= -SQUAD_ROLE_FLOOR) return 'starter';
  return 'squad';
}

/**
 * How much a club wants a player, and why.
 *
 * The five questions are multiplied rather than averaged, so any one of them
 * can veto a move: a club that has never heard of you does not care how well
 * you would fit, and one that cannot pay does not bid at all.
 */
export function clubInterest(input: InterestInput): ClubInterest {
  const { player, team } = input;
  const notes: string[] = [];

  const required = reputationRequired(team);
  const reputationShortfall = round(required - player.reputation, 1);
  const standing = clamp01(remap(player.reputation, required - 12, required + 10, 0, 1));

  const ability = effectiveAbility(player);
  const level = squadLevel(team);
  const quality = clamp01(remap(ability - level, -8, 8, 0, 1));

  const need = positionalNeed(team, player.position);
  const fit = tacticalFit(player, team);
  const role = squadRole(player, team);

  const value = marketValue(player);
  const budget = transferBudget(team);
  const affordable = value <= budget;

  let score =
    standing * (0.35 + quality * 0.65) * (0.6 + need * 0.4) * (0.65 + fit * 0.35);

  // Clubs know when they are punching above their weight. Without this a player
  // at the champions fielded the same bid from the bottom club every summer,
  // because a side he would walk into always wants him most.
  if (input.currentClub) {
    const ambition = clamp01(
      remap(clubStature(team) - clubStature(input.currentClub), -0.15, 0, 0.35, 1),
    );
    score *= ambition;
  }

  // A club only bids for a player it intends to play, and only for one it can
  // pay for. Both are hard gates rather than penalties.
  if (role === 'squad') score = 0;
  if (!affordable) score = 0;

  // A season of goals gets a club over the line it was already standing on.
  const contributions = input.stats.goals + input.stats.assists;
  if (contributions >= 10) score *= 1.12;

  if (reputationShortfall > 12) notes.push(`${team.name} have not heard enough about you yet.`);
  else if (!affordable) notes.push(`${team.name} cannot afford you.`);
  else if (role === 'squad') notes.push(`${team.name} have better players in your position.`);
  else {
    if (need > 0.7) notes.push('They need exactly what you play.');
    if (fit > 0.65) notes.push(`Your game suits ${team.style === 'balanced' ? 'their side' : `their ${team.style} football`}.`);
    else if (fit < 0.35) notes.push('You are not really the type of player they build around.');
    if (role === 'star') notes.push('You would be the best player at the club.');
    else notes.push('They see you going straight into their side.');
  }

  return {
    clubId: team.id,
    score: round(clamp01(score), 3),
    role,
    effectiveAbility: ability,
    fit: round(fit, 2),
    need: round(need, 2),
    reputationShortfall,
    affordable,
    notes,
  };
}

// -------------------------------------------------------------- offers ---

export interface TransferOffer {
  /** Stable within a summer, so the UI can key on it. */
  id: string;
  clubId: string;
  /** Fee offered to the current club, in millions. */
  fee: number;
  /** Weekly wage, in thousands. */
  wage: number;
  role: SquadRole;
  /** The interest that produced it, 0-1. */
  interest: number;
  /** Season at the end of which the offer was made. */
  season: number;
  notes: string[];
}

/** Weekly wage a club would pay, in thousands. */
export function offeredWage(player: Player, team: Team, role: SquadRole): number {
  const ability = currentAbility(player);
  const roleFactor = role === 'star' ? 1.25 : role === 'starter' ? 1 : 0.75;
  const wage = 2 ** ((ability - 40) / 9) * (0.6 + clubStature(team)) * roleFactor;
  return round(clamp(wage, 1, 500), 1);
}

export interface OfferGenerationInput {
  player: Player;
  /** The club he currently plays for; it does not bid for its own player. */
  currentClubId: string;
  /** Every club that could bid. */
  clubs: readonly Team[];
  stats: SeasonStats;
  season: number;
  /**
   * Clubs that will not bid this summer — in practice the one he walked out of
   * last year. Without it a player could ping-pong between two sides that both
   * rated him, being sold and re-signed in alternate windows.
   */
  excludeClubIds?: readonly string[];
}

/**
 * Which clubs actually bid this summer.
 *
 * The keenest interested club ALWAYS comes: a season good enough to have a side
 * ready to bid should never be answered with silence because of a dice roll,
 * and the whole point of the reputation model is that you can see the offer
 * coming. Everyone else rolls against their own interest, so which of them
 * shows up varies and two identical seasons do not produce identical summers.
 *
 * The list is capped and sorted, because a screen full of offers is a lottery
 * win rather than a decision.
 */
export function generateOffers(rng: Rng, input: OfferGenerationInput): TransferOffer[] {
  const current = input.clubs.find((team) => team.id === input.currentClubId);

  const interested = input.clubs
    .filter((team) => team.id !== input.currentClubId)
    .filter((team) => !input.excludeClubIds?.includes(team.id))
    .map((team) =>
      clubInterest({ player: input.player, team, stats: input.stats, currentClub: current }),
    )
    .filter((interest) => interest.score >= OFFER_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const value = marketValue(input.player);
  const offers: TransferOffer[] = [];

  for (const [index, interest] of interested.entries()) {
    if (index > 0 && !rng.chance(interest.score)) continue;

    const team = input.clubs.find((candidate) => candidate.id === interest.clubId)!;
    const budget = transferBudget(team);
    const fee = round(clamp(value * (0.85 + interest.score * 0.6), 0.1, budget), 2);

    offers.push({
      id: `s${input.season}:${team.id}`,
      clubId: team.id,
      fee,
      wage: offeredWage(input.player, team, interest.role),
      role: interest.role,
      interest: interest.score,
      season: input.season,
      notes: interest.notes,
    });
    if (offers.length >= MAX_OFFERS) break;
  }

  return offers;
}

/** Clubs watching without yet bidding, best first — the ramp before an offer. */
export function scoutingInterest(
  player: Player,
  clubs: readonly Team[],
  currentClubId: string,
  stats: SeasonStats,
): ClubInterest[] {
  const current = clubs.find((team) => team.id === currentClubId);
  return clubs
    .filter((team) => team.id !== currentClubId)
    .map((team) => clubInterest({ player, team, stats, currentClub: current }))
    .filter((interest) => interest.score >= SCOUTING_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

export interface TransferRecord {
  season: number;
  fromClubId: string;
  toClubId: string;
  fee: number;
  wage: number;
  role: SquadRole;
  age: number;
}

/**
 * The effect of actually moving.
 *
 * A transfer is not free. Form is pulled back toward neutral because a new
 * club, new team-mates and a new way of playing take adjusting to; morale rises
 * because being wanted is worth something; and reputation ticks toward the
 * standing of the club you joined, since a shirt confers a little fame of its
 * own before you have kicked a ball in it.
 */
export function applyTransferEffects(player: Player, to: Team): void {
  player.form = round(player.form * 0.6 + 50 * 0.4, 1);
  player.morale = clamp(round(player.morale * 0.6 + 74 * 0.4, 1), 0, 100);
  const standing = reputationRequired(to);
  if (standing > player.reputation) {
    player.reputation = round(player.reputation + (standing - player.reputation) * 0.25, 1);
  }
}
