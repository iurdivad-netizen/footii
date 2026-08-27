import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { recordPlayerMatch, startCareer } from '../src/simulation/CareerService.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { traitEvidence } from '../src/core/career/career.ts';
import {
  BIG_GAME_BONUS,
  COOL_HEAD_TIME,
  GRANITE_INJURY,
  MAVERICK_NOISE,
  OLD_HEAD_FATIGUE,
  STREAKY_FORM,
  TRAITS,
  TRAIT_ACTION_BONUS,
  TRAIT_IDS,
  earnedTraits,
  hasTrait,
  newTraits,
  traitActionBonus,
} from '../src/core/player/traits.ts';
import type { TraitEvidence, TraitId } from '../src/core/player/traits.ts';
import { injuryRisk } from '../src/core/career/injury.ts';
import { calculateDecisionTime } from '../src/simulation/DecisionTimer.ts';
import { getSituationTemplate } from '../src/data/situations.ts';
import { context, veteran } from './helpers.ts';

const lookup = (id: string) => getTeam(id);

/** A career that has done nothing. Every test builds up from here. */
const nothing: TraitEvidence = {
  appearances: 0,
  goals: 0,
  assists: 0,
  averageRating: 0,
  nineOrBetter: 0,
  perfectRatings: 0,
  hatTricks: 0,
  longestScoringRun: 0,
  seasons: 0,
  bigMatches: 0,
  bigMatchAverage: 0,
  age: 24,
};

const evidence = (overrides: Partial<TraitEvidence> = {}): TraitEvidence => ({
  ...nothing,
  ...overrides,
});

