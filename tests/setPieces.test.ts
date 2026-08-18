import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { resolveAction } from '../src/simulation/ActionResolver.ts';
import { generateActions } from '../src/simulation/ActionGenerator.ts';
import { createGoalkeeperState } from '../src/simulation/SituationGenerator.ts';
import { generateBuildUp } from '../src/data/buildUp.ts';
import { ACTION_CATALOGUE, getAction } from '../src/data/actionCatalogue.ts';
import { SITUATION_TEMPLATES, getSituationTemplate } from '../src/data/situations.ts';
import type { ActionKind, SituationType } from '../src/core/events/types.ts';
import type { GoalkeeperAction } from '../src/core/goalkeeper/goalkeeper.ts';
import { context, goalkeeperState, keeper, playerAt, prospect, veteran } from './helpers.ts';
import type { ContextOverrides } from './helpers.ts';

/**
 * Set pieces and the two new defensive archetypes.
 *
 * The interesting assertions here are not "does it run" but "does the read pay".
 * A penalty is the purest expression of the commit mechanic in the game, so the
 * gap between waiting for the keeper and guessing is what these tests protect.
 */

function option(kind: ActionKind) {
  const definition = getAction(kind);
  return {
    slot: 1,
    kind,
    label: definition.label,
    family: definition.family,
    generationFit: 0.5,
  };
}

/** Convert `kind` this often, out of 2000 attempts, in the given context. */
function conversionRate(kind: ActionKind, overrides: ContextOverrides, runs = 2000): number {
  let goals = 0;
  for (let i = 0; i < runs; i++) {
    const result = resolveAction(new Rng(`conv-${kind}-${i}`), context(overrides), {
      option: option(kind),
      timeUsed: 1.6,
      window: 3.2,
      expired: false,
    });
    if (result.outcome.goalScored) goals++;
  }
  return goals / runs;
}

/** A penalty as the generator would build it, with the keeper in a given state. */
function penaltyContext(gkAction: GoalkeeperAction, player = veteran()): ContextOverrides {
  return {
    situation: 'penalty',
    player,
    situationQuality: 0.9,
    nearbyDefenders: 0,
    defensivePressure: 0,
    goalkeeper: goalkeeperState(keeper(), { action: gkAction }),
  };
}

describe('penalties', () => {
  it('converts at roughly the rate real penalties do', () => {
    const rate = conversionRate('penaltyPlaced', penaltyContext('divingNear'));
    expect(rate).toBeGreaterThan(0.68);
    expect(rate).toBeLessThan(0.88);
  });

  it('rewards waiting for the keeper far more than any technique does', () => {
    // The same action, the same player: the only difference is whether the
    // keeper had already committed when the decision was made.
    const waited = conversionRate('penaltyOpenBody', penaltyContext('divingFar'));
    const guessed = conversionRate('penaltyOpenBody', penaltyContext('set'));

    expect(waited).toBeGreaterThan(0.7);
    expect(guessed).toBeLessThan(0.5);
    expect(waited).toBeGreaterThan(guessed * 1.6);
  });

  it('punishes a panenka against a keeper who stood up', () => {
    const gone = conversionRate('penaltyPanenka', penaltyContext('goingToGround'));
    const stoodUp = conversionRate('penaltyPanenka', penaltyContext('holdingLine'));

    expect(gone).toBeGreaterThan(0.6);
    expect(stoodUp).toBeLessThan(0.35);
  });

  it('is a big chance, so getting it wrong costs the rating', () => {
    const meanRating = (gkAction: GoalkeeperAction) => {
      let total = 0;
      const runs = 600;
      let bigChancesMissed = 0;
      for (let i = 0; i < runs; i++) {
        const ctx = context(penaltyContext(gkAction));
        const result = resolveAction(new Rng(`pen-rate-${gkAction}-${i}`), ctx, {
          option: option('penaltyPanenka'),
          timeUsed: 1.6,
          window: 3.2,
          expired: false,
        });
        total += result.outcome.ratingDelta;
        if (result.outcome.stats.bigChancesMissed) bigChancesMissed++;
      }
      return { rating: total / runs, bigChancesMissed };
    };

    // A penalty always clears the big-chance bar, so a miss is recorded as one.
    const stoodUp = meanRating('holdingLine');
    expect(stoodUp.bigChancesMissed).toBeGreaterThan(0);
    expect(stoodUp.rating).toBeLessThan(meanRating('goingToGround').rating);
  });

  it('gives a young taker a worse penalty than an experienced one', () => {
    expect(conversionRate('penaltyPlaced', penaltyContext('divingNear', veteran()))).toBeGreaterThan(
      conversionRate('penaltyPlaced', penaltyContext('divingNear', prospect())),
    );
  });

  it('puts the keeper on his line — he dives, he does not rush out', () => {
    const seen = new Set<GoalkeeperAction>();
    let dives = 0;
    const runs = 500;
    for (let i = 0; i < runs; i++) {
      const state = createGoalkeeperState(new Rng(`pk-gk-${i}`), keeper(), 'penalty', 3.2);
      seen.add(state.committedAction);
      if (state.committedAction === 'divingNear' || state.committedAction === 'divingFar') dives++;
    }
    expect(seen.has('rushing')).toBe(false);
    expect(seen.has('advancing')).toBe(false);
    // He commits far more often than he stands up, which is what makes waiting
    // the right instinct — and standing up the trap for the panenka.
    expect(dives / runs).toBeGreaterThan(0.5);
  });
});

