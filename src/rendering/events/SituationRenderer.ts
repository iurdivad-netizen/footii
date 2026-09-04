import type { GoalkeeperAction } from '../../core/goalkeeper/goalkeeper.ts';
import type {
  ActionFamily,
  ActionKind,
  OutcomeKind,
  SituationContext,
} from '../../core/events/types.ts';
import type { Channel, Third } from '../../core/events/zones.ts';
import { clamp01 } from '../../core/util/math.ts';
import { POSITION_PROFILES } from '../../core/player/positions.ts';
import type { Position } from '../../core/player/positions.ts';

/**
 * SITUATION RENDERER
 *
 * Minimalist canvas view of the moment, drawn from the attacker's perspective:
 * goal at the top, the player at the bottom, defenders between.
 *
 * Its only job is to make the goalkeeper's behaviour READABLE — the player has
 * to be able to see him commit, because that is the information the decision
 * mechanic is built around. No sprites, no physics.
 */

/**
 * The colours the pitch is drawn in.
 *
 * Exported because the legend beneath it has to name these dots in exactly
 * these colours — a key drawn in approximately the right green is worse than
 * no key at all.
 */
export const COLOURS = {
  grass: '#12351f',
  grassAlt: '#164025',
  line: 'rgba(255,255,255,0.55)',
  goal: '#f4f6f8',
  keeper: '#ffd166',
  keeperCommitted: '#ff7b54',
  player: '#4aa3ff',
  /*
   * A team-mate: the player's own blue, lightened.
   *
   * Deliberately the SAME HUE as the player rather than a sixth colour — they
   * are on his side, and the picture should say so at a glance. Told apart by
   * being drawn hollow, which is a difference that survives both a small canvas
   * and colour blindness in a way a second blue would not.
   */
  teammate: '#a9d4ff',
  defender: '#e2574c',
  ball: '#ffffff',
};

export interface RenderState {
  context: SituationContext;
  /** 0-1 progress through the decision window. */
  progress: number;
  /** True once the keeper has committed. */
  committed: boolean;
  keeperAction: GoalkeeperAction;
  /**
   * False for situations the keeper takes no part in (midfield build-up, a
   * defensive duel). Drawing him there would advertise information that has no
   * bearing on the decision, which is worse than drawing nothing.
   */
  showGoalkeeper: boolean;
  /**
   * Whether to draw the men he could actually give it to.
   *
   * True only when a pass or a cross is among the six, for the same reason the
   * keeper is hidden when he takes no part: a receiver drawn on a moment with
   * nobody to pass to is information about nothing. When it is true, the
   * options include "find someone" and the picture has to answer WHO — the
   * labels name them, and until now the pitch did not show them.
   */
  showTeammates?: boolean;
  /**
   * HOW FAR THROUGH THE MOVE THIS FRAME IS — 0 at the first narration beat, 1
   * at the situation as it will be decided. Absent means 1, so every caller
   * that does not care about the build-up keeps the settled picture.
   *
   * The build-up tells the story of the chance a beat at a time, and the pitch
   * used to sit perfectly still through all of it: three sentences describing a
   * move developing over a photograph. Now the ball travels from where the move
   * started, the defenders close, the shape pushes up, and it all arrives
   * together with the last beat and the options. Nothing is revealed early —
   * the picture ENDS at the same situation it always showed, it just gets there
   * rather than starting there.
   */
  develop?: number;
}

/**
 * What the animation needs to know about how the moment resolved. The kind and
 * family shape the ball's flight (a chip is lofted, a low shot is not, a pass
 * goes to a man rather than the goal); the outcome decides where it ends.
 */
export interface ResolutionCue {
  outcome: OutcomeKind;
  actionKind: ActionKind;
  family: ActionFamily;
  /**
   * How much of a party to throw once the ball lands.
   *
   * A SIZE rather than a mood, deliberately: the renderer draws particles or it
   * does not, and how many. What the crowd thinks is decided in
   * ui/crowdReaction.ts, which is where the football judgement belongs — this
   * file has no business knowing what a jeer is.
   */
  celebration?: 'big' | 'small' | 'none';
}

/** One piece of confetti, in flight. */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  colour: string;
}

/** The colours a celebration is thrown in: the goal's own yellow, and joy. */
const SPARK_COLOURS = ['#facc15', '#4ade80', '#ffffff'];

