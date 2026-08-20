import type { MatchStats } from '../core/match/matchStats.ts';
import type { CareerState } from '../core/career/career.ts';
import { currentAbility } from '../core/player/player.ts';
import { TEAMS } from '../data/gameData.ts';
import { initialLeagues, locateClub } from '../core/career/countries.ts';
import { emptyTable, generateFixtures } from '../core/career/league.ts';
import { createSeasonStats } from '../core/career/seasonStats.ts';
import { createCup } from '../core/career/cups.ts';
import { seasonCalendar } from '../core/career/calendar.ts';
import { createCareerRecords } from '../core/career/records.ts';
import { createInternational } from '../core/career/international.ts';
import { createCoefficients } from '../core/career/coefficients.ts';
import type { CoefficientLedger, Coefficients } from '../core/career/coefficients.ts';
import { Rng } from '../core/rng.ts';
import { initialStrengths } from '../core/career/clubDrift.ts';
import { contractYears, offeredWage, squadRole } from '../core/career/transfers.ts';
import type { DecisionPace } from '../simulation/DecisionTimer.ts';

/**
 * Persistence.
 *
 * LocalStorage only, behind a narrow interface, versioned so saves can be
 * migrated rather than discarded. Nothing in `core/` or `simulation/` imports
 * this file — the simulation never touches storage directly.
 *
 * `CareerState` is deliberately plain data (no classes, no functions), so
 * saving is `JSON.stringify` and loading needs no reconstruction.
 */

export const STORAGE_KEY = 'footii.save.v1';
export const SAVE_VERSION = 11;

export interface CareerRecord {
  matches: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  interceptions: number;
  ratingTotal: number;
  bestRating: number;
  wins: number;
  draws: number;
  defeats: number;
}

/**
 * Global preferences.
 *
 * Decision pace lives here rather than on the match setup screen because it is
 * a difficulty and accessibility choice about how YOU want to play, not a
 * property of one match. It was previously passed per match and never saved, so
 * reloading and continuing a career silently reverted it to Standard — turning
 * a deliberately relaxed game back into a frantic one without saying so.
 */
export interface GameSettings {
  pace: DecisionPace;
  /** Index into the match screen's speed presets. */
  matchSpeed: number;
}

export function defaultSettings(): GameSettings {
  return { pace: 'standard', matchSpeed: 1 };
}

export interface SaveData {
  version: number;
  /** Running totals from one-off quick matches. */
  career: CareerRecord;
  settings: GameSettings;
  lastSelection?: {
    presetId: string;
    teamId: string;
    opponentId: string;
    seed: string;
    length: number;
    pace?: string;
  };
  /** The in-progress career, if one has been started. */
  careerState?: CareerState;
}

export function emptyCareer(): CareerRecord {
  return {
    matches: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    dribbles: 0,
    tackles: 0,
    interceptions: 0,
    ratingTotal: 0,
    bestRating: 0,
    wins: 0,
    draws: 0,
    defeats: 0,
  };
}

function defaultSave(): SaveData {
  return { version: SAVE_VERSION, career: emptyCareer(), settings: defaultSettings() };
}

/**
 * Bring an older save up to the current version.
 * v1 had no career mode, so a v1 save is valid — it simply has no `careerState`.
 * Returns null if the save is too damaged or too old to rescue.
 */
/**
 * Is this career structurally usable?
 *
 * A save is loaded on every boot and read deeply by the home screen, so a
 * single missing field used to take the whole game down with a blank page and
 * no way back — you could not even reach the menu to abandon the career. A
 * career that fails this check is DROPPED rather than trusted: losing one
 * career is recoverable, an unstartable game is not.
 */
