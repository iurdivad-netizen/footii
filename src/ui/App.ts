import { MatchEngine } from '../simulation/MatchEngine.ts';
import { DECISION_PACE } from '../simulation/DecisionTimer.ts';
import type { DecisionPace } from '../simulation/DecisionTimer.ts';
import {
  endSeason,
  recordPlayerMatch,
  startCareer,
} from '../simulation/CareerService.ts';
import { nextFixture, seasonComplete } from '../core/career/career.ts';
import type { CareerState } from '../core/career/career.ts';
import { currentAbility } from '../core/player/player.ts';
import { TEAMS, getGoalkeeperForTeam, getPreset, getTeam } from '../data/gameData.ts';
import { matchResult } from '../core/match/matchState.ts';
import type { SaveData } from '../persistence/storage.ts';
import { clearCareer, loadSave, recordMatch, saveCareer, writeSave } from '../persistence/storage.ts';
import { DebugPanel } from './components/DebugPanel.ts';
import { EventOverlay } from './components/EventOverlay.ts';
import { InputController } from './interaction/InputController.ts';
import { CareerScreen } from './screens/CareerScreen.ts';
import { FullTimeScreen } from './screens/FullTimeScreen.ts';
import { MatchScreen } from './screens/MatchScreen.ts';
import { SeasonReviewScreen } from './screens/SeasonReviewScreen.ts';
import type { SetupSelection } from './screens/SetupScreen.ts';
import { SetupScreen } from './screens/SetupScreen.ts';

/** Screen routing and the wiring between UI and simulation. */
export class App {
  private readonly input = new InputController();
  private readonly debug = new DebugPanel();
  private readonly overlay: EventOverlay;
  private save: SaveData;
  private matchScreen: MatchScreen | null = null;
  /** Pace carried into career matches. */
  private paceScale = 1;

  constructor(private readonly root: HTMLElement) {
    this.overlay = new EventOverlay(this.input);
    this.save = loadSave();
    this.input.bindKey('d', () => this.debug.toggle());
    this.root.appendChild(this.debug.element);
    this.showSetup();
  }

  private mount(element: HTMLElement): void {
    for (const child of Array.from(this.root.children)) {
      if (child !== this.debug.element) child.remove();
    }
    this.root.appendChild(element);
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------- setup ---

  private showSetup(): void {
    this.matchScreen?.stop();
    this.matchScreen = null;
    const screen = new SetupScreen({
      onQuickMatch: (selection) => this.startQuickMatch(selection),
      onStartCareer: (selection) => this.beginCareer(selection),
      onContinueCareer: this.save.careerState ? () => this.showCareerHub() : undefined,
      careerSummary: this.careerSummary(),
    });
    this.mount(screen.element);

    const last = this.save.lastSelection;
    if (last) {
      const set = (id: string, value: string) => {
        const el = screen.element.querySelector<HTMLSelectElement | HTMLInputElement>(`#${id}`);
        if (el) el.value = value;
      };
      set('preset', last.presetId);
      set('team', last.teamId);
      set('opponent', last.opponentId);
      set('seed', last.seed);
      set('length', String(last.length));
      if (last.pace) set('pace', last.pace);
      screen.element.querySelector<HTMLSelectElement>('#preset')?.dispatchEvent(new Event('change'));
    }
  }

  private careerSummary(): string | undefined {
    const career = this.save.careerState;
    if (!career) return undefined;
    const club = getTeam(career.clubId);
    return `${career.player.name} · age ${career.player.age} · ${club.name} · season ${career.seasonNumber} · ability ${currentAbility(career.player)}`;
  }

  private applyPace(pace: DecisionPace): void {
    this.paceScale = DECISION_PACE[pace] ?? 1;
    this.overlay.paceScale = this.paceScale;
  }

  // ------------------------------------------------------- quick match ---

  private startQuickMatch(selection: SetupSelection): void {
    this.save = { ...this.save, lastSelection: selection };
    writeSave(this.save);
    this.applyPace(selection.pace);

    const player = getPreset(selection.presetId).create();
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
        this.mount(new FullTimeScreen(engine, this.save.career, () => this.showSetup()).element);
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
    this.save = { ...this.save, lastSelection: selection };
    this.applyPace(selection.pace);

    const player = getPreset(selection.presetId).create();
    const career = startCareer({
      player,
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
      this.showSetup();
      return;
    }
    this.matchScreen?.stop();
    this.matchScreen = null;

    const screen = new CareerScreen(career, {
      onPlay: () => this.playCareerMatch(),
      onEndSeason: () => this.reviewSeason(),
      onQuit: () => {
        this.showSetup();
      },
    });
    this.mount(screen.element);
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

    // Fitness carries between matches, so the career player starts the match
    // wherever recovery left him.
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
      new FullTimeScreen(engine, this.save.career, () => this.showCareerHub(), {
        continueLabel: seasonComplete(career) ? 'End of season' : 'Back to career',
        development: career.lastDevelopment,
      }).element,
    );
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

  /** Abandon the current career (used by the setup screen). */
  abandonCareer(): void {
    this.save = clearCareer(this.save);
    this.showSetup();
  }
}
