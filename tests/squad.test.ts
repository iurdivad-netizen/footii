import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { getTeam } from '../src/data/gameData.ts';
import {
  createRival,
  driftRival,
  matchImportance,
  pickSide,
  rivalAfterMatch,
  selectionChance,
} from '../src/core/career/squad.ts';
import type { Rival } from '../src/core/career/squad.ts';
import { effectiveAbility } from '../src/core/career/transfers.ts';
import { INTERNATIONAL } from '../src/core/career/international.ts';
import { SUPER_CUP } from '../src/core/career/superCup.ts';

const striker = (overrides: Partial<Player> = {}): Player => ({
  ...createPlayer({
    name: 'Test',
    position: 'ST',
    age: 26,
    baseAttribute: 70,
    attributes: {},
  }),
  ...overrides,
});

const rival = (overrides: Partial<Rival> = {}): Rival => ({
  name: 'Someone Else',
  age: 27,
  ability: 70,
  form: 50,
  ...overrides,
});

const base = {
  player: striker(),
  rival: rival(),
  role: 'starter' as const,
  fitness: 90,
  importance: 0.6,
  congested: false,
};

describe('the rival a club puts in your way', () => {
  it('is built from the club, so two clubs are not the same problem', () => {
    const strong = createRival(new Rng('a'), getTeam('castleford-royals'), 'A', {
      role: 'starter',
      playerAbility: 99,
    });
    const weak = createRival(new Rng('a'), getTeam('northport-city'), 'B', {
      role: 'starter',
      playerAbility: 99,
    });
    expect(strong.ability).toBeGreaterThan(weak.ability);
  });

  it('is held below a player the club called its star', () => {
    // Otherwise a club can hand you a star player's wage and a shirt you will
    // never wear, which is the two halves of a signing contradicting each other.
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const built = createRival(new Rng(seed), getTeam('castleford-royals'), 'X', {
        role: 'star',
        playerAbility: 62,
      });
      expect(built.ability).toBeLessThan(62);
    }
  });

  it('may be better than a player signed as cover, but never hopelessly so', () => {
    for (const seed of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      const built = createRival(new Rng(seed), getTeam('castleford-royals'), 'X', {
        role: 'squad',
        playerAbility: 60,
      });
      expect(built.ability).toBeLessThanOrEqual(69);
    }
  });

  it('ages: improving while young, declining once past thirty', () => {
    const young = driftRival(new Rng('y'), rival({ age: 22, ability: 70 }));
    expect(young.age).toBe(23);
    const olds = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'].map(
      (seed) => driftRival(new Rng(seed), rival({ age: 33, ability: 70 })).ability,
    );
    // Not every single year, but the trend is down.
    expect(olds.reduce((a, b) => a + b, 0) / olds.length).toBeLessThan(70);
  });

  it('finds form by playing, and drifts back to neutral by not', () => {
    const sharp = rivalAfterMatch(new Rng('p'), rival({ form: 20 }), true);
    expect(sharp.form).not.toBe(20);
    const benched = rivalAfterMatch(new Rng('p'), rival({ form: 20 }), false);
    expect(benched.form).toBeGreaterThan(20);
    expect(benched.form).toBeLessThan(50);
  });
});

describe('how much a fixture matters', () => {
  it('puts European nights above league football above the league cup', () => {
    expect(matchImportance('championsLeague', 5)).toBeGreaterThan(matchImportance('league', 12));
    expect(matchImportance('league', 12)).toBeGreaterThan(matchImportance('leagueCup', 1));
  });

  it('climbs as a knockout narrows', () => {
    expect(matchImportance('nationalCup', 4)).toBeGreaterThan(matchImportance('nationalCup', 1));
    expect(matchImportance('championsLeague', 6)).toBeGreaterThan(
      matchImportance('championsLeague', 2),
    );
  });

  it('never lets club rotation touch an international', () => {
    // His country picks him through its own rule. Two selection models voting
    // on the same shirt would be one too many.
    expect(matchImportance(INTERNATIONAL, 1)).toBe(1);
  });

  it('treats the super cup as a real trophy but not a season-defining one', () => {
    expect(matchImportance(SUPER_CUP, 1)).toBeLessThan(matchImportance('championsLeague', 1));
    expect(matchImportance(SUPER_CUP, 1)).toBeGreaterThan(matchImportance('leagueCup', 1));
  });
});

