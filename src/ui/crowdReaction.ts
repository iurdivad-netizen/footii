import type { OutcomeKind } from '../core/events/types.ts';

/**
 * WHAT THE CROWD DOES ABOUT IT.
 *
 * The ground already swells while a chance builds and settles afterwards, but
 * it had no opinion on what actually happened: a tap-in and a hopeless shank
 * were met by the same room. A crowd is the cheapest emotional feedback a
 * football game has, and it was being spent on atmosphere alone.
 *
 * THE RULE THAT MAKES IT WORK IS SILENCE. A crowd that reacts to every
 * completed pass is a crowd nobody believes, and worse, it flattens the goal:
 * if the twentieth sideways ball gets a cheer then the goal gets a cheer too.
 * So routine outcomes get nothing at all, and what is left — the goal, the
 * chance spurned, the ball given away in a dangerous place — lands.
 *
 * WHAT IT IS ALLOWED TO KNOW is exactly what the player already saw: the
 * outcome, and how good the chance was before he touched it. It never reacts to
 * anything hidden, so it can never leak information the decision withheld.
 */

export type CrowdMood = 'ovation' | 'cheer' | 'sigh' | 'jeer' | 'silent';

export interface CrowdReaction {
  mood: CrowdMood;
  /**
   * What the ground is doing, in the game's own voice. Empty when silent —
   * the absence is the point, and a caption saying "nothing happens" would
   * undo it.
   */
  caption: string;
}

/**
 * How good the chance had to be before missing it is met with hostility rather
 * than sympathy. A speculative effort from twenty-five yards is not booed; a
 * one-on-one put wide is.
 */
export const BIG_CHANCE = 0.6;

/**
 * How poor a position has to be for giving the ball away to be forgiven. Below
 * this the crowd never saw a chance to lose, so losing it is just football.
 */
export const CHEAP_LOSS = 0.35;

const SILENT: CrowdReaction = { mood: 'silent', caption: '' };

export function crowdReaction(
  outcome: OutcomeKind,
  /** 0-1, how promising the moment was BEFORE he did anything. */
  situationQuality: number,
): CrowdReaction {
  switch (outcome) {
    case 'goal':
      return { mood: 'ovation', caption: 'The ground erupts.' };

    // --- things that went well -------------------------------------------
    case 'chanceCreated':
      return { mood: 'cheer', caption: 'They are up out of their seats.' };
    case 'dribbleSuccess':
      return { mood: 'cheer', caption: 'A roar for the beaten man.' };
    case 'ballWon':
      return { mood: 'cheer', caption: 'The tackle brings the house down.' };
    case 'crossCompleted':
      return situationQuality >= BIG_CHANCE
        ? { mood: 'cheer', caption: 'The near end rises early.' }
        : SILENT;

    // Routine. The crowd of a team that completes four hundred passes a match
    // does not applaud the four hundredth, and neither does this one.
    case 'passCompleted':
    case 'held':
      return SILENT;

    // --- chances that came to nothing ------------------------------------
    case 'post':
      // The loudest noise in football that is not a goal.
      return { mood: 'sigh', caption: 'Thirty thousand heads in hands.' };
    case 'saved':
      return situationQuality >= BIG_CHANCE
        ? { mood: 'sigh', caption: 'A groan, and then applause for the keeper.' }
        : SILENT;
    case 'missed':
      return situationQuality >= BIG_CHANCE
        ? { mood: 'jeer', caption: 'He had to score. They let him know.' }
        : { mood: 'sigh', caption: 'A sigh, and it is gathered up behind.' };
    case 'blocked':
    case 'deflected':
    case 'crossCleared':
      return situationQuality >= BIG_CHANCE
        ? { mood: 'sigh', caption: 'The whole ground had gone up early.' }
        : SILENT;

    // --- the ball given away ---------------------------------------------
    case 'dribbleFailed':
    case 'turnover':
    case 'passIntercepted':
      return situationQuality >= BIG_CHANCE
        ? { mood: 'jeer', caption: 'Whistles. That was the moment, and it is gone.' }
        : situationQuality <= CHEAP_LOSS
          ? SILENT
          : { mood: 'sigh', caption: 'An exasperated noise behind the goal.' };
    case 'foulCommitted':
      return { mood: 'sigh', caption: 'A rumble of complaint at the whistle.' };
  }
}

/**
 * How much of a party the picture should throw. Kept separate from the mood so
 * the renderer never has to know what a mood is — it draws particles or it does
 * not, and how many.
 */
export function celebrationSize(mood: CrowdMood): 'big' | 'small' | 'none' {
  if (mood === 'ovation') return 'big';
  if (mood === 'cheer') return 'small';
  return 'none';
}
