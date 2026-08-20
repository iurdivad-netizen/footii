import type { Player } from '../player/player.ts';
import type { Team } from '../team/team.ts';
import { currentAbility } from '../player/player.ts';
import { squadLevel } from './transfers.ts';
import { clamp, round } from '../util/math.ts';

/**
 * WHERE A CAREER IS ALLOWED TO BEGIN
 *
 * The setup screen has always let you pick any of the 192 clubs in the world.
 * That is the right freedom and it had no cost attached: you could start an
 * eighteen-year-old with 54 ability at the best side on earth, which no club
 * anywhere would do, and the career that followed was decided before a ball was
 * kicked.
 *
 * The missing piece was never the CHOICE. It was the gate.
 *
 * So every club now falls into one of three bands, measured against the squad
 * it already has:
 *
 *   OPEN    they would take you today. Pick it and start.
 *   TRIAL   you are short of their level, but not absurdly. They will look at
 *           you — one match, and what you do in it decides.
 *   CLOSED  you are not a player they would look at. Not this year.
 *
 * WHY A TRIAL RATHER THAN A FLAT REFUSAL. A refusal is a filtered list, which is
 * a rule the player reads and obeys. A trial is a decision with a consequence:
 * you can reach above yourself, and find out in ninety minutes whether you were
 * right. It also uses the one thing the game is actually about — a match — to
 * answer a question the menu was answering with a number.
 *
 * POTENTIAL COUNTS, because this is the one moment in a career where it should.
 * Clubs sign teenagers on what they might become; nobody signs a thirty-year-old
 * on it. That is exactly the difference between arriving and transferring, and
 * it is why this is not the transfer market's `reputationRequired` gate — that
 * one asks whether a club can afford a known player, and a career starts with
 * nobody who is known.
 */

export type ClubStanding = 'open' | 'trial' | 'closed';

/**
 * How far above his level a player may reach before a club stops looking.
 *
 * Wide enough that a good prospect can aim at a serious club and mean it;
 * narrow enough that the best side in the world is not a coin flip away for
 * everybody. Beyond this the answer is no rather than "prove it".
 */
export const TRIAL_REACH = 16;

/** How much of the gap between ability and potential a club will bet on. */
export const POTENTIAL_WEIGHT = 0.45;

/** Nobody is signed on potential once they are this old. */
export const PROSPECT_AGE = 24;

/**
 * A squad this weak takes anybody who turns up.
 *
 * The gate must never be a wall. A player built badly enough in the creator can
 * come out below the level of the WORST squad in the world, and without this he
 * would have nowhere at all to start: every club a trial, and a failed trial
 * leaving him with no career to begin. That is a dead end reachable from the
 * character creator, which is the worst possible place to put one.
 *
 * It is also true. The bottom rung of professional football does not hold
 * auditions; it needs eleven players on Saturday.
 */
export const ALWAYS_OPEN_LEVEL = 30;

/**
 * What a club sees when it looks at him.
 *
 * Current ability plus a share of the room left to his potential — but only
 * while he is young enough for that to be a reasonable bet. A twenty-eight-year
 * old is what he is.
 */
export function perceivedLevel(player: Player): number {
  const ability = currentAbility(player);
  const room = Math.max(0, player.potentialAbility - ability);
  const youth = player.age >= PROSPECT_AGE ? 0 : 1 - player.age / PROSPECT_AGE;
  return round(ability + room * POTENTIAL_WEIGHT * youth, 1);
}

/**
 * The level a club expects from somebody walking in.
 *
 * Its own squad, and nothing else. A club is not measured here by its league's
 * prestige or its European place — those decide what it can PAY, which is the
 * transfer market's question. This one is simply whether he is good enough to be
 * in the building.
 */
export function startingBar(team: Team): number {
  return squadLevel(team);
}

/** Where this player stands with this club, before a ball is kicked. */
export function clubStanding(player: Player, team: Team): ClubStanding {
  if (startingBar(team) <= ALWAYS_OPEN_LEVEL) return 'open';
  const gap = startingBar(team) - perceivedLevel(player);
  if (gap <= 0) return 'open';
  return gap <= TRIAL_REACH ? 'trial' : 'closed';
}

/** How far short of the club he is. Zero or less when they would just take him. */
export function reachOf(player: Player, team: Team): number {
  return round(startingBar(team) - perceivedLevel(player), 1);
}

/**
 * The match rating a trial demands.
 *
 * Scaled by how far he is reaching. Turning up at a club barely above your level
 * needs a decent afternoon; walking into one sixteen points better needs the
 * best match of your life, and should.
 *
 * The floor is deliberately above a competent-but-quiet performance: a trial
 * you pass by not being noticed is not a trial.
 */
export function trialRequirement(reach: number): number {
  return round(clamp(6.4 + reach * 0.14, 6.4, 8.8), 1);
}

/** Did he do enough? */
export function trialPassed(rating: number, required: number): boolean {
  return rating >= required;
}

/**
 * What to say about the bar he has to clear, in football rather than in numbers.
 *
 * The rating is shown as well — it is the thing being measured, and hiding it
 * would make the result feel arbitrary — but a number alone does not tell
 * somebody whether they are being asked for a good game or a great one.
 */
export function describeTrial(required: number): string {
  if (required >= 8.4) return 'Nothing short of the best match you have ever played.';
  if (required >= 7.8) return 'You would have to be the best player on the pitch.';
  if (required >= 7.2) return 'A really good afternoon, not merely a tidy one.';
  return 'A solid performance should be enough.';
}

/**
 * How a failed trial actually went.
 *
 * A near miss and a shambles are not the same afternoon, and copy that called
 * both "a perfectly good performance" was wrong most of the time it was shown —
 * a 3.8 against a required 8.2 is not a good match narrowly rejected, it is a
 * bad one. This reads the GAP rather than the rating, because what makes a
 * trial a near miss is how close it came to what was asked.
 */
export function describeFailure(rating: number, required: number): string {
  const short = required - rating;
  if (short <= 0.4) return 'You were within touching distance. Another goal and it was yours.';
  if (short <= 1.2) return 'A good afternoon, and not quite the one they were looking for.';
  if (short <= 2.5) return 'A steady enough game, and never the performance this needed.';
  return 'It was not your day, and they had seen enough long before the end.';
}

/** One line on what a standing means, for the club list. */
export function describeStanding(standing: ClubStanding): string {
  if (standing === 'open') return 'Would sign you';
  if (standing === 'trial') return 'Trial required';
  return 'Out of your reach';
}
