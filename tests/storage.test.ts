import { describe, expect, it } from 'vitest';
import {
  CAREER_SLOTS,
  HALL_OF_FAME_LIMIT,
  SAVE_VERSION,
  activeCareer,
  careerInSlot,
  clearHallOfFame,
  clearSlot,
  defaultSettings,
  emptySlots,
  exportFilename,
  exportSave,
  firstEmptySlot,
  importSave,
  saveCareer,
  selectSlot,
  emptyCareer,
  enshrineCareer,
  isUsableCareer,
  isUsableLegacy,
  migrate,
  removeFromHallOfFame,
} from '../src/persistence/storage.ts';
import type { CareerLegacy } from '../src/core/career/legacy.ts';
import type { SaveData } from '../src/persistence/storage.ts';
import { startCareer } from '../src/simulation/CareerService.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { TEAMS } from '../src/data/gameData.ts';
import { seasonCalendar } from '../src/core/career/calendar.ts';
import { createCareerRecords, milestones, recordMatch } from '../src/core/career/records.ts';
import { countriesByStanding, hasRecord, nationCoefficient } from '../src/core/career/coefficients.ts';
import { countriesByPrestige } from '../src/core/career/countries.ts';

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
    expect(migrated.careers[0]).toBeNull();
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
    const restored = migrated.careers[0]!;
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
    expect(migrated.careers[0]!.offers).toEqual([]);
    expect(migrated.careers[0]!.transfers).toEqual([]);
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

    const restored = migrated.careers[0]!;
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
    expect(migrated.careers[0]!.history[0]!.division).toBe(1);
  });

  it('drops a v4 career whose club no longer exists rather than half-migrating it', () => {
    const state = career();
    const legacy = { ...state, clubId: 'a-club-that-was-deleted' } as Record<string, unknown>;
    delete legacy.contract;
    delete legacy.division;
    delete legacy.divisions;

    const migrated = migrate({ version: 4, career: emptyCareer(), careerState: legacy } as never)!;
    expect(migrated.careers[0]).toBeNull();
  });

  it('leaves a migrated v5 career with a PLAYABLE season, not an empty one', () => {
    // The bug this exists to catch: clearing the old fixture list without
    // building a new one leaves a career that reports itself complete on the
    // next boot, ends the season against an empty table, and tells the player
    // he finished 0th and was champion.
    const state = career();
    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.countryId;
    delete legacy.leagues;

    const migrated = migrate({ version: 5, career: emptyCareer(), careerState: legacy } as never)!;
    const restored = migrated.careers[0]!;

    expect(restored.leagueTeamIds).toHaveLength(16);
    expect(restored.table).toHaveLength(16);
    expect(restored.nextFixtureIndex).toBe(0);
    expect(restored.seasonStats.matches).toBe(0);

    const own = restored.fixtures.filter(
      (f) => f.homeId === restored.clubId || f.awayId === restored.clubId,
    );
    expect(own).toHaveLength(30);
  });

  it('joins a v6 career to the cups without losing the league season it is in', () => {
    const state = career();
    state.nextFixtureIndex = 7;
    state.seasonStats.matches = 7;
    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.cups;
    delete legacy.leagueStats;
    delete legacy.calendarIndex;

    const migrated = migrate({ version: 6, career: emptyCareer(), careerState: legacy } as never)!;
    const restored = migrated.careers[0]!;

    expect(migrated.version).toBe(SAVE_VERSION);
    // The league season is untouched: seven matches in is still seven in.
    expect(restored.nextFixtureIndex).toBe(7);
    expect(restored.seasonStats.matches).toBe(7);
    expect(restored.leagueStats.matches).toBe(7);
    // The two indexes count different things, so this is NOT 7. The calendar
    // includes cup slots, and a cup round falls before a player's eighth league
    // match — so the slot holding it sits further along than the league count.
    const calendar = seasonCalendar(
      restored.fixtures.filter(
        (f) => f.homeId === restored.clubId || f.awayId === restored.clubId,
      ).length,
    );
    const slot = calendar[restored.calendarIndex]!;
    expect(slot.competition).toBe('league');
    expect(slot.round).toBe(8);
    expect(restored.calendarIndex).toBeGreaterThan(7);
    // Every league slot before it is one he has already played.
    expect(
      calendar.slice(0, restored.calendarIndex).filter((s) => s.competition === 'league'),
    ).toHaveLength(7);
    // Both knockouts exist, entered by the league he is actually in.
    expect(restored.cups.nationalCup.survivors).toEqual(restored.leagueTeamIds);
    expect(restored.cups.leagueCup.winnerId).toBeNull();
    expect(restored.cups.nationalCup.rounds).toEqual([]);
  });

  it('joins a v7 career to Europe and the record book without inventing history', () => {
    const state = career();
    state.calendarIndex = 9;
    state.seasonStats.matches = 6;
    state.history.push({
      seasonNumber: 1,
      clubId: state.clubId,
      countryId: state.countryId,
      division: 1,
      position: 4,
      age: 18,
      stats: state.leagueStats,
    } as never);

    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.europe;
    delete legacy.europeanEntries;
    delete legacy.records;
    delete (legacy.history as Record<string, unknown>[])[0]!.europeanTier;
    delete (legacy.history as Record<string, unknown>[])[0]!.wonEurope;

    const migrated = migrate({ version: 7, career: emptyCareer(), careerState: legacy } as never)!;
    const restored = migrated.careers[0]!;

    expect(migrated.version).toBe(SAVE_VERSION);
    // The season in progress is untouched — a migration is not a new season.
    expect(restored.calendarIndex).toBe(9);
    expect(restored.seasonStats.matches).toBe(6);

    // European entry was decided by a season already archived, so a career in
    // progress simply is not in Europe this year.
    expect(restored.europe).toBeNull();
    expect(restored.europeanEntries).toEqual({});

    // The record book starts EMPTY rather than being guessed at: a hat-trick
    // count inferred from season totals would be wrong, and a wrong record is
    // worse than an absent one.
    expect(restored.records).toEqual(createCareerRecords());
    expect(milestones(restored.records)).toEqual([]);

    // Seasons already played did not happen in Europe.
    expect(restored.history[0]!.europeanTier).toBeNull();
    expect(restored.history[0]!.wonEurope).toBe(false);
  });

  it('keeps a v8 career\'s record book exactly as it was', () => {
    const state = career();
    recordMatch(state.records, {
      competition: 'championsLeague',
      goals: 3,
      assists: 1,
      rating: 10,
      result: 1,
    });

    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careers: [state, null, null],
      activeSlot: 0,
    } as never)!;

    // Nothing is recomputed for a save that is already current.
    expect(migrated.careers[0]!.records.hauls.hatTricks).toBe(1);
    expect(migrated.careers[0]!.records.ratings.perfect).toBe(1);
    expect(migrated.careers[0]!.records.byCompetition.championsLeague?.goals).toBe(3);
  });

  it('joins a v9 career to the coefficient with an empty record, not a made-up one', () => {
    const state = career();
    state.seasonNumber = 7;
    state.calendarIndex = 20;

    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.coefficients;

    const migrated = migrate({ version: 9, career: emptyCareer(), careerState: legacy } as never)!;
    const restored = migrated.careers[0]!;

    expect(migrated.version).toBe(SAVE_VERSION);
    // NOTHING is back-filled. A past tournament cannot be reconstructed — a
    // national side is built from its country's clubs as they stood at the
    // time, and only the current strengths survive — so inventing six seasons
    // of international football and awarding European places on it would be
    // worse than starting from nothing.
    expect(restored.coefficients).toEqual({ clubs: {}, nations: {} });
    expect(hasRecord(restored.coefficients)).toBe(false);
    // Which means the save keeps the exact European order it was being played
    // under until the season in progress is finished and scored.
    expect(countriesByStanding(restored.coefficients)).toEqual(
      countriesByPrestige().map((c) => c.id),
    );
    // The season in progress is untouched.
    expect(restored.calendarIndex).toBe(20);
  });

  it('keeps a v10 career\'s tournaments when the coefficient gains its club half', () => {
    const state = career();
    state.seasonNumber = 9;

    // The flat shape a v10 save wrote: national campaigns and nothing else.
    const legacy = { ...state } as Record<string, unknown>;
    legacy.coefficients = { england: [4, 5, 6], scotland: [1, 2, 1] };

    const migrated = migrate({ version: 10, career: emptyCareer(), careerState: legacy } as never)!;
    const restored = migrated.careers[0]!;

    expect(migrated.version).toBe(SAVE_VERSION);
    // Those tournaments were really played. Discarding them would reset a
    // country that had already earned its way off prestige.
    expect(restored.coefficients.nations).toEqual({ england: [4, 5, 6], scotland: [1, 2, 1] });
    // The club side starts empty because there is no record of it to recover:
    // European seasons were never scored before this.
    expect(restored.coefficients.clubs).toEqual({});
    expect(nationCoefficient(restored.coefficients, 'england')).toBe(5);
  });

  it('recovers a v11 tournament\'s groups from its own fixtures, not from today\'s order', () => {
    const state = career();
    state.seasonNumber = 3;

    // A v11 tournament: fixtures drawn from an eight-country world, and no
    // stored groups because the groups were recomputed from the registry.
    const legacy = { ...state } as Record<string, unknown>;
    const tournament = { ...state.international } as Record<string, unknown>;
    const drawn = (tournament.groups as string[][]).map((g) => [...g]);
    delete tournament.groups;
    legacy.international = tournament;

    const migrated = migrate({ version: 11, career: emptyCareer(), careerState: legacy } as never)!;
    const restored = migrated.careers[0]!;

    expect(migrated.version).toBe(SAVE_VERSION);
    // Redrawing against a twelve-country order would hand the player a group he
    // is not playing in, with a table that disagreed with every result already
    // recorded. The fixtures ARE the groups, so they are read back from those.
    const recovered = restored.international.groups.map((g) => [...g].sort());
    expect(recovered).toEqual(drawn.map((g) => [...g].sort()));
    // And every nation with a fixture is in exactly one group.
    const all = restored.international.groups.flat();
    expect(new Set(all).size).toBe(all.length);
    for (const fixture of restored.international.fixtures) {
      expect(all).toContain(fixture.homeId);
      expect(all).toContain(fixture.awayId);
    }
  });

  it('joins a v8 career to international football without inventing a past', () => {
    const state = career();
    state.seasonNumber = 4;
    state.calendarIndex = 12;
    state.player.caps = 9;

    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.international;
    delete legacy.seasonCaps;

    const migrated = migrate({ version: 8, career: emptyCareer(), careerState: legacy } as never)!;
    const restored = migrated.careers[0]!;

    expect(migrated.version).toBe(SAVE_VERSION);
    // A tournament is drawn for the season he is actually in, with nothing yet
    // played — the group slots he has already walked past are settled by the
    // ordinary catch-up the moment the career is played on.
    expect(restored.international.fixtures.length).toBeGreaterThan(0);
    expect(restored.international.results).toEqual([]);
    expect(restored.international.knockout).toBeNull();
    expect(restored.international.groupRoundsPlayed).toBe(0);
    expect(restored.seasonCaps).toBe(0);

    // Caps already earned are KEPT. They were awarded under the old model — a
    // number inferred from fame — but they are caps the player was told he had.
    expect(restored.player.caps).toBe(9);
    // The season in progress is untouched.
    expect(restored.calendarIndex).toBe(12);
  });

  it('drops a v8 career with no tournament, since the calendar walks one', () => {
    const state = career();
    const broken = { ...state, international: undefined } as Record<string, unknown>;
    expect(isUsableCareer(broken)).toBe(false);
  });

  it('drops a career whose tournament has no fixtures to play', () => {
    const state = career();
    const broken = { ...state, international: {} } as Record<string, unknown>;
    expect(isUsableCareer(broken)).toBe(false);
  });

  it('drops a v7 career with no record book, since the hub reads it on every render', () => {
    const state = career();
    const broken = { ...state, records: undefined } as Record<string, unknown>;
    expect(isUsableCareer(broken)).toBe(false);
  });

  it('drops a v7 career with no cups, since it cannot walk its own calendar', () => {
    const state = career();
    const broken = { ...state, cups: undefined } as Record<string, unknown>;
    expect(isUsableCareer(broken)).toBe(false);
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
      careers: [state, null, null],
      activeSlot: 0,
    } as never)!;
    expect(Array.isArray(migrated.careers[0]!.history)).toBe(true);
  });

  it('round-trips a full save through JSON without loss', () => {
    const original: SaveData = {
      version: SAVE_VERSION,
      career: { ...emptyCareer(), goals: 4 },
      settings: { pace: 'relaxed', matchSpeed: 2 },
      careers: [career(), null, null],
      activeSlot: 0,
      hallOfFame: [],
    };
    const restored = migrate(JSON.parse(JSON.stringify(original)))!;
    expect(restored.settings).toEqual(original.settings);
    expect(restored.career.goals).toBe(4);
    expect(restored.careers[0]!.player.name).toBe('Test');
    expect(restored.careers[0]!.fixtures.length).toBe(original.careers[0]!.fixtures.length);
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
    expect(migrated.careers[0]).toBeNull();
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
      careers: [state, null, null],
      activeSlot: 0,
    } as never)!;
    expect(migrated.careers[0]).toBeDefined();
    expect(migrated.careers[0]!.offers).toEqual([]);
    expect(migrated.careers[0]!.transfers).toEqual([]);
  });

  it('keeps a career that is merely missing history, since that is repairable', () => {
    const state = { ...career() } as Record<string, unknown>;
    delete state.history;
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careers: [state, null, null],
      activeSlot: 0,
    } as never)!;
    expect(migrated.careers[0]).toBeDefined();
    expect(migrated.careers[0]!.history).toEqual([]);
  });
});