/** One computed flight: where the ball goes, how, and what marks the arrival. */
interface ResolutionPlan {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Fraction of extra arc height, 0 for a flat ball. */
  loft: number;
  /** Seconds of flight before the impact frame. */
  flight: number;
  /** Ring colour drawn at the impact, or null for a ball that just runs away. */
  ringColour: string | null;
  /** True lights the goal band up as well — reserved for a goal, like the hue. */
  netFlash: boolean;
  /** True moves the player's own dot with the ball — a carry, not a strike. */
  movePlayer: boolean;
  /**
   * THE WALL, for a one-two: the man it goes to on the way.
   *
   * A one-two is the only action in the game where the ball leaves the player
   * and comes back to him, and it used to be drawn as a single flight to a
   * team-mate and nothing else — which is a pass, not a one-two, and made the
   * two options indistinguishable in the picture.
   */
  via?: Point;
  /** Where he has run to by the time the return arrives. Only used with `via`. */
  playerRunsTo?: Point;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * WHERE THE BALL SITS AT HIS FEET.
 *
 * It used to be pinned ten pixels right and eight DOWN of him, always — which
 * put it on the far side of him from the goal in every single situation, so a
 * picture whose whole subject is "what can he do towards that goal" showed him
 * with the ball behind him. It is placed on the goal-facing side now, on the
 * line between him and the mouth, so a man out on the right wing has it angled
 * infield and a man in the middle has it dead in front.
 *
 * The reach clears the player's own nine-pixel disc, or the ball reads as a
 * highlight on him rather than as a ball in front of him.
 */
export function ballAtFeet(player: Point, goal: Point, reach = 14): Point {
  const dx = goal.x - player.x;
  const dy = goal.y - player.y;
  const distance = Math.hypot(dx, dy) || 1;
  return { x: player.x + (dx / distance) * reach, y: player.y + (dy / distance) * reach };
}

/** Weighted centroid of a zone-weight map over the places those zones sit. */
function centroid<K extends string>(
  map: Partial<Record<K, number>>,
  places: Record<K, number>,
  fallback: number,
): number {
  let total = 0;
  let sum = 0;
  for (const [key, weight] of Object.entries(map) as [K, number][]) {
    total += weight;
    sum += weight * places[key];
  }
  return total > 0 ? sum / total : fallback;
}

/**
 * Where a team-mate is standing, from the position he plays.
 *
 * Read off the same `zoneWeights` the situation generator uses to decide where
 * a position receives the ball — so a winger is wide and high, a centre back
 * is central and deep, and the picture agrees with the model rather than
 * inventing a second one.
 *
 * Most attacking roles share a `third` profile, so an honest centroid alone
 * puts four of them on one horizontal line, which reads as a defensive wall
 * rather than as options. They are spread sideways by index and staggered a
 * little in depth, which breaks the row up without moving any man out of the
 * band his position actually belongs in.
 */
export function teammateSpot(
  position: Position,
  index: number,
  count: number,
  w: number,
  h: number,
): Point {
  const weights = POSITION_PROFILES[position].zoneWeights;
  const x = centroid<Channel>(
    weights.channel,
    { left: 0.16, leftHalf: 0.34, central: 0.5, rightHalf: 0.66, right: 0.84 },
    0.5,
  );
  // Nearer the goal is nearer the TOP, so the attacking third is the small y.
  const y = centroid<Third>(weights.third, { attacking: 0.42, middle: 0.72, defensive: 0.94 }, 0.7);
  const spread = count > 1 ? (index - (count - 1) / 2) * (w * 0.055) : 0;
  const stagger = count > 1 ? (index % 2 === 0 ? -1 : 1) * (h * 0.045) : 0;
  return {
    x: Math.min(w - 12, Math.max(12, x * w + spread)),
    y: Math.min(h - 12, Math.max(14, y * h + stagger)),
  };
}

/**
 * The most receivers the picture will ever draw.
 *
 * THREE, not the five a career names, and this is a promise about odds rather
 * than a layout preference. A moment with nobody near him converts at 26.6%
 * (measured over 218 such chances) — good football odds for a man against a
 * goalkeeper. Drawing five team-mates around him reads as a five-against-one
 * that ought to be scored nine times in ten, so the picture was writing a
 * cheque the simulation had never agreed to cash, and the miss looked broken
 * rather than unlucky.
 *
 * The engine finds exactly ONE receiver when a pass comes off. Three is the
 * most that can be shown without implying an overload it does not model, and
 * it is also what a real chance looks like: a runner or two in support, not a
 * whole forward line.
 *
 * The fix belongs here and not in the conversion rate. 26.6% is defensible
 * football; five men in an empty box is not.
 */
export const MAX_RECEIVERS_DRAWN = 3;

/**
 * HOW MANY OF THE NAMED RECEIVERS ARE ACTUALLY OPTIONS RIGHT NOW.
 *
 * A career names five men the player would pass to, and the picture drew all
 * five on every moment that offered a pass — measured at 53% of interactive
 * events. The defender count, meanwhile, varies from none to four. So a chance
 * narrated as "bodies everywhere in the box, three defenders nearby" was drawn
 * as five free team-mates against three opponents: a picture claiming a 5v3
 * overload underneath a sentence saying he was crowded.
 *
 * The five are who he passes to IN GENERAL. Who is available in THIS moment is
 * fewer the more bodies are around him — a defender close enough to press is
 * close enough to sit in a passing lane. Tied to `nearbyDefenders` rather than
 * to the pressure scalar on purpose: that is the number the player can see on
 * the pitch, so the two halves of the picture can never disagree.
 *
 * NEVER BELOW ONE while one exists. The receivers are only drawn at all when a
 * pass or a cross is among the six, and a picture showing nobody to pass to
 * under an option labelled "square ball across" would be a worse contradiction
 * than the one this fixes.
 */
export function visibleReceiverCount(named: number, nearbyDefenders: number): number {
  const room = MAX_RECEIVERS_DRAWN - Math.floor(Math.max(0, nearbyDefenders) / 2);
  return Math.min(named, Math.max(Math.min(1, named), room));
}

/**
 * WHERE THE BALL IS AT A GIVEN FRACTION OF ITS FLIGHT.
 *
 * One place, so the ball and its trail can never disagree: the trail used to
 * walk a straight line from `from` to `to`, which on a two-legged flight drew
 * ghosts along a shortcut the ball never took.
 *
 * With `via` — a ONE-TWO, the only action where the ball leaves the player and
 * comes back — the path is two legs with the turn at the halfway mark, eased
 * WITHIN each leg rather than across both. Easing across both would glide the
 * ball smoothly through the wall as though he were not there; easing each leg
 * makes it arrive and leave again, which is what a one-two looks like.
 */
export function ballAlongPath(from: Point, to: Point, via: Point | undefined, progress: number): Point {
  const p = clamp01(progress);
  const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
  if (!via) return lerp(from, to, easeOut(p));
  const firstLeg = p < 0.5;
  const half = firstLeg ? p * 2 : (p - 0.5) * 2;
  return lerp(firstLeg ? from : via, firstLeg ? via : to, easeOut(half));
}

export class SituationRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  /** Bumped by every new animation so a superseded one stops drawing. */
  private animationToken = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || 480;
    this.height = rect.height || 260;
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /** Horizontal position (0-1) implied by the player's channel. */
  private channelX(state: RenderState): number {
    switch (state.context.zone.channel) {
      case 'left':
        return 0.16;
      case 'leftHalf':
        return 0.34;
      case 'central':
        return 0.5;
      case 'rightHalf':
        return 0.66;
      case 'right':
        return 0.84;
    }
  }

