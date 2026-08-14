import { MatchEngine } from '../simulation/MatchEngine.ts';
import { DECISION_PACE } from '../simulation/DecisionTimer.ts';
import type { DecisionPace } from '../simulation/DecisionTimer.ts';
import { endSeason, recordPlayerMatch, startCareer } from '../simulation/CareerService.ts';
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
import { clearCareer, loadSave, recordMatch, saveCareer, writeSave } from '../persistence/storage.ts';
import { DebugPanel } from './components/DebugPanel.ts';
import { EventOverlay } from './components/EventOverlay.ts';
import { InputController } from './interaction/InputController.ts';
import { CareerScreen } from './screens/CareerScreen.ts';
import type { TotalsView } from './screens/FullTimeScreen.ts';
import { FullTimeScreen } from './screens/FullTimeScreen.ts';
import { HomeScreen } from './screens/HomeScreen.ts';
import { MatchScreen } from './screens/MatchScreen.ts';
import { PlayerCreatorScreen } from './screens/PlayerCreatorScreen.ts';
import { SeasonReviewScreen } from './screens/SeasonReviewScreen.ts';
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
        careerSummary: career
          ? `${career.player.name} · ${positionLabel(career.player.position)} · age ${career.player.age} · ${getTeam(career.clubId).name} · season ${career.seasonNumber} · ability ${currentAbility(career.player)}`
          : undefined,
      }).element,
    );
  }

  // ------------------------------------------------------------- setup ---

  private showSetup(mode: Mode): void {
    const screen = new SetupScreen({
      mode,
      onStart: (selection) =>
        mode === 'career' ? this.beginCareer(selection) : this.startQuickMatch(selection),
      onCreatePlayer: () => this.showCreator(mode),
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
      if (last.pace) set('pace', last.pace);
      screen.element.querySelector<HTMLSelectElement>('#preset')?.dispatchEvent(new Event('change'));
    }
  }

  private showCreator(mode: Mode): void {
    this.mount(
      new PlayerCreatorScreen(
        {
          onConfirm: (spec: CustomPlayerSpec) => {
            // Potential is rolled once, here, and never shown.
            this.customPlayer = createCustomPlayer(new Rng(`${spec.name}:${Date.now()}`), spec);
            this.selectedPresetId = CUSTOM_PLAYER_ID;
            this.showSetup(mode);
          },
          onCancel: () => this.showSetup(mode),
        },
        mode === 'career',
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

  private applyPace(pace: DecisionPace): void {
    this.paceScale = DECISION_PACE[pace] ?? 1;
    this.overlay.paceScale = this.paceScale;
  }

  // ------------------------------------------------------- quick match ---

  private startQuickMatch(selection: SetupSelection): void {
    this.selectedPresetId = selection.presetId;
    this.save = { ...this.save, lastSelection: selection };
    writeSave(this.save);
    this.applyPace(selection.pace);

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
    const screen = new MatchScreen(engine, this.overlay, this.debug, () => onFinished(engine));
    this.matchScreen = screen;
    this.mount(screen.element);
    screen.start();
  }

  // ------------------------------------------------------------ career ---

  private beginCareer(selection: SetupSelection): void {
    this.selectedPresetId = selection.presetId;
    this.save = { ...this.save, lastSelection: selection };
    this.applyPace(selection.pace);

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
    this.matchScreen?.stop();
    this.matchScreen = null;

    this.mount(
      new CareerScreen(career, {
        onPlay: () => this.playCareerMatch(),
        onEndSeason: () => this.reviewSeason(),
        onQuit: () => this.showHome(),
      }).element,
    );
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
    const { record, champion } = endSeason(career, getTeam);
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
        },
        () => this.showCareerHub(),
      ).element,
    );
  }
}
