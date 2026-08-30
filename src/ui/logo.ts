/**
 * THE MARK
 *
 * A game with a front door needs something on it that is not a word, and the
 * question worth asking first is what the mark should be OF. A football is the
 * obvious answer and the wrong one: every football game has one, it says
 * "football" and nothing else, and what makes this one different is not that it
 * contains a ball.
 *
 * So the mark is the mechanic. A ring, six ticks around it, one of them longer
 * and lit, and a ball at the centre — which is a decision window, the six
 * options in it, the one you took, and the thing you took it with. It is the
 * whole game in a glyph, it reads at 24px and at 240px, and somebody who has
 * played for an hour recognises it as a picture of what they were doing.
 *
 * DRAWN RATHER THAN DECLARED. Inline SVG instead of a CSS shape, because the
 * six ticks are a repeat with a rotation and the wrong tool for that is three
 * pseudo-elements and a transform stack. It also means one definition serves
 * the title screen at full size and the welcome screen above the fold, rather
 * than two that drift.
 *
 * `currentColor` throughout except the lit tick, so the mark takes the colour of
 * whatever it is sitting in and the one highlight stays the accent. Nothing here
 * animates: the title screen is the one place a player is not being timed, and a
 * spinning logo would be the game fidgeting at somebody reading a menu.
 */

/** How many options a situation offers. The mark is a picture of that number. */
const TICKS = 6;

/**
 * The mark, at whatever size the caller has room for.
 *
 * `aria-hidden` in every use so far, and deliberately: the wordmark sits beside
 * it in real text every time it is drawn, so announcing it would read the game's
 * name twice.
 */
export function gameLogo(size = 96): string {
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    // Straight up is the lit one, and the rest run clockwise from it.
    const angle = (i * 360) / TICKS - 90;
    const radians = (angle * Math.PI) / 180;
    const lit = i === 0;
    const from = lit ? 26 : 30;
    const to = 40;
    const x1 = 50 + Math.cos(radians) * from;
    const y1 = 50 + Math.sin(radians) * from;
    const x2 = 50 + Math.cos(radians) * to;
    const y2 = 50 + Math.sin(radians) * to;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
      class="${lit ? 'logo-tick logo-tick-lit' : 'logo-tick'}" />`;
  }).join('');

  return `
    <svg class="game-logo" width="${size}" height="${size}" viewBox="0 0 100 100"
         aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="44" class="logo-ring" />
      ${ticks}
      <circle cx="50" cy="50" r="11" class="logo-ball" />
    </svg>`;
}
