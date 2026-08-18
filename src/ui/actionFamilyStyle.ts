import type { ActionFamily } from '../core/events/types.ts';

/**
 * ACTION FAMILY COLOURS
 *
 * Each of the six options is tinted by what KIND of football action it is, so
 * the menu can be grouped at a glance instead of read word by word. Under a
 * one-second window, "the red ones are shots" is far faster than parsing six
 * labels.
 *
 * Two deliberate constraints:
 *
 *   1. Colour encodes CATEGORY, never QUALITY. It must never hint at which
 *      option is correct — that is the read the whole game is built around.
 *      Grouping is help; grading would be cheating.
 *   2. Colour is never the only channel. Every option also carries a short
 *      family tag, so the grouping still works for a colour-blind player and is
 *      learnable rather than something you have to memorise.
 *
 * These are presentation only, which is why they live in `ui/` and not beside
 * the action catalogue.
 */
export interface FamilyStyle {
  /** Short tag shown on the option, three or four characters. */
  tag: string;
  colour: string;
  /** Longer name, used by the legend and assistive text. */
  label: string;
}

export const FAMILY_STYLE: Record<ActionFamily, FamilyStyle> = {
  shot: { tag: 'SHOT', colour: '#f2555a', label: 'Shot' },
  header: { tag: 'HEAD', colour: '#fb923c', label: 'Header' },
  dribble: { tag: 'RUN', colour: '#facc15', label: 'Dribble' },
  pass: { tag: 'PASS', colour: '#5b9dff', label: 'Pass' },
  cross: { tag: 'CROSS', colour: '#2dd4bf', label: 'Cross' },
  defend: { tag: 'DEF', colour: '#e8edf2', label: 'Defend' },
  hold: { tag: 'HOLD', colour: '#a8a29e', label: 'Hold up' },
};

export function familyStyle(family: ActionFamily): FamilyStyle {
  return FAMILY_STYLE[family];
}

/** Families in the order the legend should list them. */
export const LEGEND_ORDER: ActionFamily[] = [
  'shot',
  'header',
  'dribble',
  'pass',
  'cross',
  'defend',
  'hold',
];
