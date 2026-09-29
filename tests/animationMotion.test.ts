import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  INTERCEPT_AT,
  MAX_SPARK_STEP,
  SPARK_GRAVITY,
  opponentReaction,
  stepSpark,
} from '../src/rendering/events/resolutionMotion.ts';
import type { ReactionInput, Spark } from '../src/rendering/events/resolutionMotion.ts';
import { SituationRenderer } from '../src/rendering/events/SituationRenderer.ts';
import type { RenderState, ResolutionCue } from '../src/rendering/events/SituationRenderer.ts';
import { newLineCount, scoreChange } from '../src/ui/matchFeedback.ts';
import { context, goalkeeperState } from './helpers.ts';

/**
 * THE REPLAY, LOOKED AT FRAME BY FRAME.
 *
 * Found by capturing it rather than reading it: the confetti ran at the speed of
 * the screen, and every opponent on the pitch stood perfectly still while the
 * ball and the player moved. These pin both, and the match screen's two silent
 * changes — a goal that only changed a number, and a feed that could not animate.
 */

const W = 480;
const H = 250;

describe('the confetti moves by the time that passed', () => {
  const fresh = (): Spark => ({ x: 100, y: 60, vx: 80, vy: -90, colour: '#fff' });

  /** Fly a spark for `seconds` at a given refresh rate. */
  function fly(hz: number, seconds: number): Spark {
    const spark = fresh();
    const frames = Math.round(seconds * hz);
    for (let i = 0; i < frames; i++) stepSpark(spark, 1 / hz);
    return spark;
  }

  it('ends up in the same place on a 60Hz screen and a 144Hz one', () => {
    const slow = fly(60, 1);
    const fast = fly(144, 1);
    // Semi-implicit Euler differs by g*dt/2 per second between the two rates —
    // a pixel or so on a canvas this size — and that is the whole difference.
    expect(Math.abs(slow.x - fast.x)).toBeLessThan(1);
    expect(Math.abs(slow.y - fast.y)).toBeLessThan(3);
  });

  it('is the bug it replaced, shown: a fixed step per frame diverges by the refresh ratio', () => {
    const oldStep = (hz: number, seconds: number): number => {
      const spark = fresh();
      for (let i = 0; i < Math.round(seconds * hz); i++) {
        spark.x += spark.vx * 0.016;
        spark.y += spark.vy * 0.016;
        spark.vy += 260 * 0.016;
      }
      return spark.x - 100;
    };
    // 144Hz got 2.4 times the distance, which is what threw it off the canvas.
    expect(oldStep(144, 1) / oldStep(60, 1)).toBeGreaterThan(2);
    // And the new one does not.
    expect((fly(144, 1).x - 100) / (fly(60, 1).x - 100)).toBeCloseTo(1, 1);
  });

  it('falls under gravity and drifts at constant horizontal speed', () => {
    const spark = { x: 0, y: 0, vx: 50, vy: 0, colour: '#fff' };
    stepSpark(spark, 0.02);
    stepSpark(spark, 0.02);
    expect(spark.x).toBeCloseTo(50 * 0.04, 6);
    expect(spark.vy).toBeCloseTo(SPARK_GRAVITY * 0.04, 6);
    expect(spark.y).toBeGreaterThan(0);
  });

  it('treats a long pause as a pause, not as time spent flying', () => {
    // A tab in the background resumes with one enormous gap.
    const spark = fresh();
    stepSpark(spark, 30);
    expect(Math.abs(spark.x - 100)).toBeLessThanOrEqual(80 * MAX_SPARK_STEP + 1e-9);
  });

  it('does not move backwards on a negative step', () => {
    const spark = fresh();
    stepSpark(spark, -1);
    expect(spark.x).toBe(100);
  });

  it('is no longer written as a fixed step in the renderer', () => {
    const renderer = readFileSync(
      new URL('../src/rendering/events/SituationRenderer.ts', import.meta.url),
      'utf8',
    );
    expect(renderer).not.toMatch(/0\.016/);
  });
});