  /** Vertical position (0-1, 0 = goal line) implied by the zone. */
  private depthY(state: RenderState): number {
    const { zone } = state.context;
    if (zone.box === 'inside') return 0.55;
    if (zone.box === 'edge') return 0.7;
    return zone.third === 'attacking' ? 0.8 : 0.9;
  }

  /** Where the goal is aimed at: the centre of the mouth, on the goal line. */
  private goalMouth(): Point {
    return { x: this.width / 2, y: 6 };
  }

  /**
   * The receivers actually on the picture.
   *
   * Positions are computed for the WHOLE named squad and only then filtered, so
   * a given man stands in the same place whether two of them are drawn or five
   * — a spread that reshuffled with the count would have team-mates jumping
   * sideways as defenders arrive.
   *
   * The ones kept are the most advanced, because that is who the option labels
   * are talking about: "cut it back", "the far post", "square ball across" are
   * all balls played forward or level. See visibleReceiverCount.
   */
  private teammateSpots(state: RenderState): { spot: Point; name: string }[] {
    const mates = state.context.teammates;
    const all = mates.map((mate, index) => ({
      spot: teammateSpot(mate.position, index, mates.length, this.width, this.height),
      name: mate.name,
    }));
    const keep = visibleReceiverCount(all.length, state.context.nearbyDefenders);
    // Nearest the goal is the smallest y.
    return [...all].sort((a, b) => a.spot.y - b.spot.y).slice(0, keep);
  }