/**
 * THE WALL OF FAME
 *
 * The only part of the save that is not about the career being played, and the
 * only part that has to survive one ending. Its failure modes are therefore the
 * opposite of everything else's: not "does this load", but "does ending a
 * career leave the save in exactly one of the two valid states".
 */

function legacy(overrides: Partial<CareerLegacy> = {}): CareerLegacy {
  return {
    id: 'legacy-1',
    name: 'Someone',
    position: 'ST',
    nationality: 'england',
    ending: 'retired',
    endedAt: 1,
    seasons: 10,
    finalSeasonNumber: 11,
    ageAtEnd: 34,
    abilityAtEnd: 68,
    finalClubId: 'northport-city',
    finalClubName: 'Northport City',
    finalCountryId: 'england',
    finalCountryShort: 'ENG',
    clubs: 2,
    countries: 1,
    appearances: 300,
    goals: 120,
    assists: 60,
    averageRating: 7.1,
    caps: 20,
    earnings: 40,
    honours: [],
    titles: 1,
    highlights: [],
    score: 500,
    verdict: 'A career.',
    ...overrides,
  };
}

function save(overrides: Partial<SaveData> = {}): SaveData {
  return {
    version: SAVE_VERSION,
    career: emptyCareer(),
    settings: defaultSettings(),
    careers: emptySlots(),
    activeSlot: 0,
    hallOfFame: [],
    ...overrides,
  };
}

