import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { chooseInstinctiveAction } from '../src/simulation/InstinctiveAction.ts';
import { generateActions } from '../src/simulation/ActionGenerator.ts';
import { getSituationTemplate } from '../src/data/situations.ts';
import { getAction } from '../src/data/actionCatalogue.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { context, goalkeeperState, keeper } from './helpers.ts';

const template = getSituationTemplate('oneOnOne');

function instinctProfile(player: ReturnType<typeof createPlayer>, runs = 1200) {
  const ctx = context({
    player,
    goalkeeper: goalkeeperState(keeper(), { action: 'rushing', startingDepth: 0.9 }),
  });
  const options = generateActions(new Rng('options'), ctx, template);
  const families: Record<string, number> = {};
  let fitTotal = 0;

  for (let i = 0; i < runs; i++) {
    const { option } = chooseInstinctiveAction(new Rng(`inst-${i}`), ctx, options);
    families[option.family] = (families[option.family] ?? 0) + 1;
    fitTotal += getAction(option.kind).fit(ctx);
  }
  return { families, averageFit: fitTotal / runs, options };
}

describe('instinctive action on timer expiry', () => {
  it('always returns one of the six presented options', () => {
    const ctx = context();
    const options = generateActions(new Rng('opts'), ctx, template);
    for (let i = 0; i < 200; i++) {
      const { option } = chooseInstinctiveAction(new Rng(`pick-${i}`), ctx, options);
      expect(options).toContain(option);
    }
  });

  it('a composed, intelligent player instinctively picks better options than a poor decision-maker', () => {
    const smart = createPlayer({
      name: 'Smart',
      position: 'ST',
      baseAttribute: 60,
      attributes: { composure: 92, decisionMaking: 92 },
    });
    const rash = createPlayer({
      name: 'Rash',
      position: 'ST',
      baseAttribute: 60,
      attributes: { composure: 15, decisionMaking: 15 },
    });
    expect(instinctProfile(smart).averageFit).toBeGreaterThan(instinctProfile(rash).averageFit);
  });

  it('a natural finisher instinctively shoots more often than a natural dribbler', () => {
    const finisher = createPlayer({
      name: 'Finisher',
      position: 'ST',
      baseAttribute: 55,
      attributes: { finishing: 95, shooting: 95, dribbling: 20 },
    });
    const dribbler = createPlayer({
      name: 'Dribbler',
      position: 'ST',
      baseAttribute: 55,
      attributes: { finishing: 20, shooting: 20, dribbling: 95 },
    });

    const finisherShots = instinctProfile(finisher).families['shot'] ?? 0;
    const dribblerShots = instinctProfile(dribbler).families['shot'] ?? 0;
    const dribblerDribbles = instinctProfile(dribbler).families['dribble'] ?? 0;
    const finisherDribbles = instinctProfile(finisher).families['dribble'] ?? 0;

    expect(finisherShots).toBeGreaterThan(dribblerShots);
    expect(dribblerDribbles).toBeGreaterThan(finisherDribbles);
  });

  it('a panicking player reaches for riskier actions than a composed one', () => {
    const risk = (composure: number) => {
      const player = createPlayer({
        name: 'P',
        position: 'ST',
        baseAttribute: 60,
        attributes: { composure, decisionMaking: 55 },
      });
      const ctx = context({ player });
      const options = generateActions(new Rng('risk-options'), ctx, template);
      let total = 0;
      const runs = 1500;
      for (let i = 0; i < runs; i++) {
        const { option } = chooseInstinctiveAction(new Rng(`risk-${i}`), ctx, options);
        total += getAction(option.kind).risk;
      }
      return total / runs;
    };
    expect(risk(10)).toBeGreaterThan(risk(90));
  });

  it('gives a reason suitable for commentary', () => {
    const ctx = context();
    const options = generateActions(new Rng('reason'), ctx, template);
    const { reason } = chooseInstinctiveAction(new Rng('r'), ctx, options);
    expect(reason.length).toBeGreaterThan(5);
  });

  it('is deterministic for a fixed seed', () => {
    const ctx = context();
    const options = generateActions(new Rng('det'), ctx, template);
    const a = chooseInstinctiveAction(new Rng('same-seed'), ctx, options);
    const b = chooseInstinctiveAction(new Rng('same-seed'), ctx, options);
    expect(a.option).toEqual(b.option);
    expect(a.reason).toBe(b.reason);
  });
});
