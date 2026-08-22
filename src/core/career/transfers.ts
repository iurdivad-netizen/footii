import { clamp, clamp01, remap, round, unit } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { AttributeKey } from '../player/attributes.ts';
import type { Player } from '../player/player.ts';
import { currentAbility } from '../player/player.ts';
import type { Position } from '../player/positions.ts';
import type { TacticalStyle, Team } from '../team/team.ts';
import type { SeasonStats } from './seasonStats.ts';
import { clubStature } from './reputation.ts';
import { getCountry } from './countries.ts';
import type { CareerPreferences } from './preferences.ts';
import { defaultPreferences, interestMultiplier, meetsDemands, willConsider } from './preferences.ts';
import type { EuropeanTier } from './europe.ts';
import { REQUEST_FEE_DISCOUNT, REQUEST_INTEREST_BOOST } from './transferRequest.ts';

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

/**
 * And how many when he has asked to leave.
 *
 * One more, and the extra one is the whole mechanism rather than a rounding of
 * it. Interest alone could not deliver "more clubs bid", and it is worth being
 * precise about why: the list is CAPPED, and for anybody with a season worth
 * bidding on the cap is what binds rather than the threshold. Multiplying
 * interest under a full cap only reorders the same three clubs. Raising the cap
 * is what actually widens a market — and widening it is the thing a player who
 * cannot get a game handed in a request to do.
 */
export const REQUESTED_MAX_OFFERS = MAX_OFFERS + 1;

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
export function reputationRequired(team: Team, prestige = 1): number {
  // A second-division club, however well run, does not expect a household name.
  return round(remap(clubStature(team), 0.45, 0.9, 20, 82) * (0.62 + prestige * 0.38), 1);
}

/**
 * How attractive a club is to a player weighing a move, 0-1.
 *
 * Standing plus the stage it plays on. Two clubs with identical squads are not
 * identical propositions when one of them is a division higher, and without
 * this a promoted side and a relegated one would look the same on the offer
 * screen the summer they swap places.
 */
