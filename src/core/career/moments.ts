import type { TraitId } from '../player/traits.ts';
import { TRAITS } from '../player/traits.ts';
import type { CompetitionKind } from './calendar.ts';
import { isEuropean, isInternational } from './calendar.ts';
import type { CareerRecords } from './records.ts';
import { lifetimeTotals } from './records.ts';

/**
 * THE MOMENTS A CAREER IS MADE OF
 *
 * Everything in this game was counted and nothing was ever said. The record
 * book knew the exact minute a career reached its hundredth appearance and had
 * no way to mention it; a first goal was an increment. A career you can only
 * read as a table is a spreadsheet with a footballer's name on it.
 *
 * So: the small number of things that happen once, or rarely enough to be worth
 * remarking on, written down in the career's own words as they happen.
 *
 * WHY THIS SHIPS WITH TRAITS RATHER THAN AFTER THEM. A trait announced only in
 * a stats table is an invisible modifier, which is the exact mistake this
 * codebase has already made once with morale. Earning one has to be a moment or
 * it is not really a thing that happened to you — so `traitEarned` is a moment
 * kind here, and the two features are one feature with two halves.
 *
 * WHAT IS DELIBERATELY NOT HERE. Anything that happens most weeks. A moment for
 * every goal would train the eye to skip the line that says "your first", which
 * is the only one that mattered. Everything below is either a first, a round
 * number reached once, or something rare enough to still be rare in a career of
 * five hundred matches.
 *
 * They are DERIVED FROM WHAT WAS ALREADY BEING RECORDED, for the same reason
 * the traits are: a career already under way should get its hundredth
 * appearance noticed, not have the counter start now. The one thing that
 * genuinely cannot be recovered is the moments a career has ALREADY passed —
 * nothing can go back and narrate a first goal scored three seasons ago — and
 * that is stated rather than papered over.
 */

export type MomentKind =
  | 'debut'
  | 'firstGoal'
  | 'firstAssist'
  | 'firstEuropeanNight'
  | 'firstCap'
  | 'hatTrick'
  | 'perfectRating'
  | 'appearanceMilestone'
  | 'goalMilestone'
  | 'scoringRun'
  | 'oldClub'
  | 'oldRival'
  | 'rivalGone'
  | 'traitEarned'
  /**
   * A final his side played, won or lost.
   *
   * In the diary as well as on the ceremony screen, because a screen is
   * something you close and the diary is the thing that remembers. It is also
   * the only record of a final LOST that survives a season a club won nothing
   * in — the honours list keeps the European and international runners-up and
   * nothing else.
   */
  | 'trophy';

export interface Moment {
  kind: MomentKind;
  /** The line itself, already written. Screens render it and add nothing. */
  text: string;
  /** The season it happened in, so a career reads in order. */
  season: number;
}

/**
 * Round numbers worth stopping on.
 *
 * Sparse on purpose and increasingly so: every tenth appearance would be noise
 * by March of the first season, and the gaps widening is what keeps the later
 * ones worth reaching.
 */
export const APPEARANCE_MILESTONES: readonly number[] = [1, 50, 100, 200, 300, 400, 500];
export const GOAL_MILESTONES: readonly number[] = [1, 25, 50, 100, 150, 200, 250, 300];

/** A scoring run long enough to be a story rather than a good fortnight. */
export const SCORING_RUN_MILESTONE = 5;

export interface MomentInput {
  /** The record book AFTER this match has been folded into it. */
  records: CareerRecords;
  /** The same, BEFORE — so a milestone is only announced on the match that crossed it. */
  before: CareerRecords;
  competition: CompetitionKind;
  goals: number;
  assists: number;
  rating: number;
  season: number;
  /** The opponent's name, and whether he used to play for them. */
  opponentName: string;
  againstOldClub: boolean;
  /**
   * A man who once competed with him for a shirt, now in the opposition.
   *
   * Null almost every week. It is the cheapest continuity in the game and the
   * one that makes the world feel like it has people in it: somebody you beat
   * four years ago is still playing, somewhere, and tonight he is over there.
   */
  formerRivalName?: string | null;
  /** Traits earned by this match, already decided. See core/player/traits.ts. */
  traits: readonly TraitId[];
}

/**
 * What was worth remarking on about this match.
 *
 * Takes the record book from both SIDES of the match rather than a pile of
 * flags, and that is what makes a milestone announce itself exactly once: the
 * hundredth appearance is the match where the count crossed a hundred, and no
 * caller has to remember which ones it has already mentioned. It also means the
 * whole thing is a pure function of two snapshots, which is testable without a
 * career.
 */
