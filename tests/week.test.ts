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
  WEEK_CHOICES,
  WEEK_DESCRIPTIONS,
  WEEK_LABELS,
  effortFactor,
  planApplies,
  pushChance,
  spendWeek,
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
    const worked = outcome('train');
    expect(worked.fitness).toBe(base.fitness - TRAIN_FITNESS);
    expect(worked.growth).toBeGreaterThan(1);
  });

  it('never pushes fitness outside 0-100', () => {
    expect(outcome('rest', { fitness: 97 }).fitness).toBe(100);
    expect(outcome('train', { fitness: 3 }).fitness).toBe(0);
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
    expect(ahead.choices).toEqual(WEEK_CHOICES);
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
    expect(ahead.choices).toBeNull();
    expect(ahead.reason).toContain('Hamstring strain');
    expect(planWeek(state, 'train')).toBeNull();
  });

  it('is still offered to a fit player who has been left out', () => {
    // Being dropped is the week asking for a start exists for.
    const state = career('benched');
    const ahead = weekAhead(state);
    expect(ahead.choices).toEqual(WEEK_CHOICES);
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
