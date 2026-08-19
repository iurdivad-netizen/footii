import { describe, expect, it } from 'vitest';
import {
  SAVE_VERSION,
  defaultSettings,
  emptyCareer,
  isUsableCareer,
  migrate,
} from '../src/persistence/storage.ts';
import type { SaveData } from '../src/persistence/storage.ts';
import { startCareer } from '../src/simulation/CareerService.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { TEAMS } from '../src/data/gameData.ts';

function career() {
  return startCareer({
    player: createPlayer({ name: 'Test', position: 'ST', attributes: {} }),
    clubId: 'northport-city',
    teams: TEAMS,
    seed: 'save',
  });
}

describe('save migration', () => {
  it('rejects a save with no recognisable shape', () => {
    expect(migrate({} as never)).toBeNull();
    expect(migrate({ version: 3 } as never)).toBeNull();
  });

  it('brings a v1 save forward, keeping quick-match totals and adding defaults', () => {
    const v1 = { version: 1, career: { ...emptyCareer(), goals: 7, matches: 3 } };
    const migrated = migrate(v1 as never)!;
    expect(migrated).not.toBeNull();
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.career.goals).toBe(7);
    expect(migrated.careerState).toBeUndefined();
    expect(migrated.settings).toEqual(defaultSettings());
  });

  it('backfills a v2 career with the season snapshot and training points', () => {
    const state = career();
    // Simulate a v2 save: the newer fields did not exist yet.
    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.seasonStartAttributes;
    delete legacy.seasonStartAbility;
    delete legacy.seasonStartExperience;
    delete legacy.trainingPoints;

    const migrated = migrate({
      version: 2,
      career: emptyCareer(),
      careerState: legacy,
    } as never)!;

    expect(migrated.version).toBe(SAVE_VERSION);
    const restored = migrated.careerState!;
    expect(restored.seasonStartAttributes).toEqual(restored.player.attributes);
    expect(restored.seasonStartAbility).toBeGreaterThan(0);
    expect(restored.trainingPoints).toBe(0);
  });

  it('backfills a v3 career with an empty transfer window and no move history', () => {
    const state = career();
    // Simulate a v3 save: transfers did not exist yet.
    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.offers;
    delete legacy.transfers;

    const migrated = migrate({
      version: 3,
      career: emptyCareer(),
      careerState: legacy,
    } as never)!;

    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.careerState!.offers).toEqual([]);
    expect(migrated.careerState!.transfers).toEqual([]);
  });

  it('backfills a v4 career with a pyramid, a contract and an honours list', () => {
    const state = career();
    // Simulate a v4 save: one division, no contracts, no honours, no caps.
    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.division;
    delete legacy.countryId;
    delete legacy.leagues;
    delete legacy.clubStrengths;
    delete legacy.contract;
    delete legacy.renewal;
    delete legacy.honours;
    delete legacy.careerEarnings;
    delete (legacy.player as Record<string, unknown>).caps;

    const migrated = migrate({
      version: 4,
      career: emptyCareer(),
      careerState: legacy,
    } as never)!;

    expect(migrated).not.toBeNull();
    expect(migrated.version).toBe(SAVE_VERSION);

    const restored = migrated.careerState!;
    // The career keeps its club, and is placed in whichever division it is in.
    expect(restored.clubId).toBe('northport-city');
    expect(restored.division).toBe(1);
    expect(restored.countryId).toBe('england');
    expect(Object.values(restored.leagues).flat(2)).toHaveLength(TEAMS.length);
    expect(restored.clubStrengths['northport-city']).toBeTruthy();
    expect(restored.contract.clubId).toBe('northport-city');
    expect(restored.contract.yearsRemaining).toBeGreaterThan(0);
    expect(restored.honours).toEqual([]);
    expect(restored.careerEarnings).toBe(0);
    expect(restored.renewal).toBeNull();
    expect(restored.player.caps).toBe(0);
  });

  it('gives an old career\'s archived seasons a division rather than leaving them blank', () => {
    const state = career();
    const legacy = { ...state, history: [{ seasonNumber: 1, clubId: 'northport-city', position: 3, stats: state.seasonStats, age: 24 }] } as Record<string, unknown>;
    delete legacy.division;
    delete legacy.countryId;
    delete legacy.leagues;
    delete legacy.contract;

    const migrated = migrate({ version: 4, career: emptyCareer(), careerState: legacy } as never)!;
    expect(migrated.careerState!.history[0]!.division).toBe(1);
  });

  it('drops a v4 career whose club no longer exists rather than half-migrating it', () => {
    const state = career();
    const legacy = { ...state, clubId: 'a-club-that-was-deleted' } as Record<string, unknown>;
    delete legacy.contract;
    delete legacy.division;
    delete legacy.divisions;

    const migrated = migrate({ version: 4, career: emptyCareer(), careerState: legacy } as never)!;
    expect(migrated.careerState).toBeUndefined();
  });

  it('preserves settings that already exist and fills in ones that do not', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      settings: { pace: 'untimed' },
    } as never)!;
    // The chosen pace survives...
    expect(migrated.settings.pace).toBe('untimed');
    // ...and a preference added later still gets a default rather than undefined.
    expect(migrated.settings.matchSpeed).toBe(defaultSettings().matchSpeed);
  });

  it('gives a save with no settings block the defaults', () => {
    const migrated = migrate({ version: SAVE_VERSION, career: emptyCareer() } as never)!;
    expect(migrated.settings).toEqual(defaultSettings());
  });

  it('repairs a career whose history is missing rather than discarding the save', () => {
    const state = career() as unknown as Record<string, unknown>;
    delete state.history;
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careerState: state,
    } as never)!;
    expect(Array.isArray(migrated.careerState!.history)).toBe(true);
  });

  it('round-trips a full save through JSON without loss', () => {
    const original: SaveData = {
      version: SAVE_VERSION,
      career: { ...emptyCareer(), goals: 4 },
      settings: { pace: 'relaxed', matchSpeed: 2 },
      careerState: career(),
    };
    const restored = migrate(JSON.parse(JSON.stringify(original)))!;
    expect(restored.settings).toEqual(original.settings);
    expect(restored.career.goals).toBe(4);
    expect(restored.careerState!.player.name).toBe('Test');
    expect(restored.careerState!.fixtures.length).toBe(original.careerState!.fixtures.length);
  });
});

