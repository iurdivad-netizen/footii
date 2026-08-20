import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { COUNTRIES, teamsInCountry, getTeam } from '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import {
  GROUP_COUNT,
  GROUP_SIZE,
  TOURNAMENT_FIELD,
  NATIONAL_LIFT,
  QUALIFY_PER_GROUP,
  SELECTION_POOL,
  countryOfNation,
  groupOf,
  isNation,
  isSelected,
  nationId,
  nationalTeam,
  qualifyingGroups,
  selectionDepth,
  selectionGap,
  selectionThreshold,
} from '../src/core/career/nations.ts';
import {
  GROUP_ROUNDS,
  INTERNATIONAL_MATCHES,
  KNOCKOUT_ROUNDS,
  championNation,
  closeGroupRound,
  createInternational,
  groupFixture,
  groupIndexOf,
  groupPosition,
  groupTable,
  knockoutField,
  nationGroups,
  playGroupRound,
  reachedKnockout,
  startKnockout,
} from '../src/core/career/international.ts';
import type { InternationalState } from '../src/core/career/international.ts';
import { finishCup, totalRounds } from '../src/core/career/cups.ts';
import type { Team, TeamRatings } from '../src/core/team/team.ts';
import { teamStrength } from '../src/core/team/team.ts';
import { countryPrestige } from '../src/core/career/countries.ts';

/**
 * INTERNATIONAL FOOTBALL
 *
 * The one competition a player cannot transfer into. These check the two things
 * that gives the game: a tournament that runs whether or not he is in it, and a
 * squad he can be left out of.
 */

const nations = new Map(
  COUNTRIES.map((c) => [nationId(c.id), nationalTeam(c.id, teamsInCountry(c.id))]),
);
const lookup = (id: string) => nations.get(id) ?? getTeam(id);

function player(overrides: Partial<Player> = {}): Player {
  return { ...createPlayer({ name: 'Test', position: 'ST', attributes: {} }), ...overrides };
}

/** Play a whole international season out, with nobody left for the player. */
function playThrough(seed: string): InternationalState {
  const rng = new Rng(seed);
  const state = createInternational(rng);
  for (let round = 1; round <= GROUP_ROUNDS; round++) {
    playGroupRound(rng, state, round, lookup);
    closeGroupRound(state, round);
  }
  const knockout = startKnockout(state)!;
  finishCup(new Rng(`${seed}:finish`), knockout, lookup);
  return state;
}

describe('a national side', () => {
  it('is stronger than the best club in its own country', () => {
    // Otherwise being picked would be a demotion and the shirt would mean nothing.
    for (const country of COUNTRIES) {
      const clubs = teamsInCountry(country.id);
      const nation = nationalTeam(country.id, clubs);
      const best = Math.max(...clubs.map(teamStrength));
      expect(teamStrength(nation), country.id).toBeGreaterThan(best);
    }
  });

  it('is drawn from the country it plays for', () => {
    const nation = nationalTeam('spain', teamsInCountry('spain'));
    expect(nation.country).toBe('spain');
    expect(nation.name).toBe('Spain');
    expect(isNation(nation.id)).toBe(true);
    expect(countryOfNation(nation.id)).toBe('spain');
  });

  it('cannot be mistaken for a club', () => {
    // Nations and clubs share one lookup, one fixture list and one bracket. A
    // nation answering to a club's id would quietly play its matches.
    for (const team of teamsInCountry('england')) expect(isNation(team.id)).toBe(false);
    expect(countryOfNation('castleford-royals')).toBeNull();
  });

  it('follows its clubs, so a country that declines fields a weaker side', () => {
    const strong = teamsInCountry('england');
    const weakened = strong.map((team) => ({
      ...team,
      ratings: { ...team.ratings, attack: team.ratings.attack - 20, defence: team.ratings.defence - 20 },
    }));
    expect(teamStrength(nationalTeam('england', weakened))).toBeLessThan(
      teamStrength(nationalTeam('england', strong)),
    );
  });

  it('rewards depth, not just one superclub', () => {
    const flat = (team: Team, value: number): Team => ({
      ...team,
      ratings: Object.fromEntries(
        Object.keys(team.ratings).map((key) => [key, value]),
      ) as unknown as TeamRatings,
    });
    const pool = teamsInCountry('england').slice(0, SELECTION_POOL);
    // One great club and four poor ones...
    const one = pool.map((team, i) => flat(team, i === 0 ? 80 : 30));
    // ...against the same great club with four more behind it.
    const many = pool.map((team) => flat(team, 80));
    expect(selectionDepth(many)).toBeGreaterThan(selectionDepth(one));
    // Same best club, deeper country, better side.
    expect(teamStrength(nationalTeam('england', many))).toBeGreaterThan(
      teamStrength(nationalTeam('england', one)),
    );
  });

  it('never runs off the end of the rating scale', () => {
    const maxed = teamsInCountry('england').map((team) => ({
      ...team,
      ratings: Object.fromEntries(
        Object.keys(team.ratings).map((key) => [key, 99]),
      ) as unknown as TeamRatings,
    }));
    const nation = nationalTeam('england', maxed);
    for (const value of Object.values(nation.ratings)) expect(value).toBeLessThanOrEqual(99);
    expect(NATIONAL_LIFT).toBeGreaterThan(0);
  });

  it('survives a country with no clubs at all rather than crashing', () => {
    const nation = nationalTeam('atlantis', []);
    expect(teamStrength(nation)).toBeGreaterThan(0);
  });
});