  /**
   * Where the move came from.
   *
   * The deepest man on the picture when there is one — somebody played it to
   * him, and it should come from a person rather than from the edge of the
   * frame — and deep and central otherwise, which is where a chance that names
   * nobody has come from anyway.
   */
  private moveOrigin(state: RenderState): Point {
    const { width: w, height: h } = this;
    const player = { x: this.channelX(state) * w, y: this.depthY(state) * h };
    if (state.showTeammates) {
      const spots = this.teammateSpots(state).map((entry) => entry.spot);
      const deepest = spots.reduce<Point | null>(
        (best, spot) => (best === null || spot.y > best.y ? spot : best),
        null,
      );
      // Only if he is far enough away to READ as a pass. A team-mate standing
      // a few pixels from the player is a truthful origin and a useless one:
      // the ball would arrive before the eye noticed it had set off, which is
      // the static picture this exists to replace.
      if (deepest && Math.hypot(deepest.x - player.x, deepest.y - player.y) > h * 0.28) {
        return deepest;
      }
    }
    // Nobody named: it still has to come from somewhere he is not already
    // standing. Straight down the pitch is the obvious answer and the wrong
    // one — a man already deep and central would have the ball spawn on his own
    // feet and never appear to travel at all. So it comes from BEHIND AND
    // ACROSS, off the opposite flank, which is both a real way a chance starts
    // and the one origin guaranteed to be visibly somewhere else.
    const side = Math.sign(player.x - w / 2) || 1;
    return {
      x: Math.min(w - 14, Math.max(14, w / 2 - side * w * 0.32)),
      y: Math.min(h - 10, player.y + h * 0.24),
    };
  }

  /** The ball at this player's feet, on the side facing the goal. */
  private ballAtFeet(playerX: number, playerY: number): Point {
    return ballAtFeet({ x: playerX, y: playerY }, this.goalMouth());
  }

  draw(
    state: RenderState,
    hidden: { ball?: boolean; player?: boolean; keeper?: boolean } = {},
  ): void {
    const { ctx, width: w, height: h } = this;
    const develop = clamp01(state.develop ?? 1);
    ctx.clearRect(0, 0, w, h);

    // --- pitch ---
    ctx.fillStyle = COLOURS.grass;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COLOURS.grassAlt;
    for (let i = 0; i < 6; i += 2) {
      ctx.fillRect(0, (i / 6) * h, w, h / 6);
    }

    // --- penalty area & six-yard box ---
    ctx.strokeStyle = COLOURS.line;
    ctx.lineWidth = 2;
    const boxW = w * 0.62;
    const boxH = h * 0.46;
    ctx.strokeRect((w - boxW) / 2, 0, boxW, boxH);
    const sixW = w * 0.3;
    const sixH = h * 0.2;
    ctx.strokeRect((w - sixW) / 2, 0, sixW, sixH);

    // penalty spot
    ctx.fillStyle = COLOURS.line;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.34, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // --- goal ---
    const goalW = w * 0.34;
    const goalX = (w - goalW) / 2;
    ctx.fillStyle = COLOURS.goal;
    ctx.fillRect(goalX, 0, goalW, 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let x = goalX; x <= goalX + goalW; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 8);
      ctx.stroke();
    }

