/**
 * WHAT CHANGED ON THE MATCH SCREEN SINCE IT LAST DREW.
 *
 * The screen redraws whole every minute — the commentary is rewritten from
 * scratch and the score is a text node overwritten in place — which is why
 * nothing on it could ever animate: a CSS animation on a list that is destroyed
 * and rebuilt every frame replays on every line, every time. So the screen
 * needs to know what is NEW, and that is a question about two snapshots rather
 * than about the DOM.
 *
 * Separate from MatchScreen so it can be tested without one, and because both
 * answers are subtler than they look.
 */

/**
 * How many lines at the end of `lines` were not there last time.
 *
 * Answered by finding the last line seen rather than by comparing lengths: the
 * feed is a rolling buffer, so its length stops changing long before the match
 * does and a length comparison would go quiet after about two hundred lines.
 * Identity, not text — the same sentence can be written twice.
 *
 *   null `lastSeen`   the first draw. Everything already there is history, and a
 *                     match that opened with its whole feed flashing would be
 *                     announcing nothing.
 *   not found         the line has scrolled out of the buffer since. One line is
 *                     the honest answer: something arrived, and it is the newest.
 */
export function newLineCount<T>(lines: readonly T[], lastSeen: T | null, cap = 14): number {
  if (lastSeen === null || lines.length === 0) return 0;
  const at = lines.lastIndexOf(lastSeen);
  const fresh = at === -1 ? 1 : lines.length - 1 - at;
  return Math.min(cap, Math.max(0, fresh));
}

export interface Score {
  own: number;
  opponent: number;
}

/**
 * Whether a goal went in between two draws, and for whom.
 *
 * `for` wins when both changed in one draw. It is rare — an interactive moment
 * that both scores and concedes on its way out — and the player's own goal is
 * the one the flash is for: a concession is already carried by the danger line
 * in the feed and the groan.
 */
export function scoreChange(previous: Score, next: Score): 'for' | 'against' | null {
  if (next.own > previous.own) return 'for';
  if (next.opponent > previous.opponent) return 'against';
  return null;
}
