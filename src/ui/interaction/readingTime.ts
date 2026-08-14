/**
 * EVENT PACING (the three phases of an interactive moment)
 *
 *   1. BUILD-UP  — the chance's story is told a beat at a time. No options are
 *                  visible. This is where the context arrives: where you are,
 *                  who is near you, how fast the move is.
 *   2. SCAN      — the six options appear. The clock is not running yet, but
 *                  this beat is deliberately SHORT.
 *   3. DECISION  — the attribute-driven window runs and the keeper commits.
 *
 * WHY THE SCAN BEAT EXISTS AT ALL
 *
 * The decision timer models how long the FOOTBALLER has to act. The human is
 * also paying a separate cost: physically reading six freshly generated labels.
 * Measured over 257 events, an 18-year-old's median window was 1.04s against
 * ~94 characters of option text — around 3.8s of reading. Revealing the options
 * at the exact instant the clock starts puts that cost straight back onto the
 * window and makes low-attribute players unplayable again.
 *
 * The scan beat is much shorter than the old combined "set" phase, because the
 * build-up has already delivered the situational context that previously had to
 * be absorbed alongside the option text. It is only the time to take in six
 * short labels you have mostly seen before.
 *
 * Set SCAN_SECONDS to 0 for a pure "options and clock together" version.
 */

/**
 * Seconds each narration beat is held before the next one appears.
 * Deliberately unhurried: the build-up is where the tension is manufactured,
 * and a chance you watch develop has more weight than one that just appears.
 */
export const BEAT_SECONDS = 0.85;

/** The build-up never runs shorter or longer than this, whatever the beat count. */
export const MIN_BUILD_UP_TIME = 1.8;
export const MAX_BUILD_UP_TIME = 3.6;

/**
 * Time the options are visible before the clock starts.
 * Short on purpose — see the note above.
 */
export const SCAN_SECONDS = 0.5;

/** How long the narration phase runs, given its beats. */
export function calculateBuildUpTime(beats: readonly string[], paceScale = 1): number {
  // The final beat is the situation description, which lands together with the
  // options, so it is not held during the build-up.
  const held = Math.max(1, beats.length - 1);
  const raw = held * BEAT_SECONDS;
  const clamped = Math.max(MIN_BUILD_UP_TIME, Math.min(MAX_BUILD_UP_TIME, raw));
  return clamped * paceScale;
}

/** How long the options are shown before the decision clock starts. */
export function calculateScanTime(paceScale = 1): number {
  return SCAN_SECONDS * paceScale;
}

/** Index of the last narration beat that should be visible at `elapsed`. */
export function visibleBeatCount(elapsed: number, beats: readonly string[], paceScale = 1): number {
  if (beats.length <= 1) return 1;
  const buildUpTime = calculateBuildUpTime(beats, paceScale);
  const held = beats.length - 1;
  const perBeat = buildUpTime / held;
  return Math.min(held, Math.floor(elapsed / perBeat) + 1);
}
