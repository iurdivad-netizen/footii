import type { MatchStats } from '../core/match/matchStats.ts';
import type { CareerState } from '../core/career/career.ts';
import { createHowItWasPlayed } from '../core/career/career.ts';
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
import { initialNationStrengths } from '../core/career/nationDrift.ts';
import type { CoefficientLedger, Coefficients } from '../core/career/coefficients.ts';
import { Rng } from '../core/rng.ts';
import { initialStrengths } from '../core/career/clubDrift.ts';
import { STANDING_FLOORS, defaultPreferences } from '../core/career/preferences.ts';
import type { HubLayout } from '../ui/screens/hubSections.ts';
import { isHubLayout, isHubSectionId } from '../ui/screens/hubSections.ts';
import { startingConfidence } from '../core/career/confidence.ts';
import { isEuropeanTier } from '../core/career/europe.ts';
import { contractYears, offeredWage, squadRole } from '../core/career/transfers.ts';
import type { DecisionPace } from '../simulation/DecisionTimer.ts';
import type { CareerLegacy } from '../core/career/legacy.ts';
import { rankLegacies } from '../core/career/legacy.ts';

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
export const SAVE_VERSION = 28;

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
  /**
   * How the career hub arranges the twelve cards you do not need every week.
   *
   * A setting rather than a decision taken for the player, because the trade is
   * genuinely a matter of taste: tabs make the shortest page and cost a
   * navigation model, folds cost nothing to learn and make a longer one.
   * See ui/screens/hubSections.ts.
   */
  hubLayout: HubLayout;
  /**
   * Which sections he last had open, so the hub comes back as he left it.
   *
   * One list for both layouts, which is what lets a player switch between them
   * without losing his place: in folds it is every open section, and in tabs it
   * is read as the one to show. A setting rather than career state because it
   * is a fact about how somebody likes to read a screen, not about a
   * footballer — and because it should carry across all three career slots.
   */
  hubOpen: string[];
}

/**
 * What a first-time player gets.
 *
 * Untimed rather than Standard, deliberately. The clock is the hardest thing in
 * the game to meet cold: a two-second window on a decision whose six options you
 * have never read before is not a decision, it is a reflex test, and somebody
 * whose first three chances expire never finds out what the game actually is.
 * The keeper still commits on schedule at this setting, so the READ — the thing
 * the whole mechanic is about — is unchanged; only the punishment for thinking
 * is gone. Turning the clock on afterwards is one control on the front door.
 */
export function defaultSettings(): GameSettings {
  // Tabs by default: it is the layout that fixes the problem the restructure
  // was for — a phone hub three and a half thousand pixels tall — and the
  // front door offers the other one to anybody who would rather scroll.
  return { pace: 'untimed', matchSpeed: 1, hubLayout: 'tabs', hubOpen: ['you'] };
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
  /**
   * Careers in progress, one per slot. `null` is an empty slot.
   *
   * Always exactly `CAREER_SLOTS` long, so a slot is addressed by its index and
   * an empty one is a real, clickable thing rather than an absence. The save
   * used to hold a single `careerState`, which is what made ending a career
   * destructive: starting a second meant destroying the first, and the only
   * button offered for that said "Abandon".
   */
  careers: (CareerState | null)[];
  /**
   * The slot being played.
   *
   * Every operation that acts on "the career" — saving a match, ending it,
   * opening the hub — acts on THIS one. Screens that offer a choice of career
   * select the slot first and then act, so there is never a second notion of
   * which career an action meant.
   */
  activeSlot: number;
  /**
   * Finished careers, best first.
   *
   * The only part of the save that OUTLIVES a career. Everything else is either
   * the career being played or a preference about how to play it; this is what
   * makes ending one a decision with a consequence rather than a delete button.
   */
  hallOfFame: CareerLegacy[];
}

/**
 * How many finished careers the wall keeps.
 *
 * Capped because localStorage is not: a browser used for a year would otherwise
 * accumulate entries nobody will ever scroll to, and the quota it eventually
 * hit would take the LIVE career down with it. Twenty is far more than a wall
 * anyone reads, and the ones dropped are always the lowest-ranked.
 */