describe('the opponents react to how it ended', () => {
  const base: ReactionInput = {
    outcome: 'ballWon',
    actionKind: 'stepInAndTackle',
    opponent: { x: 240, y: 120 },
    player: { x: 240, y: 160 },
    ballFrom: { x: 240, y: 150 },
    side: 1,
    width: W,
    height: H,
    defendingOwnGoal: false,
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  it('has the man who lost the ball recoil from the man who took it', () => {
    const { opponentTo } = opponentReaction(base);
    expect(opponentTo).toBeDefined();
    expect(dist(opponentTo!, base.player)).toBeGreaterThan(dist(base.opponent, base.player));
    // and does not also redirect the ball: it goes to the player as it always did
    expect(opponentReaction(base).ballTo).toBeUndefined();
  });

  it('recoils from a player who is off to one side, and along that line', () => {
    const { opponentTo } = opponentReaction({ ...base, player: { x: 200, y: 160 } });
    expect(opponentTo!.x).toBeGreaterThan(base.opponent.x);
  });

  it('does not divide by zero when they stand on the same pixel', () => {
    const { opponentTo } = opponentReaction({ ...base, opponent: { ...base.player } });
    expect(Number.isFinite(opponentTo!.x)).toBe(true);
    expect(Number.isFinite(opponentTo!.y)).toBe(true);
  });

  it('leaves a beaten defender wrong-footed the way the player did not go, and behind', () => {
    for (const side of [-1, 1] as const) {
      const { opponentTo } = opponentReaction({ ...base, outcome: 'dribbleSuccess', side });
      expect(Math.sign(opponentTo!.x - base.opponent.x)).toBe(-side);
      // Further from the goal end of the picture than he started: left behind.
      expect(opponentTo!.y).toBeGreaterThan(base.opponent.y);
    }
  });

  it('gets an interceptor to the ball on the lane, not beside the passer', () => {
    const receiver = { x: 400, y: 60 };
    const { opponentTo, ballTo } = opponentReaction({
      ...base,
      outcome: 'passIntercepted',
      receiver,
    });
    expect(ballTo).toEqual(opponentTo);
    const expected = {
      x: base.ballFrom.x + (receiver.x - base.ballFrom.x) * INTERCEPT_AT,
      y: base.ballFrom.y + (receiver.y - base.ballFrom.y) * INTERCEPT_AT,
    };
    expect(opponentTo!.x).toBeCloseTo(expected.x, 6);
    expect(opponentTo!.y).toBeCloseTo(expected.y, 6);
  });

  it('still has an interceptor step in when there is nobody to pass to', () => {
    const { opponentTo, ballTo } = opponentReaction({ ...base, outcome: 'passIntercepted' });
    expect(opponentTo).toBeDefined();
    expect(ballTo).toEqual(opponentTo);
  });

  it('has a successful challenge step in and take the ball', () => {
    for (const outcome of ['dribbleFailed', 'foulCommitted'] as const) {
      const { opponentTo, ballTo } = opponentReaction({ ...base, outcome });
      expect(dist(opponentTo!, base.player)).toBeLessThan(dist(base.opponent, base.player));
      expect(ballTo).toEqual(opponentTo);
    }
  });

  it('has an attacker go PAST a defender who lost the duel, towards the goal behind him', () => {
    for (const side of [-1, 1] as const) {
      const { opponentTo, ballTo } = opponentReaction({
        ...base,
        outcome: 'turnover',
        defendingOwnGoal: true,
        side,
      });
      // Own goal is at the bottom: past him means a larger y than he stands on.
      expect(opponentTo!.y).toBeGreaterThan(base.player.y);
      expect(Math.sign(opponentTo!.x - base.player.x)).toBe(side);
      expect(ballTo).toEqual(opponentTo);
    }
  });

  it('has an attacking turnover step in like any other lost ball', () => {
    const { opponentTo } = opponentReaction({ ...base, outcome: 'turnover' });
    expect(dist(opponentTo!, base.player)).toBeLessThan(dist(base.opponent, base.player));
  });

  it('leaves him where he is for a shot, a block or a deflection', () => {
    for (const outcome of ['goal', 'saved', 'missed', 'post', 'blocked', 'deflected', 'held'] as const) {
      expect(opponentReaction({ ...base, outcome })).toEqual({});
    }
  });

  it('never animates anybody off the edge of the picture', () => {
    const corner = { ...base, opponent: { x: 10, y: 10 }, player: { x: 12, y: 30 } };
    for (const outcome of ['ballWon', 'dribbleSuccess', 'passIntercepted', 'dribbleFailed', 'turnover'] as const) {
      for (const side of [-1, 1] as const) {
        const { opponentTo } = opponentReaction({ ...corner, outcome, side, defendingOwnGoal: true });
        expect(opponentTo!.x).toBeGreaterThanOrEqual(8);
        expect(opponentTo!.x).toBeLessThanOrEqual(W - 8);
        expect(opponentTo!.y).toBeGreaterThanOrEqual(8);
        expect(opponentTo!.y).toBeLessThanOrEqual(H - 8);
      }
    }
  });
});

describe('the renderer wires the reaction into the plan', () => {
  // The renderer needs a canvas. A stub whose context swallows every call is
  // enough to ask it WHAT it would draw, which is the question here.
  const noop = new Proxy(() => undefined, { get: () => noop, apply: () => undefined });
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key) => (key === 'canvas' ? undefined : noop),
    set: () => true,
  });
  const canvas = {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: W, height: H }),
    width: 0,
    height: 0,
  } as unknown as HTMLCanvasElement;
  const globals = globalThis as { window?: unknown };
  let saved: unknown;

  beforeEach(() => {
    saved = globals.window;
    globals.window = { devicePixelRatio: 1 };
  });
  afterEach(() => {
    globals.window = saved;
  });

  const scene = (over: Parameters<typeof context>[0]): RenderState => ({
    context: context({ goalkeeper: goalkeeperState(), ...over }),
    progress: 1,
    committed: false,
    keeperAction: 'set',
    showGoalkeeper: false,
  });
  const plan = (state: RenderState, cue: Partial<ResolutionCue>) =>
    (
      new SituationRenderer(canvas) as unknown as {
        resolutionPlan: (s: RenderState, c: ResolutionCue) => Record<string, unknown>;
      }
    ).resolutionPlan(state, {
      outcome: 'ballWon',
      actionKind: 'stepInAndTackle',
      family: 'defend',
      ...cue,
    });

  const defending = scene({
    situation: 'defensiveDuel',
    zone: { third: 'defensive', channel: 'central', box: 'edge' },
    nearbyDefenders: 0,
  });

  it('moves the man he tackled, even with nobody counted nearby', () => {
    const p = plan(defending, { outcome: 'ballWon' });
    expect(p.opponentFrom).toBeDefined();
    expect(p.opponentTo).toBeDefined();
  });

  it('sends the ball to the interceptor when the pass is cut out', () => {
    const attack = scene({
      situation: 'midfieldProgression',
      zone: { third: 'middle', channel: 'central', box: 'outside' },
      nearbyDefenders: 2,
    });
    const p = plan(attack, {
      outcome: 'passIntercepted',
      actionKind: 'squarePass',
      family: 'pass',
    });
    expect(p.to).toEqual(p.opponentTo);
  });

  it('leaves a goal alone', () => {
    const attack = scene({
      situation: 'oneOnOne',
      zone: { third: 'attacking', channel: 'central', box: 'inside' },
      nearbyDefenders: 1,
    });
    const p = plan(attack, { outcome: 'goal', actionKind: 'shootCentre', family: 'shot' });
    expect(p.opponentTo).toBeUndefined();
  });

  it('does not conjure a defender the picture never drew', () => {
    const empty = scene({
      situation: 'oneOnOne',
      zone: { third: 'attacking', channel: 'central', box: 'inside' },
      nearbyDefenders: 0,
    });
    const p = plan(empty, { outcome: 'dribbleFailed', actionKind: 'takeOnDefender', family: 'dribble' });
    expect(p.opponentTo).toBeUndefined();
  });
});