describe('career save validation', () => {
  it('accepts a well-formed career', () => {
    expect(isUsableCareer(career())).toBe(true);
  });

  it('rejects anything that is not a career object', () => {
    for (const bad of [null, undefined, 42, 'career', []]) {
      expect(isUsableCareer(bad)).toBe(false);
    }
  });

  it('rejects a career missing any field the UI reads', () => {
    const required = [
      'player',
      'clubId',
      'leagueTeamIds',
      'fixtures',
      'results',
      'table',
      'seasonStats',
      'seasonNumber',
      'nextFixtureIndex',
    ];
    for (const field of required) {
      const broken = { ...career() } as Record<string, unknown>;
      delete broken[field];
      expect(isUsableCareer(broken), `missing ${field}`).toBe(false);
    }
  });

  it('DROPS a broken career instead of letting it break the game', () => {
    // The whole point: losing one career is recoverable, a game that will not
    // start is not. A malformed career previously took the app down at boot
    // with a blank page and no route back to a menu.
    const broken = { ...career() } as Record<string, unknown>;
    delete broken.seasonStats;

    const migrated = migrate({
      version: SAVE_VERSION,
      career: { ...emptyCareer(), goals: 9 },
      careerState: broken,
    } as never)!;

    expect(migrated).not.toBeNull();
    expect(migrated.careerState).toBeUndefined();
    // Everything else survives.
    expect(migrated.career.goals).toBe(9);
    expect(migrated.settings).toEqual(defaultSettings());
  });

  it('keeps a career whose transfer fields are damaged, since those are repairable', () => {
    const state = { ...career() } as Record<string, unknown>;
    state.offers = 'not an array';
    delete state.transfers;
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careerState: state,
    } as never)!;
    expect(migrated.careerState).toBeDefined();
    expect(migrated.careerState!.offers).toEqual([]);
    expect(migrated.careerState!.transfers).toEqual([]);
  });

  it('keeps a career that is merely missing history, since that is repairable', () => {
    const state = { ...career() } as Record<string, unknown>;
    delete state.history;
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careerState: state,
    } as never)!;
    expect(migrated.careerState).toBeDefined();
    expect(migrated.careerState!.history).toEqual([]);
  });
});