describe('ending a career', () => {
  it('clears the career and puts it on the wall in the SAME write', () => {
    // The two halves must not be separable. A save holding both a live career
    // and its own obituary is a state nothing downstream knows how to read.
    const before = save({ careers: [career(), null, null] });
    const after = enshrineCareer(before, legacy());

    expect(after.careers[0]).toBeNull();
    expect(after.hallOfFame).toHaveLength(1);
  });

  it('keeps the wall in ranked order as careers are added to it', () => {
    let state = save();
    state = enshrineCareer(state, legacy({ id: 'middling', score: 300 }));
    state = enshrineCareer(state, legacy({ id: 'best', score: 900 }));
    state = enshrineCareer(state, legacy({ id: 'worst', score: 10 }));

    expect(state.hallOfFame.map((entry) => entry.id)).toEqual(['best', 'middling', 'worst']);
  });

  it('drops the lowest-ranked career once the wall is full, never the newest', () => {
    let state = save();
    for (let i = 0; i < HALL_OF_FAME_LIMIT; i += 1) {
      state = enshrineCareer(state, legacy({ id: `filler-${i}`, score: 100 + i }));
    }
    expect(state.hallOfFame).toHaveLength(HALL_OF_FAME_LIMIT);

    state = enshrineCareer(state, legacy({ id: 'a-great-one', score: 10_000 }));

    expect(state.hallOfFame).toHaveLength(HALL_OF_FAME_LIMIT);
    expect(state.hallOfFame[0].id).toBe('a-great-one');
    expect(state.hallOfFame.some((entry) => entry.id === 'filler-0')).toBe(false);
  });

  it('leaves a career that does not make the cut off the wall entirely', () => {
    let state = save();
    for (let i = 0; i < HALL_OF_FAME_LIMIT; i += 1) {
      state = enshrineCareer(state, legacy({ id: `filler-${i}`, score: 1000 + i }));
    }
    state = enshrineCareer(state, legacy({ id: 'not-good-enough', score: 1 }));

    expect(state.hallOfFame.some((entry) => entry.id === 'not-good-enough')).toBe(false);
    // It still ended: enshrining is what clears the career, cut or not.
    expect(state.careers[0]).toBeNull();
  });
});