describe('what is new on the match screen', () => {
  it('counts the lines that arrived since the last draw', () => {
    const a = { text: 'a' };
    const b = { text: 'b' };
    const c = { text: 'c' };
    expect(newLineCount([a, b, c], a)).toBe(2);
    expect(newLineCount([a, b, c], b)).toBe(1);
    expect(newLineCount([a, b, c], c)).toBe(0);
  });

  it('announces nothing on the first draw', () => {
    expect(newLineCount([{ text: 'a' }, { text: 'b' }], null)).toBe(0);
  });

  it('says one line arrived when the last one seen has scrolled out of the buffer', () => {
    expect(newLineCount([{ text: 'x' }, { text: 'y' }], { text: 'gone' })).toBe(1);
  });

  it('tells two identical sentences apart, because they are different lines', () => {
    const first = { text: 'Full time.' };
    const second = { text: 'Full time.' };
    expect(newLineCount([first, second], first)).toBe(1);
  });

  it('never claims more new lines than the feed shows', () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ text: String(i) }));
    expect(newLineCount(lines, lines[0]!, 14)).toBe(14);
  });

  it('copes with an empty feed', () => {
    expect(newLineCount([], { text: 'a' })).toBe(0);
  });

  it('sees a goal for and a goal against, and neither when nothing moved', () => {
    expect(scoreChange({ own: 0, opponent: 0 }, { own: 1, opponent: 0 })).toBe('for');
    expect(scoreChange({ own: 1, opponent: 0 }, { own: 1, opponent: 1 })).toBe('against');
    expect(scoreChange({ own: 1, opponent: 1 }, { own: 1, opponent: 1 })).toBeNull();
  });

  it('gives the flash to his own goal when both changed in one draw', () => {
    expect(scoreChange({ own: 0, opponent: 0 }, { own: 1, opponent: 1 })).toBe('for');
  });
});

