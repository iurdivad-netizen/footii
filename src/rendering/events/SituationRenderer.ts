import type { GoalkeeperAction } from '../../core/goalkeeper/goalkeeper.ts';
import type { SituationContext } from '../../core/events/types.ts';

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

const COLOURS = {
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

export class SituationRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

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

  draw(state: RenderState): void {
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
    if (state.showGoalkeeper) {
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
    ctx.fillStyle = COLOURS.player;
    ctx.beginPath();
    ctx.arc(playerX, playerY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOURS.ball;
    ctx.beginPath();
    ctx.arc(playerX + 10, playerY + 8, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // --- keeper status label ---
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.keeperLabel(state), w / 2, h * 0.5);
  }

  private keeperLabel(state: RenderState): string {
    if (!state.showGoalkeeper) return '';
    switch (state.keeperAction) {
      case 'rushing':
        return 'KEEPER RUSHING OUT';
      case 'advancing':
        return 'KEEPER ADVANCING';
      case 'divingNear':
        return 'KEEPER DIVES NEAR POST';
      case 'divingFar':
        return 'KEEPER DIVES FAR POST';
      case 'goingToGround':
        return 'KEEPER GOES TO GROUND';
      case 'holdingLine':
        return 'KEEPER ON HIS LINE';
      default:
        return 'KEEPER SET';
    }
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
}
