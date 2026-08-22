import { clamp01, remap } from '../util/math.ts';

/**
 * WHAT YOU BECOME KNOWN FOR
 *
 * Two strikers with the same twenty attributes were the same footballer. The
 * record book counted everything they had ever done and none of it came back:
 * a hat-trick was a number on a page, never a fact about the man who scored it.
 *
 * A trait is that fact. Eight of them, each earned from something the career
 * was already recording, and each one changing how a MATCH PLAYS rather than
 * adding a figure to a screen.
 *
 * THREE RULES, and they are what stop this being a skill tree.
 *
 * EARNED, NEVER CHOSEN. There is no menu. A trait arrives because of something
 * you actually did over enough football that it stopped being a coincidence,
 * which is what makes the set of them a record of the career rather than a
 * build order. It also means two careers with identical attributes genuinely
 * play differently, which is the whole point.
 *
 * IT MUST BE FELT AT THE KEYBOARD. Every trait here reads into the action
 * model, the decision window, the injury roll or selection — the things that
 * change what happens in front of you. A trait that only made a number bigger
 * would be repeating the mistake morale spent every version until recently
 * making, and repeating it eight times over.
 *
 * EARNED FROM WHAT IS ALREADY COUNTED. This is the constraint that shaped the
 * list, and it comes from a lesson this codebase has already paid for once: a
 * counter only counts forward (see CHANGELOG.md, item 11). A trait earned from
 * a NEW counter would sit there doing nothing for every career already in
 * progress, because the evidence it needs was never written down. So every
 * condition below reads the record book, the history or the player as they
 * already are — which means an existing career gains the traits it has already
 * earned the moment it next plays. Several ideas were re-based to fit this and
 * one, penalties, was dropped for failing it.
 *
 * TWO ARE DOUBLE-EDGED, marked below. A set of pure upsides is a skill tree by
 * another name; a purely negative trait is a punishment for bad luck. Something
 * that cuts both ways is character.
 */

export type TraitId =
  | 'bigGame'
  | 'coolHead'
  | 'provider'
  | 'poacher'
  | 'granite'
  | 'streaky'
  | 'maverick'
  | 'oldHead';

export const TRAIT_IDS: readonly TraitId[] = [
  'bigGame',
  'coolHead',
  'provider',
  'poacher',
  'granite',
  'streaky',
  'maverick',
  'oldHead',
];

export interface TraitDefinition {
  id: TraitId;
  label: string;
  /** What it does, in the player's language rather than the model's. */
  description: string;
  /** What earned it, said back to him at the moment it lands. */
  earned: string;
  /** True when it cuts both ways. The screen marks these. */
  doubleEdged: boolean;
}

export const TRAITS: Record<TraitId, TraitDefinition> = {
  bigGame: {
    id: 'bigGame',
    label: 'Big-game player',
    description: 'The bigger the night, the better you play.',
    earned: 'You have made a habit of turning up when it mattered.',
    doubleEdged: false,
  },
  coolHead: {
    id: 'coolHead',
    label: 'Cool head',
    description: 'Crowded penalty areas do not rush you.',
    earned: 'Nothing seems to hurry you any more.',
    doubleEdged: false,
  },
  provider: {
    id: 'provider',
    label: 'The provider',
    description: 'The pass is on more often, and it finds a better player.',
    earned: 'People have started making runs because they expect the ball.',
    doubleEdged: false,
  },
  poacher: {
    id: 'poacher',
    label: 'Poacher',
    description: 'Inside the box, you finish what an ordinary striker would not.',
    earned: 'You keep being in the right place, and it has stopped looking like luck.',
    doubleEdged: false,
  },
  granite: {
    id: 'granite',
    label: 'Made of granite',
    description: 'You get hurt less than the men around you.',
    earned: 'Season after season, you are simply always available.',
    doubleEdged: false,
  },
  streaky: {
    id: 'streaky',
    label: 'Streaky',
    description: 'Form comes and goes faster for you than for anybody else.',
    earned: 'When you are going, nobody can stop you. Everyone has noticed the other half too.',
    doubleEdged: true,
  },
  maverick: {
    id: 'maverick',
    label: 'Maverick',
    description: 'Capable of anything — and not every week.',
    earned: 'One afternoon nobody who saw it will forget, in among a lot of ordinary ones.',
    doubleEdged: true,
  },
  oldHead: {
    id: 'oldHead',
    label: 'Old head',
    description: 'Tired legs slow you down less, and a manager keeps faith longer.',
    earned: 'Hundreds of matches have taught you how to play without your legs.',
    doubleEdged: false,
  },
};