    // --- goalkeeper ---
    if (state.showGoalkeeper && !hidden.keeper) {
      const keeper = this.keeperPosition(state, w, h, goalX, goalW);
      ctx.fillStyle = state.committed ? COLOURS.keeperCommitted : COLOURS.keeper;
      ctx.beginPath();
      ctx.ellipse(keeper.x, keeper.y, keeper.rx, keeper.ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // A ring pulses on the keeper the instant he commits, so the change is
      // impossible to miss in peripheral vision.
      if (state.committed) {
        ctx.strokeStyle = 'rgba(255,123,84,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(keeper.x, keeper.y, 14 + Math.sin(state.progress * 30) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // --- the player, wherever he has got to ---
    //
    // He starts the move deeper and arrives on his spot, which is what "runs
    // onto it" or "gets into the box" actually looks like.
    const settledX = this.channelX(state) * w;
    const settledY = this.depthY(state) * h;
    const playerX = settledX;
    // Clamped into the picture: a man who ends the move in his own half starts
    // it below the bottom edge otherwise, and vanishes for the first beat.
    const playerY = Math.min(h - 14, settledY + (1 - develop) * h * 0.18);

    // --- defenders, closing ---
    //
    // They begin the move further off him and converge as it develops, so the
    // number of bodies nearby reads as pressure ARRIVING rather than as
    // furniture that was always there.
    ctx.fillStyle = COLOURS.defender;
    for (let i = 0; i < state.context.nearbyDefenders; i++) {
      const spread = (i - (state.context.nearbyDefenders - 1) / 2) * (w * 0.13);
      const finalX = settledX + spread * 0.9;
      const finalY = settledY - h * (0.1 + (i % 2) * 0.07);
      // Twice the distance out at the start of the move, clamped so nobody is
      // pushed off the picture on a wide chance.
      const loose = 1 + (1 - develop) * 1.0;
      const dx = Math.min(w - 8, Math.max(8, playerX + (finalX - settledX) * loose));
      const dy = Math.min(h - 8, Math.max(8, playerY + (finalY - settledY) * loose));
      ctx.beginPath();
      ctx.arc(dx, dy, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- team-mates ---
    //
    // Hollow rather than filled, so they read as "on your side, not you" at a
    // glance and stay distinguishable from the player without a sixth hue.
    // Drawn BEFORE him, so a receiver standing close by never covers him up.
    if (state.showTeammates) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOURS.teammate;
      for (const { spot } of this.teammateSpots(state)) {
        // The whole shape pushes up with the move rather than standing still
        // while the ball comes forward past it.
        ctx.beginPath();
        ctx.arc(spot.x, spot.y + (1 - develop) * h * 0.1, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // --- player ---
    if (!hidden.player) {
      ctx.fillStyle = COLOURS.player;
      ctx.beginPath();
      ctx.arc(playerX, playerY, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!hidden.ball) {
      const settled = this.ballAtFeet(playerX, playerY);
      // THE BALL COMES TO HIM. It starts where the move started — the deepest
      // man on the pitch, or deep and central when nobody is named — and
      // arrives at his feet a little BEFORE the last beat, so it is under
      // control by the time the options appear rather than still rolling.
      const arrival = clamp01(develop / 0.82);
      const eased = 1 - (1 - arrival) * (1 - arrival);
      const origin = this.moveOrigin(state);
      const ball = {
        x: origin.x + (settled.x - origin.x) * eased,
        y: origin.y + (settled.y - origin.y) * eased,
      };
      // A short trail while it is travelling, for the same reason the
      // resolution has one: a four-pixel dot crossing a small pitch is a thing
      // you have to already be looking at to see.
      if (arrival < 1) {
        for (let i = 1; i <= 4; i++) {
          const back = Math.max(0, eased - i * 0.06);
          ctx.globalAlpha = (1 - i / 5) * 0.35;
          ctx.fillStyle = COLOURS.ball;
          ctx.beginPath();
          ctx.arc(
            origin.x + (settled.x - origin.x) * back,
            origin.y + (settled.y - origin.y) * back,
            3.5 * (1 - i / 7),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = COLOURS.ball;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // The keeper's state used to be painted here, at eleven pixels, in the
    // middle of the busiest part of the picture — the quietest element on
    // screen despite being the read the whole mechanic is about, and invisible
    // to a screen reader because this canvas is `aria-hidden` and cannot not
    // be. It is a DOM element beside the timer now. See ui/keeperStatus.ts.
    //
    // The picture keeps what a picture is for: where he is, and which way he
    // has gone. Saying it twice would only make both quieter.
  }

  private keeperPosition(
    state: RenderState,
    w: number,
    h: number,
    goalX: number,
    goalW: number,
  ): { x: number; y: number; rx: number; ry: number } {
    const centre = goalX + goalW / 2;
    const depth = state.context.goalkeeper.startingDepth;
    let x = centre;
    let y = h * (0.06 + depth * 0.12);
    let rx = 9;
    let ry = 11;

    switch (state.keeperAction) {
      case 'rushing':
        y = h * 0.33;
        rx = 11;
        ry = 13;
        break;
      case 'advancing':
        y = h * 0.2;
        break;
      case 'divingNear':
        x = centre - goalW * 0.3;
        rx = 14;
        ry = 8;
        break;
      case 'divingFar':
        x = centre + goalW * 0.3;
        rx = 14;
        ry = 8;
        break;
      case 'goingToGround':
        y = h * 0.26;
        rx = 18;
        ry = 7;
        break;
      case 'holdingLine':
        y = h * 0.06;
        break;
      default:
        break;
    }

    // Drift the keeper toward the ball's channel so angles read correctly.
    const bias = (this.channelX(state) - 0.5) * w * 0.25;
    return { x: x + bias, y, rx, ry };
  }

  // ------------------------------------------------------------ resolution ---

  /**
   * Which side of the goal the action aims at: -1 left, +1 right, 0 centre.
   * Near and far post are relative to where the player is standing, which is
   * why this needs the state and not just the action's name.
   */
  private aimDirection(state: RenderState, kind: ActionKind): number {
    const side = Math.sign(this.channelX(state) - 0.5);
    if (kind.includes('NearPost')) return side || -1;
    if (kind.includes('FarPost') || kind.includes('AcrossGoal')) return -(side || 1);
    if (kind.includes('Left')) return -1;
    if (kind.includes('Right')) return 1;
    return 0;
  }

  /** Where the defender nearest the ball is drawn — the same maths as draw(). */
  private nearestDefender(state: RenderState, w: number, h: number): { x: number; y: number } {
    const playerX = this.channelX(state) * w;
    const playerY = this.depthY(state) * h;
    const n = state.context.nearbyDefenders;
    if (n === 0) return { x: playerX, y: playerY - h * 0.18 };
    const i = Math.floor((n - 1) / 2);
    const spread = (i - (n - 1) / 2) * (w * 0.13);
    return { x: playerX + spread * 0.9, y: playerY - h * (0.1 + (i % 2) * 0.07) };
  }

  /**
   * Where the ball ends up, and what marks its arrival. The outcome decides
   * the destination; the action decides the flight. Nothing here is
   * information the player has not already been told — the outcome is chosen
   * before the first frame — it is the same fact, shown instead of stated.
   */
  private resolutionPlan(state: RenderState, cue: ResolutionCue): ResolutionPlan {
    const { width: w, height: h } = this;
    const playerX = this.channelX(state) * w;
    const playerY = this.depthY(state) * h;
    // The ball leaves from where it was drawn at his feet, not from a corner of
    // him: a flight that starts somewhere the ball never was reads as a jump.
    const from = this.ballAtFeet(playerX, playerY);
    const goalW = w * 0.34;
    const goalCentre = w / 2;
    const dir = this.aimDirection(state, cue.actionKind);
    const side = Math.sign(this.channelX(state) - 0.5) || 1;
    const lofted =
      cue.actionKind === 'chip' ||
      cue.family === 'cross' ||
      cue.family === 'header' ||
      cue.actionKind.includes('Whipped') ||
      cue.actionKind.includes('Curl');
    const loft = lofted ? 0.5 : 0.12;

    const plan = (
      to: { x: number; y: number },
      ringColour: string | null,
      extra: Partial<ResolutionPlan> = {},
    ): ResolutionPlan => ({
      from,
      to,
      loft,
      flight: 0.8,
      ringColour,
      netFlash: false,
      movePlayer: false,
      ...extra,
    });

    switch (cue.outcome) {
      case 'goal':
        return plan({ x: goalCentre + dir * goalW * 0.33, y: 6 }, '#facc15', {
          netFlash: true,
          flight: 0.75,
        });
      case 'saved': {
        const keeper = this.keeperPosition(state, w, h, goalCentre - goalW / 2, goalW);
        return plan({ x: keeper.x, y: keeper.y }, COLOURS.keeperCommitted, { flight: 0.75 });
      }
      case 'post':
        return plan({ x: goalCentre + (dir || side) * (goalW / 2), y: 6 }, COLOURS.goal, {
          flight: 0.75,
        });
      case 'missed':
        return plan({ x: goalCentre + (dir || side) * goalW * 0.85, y: -8 }, null, { flight: 0.8 });
      case 'blocked':
      case 'deflected':
      case 'dribbleFailed':
      case 'turnover':
      case 'foulCommitted':
      case 'passIntercepted':
        return plan(this.nearestDefender(state, w, h), COLOURS.defender, { flight: 0.6 });
      case 'chanceCreated':
      case 'passCompleted': {
        // A ONE-TWO IS TWO PASSES AND A RUN. Give it, go past him, take it
        // back — which is the whole reason to pick it over a plain pass, and
        // the picture drew it as a plain pass.
        if (cue.actionKind === 'oneTwo') {
          const wall = this.receiver(state, playerY);
          const runsTo = {
            x: playerX + (goalCentre - playerX) * 0.25,
            y: Math.max(h * 0.24, playerY - h * 0.22),
          };
          return plan(this.ballAtFeet(runsTo.x, runsTo.y), '#4ade80', {
            via: wall,
            playerRunsTo: runsTo,
            // Two legs and a run: it needs longer than a single ball.
            flight: 1.15,
            loft: 0.1,
          });
        }
        // To an actual man, and the same man the pitch has been showing for the
        // whole decision: a pass that lands on empty grass answers "did it
        // reach anybody" with a picture that says no.
        return plan(this.receiver(state, playerY), '#4ade80');
      }
      case 'crossCompleted':
        return plan(this.receiver(state, playerY, true), '#4ade80');
      case 'crossCleared':
        return plan(this.receiver(state, playerY, true), COLOURS.defender);
      case 'dribbleSuccess':
        return plan({ x: playerX + side * w * 0.08 + 10, y: playerY - h * 0.2 + 8 }, '#4ade80', {
          movePlayer: true,
        });
      case 'ballWon': {
        const defender = this.nearestDefender(state, w, h);
        return plan({ x: playerX + 10, y: playerY + 8 }, '#4ade80', {
          from: defender,
          flight: 0.6,
        });
      }
      case 'held':
        return plan({ x: playerX - 12, y: playerY + 6 }, '#4ade80', { flight: 0.45 });
    }
  }

  /**
   * Who the ball is going to.
   *
   * The most advanced team-mate on screen, because that is what a pass into a
   * chance means and it is the one the option labels are usually naming; for a
   * cross, the most advanced man in or near the box. Falls back to a point
   * ahead of the player when nobody is named — a defensive duel has no
   * receivers, and the flight still has to go somewhere.
   */
  private receiver(state: RenderState, playerY: number, intoBox = false): { x: number; y: number } {
    const spots = this.teammateSpots(state).map((entry) => entry.spot);
    if (spots.length > 0) {
      const furthestForward = spots.reduce((best, spot) => (spot.y < best.y ? spot : best));
      if (!intoBox) return furthestForward;
      // A cross ends IN THE BOX. The man is still the target, but he attacks
      // it rather than standing where he was: pulled most of the way to the
      // penalty spot, which is where a delivery is actually met.
      return {
        x: furthestForward.x + (this.width / 2 - furthestForward.x) * 0.7,
        y: Math.min(furthestForward.y, this.height * 0.3),
      };
    }
    const side = Math.sign(this.channelX(state) - 0.5) || 1;
    return {
      x: Math.min(this.width * 0.9, Math.max(this.width * 0.1, this.width * (0.5 - side * 0.32))),
      y: Math.max(14, playerY - this.height * 0.24),
    };
  }

  /**
   * Where the ball is at a given fraction of its flight.
   *
   * One place so the ball and its trail can never disagree — the trail used to
   * sample a straight line from `from` to `to`, which for a one-two drew a
   * ghost shortcut straight through the middle of a path the ball never took.
   */
  private ballAt(planned: ResolutionPlan, progress: number): Point {
    return ballAlongPath(planned.from, planned.to, planned.via, progress);
  }

  /**
   * A burst of confetti, thrown upward and outward from a point.
   *
   * Upward first and then falling, because that is what a thing thrown in
   * celebration does, and because a burst that only expands reads as an
   * explosion rather than as a party.
   */
  private throwSparks(from: Point, size: 'big' | 'small' | 'none'): Spark[] {
    if (size === 'none') return [];
    const count = size === 'big' ? 34 : 12;
    const speed = size === 'big' ? 165 : 110;
    // A goal lands ON the goal line, which is the top edge — so a burst thrown
    // from exactly there spends half of itself off-screen. Pushed down into the
    // frame far enough that the whole celebration is actually watchable.
    const origin = { x: from.x, y: Math.max(from.y, 26) };
    return Array.from({ length: count }, () => {
      // A full circle rather than an upward fan, for the same reason: gravity
      // then rains the whole burst back down across the pitch instead of
      // launching it out of the picture.
      const angle = Math.random() * Math.PI * 2;
      const power = speed * (0.35 + Math.random() * 0.8);
      return {
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * power,
        // Halved on the way up: it still reads as thrown, but it comes back.
        vy: Math.sin(angle) * power * 0.6,
        colour: SPARK_COLOURS[Math.floor(Math.random() * SPARK_COLOURS.length)]!,
      };
    });
  }

  /**
   * THE FOURTH PHASE: the resolution, animated.
   *
   * The three phases before a decision build tension a beat at a time — and
   * then the outcome used to arrive as a line of text. The read the whole
   * mechanic asks for is "which way has the keeper gone, and did I beat him?",
   * and that question deserves to be ANSWERED in the same picture it was asked
   * in: the ball flies, the keeper holds his dive, and it either goes past him
   * or it does not.
   *
   * Under a second, deliberately: the flight, an impact frame, and out. The
   * pause the match screen already takes after a decision absorbs it, so the
   * rhythm of a match is unchanged — this spends time that was already being
   * spent, on the one moment that earned it.
   *
   * `onImpact` fires the frame the ball arrives, so a caller can land a sound
   * on it. The promise resolves when the animation is done or superseded.
   */
  animateResolution(state: RenderState, cue: ResolutionCue, onImpact?: () => void): Promise<void> {
    const token = ++this.animationToken;
    const planned = this.resolutionPlan(state, cue);
    const celebration = cue.celebration ?? 'none';
    // A goal is held longer than anything else, because a goal is the only
    // thing in this game worth standing still for.
    const hold = celebration === 'big' ? 1.1 : celebration === 'small' ? 0.7 : 0.45;
    const started = performance.now();
    let impactFired = false;
    let sparks: Spark[] = [];

    // The keeper DIVES rather than teleporting. He used to be painted at his
    // committed position from the first frame, which is the one thing the
    // animation exists to show and the one thing it was not showing: a player
    // who decided before the commit saw him simply appear somewhere else. So
    // the base scene is drawn without him and he is interpolated here, from
    // where he was standing to where he ends up.
    const keeperFrom = this.keeperPosition(
      { ...state, keeperAction: 'set' },
      this.width,
      this.height,
      (this.width - this.width * 0.34) / 2,
      this.width * 0.34,
    );
    const keeperTo = this.keeperPosition(
      state,
      this.width,
      this.height,
      (this.width - this.width * 0.34) / 2,
      this.width * 0.34,
    );

    return new Promise((resolve) => {
      const frame = (): void => {
        if (token !== this.animationToken) {
          resolve();
          return;
        }
        const t = (performance.now() - started) / 1000;
        const progress = Math.min(1, t / planned.flight);
        // Ease-out: struck hard, arriving spent — the way a ball actually moves.
        const eased = 1 - (1 - progress) * (1 - progress);

        const { x, y } = this.ballAt(planned, progress);
        // Loft is faked with size: a ball above the turf reads bigger.
        const rise = Math.sin(eased * Math.PI) * planned.loft;
        const radius = 4.5 * (1 + rise * 1.6);

        this.draw(
          { ...state, progress: 1 },
          { ball: true, player: planned.movePlayer || !!planned.playerRunsTo, keeper: true },
        );

        const ctx = this.ctx;

        // The keeper, mid-dive. He commits FASTER than the ball travels, which
        // is what makes the read worth having: by the time it reaches him he
        // has already gone one way or the other.
        if (state.showGoalkeeper) {
          const k = Math.min(1, eased * 1.6);
          ctx.fillStyle = state.committed ? COLOURS.keeperCommitted : COLOURS.keeper;
          ctx.beginPath();
          ctx.ellipse(
            keeperFrom.x + (keeperTo.x - keeperFrom.x) * k,
            keeperFrom.y + (keeperTo.y - keeperFrom.y) * k,
            keeperFrom.rx + (keeperTo.rx - keeperFrom.rx) * k,
            keeperFrom.ry + (keeperTo.ry - keeperFrom.ry) * k,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }

        if (planned.movePlayer) {
          ctx.fillStyle = COLOURS.player;
          ctx.beginPath();
          ctx.arc(x - 10, y - 8, 9, 0, Math.PI * 2);
          ctx.fill();
        } else if (planned.playerRunsTo) {
          // He sets off the moment he has played it and is already there when
          // it comes back — the run IS the action, and a man standing still
          // waiting for a return pass has not played a one-two.
          const run = Math.min(1, progress / 0.75);
          ctx.fillStyle = COLOURS.player;
          ctx.beginPath();
          ctx.arc(
            planned.from.x + (planned.playerRunsTo.x - planned.from.x) * run,
            planned.from.y + (planned.playerRunsTo.y - planned.from.y) * run,
            9,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }

        // A TRAIL, because a four-pixel dot crossing a small pitch in under a
        // second is a thing you have to already be looking at to see. Five
        // fading ghosts along the path it has taken turn it into a line, which
        // is legible at a glance and reads as speed rather than decoration.
        for (let i = 1; i <= 5; i++) {
          const back = Math.max(0, progress - i * 0.045);
          ctx.globalAlpha = (1 - i / 6) * 0.4 * (progress < 1 ? 1 : 1 - Math.min(1, (t - planned.flight) / 0.2));
          ctx.fillStyle = COLOURS.ball;
          const ghost = this.ballAt(planned, back);
          ctx.beginPath();
          ctx.arc(ghost.x, ghost.y, radius * (1 - i / 8), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = COLOURS.ball;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (progress >= 1) {
          if (!impactFired) {
            impactFired = true;
            onImpact?.();
            // Thrown from where the ball finished, so the celebration comes out
            // of the moment rather than being pasted over it.
            sparks = this.throwSparks(planned.to, celebration);
          }
          const after = Math.min(1, (t - planned.flight) / hold);
          if (planned.ringColour) {
            ctx.strokeStyle = planned.ringColour;
            ctx.globalAlpha = 1 - after;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(planned.to.x, planned.to.y, 8 + after * 34, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          if (planned.netFlash) {
            const goalW = this.width * 0.34;
            ctx.fillStyle = '#facc15';
            ctx.globalAlpha = (1 - after) * 0.8;
            ctx.fillRect((this.width - goalW) / 2, 0, goalW, 10);
            ctx.globalAlpha = 1;
          }
          // The confetti, integrated per frame at a fixed step so it behaves
          // the same on a 60Hz screen and a 144Hz one.
          if (sparks.length > 0) {
            ctx.globalAlpha = Math.max(0, 1 - after);
            for (const spark of sparks) {
              spark.x += spark.vx * 0.016;
              spark.y += spark.vy * 0.016;
              spark.vy += 260 * 0.016;
              ctx.fillStyle = spark.colour;
              ctx.beginPath();
              ctx.arc(spark.x, spark.y, 2.4, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }

          if (after >= 1) {
            resolve();
            return;
          }
        }

        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }
}