export function clubAppeal(team: Team, prestige = 1): number {
  return clamp01(clubStature(team) * (0.55 + prestige * 0.45));
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
  /** Prestige of the bidding club's league, 0-1. */
  prestige?: number;
  /** Prestige of the league he currently plays in, 0-1. */
  currentPrestige?: number;
  /** Country the bidding club plays in. */
  countryId?: string;
  /** Country he currently plays in. */
  currentCountryId?: string;
  /**
   * True when his contract has run out. A free transfer is the cheapest signing
   * in football, so clubs that were watching from a distance come forward.
   */
  outOfContract?: boolean;
  /**
   * True when the club already has him and is deciding whether to KEEP him
   * rather than whether to buy him.
   *
   * Both acquisition gates are lifted, because both ask questions that only
   * make sense about a signing:
   *
   *   - the FEE gate asks whether the club could afford to buy him. A small
   *     club plainly could not afford its own best player, and without this it
   *     would lose the academy graduate it had been playing for years the
   *     moment he outgrew its transfer budget.
   *   - the ROLE gate exists because the game cannot simulate a bench, so a
   *     club must not sign someone it would not play. A club that already
   *     plays him every week is not making that promise — it is keeping one.
   *     Leaving this gate up meant a declining player was never renewed by
   *     anyone and lived permanently on the fallback contract.
   *
   * The wage gate still applies, and is the right money question for a
   * renewal: a club that cannot meet his demands loses him.
   */
  retaining?: boolean;
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
  const prestige = input.prestige ?? 1;
  const notes: string[] = [];

  const required = reputationRequired(team, prestige);
  const reputationShortfall = round(required - player.reputation, 1);
  // "Have we heard of him" is the third acquisition question, and it is
  // meaningless about a player already in your own dressing room. A club
  // keeping its own knows exactly who he is.
  const standing = input.retaining
    ? 1
    : clamp01(remap(player.reputation, required - 12, required + 10, 0, 1));

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
      remap(
        clubAppeal(team, prestige) - clubAppeal(input.currentClub, input.currentPrestige ?? 1),
        -0.15,
        0,
        0.35,
        1,
      ),
    );
    score *= ambition;
  }

  // A club only signs a player it intends to play, and only one it can pay for.
  // Both are hard gates rather than penalties — and both are about ACQUIRING a
  // player, so neither applies to a club deciding whether to keep its own.
  if (role === 'squad' && !input.retaining) score = 0;
  if (!affordable && !input.retaining) score = 0;

  // A season of goals gets a club over the line it was already standing on.
  const contributions = input.stats.goals + input.stats.assists;
  if (contributions >= 10) score *= 1.12;

  // Nothing widens a market like a player costing nothing.
  if (input.outOfContract) score = clamp01(score * 1.25);

  // Crossing a border is a bigger ask than crossing a city, and clubs price
  // that in: an unproven import is a risk, and a club in a league nobody
  // watches has little to offer a player who would have to move his life for
  // it. Going HOME cuts the other way — a club in your own country knows you
  // and you know it.
  // Nationality is read off the player rather than passed in beside him. It was
  // briefly a separate input field, which meant every caller had to remember to
  // supply it and the one that mattered did not — so "moving home" never once
  // fired. A fact about the player belongs on the player.
  const abroad =
    !!input.countryId && !!input.currentCountryId && input.countryId !== input.currentCountryId;
  const goingHome = abroad && player.nationality === input.countryId;
  if (abroad) score *= goingHome ? 1.08 : 0.86;

  if (reputationShortfall > 12) notes.push(`${team.name} have not heard enough about you yet.`);
  else if (!affordable && !input.retaining) notes.push(`${team.name} cannot afford you.`);
  else if (role === 'squad') notes.push(`${team.name} have better players in your position.`);
  else {
    if (need > 0.7) notes.push('They need exactly what you play.');
    if (fit > 0.65) notes.push(`Your game suits ${team.style === 'balanced' ? 'their side' : `their ${team.style} football`}.`);
    else if (fit < 0.35) notes.push('You are not really the type of player they build around.');
    if (role === 'star') notes.push('You would be the best player at the club.');
    else notes.push('They see you going straight into their side.');
    if (input.outOfContract) notes.push('You would cost them nothing but wages.');
    if (abroad) {
      const country = getCountry(input.countryId!);
      notes.push(
        goingHome
          ? `Moving home to ${country.name}.`
          : `You would be moving to ${country.name}.`,
      );
    }
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
  /** Fee offered to the current club, in millions. Zero on a free transfer. */
  fee: number;
  /** Weekly wage, in thousands. */
  wage: number;
  /** Length of the deal, in seasons. */
  years: number;
  role: SquadRole;
  /** The interest that produced it, 0-1. */
  interest: number;
  /** Season at the end of which the offer was made. */
  season: number;
  /** True when he is leaving on a free rather than for a fee. */
  free: boolean;
  notes: string[];
  /** Set once he has pushed the club on something. See core/career/negotiation.ts. */
  negotiated?: boolean;
  /** Set when the club pulled the offer rather than be haggled with. */
  withdrawn?: boolean;
}

/**
 * Model units to thousands a week.
 *
 * The wage CURVE was right and its scale was wrong. An ability-95 player at the
 * best club in the world earned £86k a week, where the real figure is three to
 * five times that; an ability-75 first-teamer earned £18k against a real £60k or
 * more. Meanwhile market values were about right — £177m for that same player —
 * so fees and wages disagreed with each other by a factor of four, and
 * `careerEarnings` (and the "£Xm earned" figure on the end screen) read low for
 * a whole career.
 *
 * Applied to BOTH what a club offers and what a player expects, which is the
 * whole reason this is safe to change. The wage gate asks whether the offer
 * clears the demand, and scaling both sides by the same number leaves every
 * answer it has ever given identical. Nothing about who can sign whom moves;
 * only the figures on screen do.
 */