export function isUsableCareer(state: unknown): state is CareerState {
  if (!state || typeof state !== 'object') return false;
  const c = state as Partial<CareerState>;
  return (
    !!c.player &&
    typeof c.player === 'object' &&
    !!c.player.attributes &&
    typeof c.clubId === 'string' &&
    Array.isArray(c.leagueTeamIds) &&
    Array.isArray(c.fixtures) &&
    Array.isArray(c.results) &&
    Array.isArray(c.table) &&
    !!c.seasonStats &&
    typeof c.seasonStats === 'object' &&
    typeof c.seasonNumber === 'number' &&
    typeof c.nextFixtureIndex === 'number' &&
    // A career with no contract cannot open a summer, and a career with no
    // pyramid cannot promote or relegate anyone. Both are cheaper to drop than
    // to guess at.
    !!c.contract &&
    typeof c.contract === 'object' &&
    typeof c.division === 'number' &&
    typeof c.countryId === 'string' &&
    !!c.leagues &&
    typeof c.leagues === 'object' &&
    !!c.clubStrengths &&
    typeof c.clubStrengths === 'object' &&
    // A season with no knockouts cannot walk its own calendar.
    !!c.cups &&
    typeof c.cups === 'object' &&
    typeof c.calendarIndex === 'number' &&
    // The record book is read by the hub on every render.
    !!c.records &&
    typeof c.records === 'object' &&
    // The international season, which the calendar walks every season.
    !!c.international &&
    typeof c.international === 'object' &&
    Array.isArray((c.international as { fixtures?: unknown }).fixtures)
  );
}

/**
 * Is this already the two-ledger shape, or the flat one a v10 save wrote?
 *
 * An empty object is ambiguous and safely either: wrapping it produces an empty
 * pair, which is what an empty flat ledger means anyway.
 */
function isSplitLedger(value: unknown): value is Coefficients {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.clubs) === false && ('clubs' in record || 'nations' in record);
}