export const HALL_OF_FAME_LIMIT = 20;

/**
 * How many careers can be in progress at once.
 *
 * Three rather than one, and three rather than ten. One made ending a career
 * the price of starting another, which is the whole reason abandoning was ever
 * a destructive button. Ten would make the front door a file manager: the point
 * is to be able to keep a long career while trying something else, not to run a
 * league of your own saves.
 */
export const CAREER_SLOTS = 3;

/** A fresh, empty set of slots. */
export function emptySlots(): (CareerState | null)[] {
  return Array.from({ length: CAREER_SLOTS }, () => null);
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
  return {
    version: SAVE_VERSION,
    career: emptyCareer(),
    settings: defaultSettings(),
    careers: emptySlots(),
    activeSlot: 0,
    hallOfFame: [],
  };
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

/**
 * Recover a tournament's groups from the fixture list it was drawn with.
 *
 * Every nation plays everybody in its own group and nobody outside it, so the
 * groups are the CONNECTED COMPONENTS of the opponent graph. Walking the
 * fixtures in order and assigning as you go is not enough: the first round of a
 * group of four produces two unconnected pairs, and it is the second round that
 * joins them. So the opponents are collected first and the components found
 * afterwards.
 *
 * Used only by the v11 migration, where redrawing would contradict results the
 * save has already played.
 */
function groupsFromFixtures(state: { fixtures: { homeId: string; awayId: string }[] }): string[][] {
  const opponents = new Map<string, Set<string>>();
  const meet = (a: string, b: string) => {
    if (!opponents.has(a)) opponents.set(a, new Set());
    opponents.get(a)!.add(b);
  };
  for (const fixture of state.fixtures ?? []) {
    meet(fixture.homeId, fixture.awayId);
    meet(fixture.awayId, fixture.homeId);
  }

  const groups: string[][] = [];
  const placed = new Set<string>();
  for (const nation of opponents.keys()) {
    if (placed.has(nation)) continue;
    const group: string[] = [];
    const queue = [nation];
    placed.add(nation);
    while (queue.length > 0) {
      const next = queue.shift()!;
      group.push(next);
      for (const other of opponents.get(next) ?? []) {
        if (placed.has(other)) continue;
        placed.add(other);
        queue.push(other);
      }
    }
    groups.push(group);
  }

  return groups;
}

/**
 * The shape the migration chain works in.
 *
 * Every step up to v15 was written against a save with ONE career, in a field
 * called `careerState`, and rewriting fourteen historical migrations to speak
 * in slots would be rewriting history — they would then be migrating a shape
 * that never existed on anybody's disk. So the chain keeps the flat field, and
 * v15 is the step that puts it into a slot.
 */
type MigratingSave = SaveData & { careerState?: CareerState };

export function migrate(parsed: Partial<SaveData> & { version?: number }): SaveData | null {
  if (!parsed || typeof parsed !== 'object' || !parsed.career) return null;

  let save = { ...defaultSave(), ...parsed } as MigratingSave;

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

  if (save.version === 11) {
    // v11 -> v12: the world gained four more European leagues, and with twelve
    // countries the tournament no longer holds everybody — it takes the eight
    // highest in the European order, and the groups it was drawn into are now
    // stored on the tournament rather than recomputed from the registry.
    //
    // A v11 tournament was drawn from eight countries and its fixtures still
    // describe that draw, so the groups are recovered FROM THE FIXTURES rather
    // than redrawn: redrawing against a twelve-country order would hand the
    // player a group he is not playing in, with a table that disagreed with
    // every result already recorded.
    const career = save.careerState;
    const tournament = career?.international;
    if (tournament && !tournament.groups) {
      tournament.groups = groupsFromFixtures(tournament);
    }
    save = { ...save, version: 12 };
  }

  if (save.version === 12) {
    // v12 -> v13: the world gained thirty-two countries with no league of their
    // own, which field a national side from an authored strength and drift on
    // their own.
    //
    // Nothing to recover: a career that has never had them starts them where
    // the data file puts them, which is what an undrifted world looks like. The
    // countries it does know are untouched, because their sides are derived
    // from clubs whose drift is already in the save.
    const career = save.careerState;
    if (career) career.nationStrengths ??= initialNationStrengths();
    save = { ...save, version: 13 };
  }

  if (save.version === 13) {
    // v13 -> v14: careers gained an ending, and a wall of fame that survives it.
    //
    // Nothing to recover, and deliberately nothing invented: a save written
    // before the wall existed has finished careers that were DELETED rather
    // than summarised, so there is no record left to reconstruct one from. An
    // empty wall is the honest answer.
    save = { ...save, version: 14, hallOfFame: save.hallOfFame ?? [] };
  }

  if (save.version === 14) {
    // v14 -> v15: one career becomes one of three slots.
    //
    // The career being played goes into the first slot and stays the active
    // one, so a save reloads exactly where it was — the change is that there
    // are now two empty slots beside it rather than nothing.
    const slots = emptySlots();
    if (save.careerState) slots[0] = save.careerState;
    save = { ...save, version: 15, careers: slots, activeSlot: 0 };
  }

  if (save.version === 15) {
    // v15 -> v16: a career can say what it wants from a move.
    //
    // Every existing career starts open to anything, which is exactly what it
    // has been all along — there was no way to say otherwise, so "no stated
    // preference" is the truthful reading of an older save rather than a
    // default standing in for a lost one.
    save = { ...save, version: 16 };
    for (const career of save.careers ?? []) {
      if (career) career.preferences ??= defaultPreferences();
    }
    // A v15 save that still carries the flat field has not reached the slot
    // step yet; its career is handled by the v14 step above.
    if (save.careerState) save.careerState.preferences ??= defaultPreferences();
  }

  if (save.version === 16) {
    // v16 -> v17: every country plays a super cup, and Europe plays groups.
    //
    // A career mid-season gets NEITHER retrofitted, deliberately. Its super cup
    // was never earned — the season that decides one has not finished — and its
    // European bracket was drawn as a straight knockout, so replacing it with
    // groups would contradict results already played. Both arrive naturally at
    // the end of the season in progress, which is where they come from anyway.
    save = { ...save, version: 17 };
    for (const career of save.careers ?? []) {
      if (career) career.superCup ??= null;
    }
    if (save.careerState) save.careerState.superCup ??= null;
  }

  if (save.version === 17) {
    // v17 -> v18: a career counts how much of itself was actually played.
    //
    // Existing careers start at zero, and that is a statement of fact rather
    // than a default papering over a gap: nothing anywhere in an older save
    // records how many of its matches were skipped or what pace they were
    // played at. `skipped` was written per match onto `lastResult` and
    // overwritten by the next one, so the information was never kept even for
    // a single season.
    //
    // The consequence is worth being explicit about, because it is the reason
    // this lands before anything reads it: a career already under way will
    // under-count itself for the matches it has already played, and only a
    // career started after this version has a total that means anything. That
    // is unavoidable for any counter added to a running game, and it gets less
    // true every day the counting is happening.
    save = { ...save, version: 18 };
    for (const career of save.careers ?? []) {
      if (career) career.howPlayed ??= createHowItWasPlayed();
    }
    if (save.careerState) save.careerState.howPlayed ??= createHowItWasPlayed();
  }

  if (save.version === 18) {
    // v18 -> v19: a career can be injured.
    //
    // Everybody comes forward fit, which is the only defensible reading of a
    // save written by a version where being unfit was not a state that existed.
    // Inventing an injury for a career already under way would take matches off
    // somebody for something that never happened to them.
    save = { ...save, version: 19 };
    for (const career of save.careers ?? []) {
      if (career) career.injury ??= null;
    }
    if (save.careerState) save.careerState.injury ??= null;
  }

  if (save.version === 19) {
    // v19 -> v20: somebody else wants the shirt.
    //
    // Left as null rather than generated here, and the difference matters: the
    // rival is built from the club as the career knows it — drifted ratings and
    // all — which a migration has no business reconstructing. `prepareNextMatch`
    // builds one the first time the career sets up a fixture, so an existing
    // career gains its competition at its very next match rather than having to
    // wait for a transfer. Until then `teamSheet` picks the player every week,
    // exactly as every version before this one did.
    save = { ...save, version: 20 };
    for (const career of save.careers ?? []) {
      if (career) career.rival ??= null;
    }
    if (save.careerState) save.careerState.rival ??= null;
  }

  if (save.version === 20) {
    // v20 -> v21: the people he passes to have names.
    //
    // Empty rather than generated, for the same reason the rival is left null:
    // a squad is built from the club as the career knows it, and a migration
    // has no business reconstructing that. `prepareNextMatch` fills it at the
    // next fixture. Until then the match engine reads an empty list as "nobody
    // named" and narrates an assist exactly as every earlier version did.
    save = { ...save, version: 21 };
    for (const career of save.careers ?? []) {
      if (career) career.teammates ??= [];
    }
    if (save.careerState) save.careerState.teammates ??= [];
  }

  if (save.version === 21) {
    // v21 -> v22: a young player can go out on loan.
    //
    // Nobody comes forward mid-loan, because no earlier version could put him
    // on one. Null is the only truthful reading, and it is also the safe one:
    // a loan invented here would have a parent club to return to that he never
    // actually left.
    save = { ...save, version: 22 };
    for (const career of save.careers ?? []) {
      if (career) {
        career.loan ??= null;
        career.loanOffer ??= null;
      }
    }
    if (save.careerState) {
      save.careerState.loan ??= null;
      save.careerState.loanOffer ??= null;
    }
  }

  if (save.version === 22) {
    // v22 -> v23: he can ask to leave, and can say how big a club has to be.
    //
    // Three fields, all of them absences rather than defaults. Nobody comes
    // forward with a transfer request standing, because no earlier version had
    // one to hand in; and nobody comes forward with a demand stated, because a
    // career that could not state one has not stated one. `any` and `null` are
    // therefore the truthful readings as well as the safe ones — they say "he
    // has not asked", which is exactly what an older save means.
    //
    // The alternative — inferring a demand from where the career has been
    // playing — would be inventing a position somebody never took, and it would
    // silently shrink the market of a career that was happy with it.
    save = { ...save, version: 23 };
    for (const career of save.careers ?? []) {
      if (career) career.transferRequest ??= null;
    }
    if (save.careerState) save.careerState.transferRequest ??= null;
  }

  if (save.version === 23) {
    // v23 -> v24: the manager has a view of him.
    //
    // Derived rather than defaulted, and the distinction is the whole of this
    // step. A flat neutral would be inventing a manager who has watched a
    // ten-season career and formed no opinion of it, which is not a truthful
    // reading of anything. The one thing an older save DOES record about how
    // the club sees him is what it called him when it signed him — so his
    // squad role is where his manager starts, exactly as it is for a player
    // signing today.
    //
    // What is genuinely lost is the seasons themselves: a career that has been
    // undroppable for three years arrives at whatever its contract says rather
    // than at the trust it earned, and there is no way to recover that from a
    // save that never wrote it down. It is corrected by playing — a handful of
    // matches move this number to where the football says it should be.
    save = { ...save, version: 24 };
    for (const career of save.careers ?? []) {
      if (career) {
        career.confidence ??= startingConfidence(
          career.loan?.role ?? career.contract?.role ?? 'starter',
        );
      }
    }
  }

  if (save.version === 24) {
    // v24 -> v25: the week before a match is a decision.
    //
    // Nobody comes forward with one planned, because no earlier version had a
    // week to plan. Null is the truthful reading and the only safe one: a plan
    // invented here would name a calendar slot it was not made for, and would
    // be spent on the first fixture the career happened to be sitting in front
    // of.
    save = { ...save, version: 25 };
    for (const career of save.careers ?? []) {
      if (career) career.week ??= null;
    }
  }

  if (save.version === 25) {
    // v25 -> v26: a footballer becomes known for things, and a career remembers.
    //
    // Both start EMPTY, and neither is reconstructed here — but they behave
    // differently afterwards, and the difference is the whole reason this is
    // only three lines.
    //
    // Traits are earned from evidence that was already being recorded, so an
    // existing career is not starting from nothing: `applyMatchToCareer`
    // evaluates the conditions against the record book, and a career that has
    // already scored four hat-tricks becomes a poacher at its very next match.
    // Awarding them here instead would mean this function reimplementing the
    // earning rules, which is the sort of duplication that quietly drifts.
    //
    // The consequence, stated rather than hidden: a long career can earn
    // several at once on its first match back, and the hub will say so all at
    // once. That is a fair reading of "you were already these things and nobody
    // had written it down".
    //
    // Moments genuinely cannot be recovered. Nothing can go back and narrate a
    // first goal scored three seasons ago, so an existing career starts its
    // diary from here. That is the same limit item 11 ran into and the same
    // answer: a counter only counts forward.
    save = { ...save, version: 26 };
    for (const career of save.careers ?? []) {
      if (career) {
        career.moments ??= [];
        career.lastMoments ??= [];
        if (career.player) career.player.traits ??= [];
      }
    }
  }

  if (save.version === 26) {
    // v26 -> v27: the rival has a career of his own.
    //
    // The list of men he has displaced starts empty, because nothing anywhere in
    // an older save records who they were. Nobody is invented: a name conjured
    // here would be a footballer the player never actually beat.
    //
    // One consequence worth stating rather than hiding, because it follows from
    // the same rule every counter in this game obeys — it can only count
    // forward. `Rival.starts` is unset on a migrated career and reads as zero,
    // so the FIRST summer after this lands judges the contest on however much
    // of the season happened to be left when the save came forward. That
    // under-counts the rival and makes selling him slightly likelier than the
    // season really justified, exactly once. The cost is bounded — a rival
    // leaves a year early and a replacement arrives — and the alternative,
    // a sentinel meaning "not counted" threaded through the model forever, is
    // more machinery than one mildly early transfer is worth.
    save = { ...save, version: 27 };
    for (const career of save.careers ?? []) {
      if (career) career.formerRivals ??= [];
    }
  }

  if (save.version === 27) {
    // v27 -> v28: the manager says what he wants this season.
    //
    // Nothing is invented here, and the reason is the usual one: a demand
    // back-dated to a season already half played would be judged in the summer
    // against months the player spent not knowing about it. So a migrated
    // career carries NO objective until its next seam — a transfer, or the end
    // of the season it is in — and `judgeObjective` returns `unjudged` for a
    // null one, which is exactly the right verdict on a season nobody set a
    // target for.
    //
    // `seasonInjuredMisses` starts at zero for the same reason it cannot be
    // recovered: no older save records which absences were injuries. The one
    // season that straddles this migration therefore under-counts them, which
    // can only make an objective HARDER to have forgiven — and since there is no
    // objective to forgive until the next one is set, it costs nothing at all.
    save = { ...save, version: 28 };
    for (const career of save.careers ?? []) {
      if (career) {
        career.objective ??= null;
        career.seasonInjuredMisses ??= 0;
      }
    }
  }

  // The flat field is a migration detail and must not survive into the save.
  // Leaving it would give the game two answers to "which career is this", and
  // the stale one would win on any code path that had not been updated.
  delete save.careerState;

  if (save.version !== SAVE_VERSION) return null;

  // Settings are additive: an older save simply had none, and a save written
  // before a new preference existed must still load. That is why the hub layout
  // needed no migration step of its own — an older save has no `hubLayout` key
  // and gets the default, which is exactly right.
  save.settings = { ...defaultSettings(), ...(save.settings ?? {}) };

  // Additive is not the same as trusted. A hand-edited or downgraded save can
  // carry a layout this version has never heard of, and a hub that renders
  // neither shape is a career you cannot play — so an unrecognised value falls
  // back rather than being taken at its word.
  if (!isHubLayout(save.settings.hubLayout)) {
    save.settings.hubLayout = defaultSettings().hubLayout;
  }
  save.settings.hubOpen = Array.isArray(save.settings.hubOpen)
    ? save.settings.hubOpen.filter(isHubSectionId)
    : defaultSettings().hubOpen;

  // A career that predates a field must not crash the game. Applied to every
  // slot, not just the active one: a slot you are not currently playing is
  // still read by the front door, and would break it just as thoroughly.
  if (!Array.isArray(save.careers)) save.careers = emptySlots();
  save.careers = Array.from({ length: CAREER_SLOTS }, (_, slot) => {
    const career = save.careers[slot] ?? null;
    if (!career) return null;
    if (!Array.isArray(career.history)) career.history = [];
    if (!Array.isArray(career.offers)) career.offers = [];
    if (!Array.isArray(career.transfers)) career.transfers = [];
    if (!Array.isArray(career.honours)) career.honours = [];
    // Preferences are additive in the way settings are: a career from before
    // they existed simply had none, and a damaged one is repaired rather than
    // costing somebody the career that holds it.
    if (!career.preferences || typeof career.preferences !== 'object') {
      career.preferences = defaultPreferences();
    }
    if (!Array.isArray(career.preferences.refused)) career.preferences.refused = [];
    if (!Array.isArray(career.preferences.favoured)) career.preferences.favoured = [];
    // The two demands are additive in the same way, and repaired the same way:
    // an unrecognised band is treated as no demand at all rather than as the
    // nearest one, because guessing which ultimatum somebody meant is worse
    // than reading a damaged save as having made none.
    if (!(career.preferences.standing in STANDING_FLOORS)) career.preferences.standing = 'any';
    if (
      career.preferences.european !== null &&
      career.preferences.european !== 'any' &&
      !isEuropeanTier(career.preferences.european ?? '')
    ) {
      career.preferences.european = null;
    }
    // A request that names a club nobody plays for any more is not a request.
    if (career.transferRequest === undefined) career.transferRequest = null;
    // A career from before the super cup existed simply has none to play.
    if (career.superCup === undefined) career.superCup = null;
    return career;
  });
  // The wall is additive in exactly the way settings are: a save written before
  // it existed simply has none, and a damaged one is repaired rather than
  // dropped — losing a wall must never cost somebody the career they are in.
  if (!Array.isArray(save.hallOfFame)) {
    save.hallOfFame = [];
  } else {
    save.hallOfFame = rankLegacies(save.hallOfFame.filter(isUsableLegacy)).slice(
      0,
      HALL_OF_FAME_LIMIT,
    );
  }
  // One unreadable slot empties that slot and nothing else. Dropping the whole
  // save over it would cost somebody two careers to punish a fault in a third.
  save.careers = save.careers.map((career) => (career && isUsableCareer(career) ? career : null));

  // An active slot pointing outside the rack is a save that cannot say which
  // career it is playing. Falling back to the first is always safe: the front
  // door lists every slot anyway, so nothing is unreachable.
  if (
    !Number.isInteger(save.activeSlot) ||
    save.activeSlot < 0 ||
    save.activeSlot >= CAREER_SLOTS
  ) {
    save.activeSlot = 0;
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

/**
 * Why the last attempt to write failed.
 *
 * `quota` — the browser has storage and will not give this origin any more of
 * it, usually because the save has grown or the profile is near its limit.
 * `unavailable` — there is no storage to write to at all: private browsing on
 * some browsers, a profile with site data switched off, an origin the user has
 * blocked. The two want different words in front of a player, which is the only
 * reason they are told apart.
 */
export type StorageFailure = 'quota' | 'unavailable';

/**
 * The outcome of the most recent write, or null while writes are working.
 *
 * Module state rather than a return value threaded through the ten functions
 * that write, because every one of those returns the new `SaveData` and giving
 * each a second channel would change ten signatures to answer one question.
 * The question is also not per-call: a player does not need to know which save
 * failed, they need to know that this browser is not keeping their game.
 */
let lastWriteFailure: StorageFailure | null = null;

/** What went wrong the last time the game tried to save, if anything did. */
export function storageFailure(): StorageFailure | null {
  return lastWriteFailure;
}

/**
 * Find out whether this browser will keep anything, before it matters.
 *
 * Without this the game only discovers it cannot save at the moment it first
 * tries — which is after the player has already done something worth keeping.
 * A private window would let somebody start a career, play a match and reach
 * the hub before anything hinted that none of it was being stored, because a
 * boot that only ever READS storage never finds out that writing is refused.
 *
 * Deliberately a scratch key rather than the save itself. Writing the real save
 * on boot would work, but it would also mean every start of the game rewrites
 * a file it has no new information for — and on a browser that is merely FULL,
 * that write is the one most likely to fail and least likely to be recoverable.
 * A few bytes under a key nobody reads answers the same question and cleans up
 * after itself.
 */
export function probeStorage(): StorageFailure | null {
  try {
    const key = `${STORAGE_KEY}.probe`;
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    lastWriteFailure = null;
  } catch (error) {
    lastWriteFailure = classifyWriteError(error);
  }
  return lastWriteFailure;
}

function classifyWriteError(error: unknown): StorageFailure {
  // Browsers disagree on the name and agree on the code. Safari in private mode
  // historically threw QuotaExceededError for "there is no storage here at all",
  // so a name match is evidence of quota rather than proof of it — but calling
  // a storage-less browser "full" is the less misleading of the two mistakes,
  // since the advice on both is the same: export the save somewhere else.
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22
    ) {
      return 'quota';
    }
  }
  return 'unavailable';
}

/**
 * Write the save, and say whether it worked.
 *
 * It used to swallow every failure with "the game plays on", which is true and
 * was never the whole story: the game plays on and keeps nothing, so somebody
 * in a private window can finish an eighteen-season career and lose all of it
 * without the game ever having said a word. Playing on is still the right
 * behaviour — refusing to run because storage is unavailable would be worse —
 * but it is now a behaviour the player is told about, and the export they can
 * still do is the thing telling them is for.
 */
export function writeSave(save: SaveData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    lastWriteFailure = null;
    return true;
  } catch (error) {
    lastWriteFailure = classifyWriteError(error);
    return false;
  }
}