export const WAGE_SCALE = 4;

/**
 * The floor and ceiling on a weekly wage, in thousands.
 *
 * A professional at the bottom of the smallest league in the world is on
 * something rather than nothing, and nobody anywhere earns more than the top.
 * Exported because `fallbackContract` has to clamp to the same range — it used
 * to carry its own copy of the numbers, which is exactly the kind of duplicate
 * that goes stale the first time one of them is tuned.
 */
export const MIN_WAGE = 2;
export const MAX_WAGE = 750;

/**
 * Weekly wage a club would pay, in thousands.
 *
 * Scaled by the division as well as the club, because the money in the game is
 * where the attention is. A second-division side that has somehow assembled a
 * strong squad still cannot pay first-division wages, which is what stops the
 * bottom of the pyramid from hoarding good players.
 */
export function offeredWage(player: Player, team: Team, role: SquadRole, prestige = 1): number {
  const ability = currentAbility(player);
  const roleFactor = role === 'star' ? 1.25 : role === 'starter' ? 1 : 0.75;
  const wage =
    2 ** ((ability - 40) / 9) *
    (0.35 + clubStature(team) * 1.05) *
    roleFactor *
    divisionPay(prestige) *
    WAGE_SCALE;
  return round(clamp(wage, MIN_WAGE, MAX_WAGE), 1);
}

/**
 * How the division scales money, applied identically to what a club offers and
 * what a player expects.
 *
 * Deliberately the SAME factor on both sides. When wages fell faster than
 * demands in the lower division, dropping down became impossible for anyone —
 * the gate fired on the division rather than on the player, which is not what
 * it is for. Sharing the factor means the wage gate asks one question only: is
 * this club big enough for someone as well known as you?
 */
function divisionPay(prestige: number): number {
  return 0.45 + prestige * 0.55;
}

/**
 * The wage a player expects, in thousands per week.
 *
 * Driven by reputation as much as ability — a footballer prices himself on what
 * the game thinks he is worth, which is exactly what makes a reputation built
 * on one loud season expensive to live up to. Deliberately independent of any
 * particular club, so it is a demand rather than a negotiation.
 */
export function wageDemand(player: Player, prestige = 1): number {
  const ability = currentAbility(player);
  // Reputation dominates deliberately. Ability appears on both sides of the
  // gate and very nearly cancels, so what actually decides whether a club can
  // afford you is how well known you are against how big they are — which is
  // the question the gate exists to ask.
  const profile = 0.6 + unit(player.reputation) * 0.85;
  const demand = 2 ** ((ability - 42) / 9) * profile * divisionPay(prestige) * WAGE_SCALE;
  // A shade above the offer ceiling, so a player at the very top of the scale
  // still wants marginally more than anybody will pay — which is what a
  // ceiling is for.
  return round(clamp(demand, MIN_WAGE, MAX_WAGE * 1.04), 1);
}

/**
 * How far below his demand a player will still sign.
 *
 * Not zero tolerance: footballers take slightly less to join a club they want,
 * and a hard equality test would have made the wage gate a coin flip on
 * rounding rather than a decision about money.
 */
export const WAGE_TOLERANCE = 0.85;

export function wageAcceptable(offered: number, demand: number): boolean {
  return offered >= demand * WAGE_TOLERANCE;
}

/**
 * Length of deal a club offers, in seasons.
 *
 * Long for the young, short for the old, which is the mechanism that makes the
 * back half of a career feel different: at 33 nobody will commit to you beyond
 * next summer, so every season has to be earned again.
 */
export function contractYears(player: Player): number {
  if (player.age <= 21) return 5;
  if (player.age <= 25) return 4;
  if (player.age <= 29) return 3;
  if (player.age <= 32) return 2;
  return 1;
}