describe('resetting the wall', () => {
  it('empties it without touching the career being played', () => {
    const state = save({ careers: [career(), null, null], hallOfFame: [legacy(), legacy({ id: 'b' })] });
    const cleared = clearHallOfFame(state);

    expect(cleared.hallOfFame).toEqual([]);
    expect(cleared.careers[0]).toBeDefined();
    expect(cleared.careers[0]!.player.name).toBe('Test');
  });

  it('removes one career by id and leaves the rest alone', () => {
    const state = save({
      hallOfFame: [legacy({ id: 'a' }), legacy({ id: 'b' }), legacy({ id: 'c' })],
    });
    const after = removeFromHallOfFame(state, 'b');

    expect(after.hallOfFame.map((entry) => entry.id)).toEqual(['a', 'c']);
  });

  it('ignores a removal for a career that is not there', () => {
    const state = save({ hallOfFame: [legacy({ id: 'a' })] });
    expect(removeFromHallOfFame(state, 'nope').hallOfFame).toHaveLength(1);
  });
});

describe('the wall across versions', () => {
  it('gives a v13 save an empty wall rather than inventing one', () => {
    // Careers finished before the wall existed were deleted outright. There is
    // nothing to reconstruct, and pretending otherwise would be a lie.
    const migrated = migrate({
      version: 13,
      career: emptyCareer(),
      careerState: career(),
    } as never)!;

    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.hallOfFame).toEqual([]);
    expect(migrated.careers[0]).toBeDefined();
  });

  it('repairs a damaged wall instead of dropping the save that holds it', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careerState: career(),
      hallOfFame: 'not a list',
    } as never)!;

    expect(migrated.hallOfFame).toEqual([]);
    // Losing the wall must never cost somebody the career they are in.
    expect(migrated.careers[0]).toBeDefined();
  });

  it('drops only the entries it cannot read', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      hallOfFame: [legacy({ id: 'good' }), { id: 'broken' }, null],
    } as never)!;

    expect(migrated.hallOfFame.map((entry) => entry.id)).toEqual(['good']);
  });

  it('round-trips a wall through JSON without loss', () => {
    const original = save({ hallOfFame: [legacy({ id: 'a', score: 700 })] });
    const restored = migrate(JSON.parse(JSON.stringify(original)))!;

    expect(restored.hallOfFame).toEqual(original.hallOfFame);
  });

  it('rejects an entry with nothing readable on it', () => {
    expect(isUsableLegacy(null)).toBe(false);
    expect(isUsableLegacy({})).toBe(false);
    expect(isUsableLegacy({ id: 'x', name: 'y' })).toBe(false);
    expect(isUsableLegacy(legacy())).toBe(true);
  });
});