/**
 * Write a slot.
 *
 * The one place slots are actually mutated. Everything else that changes a
 * career — saving a match, clearing a slot, ending a career — goes through
 * here, so the array is rebuilt rather than written into and its length can
 * never drift from `CAREER_SLOTS`.
 */
function withSlot(save: SaveData, slot: number, career: CareerState | null): SaveData {
  const careers = Array.from({ length: CAREER_SLOTS }, (_, index) =>
    index === slot ? career : (save.careers[index] ?? null),
  );
  return { ...save, careers };
}

/** The career being played, if the active slot holds one. */
export function activeCareer(save: SaveData): CareerState | undefined {
  return save.careers[save.activeSlot] ?? undefined;
}

/** Whatever is in one slot, empty or not. */
export function careerInSlot(save: SaveData, slot: number): CareerState | undefined {
  return save.careers[slot] ?? undefined;
}

/**
 * Point every subsequent operation at a different slot.
 *
 * Selecting is separate from acting on purpose: the front door offers three
 * careers and several things to do to each, and threading a slot number
 * through every one of those actions would give the game two ways to say which
 * career it meant. There is one — this.
 */
export function selectSlot(save: SaveData, slot: number): SaveData {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CAREER_SLOTS) return save;
  const updated: SaveData = { ...save, activeSlot: slot };
  writeSave(updated);
  return updated;
}

