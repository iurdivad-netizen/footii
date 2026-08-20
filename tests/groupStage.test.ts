import { describe, expect, it } from 'vitest';
import {
  GROUP_MATCHES,
  GROUP_SIZE,
  QUALIFY_PER_GROUP,
  closeGroupRound,
  createGroupStage,
  drawGroups,
  groupFixtureFor,
  groupIndexOf,
  groupPositionOf,
  groupTableOf,
  playGroupRound,
  reachedKnockout,
  recordGroupResult,
  startKnockout,
  stillInCompetition,
} from '../src/core/career/groupStage.ts';
import { Rng } from '../src/core/rng.ts';
import { getTeam, teamsInCountry } from '../src/data/gameData.ts';

/**
 * GROUPS, AND THE BRACKET THAT COMES OUT OF THEM
 *
 * The risk here is all in the seams. A group stage that quietly drops a club, a
 * knockout built before the groups have finished, or a bracket that pairs two
 * group winners in the first round would each look like working football and
 * produce a competition that means nothing.
 */

const FIELD = teamsInCountry('england').map((team) => team.id);
const lookup = (id: string) => getTeam(id);

function stage(field: readonly string[] = FIELD) {
  return createGroupStage('championsLeague', field, new Rng('draw'));
}

/** Play every group round through, leaving nobody out. */
function playGroups(state: ReturnType<typeof stage>) {
  for (let round = 1; round <= GROUP_MATCHES; round += 1) {
    playGroupRound(new Rng(`r${round}`), state, round, lookup);
    closeGroupRound(state, round);
  }
  return state;
}

