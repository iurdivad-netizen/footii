import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BIG_CHANCE,
  CHEAP_LOSS,
  celebrationSize,
  crowdReaction,
} from '../src/ui/crowdReaction.ts';
import type { CrowdMood } from '../src/ui/crowdReaction.ts';
import { OUTCOME_LABELS } from '../src/core/events/types.ts';
import type { OutcomeKind } from '../src/core/events/types.ts';

/**
 * A CROWD IS ONLY WORTH HAVING IF IT CAN BE QUIET.
 *
 * The ground swelled while a chance built and settled afterwards, but had no
 * opinion on what happened: a tap-in and a hopeless shank were met by the same
 * room. The trap in fixing that is reacting to everything — a crowd that cheers
 * the four hundredth sideways pass has nothing left for a goal, and the goal is
 * the thing this whole game is pointed at.
 *
 * So the tests that matter most here are the ones about SILENCE.
 */

const ALL: OutcomeKind[] = Object.keys(OUTCOME_LABELS) as OutcomeKind[];
const SITTER = 0.9;
const HALF_CHANCE = 0.5;
const NOTHING_ON = 0.15;

describe('what the ground makes of it', () => {
  it('stands up for a goal, and for nothing else', () => {
    expect(crowdReaction('goal', NOTHING_ON).mood).toBe('ovation');
    const ovations = ALL.filter((kind) => crowdReaction(kind, SITTER).mood === 'ovation');
    expect(ovations).toEqual(['goal']);
  });

  it('says nothing at all about a completed pass', () => {
    // The single most important rule in this file.
    expect(crowdReaction('passCompleted', SITTER).mood).toBe('silent');
    expect(crowdReaction('held', SITTER).mood).toBe('silent');
  });

  it('boos a sitter put wide, and forgives a speculative one', () => {
    expect(crowdReaction('missed', SITTER).mood).toBe('jeer');
    expect(crowdReaction('missed', NOTHING_ON).mood).toBe('sigh');
  });

  it('boos the ball given away when there was something on', () => {
    for (const kind of ['turnover', 'dribbleFailed', 'passIntercepted'] as OutcomeKind[]) {
      expect(crowdReaction(kind, SITTER).mood).toBe('jeer');
      // Losing it where nothing was on is just football, not a crime.
      expect(crowdReaction(kind, NOTHING_ON).mood).toBe('silent');
      expect(crowdReaction(kind, HALF_CHANCE).mood).toBe('sigh');
    }
  });

  it('always reacts to the woodwork, whatever the chance was worth', () => {
    // The loudest noise in football that is not a goal.
    expect(crowdReaction('post', NOTHING_ON).mood).toBe('sigh');
    expect(crowdReaction('post', SITTER).mood).toBe('sigh');
  });

  it('cheers the tackle and the beaten man', () => {
    expect(crowdReaction('ballWon', NOTHING_ON).mood).toBe('cheer');
    expect(crowdReaction('dribbleSuccess', NOTHING_ON).mood).toBe('cheer');
    expect(crowdReaction('chanceCreated', NOTHING_ON).mood).toBe('cheer');
  });

  it('stays quiet more often than it speaks, across the whole outcome table', () => {
    // Not an arbitrary ratio: if most football produced a reaction, the
    // reactions would be wallpaper. Measured at a middling chance, which is
    // what most moments actually are.
    const silent = ALL.filter((kind) => crowdReaction(kind, HALF_CHANCE).mood === 'silent');
    expect(silent.length).toBeGreaterThanOrEqual(ALL.length / 3);
  });

  it('has something to say whenever it is not silent, and nothing when it is', () => {
    for (const kind of ALL) {
      for (const quality of [NOTHING_ON, HALF_CHANCE, SITTER]) {
        const reaction = crowdReaction(kind, quality);
        if (reaction.mood === 'silent') expect(reaction.caption).toBe('');
        else expect(reaction.caption.length).toBeGreaterThan(0);
      }
    }
  });

  it('never gets louder as the chance gets worse', () => {
    // Sanity on the thresholds: a better chance may escalate a reaction, never
    // soften it into approval.
    const rank: Record<CrowdMood, number> = { silent: 0, sigh: 1, jeer: 2, cheer: 1, ovation: 2 };
    for (const kind of ['missed', 'turnover', 'dribbleFailed', 'passIntercepted'] as OutcomeKind[]) {
      const poor = rank[crowdReaction(kind, NOTHING_ON).mood];
      const good = rank[crowdReaction(kind, SITTER).mood];
      expect(good).toBeGreaterThanOrEqual(poor);
    }
  });

  it('puts its thresholds in a sane order', () => {
    expect(CHEAP_LOSS).toBeLessThan(BIG_CHANCE);
    expect(BIG_CHANCE).toBeLessThan(1);
    expect(CHEAP_LOSS).toBeGreaterThan(0);
  });

  it('covers every outcome the engine can produce', () => {
    // A new outcome kind must not fall through to undefined.
    for (const kind of ALL) {
      expect(crowdReaction(kind, HALF_CHANCE).mood).toBeTruthy();
    }
  });
});

describe('how big a party the picture throws', () => {
  it('saves the big one for a goal', () => {
    expect(celebrationSize('ovation')).toBe('big');
    expect(celebrationSize('cheer')).toBe('small');
  });

  it('throws nothing for a groan, a boo, or silence', () => {
    expect(celebrationSize('sigh')).toBe('none');
    expect(celebrationSize('jeer')).toBe('none');
    expect(celebrationSize('silent')).toBe('none');
  });
});

describe('where the reaction is used', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('is the overlay that asks, at resolution time', () => {
    const overlay = read('../src/ui/components/EventOverlay.ts');
    expect(overlay).toMatch(/crowdReaction\(outcome, this\.resolutionQuality\)/);
    expect(overlay).toMatch(/celebration: celebrationSize\(reaction\.mood\)/);
  });

  it('lands the crowd a beat after the ball, not on top of it', () => {
    const overlay = read('../src/ui/components/EventOverlay.ts');
    expect(overlay).toMatch(/setTimeout\(\(\) => this\.showCrowd/);
  });

  it('still reacts when the replay is switched off', () => {
    // Turning replays off loses movement, never the game's reactions.
    const overlay = read('../src/ui/components/EventOverlay.ts');
    const skip = overlay.slice(overlay.indexOf('if (!scene || !shouldReplay'));
    expect(skip.slice(0, 400)).toMatch(/showCrowd\(reaction\.mood, reaction\.caption\)/);
  });

  it('leaves the ball its own noise, separate from the crowd', () => {
    // They used to be one cue, so a goal roared at the instant of contact.
    const engine = read('../src/audio/SoundEngine.ts');
    const outcomeFn = engine.slice(engine.indexOf('outcome(kind: OutcomeKind)'));
    expect(outcomeFn.slice(0, 900)).not.toMatch(/this\.roar\(\)|this\.groan\(\)/);
    expect(engine).toMatch(/reaction\(mood:/);
    expect(engine).toMatch(/whistles\(\)/);
  });
});