export function momentsFrom(input: MomentInput): Moment[] {
  const moments: Moment[] = [];
  const now = lifetimeTotals(input.records);
  const was = lifetimeTotals(input.before);
  const at = (kind: MomentKind, text: string) => moments.push({ kind, text, season: input.season });

  // --- firsts, which can only ever happen once --------------------------
  if (was.matches === 0 && now.matches > 0) {
    at('debut', `Your debut, against ${input.opponentName}.`);
  }
  if (was.goals === 0 && now.goals > 0) {
    at('firstGoal', `Your first goal in senior football.`);
  }
  if (was.assists === 0 && now.assists > 0) {
    at('firstAssist', `Your first assist — somebody scored because of you.`);
  }
  if (isEuropean(input.competition) && !playedIn(input.before, isEuropean)) {
    at('firstEuropeanNight', `Your first European night.`);
  }
  if (isInternational(input.competition) && !playedIn(input.before, isInternational)) {
    at('firstCap', `Your first cap.`);
  }

  // --- rare enough to remark on every time ------------------------------
  if (input.goals >= 3) {
    at('hatTrick', `A hat-trick against ${input.opponentName}.`);
  }
  if (input.records.ratings.perfect > input.before.ratings.perfect) {
    at('perfectRating', `A perfect ten. Nothing you did went wrong.`);
  }

  // --- round numbers, announced on the match that crossed them ----------
  const appearance = crossed(APPEARANCE_MILESTONES, was.matches, now.matches);
  if (appearance && appearance > 1) {
    at('appearanceMilestone', `Appearance number ${appearance}.`);
  }
  const goal = crossed(GOAL_MILESTONES, was.goals, now.goals);
  if (goal && goal > 1) {
    at('goalMilestone', `Career goal number ${goal}.`);
  }

  // A run announced as it lengthens rather than only at its end, because the
  // interesting part of a scoring run is being ON one.
  const run = input.records.scoringStreak.current;
  if (run >= SCORING_RUN_MILESTONE && run > input.before.scoringStreak.current) {
    at('scoringRun', `${run} matches in a row with a goal.`);
  }

  if (input.againstOldClub) {
    const scored = input.goals > 0 ? ' And you scored.' : '';
    at('oldClub', `Back against ${input.opponentName}, who used to pay your wages.${scored}`);
  }

  if (input.formerRivalName) {
    at(
      'oldRival',
      `${input.formerRivalName} lined up against you tonight. You took his shirt once.`,
    );
  }

  // Last, and deliberately: whatever else happened, becoming something is the
  // biggest thing that happened.
  for (const id of input.traits) {
    at('traitEarned', `You are now known as a ${TRAITS[id].label.toLowerCase()}. ${TRAITS[id].earned}`);
  }

  return moments;
}

/**
 * A moment that happened over the summer rather than in a match.
 *
 * The rival leaving is the only one so far, and it needs its own door because
 * `momentsFrom` is built around comparing a record book on both sides of a
 * fixture — and a transfer in June has no fixture to sit between.
 */
export function summerMoment(kind: MomentKind, text: string, season: number): Moment {
  return { kind, text, season };
}

/** Has he ever played in a competition matching this test? */
function playedIn(records: CareerRecords, test: (kind: CompetitionKind) => boolean): boolean {
  for (const [kind, totals] of Object.entries(records.byCompetition)) {
    if (totals && totals.matches > 0 && test(kind as CompetitionKind)) return true;
  }
  return false;
}

/** The highest milestone this match crossed, or null. */
function crossed(milestones: readonly number[], before: number, after: number): number | null {
  let highest: number | null = null;
  for (const milestone of milestones) {
    if (before < milestone && after >= milestone) highest = milestone;
  }
  return highest;
}

/**
 * How many moments a career keeps.
 *
 * A cap exists because this goes in a localStorage save that holds a whole
 * career in a few tens of kilobytes, and a twenty-season career can produce a
 * hundred and more. When it fills, the OLDEST go — which is the wrong way round
 * for a diary and the right way round for a save, and it is worth being honest
 * about the trade. The end-of-career screen shows what is left.
 */
export const MOMENT_LIMIT = 80;

export function rememberMoments(kept: Moment[], fresh: readonly Moment[]): Moment[] {
  const all = [...kept, ...fresh];
  return all.length <= MOMENT_LIMIT ? all : all.slice(all.length - MOMENT_LIMIT);
}
