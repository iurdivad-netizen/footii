import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ballAtFeet, teammateSpot } from '../src/rendering/events/SituationRenderer.ts';
import { OUTFIELD_POSITIONS } from '../src/core/player/positions.ts';

/**
 * THE PICTURE HAS TO AGREE WITH THE FOOTBALL.
 *
 * Two things it did not. The ball was pinned ten pixels right and eight DOWN of
 * the player in every situation, which put it on the far side of him from the
 * goal — a picture whose whole subject is "what can he do towards that goal",
 * showing him with it behind him. And the men he could pass to were named in
 * the option labels and drawn nowhere, so "square ball across" was a choice
 * about somebody the pitch had never shown.
 */

const W = 480;
const H = 240;
const GOAL = { x: W / 2, y: 6 };

describe('the ball at his feet', () => {
  it('sits between the player and the goal, never behind him', () => {
    for (const x of [40, 160, 240, 320, 440]) {
      for (const y of [60, 120, 200]) {
        const player = { x, y };
        const ball = ballAtFeet(player, GOAL);
        // Closer to the goal than the man is, in every channel and at every depth.
        expect(Math.hypot(GOAL.x - ball.x, GOAL.y - ball.y)).toBeLessThan(
          Math.hypot(GOAL.x - player.x, GOAL.y - player.y),
        );
      }
    }
  });

  it('is dead in front of a man in the middle', () => {
    const ball = ballAtFeet({ x: GOAL.x, y: 200 }, GOAL);
    expect(ball.x).toBeCloseTo(GOAL.x, 5);
    expect(ball.y).toBeLessThan(200);
  });

  it('angles infield for a man out wide, on both wings', () => {
    const left = ballAtFeet({ x: 40, y: 200 }, GOAL);
    const right = ballAtFeet({ x: 440, y: 200 }, GOAL);
    expect(left.x).toBeGreaterThan(40);
    expect(right.x).toBeLessThan(440);
  });

  it('clears the player\'s own disc, so it is a ball and not a highlight', () => {
    const player = { x: 200, y: 180 };
    const ball = ballAtFeet(player, GOAL);
    // The player is drawn at radius 9; the ball's centre must be outside it.
    expect(Math.hypot(ball.x - player.x, ball.y - player.y)).toBeGreaterThan(9);
  });

  it('does not divide by zero when the man is standing on the goal line', () => {
    const ball = ballAtFeet({ ...GOAL }, GOAL);
    expect(Number.isFinite(ball.x)).toBe(true);
    expect(Number.isFinite(ball.y)).toBe(true);
  });
});

describe('where a team-mate stands', () => {
  it('keeps every position inside the pitch it is drawn on', () => {
    for (const position of OUTFIELD_POSITIONS) {
      for (let i = 0; i < 5; i++) {
        const spot = teammateSpot(position, i, 5, W, H);
        expect(spot.x).toBeGreaterThanOrEqual(12);
        expect(spot.x).toBeLessThanOrEqual(W - 12);
        expect(spot.y).toBeGreaterThanOrEqual(14);
        expect(spot.y).toBeLessThanOrEqual(H - 12);
      }
    }
  });

  it('puts a forward nearer the goal than a defender', () => {
    // The goal is at the top, so nearer means a smaller y.
    expect(teammateSpot('ST', 0, 1, W, H).y).toBeLessThan(teammateSpot('CB', 0, 1, W, H).y);
    expect(teammateSpot('ST', 0, 1, W, H).y).toBeLessThan(teammateSpot('CM', 0, 1, W, H).y);
  });

  it('puts the wingers on opposite flanks, and both wide of the middle', () => {
    const left = teammateSpot('LW', 0, 1, W, H);
    const right = teammateSpot('RW', 0, 1, W, H);
    expect(left.x).toBeLessThan(W / 2);
    expect(right.x).toBeGreaterThan(W / 2);
    expect(Math.abs(left.x - W / 2)).toBeGreaterThan(W * 0.1);
  });

  it('never stacks two men on the same pixel', () => {
    // Five strikers is not a real team sheet, but it is the worst case for the
    // spread — if identical positions separate, anything else does.
    const spots = [0, 1, 2, 3, 4].map((i) => teammateSpot('ST', i, 5, W, H));
    const seen = new Set(spots.map((s) => `${Math.round(s.x)}:${Math.round(s.y)}`));
    expect(seen.size).toBe(spots.length);
  });

  it('breaks the row up in depth as well as across', () => {
    // Four men on one horizontal line read as a defensive wall, not as options.
    const ys = [0, 1, 2, 3].map((i) => teammateSpot('ST', i, 4, W, H).y);
    expect(new Set(ys).size).toBeGreaterThan(1);
  });
});

describe('when receivers are drawn at all', () => {
  const overlay = readFileSync(
    new URL('../src/ui/components/EventOverlay.ts', import.meta.url),
    'utf8',
  );

  it('only on moments where giving it to somebody is one of the six', () => {
    // Same rule the keeper follows: a man drawn on a moment he takes no part in
    // is information about nothing.
    expect(overlay).toMatch(/family === 'pass' \|\| option\.family === 'cross'/);
    expect(overlay).toMatch(/teammates\.length > 0/);
  });

  it('names them in the key only when they are on the picture', () => {
    expect(overlay).toMatch(/renderPitchKey\(this\.showTeammates\)/);
  });

  it('keeps them on the pitch for the replay the ball flies across', () => {
    expect(overlay).toMatch(/showTeammates: this\.showTeammates/);
  });
});