describe('direct free kicks', () => {
  const freeKickContext: ContextOverrides = {
    situation: 'freeKickDirect',
    situationQuality: 0.45,
    nearbyDefenders: 2,
    defensivePressure: 0.4,
    zone: { third: 'attacking', channel: 'central', box: 'edge' },
  };

  it('stays in single digits even for a specialist', () => {
    const rate = conversionRate('freeKickCurl', freeKickContext);
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.15);
    expect(rate).toBeGreaterThan(
      conversionRate('freeKickCurl', { ...freeKickContext, player: prospect() }),
    );
  });

  it('always offers a delivery and a way to keep the ball, not just a shot', () => {
    const template = getSituationTemplate('freeKickDirect');
    for (let seed = 0; seed < 30; seed++) {
      const options = generateActions(new Rng(`fk-${seed}`), context(freeKickContext), template);
      const families = new Set(options.map((o) => o.family));
      expect(families.has('cross'), 'a free kick must always be deliverable').toBe(true);
      expect(options.map((o) => o.kind)).toContain('freeKickShort');
    }
  });
});

describe('attacking a corner', () => {
  const cornerContext = (gkAction: GoalkeeperAction): ContextOverrides => ({
    situation: 'cornerAttack',
    situationQuality: 0.55,
    nearbyDefenders: 2,
    defensivePressure: 0.45,
    firstTime: true,
    goalkeeper: goalkeeperState(keeper(), { action: gkAction }),
  });

  it('makes the near post and the far post opposite reads of the same keeper', () => {
    const near = getAction('attackNearPost');
    const far = getAction('peelToFarPost');

    const staying = context(cornerContext('holdingLine'));
    const claiming = context(cornerContext('rushing'));

    // He stays: get in front of your man. He comes: the back post is empty.
    expect(near.fit(staying)).toBeGreaterThan(near.fit(claiming));
    expect(far.fit(claiming)).toBeGreaterThan(far.fit(staying));
  });

  it('sends the keeper to claim it rather than to face a striker', () => {
    const seen = new Set<GoalkeeperAction>();
    for (let i = 0; i < 400; i++) {
      const state = createGoalkeeperState(new Rng(`ck-${i}`), keeper(), 'cornerAttack', 1.25);
      seen.add(state.committedAction);
    }
    expect(seen.has('goingToGround')).toBe(false);
    expect(seen.has('advancing') || seen.has('rushing')).toBe(true);
  });
});

