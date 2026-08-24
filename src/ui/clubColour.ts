/**
 * THE CLUB'S COLOUR, MADE USABLE
 *
 * Every one of the 192 clubs in `teams.json` has carried a `colour` since the
 * world was generated, and until now the interface used it in exactly two
 * places: a border on a transfer offer and a dot in the world table. Signing
 * for Northport City looked identical to signing for anybody else, which is a
 * strange thing for a game about spending fifteen years somewhere.
 *
 * WHY THIS IS NOT `style="color: ${team.colour}"`. Two reasons, and the second
 * is the one that needed a module rather than a template string.
 *
 * FIRST, LEGIBILITY. The page is #0b1a12 — very dark, slightly green. A club
 * whose colour is a deep navy or a maroon disappears into it entirely, and a
 * crest colour that cannot be seen is worse than no crest colour, because it
 * reads as a rendering bug rather than as a design. So a colour is LIFTED until
 * it clears a contrast floor against the page, in its own hue, which keeps the
 * club recognisably itself while making it visible. Nothing is lifted that does
 * not need to be.
 *
 * SECOND, TEXT ON TOP OF IT. Anywhere the colour becomes a filled band, the
 * words on it have to be black or white depending on the colour underneath, and
 * that is a per-club answer rather than a stylesheet-wide one.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: become a theme. The club colour is an
 * IDENTITY channel — it says which club this is — and it never takes over a
 * semantic one. Green still means you and positive, amber still means jeopardy,
 * yellow still means a goal, red still means danger. A hub where the club colour
 * had replaced the accent would be a hub where signing for a red club made every
 * success message red, which is how a palette stops meaning anything. See the
 * palette note at the top of style.css.
 */

/** How much contrast a club colour must have against the page to be used as-is. */
export const CONTRAST_FLOOR = 3.5;

/** The page it has to be legible against — `--bg` in style.css. */
export const PAGE_BACKGROUND = '#0b1a12';

export interface ClubPalette {
  /** The club's colour, lifted in its own hue if it was too dark for the page. */
  colour: string;
  /** Black or white — whichever can be read ON `colour`. */
  ink: string;
  /** The same hue at low alpha, for tinting a panel without shouting. */
  wash: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse `#rgb` or `#rrggbb`.
 *
 * Returns null rather than throwing on anything else. A malformed colour in the
 * data should cost the club its tint, not take down the screen it appears on —
 * and every caller here already has an accent to fall back to.
 */
export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(value)) return null;

  if (value.length === 3) {
    const [r, g, b] = [...value].map((c) => parseInt(c + c, 16));
    return { r: r!, g: g!, b: b! };
  }
  if (value.length === 6) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }
  return null;
}

function toHex({ r, g, b }: Rgb): string {
  const pair = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/** Relative luminance, per WCAG 2.1. */
export function luminance(rgb: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn!, gn!, bn!);
  const min = Math.min(rn!, gn!, bn!);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn! - bn!) / delta) % 6;
  else if (max === gn) h = (bn! - rn!) / delta + 2;
  else h = (rn! - gn!) / delta + 4;
  return { h: ((h * 60) % 360 + 360) % 360, s, l };
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return { r: (r! + m) * 255, g: (g! + m) * 255, b: (b! + m) * 255 };
}

/**
 * Raise a colour's lightness until it can be seen against the page.
 *
 * In HSL rather than by blending toward white, because blending desaturates:
 * a deep maroon mixed with white becomes pink, which is a different club. Moving
 * lightness alone keeps the hue and most of the saturation, so what comes back
 * is the same colour turned up rather than a paler relative of it.
 *
 * Steps rather than solving for the exact lightness, because the relationship
 * between HSL lightness and WCAG luminance is not analytic and a loop of at most
 * twenty iterations is cheaper than the algebra is to read.
 */
export function liftForPage(rgb: Rgb, background: Rgb, floor = CONTRAST_FLOOR): Rgb {
  if (contrastRatio(rgb, background) >= floor) return rgb;

  const { h, s } = toHsl(rgb);
  let { l } = toHsl(rgb);
  for (let i = 0; i < 20 && l < 0.95; i++) {
    l = Math.min(0.95, l + 0.04);
    const lifted = fromHsl(h, s, l);
    if (contrastRatio(lifted, background) >= floor) return lifted;
  }
  return fromHsl(h, s, l);
}

/**
 * The three values a club's colour becomes.
 *
 * Pure, so the whole thing is testable without a DOM, and so the 192 colours in
 * the data can be checked in one loop rather than by eye — which is how the
 * contrast floor got chosen in the first place.
 */
export function clubPalette(hex: string, background = PAGE_BACKGROUND): ClubPalette {
  const parsed = parseHex(hex);
  const page = parseHex(background) ?? { r: 11, g: 26, b: 18 };
  if (!parsed) {
    // No usable colour: hand back the accent, so a caller that blindly applies
    // this gets the interface's ordinary green rather than a transparent band.
    return { colour: 'var(--accent)', ink: '#05140b', wash: 'rgba(74, 222, 128, 0.12)' };
  }

  const lifted = liftForPage(parsed, page);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const ink =
    contrastRatio(lifted, black) >= contrastRatio(lifted, white) ? '#07120c' : '#ffffff';

  return {
    colour: toHex(lifted),
    ink,
    wash: `rgba(${Math.round(lifted.r)}, ${Math.round(lifted.g)}, ${Math.round(lifted.b)}, 0.14)`,
  };
}

/**
 * The least this needs to be able to write to.
 *
 * `HTMLElement` satisfies it, which is the only thing that ever calls this in
 * the game — but naming the structural minimum means the function can be tested
 * without a DOM, and the test environment here is deliberately `node`. Widening
 * the parameter is cheaper than adding jsdom to the project for one function.
 */
export interface StyleTarget {
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): string;
  };
}

/**
 * Put a club's colour on an element, for its subtree to use.
 *
 * Custom properties rather than direct styling, so the STYLESHEET decides what
 * the colour is for and this only says which club is in front of you. That
 * split is what stops club identity leaking into the semantic palette: CSS can
 * use `--club` on a header band and nowhere near a success message, and no
 * screen has to remember the rule.
 *
 * An absent or unparseable colour clears the properties rather than setting a
 * fallback, so the stylesheet's own `var(--club, var(--accent))` defaults apply
 * and there is exactly one place the fallback is written down.
 */
export function applyClubPalette(element: StyleTarget, hex: string | undefined): void {
  if (!hex) {
    element.style.removeProperty('--club');
    element.style.removeProperty('--club-ink');
    element.style.removeProperty('--club-wash');
    return;
  }

  const palette = clubPalette(hex);
  element.style.setProperty('--club', palette.colour);
  element.style.setProperty('--club-ink', palette.ink);
  element.style.setProperty('--club-wash', palette.wash);
}
