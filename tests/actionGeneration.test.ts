import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { OPTION_COUNT, generateActions } from '../src/simulation/ActionGenerator.ts';
import { SITUATION_TEMPLATES, getSituationTemplate } from '../src/data/situations.ts';
import { ACTION_CATALOGUE } from '../src/data/actionCatalogue.ts';
import type { SituationType } from '../src/core/events/types.ts';
import { context, goalkeeperState, keeper } from './helpers.ts';

describe('action catalogue integrity', () => {
  it('every action has execution weights that sum to 1', () => {
    for (const [kind, definition] of Object.entries(ACTION_CATALOGUE)) {
      const total = Object.values(definition.execution).reduce((a, b) => a + b, 0);
      expect(total, `${kind} execution weights`).toBeCloseTo(1, 5);
    }
  });

  it('every action has goalkeeper weights that sum to 1 (or none at all)', () => {
    for (const [kind, definition] of Object.entries(ACTION_CATALOGUE)) {
      const weights = Object.values(definition.gkAttributes);
      if (weights.length === 0) continue;
      expect(weights.reduce((a, b) => a + b, 0), `${kind} gk weights`).toBeCloseTo(1, 5);
    }
  });

  it('fit always returns a value in [0, 1] across a range of contexts', () => {
    const contexts = [
      context(),
      context({ nearbyDefenders: 4, defensivePressure: 1, situationQuality: 1 }),
      context({ nearbyDefenders: 0, defensivePressure: 0, situationQuality: 0 }),
      context({ zone: { channel: 'right', box: 'outside', third: 'middle' } }),
      context({ goalkeeper: goalkeeperState(keeper(), { action: 'rushing', startingDepth: 1 }) }),
      context({ goalkeeper: goalkeeperState(keeper(), { action: 'divingNear' }) }),
    ];
    for (const [kind, definition] of Object.entries(ACTION_CATALOGUE)) {
      for (const ctx of contexts) {
        const fit = definition.fit(ctx);
        expect(fit, `${kind} fit`).toBeGreaterThanOrEqual(0);
        expect(fit, `${kind} fit`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('action generation', () => {
  const types = Object.keys(SITUATION_TEMPLATES) as SituationType[];

  it('always produces exactly six uniquely numbered options for every situation', () => {
    for (const type of types) {
      const template = getSituationTemplate(type);
      for (let seed = 0; seed < 40; seed++) {
        const options = generateActions(new Rng(`gen-${seed}`), context({ situation: type }), template);
        expect(options, type).toHaveLength(OPTION_COUNT);
        expect(new Set(options.map((o) => o.slot))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
        expect(new Set(options.map((o) => o.kind)).size, `${type} duplicates`).toBe(OPTION_COUNT);
      }
    }
  });

  it('includes the guaranteed options that define each situation', () => {
    const template = getSituationTemplate('oneOnOne');
    for (let seed = 0; seed < 25; seed++) {
      const kinds = generateActions(new Rng(`g-${seed}`), context(), template).map((o) => o.kind);
      expect(kinds).toContain('chip');
      expect(kinds).toContain('roundKeeper');
    }
  });

  it('is deterministic for a fixed seed', () => {
    const template = getSituationTemplate('boxSideAttack');
    const ctx = context({ situation: 'boxSideAttack', zone: { channel: 'rightHalf' } });
    const a = generateActions(new Rng('fixed'), ctx, template);
    const b = generateActions(new Rng('fixed'), ctx, template);
    expect(a).toEqual(b);
  });

  it('varies the menu between events so options cannot be memorised by slot', () => {
    const template = getSituationTemplate('oneOnOne');
    const ctx = context();
    const layouts = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      layouts.add(
        generateActions(new Rng(`vary-${seed}`), ctx, template)
          .map((o) => o.kind)
          .join(','),
      );
    }
    expect(layouts.size).toBeGreaterThan(5);
  });

  it('drops options whose availability predicate fails', () => {
    const template = getSituationTemplate('throughBallRun');
    // cutBack requires a non-central zone.
    for (let seed = 0; seed < 30; seed++) {
      const kinds = generateActions(
        new Rng(`central-${seed}`),
        context({ situation: 'throughBallRun', zone: { channel: 'central' } }),
        template,
      ).map((o) => o.kind);
      expect(kinds).not.toContain('cutBack');
    }
  });

  it('offers contextual labels — near/far post depend on which side the player is', () => {
    const template = getSituationTemplate('boxSideAttack');
    const right = generateActions(
      new Rng('label'),
      context({ situation: 'boxSideAttack', zone: { channel: 'rightHalf' } }),
      template,
    ).find((o) => o.kind === 'shootFarPost');
    expect(right?.label).toBe('Far-post shot (left)');
  });
});