export interface OfferGenerationInput {
  player: Player;
  /** The club he currently plays for; it does not bid for its own player. */
  currentClubId: string;
  /** Every club that could bid, across every division. */
  clubs: readonly Team[];
  stats: SeasonStats;
  season: number;
  /**
   * Clubs that will not bid this summer — in practice the one he walked out of
   * last year. Without it a player could ping-pong between two sides that both
   * rated him, being sold and re-signed in alternate windows.
   */
  excludeClubIds?: readonly string[];
  /** Prestige of a club's league, 0-1. Defaults to a one-league game. */
  prestigeOf?: (clubId: string) => number;
  /**
   * Country a club plays in.
   *
   * Defaults to everyone sharing one unnamed country, NOT to the club id. An
   * identity default reads as "every club is its own country", which silently
   * applies the moving-abroad penalty to every offer in the game and makes
   * every note say the player is moving to Unknown.
   */
  countryOf?: (clubId: string) => string;
  /** True when his contract has run out, so he leaves for nothing. */
  outOfContract?: boolean;
  /**
   * What he has said he wants from a move.
   *
   * Applied HERE rather than as a filter on the finished list, because a
   * preference that only hid offers would be cosmetic: the clubs would still
   * have bid, the market would still have moved, and telling the game you will
   * not leave England would change nothing except what you were shown.
   */
  preferences?: CareerPreferences;
  /**
   * Which European competition a club is in NEXT season, or null for none.
   *
   * Next season rather than the one just finished, because that is the season
   * the offer is for. Qualification is settled before offers are generated, so
   * this is a fact by the time it is read rather than a prediction.
   *
   * Defaults to nobody being in Europe, which is the safe default rather than
   * the flattering one: a caller that does not supply it has not told the
   * market who qualified, and inventing European football for clubs that may
   * not have it would let a demand be met by a club that cannot meet it.
   */
  europeanTierOf?: (clubId: string) => EuropeanTier | null;
  /**
   * True when he has handed in a transfer request.
   *
   * Read here rather than folded into preferences, because it is not one. A
   * preference is a position; this is an act with a price already being paid
   * elsewhere. See core/career/transferRequest.ts.
   */
  transferRequested?: boolean;
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
  const prestigeOf = input.prestigeOf ?? (() => 1);
  const countryOf = input.countryOf ?? (() => '');
  const currentPrestige = current ? prestigeOf(current.id) : 1;
  const currentCountry = current ? countryOf(current.id) : '';

  const preferences = input.preferences ?? defaultPreferences();
  const europeanTierOf = input.europeanTierOf ?? (() => null);

