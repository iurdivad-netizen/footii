import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import {
  missMatch,
  planWeek,
  preparationFor,
  preparationSeconds,
  recordPlayerMatch,
  startCareer,
  weekAhead,
} from '../src/simulation/CareerService.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { advanceSeason, nextMatch } from '../src/core/career/career.ts';
import {
  PREPARATION_BONUS,
  REST_FITNESS,
  TRAIN_FITNESS,
  TRAIN_FITNESS_FLOOR,
  WEEK_CHOICES,
  WEEK_DESCRIPTIONS,
  WEEK_LABELS,
  effortFactor,
  planApplies,
  pushChance,
  spendWeek,
  weekImpact,
  weekOptions,
} from '../src/core/career/week.ts';
import type { WeekChoice } from '../src/core/career/week.ts';
import { createDevelopmentState, developAfterMatch } from '../src/core/career/development.ts';
import { calculateDecisionTime } from '../src/simulation/DecisionTimer.ts';
import { getSituationTemplate } from '../src/data/situations.ts';
import { context } from './helpers.ts';

const lookup = (id: string) => getTeam(id);

const striker = (overrides: Partial<Player> = {}): Player => ({
  ...createPlayer({ name: 'Test', position: 'ST', age: 24, baseAttribute: 70, attributes: {} }),
  ...overrides,
});

function career(seed = 'week'): CareerState {
  return startCareer({ player: striker(), clubId: 'northport-city', teams: TEAMS, seed });
}

const base = { fitness: 80, morale: 50, form: 50, confidence: 50 };

/** The same man, as the hub asks about him rather than as a week is spent. */
const state = (overrides: Partial<typeof base> & { preparationSeconds?: number } = {}) => ({
  ...base,
  preparationSeconds: 0.8,
  ...overrides,
});

function outcome(choice: WeekChoice, overrides: Partial<typeof base> = {}, seed = 'w') {
  return spendWeek(new Rng(seed), { choice, ...base, ...overrides });
}

describe('what a week can be spent on', () => {
  it('offers four things, each with a name and a cost', () => {
    expect(WEEK_CHOICES).toHaveLength(4);
    for (const choice of WEEK_CHOICES) {
      expect(WEEK_LABELS[choice].length).toBeGreaterThan(0);
      expect(WEEK_DESCRIPTIONS[choice].length).toBeGreaterThan(0);
    }
  });

  it('gives every option a line for the hub, whatever it did', () => {
    for (const choice of WEEK_CHOICES) {
      expect(outcome(choice).note.length).toBeGreaterThan(0);
    }
  });
});

describe('resting, and working', () => {
  it('rest hands fitness back and teaches him nothing', () => {
    const rested = outcome('rest');
    expect(rested.fitness).toBe(base.fitness + REST_FITNESS);
    expect(rested.growth).toBe(1);
    expect(rested.preparation).toBe(0);
  });

  it('extra work is paid for in fitness', () => {
    const worked = outcome('train', { fitness: 95 });
    expect(worked.fitness).toBe(95 - TRAIN_FITNESS);
    expect(worked.growth).toBeGreaterThan(1);
  });

  it('never pushes fitness outside 0-100', () => {
    expect(outcome('rest', { fitness: 97 }).fitness).toBe(100);
    expect(outcome('train', { fitness: 100 }).fitness).toBe(100 - TRAIN_FITNESS);
  });

  it('will not take extra work below the floor', () => {
    // The cost does not reset between matches, so an uncapped one ratchets: a
    // career that trained every week finished matches on a mean fitness of 36
    // and took 37% more injuries for it.
    expect(outcome('train', { fitness: TRAIN_FITNESS_FLOOR + 2 }).fitness).toBe(
      TRAIN_FITNESS_FLOOR,
    );
  });

  it('never lets a hard week HAND fitness back', () => {
    // The trap in the obvious implementation of a floor: `max(80, f - 6)` at
    // fitness 60 hands the player 80, so extra work becomes a way to recover.
    for (const fitness of [0, 30, 60, 79]) {
      expect(outcome('train', { fitness }).fitness).toBeLessThanOrEqual(fitness);
    }
  });

  it('is not offered at all to a player in no state for it', () => {
    const tired = weekOptions(state({ fitness: TRAIN_FITNESS_FLOOR - 1 }));
    const train = tired.find((option) => option.choice === 'train')!;
    expect(train.available).toBe(false);
    expect(train.reason.length).toBeGreaterThan(0);
    // Shut, not removed: the screen greys it out and says why, which is what
    // makes resting the obvious answer rather than a lesson learned in February.
    expect(tired).toHaveLength(WEEK_CHOICES.length);
    // And nothing else is gated on being tired.
    expect(tired.filter((option) => !option.available)).toHaveLength(1);
  });

  it('is offered again once he is fresh enough', () => {
    expect(
      weekOptions(state({ fitness: TRAIN_FITNESS_FLOOR })).every((option) => option.available),
    ).toBe(true);
  });

  it('is worth more to a happy footballer than an unhappy one', () => {
    // Morale's first job that is not a rounding error on a clock.
    expect(outcome('train', { morale: 95 }).growth).toBeGreaterThan(
      outcome('train', { morale: 10 }).growth,
    );
    expect(effortFactor(100)).toBeGreaterThan(effortFactor(0));
  });

  it('is a nudge on the career arc rather than a rewrite of it', () => {
    // A multiplier this size, applied every week for fifteen years, must not
    // take a career somewhere the development model was never tuned for.
    for (const morale of [0, 50, 100]) {
      expect(outcome('train', { morale }).growth).toBeLessThan(1.35);
    }
  });
});

