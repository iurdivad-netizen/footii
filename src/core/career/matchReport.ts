import { APPEARANCE_MILESTONES, GOAL_MILESTONES } from './moments.ts';
import { confidenceTier } from './confidence.ts';
import { TRAIN_FITNESS_FLOOR } from './week.ts';

/**
 * WHAT ACTUALLY CHANGED, AND WHY IT IS NOT A DIFF
 *
 * The hub redraws after every match with a dozen numbers in new positions and
 * nothing anywhere saying which of them moved. Fitness has dropped, the
 * manager has revised his opinion, form has shifted, the objective is a match
 * closer — all of it visible if you happened to remember last week's figures,
 * which nobody does. The screen was a readout rather than feedback.
 *
 * The obvious fix is to print the differences. That would be worse than
 * nothing: nine lines every week, most of them a point or two of a number the
 * player cannot act on, and within a month the eye skips the whole strip —
 * which is exactly what happened to the moments before they were made rare on
 * purpose.
 *
 * SO THE RULE HERE IS: SAY IT ONLY WHEN IT CHANGES WHAT HE MIGHT DO NEXT.
 *
 *   FITNESS       reported only when it has fallen below the level at which
 *                 extra work is possible, because that is the week's decision
 *                 changing shape rather than a number changing value. Above
 *                 that floor a tired footballer is an ordinary footballer.
 *   CONFIDENCE    reported only when the manager's BAND changed — he was
 *                 unconvinced and now he is not. Two points of a hidden number
 *                 is not news; being back in his plans is.
 *   MILESTONES    reported only within touching distance, because "two matches
 *                 from your fiftieth" is a reason to play the next one and
 *                 "thirty-one from your hundredth" is not.
 *
 * Most weeks this produces NOTHING, and that is the design working. A strip
 * that appeared every week would train the eye to skip the week it mattered,
 * which is the mistake this codebase has already made once with morale and
 * fixed once with the moments.
 *
 * EVERYTHING IT READS ALREADY EXISTED. Fitness, confidence and the record book
 * were all being kept before this; the only new thing is a snapshot taken on
 * both sides of one match, which is the same trick the moments use to announce
 * a hundredth appearance exactly once.
 */

/** The handful of numbers worth comparing across a single match. */
export interface CareerSnapshot {
  fitness: number;
  confidence: number;
  /** Lifetime appearances and goals, for the milestone countdown. */
  appearances: number;
  goals: number;
}

export type ChangeTone = 'good' | 'bad' | 'neutral';

export interface MatchChange {
  text: string;
  tone: ChangeTone;
}

/**
 * How close a milestone has to be before it is worth mentioning.
 *
 * Three, so it arrives as a countdown rather than as a fact about arithmetic.
 * At ten it would be true for most of a career and would say nothing.
 */
export const MILESTONE_RANGE = 3;

/**
 * The next round number ahead of a total, if one is close enough to matter.
 *
 * THE FIRST MILESTONE IS EXCLUDED, and that was found by playing rather than by
 * reading. Both lists start at 1, so a player who has not scored yet is within
 * range of his "1st goal" permanently — which for a centre-back means the strip
 * says "1 goal from your 1st" after every match for twenty matches running.
 * That is precisely the weekly noise this module exists to avoid, and it is
 * worse than noise because the moments already announce a first goal properly,
 * at the moment it happens, in the career's own words.
 *
 * So a countdown starts at the SECOND milestone. Nothing is lost: the firsts
 * were never this feature's to report.
 */
function approaching(milestones: readonly number[], total: number): number | null {
  const next = milestones.slice(1).find((milestone) => milestone > total);
  if (next === undefined) return null;
  return next - total <= MILESTONE_RANGE ? next : null;
}

function ordinal(value: number): string {
  const suffix =
    (value % 100 > 10 && value % 100 < 14) || value % 10 > 3
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][value % 10]!;
  return `${value}${suffix}`;
}

/**
 * What is worth saying about the match just played.
 *
 * Pure, and takes two snapshots rather than the career, so it can be tested
 * without building one and so the rules above stay readable as rules.
 */
export function changesBetween(
  before: CareerSnapshot,
  after: CareerSnapshot,
): MatchChange[] {
  const changes: MatchChange[] = [];

  // The manager's band, not his number. He cannot see the figure and neither
  // should the strip.
  const wasTier = confidenceTier(before.confidence).label;
  const nowTier = confidenceTier(after.confidence).label;
  if (wasTier !== nowTier) {
    changes.push({
      text: `The manager has changed his mind about you — ${nowTier.toLowerCase()}.`,
      tone: after.confidence > before.confidence ? 'good' : 'bad',
    });
  }

  // Fitness only where it changes the week's options. Crossing the floor is
  // the event; sitting below it every week for a month is not.
  if (before.fitness >= TRAIN_FITNESS_FLOOR && after.fitness < TRAIN_FITNESS_FLOOR) {
    changes.push({
      text: `Too tired for extra work this week — ${Math.round(after.fitness)}% fit.`,
      tone: 'bad',
    });
  } else if (before.fitness < TRAIN_FITNESS_FLOOR && after.fitness >= TRAIN_FITNESS_FLOOR) {
    changes.push({ text: 'Fresh enough to train properly again.', tone: 'good' });
  }

  const nextApps = approaching(APPEARANCE_MILESTONES, after.appearances);
  if (nextApps !== null) {
    const away = nextApps - after.appearances;
    changes.push({
      text: `${away} ${away === 1 ? 'match' : 'matches'} from your ${ordinal(nextApps)} appearance.`,
      tone: 'neutral',
    });
  }

  const nextGoals = approaching(GOAL_MILESTONES, after.goals);
  if (nextGoals !== null) {
    const away = nextGoals - after.goals;
    changes.push({
      text: `${away} ${away === 1 ? 'goal' : 'goals'} from your ${ordinal(nextGoals)}.`,
      tone: 'neutral',
    });
  }

  return changes;
}
