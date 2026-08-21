import { MatchEngine } from '../simulation/MatchEngine.ts';
import { runMatchAutomatically } from '../simulation/AutoPlay.ts';
import { DECISION_PACE, UNTIMED_PACE } from '../simulation/DecisionTimer.ts';
import {
  acceptOffer,
  canStay,
  negotiateDeal,
  careerTeams,
  europeanState,
  prepareNextMatch,
  worldCup,
  worldTable,
  endSeason,
  missMatch,
  recordPlayerMatch,
  startCareer,
  stayAtClub,
} from '../simulation/CareerService.ts';
import { allClubIds, countryPrestige, getCountry, locateClub } from '../core/career/countries.ts';
import { knockoutFor, nextMatch, seasonComplete } from '../core/career/career.ts';
import type { ScheduledMatch } from '../core/career/career.ts';
import { competitionLabel } from '../core/career/calendar.ts';
import { europeanTierOf } from '../core/career/europe.ts';
import type { CareerState } from '../core/career/career.ts';
import { Rng } from '../core/rng.ts';
import { clonePlayer, currentAbility } from '../core/player/player.ts';
import type { Player } from '../core/player/player.ts';
import { createCustomPlayer } from '../core/player/playerBuilder.ts';
import type { CustomPlayerSpec } from '../core/player/playerBuilder.ts';
import { positionLabel } from '../core/player/positions.ts';
import {
  CUSTOM_PLAYER_ID,
  TEAMS,
  bestGoalkeeperIn,
  getGoalkeeperForTeam,
  getPreset,
  getTeam,
} from '../data/gameData.ts';
import type { Team } from '../core/team/team.ts';
import { GROUP_ROUNDS, INTERNATIONAL } from '../core/career/international.ts';
import { countryOfNation, nationId } from '../core/career/nations.ts';
import { matchResult } from '../core/match/matchState.ts';
import { averageRating } from '../core/career/seasonStats.ts';
import type { SaveData } from '../persistence/storage.ts';
import {
  activeCareer,
  careerInSlot,
  clearCareer,
  clearHallOfFame,
  clearSlot,
  enshrineCareer,
  exportFilename,
  exportSave,
  firstEmptySlot,
  importSave,
  loadSave,
  recordMatch,
  removeFromHallOfFame,
  replaceSave,
  saveCareer,
  probeStorage,
  saveSettings,
  selectSlot,
  storageFailure,
  writeSave,
} from '../persistence/storage.ts';
import type { GameSettings } from '../persistence/storage.ts';
import { fixturesFor } from '../core/career/career.ts';
import { DebugPanel } from './components/DebugPanel.ts';
import { EventOverlay } from './components/EventOverlay.ts';
import { InputController } from './interaction/InputController.ts';
import { CareerScreen } from './screens/CareerScreen.ts';
import { ShootoutEngine } from '../simulation/ShootoutEngine.ts';
import { ShootoutScreen } from './screens/ShootoutScreen.ts';
import { PreferencesScreen } from './screens/PreferencesScreen.ts';
import { defaultPreferences } from '../core/career/preferences.ts';
import { clubStanding, reachOf, trialPassed, trialRequirement } from '../core/career/trial.ts';
import { TrialResultScreen } from './screens/TrialResultScreen.ts';
import { squadLevel } from '../core/career/transfers.ts';
import type { ShootoutSide } from '../core/career/shootout.ts';
import { simulateShootout } from '../core/career/shootout.ts';
import { CareerEndScreen } from './screens/CareerEndScreen.ts';
import { HallOfFameScreen } from './screens/HallOfFameScreen.ts';
import type { TotalsView } from './screens/FullTimeScreen.ts';
import { FullTimeScreen } from './screens/FullTimeScreen.ts';
import { HomeScreen } from './screens/HomeScreen.ts';
import type { CareerSummary } from './screens/HomeScreen.ts';
import { MatchScreen } from './screens/MatchScreen.ts';
import { PlayerCreatorScreen } from './screens/PlayerCreatorScreen.ts';
import { SeasonReviewScreen } from './screens/SeasonReviewScreen.ts';
import { TrainingScreen } from './screens/TrainingScreen.ts';
import { WorldScreen } from './screens/WorldScreen.ts';
import { TransferScreen } from './screens/TransferScreen.ts';
import { applyTraining } from '../core/career/training.ts';
import type { CareerEnding } from '../core/career/legacy.ts';
import { isWorthRemembering, retirementProspect, summariseCareer } from '../core/career/legacy.ts';
import type { SetupSelection } from './screens/SetupScreen.ts';
import { SetupScreen } from './screens/SetupScreen.ts';

type Mode = 'career' | 'quick';

/** Screen routing and the wiring between UI and simulation. */
export class App {
  private readonly input = new InputController();
  private readonly debug = new DebugPanel();
  private readonly overlay: EventOverlay;
  private save: SaveData;
  private matchScreen: MatchScreen | null = null;
  /**
   * A shootout in progress, if one is.
   *
   * Held for the same reason `matchScreen` is: it drives itself on a timer and
   * has to be told to stop when the screen it lives on is replaced, or a
   * shootout the player has walked away from goes on taking kicks.
   */
  private shootoutScreen: ShootoutScreen | null = null;
  private paceScale = 1;
  /** A player built in the creator this session, if any. */
  private customPlayer: Player | null = null;
  /**
   * The player choice to preselect on the setup screen.
   * Held here rather than read back from `lastSelection`, because returning
   * from the creator would otherwise be overwritten by the previously saved
   * selection — you would build a custom player and then start a career as a
   * pre-build without noticing.
   */
  private selectedPresetId: string | null = null;
  /**
   * The "this browser is not saving your game" bar.
   *
   * Built once and kept outside the screen it sits above, for the same reason
   * the debug panel is: every navigation clears `root`, and a warning that a
   * career is not being saved must not disappear because the player changed
   * screen. It is empty and hidden until a write actually fails.
   */
  private readonly storageWarning = document.createElement('div');