describe('drawing the groups', () => {
  it('splits sixteen clubs into four groups of four, losing nobody', () => {
    const groups = drawGroups(FIELD);
    expect(groups).toHaveLength(4);
    for (const group of groups) expect(group).toHaveLength(GROUP_SIZE);
    expect(new Set(groups.flat()).size).toBe(16);
  });

  it('snakes the seeds rather than slicing them in order', () => {
    // The field arrives in strength order. Slicing consecutive fours would put
    // the four best clubs in group one and make three groups pointless.
    // Eight clubs make two groups of four. Dealt 1-2, then 2-1, then 1-2 again:
    // the strongest and the weakest end up together, which is the point.
    const groups = drawGroups(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual(['a', 'd', 'e', 'h']);
    expect(groups[1]).toEqual(['b', 'c', 'f', 'g']);
  });

  it('drops a remainder rather than making a group of the wrong size', () => {
    const groups = drawGroups(['a', 'b', 'c', 'd', 'e']);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(GROUP_SIZE);
  });
});

describe('the group stage', () => {
  it('gives every club three matches and nobody a fourth', () => {
    const state = stage();
    for (const id of FIELD) {
      const mine = state.fixtures.filter((f) => f.homeId === id || f.awayId === id);
      expect(mine).toHaveLength(GROUP_MATCHES);
    }
  });

  it('never puts a club against somebody from another group', () => {
    const state = stage();
    for (const fixture of state.fixtures) {
      expect(groupIndexOf(state, fixture.homeId)).toBe(groupIndexOf(state, fixture.awayId));
    }
  });

  it('finds a club fixture for a given round', () => {
    const state = stage();
    const fixture = groupFixtureFor(state, FIELD[0]!, 2)!;
    expect(fixture).not.toBeNull();
    expect(fixture.round).toBe(2);
    expect([fixture.homeId, fixture.awayId]).toContain(FIELD[0]);
  });

  it('counts a result once, however many times it is offered', () => {
    // The player's own fixture is recorded when he plays it and again when the
    // round is settled around him.
    const state = stage();
    const fixture = state.fixtures[0]!;
    const result = { ...fixture, homeGoals: 2, awayGoals: 1 };
    recordGroupResult(state, result);
    recordGroupResult(state, result);

    expect(state.results).toHaveLength(1);
    const row = state.table.find((r) => r.teamId === fixture.homeId)!;
    expect(row.played).toBe(1);
    expect(row.points).toBe(3);
  });

  it('leaves the player own fixture for him to play', () => {
    const state = stage();
    const me = FIELD[0]!;
    playGroupRound(new Rng('r1'), state, 1, lookup, me);

    const mine = groupFixtureFor(state, me, 1)!;
    expect(state.results.some((r) => r.homeId === mine.homeId && r.awayId === mine.awayId)).toBe(false);
    // And everybody else in that round has been settled.
    expect(state.results).toHaveLength(state.fixtures.filter((f) => f.round === 1).length - 1);
  });

  it('does not close a round while a fixture in it is unplayed', () => {
    const state = stage();
    playGroupRound(new Rng('r1'), state, 1, lookup, FIELD[0]!);
    closeGroupRound(state, 1);
    expect(state.groupRoundsPlayed).toBe(0);

    playGroupRound(new Rng('r1b'), state, 1, lookup);
    closeGroupRound(state, 1);
    expect(state.groupRoundsPlayed).toBe(1);
  });

  it('builds a table you can read a group off', () => {
    const state = playGroups(stage());
    for (let group = 0; group < state.groups.length; group += 1) {
      const table = groupTableOf(state, group);
      expect(table).toHaveLength(GROUP_SIZE);
      for (const row of table) expect(row.played).toBe(GROUP_MATCHES);
      // Sorted best first.
      for (let i = 1; i < table.length; i += 1) {
        expect(table[i - 1]!.points).toBeGreaterThanOrEqual(table[i]!.points);
      }
    }
    expect(groupPositionOf(state, groupTableOf(state, 0)[0]!.teamId)).toBe(1);
  });
});

describe('the knockout that comes out of it', () => {
  it('refuses to start while the groups are still being played', () => {
    const state = stage();
    expect(startKnockout(state)).toBeNull();
    playGroupRound(new Rng('r1'), state, 1, lookup);
    closeGroupRound(state, 1);
    expect(startKnockout(state)).toBeNull();
  });

  it('takes the top two from every group, and nobody else', () => {
    const state = playGroups(stage());
    const knockout = startKnockout(state)!;

    expect(knockout.survivors).toHaveLength(state.groups.length * QUALIFY_PER_GROUP);
    const expected = state.groups.flatMap((_, group) =>
      groupTableOf(state, group)
        .slice(0, QUALIFY_PER_GROUP)
        .map((row) => row.teamId),
    );
    expect([...knockout.survivors].sort()).toEqual([...expected].sort());
  });

  it('crosses the bracket, so two group winners never meet in the first round', () => {
    const state = playGroups(stage());
    const knockout = startKnockout(state)!;
    const winners = new Set(state.groups.map((_, g) => groupTableOf(state, g)[0]!.teamId));

    // Seeded pairing: survivors are paired in the order they are held.
    for (let i = 0; i + 1 < knockout.survivors.length; i += 2) {
      const pair = [knockout.survivors[i]!, knockout.survivors[i + 1]!];
      expect(pair.filter((id) => winners.has(id))).toHaveLength(1);
    }
  });

  it('is seeded rather than drawn, so the pairing is not shuffled', () => {
    const state = playGroups(stage());
    expect(startKnockout(state)!.seeded).toBe(true);
  });

  it('hands back the same knockout when asked twice', () => {
    const state = playGroups(stage());
    expect(startKnockout(state)).toBe(startKnockout(state));
  });

  it('knows who got out of the group and who did not', () => {
    const state = playGroups(stage());
    const knockout = startKnockout(state)!;
    for (const id of knockout.survivors) expect(reachedKnockout(state, id)).toBe(true);

    const eliminated = FIELD.filter((id) => !knockout.survivors.includes(id));
    expect(eliminated.length).toBeGreaterThan(0);
    for (const id of eliminated) expect(reachedKnockout(state, id)).toBe(false);
  });
});

describe('still in it', () => {
  it('counts everybody while the groups are being played', () => {
    const state = stage();
    for (const id of FIELD) expect(stillInCompetition(state, id)).toBe(true);
  });

  it('counts only the qualifiers once the groups are done', () => {
    const state = playGroups(stage());
    const knockout = startKnockout(state)!;
    for (const id of FIELD) {
      expect(stillInCompetition(state, id)).toBe(knockout.survivors.includes(id));
    }
  });
});
