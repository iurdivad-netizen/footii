import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { COUNTRIES, LEAGUE_COUNTRIES, TEAMS, getTeam, teamsInCountry } from '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import {
  CONTINENTAL_FIELD,
  GROUP_SIZE,
  WORLD_CUP_FIELD,
  WORLD_CUP_GROUPS,
  WORLD_CUP_PLACES,
  nationId,
  nationalTeam,
  worldCupField,
  worldCupGroups,
  worldCupPlaces,
} from '../src/core/career/nations.ts';
import {
  GROUP_ROUNDS,
  MAX_INTERNATIONAL_MATCHES,
  WORLD_CUP_KNOCKOUT_ROUNDS,
  closeGroupRound,
  createInternational,
  knockoutField,
  knockoutRoundsFor,
  nationGroups,
  playGroupRound,
  startKnockout,
  tournamentFor,
  tournamentName,
} from '../src/core/career/international.ts';
import {
  allConfederations,
  confederationOf,
  countriesIn,
  hasLeague,
  nationsByPrestige,
} from '../src/core/career/countries.ts';
import type { NationStrengths } from '../src/core/career/nationDrift.ts';
import {
  NATION_DRIFT_LIMIT,
  currentNationStrength,
  driftNations,
  initialNationStrengths,
} from '../src/core/career/nationDrift.ts';
import { teamStrength } from '../src/core/team/team.ts';
import { endSeason, prepareNextMatch, recordPlayerMatch, startCareer } from '../src/simulation/CareerService.ts';
import { seasonComplete } from '../src/core/career/career.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';

/**
 * A WORLD, AND A WORLD CUP
 *
 * The world is forty-four nations of which twelve have leagues. What is being
 * tested is that the two halves belong to the same game: a nation with no clubs
 * has to be built, has to drift, has to be reachable in a tournament, and has to
 * be comparable with a nation that was derived from clubs — because they meet.
 */

const lookup = (id: string) => getTeam(id);
const WORLD = nationsByPrestige().map((c) => c.id);

describe('a country with no league', () => {
  it('still fields a national side', () => {
    for (const country of COUNTRIES.filter((c) => !hasLeague(c))) {
      const nation = nationalTeam(country.id, []);
      expect(teamStrength(nation), country.id).toBeGreaterThan(0);
      expect(nation.name).toBe(country.name);
      expect(nation.id).toBe(nationId(country.id));
    }
  });

  it('takes its shape from its authored style rather than a flat fifty', () => {
    // The failure this catches: every league-less nation identical, because a
    // side with no clubs behind it fell back to fifties across the board.
    const possession = COUNTRIES.find((c) => !hasLeague(c) && c.style === 'possession')!;
    const nation = nationalTeam(possession.id, []);
    expect(nation.ratings.possession).toBeGreaterThan(nation.ratings.tempo);
    expect(nation.style).toBe('possession');

    const strengths = new Set(
      COUNTRIES.filter((c) => !hasLeague(c)).map((c) => teamStrength(nationalTeam(c.id, []))),
    );
    expect(strengths.size).toBeGreaterThan(8);
  });

  it('is calibrated against the sides that ARE derived from clubs', () => {
    // They meet in the same tournament, so they have to be on one scale. The
    // first numbers written put ten of the twelve European sides above every
    // nation outside Europe: a World Cup would have been a European procession.
    const derived = LEAGUE_COUNTRIES.map((c) => teamStrength(nationalTeam(c.id, teamsInCountry(c.id))));
    const authored = COUNTRIES.filter((c) => !hasLeague(c)).map((c) =>
      teamStrength(nationalTeam(c.id, [])),
    );
    const best = Math.max(...authored);
    const worstDerived = Math.min(...derived);

    // The best nation outside Europe beats most of the European ones...
    expect(best).toBeGreaterThan(worstDerived);
    expect(derived.filter((s) => s < best).length).toBeGreaterThan(derived.length / 2);
    // ...and none of them is stronger than the strongest league's side.
    expect(best).toBeLessThan(Math.max(...derived));
  });
});