describe('defensive archetypes', () => {
  const defensiveTypes = (Object.keys(SITUATION_TEMPLATES) as SituationType[]).filter(
    (type) => SITUATION_TEMPLATES[type].defensive,
  );

  it('covers the aerial duel and the press, not just the last-ditch tackle', () => {
    expect(defensiveTypes).toContain('defensiveDuel');
    expect(defensiveTypes).toContain('aerialDuel');
    expect(defensiveTypes).toContain('pressingTrap');
  });

  it('never offers a defending player an action that could score', () => {
    for (const type of defensiveTypes) {
      for (const candidate of SITUATION_TEMPLATES[type].candidates) {
        const family = getAction(candidate.kind).family;
        expect(['defend', 'hold'], `${type} offers ${candidate.kind}`).toContain(family);
      }
    }
  });

  it('reads your OWN goalkeeper when deciding to leave the ball to him', () => {
    const brave = goalkeeperState(keeper({ aggression: 90, decisionMaking: 85 }));
    const timid = goalkeeperState(keeper({ aggression: 15, decisionMaking: 25 }));
    const leave = getAction('leaveItForTheKeeper');

    expect(leave.fit(context({ situation: 'aerialDuel', goalkeeper: brave }))).toBeGreaterThan(
      leave.fit(context({ situation: 'aerialDuel', goalkeeper: timid })),
    );
  });

  it('makes a pressing trap worth springing only when there is support', () => {
    const trap = getAction('springTheTrap');
    const supported = context({ situation: 'pressingTrap', defensivePressure: 0.8 });
    const alone = context({ situation: 'pressingTrap', defensivePressure: 0.1 });
    expect(trap.fit(supported)).toBeGreaterThan(trap.fit(alone));
  });

  it('fills six slots for a defender in any defensive situation', () => {
    for (const type of defensiveTypes) {
      const template = getSituationTemplate(type);
      for (let seed = 0; seed < 20; seed++) {
        const options = generateActions(
          new Rng(`def-opts-${type}-${seed}`),
          context({ situation: type, player: playerAt('CB') }),
          template,
        );
        expect(options, type).toHaveLength(6);
      }
    }
  });
});

describe('set-piece narration', () => {
  it('opens a dead ball with a dead-ball beat, never with open play', () => {
    const template = getSituationTemplate('penalty');
    for (let seed = 0; seed < 25; seed++) {
      const beats = generateBuildUp(
        new Rng(`pen-beat-${seed}`),
        context(penaltyContext('set')),
        template,
      );
      // The opening beat describes the award, not a passage of play.
      expect(beats[0]).toMatch(/spot|penalty|line/i);
      // An empty penalty area is not "acres of space".
      expect(beats.join(' ')).not.toMatch(/acres of space/i);
    }
  });

  it('narrates every archetype, including the new ones', () => {
    for (const type of Object.keys(SITUATION_TEMPLATES) as SituationType[]) {
      const template = getSituationTemplate(type);
      const beats = generateBuildUp(new Rng(`beats-${type}`), context({ situation: type }), template);
      expect(beats.length, type).toBeGreaterThanOrEqual(3);
      for (const beat of beats) expect(beat, type).toBeTruthy();
    }
  });
});

describe('catalogue reachability', () => {
  it('every action in the catalogue can actually be offered by some situation', () => {
    const reachable = new Set<ActionKind>();
    for (const template of Object.values(SITUATION_TEMPLATES)) {
      for (const candidate of template.candidates) reachable.add(candidate.kind);
    }
    const orphans = (Object.keys(ACTION_CATALOGUE) as ActionKind[]).filter(
      (kind) => !reachable.has(kind),
    );
    expect(orphans, 'actions no situation can ever offer').toEqual([]);
  });
});
