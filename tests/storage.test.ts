import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, defaultSettings, emptyCareer, migrate } from '../src/persistence/storage.ts';
import type { SaveData } from '../src/persistence/storage.ts';
import { startCareer } from '../src/simulation/CareerService.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { TEAMS } from '../src/data/gameData.ts';

function career() {
  return startCareer({
    player: createPlayer({ name: 'Test', position: 'ST', attributes: {} }),
    clubId: 'northport-city',
    leagueTeamIds: TEAMS.map((t) => t.id),
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