/** Does he have it? Written as a helper so nobody re-implements the lookup. */
export function hasTrait(traits: readonly TraitId[] | undefined, id: TraitId): boolean {
  return !!traits && traits.includes(id);
}

/**
 * WHAT A TRAIT IS WORTH IN THE ACTION MODEL
 *
 * On the resolution scale, where `RESOLUTION_WEIGHTS.execution` turns a 0.2
 * swing in execution into 0.068, and the whole tempo term maxes out at 0.03. So
 * a trait sits between the two: worth about as much as making a genuinely quick
 * decision, and nowhere near enough to carry a bad choice.
 *
 * Deliberately at that size rather than larger. A trait is meant to be the
 * difference between two good footballers, not a substitute for being one.
 */
export const TRAIT_ACTION_BONUS = 0.035;

/** The most a big-game player gets, at the very biggest match there is. */
export const BIG_GAME_BONUS = 0.045;

/** How much wider a maverick's execution jitter runs. */
export const MAVERICK_NOISE = 1.45;

/** How much of the injury risk a durable player sheds. */
export const GRANITE_INJURY = 0.82;

/** How much extra thinking time a cool head has, at maximum pressure. */
export const COOL_HEAD_TIME = 0.3;

/** How much slower fatigue closes an old head's decision window. */
export const OLD_HEAD_FATIGUE = 0.7;

/**
 * How fast form moves for a streaky player, against the ordinary 0.35.
 *
 * The double edge, and it is genuinely double: the same number that lets him
 * climb out of a bad run in three matches is the one that drops him into the
 * next one just as quickly. Nothing here decides which direction it moves.
 */
export const STREAKY_FORM = 0.5;

/**
 * What a trait adds to one action, on the resolution scale.
 *
 * Pure, and takes only what it needs, so the resolver stays a list of terms and
 * this stays testable without building a match. Returns 0 for a player with no
 * traits, which is every career before this existed and most careers for their
 * first few seasons.
 */
export function traitActionBonus(
  traits: readonly TraitId[] | undefined,
  input: {
    family: 'shot' | 'dribble' | 'pass' | 'cross' | 'header' | 'defend' | 'hold';
    /** True when the action is being taken inside the penalty area. */
    insideBox: boolean;
    /** How much the match matters, 0-1. See `matchImportance`. */
    importance: number;
  },
): number {
  if (!traits || traits.length === 0) return 0;
  let bonus = 0;

  // A poacher's edge is entirely about where he is standing. Outside the box he
  // is an ordinary finisher, which is what the word means.
  if (input.insideBox && input.family === 'shot' && hasTrait(traits, 'poacher')) {
    bonus += TRAIT_ACTION_BONUS;
  }

  // Crosses count as passes here. Both are a ball played to somebody else, and
  // a player known for finding people is known for finding them from the wing
  // as well as through the middle.
  if ((input.family === 'pass' || input.family === 'cross') && hasTrait(traits, 'provider')) {
    bonus += TRAIT_ACTION_BONUS;
  }

  // Scaled from an ordinary league match upward, so it is worth nothing on a
  // Saturday and everything in a final. A flat bonus would make him a better
  // footballer; this makes him a bigger-occasion one, which is the difference
  // the label is claiming.
  if (hasTrait(traits, 'bigGame')) {
    bonus += BIG_GAME_BONUS * clamp01(remap(input.importance, 0.6, 1, 0, 1));
  }

  return bonus;
}

/**
 * WHAT A CAREER HAS DONE, as the earning conditions need to see it.
 *
 * Plain numbers rather than the record book itself, deliberately: `core/player`
 * has no business importing `core/career`, and a flat bag of evidence is also
 * the only shape that can be tested without building a career to test against.
 * The career layer assembles it — see `traitEvidence`.
 */
