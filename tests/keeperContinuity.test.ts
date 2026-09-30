import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SituationRenderer } from '../src/rendering/events/SituationRenderer.ts';
import type { RenderState, ResolutionCue } from '../src/rendering/events/SituationRenderer.ts';
import { PITCH, keeperOnScreenAt, keeperX } from '../src/rendering/events/pitchLayout.ts';
import type { GoalkeeperAction } from '../src/core/goalkeeper/goalkeeper.ts';
import { COLOURS } from '../src/rendering/events/SituationRenderer.ts';
import { MatchEngine } from '../src/simulation/MatchEngine.ts';
import { getGoalkeeperForTeam, getPreset, getTeam } from '../src/data/gameData.ts';
import { context, goalkeeperState } from './helpers.ts';

/**
 * THE KEEPER DOES NOT RESET WHEN YOU CHOOSE.
 *
 * Reported from playing: the keeper commits — rushes out, dives — the player
 * picks an option, and the replay sends him back to his starting position and
 * moves him again. The replay began every keeper from the standing position
 * regardless of what the player had just watched him do.
 *
 * The test that matters drives the REAL animation frame by frame through a
 * recording canvas and looks at where the keeper is drawn. Nothing short of that
 * would have caught it: every function involved was individually correct.
 */

const W = 480;
const H = 250;

interface KeeperDraw {
  x: number;
  y: number;
  rotation: number;
  fill: string;
}

