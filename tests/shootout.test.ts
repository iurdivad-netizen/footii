import { describe, expect, it } from 'vitest';
import {
  BASE_CONVERSION,
  REGULATION_KICKS,
  conversionChance,
  createShootout,
  decided,
  isPlayersKick,
  kicksTaken,
  nextKick,
  recordKick,
  simulateShootout,
  takingOrder,
} from '../src/core/career/shootout.ts';
import type { ShootoutSide, ShootoutState } from '../src/core/career/shootout.ts';
import { applyPlayerResult, createCup, drawRound } from '../src/core/career/cups.ts';
import { Rng } from '../src/core/rng.ts';
import { getTeam } from '../src/data/gameData.ts';
import { keeper } from './helpers.ts';

/**
 * PENALTY SHOOTOUTS
 *
 * The rules that decide when a shootout is over are the whole of the risk here.
 * Everything else is a coin weighted three-quarters, but "is it finished" has
 * two different answers depending on whether the first five are gone, and
 * getting it wrong either stops a shootout that should continue or asks for
 * kicks after somebody has already won.
 */

function kick(state: ShootoutState, side: ShootoutSide, scored: boolean): ShootoutState {
  const turn = nextKick(state);
  if (!turn) throw new Error('kicked after the shootout was decided');
  expect(turn.side).toBe(side);
  return recordKick(state, { side, taker: turn.taker, scored, own: false, note: '' });
}

/** Take a list of kicks as "PO" pairs: player then opponent, in order. */
function play(results: readonly [boolean, boolean | null][]): ShootoutState {
  const state = createShootout();
  for (const [player, opponent] of results) {
    if (state.winner) break;
    kick(state, 'player', player);
    if (opponent === null || state.winner) break;
    kick(state, 'opponent', opponent);
  }
  return state;
}

describe('taking the kicks in turn', () => {
  it('alternates, starting with the player', () => {
    const state = createShootout();
    expect(nextKick(state)).toEqual({ side: 'player', taker: 1 });
    kick(state, 'player', true);
    expect(nextKick(state)).toEqual({ side: 'opponent', taker: 1 });
    kick(state, 'opponent', true);
    expect(nextKick(state)).toEqual({ side: 'player', taker: 2 });
  });

  it('repeats the order once the first five are gone, which is what sudden death is', () => {
    const state = play([
      [true, true],
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ]);
    expect(state.winner).toBeNull();
    expect(state.suddenDeath).toBe(true);
    // Sixth kick, first taker again.
    expect(nextKick(state)).toEqual({ side: 'player', taker: 1 });
  });

  it('knows which kick is the human own, and finds him again in sudden death', () => {
    expect(isPlayersKick({ side: 'player', taker: 3 }, 3)).toBe(true);
    expect(isPlayersKick({ side: 'player', taker: 2 }, 3)).toBe(false);
    // Never the opponent's, whatever the number.
    expect(isPlayersKick({ side: 'opponent', taker: 3 }, 3)).toBe(false);

    const state = play([
      [true, true],
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ]);
    // Kick six is taker one again, so a taker-one player comes straight back up.
    expect(isPlayersKick(nextKick(state)!, 1)).toBe(true);
  });
});

describe('when a shootout is over', () => {
  it('stops as soon as the kicks left cannot catch up', () => {
    // 3-0 after three each: the opponent has two left and cannot reach three.
    const state = play([
      [true, false],
      [true, false],
      [true, false],
    ]);
    expect(state.winner).toBe('player');
    expect(nextKick(state)).toBeNull();
    // And it stopped early: nobody took a fourth.
    expect(kicksTaken(state, 'player')).toBe(3);
  });

  it('does not stop while the side behind can still reach it', () => {
    // 2-1 after three each, two kicks left each — still live.
    const state = play([
      [true, true],
      [true, false],
      [false, false],
    ]);
    expect(state.winner).toBeNull();
  });

  it('goes to sudden death when the first five are level', () => {
    const state = play([
      [true, true],
      [true, true],
      [false, false],
      [true, true],
      [false, false],
    ]);
    expect(state.playerScore).toBe(3);
    expect(state.opponentScore).toBe(3);
    expect(state.winner).toBeNull();
    expect(state.suddenDeath).toBe(true);
  });

  it('ends sudden death only when both have taken and one is ahead', () => {
    let state = play([
      [true, true],
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ]);

    // Sixth pair: player scores, opponent has not replied yet.
    state = kick(state, 'player', true);
    expect(state.winner).toBeNull();

    // The reply misses, and only now is it over.
    state = kick(state, 'opponent', false);
    expect(state.winner).toBe('player');
  });

  it('does not end sudden death when both miss', () => {
    let state = play([
      [true, true],
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ]);
    state = kick(state, 'player', false);
    state = kick(state, 'opponent', false);
    expect(state.winner).toBeNull();
    expect(nextKick(state)).not.toBeNull();
  });

  it('gives an untouched shootout no winner and a first kick to take', () => {
    const state = createShootout();
    expect(decided(state)).toBeNull();
    expect(state.kicks).toEqual([]);
  });
});