export interface TraitEvidence {
  /** Lifetime, every competition. */
  appearances: number;
  goals: number;
  assists: number;
  /** Career average match rating. */
  averageRating: number;
  /** Matches rated nine or better, and the perfect tens among them. */
  nineOrBetter: number;
  perfectRatings: number;
  hatTricks: number;
  /** Longest run of consecutive matches scoring. */
  longestScoringRun: number;
  /** Completed seasons. */
  seasons: number;
  /** Appearances in European and international football, and how they went. */
  bigMatches: number;
  bigMatchAverage: number;
  age: number;
}

/**
 * Whether each trait has been earned.
 *
 * Thresholds are pitched so that a full career ends with a HANDFUL rather than
 * all eight — measured at two to five, which is the range where the set of them
 * still says something. There is no cap enforcing that and there should not be:
 * a cap would raise the question of which one to drop, and the honest answer is
 * that nothing you have already been is taken away from you. The difficulty
 * does the limiting instead.
 *
 * Every condition reads evidence that was already being recorded before traits
 * existed, so a career in progress gains what it has already earned rather than
 * starting from nothing. See the note at the top of this file.
 *
 * A PROPERTY WORTH KNOWING, because it is not obvious and it decided several of
 * the numbers below. These are checked after every match and a trait is never
 * taken back, so a condition on a RATE effectively tests the highest that rate
 * ever reached rather than where it finished. Left as it is — "he was, for a
 * while, exactly that player" is a true thing to say and a career that could
 * un-become something would not be a record — but it is why every rate here
 * also carries an absolute floor. Without one, a career fires half its traits
 * inside its first two seasons on a sample far too small to mean anything, and
 * measurement showed exactly that: a middling career became a maverick 100% of
 * the time, on the strength of a good fortnight in its early twenties.
 */
export function earnedTraits(evidence: TraitEvidence): TraitId[] {
  const earned: TraitId[] = [];
  const per100 = (count: number) =>
    evidence.appearances > 0 ? (count / evidence.appearances) * 100 : 0;

  // Twenty European or international nights, and the average is the part that
  // matters: turning up is not the same as playing.
  if (evidence.bigMatches >= 20 && evidence.bigMatchAverage >= 7.4) earned.push('bigGame');

  if (evidence.appearances >= 150 && per100(evidence.nineOrBetter) >= 30) earned.push('coolHead');

  if (evidence.assists >= 100) earned.push('provider');

  if (evidence.hatTricks >= 30 && per100(evidence.hatTricks) >= 11) earned.push('poacher');

  // Availability rather than an injury count, and that is a re-basing rather
  // than a compromise: how many matches a season he actually plays IS what
  // being made of granite means, and unlike an injury tally it was already
  // being written down.
  if (evidence.seasons >= 6 && evidence.appearances / evidence.seasons >= 33) {
    earned.push('granite');
  }

  if (evidence.longestScoringRun >= 16) earned.push('streaky');

  // The variance signal, and the one that took three attempts to state. It
  // cannot be built on the BEST rating a career ever got: a maximum over five
  // hundred matches is a ten for everybody, so every version of this that read
  // `bestRating` fired for 100% of careers and said nothing.
  //
  // Perfect tens as a RATE, against a career average that stayed ordinary, over
  // enough football that the average has stopped moving. All three parts are
  // needed: a count alone is reached earlier by the better player while his
  // average is still low, so every version without the 300-match floor made the
  // GOOD careers mavericks and the modest ones nothing.
  //
  // Unlike every other trait here, this is one a modest career earns and a great
  // one does not — a great one's average disqualifies him. He is not a maverick.
  // He is just good.
  if (
    evidence.appearances >= 300 &&
    per100(evidence.perfectRatings) >= 4 &&
    evidence.averageRating < 7
  ) {
    earned.push('maverick');
  }

  // Longevity rather than quality, and deliberately the one trait that asks
  // nothing about how good he was. Retiring at thirty-two is a career that
  // never gets this, however brilliant.
  if (evidence.age >= 33 && evidence.appearances >= 350) earned.push('oldHead');

  return earned;
}

/**
 * The ones he has just earned, in the order they are defined.
 *
 * Additive only: a trait already held is never taken back, even if the career
 * later stops meeting the condition that produced it. A maverick whose average
 * climbs into the sevens does not stop having had that afternoon, and a record
 * of a career that could un-record itself would not be a record.
 */
export function newTraits(held: readonly TraitId[] | undefined, evidence: TraitEvidence): TraitId[] {
  const already = new Set(held ?? []);
  return earnedTraits(evidence).filter((id) => !already.has(id));
}
