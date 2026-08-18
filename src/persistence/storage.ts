import type { MatchStats } from '../core/match/matchStats.ts';
import type { CareerState } from '../core/career/career.ts';
import { currentAbility } from '../core/player/player.ts';
import { TEAMS } from '../data/gameData.ts';
import { divisionOf, initialDivisions } from '../core/career/divisions.ts';
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
export const SAVE_VERSION = 5;

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
    Array.isArray(c.divisions) &&
    !!c.clubStrengths &&
    typeof c.clubStrengths === 'object'
  );
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
      career.divisions ??= initialDivisions(TEAMS);
      career.division ??= divisionOf(career.divisions, career.clubId) || 1;
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