describe('extra work at both ends of a career', () => {
  const developWith = (age: number, effort: number) => {
    const player = striker({ age, potentialAbility: 90 });
    return developAfterMatch(new Rng('dev'), createDevelopmentState(), {
      player,
      rating: 7.2,
      minutes: 90,
      coaching: 0.6,
      effort,
    });
  };

  it('grows a young player faster', () => {
    expect(developWith(20, 1.2).growth).toBeGreaterThan(developWith(20, 1).growth);
  });

  it('slows an old one down instead, rather than doing nothing at all', () => {
    // Growth is zero past the peak, so a multiplier on it alone would make this
    // an empty menu item from about thirty-one onward — in a game whose careers
    // run to thirty-nine.
    const worked = developWith(35, 1.2);
    const idle = developWith(35, 1);
    expect(idle.decline).toBeGreaterThan(0);
    expect(worked.decline).toBeLessThan(idle.decline);
  });

  it('leaves a match with no week behind it exactly as it always was', () => {
    const withoutEffort = developAfterMatch(new Rng('dev'), createDevelopmentState(), {
      player: striker({ age: 20, potentialAbility: 90 }),
      rating: 7.2,
      minutes: 90,
      coaching: 0.6,
    });
    expect(withoutEffort.growth).toBeCloseTo(developWith(20, 1).growth, 10);
  });
});

describe('studying the opponent', () => {
  it('buys decision time and nothing else', () => {
    const studied = outcome('study');
    expect(studied.preparation).toBe(PREPARATION_BONUS);
    expect(studied.fitness).toBe(base.fitness);
    expect(studied.growth).toBe(1);
  });

  it('widens every decision window in the match', () => {
    const situation = context({ situation: 'oneOnOne' });
    const template = getSituationTemplate('oneOnOne');
    const ordinary = calculateDecisionTime(situation, template, 1, 0);
    const prepared = calculateDecisionTime(situation, template, 1, PREPARATION_BONUS);
    expect(prepared.seconds).toBeGreaterThan(ordinary.seconds);
    // Named in the audit, so the debug panel can show where the time came from.
    expect(prepared.modifiers.some((m) => m.label === 'Prepared')).toBe(true);
  });

  it('is worth the same SHARE of the window at every pace', () => {
    // Added before the pace multiplier rather than after it, so a week of
    // homework buys the same fraction of thinking time whoever is playing. In
    // raw seconds it is therefore smaller at Hardcore and larger at Relaxed,
    // which is the point: a flat gift in seconds would be worth three times as
    // much to the player under the most pressure.
    const situation = context({ situation: 'oneOnOne' });
    const template = getSituationTemplate('oneOnOne');
    const share = (pace: number) => {
      const ordinary = calculateDecisionTime(situation, template, pace, 0).seconds;
      const prepared = calculateDecisionTime(situation, template, pace, PREPARATION_BONUS).seconds;
      return { gain: prepared - ordinary, share: (prepared - ordinary) / ordinary };
    };
    expect(share(0.5).gain).toBeLessThan(share(1).gain);
    expect(share(0.5).share).toBeCloseTo(share(1).share, 2);
    expect(share(2).share).toBeCloseTo(share(1).share, 2);
  });
});