describe('nations that drift without clubs', () => {
  it('moves a league-less nation and leaves the others alone', () => {
    const drifted = driftNations(new Rng('drift'), initialNationStrengths());
    for (const country of COUNTRIES) {
      if (hasLeague(country)) {
        expect(drifted[country.id], country.id).toBeUndefined();
      } else {
        expect(drifted[country.id], country.id).toBeDefined();
      }
    }
  });

  it('never wanders further than the limit, however long the career', () => {
    // A pure random walk over eighteen seasons produces worlds with Panama
    // above Brazil. Mean reversion makes the authored strength what a country
    // is ABOUT rather than merely where it started.
    let strengths = initialNationStrengths();
    for (let season = 0; season < 40; season++) {
      strengths = driftNations(new Rng(`s${season}`), strengths);
    }
    for (const [countryId, delta] of Object.entries(strengths)) {
      expect(Math.abs(delta), countryId).toBeLessThanOrEqual(NATION_DRIFT_LIMIT);
    }
  });

  it('pulls a nation back toward where it belongs', () => {
    let strengths: NationStrengths = { brazil: NATION_DRIFT_LIMIT };
    for (let i = 0; i < 20; i++) strengths = driftNations(new Rng(`pull${i}`), strengths);
    expect(Math.abs(strengths.brazil!)).toBeLessThan(NATION_DRIFT_LIMIT);
  });

  it('says nothing about a country whose strength is a question about its clubs', () => {
    expect(currentNationStrength(initialNationStrengths(), 'england')).toBe(0);
    expect(currentNationStrength(initialNationStrengths(), 'brazil')).toBeGreaterThan(0);
  });
});

describe('the World Cup field', () => {
  it('takes the best of every confederation and fills exactly sixteen', () => {
    const field = worldCupField(WORLD);
    expect(field).toHaveLength(WORLD_CUP_FIELD);
    for (const confederation of allConfederations()) {
      const from = field.filter((id) => confederationOf(id) === confederation);
      expect(from, confederation).toHaveLength(worldCupPlaces(confederation));
    }
    expect(
      Object.values(WORLD_CUP_PLACES).reduce((a, b) => a + b, 0),
    ).toBe(WORLD_CUP_FIELD);
  });

  it('never leaves a part of the world out of a World Cup', () => {
    const field = worldCupField(WORLD);
    for (const confederation of allConfederations()) {
      expect(field.some((id) => confederationOf(id) === confederation), confederation).toBe(true);
    }
  });

  it('takes the best of a confederation, not merely the first it meets', () => {
    const field = worldCupField(WORLD);
    for (const confederation of allConfederations()) {
      const ranked = countriesIn(confederation)
        .map((c) => c.id)
        .sort((a, b) => WORLD.indexOf(a) - WORLD.indexOf(b));
      const expected = ranked.slice(0, worldCupPlaces(confederation));
      expect(field.filter((id) => confederationOf(id) === confederation).sort()).toEqual(
        expected.sort(),
      );
    }
  });

  it('splits it into four groups of four', () => {
    const groups = worldCupGroups(WORLD);
    expect(groups).toHaveLength(WORLD_CUP_GROUPS);
    for (const group of groups) expect(group).toHaveLength(GROUP_SIZE);
    expect(new Set(groups.flat()).size).toBe(WORLD_CUP_FIELD);
  });

  it('keeps the strongest nations apart', () => {
    // The snake exists so the top four seeds are one per group. A draw that put
    // three of them together would read as a bug however fairly it was rolled.
    const groups = worldCupGroups(WORLD);
    const field = worldCupField(WORLD);
    const topFour = field.slice(0, WORLD_CUP_GROUPS);
    for (const group of groups) {
      expect(group.filter((id) => topFour.includes(id))).toHaveLength(1);
    }
  });
});

