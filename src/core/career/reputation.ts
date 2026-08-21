import { clamp, remap, round, unit } from '../util/math.ts';
import type { Player } from '../player/player.ts';
import { currentAbility } from '../player/player.ts';
import type { Team } from '../team/team.ts';
import { teamStrength } from '../team/team.ts';
import type { SeasonStats } from './seasonStats.ts';

/**
 * REPUTATION
 *
 * What the football world thinks you are, on a 0-100 scale, as distinct from
 * what you actually are (Current Ability) and what you might become (Potential
 * Ability). It is the currency of the transfer market: clubs sign reputations
 * first and footballers second, which is why a good season at a small club can
 * open a door that a quietly competent one cannot.
 *
 * Reputation moves at two speeds, and the difference matters:
 *
 *   PER MATCH  - goals, assists and standout ratings push it up quickly. This
 *                is the hot streak: score six in five and people notice.
 *   PER SEASON - the summer settles it back toward what your career actually
 *                justifies (ability, league finish, contribution, and how much
 *                you played). This is the correction: a reputation built on one
 *                good month fades if it is not renewed, and a player who stops
 *                playing slides regardless of how good he still is.
 *
 * Without the settlement, reputation could only ever climb, and every career
 * ended with a world-famous 34-year-old who had not started a match in a year.
 */

export interface ReputationTier {
  /** Lowest reputation in this tier. */
  from: number;
  label: string;
  /** What this level of fame means for your career, shown in the hub. */
  description: string;
}

/**
 * Named bands, in ascending order.
 *
 * The thresholds are deliberately aligned with `reputationRequired()` in
 * transfers.ts: reaching "Established" is roughly the point at which the
 * mid-table clubs start to look, and "Star" is where the champions do.
 */
export const REPUTATION_TIERS: readonly ReputationTier[] = [
  { from: 0, label: 'Unknown', description: 'Nobody outside your own dressing room knows your name.' },
  { from: 18, label: 'Known locally', description: 'Your own supporters know you. Scouts do not.' },
  { from: 34, label: 'Established', description: 'A recognised name in this division.' },
  { from: 50, label: 'Well known', description: 'Clubs above you have started watching.' },
  { from: 65, label: 'Star', description: 'One of the names this league is known for.' },
  { from: 80, label: 'Household name', description: 'The sort of signing that sells season tickets.' },
  { from: 92, label: 'World class', description: 'Anyone would take you, if they could afford you.' },
];

export function reputationTier(reputation: number): ReputationTier {
  let tier = REPUTATION_TIERS[0]!;
  for (const candidate of REPUTATION_TIERS) {
    if (reputation >= candidate.from) tier = candidate;
  }
  return tier;
}

/** Standing of a club, 0-1. Used for both fame and the transfer market. */
export function clubStature(team: Team): number {
  return teamStrength(team);
}

export interface MatchReputationInput {
  goals: number;
  assists: number;
  /** Match rating, 1-10. */
  rating: number;
  /** Standing of the club he played for, 0-1. */
  clubStature: number;
  /** Reputation before the match; fame is harder to add the more you have. */
  reputation: number;
  /** How closely the division is watched, 0-1. */
  divisionPrestige?: number;
}

/**
 * Reputation earned (or lost) in a single match.
 *
 * Goals travel furthest, assists count for less than the players who provide
 * them would like, and only genuinely outstanding ratings add anything on top.
 * A poor performance costs a little, so a run of anonymous games is not free.
 *
 * The club's standing is a VISIBILITY multiplier, not a gate: a hat-trick for
 * the champions is seen by more people than a hat-trick for the strugglers, but
 * the strugglers' striker still gets noticed.
 *
 * Gains SATURATE as reputation climbs: the first ten goals of a career make a
 * name, the two hundredth adds nothing to one. Without it a decent striker
 * reached 98 by his mid-twenties on volume alone and the summer settlement then
 * dragged him back ten points every year, which read as the game taking
 * something away rather than as fame having a ceiling. Losses are not damped —
 * falling off is easier the further you have to fall.
 */
export function matchReputationGain(input: MatchReputationInput): number {
  const gained =
    input.goals * 0.6 + input.assists * 0.35 + Math.max(0, input.rating - 7.2) * 0.5;
  const lost = Math.max(0, 5.9 - input.rating) * 0.25;
  const saturation = 0.35 + 0.65 * (1 - unit(input.reputation));
  // Both halves of visibility: who you play for, and what you play in. A
  // second-division hat-trick is still a hat-trick, but fewer people saw it.
  const stage = 0.55 + (input.divisionPrestige ?? 1) * 0.45;
  const visibility = (0.85 + input.clubStature * 0.35) * stage;
  return round((gained * saturation - lost) * visibility, 3);
}