export function migrate(parsed: Partial<SaveData> & { version?: number }): SaveData | null {
  if (!parsed || typeof parsed !== 'object' || !parsed.career) return null;

  let save = { ...defaultSave(), ...parsed } as SaveData;

  if (parsed.version === 1) {
    // v1 -> v2: quick-match totals are unchanged; there is simply no career yet.
    save = { ...save, version: 2, careerState: undefined };
  }

  if (save.version === 2) {
    // v2 -> v3: careers gained a season-start snapshot and training points.
    // Backfill from the current player so an in-progress career survives; its
    // first review will simply report no change for the season already underway.
    const career = save.careerState;
    if (career) {
      career.seasonStartAttributes ??= { ...career.player.attributes };
      career.seasonStartAbility ??= currentAbility(career.player);
      career.seasonStartExperience ??= career.player.experience;
      career.trainingPoints ??= 0;
    }
    save = { ...save, version: 3 };
  }

  if (save.version === 3) {
    // v3 -> v4: careers gained transfers. An in-progress career simply starts
    // with an empty window and no move history; the first end of season will
    // fill it in.
    const career = save.careerState;
    if (career) {
      career.offers ??= [];
      career.transfers ??= [];
    }
    save = { ...save, version: 4 };
  }

  if (save.version === 4) {
    // v4 -> v5: careers gained a second division, drifting clubs, contracts and
    // an honours list. A career saved before any of it keeps its club and its
    // statistics; the pyramid is rebuilt from the data file, the player is
    // placed in whichever division his club starts in, and he is given the deal
    // that club would offer him today. He loses no progress, only history he
    // never had.
    const career = save.careerState;
    if (career) {
      career.leagues ??= initialLeagues(TEAMS);
      const placed = locateClub(career.leagues, career.clubId);
      career.countryId ??= placed?.countryId ?? 'england';
      career.division ??= placed?.division ?? 1;
      career.clubStrengths ??= initialStrengths(TEAMS);
      career.honours ??= [];
      career.careerEarnings ??= 0;
      career.renewal ??= null;
      career.player.caps ??= 0;
      if (!career.contract) {
        const club = TEAMS.find((team) => team.id === career.clubId);
        career.contract = club
          ? {
              clubId: club.id,
              wage: offeredWage(career.player, club, squadRole(career.player, club)),
              yearsRemaining: contractYears(career.player),
              signedSeason: career.seasonNumber,
              role: squadRole(career.player, club),
            }
          : undefined!;
      }
      for (const season of career.history ?? []) season.division ??= career.division;
    }
    save = { ...save, version: 5 };
  }

  if (save.version === 5) {
    // v5 -> v6: the single pyramid became a world of countries. A v5 career was
    // necessarily English — those were the only clubs there were — so it keeps
    // its club, its statistics and its honours, and is simply re-placed on a
    // map that now has seven more leagues on it. Its former second division is
    // now the lower half of the English league, which is where those clubs sit
    // in the new data, so nobody is left in a division that no longer exists.
    const career = save.careerState;
    if (career) {
      career.leagues = initialLeagues(TEAMS);
      const placed = locateClub(career.leagues, career.clubId);
      career.countryId = placed?.countryId ?? 'england';
      career.division = placed?.division ?? 1;
      career.leagueTeamIds = (career.leagues[career.countryId]?.[career.division - 1] ?? []).slice();
      career.player.nationality ??= career.countryId;
      for (const season of career.history ?? []) season.countryId ??= career.countryId;
      for (const honour of career.honours ?? []) honour.countryId ??= career.countryId;
      for (const move of career.transfers ?? []) {
        move.fromCountryId ??= career.countryId;
        move.toCountryId ??= career.countryId;
      }
      // The old league had eight clubs and the new one has sixteen, so the
      // fixture list and table in the save describe a season that cannot be
      // finished. The season in progress is RESTARTED — a fresh fixture list and
      // an empty table for the new league — rather than half-played: losing a
      // part-season is recoverable, an unplayable one is not.
      //
      // Regenerating here rather than clearing is the whole point. A career left
      // with no fixtures reports itself complete on the next boot, which ends
      // the season immediately against an empty table and tells the player he
      // finished 0th and was champion.
      career.fixtures = generateFixtures(
        career.leagueTeamIds,
        new Rng(`${career.seed}:season:${career.seasonNumber}`),
      );
      career.results = [];
      career.table = emptyTable(career.leagueTeamIds);
      career.nextFixtureIndex = 0;
      career.seasonStats = createSeasonStats();
    }
    save = { ...save, version: 6 };
  }

  if (save.version === 6) {
    // v6 -> v7: seasons gained two domestic knockouts and a calendar that
    // interleaves them with the league. A career in progress keeps its league
    // season exactly as it stands — the calendar is derived, and its cup slots
    // all sit ahead of wherever the player has got to, so he simply joins both
    // cups at the next round rather than losing the league form he has built.
    const career = save.careerState;
    if (career) {
      career.leagueStats ??= { ...career.seasonStats };
      career.cups ??= {
        nationalCup: createCup('nationalCup', career.countryId, career.leagueTeamIds),
        leagueCup: createCup('leagueCup', career.countryId, career.leagueTeamIds),
      };
      // The two indexes count different things: `nextFixtureIndex` counts league
      // matches, `calendarIndex` counts calendar slots, and a slot may be a cup
      // round. Setting one from the other desynchronises any save more than a
      // few matches in — the league round comes out wrong AND the first cup slot
      // reached has no drawn tie, so the fixture card asks for a club with no id.
      //
      // Instead, walk the calendar to the slot holding his next league match.
      // Cup rounds scheduled before that point are simply never played this
      // season, which is the honest outcome for a season already underway.
      if (career.calendarIndex === undefined) {
        const calendar = seasonCalendar(
          career.fixtures.filter(
            (f) => f.homeId === career.clubId || f.awayId === career.clubId,
          ).length,
        );
        let leagueSeen = 0;
        let slot = calendar.length;
        for (let i = 0; i < calendar.length; i++) {
          if (calendar[i]!.competition !== 'league') continue;
          if (leagueSeen === career.nextFixtureIndex) {
            slot = i;
            break;
          }
          leagueSeen += 1;
        }
        career.calendarIndex = slot;
      }
      for (const season of career.history ?? []) season.cupsWon ??= [];
      if (career.lastResult) career.lastResult.competition ??= 'league';
    }
    save = { ...save, version: 7 };
  }

  if (save.version === 7) {
    // v7 -> v8: seasons gained European competitions and a record book.
    //
    // Neither can be reconstructed from a save that never had them. European
    // entry is decided by a season that has already been archived, so a career
    // in progress simply is not in Europe this year and qualifies for next year
    // the ordinary way. The record book starts empty rather than being guessed
    // at from history: a hat-trick count inferred from season totals would be
    // wrong, and a wrong record is worse than an absent one.
    const career = save.careerState;
    if (career) {
      career.europe ??= null;
      career.europeanEntries ??= {};
      career.records ??= createCareerRecords();
      for (const season of career.history ?? []) {
        season.europeanTier ??= null;
        season.wonEurope ??= false;
      }
    }
    save = { ...save, version: 8 };
  }

  if (save.version === 8) {
    // v8 -> v9: the season gained international football.
    //
    // The tournament is drawn afresh for the season the career is CURRENTLY in,
    // rather than being back-filled: its group matches are calendar slots, and a
    // save part-way through a season would otherwise carry a tournament whose
    // dates had already passed. Drawing it here means those slots are settled by
    // the ordinary catch-up the moment the career is played on.
    //
    // Caps already earned are kept. They were awarded under the old model — a
    // number inferred from fame rather than a count of matches — but they are
    // still caps the player was told he had, and taking them away to make the
    // ledger tidy would be a worse lie than the one that produced them.
    const career = save.careerState;
    if (career) {
      career.international ??= createInternational(
        new Rng(`${career.seed}:s${career.seasonNumber}:international:draw`),
      );
      career.seasonCaps ??= 0;
    }
    save = { ...save, version: 9 };
  }

  if (save.version === 9) {
    // v9 -> v10: how many Champions League places a country gets is now earned
    // from its national side's recent tournaments rather than fixed.
    //
    // The ledger starts EMPTY rather than being invented. A past tournament
    // cannot be reconstructed — national sides are built from their country's
    // clubs as they stood at the time, and only the current strengths survive —
    // so back-filling would mean making up a decade of international football
    // and then awarding European places on it. An empty ledger means "nothing
    // on record", which falls back to exactly the prestige order the save was
    // already being played under. The order starts moving at the end of the
    // season in progress, when its tournament is scored.
    const career = save.careerState;
    if (career) career.coefficients ??= createCoefficients();
    save = { ...save, version: 10 };
  }

  if (save.version === 10) {
    // v10 -> v11: the coefficient gained its club half, so what was one ledger
    // of national campaigns is now two ledgers — clubs and nations.
    //
    // A v10 save carries the flat shape, which is the nation ledger and nothing
    // else. It is WRAPPED rather than discarded: those tournaments were really
    // played, and throwing them away would reset a country's standing to
    // prestige for a career that had already earned its way off it. The club
    // side starts empty, because there is no record of it to recover — European
    // seasons were never scored before this — and fills from the first season
    // played on.
    const career = save.careerState;
    if (career) {
      const stored = career.coefficients as unknown;
      career.coefficients = isSplitLedger(stored)
        ? stored
        : { clubs: {}, nations: (stored as CoefficientLedger) ?? {} };
    }
    save = { ...save, version: 11 };
  }

  if (save.version !== SAVE_VERSION) return null;

  // Settings are additive: an older save simply had none, and a save written
  // before a new preference existed must still load.
  save.settings = { ...defaultSettings(), ...(save.settings ?? {}) };

  // A career that predates a field must not crash the game.
  if (save.careerState && !Array.isArray(save.careerState.history)) {
    save.careerState.history = [];
  }
  if (save.careerState && !Array.isArray(save.careerState.offers)) {
    save.careerState.offers = [];
  }
  if (save.careerState && !Array.isArray(save.careerState.transfers)) {
    save.careerState.transfers = [];
  }
  if (save.careerState && !Array.isArray(save.careerState.honours)) {
    save.careerState.honours = [];
  }
  if (save.careerState && !isUsableCareer(save.careerState)) {
    save.careerState = undefined;
  }
  return save;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    return migrate(JSON.parse(raw) as Partial<SaveData>) ?? defaultSave();
  } catch {
    // A corrupt save must never prevent the game from starting.
    return defaultSave();
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be unavailable (private mode, quota). The game plays on.
  }
}

