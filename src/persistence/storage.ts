import type { MatchStats } from '../core/match/matchStats.ts';
import type { CareerState } from '../core/career/career.ts';
import { currentAbility } from '../core/player/player.ts';

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

const STORAGE_KEY = 'footii.save.v1';
export const SAVE_VERSION = 3;

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

export interface SaveData {
  version: number;
  /** Running totals from one-off quick matches. */
  career: CareerRecord;
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
  return { version: SAVE_VERSION, career: emptyCareer() };
}

/**
 * Bring an older save up to the current version.
 * v1 had no career mode, so a v1 save is valid — it simply has no `careerState`.
 * Returns null if the save is too damaged or too old to rescue.
 */
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

  if (save.version !== SAVE_VERSION) return null;

  // A career that predates a field must not crash the game.
  if (save.careerState && !Array.isArray(save.careerState.history)) {
    save.careerState.history = [];
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