describe('asking for a start', () => {
  it('helps a player who is out of favour and hurts one who is not', () => {
    // The self-limiting term, and the whole reason there is no cap on how often
    // he may ask: a man his manager already rates has nothing to ask for.
    const expected = (confidence: number) => {
      const chance = pushChance({ morale: 50, form: 50, confidence });
      return chance * 9 - (1 - chance) * 6;
    };
    expect(expected(20)).toBeGreaterThan(0);
    expect(expected(85)).toBeLessThan(0);
  });

  it('is likelier for a happy player in form', () => {
    expect(pushChance({ morale: 90, form: 85, confidence: 50 })).toBeGreaterThan(
      pushChance({ morale: 15, form: 20, confidence: 50 }),
    );
  });

  it('moves confidence and morale together, either way', () => {
    // Seeds chosen so one lands and one does not, at the same odds.
    const results = ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) =>
      spendWeek(new Rng(seed), { choice: 'push', ...base, confidence: 20 }),
    );
    const won = results.find((r) => r.confidence > 20);
    const lost = results.find((r) => r.confidence < 20);
    expect(won).toBeDefined();
    expect(lost).toBeDefined();
    expect(won!.morale).toBeGreaterThan(base.morale);
    expect(lost!.morale).toBeLessThan(base.morale);
  });

  it('costs more in morale than it wins, so it is not a free roll', () => {
    const results = ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) =>
      spendWeek(new Rng(seed), { choice: 'push', ...base, confidence: 20 }),
    );
    const won = results.find((r) => r.confidence > 20)!;
    const lost = results.find((r) => r.confidence < 20)!;
    expect(base.morale - lost.morale).toBeGreaterThan(won.morale - base.morale);
  });

  it('cannot push either number outside 0-100', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const high = spendWeek(new Rng(seed), {
        choice: 'push',
        ...base,
        morale: 99,
        confidence: 99,
      });
      const low = spendWeek(new Rng(seed), { choice: 'push', ...base, morale: 2, confidence: 2 });
      for (const value of [high.morale, high.confidence, low.morale, low.confidence]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('a week belongs to exactly one fixture', () => {
  it('is spent on the match it was made for and no other', () => {
    expect(planApplies({ choice: 'rest', slotIndex: 4, note: '', growth: 1, preparation: 0 }, 4))
      .toBe(true);
    expect(planApplies({ choice: 'rest', slotIndex: 4, note: '', growth: 1, preparation: 0 }, 5))
      .toBe(false);
    expect(planApplies(null, 4)).toBe(false);
  });

  it('is cleared by the match it was made for', () => {
    const state = career();
    planWeek(state, 'train');
    expect(state.week).not.toBeNull();

    const stats = createMatchStats();
    stats.minutes = 90;
    recordPlayerMatch(
      state,
      { stats, rating: 7, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 55 },
      lookup,
    );
    expect(state.week).toBeNull();
  });

  it('is spent even when he does not get on the pitch', () => {
    // The honest cost of planning a week you are then left out of: it bought
    // you nothing, which is exactly what would have happened.
    const state = career('missed');
    planWeek(state, 'train');
    missMatch(state, lookup);
    expect(state.week).toBeNull();
  });

  it('refuses a choice the player is in no state to take', () => {
    // A screen is not a rule. Anything that can reach the service has to be
    // told no by the service.
    const state = career('gated');
    state.fitness = TRAIN_FITNESS_FLOOR - 10;
    expect(planWeek(state, 'train')).toBeNull();
    expect(state.week).toBeNull();
    // And the week is still his to spend on something he can do.
    expect(planWeek(state, 'rest')).not.toBeNull();
  });

  it('accepts one pick and refuses a second', () => {
    // For the same reason negotiation allows exactly one push: a decision you
    // can retake until you like the answer is not a decision.
    const state = career();
    expect(planWeek(state, 'push')).not.toBeNull();
    expect(planWeek(state, 'rest')).toBeNull();
  });

  it('only prepares the fixture it was made for', () => {
    const state = career();
    planWeek(state, 'study');
    expect(preparationFor(state)).toBe(PREPARATION_BONUS);

    // A plan left over from a fixture the career has moved past buys nothing.
    state.week = { ...state.week!, slotIndex: state.week!.slotIndex + 3 };
    expect(preparationFor(state)).toBe(0);
  });
});

describe('the week in front of him', () => {
  it('is there to be planned before an ordinary fixture', () => {
    const ahead = weekAhead(career());
    expect(ahead.options?.map((o) => o.choice)).toEqual(WEEK_CHOICES);
    expect(ahead.options?.every((o) => o.available)).toBe(true);
    expect(ahead.plan).toBeNull();
  });

  it('is not offered to an injured player, and says why', () => {
    // Nothing on either side of the choice: the fixture passes without him
    // whatever he does with the week.
    const state = career('injured');
    state.injury = {
      severity: 'strain',
      label: 'Hamstring strain',
      weeks: 3,
      weeksRemaining: 3,
      season: state.seasonNumber,
    };
    const ahead = weekAhead(state);
    expect(ahead.options).toBeNull();
    expect(ahead.reason).toContain('Hamstring strain');
    expect(planWeek(state, 'train')).toBeNull();
  });

  it('is still offered to a fit player who has been left out', () => {
    // Being dropped is the week asking for a start exists for.
    const state = career('benched');
    const ahead = weekAhead(state);
    expect(ahead.options?.map((o) => o.choice)).toEqual(WEEK_CHOICES);
  });

  it('reports the plan once it has been made', () => {
    const state = career();
    planWeek(state, 'rest');
    const ahead = weekAhead(state);
    expect(ahead.plan?.choice).toBe('rest');
  });
});

describe('a week changes the season it is in', () => {
  it('resting shows up as fitness before the match rather than after it', () => {
    const state = career('rested');
    const before = state.fitness;
    state.fitness = 70;
    state.player.fitness = 70;
    planWeek(state, 'rest');
    expect(state.fitness).toBe(70 + REST_FITNESS);
    // Both copies, or the engine plays a match at a fitness nobody chose.
    expect(state.player.fitness).toBe(state.fitness);
    expect(before).toBeGreaterThan(0);
  });

  it('lets a player argue his way back toward the side before kick-off', () => {
    const state = career('argue');
    state.confidence = 18;
    state.player.morale = 80;
    state.player.form = 70;

    // Deterministic on the fixture, so this is the answer he gets, once.
    const chance = pushChance({ morale: 80, form: 70, confidence: 18 });
    expect(chance).toBeGreaterThan(0.5);

    planWeek(state, 'push');
    expect(state.confidence).not.toBe(18);
  });

  it('gives the extra work to the match it was done for', () => {
    const worked = career('effort');
    const idle = career('effort');
    worked.player.age = 19;
    idle.player.age = 19;
    worked.player.potentialAbility = 92;
    idle.player.potentialAbility = 92;
    planWeek(worked, 'train');

    const play = (state: CareerState) => {
      const stats = createMatchStats();
      stats.minutes = 90;
      recordPlayerMatch(
        state,
        { stats, rating: 7.6, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 55 },
        lookup,
      );
    };
    play(worked);
    play(idle);

    expect(worked.development.pool).toBeGreaterThan(idle.development.pool);
  });

  it('does not survive the summer that ends the season it was made in', () => {
    // Slots start again at zero every August, so a plan left over from May
    // would be spent on whichever fixture happened to sit at the same index —
    // a week of work claimed twice, a year apart.
    const state = career('summer');
    planWeek(state, 'study');
    expect(state.week).not.toBeNull();

    advanceSeason(new Rng('summer'), state, 4, {
      fixtures: state.fixtures,
      table: state.table,
      leagueTeamIds: state.leagueTeamIds,
      division: state.division,
      countryId: state.countryId,
    });

    expect(state.week).toBeNull();
    expect(preparationFor(state)).toBe(0);
  });

  it('plans the fixture actually next, not the one the season started on', () => {
    const state = career('slot');
    const stats = createMatchStats();
    stats.minutes = 90;
    recordPlayerMatch(
      state,
      { stats, rating: 7, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 55 },
      lookup,
    );
    const plan = planWeek(state, 'study');
    expect(plan!.slotIndex).toBe(nextMatch(state)!.slotIndex);
  });
});

/**
 * WHAT THE CARD PROMISES, AGAINST WHAT THE WEEK DELIVERS
 *
 * The point of every test here is the same one, and it is why the impact note
 * is derived rather than written: a promise on a button is a second copy of the
 * model, and a second copy drifts. So each option is played and the sentence is
 * checked against what actually happened to the player, rather than against a
 * string somebody typed.
 */
describe('what a week would do to you', () => {
  const seconds = (text: string) => Number(/([\d.]+)s/.exec(text)?.[1] ?? NaN);
  const percent = (text: string) => Number(/(\d+)%/.exec(text)?.[1] ?? NaN);
  const arrow = (text: string) => (/(\d+) → (\d+)/.exec(text) ?? []).slice(1).map(Number);

  it('gives every option a player can take a line of its own', () => {
    const options = weekOptions(state());
    expect(options).toHaveLength(WEEK_CHOICES.length);
    for (const option of options) {
      expect(option.impact.length).toBeGreaterThan(0);
      // Never the same sentence twice: four identical notes would be decoration.
      expect(options.filter((other) => other.impact === option.impact)).toHaveLength(1);
    }
  });

  it('says nothing on an option it has already shut', () => {
    const train = weekOptions(state({ fitness: TRAIN_FITNESS_FLOOR - 1 })).find(
      (option) => option.choice === 'train',
    )!;
    // The reason is the sentence that matters; an impact note beside it would be
    // promising him a week he cannot have.
    expect(train.impact).toBe('');
    expect(train.reason.length).toBeGreaterThan(0);
  });

  it('promises exactly the fitness a week of rest returns', () => {
    for (const fitness of [40, 72, 96]) {
      const [before, after] = arrow(weekImpact('rest', state({ fitness })));
      expect(before).toBe(fitness);
      expect(after).toBe(Math.round(outcome('rest', { fitness }).fitness));
    }
  });

  it('does not offer a rest to a man who is already fully fit', () => {
    const note = weekImpact('rest', state({ fitness: 100 }));
    expect(note).not.toContain('→');
    expect(outcome('rest', { fitness: 100 }).fitness).toBe(100);
  });

  it('promises exactly the fitness a hard week costs, floor included', () => {
    for (const fitness of [82, 90, 100]) {
      const [before, after] = arrow(weekImpact('train', state({ fitness })));
      expect(before).toBe(fitness);
      expect(after).toBe(Math.round(outcome('train', { fitness }).fitness));
    }
  });

  it('states the multiplier the week actually applies, at his morale', () => {
    for (const morale of [5, 50, 95]) {
      const stated = percent(weekImpact('train', state({ morale })));
      const delivered = Math.round((outcome('train', { morale }).growth - 1) * 100);
      expect(stated).toBe(delivered);
    }
  });

  it('shows morale changing what a week of work is worth', () => {
    // The reason the note exists at all: no fixed sentence can say this, and the
    // player learns what morale is for by reading the same card twice.
    expect(percent(weekImpact('train', state({ morale: 95 })))).toBeGreaterThan(
      percent(weekImpact('train', state({ morale: 5 }))),
    );
  });

  it('states the odds the manager conversation is actually rolled at', () => {
    for (const confidence of [20, 50, 80]) {
      const stated = percent(weekImpact('push', state({ confidence })));
      expect(stated).toBe(Math.round(pushChance({ ...base, confidence }) * 100));
    }
    // And the odds fall as his manager warms to him, which is the whole lever.
    expect(percent(weekImpact('push', state({ confidence: 20 })))).toBeGreaterThan(
      percent(weekImpact('push', state({ confidence: 80 }))),
    );
  });

  it('says how much time studying buys, in seconds', () => {
    expect(seconds(weekImpact('study', state({ preparationSeconds: 1.2 })))).toBe(1.2);
  });

  it('admits that studying buys nothing at a pace with no clock', () => {
    const note = weekImpact('study', state({ preparationSeconds: 0 }));
    expect(note).toContain('Nothing');
    expect(note).not.toMatch(/[\d.]+s/);
  });

  it('costs no time at the untimed pace, and time at every other', () => {
    expect(preparationSeconds('untimed')).toBe(0);
    for (const pace of ['hardcore', 'standard', 'relaxed', 'veryRelaxed'] as const) {
      expect(preparationSeconds(pace)).toBeGreaterThan(0);
    }
    // Longer windows are worth more of them, exactly as the timer scales.
    expect(preparationSeconds('relaxed')).toBeGreaterThan(preparationSeconds('hardcore'));
  });

  it('carries the pace the player actually chose onto the hub', () => {
    const timed = weekAhead(career('pace'), 'standard').options!.find((o) => o.choice === 'study')!;
    const untimed = weekAhead(career('pace'), 'untimed').options!.find((o) => o.choice === 'study')!;
    expect(timed.impact).not.toBe(untimed.impact);
    expect(untimed.impact).toContain('Nothing');
  });
});

/**
 * A note the screen never draws is a note that does not exist. Asserted against
 * the source in the same way the hub's other layout decisions are — see
 * tests/hubSections.test.ts — because the alternative is a card whose promise
 * lives only in a unit test.
 */
describe('the week card draws what the model worked out', () => {
  const screen = readFileSync(new URL('../src/ui/screens/CareerScreen.ts', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

  it('renders the impact beside the description rather than instead of it', () => {
    expect(screen).toContain('week-option-impact');
    expect(screen).toContain('WEEK_DESCRIPTIONS[choice]');
  });

  it('draws nothing at all when there is no impact to draw', () => {
    expect(screen).toContain("${impact ? `<span class=\"week-option-impact\">${impact}</span>` : ''}");
  });

  it('gives the line a style of its own', () => {
    expect(styles).toContain('.week-option-impact');
  });
});
