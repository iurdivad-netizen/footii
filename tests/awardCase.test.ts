import { describe, expect, it } from 'vitest';
import {
  CREATIVE_SEASON,
  DEFENSIVE_SEASON,
  awardCaseFor,
  caseSummary,
  madeHisCase,
} from '../src/core/career/awardCase.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import type { SeasonStats } from '../src/core/career/seasonStats.ts';
import type { LeagueBenchmark } from '../src/core/career/awards.ts';
import { OUTFIELD_POSITIONS } from '../src/core/player/positions.ts';
import type { Position } from '../src/core/player/positions.ts';

/**
 * A CENTRE BACK COULD NEVER WIN PLAYER OF THE SEASON.
 *
 * Not rarely — never. The award asked for `goals + assists` against the
 * division's leading attacker, whatever shirt you wore, which is a bar a
 * defender plays no part of the game near. A strange thing for a game that
 * lets you be a centre back to say.
 *
 * The rating bar is common to all three and unchanged. What differs is the
 * second requirement, measured in the currency the position actually deals in.
 */

const benchmark: LeagueBenchmark = { goldenBoot: 17, bestRating: 7.4, bestContributions: 25 };

/** A season shaped like the ones the engine actually produces per position. */
function season(over: Partial<SeasonStats>): SeasonStats {
  return { ...createSeasonStats(), matches: 34, minutes: 3000, ...over };
}

const made = (position: Position, stats: SeasonStats) =>
  madeHisCase({ position, stats, benchmark, played: 0.9 });

describe('who is judged how', () => {
  it('sorts every outfield position into a case', () => {
    for (const position of OUTFIELD_POSITIONS) {
      expect(['forward', 'midfielder', 'defender']).toContain(awardCaseFor(position));
    }
    expect(awardCaseFor('ST')).toBe('forward');
    expect(awardCaseFor('CM')).toBe('midfielder');
    expect(awardCaseFor('CB')).toBe('defender');
  });
});

describe('a defender can now make a case', () => {
  it('wins it on what he stopped', () => {
    // Measured: a centre back records ~87 tackles + interceptions across a
    // 38-match season, so a bar of 95 is an outstanding one rather than an
    // attendance prize.
    expect(made('CB', season({ tackles: 62, interceptions: 40 }))).toBe(true);
  });

  it('does not win it for turning up', () => {
    expect(made('CB', season({ tackles: 40, interceptions: 30 }))).toBe(false);
  });

  it('could not have won it at all before this existed', () => {
    // The old rule, restated: goals + assists against the division's best.
    const defensiveSeason = season({ tackles: 62, interceptions: 40, goals: 3, assists: 2 });
    expect(defensiveSeason.goals + defensiveSeason.assists).toBeLessThan(
      benchmark.bestContributions,
    );
    expect(made('CB', defensiveSeason)).toBe(true);
  });

  it('still rewards an overlapping full-back for his end product', () => {
    // Goals and assists have not stopped counting for a defender; they are
    // simply no longer the only thing that does.
    expect(made('LB', season({ goals: 8, assists: 18, tackles: 20, interceptions: 10 }))).toBe(true);
  });
});

describe('a midfielder is judged on what he creates', () => {
  it('wins it on assists and key passes without a striker\'s goals', () => {
    expect(made('CM', season({ goals: 6, assists: 14, keyPasses: 40 }))).toBe(true);
  });

  it('does not win it on volume alone', () => {
    expect(made('CM', season({ goals: 2, assists: 4, keyPasses: 20 }))).toBe(false);
  });

  it('still wins it if he scored like a forward', () => {
    expect(made('AM', season({ goals: 20, assists: 8, keyPasses: 5 }))).toBe(true);
  });
});

describe('a forward is judged exactly as he always was', () => {
  it('needs the division\'s best contributions, unchanged', () => {
    expect(made('ST', season({ goals: 20, assists: 6 }))).toBe(true);
    expect(made('ST', season({ goals: 14, assists: 6 }))).toBe(false);
  });

  it('gets no credit for tackling instead of scoring', () => {
    // The forward's ladder is the one that did not move.
    expect(made('ST', season({ tackles: 70, interceptions: 40, goals: 4 }))).toBe(false);
  });
});

describe('the division still sets the standard', () => {
  it('asks more of a defender in a better league, as it does of a striker', () => {
    const strong: LeagueBenchmark = { ...benchmark, bestContributions: 40 };
    const weak: LeagueBenchmark = { ...benchmark, bestContributions: 12 };
    const stats = season({ tackles: 55, interceptions: 35 });
    const at = (b: LeagueBenchmark) => madeHisCase({ position: 'CB', stats, benchmark: b, played: 0.9 });
    expect(at(weak)).toBe(true);
    expect(at(strong)).toBe(false);
  });

  it('never scales the bar away to nothing, or out of reach', () => {
    for (const bestContributions of [0, 1, 200]) {
      const stats = season({ tackles: 200, interceptions: 200 });
      expect(
        madeHisCase({ position: 'CB', stats, benchmark: { ...benchmark, bestContributions }, played: 0.9 }),
      ).toBe(true);
      const thin = season({ tackles: 1, interceptions: 1 });
      expect(
        madeHisCase({ position: 'CB', stats: thin, benchmark: { ...benchmark, bestContributions }, played: 0.9 }),
      ).toBe(false);
    }
  });

  it('keeps the bars in a sane order', () => {
    expect(DEFENSIVE_SEASON).toBeGreaterThan(CREATIVE_SEASON);
  });
});

describe('the honour explains itself in the terms that won it', () => {
  it('talks about tackles to a defender and goals to a striker', () => {
    const stats = season({ goals: 5, assists: 3, keyPasses: 30, tackles: 60, interceptions: 40 });
    expect(caseSummary('CB', stats)).toMatch(/tackles/);
    expect(caseSummary('CM', stats)).toMatch(/key passes/);
    expect(caseSummary('ST', stats)).toMatch(/goal contributions/);
  });
});
