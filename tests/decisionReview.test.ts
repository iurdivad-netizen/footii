import { describe, expect, it } from 'vitest';
import { MatchEngine } from '../src/simulation/MatchEngine.ts';
import type { InteractiveEvent } from '../src/simulation/MatchEngine.ts';
import { runMatchAutomatically } from '../src/simulation/AutoPlay.ts';
import { getGoalkeeperForTeam, getPreset, getTeam } from '../src/data/gameData.ts';
import { getAction } from '../src/data/actionCatalogue.ts';
import type { DecisionRecord } from '../src/core/match/matchState.ts';
import {
  READ_BEST_MARGIN,
  READ_CLEAR_GAP,
  keeperMattered,
  readOf,
  summariseDecisions,
  termBaseline,
  whatDecidedIt,
} from '../src/simulation/DecisionReview.ts';
import {
  keeperLine,
  readLine,
  renderDecisionReview,
  timeLine,
} from '../src/ui/decisionReview.ts';
import { windowSinceSeasonStart } from '../src/simulation/DecisionBenchmark.ts';
import { veteran } from './helpers.ts';

/**
 * The decision review is the game's only feedback on the thing it is built
 * around, so what matters is that it is TRUE (it describes the moment that was
 * actually resolved), RESTRAINED (it names an alternative only for a clear
 * miss), and FREE (recording it changes nothing about the match).
 */

function engineFor(seed: string, presetId = 'veteran-striker'): MatchEngine {
  const playerTeam = getTeam('vale-park');
  const opponent = getTeam('northport-city');
  return new MatchEngine(
    {
      player: getPreset(presetId).create(),
      playerTeam,
      opponent,
      opponentGoalkeeper: getGoalkeeperForTeam(opponent.id),
      ownGoalkeeper: getGoalkeeperForTeam(playerTeam.id),
      length: 90,
      playerTeamIsHome: true,
      paceScale: 1,
    },
    seed,
  );
}

/** Step to the next interactive moment, or null at full time. */
function nextEvent(engine: MatchEngine): InteractiveEvent | null {
  for (let i = 0; i < 10000; i++) {
    const update = engine.step();
    if (update.kind === 'finished') return null;
    if (update.kind === 'interactive') return update.event;
  }
  throw new Error('match did not finish');
}

const fitOf = (event: InteractiveEvent, kind: string) =>
  getAction(kind as never).fit(event.context);

function record(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    minute: 30,
    situation: 'oneOnOne',
    defending: false,
    chosen: { slot: 1, label: 'Shoot far post', family: 'shot' },
    expired: false,
    untimed: false,
    timeUsed: 4.2,
    window: 9.8,
    keeper: { commitAt: 3.1, action: 'divingNear', committedFirst: true },
    read: 'best',
    terms: [],
    outcome: 'saved',
    ...overrides,
  };
}