describe('the match screen and stylesheet carry it', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const screen = readFileSync(
    new URL('../src/ui/screens/MatchScreen.ts', import.meta.url),
    'utf8',
  );

  it('flashes the score for a goal and against one, in the goal and danger hues', () => {
    expect(css).toMatch(/\.score\.flash-for\s*\{[^}]*animation:\s*score-for/);
    expect(css).toMatch(/\.score\.flash-against\s*\{[^}]*animation:\s*score-against/);
    expect(css).toMatch(/@keyframes score-for[\s\S]*?var\(--goal\)/);
    expect(css).toMatch(/@keyframes score-against[\s\S]*?var\(--danger\)/);
  });

  it('leaves no resting state on the flash, so reduced motion leaves the score as it was', () => {
    // Only an animation: cutting animations to nothing then removes the whole
    // effect rather than stranding the score in a colour.
    const flashRules = css.match(/\.score\.flash-(for|against)\s*\{[^}]*\}/g) ?? [];
    expect(flashRules).toHaveLength(2);
    for (const rule of flashRules) expect(rule).not.toMatch(/(^|[;{\s])color:/);
  });

  it('animates only the line that has just arrived', () => {
    expect(css).toMatch(/\.commentary li\.entering\s*\{[^}]*animation:\s*feed-in/);
    expect(screen).toMatch(/newLineCount\(/);
    expect(screen).toMatch(/index < fresh \? ' entering'/);
  });

  it('restarts the flash so two goals in a row both show', () => {
    expect(screen).toMatch(/classList\.remove\('flash-for', 'flash-against'\)/);
    expect(screen).toMatch(/offsetWidth/);
  });

  it('does not flash on a match opened part-way through', () => {
    expect(screen).toMatch(/this\.shownScore = \{/);
    expect(screen).toMatch(/this\.lastLine = engine\.state\.commentary/);
  });
});