describe('the two tournaments', () => {
  it('alternates, so every season has one and neither is every season', () => {
    const kinds = Array.from({ length: 10 }, (_, i) => tournamentFor(i + 1));
    expect(kinds[0]).toBe('worldCup');
    expect(kinds[1]).toBe('continental');
    for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
    // A career of eighteen seasons gets nine of each.
    expect(kinds.filter((k) => k === 'worldCup')).toHaveLength(5);
  });

  it('runs the World Cup a knockout round deeper', () => {
    expect(knockoutRoundsFor('worldCup')).toBe(WORLD_CUP_KNOCKOUT_ROUNDS);
    expect(knockoutRoundsFor('worldCup')).toBeGreaterThan(knockoutRoundsFor('continental'));
    expect(GROUP_ROUNDS + knockoutRoundsFor('worldCup')).toBe(MAX_INTERNATIONAL_MATCHES);
  });

  it('names itself for the half of the world playing it', () => {
    expect(tournamentName('worldCup', 'europe')).toBe('The World Cup');
    expect(tournamentName('continental', 'europe')).toBe('The European Championship');
    expect(tournamentName('continental', 'southAmerica')).toBe('The South American Championship');
  });

  it('plays a World Cup out to one champion from sixteen', () => {
    const rng = new Rng('cup');
    const state = createInternational(rng, WORLD, 'worldCup');
    expect(nationGroups(state)).toHaveLength(WORLD_CUP_GROUPS);
    expect(state.fixtures).toHaveLength(WORLD_CUP_GROUPS * ((GROUP_SIZE * (GROUP_SIZE - 1)) / 2));

    const nations = new Map(
      COUNTRIES.map((c) => [nationId(c.id), nationalTeam(c.id, teamsInCountry(c.id))]),
    );
    const teams = (id: string) => nations.get(id) ?? getTeam(id);
    for (let round = 1; round <= GROUP_ROUNDS; round++) {
      playGroupRound(rng, state, round, teams);
      closeGroupRound(state, round);
    }
    const knockout = startKnockout(state)!;
    expect(knockout).toBeTruthy();
    // Top two of four groups: eight nations, three rounds.
    expect(knockoutField(state)).toHaveLength(WORLD_CUP_FIELD / 2);
  });

  it('gives a continental championship half the field and a shallower bracket', () => {
    const state = createInternational(new Rng('euro'), WORLD, 'continental');
    expect(state.groups.flat()).toHaveLength(CONTINENTAL_FIELD);
    expect(state.knockoutRounds).toBeLessThan(knockoutRoundsFor('worldCup'));
  });
});

describe('a career in a world of nations', () => {
  /** Play a season out with nothing interesting happening. */
  function playSeason(state: ReturnType<typeof startCareer>): void {
    let guard = 0;
    while (!seasonComplete(state) && guard++ < 120) {
      prepareNextMatch(state, lookup);
      const stats = createMatchStats();
      stats.minutes = 90;
      recordPlayerMatch(
        state,
        { stats, rating: 6, playerTeamScore: 1, opponentScore: 1, fitnessAtEnd: 50, skipped: true },
        lookup,
      );
    }
  }

  it('gives a player from outside Europe his own confederation\'s championship', () => {
    // The gap this closes: seeding the continental championship from Europe
    // regardless gave a Brazilian a World Cup every other year and nothing at
    // all in between, while an Englishman got both.
    const state = startCareer({
      player: createPlayer({
        name: 'Brazilian',
        position: 'ST',
        age: 22,
        baseAttribute: 60,
        nationality: 'brazil',
        attributes: {},
      }),
      clubId: 'stapleton-vale',
      teams: TEAMS,
      seed: 'brazilian',
    });

    // Season one is a World Cup and reaches the whole world.
    expect(state.international.kind).toBe('worldCup');
    const worldField = state.international.groups.flat();
    expect(worldField).toContain(nationId('brazil'));
    expect(new Set(worldField.map((n) => confederationOf(n.slice('nation:'.length)))).size)
      .toBeGreaterThan(1);

    playSeason(state);
    endSeason(state, lookup);

    // Season two is HIS championship, not Europe's.
    expect(state.international.kind).toBe('continental');
    const field = state.international.groups.flat().map((n) => n.slice('nation:'.length));
    expect(field).toContain('brazil');
    for (const id of field) expect(confederationOf(id)).toBe('southAmerica');
  });

  it('drifts the league-less nations across a career', () => {
    const state = startCareer({
      player: createPlayer({ name: 'X', position: 'ST', age: 22, baseAttribute: 60, attributes: {} }),
      clubId: 'stapleton-vale',
      teams: TEAMS,
      seed: 'drifting',
    });
    expect(state.nationStrengths).toEqual({});

    for (let season = 0; season < 3; season++) {
      playSeason(state);
      endSeason(state, lookup);
    }

    const moved = Object.entries(state.nationStrengths).filter(([, delta]) => delta !== 0);
    expect(moved.length).toBeGreaterThan(8);
    for (const [countryId] of moved) expect(hasLeague({ ...getCountryOrThrow(countryId) })).toBe(false);
  });
});

function getCountryOrThrow(id: string) {
  const found = COUNTRIES.find((c) => c.id === id);
  if (!found) throw new Error(`no such country: ${id}`);
  return found;
}
