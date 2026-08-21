import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { getTeam, playerName, TEAMS, GOALKEEPERS } from '../src/data/gameData.ts';
import { SQUAD_SIZE, createSquad, receiverOf } from '../src/core/career/squad.ts';
import { startCareer, prepareNextMatch } from '../src/simulation/CareerService.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { squadLevel } from '../src/core/career/transfers.ts';

const named = (rng: Rng) => playerName(rng, 'england');

describe('the people he passes to', () => {
  it('gives him a handful of receivers, not a squad', () => {
    // The whole design: what the engine needs is a name for whoever got on the
    // end of it, not eighteen footballers per club across 192 clubs.
    const squad = createSquad(new Rng('a'), getTeam('castleford-royals'), 'ST', named);
    expect(squad).toHaveLength(SQUAD_SIZE);
  });

  it('picks the positions that would actually receive the ball', () => {
    const forStriker = createSquad(new Rng('s'), getTeam('northport-city'), 'ST', named);
    const forDefender = createSquad(new Rng('s'), getTeam('northport-city'), 'CB', named);
    // A striker lays it to attackers and midfielders; a centre-back plays it
    // forward into midfield and out to the full-backs.
    expect(forStriker.every((mate) => ['AM', 'LW', 'RW', 'CM'].includes(mate.position))).toBe(true);
    expect(forDefender.every((mate) => ['DM', 'CM', 'LB', 'RB'].includes(mate.position))).toBe(true);
  });

  it('covers the available shirts rather than landing five of one', () => {
    const squad = createSquad(new Rng('cover'), getTeam('northport-city'), 'ST', named);
    expect(new Set(squad.map((mate) => mate.position)).size).toBeGreaterThan(1);
  });

  it('gives a stronger club better players to pass to', () => {
    const strong = createSquad(new Rng('x'), getTeam('castleford-royals'), 'ST', named);
    const weak = createSquad(new Rng('x'), getTeam('northport-city'), 'ST', named);
    const mean = (squad: typeof strong) =>
      squad.reduce((sum, mate) => sum + mate.ability, 0) / squad.length;
    expect(mean(strong)).toBeGreaterThan(mean(weak));
    expect(squadLevel(getTeam('castleford-royals'))).toBeGreaterThan(
      squadLevel(getTeam('northport-city')),
    );
  });

  it('never puts two men with the same surname in the same five', () => {
    // Surnames come from a pool of sixteen a country, so five draws collide
    // often — and two Hallams in one five reads as a bug, not a coincidence.
    for (const seed of ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8']) {
      const squad = createSquad(new Rng(seed), getTeam('castleford-royals'), 'ST', named);
      const surnames = squad.map((mate) => mate.name.slice(mate.name.lastIndexOf(' ') + 1));
      expect(new Set(surnames).size).toBe(surnames.length);
    }
  });

  it('never reuses a name a goalkeeper already has', () => {
    const taken = new Set(GOALKEEPERS.map((entry) => entry.goalkeeper.name));
    for (const seed of ['k1', 'k2', 'k3', 'k4']) {
      for (const mate of createSquad(new Rng(seed), getTeam('castleford-royals'), 'ST', named)) {
        expect(taken.has(mate.name)).toBe(false);
      }
    }
  });
});

describe('who got on the end of it', () => {
  const squad = () => [
    { name: 'Poor Finisher', position: 'CM' as const, ability: 40 },
    { name: 'Great Finisher', position: 'ST' as const, ability: 92 },
  ];

  it('finds the better player more often', () => {
    const rng = new Rng('who');
    let great = 0;
    for (let i = 0; i < 400; i++) {
      if (receiverOf(rng, squad())!.name === 'Great Finisher') great += 1;
    }
    expect(great / 400).toBeGreaterThan(0.6);
  });

  it('returns nobody when nobody is named', () => {
    // Every career saved before teammates existed, and every quick match. The
    // engine falls back to the wording it always used.
    expect(receiverOf(new Rng('none'), [])).toBeNull();
  });

  it('is deterministic, like every other roll in a match', () => {
    expect(receiverOf(new Rng('same'), squad())).toEqual(receiverOf(new Rng('same'), squad()));
  });
});

describe('the dressing room a career carries', () => {
  const career = (position: 'ST' | 'CB' = 'ST', seed = 'mates') =>
    startCareer({
      player: createPlayer({ name: 'P', position, attributes: {} }),
      clubId: 'northport-city',
      teams: TEAMS,
      seed,
    });

  it('comes with the club', () => {
    const state = career();
    expect(state.teammates).toHaveLength(SQUAD_SIZE);
  });

  it('is rebuilt for a career that never had one', () => {
    const state = career();
    state.teammates = [];
    prepareNextMatch(state, getTeam);
    expect(state.teammates).toHaveLength(SQUAD_SIZE);
  });

  it('gives a defender a different set of names from a striker', () => {
    const striker = career('ST', 'same-seed');
    const defender = career('CB', 'same-seed');
    expect(striker.teammates.map((m) => m.position)).not.toEqual(
      defender.teammates.map((m) => m.position),
    );
  });
});
