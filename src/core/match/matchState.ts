import type { Goalkeeper } from '../goalkeeper/goalkeeper.ts';
import type { Player } from '../player/player.ts';
import type { Team } from '../team/team.ts';
import type { MatchStats } from './matchStats.ts';
import { createMatchStats } from './matchStats.ts';

export interface MatchCommentaryLine {
  minute: number;
  text: string;
  /** Highlights are styled differently in the feed. */
  tone: 'normal' | 'goal' | 'chance' | 'danger' | 'system';
}

export interface MatchSetup {
  playerTeam: Team;
  opponent: Team;
  /** The goalkeeper the player will face. */
  opponentGoalkeeper: Goalkeeper;
  /** The player's own goalkeeper (used for opponent chances). */
  ownGoalkeeper: Goalkeeper;
  player: Player;
  /** Match length in minutes. */
  length: number;
  playerTeamIsHome: boolean;
  /**
   * Player-facing pace multiplier on every decision window (see DECISION_PACE).
   * Defaults to 1 when omitted so existing callers and tests are unaffected.
   */
  paceScale?: number;
}

export interface MatchState {
  minute: number;
  playerTeamScore: number;
  opponentScore: number;
  finished: boolean;
  commentary: MatchCommentaryLine[];
  stats: MatchStats;
  /** Accumulated rating contribution from interactive events. */
  eventRatingDelta: number;
}

export function createMatchState(): MatchState {
  return {
    minute: 0,
    playerTeamScore: 0,
    opponentScore: 0,
    finished: false,
    commentary: [],
    stats: createMatchStats(),
    eventRatingDelta: 0,
  };
}

export function pushCommentary(
  state: MatchState,
  text: string,
  tone: MatchCommentaryLine['tone'] = 'normal',
): void {
  state.commentary.push({ minute: state.minute, text, tone });
  // The UI only ever shows a recent window; keep memory bounded.
  if (state.commentary.length > 200) state.commentary.shift();
}

/** 1 win, 0 draw, -1 defeat, from the player's team's perspective. */
export function matchResult(state: MatchState): number {
  if (state.playerTeamScore > state.opponentScore) return 1;
  if (state.playerTeamScore < state.opponentScore) return -1;
  return 0;
}