describe('being picked', () => {
  it('asks more of a player from a strong footballing nation', () => {
    // The whole trade the nationality choice offers: caps, or the prestige of
    // the shirt. A Scot is capped early; a Spaniard has to be world class.
    expect(selectionThreshold('spain')).toBeGreaterThan(selectionThreshold('scotland'));
    expect(countryPrestige('spain')).toBeGreaterThan(countryPrestige('scotland'));
  });

  it('picks a famous player and leaves an unknown one out', () => {
    expect(isSelected(player({ reputation: 99, nationality: 'scotland' }))).toBe(true);
    expect(isSelected(player({ reputation: 10, nationality: 'scotland' }))).toBe(false);
  });

  it('can pick the same reputation for one country and not another', () => {
    const rep = (selectionThreshold('spain') + selectionThreshold('scotland')) / 2;
    expect(isSelected(player({ reputation: rep, nationality: 'scotland' }))).toBe(true);
    expect(isSelected(player({ reputation: rep, nationality: 'spain' }))).toBe(false);
  });

  it('tells a player who is out exactly how far out he is', () => {
    // "Four points away" is a season's goal; "not in the squad" is an absence.
    const out = player({ reputation: 40, nationality: 'england' });
    expect(selectionGap(out)).toBeCloseTo(selectionThreshold('england') - 40, 5);
    expect(selectionGap(player({ reputation: 99, nationality: 'england' }))).toBe(0);
  });
});