describe('the engine keeps a record of every moment', () => {
  it('records one decision per involvement, in order', () => {
    const engine = engineFor('review-1');
    runMatchAutomatically(engine, 'review-1');
    const { decisions, stats } = engine.state;
    expect(decisions.length).toBe(stats.involvements);
    expect(decisions.length).toBeGreaterThan(0);
    const minutes = decisions.map((d) => d.minute);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it('describes the moment that was actually resolved', () => {
    const engine = engineFor('review-2');
    const event = nextEvent(engine)!;
    const option = event.options[2]!;
    const commitAt = event.context.goalkeeper.commitAt;
    const resolution = engine.submitDecision({ option, timeUsed: commitAt + 0.1 });

    const [kept] = engine.state.decisions;
    expect(kept!.chosen.label).toBe(option.label);
    expect(kept!.outcome).toBe(resolution.result.outcome.kind);
    expect(kept!.terms).toEqual(resolution.result.breakdown.terms);
    expect(kept!.window).toBe(event.timer.seconds);
    expect(kept!.keeper.committedFirst).toBe(true);
    expect(kept!.expired).toBe(false);
  });

  it('knows when he went before the keeper', () => {
    const engine = engineFor('review-3');
    const event = nextEvent(engine)!;
    engine.submitDecision({ option: event.options[0]!, timeUsed: 0 });
    // commitAt is always inside the window and never at zero for a live keeper.
    expect(engine.state.decisions[0]!.keeper.committedFirst).toBe(
      0 >= event.context.goalkeeper.commitAt,
    );
  });

  it('records what instinct chose when the clock ran out', () => {
    const engine = engineFor('review-4');
    const event = nextEvent(engine)!;
    const resolution = engine.submitDecision({ option: null, timeUsed: event.timer.seconds });
    const kept = engine.state.decisions[0]!;
    expect(kept.expired).toBe(true);
    expect(kept.chosen.label).toBe(resolution.option.label);
    expect(kept.instinctReason).toBe(resolution.instinctReason);
    expect(readLine(kept)).toMatch(/^The clock ran out/);
  });

  it('changes nothing about the match itself', () => {
    // The read evaluates fit, which is pure — so the same seed still plays the
    // same match, and every seeded test in the suite still describes it.
    const a = engineFor('review-5');
    const b = engineFor('review-5');
    runMatchAutomatically(a, 'review-5');
    runMatchAutomatically(b, 'review-5');
    expect(a.scoreline()).toBe(b.scoreline());
    expect(a.rating()).toBe(b.rating());
    expect(a.state.decisions).toEqual(b.state.decisions);
  });
});

describe('the read is coarse on purpose', () => {
  it('calls the best-fitting option the right read', () => {
    const engine = engineFor('review-6');
    const event = nextEvent(engine)!;
    const best = [...event.options].sort(
      (x, y) => fitOf(event, y.kind) - fitOf(event, x.kind),
    )[0]!;
    expect(readOf(event.context, event.options, best).read).toBe('best');
  });

  it('names an alternative only when the gap is clear, and names the best one', () => {
    for (let seed = 0; seed < 40; seed++) {
      const engine = engineFor(`review-gap-${seed}`);
      const event = nextEvent(engine);
      if (!event) continue;
      const fits = event.options.map((o) => ({ option: o, fit: fitOf(event, o.kind) }));
      fits.sort((x, y) => y.fit - x.fit);
      for (const { option, fit } of fits) {
        const gap = fits[0]!.fit - fit;
        const { read, betterOption } = readOf(event.context, event.options, option);
        if (gap <= READ_BEST_MARGIN) expect(read).toBe('best');
        else if (gap <= READ_CLEAR_GAP) {
          expect(read).toBe('sound');
          expect(betterOption).toBeUndefined();
        } else {
          expect(read).toBe('better');
          expect(betterOption).toBe(fits[0]!.option.label);
        }
      }
    }
  });

  it('flags a clear miss on a minority of auto-played moments, not most of them', () => {
    // The guard on READ_CLEAR_GAP. Measured at 18% for this preset when the
    // threshold was set; a review that named an alternative on half of all
    // moments would be a nag, and one that never did would be decoration.
    const all: DecisionRecord[] = [];
    for (let i = 0; i < 60; i++) {
      const engine = engineFor(`review-cal-${i}`);
      runMatchAutomatically(engine, `review-cal-${i}`);
      all.push(...engine.state.decisions);
    }
    const share = all.filter((d) => d.read === 'better').length / all.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.3);
  });
});

describe('what decided it', () => {
  const baseline = { Execution: 0.06, Tempo: 0.01, Goalkeeper: -0.02, 'Defensive pressure': -0.05 };

  it('names what set this moment apart from the rest of the match', () => {
    const words = whatDecidedIt(
      record({
        terms: [
          { label: 'Execution', value: 0.06 },
          { label: 'Tempo', value: 0.05 },
          { label: 'Goalkeeper', value: -0.02 },
          { label: 'Defensive pressure', value: -0.11 },
        ],
      }),
      baseline,
    );
    expect(words).toEqual({ helped: 'deciding earlier', hurt: 'more pressure than usual' });
  });

  it('does not credit execution that was merely as good as always', () => {
    // The defect this replaced: a good player's execution is positive on every
    // row and pressure negative on every row, so judged against zero the same
    // two reasons appeared ten times a match.
    const typical = record({
      terms: [
        { label: 'Execution', value: 0.06 },
        { label: 'Tempo', value: 0.01 },
        { label: 'Goalkeeper', value: -0.02 },
        { label: 'Defensive pressure', value: -0.05 },
      ],
    });
    expect(whatDecidedIt(typical, baseline)).toEqual({});
  });

  it('never names decision fit, which the read line already covers', () => {
    const words = whatDecidedIt(
      record({ terms: [{ label: 'Decision fit', value: 0.3 }, { label: 'Tempo', value: 0.04 }] }),
      {},
    );
    expect(words).toEqual({ helped: 'deciding earlier' });
  });

  it('names nothing for a match of one moment', () => {
    const only = record({ terms: [{ label: 'Execution', value: 0.1 }, { label: 'Tempo', value: -0.1 }] });
    expect(whatDecidedIt(only, termBaseline([only]))).toEqual({});
  });

  it('varies from row to row on a real match', () => {
    const engine = engineFor('review-why');
    runMatchAutomatically(engine, 'review-why');
    const { decisions } = engine.state;
    const base = termBaseline(decisions);
    const lines = decisions.map((d) => JSON.stringify(whatDecidedIt(d, base)));
    // Not one sentence repeated down the page.
    expect(new Set(lines).size).toBeGreaterThan(Math.min(3, decisions.length - 1));
  });
});

describe('the keeper line', () => {
  it('appears for shots and headers, not for a pass or a tackle', () => {
    expect(keeperMattered(record())).toBe(true);
    expect(keeperMattered(record({ chosen: { slot: 2, label: 'Square it', family: 'pass' } }))).toBe(
      false,
    );
    expect(keeperMattered(record({ defending: true }))).toBe(false);
    expect(keeperLine(record({ chosen: { slot: 2, label: 'Square it', family: 'pass' } }))).toBe('');
  });

  it('says whether he went before or after the keeper', () => {
    expect(keeperLine(record())).toBe('after the keeper committed — gone near post');
    expect(
      keeperLine(record({ keeper: { commitAt: 3.1, action: 'rushing', committedFirst: false } })),
    ).toBe('before the keeper committed (rushing out at 3.1s)');
  });
});

describe('the full-time review', () => {
  it('renders nothing for a match with no moments', () => {
    expect(renderDecisionReview([])).toBe('');
  });

  it('renders a row per moment and a summary', () => {
    const html = renderDecisionReview([
      record(),
      record({ read: 'better', betterOption: 'Lift it over him', outcome: 'missed' }),
      record({ expired: true, instinctReason: 'he snatched at it', outcome: 'blocked' }),
    ]);
    expect(html.match(/<li class="decision /g)).toHaveLength(3);
    expect(html).toContain('3 decisions');
    expect(html).toContain('1 right read');
    expect(html).toContain('1 clear miss');
    expect(html).toContain('clock ran out once');
    expect(html).toContain('A better ball was on: Lift it over him');
    expect(html).toContain('read-expired');
  });

  it('reports time against the window, and says when there was no clock', () => {
    expect(timeLine(record())).toBe('4.2s of 9.8s');
    expect(timeLine(record({ untimed: true }))).toBe('4.2s, no clock');
  });

  it('counts waiting for the keeper only on shots', () => {
    const summary = summariseDecisions([
      record(),
      record({ keeper: { commitAt: 3, action: 'rushing', committedFirst: false } }),
      record({ chosen: { slot: 3, label: 'Pass', family: 'pass' } }),
    ]);
    expect(summary.keeperMoments).toBe(2);
    expect(summary.waitedForKeeper).toBe(1);
  });
});

describe('the decision window since the season began', () => {
  it('has not moved on the first day of a season', () => {
    const player = veteran();
    const { before, now } = windowSinceSeasonStart({
      player,
      seasonStartAttributes: { ...player.attributes },
      seasonStartExperience: player.experience,
    });
    expect(now).toBe(before);
  });

  it('widens as the attributes that set it grow', () => {
    const player = veteran();
    const start = { ...player.attributes, composure: player.attributes.composure - 10 };
    const { before, now } = windowSinceSeasonStart({
      player,
      seasonStartAttributes: start,
      seasonStartExperience: player.experience,
    });
    expect(now).toBeGreaterThan(before);
  });
});