describe('the replay carries on from where the keeper was', () => {
  const calls: KeeperDraw[] = [];
  const queue: (() => void)[] = [];
  let now = 0;
  const g = globalThis as Record<string, unknown>;
  let saved: Record<string, unknown> = {};

  beforeEach(() => {
    calls.length = 0;
    queue.length = 0;
    now = 0;
    saved = {
      window: g.window,
      requestAnimationFrame: g.requestAnimationFrame,
      cancelAnimationFrame: g.cancelAnimationFrame,
    };
    g.window = { devicePixelRatio: 1 };
    g.requestAnimationFrame = (callback: () => void) => queue.push(callback);
    g.cancelAnimationFrame = () => undefined;
    vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    g.window = saved.window;
    g.requestAnimationFrame = saved.requestAnimationFrame;
    g.cancelAnimationFrame = saved.cancelAnimationFrame;
  });

  /** A canvas that remembers every keeper drawn on it and the colour it was drawn in. */
  function canvas(): HTMLCanvasElement {
    const noop = new Proxy(() => undefined, { get: () => noop, apply: () => undefined });
    const store: Record<string, unknown> = {};
    const ctx = new Proxy(store, {
      get: (target, key) =>
        key === 'ellipse'
          ? (x: number, y: number, _rx: number, _ry: number, rotation: number) =>
              calls.push({ x, y, rotation, fill: String(target.fillStyle) })
          : key in target
            ? target[key as string]
            : noop,
      set: (target, key, value) => {
        target[key as string] = value;
        return true;
      },
    });
    return {
      getContext: () => ctx,
      getBoundingClientRect: () => ({ width: W, height: H }),
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;
  }

  const scene = (over: Partial<RenderState> = {}): RenderState => ({
    context: context({
      situation: 'boxSideAttack',
      zone: { channel: 'right', box: 'inside' },
      nearbyDefenders: 1,
      goalkeeper: goalkeeperState(undefined, { committedAction: 'divingNear' }),
    }),
    progress: 1,
    committed: true,
    keeperAction: 'divingNear',
    showGoalkeeper: true,
    ...over,
  });

  const cue: ResolutionCue = { outcome: 'saved', actionKind: 'shootNearPost', family: 'shot' };

  /** Run the replay and return the keeper as drawn on each frame. */
  function replay(state: RenderState, frames = 40, dt = 1 / 60): KeeperDraw[] {
    const renderer = new SituationRenderer(canvas());
    void renderer.animateResolution(state, cue);
    for (let i = 0; i < frames; i++) {
      now += dt;
      const run = queue.splice(0);
      for (const frame of run) frame();
    }
    return [...calls];
  }

  const centre = W / 2;
  const goalW = W * PITCH.goalW;
  const dive = keeperX('divingNear', 0.84, centre, goalW);
  // A standing keeper is not at dead centre: he shades towards the ball.
  const stance = keeperX('set', 0.84, centre, goalW);

  it('does not send a keeper who had already dived back to his stance', () => {
    const draws = replay(scene({ keeperBefore: 'divingNear' }));
    expect(draws.length).toBeGreaterThan(10);
    // The bug, in one number: the first frame was drawn at his stance and the
    // dive was then performed again. He must already be where he was.
    expect(Math.abs(draws[0]!.x - dive)).toBeLessThan(1.5);
    expect(Math.abs(draws[0]!.x - stance)).toBeGreaterThan(8);
    // And he stays there: no frame of the replay sends him back towards it.
    for (const draw of draws) expect(Math.abs(draw.x - dive)).toBeLessThan(1.5);
  });

  it('keeps his lean as well as his position', () => {
    const draws = replay(scene({ keeperBefore: 'divingNear' }));
    const lean = draws[0]!.rotation;
    expect(lean).not.toBe(0);
    for (const draw of draws) expect(draw.rotation).toBeCloseTo(lean, 5);
  });

  it('keeps him orange, since he is already committed and the player has seen it', () => {
    const draws = replay(scene({ keeperBefore: 'divingNear' }));
    expect(draws[0]!.fill).toBe(COLOURS.keeperCommitted);
  });

  it('still dives from his stance for a player who chose before he moved', () => {
    const draws = replay(scene({ keeperBefore: 'set' }));
    // Standing on the first frame, at the dive by the last, and going one way.
    expect(Math.abs(draws[0]!.x - stance)).toBeLessThan(1.5);
    expect(Math.abs(draws[draws.length - 1]!.x - dive)).toBeLessThan(1.5);
    for (let i = 1; i < draws.length; i++) {
      expect(draws[i]!.x).toBeGreaterThanOrEqual(draws[i - 1]!.x - 1e-6);
    }
  });

  it('keeps him yellow until he actually sets off, instead of orange from frame one', () => {
    const draws = replay(scene({ keeperBefore: 'set' }));
    expect(draws[0]!.fill).toBe(COLOURS.keeper);
    expect(draws[draws.length - 1]!.fill).toBe(COLOURS.keeperCommitted);
  });

  it('treats a caller that does not say as "he had not moved", which is what they meant', () => {
    const omitted = replay(scene());
    calls.length = 0;
    queue.length = 0;
    now = 0;
    const explicit = replay(scene({ keeperBefore: 'set' }));
    expect(omitted.map((d) => d.x)).toEqual(explicit.map((d) => d.x));
  });

  it('does the same for a keeper who rushed out', () => {
    const rush = scene({
      context: context({
        situation: 'oneOnOne',
        zone: { channel: 'central', box: 'inside' },
        nearbyDefenders: 1,
        goalkeeper: goalkeeperState(undefined, { committedAction: 'rushing' }),
      }),
      keeperAction: 'rushing',
      keeperBefore: 'rushing',
    });
    const draws = replay(rush);
    // Out at the edge of the six-yard box from the first frame, not back on his line.
    const rushedY = H * 0.33;
    expect(Math.abs(draws[0]!.y - rushedY)).toBeLessThan(2);
    for (const draw of draws) expect(Math.abs(draw.y - rushedY)).toBeLessThan(2);
  });
});

describe('what was on screen is one rule, shared', () => {
  const keeper = { action: 'set', committedAction: 'rushing', commitAt: 2.5 } as const;

  it('is the standing keeper until the commit and the committed one from it', () => {
    expect(keeperOnScreenAt(keeper, 0)).toBe('set');
    expect(keeperOnScreenAt(keeper, 2.49)).toBe('set');
    expect(keeperOnScreenAt(keeper, 2.5)).toBe('rushing');
    expect(keeperOnScreenAt(keeper, 9)).toBe('rushing');
  });

  it('agrees with the engine about a choice made either side of the commit', () => {
    // If the picture and the engine ever disagreed about whether he had gone, a
    // player would see one keeper and be resolved against another.
    for (let seed = 0; seed < 30; seed++) {
      for (const offset of [-0.05, 0, 0.05]) {
        const playerTeam = getTeam('vale-park');
        const opponent = getTeam('northport-city');
        const engine = new MatchEngine(
          {
            player: getPreset('veteran-striker').create(),
            playerTeam,
            opponent,
            opponentGoalkeeper: getGoalkeeperForTeam(opponent.id),
            ownGoalkeeper: getGoalkeeperForTeam(playerTeam.id),
            length: 90,
            playerTeamIsHome: true,
            paceScale: 1,
          },
          `continuity-${seed}`,
        );
        let event = null as ReturnType<MatchEngine['step']> | null;
        for (let i = 0; i < 10000; i++) {
          event = engine.step();
          if (event.kind !== 'background') break;
        }
        if (!event || event.kind !== 'interactive' || !event.event.template.goalkeeperInvolved) continue;
        const gk = event.event.context.goalkeeper;
        const time = Math.max(0, gk.commitAt + offset);
        const shown: GoalkeeperAction = keeperOnScreenAt(
          { action: gk.action, committedAction: gk.committedAction, commitAt: gk.commitAt },
          time,
        );
        engine.submitDecision({ option: event.event.options[0]!, timeUsed: time });
        // The engine applies the commit by this same comparison.
        expect(gk.action).toBe(shown);
      }
    }
  });

  it('is what the overlay draws with and what it hands the replay', () => {
    const overlay = readFileSync(
      new URL('../src/ui/components/EventOverlay.ts', import.meta.url),
      'utf8',
    );
    expect(overlay).toMatch(/const keeperAction = keeperOnScreenAt\(event\.context\.goalkeeper, elapsed\)/);
    expect(overlay).toMatch(
      /keeperBefore: keeperInvolved \? keeperOnScreenAt\(event\.context\.goalkeeper, timeUsed\) : 'set'/,
    );
  });

  it('is read before the engine applies the commit, not after', () => {
    const overlay = readFileSync(
      new URL('../src/ui/components/EventOverlay.ts', import.meta.url),
      'utf8',
    );
    const finish = overlay.slice(overlay.indexOf('private finish('));
    // The scene is built before `settle` hands the decision to the engine.
    expect(finish.indexOf('keeperBefore:')).toBeGreaterThan(-1);
    expect(finish.indexOf('keeperBefore:')).toBeLessThan(finish.indexOf('settle?.('));
  });
});
