/**
 * Match speed presets, shared by the home screen (where the default is set and
 * saved) and the match screen (where it can be changed mid-game).
 */
export interface MatchSpeed {
  label: string;
  description: string;
  /** Milliseconds of real time per simulated minute. */
  ms: number;
}

export const MATCH_SPEEDS: MatchSpeed[] = [
  { label: '1x', description: 'unhurried', ms: 320 },
  { label: '2x', description: 'default', ms: 160 },
  { label: '4x', description: 'straight to the action', ms: 70 },
];

export function clampSpeedIndex(index: number): number {
  return Math.min(MATCH_SPEEDS.length - 1, Math.max(0, Math.round(index) || 0));
}
