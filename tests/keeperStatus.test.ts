import { describe, expect, it } from 'vitest';
import { keeperStatus } from '../src/ui/keeperStatus.ts';
import type { GoalkeeperAction } from '../src/core/goalkeeper/goalkeeper.ts';
import { GOALKEEPER_ACTION_LABELS } from '../src/core/goalkeeper/goalkeeper.ts';

const ACTIONS = Object.keys(GOALKEEPER_ACTION_LABELS) as GoalkeeperAction[];

describe('what the keeper is doing, in words', () => {
  it('has something to say about every state he can be in', () => {
    // Driven off the model's own key list rather than a copy, so a new keeper
    // action cannot be added without this failing.
    expect(ACTIONS.length).toBeGreaterThan(1);
    for (const action of ACTIONS) {
      const status = keeperStatus(action);
      expect(status.label.length, action).toBeGreaterThan(0);
    }
  });

  it('treats exactly one state as not yet committed', () => {
    // The whole mechanic: every second you wait is a second closer to knowing
    // which of the others it turned out to be, and a second less to act on it.
    const uncommitted = ACTIONS.filter((action) => !keeperStatus(action).committed);
    expect(uncommitted).toEqual(['set']);
  });

  it('says nothing helpful while he is still deciding', () => {
    // There is nothing to read yet, and inventing a line would be telling the
    // player something the game does not know.
    expect(keeperStatus('set').tell).toBe('');
  });

  it('names the consequence once he has moved, without giving advice', () => {
    for (const action of ACTIONS) {
      const status = keeperStatus(action);
      if (!status.committed) continue;
      expect(status.tell.length, action).toBeGreaterThan(0);
      // It describes the pitch, never the player's next move. "Shoot far post"
      // would be the game playing itself.
      expect(status.tell.toLowerCase(), action).not.toMatch(/\byou should\b|\bshoot\b|\bpass\b/);
    }
  });

  it('points a diving keeper at the side he has left open', () => {
    expect(keeperStatus('divingNear').tell.toLowerCase()).toContain('far post');
    expect(keeperStatus('divingFar').tell.toLowerCase()).toContain('near post');
  });

  it('gives each committed state its own words', () => {
    // Two keepers doing different things must not read identically — the read
    // is the whole game, and a shared label would quietly delete half of it.
    const labels = ACTIONS.map((action) => keeperStatus(action).label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