  const interested = input.clubs
    .filter((team) => team.id !== input.currentClubId)
    .filter((team) => !input.excludeClubIds?.includes(team.id))
    // A country he has ruled out does not bid at all, and a player who says he
    // is settled hears from nobody.
    .filter((team) => willConsider(preferences, countryOf(team.id), currentCountry))
    // And nor does a club too small for what he has said he will move for, or
    // without the European football he is holding out for. Applied at the same
    // point and for the same reason as the country filter: a demand that only
    // hid finished offers would be cosmetic — the clubs would still have bid.
    .filter((team) =>
      meetsDemands(preferences, {
        appeal: clubAppeal(team, prestigeOf(team.id)),
        europeanTier: europeanTierOf(team.id),
      }),
    )
    .map((team) =>
      clubInterest({
        player: input.player,
        team,
        stats: input.stats,
        currentClub: current,
        prestige: prestigeOf(team.id),
        currentPrestige,
        countryId: countryOf(team.id),
        currentCountryId: currentCountry,
        outOfContract: input.outOfContract,
      }),
    )
    // A country he wants makes its clubs keener, which can be the difference
    // between watching him and bidding for him — and so, more so, does knowing
    // he has asked to leave. Both are multipliers on interest rather than on
    // the threshold, so neither can manufacture a club that had not noticed
    // him: they move a club that was already close, which is what being
    // available actually does.
    .map((interest) => ({
      ...interest,
      score: clamp01(
        interest.score *
          interestMultiplier(preferences, countryOf(interest.clubId)) *
          (input.transferRequested ? REQUEST_INTEREST_BOOST : 1),
      ),
    }))
    .filter((interest) => interest.score >= OFFER_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const value = marketValue(input.player);
  const offers: TransferOffer[] = [];

  for (const interest of interested) {
    const team = input.clubs.find((candidate) => candidate.id === interest.clubId)!;
    const prestige = prestigeOf(team.id);

    // Money is the last gate, and it is a hard one: a club that wants a player,
    // needs him and would play him still cannot sign him if it will not pay
    // what he expects. This is what stops a well-drilled small club from
    // assembling a squad of stars it has no business affording.
    const wage = offeredWage(input.player, team, interest.role, prestige);
    if (!wageAcceptable(wage, wageDemand(input.player, prestige))) continue;

    // The keenest club that CAN pay always comes; everyone else rolls.
    if (offers.length > 0 && !rng.chance(interest.score)) continue;

    const budget = transferBudget(team);
    // A club that knows the player wants out cannot hold out for its price, and
    // the discount matters more than it looks: the fee is clamped to the buyer's
    // budget, so cutting it brings clubs that could not have afforded him into
    // the market at all. That is the half of a transfer request that actually
    // moves a career.
    const asking = value * (0.85 + interest.score * 0.6) * (input.transferRequested ? REQUEST_FEE_DISCOUNT : 1);
    const fee = input.outOfContract ? 0 : round(clamp(asking, 0.1, budget), 2);

    offers.push({
      id: `s${input.season}:${team.id}`,
      clubId: team.id,
      fee,
      wage,
      years: contractYears(input.player),
      role: interest.role,
      interest: interest.score,
      season: input.season,
      free: !!input.outOfContract,
      notes: interest.notes,
    });
    if (offers.length >= (input.transferRequested ? REQUESTED_MAX_OFFERS : MAX_OFFERS)) break;
  }

  return offers;
}

/** Clubs watching without yet bidding, best first — the ramp before an offer. */
export function scoutingInterest(
  player: Player,
  clubs: readonly Team[],
  currentClubId: string,
  stats: SeasonStats,
  prestigeOf: (clubId: string) => number = () => 1,
  countryOf: (clubId: string) => string = () => '',
): ClubInterest[] {
  const current = clubs.find((team) => team.id === currentClubId);
  const currentPrestige = current ? prestigeOf(current.id) : 1;
  const currentCountry = current ? countryOf(current.id) : '';
  return clubs
    .filter((team) => team.id !== currentClubId)
    .map((team) =>
      clubInterest({
        player,
        team,
        stats,
        currentClub: current,
        prestige: prestigeOf(team.id),
        currentPrestige,
        countryId: countryOf(team.id),
        currentCountryId: currentCountry,
      }),
    )
    .filter((interest) => interest.score >= SCOUTING_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

export interface TransferRecord {
  season: number;
  fromClubId: string;
  toClubId: string;
  fee: number;
  wage: number;
  years: number;
  role: SquadRole;
  age: number;
  /** True when he moved for nothing at the end of a contract. */
  free: boolean;
  fromCountryId: string;
  toCountryId: string;
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
export function applyTransferEffects(
  player: Player,
  to: Team,
  prestige = 1,
  abroad = false,
): void {
  // A new country is a new language, a new way of playing and a new life, so
  // form is pulled harder toward neutral than by a move down the road.
  const settle = abroad ? 0.55 : 0.4;
  player.form = round(player.form * (1 - settle) + 50 * settle, 1);
  player.morale = clamp(round(player.morale * 0.6 + 74 * 0.4, 1), 0, 100);
  const standing = reputationRequired(to, prestige);
  if (standing > player.reputation) {
    player.reputation = round(player.reputation + (standing - player.reputation) * 0.25, 1);
  }
}