export function saveCareer(save: SaveData, careerState: CareerState): SaveData {
  const updated: SaveData = { ...save, careerState };
  writeSave(updated);
  return updated;
}

export function clearCareer(save: SaveData): SaveData {
  const updated: SaveData = { ...save, careerState: undefined };
  writeSave(updated);
  return updated;
}

export function recordMatch(
  save: SaveData,
  stats: MatchStats,
  rating: number,
  result: number,
): SaveData {
  const career = { ...save.career };
  career.matches += 1;
  career.goals += stats.goals;
  career.assists += stats.assists;
  career.shots += stats.shots;
  career.shotsOnTarget += stats.shotsOnTarget;
  career.keyPasses += stats.keyPasses;
  career.dribbles += stats.dribbles;
  career.tackles += stats.tackles;
  career.interceptions += stats.interceptions;
  career.ratingTotal += rating;
  career.bestRating = Math.max(career.bestRating, rating);
  if (result > 0) career.wins += 1;
  else if (result < 0) career.defeats += 1;
  else career.draws += 1;

  const updated: SaveData = { ...save, career };
  writeSave(updated);
  return updated;
}

export function saveSettings(save: SaveData, settings: Partial<GameSettings>): SaveData {
  const updated: SaveData = { ...save, settings: { ...save.settings, ...settings } };
  writeSave(updated);
  return updated;
}
