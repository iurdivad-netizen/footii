import { MatchEngine } from '../simulation/MatchEngine.ts';
import { DECISION_PACE } from '../simulation/DecisionTimer.ts';
import { getGoalkeeperForTeam, getPreset, getTeam } from '../data/gameData.ts';
import { matchResult } from '../core/match/matchState.ts';
import type { SaveData } from '../persistence/storage.ts';
import { loadSave, recordMatch, writeSave } from '../persistence/storage.ts';
import { DebugPanel } from './components/DebugPanel.ts';
import { EventOverlay } from './components/EventOverlay.ts';
import { InputController } from './interaction/InputController.ts';
import { FullTimeScreen } from './screens/FullTimeScreen.ts';
import { MatchScreen } from './screens/MatchScreen.ts';
import type { SetupSelection } from './screens/SetupScreen.ts';
import { SetupScreen } from './screens/SetupScreen.ts';

/** Screen routing and the wiring between UI and simulation. */
export class App {
  private readonly input = new InputController();
  private readonly debug = new DebugPanel();
  private readonly overlay: EventOverlay;
  private save: SaveData;
  private matchScreen: MatchScreen | null = null;

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
  }

  private showSetup(): void {
    this.matchScreen?.stop();
    this.matchScreen = null;
    const screen = new SetupScreen((selection) => this.startMatch(selection));
    this.mount(screen.element);

    // Restore the previous selection so replaying is quick.
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

  private startMatch(selection: SetupSelection): void {
    this.save = { ...this.save, lastSelection: selection };
    writeSave(this.save);

    const paceScale = DECISION_PACE[selection.pace] ?? 1;
    // The reading phase scales with the same setting as the decision window.
    this.overlay.paceScale = paceScale;

    const player = getPreset(selection.presetId).create();
    const playerTeam = getTeam(selection.teamId);
    const opponent = getTeam(selection.opponentId);

    const engine = new MatchEngine(
      {
        player,
        playerTeam,
        opponent,
        opponentGoalkeeper: getGoalkeeperForTeam(opponent.id),
        ownGoalkeeper: getGoalkeeperForTeam(playerTeam.id),
        length: selection.length,
        playerTeamIsHome: true,
        paceScale,
      },
      selection.seed,
    );

    this.debug.setSeed(selection.seed);

    const screen = new MatchScreen(engine, this.overlay, this.debug, () => {
      this.finishMatch(engine);
    });
    this.matchScreen = screen;
    this.mount(screen.element);
    screen.start();
  }

  private finishMatch(engine: MatchEngine): void {
    const rating = engine.rating();
    this.save = recordMatch(this.save, engine.state.stats, rating, matchResult(engine.state));
    const screen = new FullTimeScreen(engine, this.save.career, () => this.showSetup());
    this.mount(screen.element);
  }
}