/**
 * CAREER SLOTS
 *
 * Three careers instead of one, and the reason the change was worth making:
 * starting a second career used to cost you the first. So what these check is
 * ISOLATION — that every operation touches exactly the slot it was aimed at and
 * no other — rather than that three of something can be stored.
 */

describe('career slots', () => {
  it('starts with three empty slots and plays the first', () => {
    const fresh = migrate({ version: SAVE_VERSION, career: emptyCareer() } as never)!;

    expect(fresh.careers).toHaveLength(CAREER_SLOTS);
    expect(fresh.careers.every((slot) => slot === null)).toBe(true);
    expect(fresh.activeSlot).toBe(0);
    expect(activeCareer(fresh)).toBeUndefined();
  });

  it('writes a career to the active slot and leaves the others empty', () => {
    let state = selectSlot(save(), 1);
    state = saveCareer(state, career());

    expect(careerInSlot(state, 0)).toBeUndefined();
    expect(careerInSlot(state, 1)!.player.name).toBe('Test');
    expect(careerInSlot(state, 2)).toBeUndefined();
  });

  it('keeps three careers apart, so playing one never touches another', () => {
    let state = save();
    for (const slot of [0, 1, 2]) {
      state = selectSlot(state, slot);
      const one = career();
      one.player.name = `Player ${slot}`;
      state = saveCareer(state, one);
    }

    // Advance only the middle one.
    state = selectSlot(state, 1);
    const middle = activeCareer(state)!;
    middle.seasonNumber = 9;
    state = saveCareer(state, middle);

    expect(careerInSlot(state, 0)!.seasonNumber).toBe(1);
    expect(careerInSlot(state, 1)!.seasonNumber).toBe(9);
    expect(careerInSlot(state, 2)!.seasonNumber).toBe(1);
    expect(state.careers.map((slot) => slot!.player.name)).toEqual([
      'Player 0',
      'Player 1',
      'Player 2',
    ]);
  });

  it('empties one slot without disturbing the rest', () => {
    let state = save();
    for (const slot of [0, 1, 2]) {
      state = saveCareer(selectSlot(state, slot), career());
    }
    state = clearSlot(state, 1);

    expect(state.careers.map(Boolean)).toEqual([true, false, true]);
    // Clearing a slot is not the same as leaving it: the player is still there.
    expect(state.activeSlot).toBe(2);
  });

  it('finds the lowest empty slot, and says so when there is none', () => {
    let state = save();
    expect(firstEmptySlot(state)).toBe(0);

    state = saveCareer(selectSlot(state, 0), career());
    expect(firstEmptySlot(state)).toBe(1);

    state = saveCareer(selectSlot(state, 1), career());
    state = saveCareer(selectSlot(state, 2), career());
    expect(firstEmptySlot(state)).toBeNull();
  });

  it('refuses to select a slot that is not on the rack', () => {
    const state = selectSlot(save(), 0);
    expect(selectSlot(state, -1).activeSlot).toBe(0);
    expect(selectSlot(state, CAREER_SLOTS).activeSlot).toBe(0);
  });

  it('ends only the career in the active slot', () => {
    let state = save();
    state = saveCareer(selectSlot(state, 0), career());
    state = saveCareer(selectSlot(state, 2), career());

    state = enshrineCareer(state, legacy());

    expect(state.careers.map(Boolean)).toEqual([true, false, false]);
    expect(state.hallOfFame).toHaveLength(1);
  });
});