describe('how likely a kick is to go in', () => {
  const best = getTeam('real-valmorena');
  const worst = getTeam('sk-mattersdorf');

  it('sits near three in four whoever is taking', () => {
    // The point of a shootout: being the better side barely helps.
    const strong = conversionChance(best, keeper());
    const weak = conversionChance(worst, keeper());
    expect(strong).toBeGreaterThan(weak);
    expect(Math.abs(strong - BASE_CONVERSION)).toBeLessThan(0.1);
    expect(Math.abs(weak - BASE_CONVERSION)).toBeLessThan(0.1);
    expect(strong - weak).toBeLessThan(0.12);
  });

  it('makes a good keeper worth something, but not much', () => {
    const easy = conversionChance(best, keeper({ reflexes: 20, anticipation: 20 }));
    const hard = conversionChance(best, keeper({ reflexes: 95, anticipation: 95 }));
    expect(easy).toBeGreaterThan(hard);
    expect(easy - hard).toBeLessThan(0.15);
  });
});

describe('who takes which kick', () => {
  it('sends the best takers up first', () => {
    expect(takingOrder(95, 95)).toBe(1);
    expect(takingOrder(30, 30)).toBe(REGULATION_KICKS);
  });

  it('always names a taker inside the order', () => {
    for (let attribute = 1; attribute <= 99; attribute += 1) {
      const order = takingOrder(attribute, attribute);
      expect(order).toBeGreaterThanOrEqual(1);
      expect(order).toBeLessThanOrEqual(REGULATION_KICKS);
    }
  });
});

describe('a shootout nobody took', () => {
  it('always produces a winner, and a score that explains it', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const state = simulateShootout(
        new Rng(`auto:${seed}`),
        { player: getTeam('northport-city'), opponent: getTeam('atletico-sarraluz') },
        { player: keeper(), opponent: keeper() },
      );
      expect(state.winner).not.toBeNull();
      const leader = state.playerScore > state.opponentScore ? 'player' : 'opponent';
      expect(state.winner).toBe(leader);
      // Nobody takes a kick after it is decided.
      expect(Math.abs(kicksTaken(state, 'player') - kicksTaken(state, 'opponent'))).toBeLessThanOrEqual(1);
    }
  });

  it('reaches sudden death sometimes, and does not hang when it does', () => {
    const lengths = Array.from({ length: 200 }, (_, seed) =>
      simulateShootout(
        new Rng(`long:${seed}`),
        { player: getTeam('northport-city'), opponent: getTeam('northport-city') },
        { player: keeper(), opponent: keeper() },
      ).kicks.length,
    );
    expect(Math.max(...lengths)).toBeGreaterThan(REGULATION_KICKS * 2);
    expect(Math.max(...lengths)).toBeLessThan(100);
  });
});

describe('a shootout the player actually took', () => {
  it('decides the tie, rather than being re-rolled behind him', () => {
    // The bug this whole feature exists to prevent, in its newest possible
    // form: taking the winning kick and then being knocked out anyway.
    const cup = createCup('nationalCup', 'england', ['northport-city', 'atletico-sarraluz']);
    cup.rounds.push(drawRound(new Rng('draw'), cup));

    const tie = applyPlayerResult(new Rng('roll'), cup, {
      clubId: 'northport-city',
      goalsFor: 1,
      goalsAgainst: 1,
      lookup: getTeam,
      shootoutWinnerId: 'northport-city',
    });

    expect(tie.penalties).toBe(true);
    expect(tie.winnerId).toBe('northport-city');
  });

  it('lets the other side win it too, so the kicks are what decides', () => {
    const cup = createCup('nationalCup', 'england', ['northport-city', 'atletico-sarraluz']);
    cup.rounds.push(drawRound(new Rng('draw'), cup));

    const tie = applyPlayerResult(new Rng('roll'), cup, {
      clubId: 'northport-city',
      goalsFor: 1,
      goalsAgainst: 1,
      lookup: getTeam,
      shootoutWinnerId: 'atletico-sarraluz',
    });

    expect(tie.winnerId).toBe('atletico-sarraluz');
  });

  it('still rolls one for a tie nobody took, as it always did', () => {
    const cup = createCup('nationalCup', 'england', ['northport-city', 'atletico-sarraluz']);
    cup.rounds.push(drawRound(new Rng('draw'), cup));

    const tie = applyPlayerResult(new Rng('roll'), cup, {
      clubId: 'northport-city',
      goalsFor: 2,
      goalsAgainst: 2,
      lookup: getTeam,
    });

    expect(tie.penalties).toBe(true);
    expect(['northport-city', 'atletico-sarraluz']).toContain(tie.winnerId);
  });

  it('never lets a shootout override a tie that was won in normal time', () => {
    const cup = createCup('nationalCup', 'england', ['northport-city', 'atletico-sarraluz']);
    cup.rounds.push(drawRound(new Rng('draw'), cup));

    const tie = applyPlayerResult(new Rng('roll'), cup, {
      clubId: 'northport-city',
      goalsFor: 3,
      goalsAgainst: 1,
      lookup: getTeam,
      // Nonsense on a 3-1: there was no shootout, so this must be ignored.
      shootoutWinnerId: 'atletico-sarraluz',
    });

    expect(tie.penalties).toBe(false);
    expect(tie.winnerId).toBe('northport-city');
  });
});
