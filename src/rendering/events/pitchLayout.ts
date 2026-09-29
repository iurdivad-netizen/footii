import type { GoalkeeperAction } from '../../core/goalkeeper/goalkeeper.ts';
import type { BoxRelation } from '../../core/events/zones.ts';
import type { SituationContext } from '../../core/events/types.ts';
import { getSituationTemplate } from '../../data/situations.ts';

/**
 * PITCH LAYOUT — the rules the picture has to keep, separate from the drawing.
 *
 * Three things about the pitch were wrong, and all three were facts the canvas
 * code had no single place to state:
 *
 *   THE GOAL WAS WIDER THAN THE SIX-YARD BOX. 0.34 of the width against a box of
 *   0.30 — on a real pitch the box is two and a half times the width of the goal.
 *   The goal was the one thing drawn at the wrong scale (the penalty area and
 *   six-yard box are both within a few percent of true against the canvas's
 *   pixels-per-metre), and it was written as a literal in five places, so it
 *   could not be corrected in one.
 *
 *   THE KEEPER DIVED THE WRONG WAY. The option labels say near and far post
 *   relative to where the player is standing — "from the right, the near post is
 *   the right post" — and the keeper was drawn with near always on the LEFT.
 *   For any player on the right wing the text said one post and the picture
 *   showed the other, which is exactly the contradiction the keeper strip was
 *   written to remove.
 *
 *   A DEFENDER WAS DRAWN ATTACKING. Every scene put a goal at the top with the
 *   player below it and the opposition between the two, which for a centre back
 *   in his own third is a picture of him shooting at the wrong goal.
 */

/**
 * Proportions of the canvas, as fractions of its width or height.
 *
 * Ratios are what matter: goal : six-yard : penalty area is 1 : 1.7 : 3.3 here
 * and 1 : 2.5 : 5.5 on a real pitch. The goal is kept somewhat wider than true
 * and the boxes somewhat narrower, because the keeper's dive is the read the
 * whole game is built on and at the true 1 : 5.5 it would be a twelve-pixel
 * movement on a phone.
 */
export const PITCH = {
  goalW: 0.2,
  sixW: 0.34,
  boxW: 0.66,
  boxH: 0.46,
  sixH: 0.2,
  spotY: 0.34,
} as const;

/** How far towards a post the keeper goes, as a share of the goal's width. */
export const DIVE_REACH = 0.32;

/**
 * Which side the NEAR post is on, -1 left and +1 right.
 *
 * Relative to where the player is standing. A player dead centre has no near
 * post, so the left is called near and the right far: it has to be SOME choice
 * because the two words must never mean the same post. (They did, for a
 * central player — near and far both resolved to the left.)
 */
export function nearSide(channelX: number): -1 | 1 {
  return channelX > 0.5 ? 1 : -1;
}

/**
 * Which way a keeper's dive goes: -1 left, +1 right, 0 when he is not diving.
 *
 * ONE RULE for both where he ends up and which way he leans, so the two cannot
 * disagree. Near is the shooter's side and far is the other (see `nearSide`).
 */
export function diveDirection(action: GoalkeeperAction, channelX: number): -1 | 0 | 1 {
  const near = nearSide(channelX);
  if (action === 'divingNear') return near;
  if (action === 'divingFar') return near === 1 ? -1 : 1;
  return 0;
}

/**
 * How far a diving keeper's body leans, in radians.
 *
 * A dive used to be the same ellipse as a stand, flattened and moved sideways,
 * which is a keeper who has shuffled rather than one who has launched himself.
 * Leaning the leading end UP the picture and letting the trailing end drop is
 * what a body thrown at the corner looks like from above. About twenty-six
 * degrees: past that the ellipse stops reading as a keeper and starts reading
 * as a diagonal line.
 */
export const DIVE_TILT = 0.45;

/**
 * The rotation to draw a keeper at, for canvas `ellipse`.
 *
 * Canvas angles run clockwise and y runs DOWN the picture, so raising the right
 * end for a dive to the right is a NEGATIVE angle, and the mirror image for the
 * left. Zero for everything that is not a dive: a keeper going to ground or
 * rushing out is symmetrical about his own axis and has nothing to lean into.
 */
export function keeperTilt(action: GoalkeeperAction, channelX: number): number {
  const dive = diveDirection(action, channelX);
  // A real zero rather than the -0 that negating one would give.
  return dive === 0 ? 0 : -dive * DIVE_TILT;
}

/** Horizontal position of the keeper for a given action, in canvas units. */
export function keeperX(
  action: GoalkeeperAction,
  channelX: number,
  centre: number,
  goalW: number,
): number {
  const dive = diveDirection(action, channelX);
  if (dive !== 0) return centre + dive * goalW * DIVE_REACH;
  // Everything else shades towards the ball, but by a share of the GOAL rather
  // than of the canvas: the goal is narrower than it was, and a shade sized for
  // the old goal pushed him onto the post for anybody out wide.
  const shade = (channelX - 0.5) * goalW * 0.6;
  const half = goalW / 2;
  return Math.min(centre + half, Math.max(centre - half, centre + shade));
}

/**
 * Whether the goal in this picture is the one being DEFENDED.
 *
 * A defensive moment in his own third is drawn the other way up: his goal at
 * the bottom behind him, the opposition coming from the top. A defensive
 * moment further up the pitch — the pressing trap, where he is the first man
 * closing down a team playing out from the back — is NOT flipped, because the
 * goal at the top of that picture is the opposition's and is exactly where it
 * should be. Flipping it would draw his own goal sixty metres closer than it is.
 *
 * Read from the situation's template rather than passed in, so no draw call can
 * forget to say so.
 */
export function ownGoalInView(context: SituationContext): boolean {
  return (
    getSituationTemplate(context.situation).defensive && context.zone.third === 'defensive'
  );
}

/**
 * Where a defender stands, as a fraction of the canvas height from the TOP.
 *
 * The own goal is at the bottom, so this runs the other way from the attacking
 * depth: inside the box is low on the picture, and the box edge sits just above
 * the penalty area's top line at `1 - boxH`.
 */
export function defendingDepth(box: BoxRelation): number {
  if (box === 'inside') return 0.7;
  if (box === 'edge') return 0.5;
  return 0.34;
}

/**
 * How far up the pitch the opposition stand from him, as a share of the height.
 *
 * Wider when defending. Attacking, a marker is ten per cent of the pitch away
 * and the ball sits at the attacker's feet on the far side of them; defending,
 * the ball is at THEIR feet and it has to clear his own disc, so they stand
 * further off.
 */
export function opponentGap(defendingOwnGoal: boolean): number {
  return defendingOwnGoal ? 0.16 : 0.1;
}

/**
 * How many opposition players are drawn.
 *
 * At least one when defending: "Danger — he is the last line of resistance" is
 * a sentence about a man with the ball, and a picture with nobody in it would
 * be a defender defending against nothing. Attacking, none really is none.
 */
export function opponentCount(nearby: number, defendingOwnGoal: boolean): number {
  return defendingOwnGoal ? Math.max(1, nearby) : nearby;
}
