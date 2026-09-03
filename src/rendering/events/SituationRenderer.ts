import type { GoalkeeperAction } from '../../core/goalkeeper/goalkeeper.ts';
import type {
  ActionFamily,
  ActionKind,
  OutcomeKind,
  SituationContext,
} from '../../core/events/types.ts';

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
}

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

  draw(
    state: RenderState,
    hidden: { ball?: boolean; player?: boolean; keeper?: boolean } = {},
  ): void {
    const { ctx, width: w, height: h } = this;
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

    // --- defenders ---
    const playerX = this.channelX(state) * w;
    const playerY = this.depthY(state) * h;
    ctx.fillStyle = COLOURS.defender;
    for (let i = 0; i < state.context.nearbyDefenders; i++) {
      const spread = (i - (state.context.nearbyDefenders - 1) / 2) * (w * 0.13);
      const dx = playerX + spread * 0.9;
      const dy = playerY - h * (0.1 + (i % 2) * 0.07);
      ctx.beginPath();
      ctx.arc(dx, dy, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- player ---
    if (!hidden.player) {
      ctx.fillStyle = COLOURS.player;
      ctx.beginPath();
      ctx.arc(playerX, playerY, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!hidden.ball) {
      ctx.fillStyle = COLOURS.ball;
      ctx.beginPath();
      ctx.arc(playerX + 10, playerY + 8, 3.5, 0, Math.PI * 2);
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
    const from = { x: playerX + 10, y: playerY + 8 };
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
      case 'passCompleted':
        return plan(
          { x: Math.min(w * 0.9, Math.max(w * 0.1, w * (0.5 - side * 0.32))), y: playerY - h * 0.24 },
          '#4ade80',
        );
      case 'crossCompleted':
        return plan({ x: goalCentre - side * goalW * 0.3, y: h * 0.3 }, '#4ade80');
      case 'crossCleared':
        return plan({ x: goalCentre - side * goalW * 0.3, y: h * 0.3 }, COLOURS.defender);
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
    const hold = 0.45;
    const started = performance.now();
    let impactFired = false;

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

        const x = planned.from.x + (planned.to.x - planned.from.x) * eased;
        const y = planned.from.y + (planned.to.y - planned.from.y) * eased;
        // Loft is faked with size: a ball above the turf reads bigger.
        const rise = Math.sin(eased * Math.PI) * planned.loft;
        const radius = 4.5 * (1 + rise * 1.6);

        this.draw(
          { ...state, progress: 1 },
          { ball: true, player: planned.movePlayer, keeper: true },
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
        }

        // A TRAIL, because a four-pixel dot crossing a small pitch in under a
        // second is a thing you have to already be looking at to see. Five
        // fading ghosts along the path it has taken turn it into a line, which
        // is legible at a glance and reads as speed rather than decoration.
        for (let i = 1; i <= 5; i++) {
          const back = Math.max(0, eased - i * 0.055);
          ctx.globalAlpha = (1 - i / 6) * 0.4 * (progress < 1 ? 1 : 1 - Math.min(1, (t - planned.flight) / 0.2));
          ctx.fillStyle = COLOURS.ball;
          ctx.beginPath();
          ctx.arc(
            planned.from.x + (planned.to.x - planned.from.x) * back,
            planned.from.y + (planned.to.y - planned.from.y) * back,
            radius * (1 - i / 8),
            0,
            Math.PI * 2,
          );
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
