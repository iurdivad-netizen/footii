import { describe, expect, it } from 'vitest';
import { createPlayer, currentAbility } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS } from '../src/core/player/attributes.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { seasonComplete } from '../src/core/career/career.ts';
import {
  acceptOffer,
  canStay,
  endSeason,
  recordPlayerMatch,
  startCareer,
  stayAtClub,
} from '../src/simulation/CareerService.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import {
  attributeChanges,
  attributeTimeline,
  biggestMovers,
  seasonRows,
} from '../src/core/career/attributeTimeline.ts';
import { windowAcross } from '../src/simulation/DecisionBenchmark.ts';
import {
  CAREER_SLOTS,
  SAVE_VERSION,
  activeCareer,
  defaultSettings,
  emptyCareer,
  migrate,
} from '../src/persistence/storage.ts';

/**
 * A FOOTBALLER ACROSS A CAREER.
 *
 * `history` used to store statistics and nothing about the man, so the game could
 * say how many goals a season produced and not how the player producing them had
 * changed. These play real careers through real season closes and check what is
 * now recorded — and, as importantly, what is NOT invented for a career old
 * enough to have missed it.
 */

const lookup = (id: string) => getTeam(id);

function prospect(): Player {
  return {
    ...createPlayer({
      name: 'Arc',
      position: 'ST',
      age: 18,
      experience: 12,
      baseAttribute: 54,
      reputation: 30,
      potentialAbility: 86,
      attributes: { finishing: 64, awareness: 48, composure: 46, decisionMaking: 44 },
    }),
  };
}

function playSeason(state: CareerState, rating = 7.5): void {
  while (!seasonComplete(state)) {
    const stats = createMatchStats();
    stats.minutes = 90;
    stats.goals = 1;
    stats.assists = 1;
    recordPlayerMatch(
      state,
      { stats, rating, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 60 },
      lookup,
    );
  }
  const outcome = endSeason(state, lookup);
  if (outcome.offers.length > 0 && !canStay(state)) acceptOffer(state, outcome.offers[0]!.id, lookup);
  else if (canStay(state)) stayAtClub(state);
  state.trainingPoints = 0;
}

function career(seasons: number): { state: CareerState; created: Player } {
  const created = prospect();
  const state = startCareer({
    player: { ...created, attributes: { ...created.attributes } },
    clubId: 'stapleton-vale',
    teams: TEAMS,
    seed: 'timeline',
  });
  for (let i = 0; i < seasons; i++) playSeason(state);
  return { state, created };
}