describe('the shape of the set', () => {
  it('describes every trait it defines', () => {
    for (const id of TRAIT_IDS) {
      const trait = TRAITS[id];
      expect(trait.id).toBe(id);
      expect(trait.label.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
      // The line said back to him at the moment it lands. A trait that arrives
      // with nothing to say is an invisible modifier, which is the thing this
      // whole feature exists not to be.
      expect(trait.earned.length).toBeGreaterThan(0);
    }
  });

  it('has at least one that cuts both ways', () => {
    // A set of pure upsides is a skill tree by another name.
    expect(TRAIT_IDS.filter((id) => TRAITS[id].doubleEdged).length).toBeGreaterThan(0);
  });
});

describe('earning them', () => {
  it('gives a career that has done nothing nothing at all', () => {
    expect(earnedTraits(nothing)).toEqual([]);
  });

  it('needs a real sample before any rate can earn anything', () => {
    // The floors, and why they exist: without them a career fires half its
    // traits inside two seasons on a sample far too small to mean anything.
    const brilliantFortnight = evidence({
      appearances: 12,
      nineOrBetter: 12,
      perfectRatings: 12,
      hatTricks: 6,
      averageRating: 6.2,
      seasons: 1,
    });
    expect(earnedTraits(brilliantFortnight)).toEqual([]);
  });

  it('earns each trait from the thing it is named after', () => {
    const earns = (id: TraitId, overrides: Partial<TraitEvidence>) =>
      expect(earnedTraits(evidence(overrides))).toContain(id);

    earns('bigGame', { bigMatches: 40, bigMatchAverage: 7.9 });
    earns('coolHead', { appearances: 300, nineOrBetter: 150 });
    earns('provider', { assists: 140 });
    earns('poacher', { appearances: 300, hatTricks: 45 });
    earns('granite', { seasons: 10, appearances: 360 });
    earns('streaky', { longestScoringRun: 20 });
    earns('maverick', { appearances: 400, perfectRatings: 30, averageRating: 5.7 });
    earns('oldHead', { age: 35, appearances: 400 });
  });

  it('will not call a man a big-game player for turning up to big games', () => {
    // Both halves are required. Playing in them is not the same as playing well
    // in them, and the average is the half that means anything.
    expect(earnedTraits(evidence({ bigMatches: 60, bigMatchAverage: 6.2 }))).not.toContain(
      'bigGame',
    );
  });

  it('refuses maverick to a career that was simply good', () => {
    // The whole point of the trait: a great player is not capable of anything
    // and not every week. He is capable of it most weeks. That is not a
    // maverick, that is a good footballer.
    //
    // The rating figures here sit on the scale the engine produces AFTER the
    // goal-curve fix — a career now averages about 7.4 where it used to average
    // 8.3, so a "modest" average is in the fives rather than the sixes. See the
    // note above `earnedTraits`.
    const great = evidence({ appearances: 500, perfectRatings: 260, averageRating: 8.5 });
    expect(earnedTraits(great)).not.toContain('maverick');

    const spiky = evidence({ appearances: 500, perfectRatings: 30, averageRating: 5.7 });
    expect(earnedTraits(spiky)).toContain('maverick');
  });

  it('gives the old head to longevity rather than to quality', () => {
    // The one trait that asks nothing about how good he was.
    const journeyman = evidence({ age: 35, appearances: 400, averageRating: 6.1 });
    expect(earnedTraits(journeyman)).toContain('oldHead');
    // And a brilliant career that stopped early never gets it.
    const brilliantAndShort = evidence({ age: 30, appearances: 300, averageRating: 8.4 });
    expect(earnedTraits(brilliantAndShort)).not.toContain('oldHead');
  });

  it('only ever reports what is new', () => {
    const full = evidence({ assists: 140, longestScoringRun: 20 });
    expect(newTraits([], full)).toEqual(earnedTraits(full));
    expect(newTraits(['provider'], full)).toEqual(['streaky']);
    expect(newTraits(['provider', 'streaky'], full)).toEqual([]);
  });

  it('never takes one back once it has been earned', () => {
    // A record that could un-record itself would not be a record. A maverick
    // whose average later climbs does not stop having had those afternoons.
    const was = evidence({ appearances: 400, perfectRatings: 30, averageRating: 5.7 });
    expect(earnedTraits(was)).toContain('maverick');
    const now = evidence({ appearances: 600, perfectRatings: 30, averageRating: 7.8 });
    expect(newTraits(['maverick'], now)).not.toContain('maverick');
  });
});

describe('what they do in a match', () => {
  const shotInBox = { family: 'shot' as const, insideBox: true, importance: 0.6 };

  it('does nothing at all for a player with none', () => {
    expect(traitActionBonus([], shotInBox)).toBe(0);
    expect(traitActionBonus(undefined, shotInBox)).toBe(0);
  });

  it('pays a poacher only inside the box', () => {
    expect(traitActionBonus(['poacher'], shotInBox)).toBe(TRAIT_ACTION_BONUS);
    expect(traitActionBonus(['poacher'], { ...shotInBox, insideBox: false })).toBe(0);
    // And only for a shot. Outside his own department he is an ordinary player.
    expect(traitActionBonus(['poacher'], { ...shotInBox, family: 'pass' })).toBe(0);
  });

  it('pays a provider for a ball played to somebody, however it was played', () => {
    expect(traitActionBonus(['provider'], { ...shotInBox, family: 'pass' })).toBe(
      TRAIT_ACTION_BONUS,
    );
    expect(traitActionBonus(['provider'], { ...shotInBox, family: 'cross' })).toBe(
      TRAIT_ACTION_BONUS,
    );
    expect(traitActionBonus(['provider'], shotInBox)).toBe(0);
  });

  it('pays a big-game player nothing on an ordinary Saturday', () => {
    // A flat bonus would make him a better footballer. This makes him a
    // bigger-occasion one, which is what the label claims.
    expect(traitActionBonus(['bigGame'], { ...shotInBox, importance: 0.4 })).toBe(0);
    expect(traitActionBonus(['bigGame'], { ...shotInBox, importance: 0.6 })).toBe(0);
    expect(traitActionBonus(['bigGame'], { ...shotInBox, importance: 1 })).toBeCloseTo(
      BIG_GAME_BONUS,
      6,
    );
  });

  it('stacks two traits that both apply', () => {
    const both = traitActionBonus(['poacher', 'bigGame'], { ...shotInBox, importance: 1 });
    expect(both).toBeCloseTo(TRAIT_ACTION_BONUS + BIG_GAME_BONUS, 6);
  });

  it('stays small enough to lose to a bad decision', () => {
    // A trait is the difference between two good footballers, not a substitute
    // for being one. The whole set at once is worth less than a 0.3 swing in
    // execution, which `RESOLUTION_WEIGHTS.execution` prices at 0.102.
    const everything = traitActionBonus(TRAIT_IDS, { ...shotInBox, importance: 1 });
    expect(everything).toBeLessThan(0.102);
  });
});

describe('what they do outside the action model', () => {
  it('gives a cool head time back where he lost it', () => {
    const template = getSituationTemplate('oneOnOne');
    const pressured = (traits: TraitId[]) =>
      calculateDecisionTime(
        context({ player: { ...veteran(), traits }, defensivePressure: 0.8 }),
        template,
      ).seconds;
    expect(pressured(['coolHead'])).toBeGreaterThan(pressured([]));

    // And nothing in an empty penalty area, which is what being unhurried means.
    const calm = (traits: TraitId[]) =>
      calculateDecisionTime(
        context({ player: { ...veteran(), traits }, defensivePressure: 0 }),
        template,
      ).seconds;
    expect(calm(['coolHead'])).toBe(calm([]));
    expect(COOL_HEAD_TIME).toBeGreaterThan(0);
  });

  it('lets an old head keep his window as his legs go', () => {
    const template = getSituationTemplate('oneOnOne');
    const tired = (traits: TraitId[]) =>
      calculateDecisionTime(
        context({ player: { ...veteran(), fitness: 20, traits } }),
        template,
      ).seconds;
    expect(tired(['oldHead'])).toBeGreaterThan(tired([]));
    expect(OLD_HEAD_FATIGUE).toBeLessThan(1);
  });

  it('makes a durable player harder to injure', () => {
    const base = { fitnessAtEnd: 30, minutes: 90, age: 26, stamina: 60 };
    expect(injuryRisk({ ...base, traits: ['granite'] })).toBeCloseTo(
      injuryRisk(base) * GRANITE_INJURY,
      6,
    );
    // Every other trait leaves the roll alone.
    expect(injuryRisk({ ...base, traits: ['poacher', 'coolHead'] })).toBe(injuryRisk(base));
  });

  it('moves a streaky player\'s form faster in BOTH directions', () => {
    expect(STREAKY_FORM).toBeGreaterThan(0.35);
    const state = career('streaky');
    const plain = career('streaky');
    state.player.traits = ['streaky'];

    playMatch(state, 9);
    playMatch(plain, 9);
    expect(state.player.form).toBeGreaterThan(plain.player.form);

    const falling = career('streaky-down');
    const steady = career('streaky-down');
    falling.player.traits = ['streaky'];
    playMatch(falling, 3);
    playMatch(steady, 3);
    expect(falling.player.form).toBeLessThan(steady.player.form);
  });

  it('widens a maverick without moving his average', () => {
    // Nothing about this makes him better. It makes him less predictable, which
    // the goal curve downstream turns into more of both kinds of afternoon.
    expect(MAVERICK_NOISE).toBeGreaterThan(1);
    const rng = new Rng('spread');
    const draws = Array.from({ length: 4000 }, () => rng.noise(0.06 * MAVERICK_NOISE, 2.5));
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
  });
});

function career(seed = 'traits'): CareerState {
  const player: Player = createPlayer({
    name: 'Trait Test',
    position: 'ST',
    age: 24,
    baseAttribute: 70,
    attributes: {},
  });
  return startCareer({ player, clubId: 'northport-city', teams: TEAMS, seed });
}

function playMatch(state: CareerState, rating: number, goals = 0): void {
  const stats = createMatchStats();
  stats.minutes = 90;
  stats.goals = goals;
  recordPlayerMatch(
    state,
    { stats, rating, playerTeamScore: goals, opponentScore: 0, fitnessAtEnd: 60 },
    lookup,
  );
}

describe('a career earns them by playing', () => {
  it('starts as nothing in particular', () => {
    expect(career().player.traits).toEqual([]);
  });

  it('reads its evidence off the record book rather than a new counter', () => {
    // The constraint that shaped the whole list: a career already under way
    // gains what it has already earned, because the evidence was always there.
    const state = career('evidence');
    playMatch(state, 8.2, 3);
    const seen = traitEvidence(state);
    expect(seen.appearances).toBe(1);
    expect(seen.goals).toBe(3);
    expect(seen.hatTricks).toBe(1);
    expect(seen.age).toBe(state.player.age);
  });

  it('awards one the moment the evidence crosses the line, and says so', () => {
    const state = career('award');
    // Everything but the last piece of evidence: on a fifteen-match run, and
    // the goal below is the sixteenth.
    state.records.scoringStreak = { current: 15, longest: 15 };
    playMatch(state, 7.4, 1);
    expect(hasTrait(state.player.traits, 'streaky')).toBe(true);
    // And it arrives as a moment, because a trait nobody is told about is an
    // invisible modifier.
    expect(state.lastMoments.some((moment) => moment.kind === 'traitEarned')).toBe(true);
  });

  it('does not announce the same trait twice', () => {
    const state = career('once');
    state.records.scoringStreak = { current: 19, longest: 19 };
    playMatch(state, 7.4, 1);
    const first = state.lastMoments.filter((m) => m.kind === 'traitEarned').length;
    expect(first).toBe(1);
    playMatch(state, 7.4, 1);
    expect(state.lastMoments.filter((m) => m.kind === 'traitEarned')).toHaveLength(0);
    expect(state.player.traits.filter((id) => id === 'streaky')).toHaveLength(1);
  });
});