  constructor(private readonly root: HTMLElement) {
    this.overlay = new EventOverlay(this.input);
    this.save = loadSave();
    // Asked at boot rather than discovered at the first write, so somebody in a
    // private window is told before they have played anything worth keeping
    // rather than after.
    probeStorage();
    this.applySettings();
    this.input.bindKey('d', () => this.debug.toggle());
    this.storageWarning.className = 'storage-warning';
    this.storageWarning.hidden = true;
    this.root.appendChild(this.storageWarning);
    this.root.appendChild(this.debug.element);
    this.showHome();
  }

  /**
   * Show or hide the storage warning, according to what the last write did.
   *
   * Called from `mount`, so it is re-evaluated on every navigation without any
   * screen having to know it exists. Once storage starts working again the bar
   * goes away on its own, which is the right behaviour for a quota that was
   * freed or a permission that was granted mid-session.
   */
  private refreshStorageWarning(): void {
    const failure = storageFailure();
    if (!failure) {
      this.storageWarning.hidden = true;
      this.storageWarning.replaceChildren();
      return;
    }

    const reason =
      failure === 'quota'
        ? 'This browser has run out of room to save your game.'
        : 'This browser is not letting the game save.';

    this.storageWarning.hidden = false;
    this.storageWarning.replaceChildren();

    const text = document.createElement('p');
    text.innerHTML =
      `<strong>${reason}</strong> Everything you play from here is being kept in memory only, ` +
      'and closing this tab will lose it. Exporting writes the whole save to a file, which you ' +
      'can import again on a browser that will keep it.';
    this.storageWarning.appendChild(text);

    const button = document.createElement('button');
    button.className = 'ghost';
    button.textContent = 'Export to a file';
    button.addEventListener('click', () => this.exportSaveFile());
    this.storageWarning.appendChild(button);
  }

  private mount(element: HTMLElement): void {
    // A shootout drives itself on a timer, so leaving one behind would have it
    // taking kicks against a screen nobody is looking at. Stopped here rather
    // than at each call site, because every navigation goes through this.
    this.shootoutScreen?.stop();
    this.shootoutScreen = null;

    for (const child of Array.from(this.root.children)) {
      if (child !== this.debug.element && child !== this.storageWarning) child.remove();
    }
    this.root.appendChild(element);
    // After the screen is in place, so the bar is always the first thing above
    // whatever the player just navigated to.
    this.refreshStorageWarning();
    this.root.insertBefore(this.storageWarning, this.root.firstChild);
    window.scrollTo(0, 0);
  }

  // -------------------------------------------------------------- home ---

  private showHome(status?: string): void {
    this.matchScreen?.stop();
    this.matchScreen = null;

    this.mount(
      new HomeScreen({
        slots: this.careerSlots(),
        activeSlot: this.save.activeSlot,
        // Every slot action SELECTS first and then acts, so no screen after
        // this one needs to be told which career it is working on.
        onContinueCareer: (slot) => {
          this.save = selectSlot(this.save, slot);
          this.showCareerHub();
        },
        onEndCareer: (slot) => {
          this.save = selectSlot(this.save, slot);
          const career = activeCareer(this.save);
          if (career) this.showCareerEnd(career, 'abandoned', false);
        },
        onStartCareer: (slot) => {
          this.save = selectSlot(this.save, slot);
          this.showSetup('career');
        },
        onQuickMatch: () => this.showSetup('quick'),
        hallOfFame: this.save.hallOfFame,
        onHallOfFame: () => this.showHallOfFame(),
        onExport: () => this.exportSaveFile(),
        onImport: (text) => this.importSaveFile(text),
        status,
        settings: this.save.settings,
        onSettingsChange: (settings) => this.updateSettings(settings),
      }).element,
    );
  }

  /**
   * Every slot, described for the front door.
   *
   * Built per slot rather than for "the career", because the home screen now
   * shows all three at once and a fault in one must not blank the other two.
   */
  private careerSlots(): (CareerSummary | null)[] {
    return this.save.careers.map((_, slot) => this.careerSummary(slot));
  }

  /**
   * Summarise the career for the home screen, or nothing at all.
   *
   * Deliberately defensive: this reads deep into a saved career (statistics,
   * fixtures, the club it refers to), and a save written by another version —
   * or referring to a club that no longer exists — must not stop the game from
   * starting. A career we cannot describe is simply not offered — and, now
   * that there are three of them, only the unreadable slot is emptied.
   */
  private careerSummary(slot: number): CareerSummary | null {
    const career = careerInSlot(this.save, slot);
    if (!career) return null;
    try {
      return {
        name: career.player.name,
        detail: `${positionLabel(career.player.position)} · age ${career.player.age} · ${getTeam(career.clubId).name} · ${getCountry(career.countryId).short} · season ${career.seasonNumber}`,
        ability: currentAbility(career.player),
        played: career.seasonStats.matches,
        total: fixturesFor(career, career.clubId).length,
        goals: career.seasonStats.goals,
        assists: career.seasonStats.assists,
      };
    } catch (error) {
      console.error('Saved career could not be read; dropping it', error);
      this.save = clearSlot(this.save, slot);
      return null;
    }
  }

  // -------------------------------------------------- taking it with you ---

