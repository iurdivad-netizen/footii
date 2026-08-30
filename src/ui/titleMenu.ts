import type { CareerSummary } from './screens/HomeScreen.ts';

/**
 * WHAT IS ON THE FRONT DOOR, AND IN WHAT ORDER
 *
 * The menu is a decision about the save rather than a layout, so it is worked
 * out here where it can be read without a browser — the same reason
 * `hubSections` and `hubPeek` sit beside the screens that draw them rather than
 * inside them.
 *
 * THE ORDER IS NOT THE ORDER IT WAS ASKED FOR. The request read: how to play,
 * continue, new game, quick game. That is the right order exactly once — on a
 * first visit, when there is nothing to continue and the manual is the only
 * thing that can help. Every visit after that it puts a document you read once
 * above the action you take every time.
 *
 * So the rule is: the first entry is whatever the player is most likely to have
 * come here to do, which is a fact about the save. With a career in progress
 * that is CONTINUE, named so it is a decision rather than a guess about which
 * of three is behind it. With an empty save there is nothing to continue and
 * starting one leads instead. The manual sits with the ordinary entries in both
 * cases, reachable in one press and never in the way.
 *
 * ONE ENTRY WHOSE NAME IS A FACT. The careers page is where you start another,
 * switch between them, or end one — and on an empty save it is none of those,
 * it is the place you make your first. Calling it "Careers" in one case and
 * "New career" in the other is the label telling the truth twice.
 */

export type TitleEntryId = 'continue' | 'careers' | 'quick' | 'how';

export interface TitleEntry {
  id: TitleEntryId;
  label: string;
  detail: string;
  /** The one thing he probably came here to do. Exactly one entry has it. */
  primary: boolean;
}

export interface TitleMenuInput {
  /** The career that would be resumed, or null when there is none. */
  current: CareerSummary | null;
  /** How many careers are on the save at all. */
  careerCount: number;
}

export function titleMenu(input: TitleMenuInput): TitleEntry[] {
  const entries: TitleEntry[] = [];

  if (input.current) {
    entries.push({
      id: 'continue',
      label: 'Continue career',
      // The footballer, his club and where he has got to. "Continue career" on
      // its own is a verb with no object, and this game keeps three of them.
      detail: `${input.current.name} — ${input.current.detail}`,
      primary: true,
    });
  }

  entries.push({
    id: 'careers',
    label: input.careerCount > 0 ? 'Careers' : 'New career',
    detail:
      input.careerCount > 0
        ? 'Start another, switch between them, or end one. Three run side by side.'
        : 'Build a footballer and follow him season by season, for fifteen years.',
    primary: !input.current,
  });

  entries.push({
    id: 'quick',
    label: 'Quick match',
    detail: 'One game, any player against any opponent. Nothing here touches a career.',
    primary: false,
  });

  entries.push({
    id: 'how',
    label: 'How to play',
    detail: 'What the screens do, and the one read the whole match is built around.',
    primary: false,
  });

  return entries;
}
