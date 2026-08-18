import { MatchEngine } from '../simulation/MatchEngine.ts';
import { DECISION_PACE, UNTIMED_PACE } from '../simulation/DecisionTimer.ts';
import {
  acceptOffer,
  declineOffers,
  endSeason,
  recordPlayerMatch,
  startCareer,
} from '../simulation/CareerService.ts';
import { nextFixture, seasonComplete } from '../core/career/career.ts';
import type { CareerState } from '../core/career/career.ts';
import { Rng } from '../core/rng.ts';
import { clonePlayer, currentAbility } from '../core/player/player.ts';
import type { Player } from '../core/player/player.ts';
import { createCustomPlayer } from '../core/player/playerBuilder.ts';
import type { CustomPlayerSpec } from '../core/player/playerBuilder.ts';
import { positionLabel } from '../core/player/positions.ts';
import { CUSTOM_PLAYER_ID, TEAMS, getGoalkeeperForTeam, getPreset, getTeam } from '../data/gameData.ts';
import { matchResult } from '../core/match/matchState.ts';
import { averageRating } from '../core/career/seasonStats.ts';
import type { SaveData } from '../persistence/storage.ts';
import {
  clearCareer,
  loadSave,
  recordMatch,
  saveCareer,
  saveSettings,
  writeSave,
} from '../persistence/storage.ts';
import type { GameSettings } from '../persistence/storage.ts';
import { fixturesFor } from '../core/career/career.ts';
import { DebugPanel } from './components/DebugPanel.ts';
import { EventOverlay } from './components/EventOverlay.ts';
import { InputController } from './interaction/InputController.ts';
import { CareerScreen } from './screens/CareerScreen.ts';
import type { TotalsView } from './screens/FullTimeScreen.ts';
import { FullTimeScreen } from './screens/FullTimeScreen.ts';
import { HomeScreen } from './screens/HomeScreen.ts';
import type { CareerSummary } from './screens/HomeScreen.ts';
import { MatchScreen } from './screens/MatchScreen.ts';
import { PlayerCreatorScreen } from './screens/PlayerCreatorScreen.ts';
import { SeasonReviewScreen } from './screens/SeasonReviewScreen.ts';
import { TrainingScreen } from './screens/TrainingScreen.ts';
import { TransferScreen } from './screens/TransferScreen.ts';
import { applyTraining } from '../core/career/training.ts';
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

  constructor(private readonly root: HTMLElement) {
    this.overlay = new EventOverlay(this.input);
    this.save = loadSave();
    this.applySettings();
    this.input.bindKey('d', () => this.debug.toggle());
    this.root.appendChild(this.debug.element);
    this.showHome();
  }

  private mount(element: HTMLElement): void {
    for (const child of Array.from(this.root.children)) {
      if (child !== this.debug.element) child.remove();
    }
    this.root.appendChild(element);
    window.scrollTo(0, 0);
  }

  // -------------------------------------------------------------- home ---

  private showHome(): void {
    this.matchScreen?.stop();
    this.matchScreen = null;
    const career = this.save.careerState;

    this.mount(
      new HomeScreen({
        onNewCareer: () => this.showSetup('career'),
        onQuickMatch: () => this.showSetup('quick'),
        onContinueCareer: career ? () => this.showCareerHub() : undefined,
        onAbandonCareer: career
          ? () => {
              this.save = clearCareer(this.save);
              this.showHome();
            }
          : undefined,
        career: this.careerSummary(),
        settings: this.save.settings,
        onSettingsChange: (settings) => this.updateSettings(settings),
      }).element,
    );
  }

  /**
   * Summarise the career for the home screen, or nothing at all.
   *
   * Deliberately defensive: this reads deep into a saved career (statistics,
   * fixtures, the club it refers to), and a save written by another version —
   * or referring to a club that no longer exists — must not stop the game from
   * starting. A career we cannot describe is simply not offered.
   */
  private careerSummary(): CareerSummary | undefined {
    const career = this.save.careerState;
    if (!career) return undefined;
    try {
      return {
        name: career.player.name,
        detail: `${positionLabel(career.player.position)} · age ${career.player.age} · ${getTeam(career.clubId).name} · season ${career.seasonNumber}`,
        ability: currentAbility(career.player),
        played: career.seasonStats.matches,
        total: fixturesFor(career, career.clubId).length,
        goals: career.seasonStats.goals,
        assists: career.seasonStats.assists,
      };
    } catch (error) {
      console.error('Saved career could not be read; dropping it', error);
      this.save = clearCareer(this.save);
      return undefined;
    }
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

  private beginCareer(selection: SetupSelection): void {
    this.selectedPresetId = selection.presetId;
    this.save = { ...this.save, lastSelection: selection };

    const career = startCareer({
      player: this.resolvePlayer(selection.presetId),
      clubId: selection.teamId,
      leagueTeamIds: TEAMS.map((t) => t.id),
      seed: selection.seed,
    });
    this.save = saveCareer(this.save, career);
    this.showCareerHub();
  }

  private showCareerHub(): void {
    const career = this.save.careerState;
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

    // An open transfer window is resumed rather than lost. Closing the tab on
    // the offer screen used to leave the offers sitting in the save with no
    // route back to them, so a summer's work simply vanished.
    if (career.offers.length > 0) {
      this.showTransferWindow(career, career.trainingPoints, []);
      return;
    }

    this.mount(
      new CareerScreen(career, {
        onPlay: () => this.playCareerMatch(),
        onEndSeason: () => this.reviewSeason(),
        onQuit: () => this.showHome(),
      }).element,
    );
  }

  private canRenderCareer(career: CareerState): boolean {
    try {
      getTeam(career.clubId);
      for (const id of career.leagueTeamIds) getTeam(id);
      return typeof career.seasonStats?.matches === 'number' && Array.isArray(career.fixtures);
    } catch (error) {
      console.error('Saved career refers to data that no longer exists', error);
      return false;
    }
  }

  private playCareerMatch(): void {
    const career = this.save.careerState;
    if (!career) return;
    const fixture = nextFixture(career);
    if (!fixture) return;

    const isHome = fixture.homeId === career.clubId;
    const opponentId = isHome ? fixture.awayId : fixture.homeId;
    const playerTeam = getTeam(career.clubId);
    const opponent = getTeam(opponentId);

    // Fitness carries between matches, so the player starts where recovery left him.
    career.player.fitness = career.fitness;

    const seed = `${career.seed}:s${career.seasonNumber}:f${career.nextFixtureIndex}`;
    this.runMatch(
      new MatchEngine(
        {
          player: career.player,
          playerTeam,
          opponent,
          opponentGoalkeeper: getGoalkeeperForTeam(opponent.id),
          ownGoalkeeper: getGoalkeeperForTeam(playerTeam.id),
          length: 90,
          playerTeamIsHome: isHome,
          paceScale: this.paceScale,
        },
        seed,
      ),
      seed,
      (engine) => this.finishCareerMatch(engine, career),
    );
  }

  private finishCareerMatch(engine: MatchEngine, career: CareerState): void {
    const rating = engine.rating();
    recordPlayerMatch(
      career,
      {
        stats: engine.state.stats,
        rating,
        playerTeamScore: engine.state.playerTeamScore,
        opponentScore: engine.state.opponentScore,
        fitnessAtEnd: engine.matchPlayer.fitness,
      },
      getTeam,
    );
    this.save = saveCareer(this.save, career);

    this.mount(
      new FullTimeScreen(engine, () => this.showCareerHub(), {
        continueLabel: seasonComplete(career) ? 'End of season' : 'Back to career',
        development: career.lastDevelopment,
        totals: this.careerTotals(career),
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
    const career = this.save.careerState;
    if (!career || !seasonComplete(career)) return;

    const potentialBefore = career.player.potentialAbility;
    const outcome = endSeason(career, getTeam);
    const { record, champion } = outcome;
    this.save = saveCareer(this.save, career);

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
        },
        () => this.afterReview(career, outcome.trainingAwarded, outcome.trainingNotes),
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
    if (career.offers.length > 0) {
      this.showTransferWindow(career, points, notes);
      return;
    }
    if (points > 0) this.showTraining(career, points, notes);
    else this.showCareerHub();
  }

  /** Summer: decide where you are playing next season. */
  private showTransferWindow(career: CareerState, points: number, notes: string[]): void {
    const close = () => {
      this.save = saveCareer(this.save, career);
      if (points > 0) this.showTraining(career, points, notes);
      else this.showCareerHub();
    };

    this.mount(
      new TransferScreen(career.player, getTeam(career.clubId), career.offers, {
        onAccept: (offerId) => {
          acceptOffer(career, offerId, getTeam);
          close();
        },
        onStay: () => {
          declineOffers(career);
          close();
        },
      }).element,
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