/** The lowest empty slot, or null when all three are in use. */
export function firstEmptySlot(save: SaveData): number | null {
  const slot = save.careers.findIndex((career) => !career);
  return slot === -1 ? null : slot;
}

export function saveCareer(save: SaveData, careerState: CareerState): SaveData {
  const updated = withSlot(save, save.activeSlot, careerState);
  writeSave(updated);
  return updated;
}

export function clearCareer(save: SaveData): SaveData {
  return clearSlot(save, save.activeSlot);
}

/** Empty one slot, leaving the other careers and the wall alone. */
export function clearSlot(save: SaveData, slot: number): SaveData {
  const updated = withSlot(save, slot, null);
  writeSave(updated);
  return updated;
}

/**
 * Is this entry structurally readable?
 *
 * Held to the same standard as `isUsableCareer` and for the same reason: the
 * wall is rendered on the home screen, so one malformed entry from an older
 * version must not be able to stop the game from starting. A bad entry is
 * dropped; the rest of the wall, and the live career, are untouched.
 */
export function isUsableLegacy(entry: unknown): entry is CareerLegacy {
  if (!entry || typeof entry !== 'object') return false;
  const legacy = entry as Partial<CareerLegacy>;
  return (
    typeof legacy.id === 'string' &&
    typeof legacy.name === 'string' &&
    typeof legacy.score === 'number' &&
    typeof legacy.endedAt === 'number' &&
    typeof legacy.appearances === 'number' &&
    Array.isArray(legacy.honours)
  );
}