export interface ReputationSettlementInput {
  stats: SeasonStats;
  /** Final league position, 1 = champions. */
  leaguePosition: number;
  leagueSize: number;
  /** Standing of the club he played for, 0-1. */
  clubStature: number;
  /**
   * League matches he actually played.
   *
   * A separate number from `stats.matches` rather than a slice of it, and the
   * separation is the whole fix. `stats` counts EVERY competition — both cups,
   * a European run, an international tournament — so dividing it by a league
   * fixture list compared a number that reaches 50 with one that is 30. The
   * ratio never fell below 1 in any season anybody has played, the clamp below
   * pinned it, and "you cannot be famous for football you did not play" was a
   * sentence the code did not implement.
   *
   * The league is the right denominator because it is the only competition
   * whose fixture count is known in advance. How long a cup run lasts is an
   * OUTCOME, so ties you never had are not ties you missed; being left out of
   * the league side is absence, and it is the thing this term is here to see.
   */
  leagueMatches: number;
  /** League matches there were to play, so playing time can be judged. */
  seasonLength: number;
  /** How closely the division is watched, 0-1. */
  divisionPrestige?: number;
}

export interface ReputationSettlement {
  /** Where the season says his reputation belongs. */
  target: number;
  before: number;
  after: number;
  delta: number;
  /** Human-readable reasons, shown on the review screen. */
  notes: string[];
}

/**
 * The level a completed season justifies.
 *
 * Ability sets the floor — a genuinely good footballer does not become anonymous
 * — and everything visible about the season (where the club finished, what you
 * contributed, how much you played, how big the stage was) is added on top.
 */
export function reputationTarget(player: Player, input: ReputationSettlementInput): number {
  const prestige = input.divisionPrestige ?? 1;
  const ability = currentAbility(player);
  // The floor a good footballer keeps is itself lower out of the top flight:
  // ability nobody watches is ability nobody talks about.
  const baseline = remap(ability, 40, 88, 10, 86) * (0.72 + prestige * 0.28);

  // 1 for champions, 0 for bottom. A one-team league is treated as a win.
  const finishShare =
    input.leagueSize > 1
      ? clamp((input.leagueSize - input.leaguePosition) / (input.leagueSize - 1), 0, 1)
      : 1;
  const finish = remap(finishShare, 0, 1, -7, 11);

  const contributions = input.stats.goals + input.stats.assists;
  const contribution = Math.min(1, contributions / 16) * 15;

  // A big stage amplifies both the good and the bad of a season.
  const visibility = (0.75 + input.clubStature * 0.5) * (0.6 + prestige * 0.4);

  // You cannot be famous for football you did not play.
  const exposure = 0.5 + playingTimeShare(input) * 0.5;

  return clamp((baseline + (finish + contribution) * visibility) * exposure, 0, 100);
}

/**
 * How much of the league season he was actually in the side, 0-1.
 *
 * Its own function because two places need the same answer: the target, which
 * scales by it, and the notes, which have to be able to say so. A season
 * without a league to play — a career's first summer, or a competition-only
 * edge case — reads as a full one rather than as an absence, because there was
 * no side to be left out of.
 */
function playingTimeShare(input: ReputationSettlementInput): number {
  if (input.seasonLength <= 0) return 1;
  return clamp(input.leagueMatches / input.seasonLength, 0, 1);
}

/**
 * Settle reputation at the end of a season.
 *
 * Deliberately a partial move toward the target rather than a jump to it:
 * fame has inertia in both directions, so one quiet season does not erase a
 * name and one loud season does not make one.
 */
export function settleReputation(
  player: Player,
  input: ReputationSettlementInput,
): ReputationSettlement {
  const before = player.reputation;
  const target = reputationTarget(player, input);
  const after = clamp(round(before * 0.72 + target * 0.28, 1), 0, 100);
  player.reputation = after;

  const delta = round(after - before, 1);
  const notes: string[] = [];
  if (input.stats.matches === 0) {
    notes.push('A season without football is a season out of sight.');
  } else if (delta >= 2) {
    notes.push('Your name travelled further this season.');
  } else if (delta <= -2) {
    notes.push('The game has started to forget you.');
  } else {
    notes.push('Your standing in the game is broadly unchanged.');
  }
  // Added ALONGSIDE the direction note rather than instead of it, like every
  // other note below. Playing time is now a real term, so a player who spent
  // half the league season out of the side should be told that is what moved
  // his standing — but he should still be told which way it moved.
  if (input.stats.matches > 0 && playingTimeShare(input) < 0.5) {
    notes.push('You were in the side for less than half the league season.');
  }
  if (input.leaguePosition === 1) notes.push('Winning the league puts every player in it on show.');
  if ((input.divisionPrestige ?? 1) < 1) {
    notes.push('Fewer people are watching at this level than the one above it.');
  }
  if (input.stats.goals + input.stats.assists >= 12) {
    notes.push(`${input.stats.goals} goals and ${input.stats.assists} assists are hard to ignore.`);
  }

  return { target: round(target, 1), before: round(before, 1), after, delta, notes };
}