describe('the groups', () => {
  it('splits the qualifiers into two groups of four', () => {
    const groups = qualifyingGroups();
    expect(groups).toHaveLength(GROUP_COUNT);
    for (const group of groups) expect(group).toHaveLength(GROUP_SIZE);
    expect(new Set(groups.flat()).size).toBe(TOURNAMENT_FIELD);
  });

  it('takes the top of the order and leaves everybody else out', () => {
    // The world has more countries than the tournament has places, which is
    // what makes qualifying for it an achievement rather than an entitlement.
    const order = COUNTRIES.map((c) => c.id);
    const groups = qualifyingGroups(order);
    expect(groups.flat().sort()).toEqual(order.slice(0, TOURNAMENT_FIELD).sort());
    for (const missed of order.slice(TOURNAMENT_FIELD)) {
      expect(groupOf(missed, order), missed).toBe(-1);
    }
  });

  it('puts every qualifier in exactly one group', () => {
    for (const country of COUNTRIES.slice(0, TOURNAMENT_FIELD)) {
      expect(groupOf(country.id), country.id).toBeGreaterThanOrEqual(0);
    }
    expect(groupOf('atlantis')).toBe(-1);
  });

  it('re-draws the field as the order moves', () => {
    // A country that climbs plays its way into a tournament it was not in.
    const order = COUNTRIES.map((c) => c.id);
    const climbed = [order[order.length - 1]!, ...order.slice(0, -1)];
    expect(qualifyingGroups(order).flat()).not.toContain(order[order.length - 1]);
    expect(qualifyingGroups(climbed).flat()).toContain(order[order.length - 1]);
  });

  it('seeds them so neither is the group everybody dreads', () => {
    // A random draw puts the three best countries together often enough to read
    // as a bug. The snake keeps the halves level.
    const strength = (id: string) => countryPrestige(id);
    const totals = qualifyingGroups().map((g) => g.reduce((sum, id) => sum + strength(id), 0));
    expect(Math.abs(totals[0]! - totals[1]!)).toBeLessThan(0.2);
  });

  it('gives everybody three matches, against everybody else in the group', () => {
    const state = createInternational(new Rng('groups'));
    expect(state.fixtures).toHaveLength(GROUP_COUNT * ((GROUP_SIZE * (GROUP_SIZE - 1)) / 2));
    for (const nation of nationGroups(state).flat()) {
      const own = state.fixtures.filter((f) => f.homeId === nation || f.awayId === nation);
      expect(own, nation).toHaveLength(GROUP_ROUNDS);
      // Everybody else in the group, once each — that is what makes the table fair.
      const opponents = own.map((f) => (f.homeId === nation ? f.awayId : f.homeId));
      expect(new Set(opponents).size).toBe(GROUP_ROUNDS);
    }
  });

  it('never puts a nation in two matches on the same night', () => {
    const state = createInternational(new Rng('nights'));
    for (let round = 1; round <= GROUP_ROUNDS; round++) {
      const playing = state.fixtures
        .filter((f) => f.round === round)
        .flatMap((f) => [f.homeId, f.awayId]);
      expect(new Set(playing).size).toBe(playing.length);
    }
  });

  it('leaves everybody on three played once the groups are done', () => {
    const state = playThrough('played');
    for (const row of state.table) expect(row.played, row.teamId).toBe(GROUP_ROUNDS);
  });

  it('does not count one result twice, however often it is recorded', () => {
    const rng = new Rng('twice');
    const state = createInternational(rng);
    playGroupRound(rng, state, 1, lookup);
    const after = state.results.length;
    playGroupRound(rng, state, 1, lookup);
    expect(state.results).toHaveLength(after);
    for (const row of state.table) expect(row.played).toBeLessThanOrEqual(1);
  });

  it('leaves the player his own match to play', () => {
    const rng = new Rng('mine');
    const state = createInternational(rng);
    const me = nationId('england');
    playGroupRound(rng, state, 1, lookup, me);
    expect(state.results.some((r) => r.homeId === me || r.awayId === me)).toBe(false);
    // ...and settles the rest of the round around him.
    expect(state.results.length).toBeGreaterThan(0);
    expect(groupFixture(state, me, 1)).toBeTruthy();
  });
});