describe('picking the side', () => {
  it('picks the better player', () => {
    const better = selectionChance({ ...base, rival: rival({ ability: 55 }) });
    const worse = selectionChance({ ...base, rival: rival({ ability: 85 }) });
    expect(better).toBeGreaterThan(worse);
    expect(better).toBeGreaterThan(0.8);
  });

  it('honours what the contract promised, all else equal', () => {
    const star = selectionChance({ ...base, role: 'star' });
    const starter = selectionChance({ ...base, role: 'starter' });
    const cover = selectionChance({ ...base, role: 'squad' });
    expect(star).toBeGreaterThan(starter);
    expect(starter).toBeGreaterThan(cover);
  });

  it('rests a tired player from a match that does not matter', () => {
    const spent = { ...base, fitness: 25 };
    expect(selectionChance({ ...spent, importance: 0.2 })).toBeLessThan(
      selectionChance({ ...spent, importance: 0.95 }),
    );
  });

  it('does not rest anybody from a match that does matter, however tired', () => {
    // A manager does not leave his best player out of a European quarter-final
    // because he had a busy week.
    const chance = selectionChance({ ...base, fitness: 20, importance: 1, role: 'star' });
    expect(chance).toBeGreaterThan(0.7);
  });

  it('rests harder in a congested week than a clear one', () => {
    const tired = { ...base, fitness: 30, importance: 0.3 };
    expect(selectionChance({ ...tired, congested: true })).toBeLessThan(
      selectionChance({ ...tired, congested: false }),
    );
  });

  it('gives a fringe player his way in through the matches nobody cares about', () => {
    // The mechanism that stops "signed as cover" being a season of watching:
    // in a second-round cup tie the pecking order counts for less, because the
    // manager is resting the people it favours.
    const fringe = { ...base, role: 'squad' as const, rival: rival({ ability: 80 }) };
    expect(selectionChance({ ...fringe, importance: 0.26 })).toBeGreaterThan(
      selectionChance({ ...fringe, importance: 0.95 }),
    );
    expect(selectionChance({ ...fringe, importance: 0.26 })).toBeGreaterThan(0.15);
  });

  it('reads form as well as ability', () => {
    const flying = selectionChance({ ...base, player: striker({ form: 85 }) });
    const struggling = selectionChance({ ...base, player: striker({ form: 20 }) });
    expect(flying).toBeGreaterThan(struggling);
  });

  it('is deterministic for a given seed, so the hub cannot be re-rolled', () => {
    // A player who could re-open the screen until he was picked would have no
    // reason ever to accept being left out.
    const one = pickSide(new Rng('sheet'), base);
    const two = pickSide(new Rng('sheet'), base);
    expect(one).toEqual(two);
  });

  it('always says something, whether he is in or out', () => {
    for (const seed of ['n1', 'n2', 'n3', 'n4']) {
      expect(pickSide(new Rng(seed), base).note.length).toBeGreaterThan(0);
    }
  });

  it('tells being rested apart from being dropped', () => {
    const rested = pickSide(new Rng('rest'), {
      ...base,
      fitness: 20,
      importance: 0.2,
      rival: rival({ ability: 50 }),
    });
    const dropped = pickSide(new Rng('drop'), {
      ...base,
      fitness: 100,
      importance: 0.9,
      rival: rival({ ability: 92 }),
    });
    if (!rested.selected) expect(rested.note).toMatch(/[Rr]ested/);
    if (!dropped.selected) expect(dropped.note).not.toMatch(/[Rr]ested/);
  });

  it('keeps a genuinely better player in the side almost every week', () => {
    const strong = { ...base, role: 'star' as const, rival: rival({ ability: 55 }) };
    let picked = 0;
    for (let i = 0; i < 200; i++) {
      if (pickSide(new Rng(`week${i}`), strong).selected) picked += 1;
    }
    expect(picked / 200).toBeGreaterThan(0.85);
  });
});

describe('the scale ability is measured on', () => {
  it('compares the player and the rival on the same one', () => {
    // The rival's ability is drawn off a club's squad level, and the player's
    // comes from his attributes. The transfer model already treats those as one
    // scale (see squadRole); selection has to agree or the whole thing is noise.
    const player = striker({ ...striker(), age: 26 });
    const level = effectiveAbility(player);
    const evenly = selectionChance({ ...base, player, rival: rival({ ability: level }) });
    expect(evenly).toBeGreaterThan(0.4);
    expect(evenly).toBeLessThan(0.85);
  });
});