/**
 * End the career and put it on the wall, in one write.
 *
 * Deliberately ONE operation rather than "add to the wall" plus "clear the
 * career". Two writes have a moment between them, and a browser that dies in
 * that moment leaves you either with a career you have already said goodbye to
 * or with a wall entry for a career still being played. Ending is atomic.
 */
export function enshrineCareer(save: SaveData, legacy: CareerLegacy): SaveData {
  const updated: SaveData = {
    ...withSlot(save, save.activeSlot, null),
    hallOfFame: rankLegacies([...(save.hallOfFame ?? []), legacy]).slice(0, HALL_OF_FAME_LIMIT),
  };
  writeSave(updated);
  return updated;
}

// ------------------------------------------------- taking it with you ---

/**
 * TRANSFERRING A SAVE
 *
 * localStorage is not storage anybody chose. It is per-browser, per-profile and
 * per-origin; it is cleared by the same button that clears cookies, by private
 * browsing, and by a browser deciding it needs the space. Everything the game
 * has ever recorded — three careers, a wall of fame, a season somebody has been
 * playing for a month — lives in one key that a routine tidy-up deletes without
 * asking. That is a fine default and an unacceptable only option.
 *
 * The exported file is the SAVE ITSELF, not a summary or a special export
 * format. Two consequences, both wanted: an export can be imported by any
 * version that can migrate it, because it goes in through exactly the same door
 * as a save read off disk; and there is no second serialiser to keep in step
 * with the first.
 */