describe('the knockout', () => {
  it('waits for the groups to finish', () => {
    const rng = new Rng('early');
    const state = createInternational(rng);
    expect(startKnockout(state)).toBeNull();
    playGroupRound(rng, state, 1, lookup);
    closeGroupRound(state, 1);
    expect(startKnockout(state)).toBeNull();
  });

  it('takes the top two of each group and nobody else', () => {
    const state = playThrough('top-two');
    const field = knockoutField(state);
    expect(field).toHaveLength(GROUP_COUNT * QUALIFY_PER_GROUP);
    for (let group = 0; group < GROUP_COUNT; group++) {
      const table = groupTable(state, group);
      expect(field).toContain(table[0]!.teamId);
      expect(field).toContain(table[1]!.teamId);
      expect(field).not.toContain(table[GROUP_SIZE - 1]!.teamId);
    }
  });

  it('crosses the bracket, so two group winners can only meet in the final', () => {
    // This is the entire payoff for topping a group. An open draw deletes it.
    const state = playThrough('cross');
    const first = state.knockout!.rounds[0]!;
    for (const tie of first.ties) {
      const positions = [tie.homeId, tie.awayId].map((id) => groupPosition(state, id));
      expect(positions.sort()).toEqual([1, 2]);
      // ...and from different groups.
      expect(groupIndexOf(state, tie.homeId)).not.toBe(groupIndexOf(state, tie.awayId));
    }
  });

  it('is a semi-final and a final, and nothing longer', () => {
    const state = playThrough('length');
    expect(totalRounds(state.knockout!)).toBe(KNOCKOUT_ROUNDS);
    expect(state.knockout!.rounds).toHaveLength(KNOCKOUT_ROUNDS);
    expect(GROUP_ROUNDS + KNOCKOUT_ROUNDS).toBe(INTERNATIONAL_MATCHES);
  });

  it('always produces exactly one champion', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const state = playThrough(seed);
      const champion = championNation(state);
      expect(champion, seed).toBeTruthy();
      expect(knockoutField(state), seed).toContain(champion);
      expect(state.knockout!.survivors, seed).toHaveLength(1);
    }
  });

  it('says a nation reached the knockout even after it lost there', () => {
    // "Reached it" and "still in it" are different questions. The beaten
    // semi-finalists were in the tournament; only one nation ends up a survivor.
    const state = playThrough('reached');
    const field = knockoutField(state);
    expect(field.filter((id) => reachedKnockout(state, id))).toHaveLength(
      GROUP_COUNT * QUALIFY_PER_GROUP,
    );
    for (const nation of nationGroups(state).flat()) {
      expect(reachedKnockout(state, nation), nation).toBe(field.includes(nation));
    }
    expect(state.knockout!.survivors).toHaveLength(1);
  });

  it('reports a full field before a single round has been drawn', () => {
    // A round is only drawn when somebody reaches it, so a tournament nobody has
    // played yet has a field and no rounds. Reading the rounds alone reported
    // every qualified nation as eliminated.
    const rng = new Rng('undrawn');
    const state = createInternational(rng);
    for (let round = 1; round <= GROUP_ROUNDS; round++) {
      playGroupRound(rng, state, round, lookup);
      closeGroupRound(state, round);
    }
    startKnockout(state);
    expect(state.knockout!.rounds).toHaveLength(0);
    expect(knockoutField(state)).toHaveLength(GROUP_COUNT * QUALIFY_PER_GROUP);
  });

  it('is decided by the football, so the better nations win it more often', () => {
    const wins = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const champion = championNation(playThrough(`season-${i}`))!;
      wins.set(champion, (wins.get(champion) ?? 0) + 1);
    }
    // The weakest country IN THE TOURNAMENT, derived rather than named: the
    // field is the top of the European order, so which country that is changes
    // as the world does.
    const field = qualifyingGroups().flat();
    const best = nationId(field[0]!);
    const worst = nationId(field[field.length - 1]!);
    expect(wins.get(best) ?? 0).toBeGreaterThan(wins.get(worst) ?? 0);
    // ...but never so lopsided that the tournament is a formality.
    expect(wins.get(worst) ?? 0).toBeGreaterThan(0);
    expect(wins.size).toBeGreaterThan(4);
    // And a country outside the field cannot win a tournament it is not in.
    const missed = COUNTRIES.map((c) => c.id).find((id) => !field.includes(id))!;
    expect(wins.get(nationId(missed)) ?? 0).toBe(0);
  });

  it('is deterministic from its seed', () => {
    const a = playThrough('same');
    const b = playThrough('same');
    expect(championNation(a)).toBe(championNation(b));
    expect(a.table).toEqual(b.table);
    expect(a.results).toEqual(b.results);
  });
});
