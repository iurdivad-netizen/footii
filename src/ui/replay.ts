/**
 * WHETHER THE RESOLUTION IS ANIMATED.
 *
 * The ball's flight used to be governed entirely by `prefers-reduced-motion`,
 * which is the right DEFAULT and the wrong only-option: somebody whose system
 * asks for reduced motion had no way to turn the replay on, and — worse — no
 * way to find out that was why they were not seeing one. A silent skip is
 * indistinguishable from a broken feature, and it was reported as exactly that.
 *
 * So the browser's preference is still honoured, but it is now a SETTING with
 * the system as one of its three values rather than a rule nobody could see or
 * override. Off is a real choice too: the outcome banner and the sound cue say
 * the same thing, so the replay is never the only way to learn what happened.
 */
export const REPLAY_SETTINGS = ['system', 'on', 'off'] as const;

export type ReplaySetting = (typeof REPLAY_SETTINGS)[number];

export const REPLAY_LABELS: Record<ReplaySetting, string> = {
  system: 'Follow my browser',
  on: 'Always',
  off: 'Never',
};

export function isReplaySetting(value: unknown): value is ReplaySetting {
  return REPLAY_SETTINGS.includes(value as ReplaySetting);
}

/**
 * Whether the browser is asking for less movement.
 *
 * Read at the moment it is needed rather than cached, because it is a system
 * preference somebody can change without reloading the game — and defaults to
 * "no" wherever `matchMedia` does not exist, which is the honest answer when
 * nothing has been asked for.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Should the resolution be animated, given the setting and the system? */
export function shouldReplay(setting: ReplaySetting, reducedMotion = prefersReducedMotion()): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return !reducedMotion;
}
