import type { ActionKind, OutcomeKind } from '../../core/events/types.ts';
import type { Point } from './SituationRenderer.ts';

/**
 * THE MOTION OF A RESOLUTION, as pure functions.
 *
 * Two things the replay got wrong, both of them invisible until it was looked
 * at frame by frame.
 *
 * THE CONFETTI RAN AT THE SPEED OF THE SCREEN. It advanced a fixed 0.016 per
 * RENDERED frame under a comment claiming that made it behave the same on a
 * 60Hz screen and a 144Hz one. It does the opposite: the hold that ends the
 * celebration is measured in seconds, so a faster screen fits 2.4 times as many
 * frames into it and the burst flew 2.4 times as far — off the top of the
 * canvas, which is most of why a goal's celebration looked thin. A step has to
 * be the time that actually passed.
 *
 * THE OPPONENTS WERE PROPS. The ball moved and the player moved, and everybody
 * else stood exactly where they had been standing: a man was tackled and the
 * man who lost the ball did not so much as flinch, a defender was beaten and
 * stayed rooted to the spot he was beaten on. The outcome was true and the
 * picture did not show it, because the picture only ever moved the two things
 * that belong to the player.
 */

/** Pixels per second squared on a canvas about 250 pixels tall. */
export const SPARK_GRAVITY = 260;

/**
 * The longest step a frame may take, in seconds.
 *
 * A tab that was in the background resumes with one enormous gap, and integrating
 * that in one go throws the whole burst off the screen in a single frame. A
 * gap that long is a pause, not time the confetti spent flying.
 */
export const MAX_SPARK_STEP = 0.05;

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  colour: string;
}

/**
 * Advance one piece of confetti by `dt` seconds.
 *
 * Semi-implicit Euler — velocity first, then position from the NEW velocity —
 * which is the version that stays close to the true arc at both 60 and 144
 * frames a second. (Position from the OLD velocity drifts visibly at the
 * larger step, which would have put a frame-rate dependence back in by the
 * side door.)
 */
export function stepSpark(spark: Spark, dt: number): void {
  const step = Math.min(MAX_SPARK_STEP, Math.max(0, dt));
  spark.vy += SPARK_GRAVITY * step;
  spark.x += spark.vx * step;
  spark.y += spark.vy * step;
}

export interface ReactionInput {
  outcome: OutcomeKind;
  actionKind: ActionKind;
  /** Where the nearest opponent stands, settled. */
  opponent: Point;
  player: Point;
  /** Where the ball leaves from. */
  ballFrom: Point;
  /** The man a pass is meant for, when there is one on the picture. */
  receiver?: Point;
  /** Which way the player breaks on a dribble: -1 left, +1 right. */
  side: -1 | 1;
  width: number;
  height: number;
  /** True when the goal in view is the one he is defending. */
  defendingOwnGoal: boolean;
}

export interface Reaction {
  /** Where the nearest opponent ends up. Absent means he stays put. */
  opponentTo?: Point;
  /**
   * Where the ball ends up, when the opponent's move decides it. Absent means
   * the ordinary plan for the outcome stands.
   */
  ballTo?: Point;
}

/** A pitch's worth of margin, so nobody is animated off the edge of the picture. */
function clampToPitch(p: Point, width: number, height: number): Point {
  return { x: Math.min(width - 8, Math.max(8, p.x)), y: Math.min(height - 8, Math.max(8, p.y)) };
}

function unitVector(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  // Two men on the same pixel have no direction between them; away from the
  // player is up the pitch, which is where an opponent comes from.
  return length < 1e-6 ? { x: 0, y: -1 } : { x: dx / length, y: dy / length };
}

/** How far along a pass an interception happens, from the passer. */
export const INTERCEPT_AT = 0.55;

/**
 * What the nearest opponent does about how the moment ended.
 *
 * The rule is that the picture agrees with the outcome from the opponent's
 * side as well as the player's:
 *
 *   ballWon           he lost it, and recoils from the man who took it
 *   dribbleSuccess    he was beaten: wrong-footed the way the player did NOT go,
 *                     and left behind
 *   passIntercepted   he gets to the ball ON THE LANE. It used to fly straight to
 *                     a man standing next to the passer, which is not an
 *                     interception, it is a pass to the wrong player
 *   dribbleFailed     he steps in and takes it
 *   foulCommitted     he steps in, and the ball with him
 *   turnover          attacking, he takes it as above. Defending, the man with
 *                     the ball goes PAST the defender towards his goal, which is
 *                     what losing that duel means
 *
 * Everything else — a block, a deflection, a shot at goal — leaves him where he
 * is: those are resolved by where the ball goes, not by him.
 */