/** The save as a file's worth of text. Indented, because people open these. */
export function exportSave(save: SaveData): string {
  return JSON.stringify(save, null, 2);
}

/** What to call the file. Dated, because the point of one is having several. */
export function exportFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `footii-save-${stamp}.json`;
}

/**
 * Read a save back in, or refuse.
 *
 * Runs the text through the SAME migration every boot uses, so an older
 * export is brought forward rather than rejected, and a file that is not a
 * Footii save at all fails the same way a corrupt one does — with a null, not
 * with a half-applied import.
 *
 * Nothing is written here. Deciding to overwrite everything the browser holds
 * is the caller's to make, and it should be made against a save it has already
 * seen parse.
 */
export function importSave(text: string): SaveData | null {
  try {
    const parsed = JSON.parse(text) as Partial<SaveData>;
    return migrate(parsed);
  } catch {
    return null;
  }
}

/**
 * Replace everything with an imported save.
 *
 * Deliberately total. A partial import — careers but not the wall, or a wall
 * merged into the existing one — would produce a save that never existed on
 * either machine, with duplicate wall entries and careers whose transfers refer
 * to a world the other half does not have. Import is "make this browser be that
 * browser", and the confirmation in front of it says so.
 */
export function replaceSave(save: SaveData): SaveData {
  writeSave(save);
  return save;
}

/** Wipe the wall. The career being played, if any, is not touched. */
export function clearHallOfFame(save: SaveData): SaveData {
  const updated: SaveData = { ...save, hallOfFame: [] };
  writeSave(updated);
  return updated;
}

/** Remove one career from the wall, by id. */
export function removeFromHallOfFame(save: SaveData, id: string): SaveData {
  const updated: SaveData = {
    ...save,
    hallOfFame: (save.hallOfFame ?? []).filter((entry) => entry.id !== id),
  };
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
