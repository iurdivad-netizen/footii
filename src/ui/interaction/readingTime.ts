import type { ActionOption } from '../../core/events/types.ts';

/**
 * READING TIME (the "set" phase)
 *
 * THE PROBLEM THIS SOLVES
 *
 * The decision timer models how long the FOOTBALLER has to perceive a situation
 * and act. But the human at the keyboard is paying a second, completely
 * different cost: physically reading six freshly generated option labels.
 *
 * Those are not the same thing. A real footballer does not read his options —
 * he already knows them. Charging the human's reading time against the
 * player's composure budget conflates a UI cost with a simulated one, and it
 * makes low-attribute players unplayable rather than merely frantic:
 * measured over 250 events, an 18-year-old's median window was 1.04s against
 * roughly 94 characters of option text, which takes ~3.8s to read.
 *
 * THE FIX
 *
 * The event opens in a "set" phase: the situation and all six options are fully
 * visible and selectable, but the decision clock has not started. Once it
 * elapses, the attribute-driven window begins and the keeper starts to move.
 *
 * This keeps the simulation honest — the decision window still means exactly
 * what it meant before — while making the game fair to read. It lives in the
 * UI layer on purpose: it is a property of the interface, not of football, and
 * nothing in `core/` or `simulation/` knows about it.
 */

/** Seconds of orientation before any reading, for the pitch view and headline. */
export const BASE_SET_TIME = 0.85;

/**
 * Seconds per character of option text. ~0.011 corresponds to a brisk UI
 * scanning rate of roughly 90 characters per second across six short labels
 * that the player also learns to recognise by shape over time.
 */
export const SECONDS_PER_CHARACTER = 0.011;

/** Never shorter than this, however terse the options are. */
export const MIN_SET_TIME = 1.1;
/** Never longer than this, or the pause starts to feel like dead air. */
export const MAX_SET_TIME = 2.6;

/**
 * How long to show the options before the decision clock starts.
 * Scales with how much text there is to read, so a menu of long labels does
 * not cost the player more thinking time than a menu of short ones.
 */
export function calculateSetTime(options: readonly ActionOption[], paceScale = 1): number {
  const characters = options.reduce((total, option) => total + option.label.length, 0);
  const raw = BASE_SET_TIME + characters * SECONDS_PER_CHARACTER;
  const clamped = Math.max(MIN_SET_TIME, Math.min(MAX_SET_TIME, raw));
  return clamped * paceScale;
}
