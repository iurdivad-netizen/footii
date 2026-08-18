import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import {
  DRIFT_LIMIT,
  applyStrength,
  driftClub,
  driftSeason,
  finishShare,
  initialStrengths,
  strengthOf,
} from '../src/core/career/clubDrift.ts';
import type { ClubStrength } from '../src/core/career/clubDrift.ts';
import { applyResult, emptyTable } from '../src/core/career/league.ts';
import type { TableRow } from '../src/core/career/league.ts';

const lookup = (id: string) => getTeam(id);

function tableInOrder(ids: readonly string[]): TableRow[] {
  const table = emptyTable(ids);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      applyResult(table, { round: 1, homeId: ids[i]!, awayId: ids[j]!, homeGoals: 1, awayGoals: 0 });
    }
  }
  return table;
}

/** Drift one club repeatedly at a fixed finishing position. */
function driftFor(seasons: number, base: ClubStrength, share: number): ClubStrength {
  let current = { ...base };
  for (let i = 0; i < seasons; i++) {
    current = driftClub(new Rng(`season${i}`), current, base, share);
  }
  return current;
}

const BASE: ClubStrength = { attack: 60, midfield: 60, defence: 60 };

describe('a club drifting season to season', () => {
  it('strengthens a club that keeps winning its division', () => {
    const after = driftFor(6, BASE, 1);
    expect(after.attack).toBeGreaterThan(BASE.attack);
    expect(after.midfield).toBeGreaterThan(BASE.midfield);
    expect(after.defence).toBeGreaterThan(BASE.defence);
  });

  it('weakens a club that keeps finishing bottom', () => {
    const after = driftFor(6, BASE, 0);
    expect(after.attack).toBeLessThan(BASE.attack);
    expect(after.midfield).toBeLessThan(BASE.midfield);
    expect(after.defence).toBeLessThan(BASE.defence);
  });

  it('leaves a mid-table club roughly where it started', () => {
    const after = driftFor(8, BASE, 0.5);
    expect(Math.abs(after.attack - BASE.attack)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.defence - BASE.defence)).toBeLessThanOrEqual(3);
  });

  it('never lets a club run away from its own identity', () => {
    // Twenty-five seasons of winning everything is still leashed to the base,
    // which is what stops the smallest club in the game becoming the biggest.
    const after = driftFor(25, BASE, 1);
    expect(after.attack).toBeLessThanOrEqual(BASE.attack + DRIFT_LIMIT);
    expect(after.midfield).toBeLessThanOrEqual(BASE.midfield + DRIFT_LIMIT);
    expect(after.defence).toBeLessThanOrEqual(BASE.defence + DRIFT_LIMIT);
  });

  it('never lets a club drift below its own floor either', () => {
    const after = driftFor(25, BASE, 0);
    expect(after.attack).toBeGreaterThanOrEqual(BASE.attack - DRIFT_LIMIT);
    expect(after.defence).toBeGreaterThanOrEqual(BASE.defence - DRIFT_LIMIT);
  });

  it('keeps ratings on the 1-99 scale even at the extremes', () => {
    const tiny: ClubStrength = { attack: 3, midfield: 3, defence: 3 };
    const after = driftFor(20, tiny, 0);
    for (const value of Object.values(after)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(99);
    }
  });

  it('is deterministic from its seed', () => {
    const a = driftClub(new Rng('same'), BASE, BASE, 0.8);
    const b = driftClub(new Rng('same'), BASE, BASE, 0.8);
    expect(a).toEqual(b);
  });
});

describe('reading a finishing position', () => {
  it('gives 1 to the champions and 0 to the bottom club', () => {
    expect(finishShare(1, 8)).toBe(1);
    expect(finishShare(8, 8)).toBe(0);
    expect(finishShare(4, 7)).toBeCloseTo(0.5, 5);
  });

  it('treats a one-club division as a win', () => {
    expect(finishShare(1, 1)).toBe(1);
  });
});

describe('drifting a whole season', () => {
  const strengths = initialStrengths(TEAMS);

  it('starts every club at the ratings in the data file', () => {
    for (const team of TEAMS) {
      expect(strengths[team.id]).toEqual(strengthOf(team));
    }
  });

  it('moves the champions up and the bottom club down', () => {
    const ids = TEAMS.slice(0, 8).map((t) => t.id);
    const next = driftSeason(new Rng('season'), {
      strengths,
      tables: [tableInOrder(ids)],
      lookup,
    });

    const champion = ids[0]!;
    const bottom = ids[ids.length - 1]!;
    expect(next[champion]!.attack).toBeGreaterThanOrEqual(strengths[champion]!.attack);
    expect(next[bottom]!.attack).toBeLessThanOrEqual(strengths[bottom]!.attack);
  });

  it('returns a new map rather than mutating the one it was given', () => {
    const before = JSON.stringify(strengths);
    driftSeason(new Rng('nomutate'), {
      strengths,
      tables: [tableInOrder(TEAMS.slice(0, 8).map((t) => t.id))],
      lookup,
    });
    expect(JSON.stringify(strengths)).toBe(before);
  });

  it('leaves clubs that did not play a season untouched', () => {
    const ids = TEAMS.slice(0, 8).map((t) => t.id);
    const next = driftSeason(new Rng('partial'), {
      strengths,
      tables: [tableInOrder(ids)],
      lookup,
    });
    const absent = TEAMS[TEAMS.length - 1]!.id;
    expect(next[absent]).toEqual(strengths[absent]);
  });
});

describe('applying drift to a club', () => {
  const team = getTeam(TEAMS[0]!.id);

  it('overrides the three ratings that move', () => {
    const drifted = applyStrength(team, { [team.id]: { attack: 90, midfield: 91, defence: 92 } });
    expect(drifted.ratings.attack).toBe(90);
    expect(drifted.ratings.midfield).toBe(91);
    expect(drifted.ratings.defence).toBe(92);
  });

  it('leaves the ratings that define how a club PLAYS alone', () => {
    const drifted = applyStrength(team, { [team.id]: { attack: 90, midfield: 91, defence: 92 } });
    expect(drifted.ratings.possession).toBe(team.ratings.possession);
    expect(drifted.ratings.crossing).toBe(team.ratings.crossing);
    expect(drifted.ratings.tempo).toBe(team.ratings.tempo);
    expect(drifted.style).toBe(team.style);
  });

  it('returns the club untouched when it has no drift recorded', () => {
    expect(applyStrength(team, {})).toBe(team);
    expect(applyStrength(team, undefined)).toBe(team);
  });

  it('does not mutate the loaded club', () => {
    const before = team.ratings.attack;
    applyStrength(team, { [team.id]: { attack: 99, midfield: 99, defence: 99 } });
    expect(getTeam(TEAMS[0]!.id).ratings.attack).toBe(before);
  });
});
