import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { getTeam } from '../src/data/gameData.ts';
import {
  FORMER_RIVAL_LIMIT,
  createRival,
  driftRival,
  rivalAfterMatch,
  rivalFate,
  rivalFateNote,
} from '../src/core/career/squad.ts';
import type { Rival } from '../src/core/career/squad.ts';
import { TEAMS } from '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { nextMatch, seasonComplete } from '../src/core/career/career.ts';
import {
  canStay,
  endSeason,
  missMatch,
  prepareNextMatch,
  recordPlayerMatch,
  startCareer,
  stayAtClub,
  teamSheet,
} from '../src/simulation/CareerService.ts';

const rival = (overrides: Partial<Rival> = {}): Rival => ({
  name: 'Joris Brandt',
  age: 27,
  ability: 70,
  form: 50,
  starts: 0,
  seasons: 2,
  ...overrides,
});

describe('counting the contest', () => {
  it('counts a start only when the shirt was actually contested', () => {
    // A match the player missed injured is not one the rival took off him.
    const contested = rivalAfterMatch(new Rng('a'), rival(), true, true);
    const uncontested = rivalAfterMatch(new Rng('a'), rival(), true, false);
    expect(contested.starts).toBe(1);
    expect(uncontested.starts).toBe(0);
  });

  it('counts nothing at all for a match he did not play', () => {
    expect(rivalAfterMatch(new Rng('a'), rival({ starts: 4 }), false).starts).toBe(4);
  });

  it('starts every summer at nothing, and ages his tenure', () => {
    const after = driftRival(new Rng('summer'), rival({ starts: 19, seasons: 2 }));
    expect(after.starts).toBe(0);
    expect(after.seasons).toBe(3);
    expect(after.age).toBe(28);
  });

  it('gives a new arrival no history at the club', () => {
    const made = createRival(new Rng('new'), getTeam('northport-city'), 'A Name', {
      role: 'starter',
      playerAbility: 70,
    });
    expect(made.starts).toBe(0);
    expect(made.seasons).toBe(0);
  });
});

describe('what becomes of him', () => {
  it('sells him when the player took the shirt off him', () => {
    expect(rivalFate({ rival: rival({ starts: 2 }), playerStarts: 30 })).toBe('sold');
  });

  it('keeps him when he held his own', () => {
    expect(rivalFate({ rival: rival({ starts: 18 }), playerStarts: 14 })).toBe('stays');
    expect(rivalFate({ rival: rival({ starts: 9 }), playerStarts: 22 })).toBe('stays');
  });

  it('will not sell him over a season the player barely played either', () => {
    // Injured most of the year is not a shirt won, and a club does not move a
    // player on over eleven matches nobody contested.
    expect(rivalFate({ rival: rival({ starts: 1 }), playerStarts: 6 })).toBe('stays');
  });

  it('will not sell a man the club signed twelve months ago', () => {
    // Without this a strong career gets through a new rival almost every
    // season, and somebody replaced that often stops being a person.
    expect(rivalFate({ rival: rival({ starts: 0, seasons: 0 }), playerStarts: 34 })).toBe('stays');
    expect(rivalFate({ rival: rival({ starts: 0, seasons: 1 }), playerStarts: 34 })).toBe('sold');
  });

  it('retires him on age alone, whatever the player did', () => {
    expect(rivalFate({ rival: rival({ age: 34, starts: 30 }), playerStarts: 2 })).toBe('retires');
    expect(rivalFate({ rival: rival({ age: 34, seasons: 0 }), playerStarts: 0 })).toBe('retires');
  });

  it('has no fate at all for losing, which is the point', () => {
    // The obvious fourth outcome — the club buys better when the player cannot
    // get a game — would make losing your place the cause of a harder opponent
    // for it, so a bad season could never be recovered from. The same spiral
    // the confidence drift and the form drift both refuse to build.
    const beaten = [
      rivalFate({ rival: rival({ starts: 34 }), playerStarts: 0 }),
      rivalFate({ rival: rival({ starts: 25 }), playerStarts: 5 }),
      rivalFate({ rival: rival({ starts: 20, seasons: 6 }), playerStarts: 10 }),
    ];
    expect(beaten.every((fate) => fate === 'stays')).toBe(true);
  });

  it('says something legible about each fate', () => {
    const man = rival();
    expect(rivalFateNote('sold', man, 'Fenwick Town')).toContain('Fenwick Town');
    expect(rivalFateNote('sold', man)).toContain(man.name);
    expect(rivalFateNote('retires', man)).toContain('retired');
    expect(rivalFateNote('stays', man)).toContain(man.name);
  });
});

