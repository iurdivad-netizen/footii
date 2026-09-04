import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ballAtFeet,
  teammateSpot,
  visibleReceiverCount,
} from '../src/rendering/events/SituationRenderer.ts';
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

/**
 * THE MOVE HAS TO DEVELOP, NOT JUST EXIST.
 *
 * The build-up tells the story of a chance a beat at a time, and the pitch used
 * to sit perfectly still through all of it — three sentences describing a move
 * developing, over a photograph. The picture now arrives at the same situation
 * it always showed instead of starting there, which reveals nothing early and
 * is the whole point: `develop` ends at 1, where the old static frame was.
 *
 * The geometry itself is verified by eye (it is a canvas, and the node test
 * environment has none); what is pinned here is that nothing can quietly stop
 * feeding it, and the guards that keep men inside the frame.
 */
describe('the build-up develops', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const renderer = read('../src/rendering/events/SituationRenderer.ts');
  const overlay = read('../src/ui/components/EventOverlay.ts');

  it('is driven by how far through the narration the moment is', () => {
    expect(overlay).toMatch(/develop: this\.buildUpTime > 0 \? sinceShown \/ this\.buildUpTime : 1/);
  });

  it('settles at the situation every other caller already drew', () => {
    // Absent means 1, so the resolution replay and every static draw keep the
    // finished picture without knowing this feature exists.
    expect(renderer).toMatch(/clamp01\(state\.develop \?\? 1\)/);
  });

  it('keeps the player inside the picture at the start of his run', () => {
    // He ends some moves in his own half; dropping him back unclamped puts him
    // below the bottom edge and he vanishes for the first beat.
    expect(renderer).toMatch(/Math\.min\(h - 14, settledY \+ \(1 - develop\)/);
  });

  it('refuses an origin too close to read as a pass', () => {
    // A team-mate standing a few pixels away is a truthful origin and a useless
    // one: the ball would arrive before the eye noticed it had set off.
    expect(renderer).toMatch(/> h \* 0\.28/);
  });
});

/**
 * FIVE TEAM-MATES ON A CROWDED CHANCE IS A LIE.
 *
 * A career names five men the player passes to, and the picture drew all five
 * on every moment offering a pass — measured at 180 of 341 interactive events.
 * The defender count meanwhile runs from none to four, so a chance narrated as
 * "bodies everywhere in the box, three defenders nearby" was drawn as five free
 * team-mates against three opponents: a 5v3 overload under a sentence saying he
 * was crowded.
 */
describe('how many receivers are actually options', () => {
  const NAMED = 5;

  it('thins out as the bodies arrive', () => {
    expect(visibleReceiverCount(NAMED, 0)).toBe(5);
    expect(visibleReceiverCount(NAMED, 1)).toBe(4);
    expect(visibleReceiverCount(NAMED, 2)).toBe(3);
    expect(visibleReceiverCount(NAMED, 3)).toBe(2);
  });

  it('never leaves him with nobody to pass to', () => {
    // They are only drawn when a pass or a cross is among the six. A picture
    // showing no receivers under an option labelled "square ball across" would
    // be a worse contradiction than the one this fixes.
    for (let defenders = 0; defenders <= 8; defenders++) {
      expect(visibleReceiverCount(NAMED, defenders)).toBeGreaterThanOrEqual(2);
    }
  });

  it('never invents a man who is not in the squad', () => {
    // The floor is a floor on what EXISTS, not a promise of two: a career from
    // before team-mates were named carries none, and one carrying a single
    // receiver must not be drawn with a phantom beside him.
    expect(visibleReceiverCount(0, 0)).toBe(0);
    expect(visibleReceiverCount(0, 4)).toBe(0);
    expect(visibleReceiverCount(1, 4)).toBe(1);
    expect(visibleReceiverCount(2, 9)).toBe(2);
  });

  it('never grows with pressure', () => {
    for (let d = 1; d <= 6; d++) {
      expect(visibleReceiverCount(NAMED, d)).toBeLessThanOrEqual(visibleReceiverCount(NAMED, d - 1));
    }
  });

  it('is read off the defenders actually drawn, not a hidden scalar', () => {
    // The two halves of the picture cannot disagree if they read one number.
    const renderer = readFileSync(
      new URL('../src/rendering/events/SituationRenderer.ts', import.meta.url),
      'utf8',
    );
    expect(renderer).toMatch(/visibleReceiverCount\(all\.length, state\.context\.nearbyDefenders\)/);
  });

  it('keeps a man in the same place however many are drawn', () => {
    // Positions come from the whole named squad and are filtered afterwards; a
    // spread that reshuffled with the count would have team-mates jumping
    // sideways as defenders arrived.
    const withFive = teammateSpot('ST', 1, 5, W, H);
    const alsoWithFive = teammateSpot('ST', 1, 5, W, H);
    expect(withFive).toEqual(alsoWithFive);
    const renderer = readFileSync(
      new URL('../src/rendering/events/SituationRenderer.ts', import.meta.url),
      'utf8',
    );
    expect(renderer).toMatch(/teammateSpot\(mate\.position, index, mates\.length/);
  });
});