describe('slots across versions', () => {
  it('moves a v14 career into the first slot and keeps playing it', () => {
    const state = career();
    const migrated = migrate({
      version: 14,
      career: emptyCareer(),
      careerState: state,
      hallOfFame: [],
    } as never)!;

    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.careers[0]!.player.name).toBe('Test');
    expect(migrated.careers[1]).toBeNull();
    expect(migrated.activeSlot).toBe(0);
    // The flat field is a migration detail and must not survive: two answers to
    // "which career is this" is worse than none.
    expect((migrated as unknown as Record<string, unknown>).careerState).toBeUndefined();
  });

  it('gives a v14 save with no career three empty slots, not a phantom one', () => {
    const migrated = migrate({ version: 14, career: emptyCareer(), hallOfFame: [] } as never)!;
    expect(migrated.careers).toEqual(emptySlots());
  });

  it('empties only the unreadable slot, keeping the careers either side of it', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careers: [career(), { player: 'not a career' }, career()],
      activeSlot: 0,
    } as never)!;

    expect(migrated.careers.map(Boolean)).toEqual([true, false, true]);
  });

  it('pads a short slot array rather than trusting its length', () => {
    const migrated = migrate({
      version: SAVE_VERSION,
      career: emptyCareer(),
      careers: [career()],
      activeSlot: 0,
    } as never)!;

    expect(migrated.careers).toHaveLength(CAREER_SLOTS);
    expect(migrated.careers[0]).toBeDefined();
  });

  it('falls back to the first slot when the active one is off the rack', () => {
    for (const activeSlot of [-1, CAREER_SLOTS, 1.5, 'two']) {
      const migrated = migrate({
        version: SAVE_VERSION,
        career: emptyCareer(),
        careers: emptySlots(),
        activeSlot,
      } as never)!;
      expect(migrated.activeSlot).toBe(0);
    }
  });
});