describe('the man who replaces him', () => {
  const club = getTeam('northport-city');
  const promise = { role: 'starter' as const, playerAbility: 70 };

  it('is pitched higher than an ordinary arrival', () => {
    // Winning the shirt buys a harder argument for it rather than an empty one.
    const ordinary: number[] = [];
    const replacing: number[] = [];
    for (let i = 0; i < 400; i++) {
      ordinary.push(createRival(new Rng(`o${i}`), club, 'X', promise).ability);
      replacing.push(createRival(new Rng(`o${i}`), club, 'X', promise, true).ability);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(replacing)).toBeGreaterThan(mean(ordinary));
  });

  it('is still bounded by what the club promised the player', () => {
    // The replacement is harder, not unbeatable. A club that called him its
    // star player has not stopped saying so.
    for (let i = 0; i < 200; i++) {
      const made = createRival(
        new Rng(`s${i}`),
        club,
        'X',
        { role: 'star', playerAbility: 70 },
        true,
      );
      expect(made.ability).toBeLessThanOrEqual(74);
    }
  });
});

describe('how many are remembered', () => {
  it('keeps a bounded list', () => {
    // Two strings and a season each, and the oldest are forgotten as people are.
    expect(FORMER_RIVAL_LIMIT).toBeGreaterThan(0);
    expect(FORMER_RIVAL_LIMIT).toBeLessThanOrEqual(10);
  });
});

describe('a career plays it out', () => {
  const lookup = (id: string) => getTeam(id);

  function settledCareer(seed: string) {
    return startCareer({
      player: createPlayer({
        name: 'Settled',
        position: 'ST',
        age: 22,
        baseAttribute: 74,
        attributes: {},
      }),
      clubId: 'northport-city',
      teams: TEAMS,
      seed,
    });
  }

  /** Play a whole season, starting everything he is picked for, and stay put. */
  function playSeason(state: ReturnType<typeof startCareer>) {
    let guard = 0;
    while (!seasonComplete(state) && guard++ < 120) {
      prepareNextMatch(state, lookup);
      if (!nextMatch(state)) break;
      if (state.injury || !teamSheet(state).selected) {
        missMatch(state, lookup);
        continue;
      }
      const stats = createMatchStats();
      stats.minutes = 90;
      stats.goals = 1;
      recordPlayerMatch(
        state,
        { stats, rating: 7.8, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 62 },
        lookup,
      );
    }
    const summer = endSeason(state, lookup);
    if (canStay(state)) stayAtClub(state);
    return summer;
  }

  it('sells the man whose shirt was taken, and replaces him', () => {
    const state = settledCareer('displace');
    // Season one cannot sell anybody — he has only just arrived.
    const first = playSeason(state);
    expect(first.moments.filter((m) => m.kind === 'rivalGone')).toHaveLength(0);

    const before = state.rival!.name;
    let sold = false;
    for (let season = 0; season < 6 && !sold; season++) {
      const summer = playSeason(state);
      sold = summer.moments.some((m) => m.kind === 'rivalGone');
    }

    expect(sold).toBe(true);
    // Somebody else is in the shirt now.
    expect(state.rival!.name).not.toBe(before);
    expect(state.rival!.seasons).toBe(0);
  });

  it('remembers where he went, and notices him years later', () => {
    const state = settledCareer('remember');
    for (let season = 0; season < 7; season++) playSeason(state);

    const gone = state.formerRivals;
    expect(gone.length).toBeGreaterThan(0);
    for (const one of gone) {
      expect(one.name.length).toBeGreaterThan(0);
      // A club that exists and is not his own — a man sold to nowhere could
      // never line up against him, which is the whole point of remembering.
      expect(() => getTeam(one.clubId)).not.toThrow();
      expect(one.clubId).not.toBe(state.clubId);
    }
  });

  it('never remembers more than the cap', () => {
    const state = settledCareer('cap');
    for (let season = 0; season < 12; season++) playSeason(state);
    expect(state.formerRivals.length).toBeLessThanOrEqual(FORMER_RIVAL_LIMIT);
  });
});
