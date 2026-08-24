import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards for the things that rot silently.
 *
 * Accessibility work is uniquely easy to undo by accident: nothing breaks, no
 * test fails, the screenshots look identical, and a keyboard player simply
 * cannot see where they are again. These read the stylesheet and the markup
 * directly, because the properties being asserted are properties of the
 * stylesheet rather than of any function.
 */

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
/**
 * The stylesheet with its comments removed.
 *
 * Needed because this file's comments discuss the very properties it asserts
 * the absence of — the timer bar carries a note reading "No CSS transition:",
 * which a naive scan for `transition:` reads as the thing it was written to
 * say is not there.
 */
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
const matchScreen = readFileSync(
  new URL('../src/ui/screens/MatchScreen.ts', import.meta.url),
  'utf8',
);
const overlay = readFileSync(
  new URL('../src/ui/components/EventOverlay.ts', import.meta.url),
  'utf8',
);

describe('keyboard focus is visible', () => {
  it('styles :focus-visible globally rather than on one component', () => {
    // The state this replaced: exactly one `:focus-visible` rule in the whole
    // stylesheet, so everything else fell back to a browser default that
    // computes to a near-black hairline on a background this dark.
    expect(declarations).toMatch(/^:focus-visible\s*\{/m);
  });

  it('offsets the ring, so it does not read as a border', () => {
    const rule = declarations.slice(declarations.indexOf(':focus-visible {'));
    expect(rule.slice(0, 200)).toMatch(/outline-offset:\s*[1-9]/);
  });

  it('gives the accent-filled controls a ring that is not the accent', () => {
    // A green ring on a green button is not a ring.
    expect(declarations).toMatch(/button\.primary:focus-visible[^{]*\{[^}]*outline-color/);
  });

  it('uses :focus-visible rather than :focus, so a mouse leaves nothing behind', () => {
    // Counted rather than pattern-matched across selectors: a selector list can
    // span several lines, and a regex clever enough to walk one is a regex
    // clever enough to be wrong about it.
    const all = (declarations.match(/:focus/g) ?? []).length;
    const visible = (declarations.match(/:focus-visible/g) ?? []).length;
    expect(all - visible).toBe(0);
  });
});

describe('motion can be turned down', () => {
  it('honours prefers-reduced-motion', () => {
    expect(declarations).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('leaves the timer bar alone, because reducing motion must not reduce information', () => {
    // The bar's width is written from JavaScript every frame and carries no
    // transition of its own, precisely so it always shows real remaining time.
    const bar = declarations.slice(
      declarations.indexOf('.timer-bar span {'),
      declarations.indexOf('.timer-bar span.critical'),
    );
    expect(bar).not.toMatch(/transition/);
  });
});

describe('nothing is too small to read', () => {
  it('keeps every font size at or above 0.7rem', () => {
    // It used to reach 0.58rem — about nine pixels — on the SHOT/RUN/CROSS tag
    // of the box a player has seconds to read under a clock.
    const tooSmall = (declarations.match(/font-size:\s*0\.\d+rem/g) ?? []).filter(
      (rule) => Number(rule.match(/0\.\d+/)![0]) < 0.7,
    );
    expect(tooSmall).toEqual([]);
  });

  it('gives the secondary buttons a finger-sized target', () => {
    const ghost = declarations.slice(declarations.indexOf('button.ghost {'));
    expect(ghost.slice(0, 400)).toMatch(/min-height:\s*4[4-9]px|min-height:\s*[5-9]\dpx/);
  });
});

describe('what happens is announced', () => {
  it('announces the newest commentary line rather than the whole feed', () => {
    // The feed is rewritten whole every frame, newest first, so making IT the
    // live region would have a screen reader re-read fourteen lines a minute.
    expect(matchScreen).toMatch(/id="commentary-live"[^>]*aria-live="polite"/);
    expect(matchScreen).toMatch(/this\.announced/);
  });

  it('never announces the same line twice', () => {
    expect(matchScreen).toMatch(/latest\.text !== this\.announced/);
  });

  it('announces the keeper, and only when he moves', () => {
    // The single most important read in the game, and it lived on a canvas —
    // which is `aria-hidden` and cannot be anything else.
    expect(overlay).toMatch(/class="keeper-strip" aria-live="polite"/);
    expect(overlay).toMatch(/if \(this\.keeperShown === action\) return;/);
  });
});

describe('the picture explains itself', () => {
  it('names every dot on the pitch', () => {
    for (const label of ['You', 'Ball', 'Defender', 'Keeper']) {
      expect(overlay).toContain(`label: '${label}'`);
    }
  });

  it('takes the key colours from the renderer rather than restating them', () => {
    // A key in approximately the right colour is worse than no key.
    expect(overlay).toMatch(/import \{ COLOURS \} from '\.\.\/\.\.\/rendering\/events\/SituationRenderer\.ts'/);
    expect(overlay).toMatch(/colour: COLOURS\.player/);
  });
});

describe('the clock says what it is counting', () => {
  it('captions the readout in every phase', () => {
    expect(overlay).toMatch(/'your window'/);
    expect(overlay).toMatch(/'seconds left'/);
    expect(overlay).toMatch(/'elapsed · no limit'/);
  });

  it('shows one decimal rather than two', () => {
    // Nobody has ever read a hundredth of a second off a screen, and the extra
    // digit only made the number harder to glance at.
    expect(overlay).toMatch(/seconds\.toFixed\(1\)/);
    expect(overlay).not.toMatch(/remaining\.toFixed\(2\)/);
  });
});
