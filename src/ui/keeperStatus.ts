import type { GoalkeeperAction } from '../core/goalkeeper/goalkeeper.ts';

/**
 * WHAT THE KEEPER IS DOING, IN WORDS
 *
 * The README calls the goalkeeper the mechanic: he commits partway through your
 * window, waiting tells you what he has done, and it costs you time to find
 * out. That read is the centre of the game.
 *
 * It used to be an eleven-pixel monospace caption painted onto the middle of
 * the pitch canvas — the quietest thing on the busiest part of the screen, and
 * invisible to a screen reader, because the canvas is `aria-hidden` and there
 * is no way for it not to be.
 *
 * So the words live here instead of inside the renderer, and the overlay puts
 * them in the DOM where they can be sized, coloured, animated and announced.
 * The canvas keeps the picture — where he is, which way he went — because that
 * is what a picture is for.
 *
 * SHOWING THE SAME FACT MORE LEGIBLY IS NOT A BALANCE CHANGE, and it is worth
 * being explicit about that: every one of these states was already on screen at
 * exactly the moment it is now. Nothing is revealed earlier and nothing new is
 * revealed at all.
 */

export interface KeeperStatus {
  /** What he is doing, in the game's own voice. */
  label: string;
  /**
   * What it means for the player, when there is something useful to say.
   *
   * Empty for the states that speak for themselves. This is not advice — it
   * never says what to do — it names the consequence a player who had watched
   * a lot of football would already see.
   */
  tell: string;
  /** True once he has moved. The whole point of waiting is to see this flip. */
  committed: boolean;
}

export function keeperStatus(action: GoalkeeperAction): KeeperStatus {
  switch (action) {
    case 'rushing':
      return {
        label: 'Rushing out',
        tell: 'The goal is opening up behind him.',
        committed: true,
      };
    case 'advancing':
      return {
        label: 'Advancing',
        tell: 'Closing the angle, a step off his line.',
        committed: true,
      };
    case 'divingNear':
      return { label: 'Gone near post', tell: 'The far post is his weak side now.', committed: true };
    case 'divingFar':
      return { label: 'Gone far post', tell: 'The near post is his weak side now.', committed: true };
    case 'goingToGround':
      return { label: 'Down at your feet', tell: 'Anything lifted over him is on.', committed: true };
    case 'holdingLine':
      return { label: 'Holding his line', tell: 'Deep, and set. No gap behind him.', committed: true };
    default:
      // He has not decided yet, which is the state the whole mechanic is about:
      // every second you wait is a second closer to knowing, and a second less
      // to act on it.
      return { label: 'Set — not committed', tell: '', committed: false };
  }
}