/**
 * TAKING A SAVE SOMEWHERE ELSE
 *
 * The export is the save itself, so the thing to check is that it goes back in
 * through the same door it came out of — and that a file which is not a save
 * fails without costing anybody the one they already had.
 */

describe('export and import', () => {
  it('round-trips everything: careers, the wall, and preferences', () => {
    let original = save({ settings: { pace: 'relaxed', matchSpeed: 2 } });
    original = saveCareer(selectSlot(original, 1), career());
    original = { ...original, hallOfFame: [legacy({ id: 'kept' })] };

    const restored = importSave(exportSave(original))!;

    expect(restored).not.toBeNull();
    expect(restored.careers[1]!.player.name).toBe('Test');
    expect(restored.careers[0]).toBeNull();
    expect(restored.activeSlot).toBe(1);
    expect(restored.hallOfFame.map((entry) => entry.id)).toEqual(['kept']);
    expect(restored.settings).toEqual({ pace: 'relaxed', matchSpeed: 2 });
  });

  it('brings an OLDER export forward, rather than refusing it', () => {
    // An export is a save, so importing one goes through the same migration a
    // save read off disk does. A file from a previous version still works.
    const v14 = JSON.stringify({
      version: 14,
      career: { ...emptyCareer(), goals: 3 },
      settings: defaultSettings(),
      careerState: career(),
      hallOfFame: [],
    });

    const restored = importSave(v14)!;

    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.careers[0]!.player.name).toBe('Test');
    expect(restored.career.goals).toBe(3);
  });

  it('refuses a file that is not a save, without throwing', () => {
    expect(importSave('')).toBeNull();
    expect(importSave('not json at all')).toBeNull();
    expect(importSave('{"hello":"world"}')).toBeNull();
    expect(importSave('[1,2,3]')).toBeNull();
  });

  it('refuses a save from a version this build cannot reach', () => {
    // A file from a NEWER build, or one with a version no step recognises. The
    // chain cannot walk it to the current version, so it is refused whole
    // rather than half-applied.
    expect(importSave(JSON.stringify({ version: 99, career: emptyCareer() }))).toBeNull();
    expect(importSave(JSON.stringify({ version: 15 }))).toBeNull();
  });

  it('still accepts a genuinely old save, since that is the point', () => {
    const ancient = JSON.stringify({ version: 3, career: { ...emptyCareer(), goals: 2 } });
    expect(importSave(ancient)!.career.goals).toBe(2);
  });

  it('names the file by the day it was written', () => {
    expect(exportFilename(new Date('2026-08-20T11:00:00Z'))).toBe('footii-save-2026-08-20.json');
  });

  it('writes something a person can open and read', () => {
    // Indented on purpose: an exported save is a file somebody may well look
    // inside, and a single-line blob is not one.
    expect(exportSave(save())).toContain('\n');
  });
});