describe('the attributes are grouped into four families', () => {
  it('puts every attribute in exactly one', () => {
    const all = ATTRIBUTE_GROUPS.flatMap((group) => [...group.keys]);
    expect(all.sort()).toEqual([...ATTRIBUTE_KEYS].sort());
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('a career played from the start', () => {
  const { state, created } = career(3);
  const timeline = attributeTimeline(state);

  it('has a first day, a close for every season, and now', () => {
    expect(timeline.complete).toBe(true);
    expect(timeline.points.map((point) => point.kind)).toEqual([
      'origin',
      'season-end',
      'season-end',
      'season-end',
      'now',
    ]);
    expect(timeline.points.filter((p) => p.kind === 'season-end').map((p) => p.seasonNumber)).toEqual([1, 2, 3]);
  });

  it('starts from the footballer that was created, exactly', () => {
    expect(timeline.points[0]!.attributes).toEqual(created.attributes);
    expect(timeline.points[0]!.age).toBe(created.age);
    expect(timeline.points[0]!.experience).toBe(created.experience);
    expect(timeline.points[0]!.ability).toBe(currentAbility(created));
  });

  it('records what he was at the end of each season, from the same source as the record', () => {
    const closes = timeline.points.filter((p) => p.kind === 'season-end');
    closes.forEach((point, i) => {
      const record = state.history[i]!;
      expect(point.attributes).toEqual(record.attributes);
      expect(point.ability).toBe(record.ability);
      expect(point.age).toBe(record.age);
      expect(point.clubId).toBe(record.clubId);
    });
  });

  it('ends on the footballer as he is now, by the hub\'s own number', () => {
    const now = timeline.points[timeline.points.length - 1]!;
    expect(now.ability).toBe(currentAbility(state.player));
    expect(now.attributes).toEqual(state.player.attributes);
    expect(now.age).toBe(state.player.age);
  });

  it('shows a young player who played well having grown', () => {
    const first = timeline.points[0]!;
    const last = timeline.points[timeline.points.length - 1]!;
    expect(last.ability).toBeGreaterThan(first.ability);
    expect(last.experience).toBeGreaterThan(first.experience);
  });

  it('ages one year a season', () => {
    const closes = timeline.points.filter((p) => p.kind === 'season-end').map((p) => p.age);
    expect(closes).toEqual([18, 19, 20]);
  });

  it('holds copies, so a later change to him does not rewrite the past', () => {
    const before = timeline.points[1]!.attributes.finishing;
    state.player.attributes.finishing = 1;
    const again = attributeTimeline(state);
    expect(again.points[1]!.attributes.finishing).toBe(before);
    // and a timeline taken earlier is not moved by it either
    expect(timeline.points[timeline.points.length - 1]!.attributes.finishing).not.toBe(1);
    state.player.attributes.finishing = timeline.points[timeline.points.length - 1]!.attributes.finishing;
  });

  it('makes the window a pure function of what he was at each point', () => {
    const windows = windowAcross(state.player, timeline.points);
    expect(windows).toHaveLength(timeline.points.length);
    expect(windows[windows.length - 1]!).toBeGreaterThan(windows[0]!);
    for (const value of windows) expect(Number.isFinite(value)).toBe(true);
  });
});

describe('a career on its first day', () => {
  it('is two points that agree, and says there is no career yet', () => {
    const { state, created } = career(0);
    const timeline = attributeTimeline(state);
    expect(timeline.points.map((p) => p.kind)).toEqual(['origin', 'now']);
    expect(timeline.points[0]!.attributes).toEqual(timeline.points[1]!.attributes);
    expect(timeline.points[1]!.attributes).toEqual(created.attributes);
    expect(attributeChanges(timeline).every((change) => change.delta === 0)).toBe(true);
    expect(biggestMovers(attributeChanges(timeline))).toEqual({ gained: [], slipped: [] });
  });
});

describe('training between seasons shows up in the season it belongs to', () => {
  it('is growth in the NEXT segment, and the season it followed is untouched', () => {
    const { state } = career(1);
    const closeOfFirst = state.history[0]!.attributes!.composure;
    // What the pre-season screen does after a season closes.
    state.player.attributes.composure += 12;
    playSeason(state);
    const points = attributeTimeline(state).points.filter((p) => p.kind === 'season-end');
    expect(points[0]!.attributes.composure).toBe(closeOfFirst);
    expect(points[1]!.attributes.composure - points[0]!.attributes.composure).toBeGreaterThanOrEqual(12);
  });
});

describe('a career that began before this was recorded', () => {
  it('never invents a start: it has the season in progress, and says so', () => {
    const { state } = career(2);
    // What such a save looks like: seasons with nothing about the footballer.
    state.origin = null;
    for (const record of state.history) {
      delete record.attributes;
      delete record.ability;
      delete record.experience;
    }
    const timeline = attributeTimeline(state);
    expect(timeline.complete).toBe(false);
    expect(timeline.points.map((p) => p.kind)).toEqual(['season-start', 'now']);
    expect(timeline.points[0]!.attributes).toEqual(state.seasonStartAttributes);
    expect(timeline.points[0]!.seasonNumber).toBe(state.seasonNumber);
  });

  it('keeps whatever seasons WERE recorded, and drops only the start', () => {
    const { state } = career(3);
    state.origin = null;
    const timeline = attributeTimeline(state);
    expect(timeline.complete).toBe(false);
    expect(timeline.points.map((p) => p.kind)).toEqual([
      'season-end',
      'season-end',
      'season-end',
      'now',
    ]);
  });

  it('skips a season with no attributes without drawing a hole through the line', () => {
    const { state } = career(3);
    delete state.history[1]!.attributes;
    const points = attributeTimeline(state).points.filter((p) => p.kind === 'season-end');
    expect(points.map((p) => p.seasonNumber)).toEqual([1, 3]);
  });
});

describe('what changed, attribute by attribute', () => {
  const { state } = career(3);
  const timeline = attributeTimeline(state);
  const changes = attributeChanges(timeline);

  it('covers all twenty once, in family order', () => {
    expect(changes).toHaveLength(ATTRIBUTE_KEYS.length);
    expect(changes.map((c) => c.key)).toEqual(ATTRIBUTE_GROUPS.flatMap((g) => [...g.keys]));
  });

  it('measures each from the first point to the last, with a value at every point between', () => {
    for (const change of changes) {
      expect(change.delta).toBe(change.now - change.start);
      expect(change.series).toHaveLength(timeline.points.length);
      expect(change.series[0]).toBe(change.start);
      expect(change.series[change.series.length - 1]).toBe(change.now);
    }
  });

  it('names only what actually moved, biggest first', () => {
    const { gained, slipped } = biggestMovers(changes);
    expect(gained.every((c) => c.delta > 0)).toBe(true);
    expect(slipped.every((c) => c.delta < 0)).toBe(true);
    for (let i = 1; i < gained.length; i++) expect(gained[i - 1]!.delta).toBeGreaterThanOrEqual(gained[i]!.delta);
    for (let i = 1; i < slipped.length; i++) expect(slipped[i - 1]!.delta).toBeLessThanOrEqual(slipped[i]!.delta);
    expect(gained.length).toBeLessThanOrEqual(3);
  });

  it('does not call an unchanged attribute a gain', () => {
    const flat = changes.map((c) => ({ ...c, delta: 0 }));
    expect(biggestMovers(flat)).toEqual({ gained: [], slipped: [] });
  });

  it('gives a season table with what changed since the row before', () => {
    const rows = seasonRows(timeline);
    expect(rows).toHaveLength(timeline.points.length);
    expect(rows[0]!.abilityDelta).toBeNull();
    rows.slice(1).forEach((row, i) => {
      expect(row.abilityDelta).toBe(row.point.ability - rows[i]!.point.ability);
    });
  });
});

describe('an older save is brought forward without inventing anything', () => {
  const save = (careers: unknown[]) =>
    ({
      version: 30,
      career: emptyCareer(),
      settings: defaultSettings(),
      careers: [...careers, ...Array.from({ length: CAREER_SLOTS - careers.length }, () => null)],
      activeSlot: 0,
      hallOfFame: [],
    }) as never;

  it('gives a career that has not finished a season its exact first day', () => {
    const { state } = career(0);
    const older = { ...state } as Record<string, unknown>;
    delete older.origin;
    const migrated = migrate(save([older]))!;
    expect(migrated.version).toBe(SAVE_VERSION);
    const brought = activeCareer(migrated)!;
    expect(brought.origin).toEqual({
      attributes: state.seasonStartAttributes,
      ability: state.seasonStartAbility,
      age: state.player.age,
      experience: state.seasonStartExperience,
    });
  });

  it('leaves a career that HAS finished seasons without one, rather than guessing', () => {
    const { state } = career(2);
    const older = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    delete older.origin;
    const migrated = migrate(save([older]))!;
    expect(activeCareer(migrated)!.origin).toBeNull();
  });

  it('does not overwrite an origin a save already has', () => {
    const { state } = career(0);
    const migrated = migrate(save([{ ...state }]))!;
    expect(activeCareer(migrated)!.origin).toEqual(state.origin);
  });

  it('loads an old career into a timeline that says where the record begins', () => {
    const { state } = career(2);
    const older = JSON.parse(JSON.stringify(state)) as CareerState;
    delete older.origin;
    for (const record of older.history) {
      delete record.attributes;
      delete record.ability;
      delete record.experience;
    }
    const brought = activeCareer(migrate(save([older]))!)!;
    const timeline = attributeTimeline(brought);
    expect(timeline.complete).toBe(false);
    expect(timeline.points).toHaveLength(2);
  });

  it('is whole again from the next season close', () => {
    const { state } = career(2);
    const older = JSON.parse(JSON.stringify(state)) as CareerState;
    delete older.origin;
    for (const record of older.history) {
      delete record.attributes;
      delete record.ability;
      delete record.experience;
    }
    const brought = activeCareer(migrate(save([older]))!)!;
    playSeason(brought);
    const closes = attributeTimeline(brought).points.filter((p) => p.kind === 'season-end');
    // The seasons before the migration stay empty; the one after it is recorded.
    expect(closes).toHaveLength(1);
    expect(closes[0]!.seasonNumber).toBe(brought.seasonNumber - 1);
  });
});