export function opponentReaction(input: ReactionInput): Reaction {
  const { opponent, player, width, height, side } = input;
  const clamp = (p: Point) => clampToPitch(p, width, height);

  switch (input.outcome) {
    case 'ballWon': {
      const away = unitVector(player, opponent);
      return {
        opponentTo: clamp({
          x: opponent.x + away.x * height * 0.16,
          y: opponent.y + away.y * height * 0.16,
        }),
      };
    }
    case 'dribbleSuccess':
      return {
        opponentTo: clamp({
          x: opponent.x - side * width * 0.09,
          y: opponent.y + height * 0.05,
        }),
      };
    case 'passIntercepted': {
      if (!input.receiver) return stepIn(input, 0.4);
      const point = clamp({
        x: input.ballFrom.x + (input.receiver.x - input.ballFrom.x) * INTERCEPT_AT,
        y: input.ballFrom.y + (input.receiver.y - input.ballFrom.y) * INTERCEPT_AT,
      });
      return { opponentTo: point, ballTo: point };
    }
    case 'dribbleFailed':
    case 'foulCommitted':
      return stepIn(input, 0.4);
    case 'turnover': {
      if (!input.defendingOwnGoal) return stepIn(input, 0.4);
      // Past him, on the side he chose, and on towards the goal behind him.
      const past = clamp({ x: player.x + side * width * 0.1, y: player.y + height * 0.12 });
      return { opponentTo: past, ballTo: past };
    }
    default:
      return {};
  }
}

/** The opponent closes the player down and the ball goes to him. */
function stepIn(input: ReactionInput, share: number): Reaction {
  const { opponent, player, width, height } = input;
  const to = clampToPitch(
    {
      x: opponent.x + (player.x - opponent.x) * share,
      y: opponent.y + (player.y - opponent.y) * share,
    },
    width,
    height,
  );
  return { opponentTo: to, ballTo: to };
}

// ------------------------------------------------------------------ saves ---

/**
 * IS THIS SAVE A PARRY?
 *
 * The engine already decides. `resolveShot` rolls the keeper's handling and, when
 * he cannot hold it, writes "he can only parry it!" and marks the outcome as
 * retaining possession; otherwise it writes "saves". The replay never read that
 * and drew every save as the ball stopping dead in his hands, so a line of
 * commentary said one thing and the picture said the other — the same fault as
 * the keeper diving to the wrong post, in the one animation the mechanic is
 * about.
 *
 * So the picture is told, rather than choosing. Nothing here is invented, which
 * is why it needs no randomness and cannot disagree with the text: the only
 * source of a parry is the engine's own roll.
 */
export function isParry(outcome: { kind: OutcomeKind; retainedPossession: boolean }): boolean {
  return outcome.kind === 'saved' && outcome.retainedPossession;
}

export interface ReboundInput {
  /** Where the keeper is when he gets a hand to it. */
  keeper: Point;
  /** Which side the shot was aimed at: -1 left, +1 right, 0 down the middle. */
  aim: -1 | 0 | 1;
  /** Which side the shooter is on, for a shot with no side of its own. */
  shooterSide: -1 | 1;
  goalCentre: number;
  goalW: number;
  width: number;
  height: number;
}

/**
 * Where a parried ball ends up.
 *
 * Pushed WIDE, on the side it was aimed at, and out into the box: a keeper who
 * can only parry it is putting it away from goal rather than back across it,
 * which is also why a parry is a loose ball in front of goal and not a corner.
 * A shot down the middle goes to the shooter's side, which is the side he will
 * be able to get to it from. Deterministic — the same shot always rebounds the
 * same way — because a replay that varied between viewings would be a replay of
 * something that did not happen.
 */
export function reboundPoint(input: ReboundInput): Point {
  const { keeper, goalCentre, goalW, width, height } = input;
  const dir = input.aim || input.shooterSide;
  return {
    x: Math.min(width - 10, Math.max(10, goalCentre + dir * goalW * 0.85)),
    // Out into play but never past the penalty spot's depth: still in the box.
    y: Math.min(height * 0.42, keeper.y + height * 0.2),
  };
}

/** How long a keeper takes to gather a ball he has caught, in seconds. */
export const GATHER_SECONDS = 0.35;

/**
 * The keeper's size as he gathers a caught ball, 1 before and after.
 *
 * A catch used to be a ball that stopped, and nothing about the man who stopped
 * it: no difference at all between a keeper who took it and a wall. A brief
 * swell as he closes on it is what a catch looks like from above, and it is the
 * difference on screen from a parry, where he does not close on it at all and
 * the ball goes on.
 */
export function gatherScale(sinceTouch: number): number {
  if (sinceTouch <= 0) return 1;
  const share = Math.min(1, sinceTouch / GATHER_SECONDS);
  return 1 + 0.3 * Math.sin(Math.PI * share);
}