  /**
   * Hand the whole save over as a file.
   *
   * A blob and a synthetic click, rather than a data: URL, because a save with
   * three long careers and a full wall runs to hundreds of kilobytes and a
   * data: URL that size is refused by some browsers and truncated by others.
   * The object URL is revoked straight away — the download has already been
   * handed to the browser by the time the click returns.
   */
  private exportSaveFile(): void {
    try {
      const blob = new Blob([exportSave(this.save)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      this.showHome(`Saved to ${exportFilename()}. Keep it somewhere that is not this browser.`);
    } catch (error) {
      console.error('Export failed', error);
      this.showHome('The save could not be exported. Nothing has changed.');
    }
  }

  /**
   * Replace this browser's save with an imported one.
   *
   * The file is parsed and migrated BEFORE anything is written, so a bad import
   * costs nothing — the worst case is a message and the save you already had.
   * The screen the player lands on is the front door, rebuilt from the imported
   * save, which is the shortest way to see that it worked.
   */
  private importSaveFile(text: string): void {
    const imported = importSave(text);
    if (!imported) {
      this.showHome('That file could not be read as a Footii save. Nothing has changed.');
      return;
    }
    this.save = replaceSave(imported);
    this.applySettings();
    const careers = this.save.careers.filter(Boolean).length;
    const wall = this.save.hallOfFame.length;
    this.showHome(
      `Save imported: ${careers} ${careers === 1 ? 'career' : 'careers'} in progress, ` +
        `${wall} on the wall of fame.`,
    );
  }

  // -------------------------------------------------------- career end ---

  /**
   * The last screen a career gets.
   *
   * Reached three ways, and deliberately the SAME screen for all of them: from
   * the home card, when you have decided you are done with him; from the season
   * review, when he is old enough to choose; and from the season review again
   * when he is old enough that there is no choice. What ends a career changes
   * what the buttons say, not what you are shown — the summary is the point,
   * and it is identical whether he walked away at 39 or you gave up on him at 22.
   *
   * Nothing is written until the button is pressed. Opening this screen and
   * going back leaves the save exactly as it was.
   */
  private showCareerEnd(
    career: CareerState,
    ending: CareerEnding,
    forced: boolean,
    reason?: string,
    /**
     * Where "no, not yet" goes.
     *
     * Supplied by the season review, because deciding against retiring has to
     * put the player back into the SUMMER he was in the middle of — the
     * transfer window and the training points he has not spent — and not on the
     * hub with both of them skipped. Defaults to the hub for an ending reached
     * from the home screen, where there is no summer in progress.
     */
    onCancel?: () => void,
  ): void {
    this.matchScreen?.stop();
    this.matchScreen = null;

    let legacy;
    try {
      legacy = summariseCareer(career, getTeam, ending);
    } catch (error) {
      // Summarising reads the whole career, so a damaged one could throw here —
      // and being unable to describe a career must not mean being unable to end
      // it. Fall back to simply clearing it, which is what the old Abandon did.
      console.error('Career could not be summarised; ending it without a record', error);
      this.save = clearCareer(this.save);
      this.showHome();
      return;
    }

    this.mount(
      new CareerEndScreen(
        { state: career, legacy, ending, forced, reason },
        {
          onConfirm: () => {
            // A career with no appearances leaves no record — see
            // `isWorthRemembering`. It is still ended, just not enshrined.
            this.save = isWorthRemembering(legacy)
              ? enshrineCareer(this.save, legacy)
              : clearCareer(this.save);
            if (isWorthRemembering(legacy)) this.showHallOfFame(legacy.id);
            else this.showHome();
          },
          onCancel: forced
            ? undefined
            : (onCancel ?? (ending === 'retired' ? () => this.showCareerHub() : () => this.showHome())),
        },
      ).element,
    );
  }

  /**
   * The wall of fame, with the career just added picked out of it.
   *
   * Clearing and removing write straight through and re-render, so the list on
   * screen is always the list in the save — there is no in-memory copy that
   * could disagree with it.
   */
  private showHallOfFame(highlightId?: string): void {
    this.mount(
      new HallOfFameScreen(
        this.save.hallOfFame,
        {
          onBack: () => this.showHome(),
          onClear: () => {
            this.save = clearHallOfFame(this.save);
            this.showHallOfFame();
          },
          onRemove: (id: string) => {
            this.save = removeFromHallOfFame(this.save, id);
            // The highlight is dropped on any removal: it points at a position
            // in a list that has just changed underneath it.
            this.showHallOfFame();
          },
        },
        highlightId,
      ).element,
    );
  }

  // ------------------------------------------------------------- setup ---

  private showSetup(mode: Mode): void {
    const screen = new SetupScreen({
      mode,
      onStart: (selection) =>
        mode === 'career' ? this.beginCareer(selection) : this.startQuickMatch(selection),
      onCreatePlayer: (selection) => this.showCreator(mode, selection),
      onBack: () => this.showHome(),
      customLabel: this.customPlayer
        ? `${this.customPlayer.name} — ${this.customPlayer.position}, ${this.customPlayer.age} (yours)`
        : undefined,
      customPlayer: this.customPlayer ?? undefined,
    });
    this.mount(screen.element);

    if (this.selectedPresetId === CUSTOM_PLAYER_ID && this.customPlayer) {
      const select = screen.element.querySelector<HTMLSelectElement>('#preset');
      if (select) select.value = CUSTOM_PLAYER_ID;
    }

    const last = this.save.lastSelection;
    if (last) {
      const set = (id: string, value: string) => {
        const el = screen.element.querySelector<HTMLSelectElement | HTMLInputElement>(`#${id}`);
        if (el) el.value = value;
      };
      // An explicit in-session choice always wins over the saved one, and a
      // stale custom selection is never restored once the creation is gone.
      const desired = this.selectedPresetId ?? last.presetId;
      if (desired !== CUSTOM_PLAYER_ID || this.customPlayer) set('preset', desired);
      set('team', last.teamId);
      set('opponent', last.opponentId);
      set('seed', last.seed);
      set('length', String(last.length));
      screen.element.querySelector<HTMLSelectElement>('#preset')?.dispatchEvent(new Event('change'));
    }
  }

  /**
   * The creator is the LAST step, not a detour.
   *
   * It used to hand you back to the configuration screen, so a button labelled
   * "Start career" did not start a career — it dropped you on a settings page
   * indistinguishable from the quick-match one. Club, seed and pace are already
   * chosen before you get here, so finishing the creator now does exactly what
   * its button says.
   */
  private showCreator(mode: Mode, selection: SetupSelection): void {
    this.mount(
      new PlayerCreatorScreen(
        {
          onConfirm: (spec: CustomPlayerSpec) => {
            // Potential is rolled once, here, and never shown.
            this.customPlayer = createCustomPlayer(new Rng(`${spec.name}:${Date.now()}`), spec);
            this.selectedPresetId = CUSTOM_PLAYER_ID;
            const withCustom: SetupSelection = { ...selection, presetId: CUSTOM_PLAYER_ID };
            if (mode === 'career') this.beginCareer(withCustom);
            else this.startQuickMatch(withCustom);
          },
          onCancel: () => this.showSetup(mode),
        },
        mode === 'career',
        getTeam(selection.teamId).name,
      ).element,
    );
  }

  /** Resolve the chosen player: a preset, or the custom creation. */
  private resolvePlayer(presetId: string): Player {
    if (presetId === CUSTOM_PLAYER_ID && this.customPlayer) {
      return clonePlayer(this.customPlayer);
    }
    return getPreset(presetId === CUSTOM_PLAYER_ID ? 'young-prospect' : presetId).create();
  }

  /**
   * Apply the saved preferences.
   *
   * Called on boot and whenever they change, so EVERY entry point — a new
   * career, a quick match, or continuing a saved career after a reload — plays
   * at the chosen pace. Applying it only when a match was configured meant a
   * resumed career silently reverted to Standard.
   */
  private applySettings(): void {
    const pace = this.save.settings.pace;
    this.paceScale = DECISION_PACE[pace] ?? 1;
    this.overlay.paceScale = this.paceScale;
    this.overlay.untimed = pace === UNTIMED_PACE;
  }

  private updateSettings(settings: Partial<GameSettings>): void {
    this.save = saveSettings(this.save, settings);
    this.applySettings();
  }

  // ------------------------------------------------------- quick match ---

  private startQuickMatch(selection: SetupSelection): void {
    this.selectedPresetId = selection.presetId;
    this.save = { ...this.save, lastSelection: selection };
    writeSave(this.save);

    const player = this.resolvePlayer(selection.presetId);
    const playerTeam = getTeam(selection.teamId);
    const opponent = getTeam(selection.opponentId);

    this.runMatch(
      new MatchEngine(
        {
          player,
          playerTeam,
          opponent,
          opponentGoalkeeper: getGoalkeeperForTeam(opponent.id),
          ownGoalkeeper: getGoalkeeperForTeam(playerTeam.id),
          length: selection.length,
          playerTeamIsHome: true,
          paceScale: this.paceScale,
        },
        selection.seed,
      ),
      selection.seed,
      (engine) => {
        const rating = engine.rating();
        this.save = recordMatch(this.save, engine.state.stats, rating, matchResult(engine.state));
        const c = this.save.career;
        this.mount(
          new FullTimeScreen(engine, () => this.showHome(), {
            continueLabel: 'Back to menu',
            totals: {
              // Quick-match totals only. These are a SEPARATE ledger from the
              // career, and must never be shown inside one.
              heading: 'Quick match totals',
              rows: [
                ['Matches', String(c.matches)],
                ['Goals', String(c.goals)],
                ['Assists', String(c.assists)],
                ['Shots', String(c.shots)],
                ['Key passes', String(c.keyPasses)],
                [
                  'Average rating',
                  c.matches > 0 ? (c.ratingTotal / c.matches).toFixed(2) : '—',
                ],
                ['Best rating', c.bestRating ? c.bestRating.toFixed(1) : '—'],
                ['Record (W-D-L)', `${c.wins}-${c.draws}-${c.defeats}`],
              ],
            },
          }).element,
        );
      },
    );
  }

  private runMatch(
    engine: MatchEngine,
    seed: string,
    onFinished: (engine: MatchEngine) => void,
  ): void {
    this.debug.setSeed(seed);
    const screen = new MatchScreen(engine, this.overlay, this.debug, () => onFinished(engine), {
      speedIndex: this.save.settings.matchSpeed,
      onSpeedChange: (index) => this.updateSettings({ matchSpeed: index }),
    });
    this.matchScreen = screen;
    this.mount(screen.element);
    screen.start();
  }

  // ------------------------------------------------------------ career ---

  /**
   * Start a career in the active slot.
   *
   * The slot is chosen before the setup screen, so by the time we get here it
   * is already empty — but this checks anyway, because the ONE thing slots
   * exist to prevent is a new career quietly writing over an old one. A guard
   * in the markup is a guard somebody can route around; this is the point where
   * the overwrite would actually happen.
   */
  /**
   * Start a career, or earn the right to.
   *
   * A club above his level does not simply sign an unknown — it gives him a
   * look. So a trial club routes through one match first, and the career only
   * begins if he was good enough in it. See core/career/trial.ts.
   */
  private beginCareer(selection: SetupSelection): void {
    const player = this.resolvePlayer(selection.presetId);
    const club = getTeam(selection.teamId);
    if (clubStanding(player, club) === 'trial') {
      this.showTrial(selection, player, club);
      return;
    }
    this.startCareerAt(selection);
  }

  /**
   * One match to decide whether they sign you.
   *
   * Played against a real opponent from the club's own league rather than a
   * neutral one, because the level of the football is the thing being measured:
   * a trial in front of nobody, against nobody, would prove nothing.
   *
   * The match itself is an ordinary `MatchEngine` — same decisions, same clock —
   * and NOTHING is recorded from it. It is not in a career, because there is no
   * career yet; that is the whole point of it.
   */
  private showTrial(selection: SetupSelection, player: Player, club: Team): void {
    const required = trialRequirement(reachOf(player, club));
    const opponent = this.trialOpponent(club, selection.seed);

    this.runMatch(
      new MatchEngine(
        {
          player,
          playerTeam: club,
          opponent,
          opponentGoalkeeper: getGoalkeeperForTeam(opponent.id),
          ownGoalkeeper: getGoalkeeperForTeam(club.id),
          length: selection.length,
          playerTeamIsHome: true,
          paceScale: this.paceScale,
        },
        `${selection.seed}:trial`,
      ),
      `${selection.seed}:trial`,
      (engine) => {
        const rating = engine.rating();
        const passed = trialPassed(rating, required);
        this.mount(
          new TrialResultScreen(
            {
              club,
              player,
              rating,
              required,
              passed,
              // Where he goes instead: the best club that would simply take him.
              fallback: passed ? null : this.bestOpenClub(player),
            },
            {
              onAccept: (clubId: string) => this.startCareerAt({ ...selection, teamId: clubId }),
              onBack: () => this.showSetup('career'),
            },
          ).element,
        );
      },
    );
  }

  /**
   * Who a trial is played against.
   *
   * Somebody from the club's own league, so the standard of the match is the
   * standard he is being judged at. Picked by seed rather than at random, so a
   * trial is as reproducible as everything else.
   */
  private trialOpponent(club: Team, seed: string): Team {
    const rivals = TEAMS.filter((t) => t.country === club.country && t.id !== club.id);
    const pool = rivals.length > 0 ? rivals : TEAMS.filter((t) => t.id !== club.id);
    return pool[new Rng(`${seed}:trial:opponent`).int(0, pool.length - 1)] ?? pool[0]!;
  }

  /** The strongest club that would take him without a trial. */
  private bestOpenClub(player: Player): Team | null {
    const open = TEAMS.filter((team) => clubStanding(player, team) === 'open');
    if (open.length === 0) return null;
    return open.reduce((best, team) => (squadLevel(team) > squadLevel(best) ? team : best));
  }

  private startCareerAt(selection: SetupSelection): void {
    if (activeCareer(this.save)) {
      const empty = firstEmptySlot(this.save);
      if (empty === null) {
        this.showHome('All three slots are in use. End one of those careers first.');
        return;
      }
      this.save = selectSlot(this.save, empty);
    }

    this.selectedPresetId = selection.presetId;
    this.save = { ...this.save, lastSelection: selection };

    const career = startCareer({
      player: this.resolvePlayer(selection.presetId),
      clubId: selection.teamId,
      teams: TEAMS,
      seed: selection.seed,
    });
    this.save = saveCareer(this.save, career);
    this.showCareerHub();
  }

  private showCareerHub(): void {
    const career = activeCareer(this.save);
    if (!career) {
      this.showHome();
      return;
    }
    // Same reasoning as careerSummary(): a career that cannot be rendered must
    // drop the player back to a working menu, not a blank screen.
    if (!this.canRenderCareer(career)) {
      this.save = clearCareer(this.save);
      this.showHome();
      return;
    }
    this.matchScreen?.stop();
    this.matchScreen = null;

    // A forced retirement has to survive a reload.
    //
    // It is offered at the season review, and the review is a screen you can
    // simply close. Without this check, a player who shut the tab on being told
    // his career was over would reopen the game to a hub that let him play on —
    // and would then be told again next June, forever.
    const forced = retirementProspect(career);
    if (forced?.forced) {
      this.showCareerEnd(career, 'retired', true, forced.reason);
      return;
    }

    // An open transfer window is resumed rather than lost. Closing the tab on
    // the offer screen used to leave the offers sitting in the save with no
    // route back to them, so a summer's work simply vanished.
    if (this.summerNeedsADecision(career)) {
      this.showTransferWindow(career, career.trainingPoints, []);
      return;
    }

    // Draw the next cup round before rendering, so the hub can name the
    // opponent. The draw happens when a round is REACHED, and arriving at the
    // hub with that round next is reaching it — leaving it until the match was
    // built meant the fixture card said "awaiting the draw" and guessed at a
    // venue it could not know.
    prepareNextMatch(career, getTeam);
    this.save = saveCareer(this.save, career);

    this.mount(
      new CareerScreen(career, {
        onPlay: () => this.playCareerMatch(),
        onSkip: () => this.skipCareerMatch(),
        onMiss: () => this.missCareerMatch(),
        onWorld: () => this.showWorld(),
        onEndSeason: () => this.reviewSeason(),
        onQuit: () => this.showHome(),
        onPreferences: () => this.showPreferences(career),
      }).element,
    );
  }

  /**
   * Clubs as this career currently knows them, drift included.
   *
   * The career SERVICE always takes the raw `getTeam` and applies drift itself,
   * because it owns the drifted values. Everything outside the service — the
   * match engine, the screens — has to ask for them, or it would play against
   * a league that stopped existing several summers ago.
   */
  private clubs(career: CareerState) {
    return careerTeams(career, getTeam);
  }

  /** Browse any league in the world. */
  private showWorld(): void {
    const career = activeCareer(this.save);
    if (!career) return;
    const clubs = this.clubs(career);
    this.mount(
      new WorldScreen(career, {
        table: (countryId) => worldTable(career, countryId, getTeam),
        club: clubs,
        cup: (countryId, kind) => worldCup(career, countryId, kind, getTeam),
        europe: (tier) => europeanState(career, tier, getTeam),
        onBack: () => this.showCareerHub(),
      }).element,
    );
  }

  /** Where he says what he wants from a move, before the summer asks. */
  private showPreferences(career: CareerState): void {
    this.mount(
      new PreferencesScreen(career.preferences ?? defaultPreferences(), career.countryId, {
        onChange: (preferences) => {
          career.preferences = preferences;
          this.save = saveCareer(this.save, career);
        },
        onBack: () => this.showCareerHub(),
      }).element,
    );
  }

  private canRenderCareer(career: CareerState): boolean {
    try {
      getTeam(career.clubId);
      for (const id of career.leagueTeamIds) getTeam(id);
      // Every division, not just the player's own. The hub lists clubs watching
      // from across the pyramid and the end of a season simulates the division
      // he is NOT in, so a stale id anywhere in `divisions` is just as fatal as
      // one in his own league — and used to reach the screen before throwing.
      for (const id of allClubIds(career.leagues ?? {})) getTeam(id);
      return typeof career.seasonStats?.matches === 'number' && Array.isArray(career.fixtures);
    } catch (error) {
      console.error('Saved career refers to data that no longer exists', error);
      return false;
    }
  }

  /**
   * Build the engine for the player's next fixture.
   *
   * Shared by playing and skipping, so a skipped match is set up identically to
   * a played one — same clubs, same keepers, same seed. The only difference is
   * who answers the decisions.
   */
  private nextMatchEngine(career: CareerState): { engine: MatchEngine; seed: string } | null {
    // A cup round is only drawn when it is about to be played, so the opponent
    // may not exist until this call. Everything after it can assume there is one.
    prepareNextMatch(career, getTeam);

    const scheduled = nextMatch(career);
    if (!scheduled) return null;

    const isHome = scheduled.home;
    const clubs = this.clubs(career);
    // An international is played FOR his country, not for his club. Handing the
    // engine his club here would have put him out in the wrong shirt against a
    // national side — and, since the goalkeeper is looked up from the side's id,
    // would have thrown on a nation that has no keeper of its own.
    const international = scheduled.competition === INTERNATIONAL;
    const nationality = career.player.nationality;
    const playerTeam = clubs(international ? nationId(nationality) : career.clubId);
    const opponent = clubs(scheduled.opponentId);
    const keeperFor = (team: Team) => {
      const country = countryOfNation(team.id);
      return country ? bestGoalkeeperIn(country) : getGoalkeeperForTeam(team.id);
    };

    // Fitness carries between matches, so the player starts where recovery left him.
    career.player.fitness = career.fitness;

    const seed = `${career.seed}:s${career.seasonNumber}:c${career.calendarIndex}`;
    return {
      seed,
      engine: new MatchEngine(
        {
          player: career.player,
          playerTeam,
          opponent,
          opponentGoalkeeper: keeperFor(opponent),
          ownGoalkeeper: keeperFor(playerTeam),
          length: 90,
          playerTeamIsHome: isHome,
          paceScale: this.paceScale,
        },
        seed,
      ),
    };
  }

  private playCareerMatch(): void {
    const career = activeCareer(this.save);
    if (!career) return;
    const next = this.nextMatchEngine(career);
    if (!next) return;

    this.runMatch(next.engine, next.seed, (engine) => this.finishCareerMatch(engine, career));
  }

  /**
   * Resolve the next fixture without playing it.
   *
   * Goes straight back to the hub rather than to a full-time report: a season is
   * thirty matches, and somebody skipping them does not want thirty reports. The
   * hub reports the result instead.
   */
  /**
   * Let a fixture go by while he is injured.
   *
   * No match engine is built at all, which is the point: he is not in this one.
   * The club's result is simulated by the career service exactly as every other
   * club's is, and the hub reports it as something that happened rather than as
   * something he did.
   */
  private missCareerMatch(): void {
    const career = activeCareer(this.save);
    if (!career || !career.injury) return;

    missMatch(career, getTeam);
    this.save = saveCareer(this.save, career);
    this.showCareerHub();
  }

  private skipCareerMatch(): void {
    const career = activeCareer(this.save);
    if (!career) return;
    const next = this.nextMatchEngine(career);
    if (!next) return;

    runMatchAutomatically(next.engine, next.seed);

    // A skipped tie that finished level still goes to penalties, and the
    // shootout is still played out properly — just without him. Skipping a
    // match is a choice to let the season resolve itself, not a reason for the
    // hub to be unable to say how the tie ended.
    const tie = this.levelKnockout(next.engine, career);
    this.recordCareerMatch(
      next.engine,
      career,
      true,
      tie ? this.autoShootout(career, tie) : undefined,
    );
    this.showCareerHub();
  }

  /** Fold a finished match into the career and persist it. */
  /**
   * A shootout nobody took, for a tie the player skipped.
   *
   * Deliberately a real shootout rather than the single weighted roll this used
   * to be. The roll produced a winner and nothing else, so there was no score
   * for the hub to report and nothing to distinguish going out on penalties
   * from losing 1-0.
   */
  private autoShootout(
    career: CareerState,
    tie: ScheduledMatch,
  ): { winnerId: string; scored: number; conceded: number } {
    const clubs = this.clubs(career);
    const international = tie.competition === INTERNATIONAL;
    const ownId = international ? nationId(career.player.nationality) : career.clubId;
    const own = clubs(ownId);
    const opponent = clubs(tie.opponentId);
    const keeperFor = (team: Team) => {
      const country = countryOfNation(team.id);
      return country ? bestGoalkeeperIn(country) : getGoalkeeperForTeam(team.id);
    };

    const state = simulateShootout(
      new Rng(`${career.seed}:s${career.seasonNumber}:c${career.calendarIndex}:shootout`),
      { player: own, opponent },
      { player: keeperFor(own), opponent: keeperFor(opponent) },
    );

    return {
      winnerId: state.winner === 'player' ? ownId : tie.opponentId,
      scored: state.playerScore,
      conceded: state.opponentScore,
    };
  }

  private recordCareerMatch(
    engine: MatchEngine,
    career: CareerState,
    skipped: boolean,
    shootout?: { winnerId: string; scored: number; conceded: number },
  ): void {
    recordPlayerMatch(
      career,
      {
        stats: engine.state.stats,
        rating: engine.rating(),
        playerTeamScore: engine.state.playerTeamScore,
        opponentScore: engine.state.opponentScore,
        fitnessAtEnd: engine.matchPlayer.fitness,
        skipped,
        // What the settings actually said while this match was played, read at
        // the moment it finishes rather than at the end of the season: the pace
        // is a menu the player can change between any two matches, so a season
        // is not played at one pace and cannot be counted as though it were.
        pace: this.save.settings.pace,
        shootout,
      },
      getTeam,
    );
    this.save = saveCareer(this.save, career);
  }

  /**
   * A knockout tie that has finished level, if that is what just happened.
   *
   * Asked BEFORE the match is recorded, because recording it settles the tie —
   * and settling it is the thing the shootout has to happen first. Returns the
   * scheduled match rather than a boolean, since the shootout needs to know who
   * the opponent was and what competition this is.
   */
  private levelKnockout(engine: MatchEngine, career: CareerState): ScheduledMatch | null {
    if (engine.state.playerTeamScore !== engine.state.opponentScore) return null;
    const scheduled = nextMatch(career);
    if (!scheduled || scheduled.competition === 'league') return null;
    // An international GROUP match can end level and stay level; only its
    // knockout has to produce a winner.
    if (!knockoutFor(career, scheduled.competition)) return null;
    if (scheduled.competition === INTERNATIONAL && scheduled.round <= GROUP_ROUNDS) return null;
    return scheduled;
  }

  private finishCareerMatch(engine: MatchEngine, career: CareerState): void {
    const tie = this.levelKnockout(engine, career);
    if (tie) {
      this.showShootout(engine, career, tie);
      return;
    }

    this.recordCareerMatch(engine, career, false);
    this.showFullTime(engine, career);
  }

  /**
   * Ninety minutes were not enough. Go and take the kicks.
   *
   * The tie is deliberately NOT recorded before this. Recording settles the
   * bracket, and a bracket settled before the shootout would either have to be
   * rewritten afterwards or would quietly contradict the kicks the player just
   * took — which is the bug this whole feature exists to fix, in a new place.
   */
  private showShootout(engine: MatchEngine, career: CareerState, tie: ScheduledMatch): void {
    const clubs = this.clubs(career);
    const international = tie.competition === INTERNATIONAL;
    const ownId = international ? nationId(career.player.nationality) : career.clubId;
    const own = clubs(ownId);
    const opponent = clubs(tie.opponentId);
    const keeperFor = (team: Team) => {
      const country = countryOfNation(team.id);
      return country ? bestGoalkeeperIn(country) : getGoalkeeperForTeam(team.id);
    };

    const shootout = new ShootoutEngine(
      {
        player: career.player,
        playerTeam: own,
        opponent,
        opponentGoalkeeper: keeperFor(opponent),
        ownGoalkeeper: keeperFor(own),
        paceScale: this.paceScale,
      },
      `${career.seed}:s${career.seasonNumber}:c${career.calendarIndex}`,
    );

    const screen = new ShootoutScreen(
      shootout,
      this.overlay,
      {
        player: own.shortName,
        opponent: opponent.shortName,
        competition: `${competitionLabel(tie.competition)}${tie.roundLabel ? ` — ${tie.roundLabel}` : ''}`,
      },
      (winner: ShootoutSide) => {
        this.recordCareerMatch(engine, career, false, {
          winnerId: winner === 'player' ? ownId : tie.opponentId,
          scored: shootout.state.playerScore,
          conceded: shootout.state.opponentScore,
        });
        this.showFullTime(engine, career, {
          won: winner === 'player',
          scored: shootout.state.playerScore,
          conceded: shootout.state.opponentScore,
        });
      },
    );

    // Mounted before it is remembered: `mount` stops whatever shootout was
    // running, and that must not be the one being started.
    this.mount(screen.element);
    this.shootoutScreen = screen;
    screen.start();
  }

  private showFullTime(
    engine: MatchEngine,
    career: CareerState,
    shootout?: { won: boolean; scored: number; conceded: number },
  ): void {
    this.mount(
      new FullTimeScreen(engine, () => this.showCareerHub(), {
        continueLabel: seasonComplete(career) ? 'End of season' : 'Back to career',
        development: career.lastDevelopment,
        totals: this.careerTotals(career),
        shootout,
      }).element,
    );
  }

  /**
   * Season-to-date totals for the career.
   * Deliberately built from the CAREER state, not from `save.career`, which is
   * the quick-match ledger — mixing the two was showing one-off match totals
   * inside a career.
   */
  private careerTotals(career: CareerState): TotalsView {
    const season = career.seasonStats;
    const lifetime = [...career.history, { stats: season }].reduce(
      (acc, entry) => ({
        matches: acc.matches + entry.stats.matches,
        goals: acc.goals + entry.stats.goals,
        assists: acc.assists + entry.stats.assists,
      }),
      { matches: 0, goals: 0, assists: 0 },
    );

    return {
      heading: `Season ${career.seasonNumber}`,
      rows: [
        ['Appearances', String(season.matches)],
        ['Goals', String(season.goals)],
        ['Assists', String(season.assists)],
        ['Key passes', String(season.keyPasses)],
        ['Average rating', season.matches ? averageRating(season).toFixed(2) : '—'],
        ['Best rating', season.bestRating ? season.bestRating.toFixed(1) : '—'],
        ['Record (W-D-L)', `${season.wins}-${season.draws}-${season.defeats}`],
        [
          'Career totals',
          `${lifetime.matches} apps · ${lifetime.goals} G · ${lifetime.assists} A`,
        ],
      ],
    };
  }

  private reviewSeason(): void {
    const career = activeCareer(this.save);
    if (!career || !seasonComplete(career)) return;

    const potentialBefore = career.player.potentialAbility;
    const outcome = endSeason(career, getTeam);
    const { record, champion } = outcome;
    this.save = saveCareer(this.save, career);

    // Asked AFTER the season has been closed, so the age it reads is the age he
    // starts next season at. "You are 34, there is another season in you" has to
    // mean the season he would actually be playing.
    const retirement = retirementProspect(career);

    const drift = career.player.potentialAbility - potentialBefore;
    const potentialHint =
      drift > 1
        ? 'Scouts have revised their view of you upward.'
        : drift < -1
          ? 'Scouts are less convinced than they were.'
          : 'Scouts see broadly the same ceiling as before.';

    this.mount(
      new SeasonReviewScreen(
        record,
        {
          champion,
          leagueSize: career.leagueTeamIds.length,
          newAge: career.player.age,
          potentialHint,
          progress: outcome.progress,
          // history holds the season just archived last, so the one before it
          // is the comparison point.
          previous: career.history[career.history.length - 2],
          trainingPoints: outcome.trainingAwarded,
          reputation: outcome.reputation,
          offers: outcome.offers.length,
          division: outcome.division,
          nextDivision: outcome.nextDivision,
          countryId: outcome.countryId,
          nextCountryId: outcome.nextCountryId,
          movement: outcome.movement,
          honours: outcome.honours,
          capsGained: outcome.capsGained,
          earnings: outcome.earnings,
          outOfContract: outcome.outOfContract,
          fellBackOnClub: outcome.fellBackOnClub,
          cups: outcome.cups,
          superCup: outcome.superCup,
          europe: outcome.europe,
          nextEuropeanTier: outcome.nextEuropeanTier,
          international: outcome.international,
          caps: outcome.caps,
          placesBefore: outcome.placesBefore,
          placesAfter: outcome.placesAfter,
          nationality: career.player.nationality,
          contractDecision: career.offers.length === 0 && this.summerNeedsADecision(career),
          retirement,
        },
        () => this.afterReview(career, outcome.trainingAwarded, outcome.trainingNotes),
        retirement
          ? () =>
              this.showCareerEnd(career, 'retired', retirement.forced, retirement.reason, () =>
                this.afterReview(career, outcome.trainingAwarded, outcome.trainingNotes),
              )
          : undefined,
      ).element,
    );
  }

  /**
   * The summer, in order: the window first, then training.
   *
   * Transfers come first deliberately — where you will be playing is the
   * decision that gives the training screen its context, and a player who has
   * just joined a wide-play side may well spend his points differently.
   */
  private afterReview(career: CareerState, points: number, notes: string[]): void {
    if (this.summerNeedsADecision(career)) {
      this.showTransferWindow(career, points, notes);
      return;
    }
    if (points > 0) this.showTraining(career, points, notes);
    else this.showCareerHub();
  }

  /**
   * Is there anything to decide this summer?
   *
   * Two separate things can open the window, and either alone is enough: a club
   * has bid for you, or your own contract has run out. The second matters even
   * with no offers on the table — a player out of contract has to sign
   * something, and skipping straight past that would resume a career with no
   * deal behind it.
   */
  private summerNeedsADecision(career: CareerState): boolean {
    return career.offers.length > 0 || career.renewal !== null || !canStay(career);
  }

  /** Summer: decide where you are playing next season. */
  private showTransferWindow(
    career: CareerState,
    points: number,
    notes: string[],
    /** What the last ask produced, so the redrawn screen can report it. */
    negotiation?: { offerId: string | null; outcome: string; message: string },
  ): void {
    const clubs = this.clubs(career);
    const close = () => {
      this.save = saveCareer(this.save, career);
      if (points > 0) this.showTraining(career, points, notes);
      else this.showCareerHub();
    };

    this.mount(
      new TransferScreen(
        career.player,
        clubs(career.clubId),
        career.offers,
        {
          currentCountryId: career.countryId,
          countryOf: (id: string) =>
            locateClub(career.leagues, id)?.countryId ?? career.countryId,
          prestigeOf: (id: string) =>
            countryPrestige(locateClub(career.leagues, id)?.countryId ?? career.countryId),
          // The window opens AFTER qualification has been settled, so these are
          // next season's places — the ones a move would actually get him.
          europeanTierOf: (id: string) => europeanTierOf(career.europeanEntries ?? {}, id),
          renewal: career.renewal,
          outOfContract: career.contract.yearsRemaining <= 0,
          canStay: canStay(career),
          // No offers and an expired deal means no leverage — see negotiateDeal.
          canNegotiateRenewal:
            career.offers.length > 0 || career.contract.yearsRemaining > 0,
          club: clubs,
        },
        {
          onAccept: (offerId: string) => {
            acceptOffer(career, offerId, getTeam);
            close();
          },
          onStay: () => {
            stayAtClub(career);
            close();
          },
          onNegotiate: (offerId, ask) => {
            const result = negotiateDeal(career, offerId, ask);
            // Written before the redraw: a withdrawal has to survive a reload,
            // or closing the tab would quietly hand the offer back.
            this.save = saveCareer(this.save, career);
            if (!result) {
              this.showTransferWindow(career, points, notes);
              return;
            }
            this.showTransferWindow(career, points, notes, {
              offerId,
              outcome: result.outcome,
              message: result.message,
            });
          },
        },
        negotiation,
      ).element,
    );
  }

  /** Pre-season: spend the points the finished season earned. */
  private showTraining(career: CareerState, points: number, notes: string[]): void {
    this.mount(
      new TrainingScreen(career.player, points, notes, (allocation) => {
        applyTraining(career.player, allocation);
        career.trainingPoints = 0;
        // The new season's baseline must include what training just added,
        // otherwise next season's review would credit itself with this work.
        career.seasonStartAttributes = { ...career.player.attributes };
        career.seasonStartAbility = currentAbility(career.player);
        this.save = saveCareer(this.save, career);
        this.showCareerHub();
      }).element,
    );
  }
}
