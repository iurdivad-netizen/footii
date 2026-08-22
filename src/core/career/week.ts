import type { Rng } from '../rng.ts';
import { clamp, clamp01, round } from '../util/math.ts';
import { CONFIDENCE_NEUTRAL } from './confidence.ts';

/**
 * THE WEEK BETWEEN MATCHES
 *
 * Until now a career was a conveyor belt. Between one fixture and the next the
 * hub offered exactly one button — *Play match* — and everything else on the
 * screen was a readout. A season was thirty decisions about how to finish a
 * chance and none at all about how to be a footballer.
 *
 * So the week is a decision now. One choice, made before the next fixture and
 * spent on it, out of four things a player can do with seven days.
 *
 * WHAT MAKES IT A DECISION RATHER THAN A MENU OF BONUSES. Every option costs
 * something the others would have given you, and two of them cost more than
 * that:
 *
 *   REST      fitness back, and nothing learned. The safe week.
 *   EXTRA WORK  more out of the next match, paid for in fitness — which is read
 *               by selection, so training hard is a way to end up not playing.
 *   STUDY     a longer decision window in the next match. It costs nothing
 *               physical, which means the whole of its price is the other three.
 *   ASK       knock on the manager's door. The only option that can go
 *               backwards, and the only one that changes what somebody else
 *               thinks of you.
 *
 * WHY MORALE DECIDES WHAT THE WEEK IS WORTH. This is the second half of giving
 * morale a job (see core/career/confidence.ts for the first). A number that only
 * ever receives is still decoration, so morale is what a week of work is
 * multiplied by: a man who is happy where he is gets more out of it, and a man
 * who is not gets less. It is also most of what decides whether asking for a
 * start lands, because the conversation is going to be had by whichever version
 * of him turns up to it.
 *
 * ONE PICK, AND IT IS FINAL. The plan names the calendar slot it was made for,
 * so it is spent exactly once and cannot be carried onto a later fixture. It
 * cannot be changed once made, for the same reason the contract negotiation
 * allows exactly one push: a decision you can take back until you like the
 * answer is a slot machine rather than a decision.
 *
 * WHILE INJURED THERE IS NO WEEK TO PLAN. He is in the treatment room, the
 * fixture is going to pass without him, and offering him a training decision
 * about a match he cannot play would be a choice with nothing on either side of
 * it.
 */

export type WeekChoice = 'rest' | 'train' | 'study' | 'push';

export const WEEK_CHOICES: readonly WeekChoice[] = ['rest', 'train', 'study', 'push'];

export const WEEK_LABELS: Record<WeekChoice, string> = {
  rest: 'Rest up',
  train: 'Extra work',
  study: 'Study the opponent',
  push: 'Ask for a start',
};

/** One line on what each is for, so the choice is made with its cost visible. */
export const WEEK_DESCRIPTIONS: Record<WeekChoice, string> = {
  rest: 'Fresh legs for the weekend. You will learn nothing from the week.',
  train: 'You will take more from the next match — and turn up to it tired.',
  study: 'You will see the next match a little earlier than it happens.',
  push: 'Tell him you should be playing. He may not agree.',
};

/**
 * How the week's plan is stored, and why it names a slot.
 *
 * The slot is what makes it spendable exactly once. Without it a plan would sit
 * in the save being applied to every fixture after the one it was made for, and
 * a single week of extra work would become a permanent multiplier.
 */
export interface WeekPlan {
  choice: WeekChoice;
  /** The calendar slot it was made for. */
  slotIndex: number;
  /** What it did, in the hub's words. */
  note: string;
  /**
   * Multiplier on what the next match's development is worth. 1 for a week
   * that was not spent on training.
   */
  growth: number;
  /**
   * Extra decision time in the next match, in the timer's own model units
   * (roughly 3.3 seconds each). 0 for a week that was not spent studying.
   */
  preparation: number;
}

/** Fitness a week of rest gives back, on top of the ordinary recovery. */
export const REST_FITNESS = 8;

/** Fitness a week of extra work costs. */
export const TRAIN_FITNESS = 6;

/**
 * How fresh he has to be to do extra work at all.
 *
 * A cost that does not reset is a ratchet, and this one very nearly was. Fitness
 * carries between matches, a match costs about 36 of it and a week's rest
 * returns 34 — so the system already runs a slight deficit, and taking another
 * six every week compounds into free-fall. Measured over 360 seasons, a career
 * that trained every week took 1.73 injuries a season against 1.26 for one that
 * planned nothing, finished matches on a mean fitness of 36 with a tenth
 * percentile of 2, and went from one season in four with no injury to one in
 * eight. The card promised "turn up to it tired". It was not describing that.
 *
 * The fix is a gate rather than a smaller number, because a smaller number
 * still ratchets — it only takes longer. Below this a player is in no state to
 * do extra work, which is also the thing a coach would actually say, and the
 * gate turns the trap into the reverse: when he is tired the screen tells him
 * so, and resting is visibly the right answer rather than a lesson he learns in
 * February. See CHANGELOG.md, item 14.
 */
export const TRAIN_FITNESS_FLOOR = 80;

/** Is he fresh enough to do extra work this week? */
export function canTrain(fitness: number): boolean {
  return fitness >= TRAIN_FITNESS_FLOOR;
}

/**
 * The four options, and which of them he is in a state to take.
 *
 * Returned with the unavailable one still IN the list rather than filtered out
 * of it, so the screen can grey it out and say why. A choice that silently
 * disappears reads as a bug and teaches nothing; one that is visibly shut,
 * with the reason attached, is what makes resting the obvious answer.
 */
export interface WeekOption {
  choice: WeekChoice;
  available: boolean;
  /** Why not, when it is not. Empty when it is. */
  reason: string;
}

export function weekOptions(fitness: number): WeekOption[] {
  return WEEK_CHOICES.map((choice) => {
    if (choice === 'train' && !canTrain(fitness)) {
      return {
        choice,
        available: false,
        reason: 'You are in no state for it. Rest first.',
      };
    }
    return { choice, available: true, reason: '' };
  });
}

/**
 * How much more a match is worth after a week of extra work, at neutral morale.
 *
 * Deliberately small. This is a multiplier on a development budget that was
 * calibrated to produce a whole career arc, and a week's work that added half
 * as much again would rewrite it — a player who trained every week for fifteen
 * years would arrive somewhere the model was never tuned for.
 *
 * It is also self-limiting in a way worth noticing, because it is the reason
 * the number can be this generous rather than smaller still: training costs
 * fitness, fitness is read by selection, and development only happens in
 * matches you play. A career spent entirely in the gym trains its way out of
 * the side.
 */
export const TRAIN_GROWTH = 0.2;

/**
 * What studying the opponent is worth on every decision window in the match.
 *
 * In the decision timer's model units, where the whole difference between an
 * average Awareness and a maximum one is 0.55. So a week of homework is worth
 * roughly half of being an exceptional reader of the game — for one match, and
 * at the cost of every other thing the week could have been.
 *
 * Multiplied into seconds by DECISION_SCALE like everything else the timer
 * knows, which makes it about eight tenths of a second on a ten-second window,
 * and which means it stretches and shrinks with the pace setting rather than
 * being a flat gift that means more at Hardcore than at Relaxed.
 */
export const PREPARATION_BONUS = 0.25;

/** What the manager's answer is worth, either way. */
export const PUSH_CONFIDENCE_GAIN = 9;
export const PUSH_CONFIDENCE_LOSS = 6;
export const PUSH_MORALE_GAIN = 6;
export const PUSH_MORALE_LOSS = 8;

/**
 * How much a week of work is multiplied by, given how he feels about the place.
 *
 * 0.6 at rock bottom to 1.4 at the top. Morale's first job that is not a
 * rounding error on a clock: what a footballer takes from a week is decided by
 * whether he wants to be there.
 */
export function effortFactor(morale: number): number {
  return 0.6 + clamp01(morale / 100) * 0.8;
}

export interface WeekInput {
  choice: WeekChoice;
  fitness: number;
  morale: number;
  form: number;
  confidence: number;
}

export interface WeekOutcome {
  fitness: number;
  morale: number;
  confidence: number;
  growth: number;
  preparation: number;
  note: string;
}

/**
 * The odds that asking for a start gets a hearing.
 *
 * Morale and form say who is walking into the office, and both help. What makes
 * this a lever rather than a button is the third term: the odds fall as the
 * manager's confidence RISES.
 *
 * That is not a balance patch bolted on, it is the thing itself. A player his
 * manager already rates has nothing to ask for, and asking anyway is precisely
 * what turns a man who was happy with him into one who is not. So the sum works
 * out in favour of a footballer who is out of the side and against one who is
 * in it — which makes this the option a benched career reaches for and a settled
 * career leaves alone, without a rule anywhere saying so.
 *
 * Run the arithmetic and it self-limits: at confidence 20 the expected move is
 * strongly positive, at 50 it is close to nothing, and at 80 it is negative
 * enough that a season of nagging costs a place in the side. Nobody had to cap
 * how often he may ask.
 */
export function pushChance(input: { morale: number; form: number; confidence: number }): number {
  return clamp01(
    0.42 +
      (clamp(input.morale, 0, 100) - 50) / 240 +
      (clamp(input.form, 0, 100) - 50) / 260 -
      (clamp(input.confidence, 0, 100) - CONFIDENCE_NEUTRAL) / 160,
  );
}

/**
 * Spend the week.
 *
 * Returns the whole outcome rather than mutating anything, so the career layer
 * owns what is written and this stays a pure function of what it was handed —
 * the same rule every other model in `core` follows.
 *
 * The rng is used by exactly one option. It is passed in regardless so that the
 * caller does not have to know which, and seeded off the calendar slot by the
 * caller so that a week cannot be re-rolled by asking twice.
 */
export function spendWeek(rng: Rng, input: WeekInput): WeekOutcome {
  const base: WeekOutcome = {
    fitness: input.fitness,
    morale: input.morale,
    confidence: input.confidence,
    growth: 1,
    preparation: 0,
    note: '',
  };
  const effort = effortFactor(input.morale);

  switch (input.choice) {
    case 'rest':
      return {
        ...base,
        fitness: clamp(input.fitness + REST_FITNESS, 0, 100),
        note: 'A quiet week. You will be fresh for this one.',
      };

    case 'train':
      return {
        ...base,
        // Never below the floor, and never ABOVE where he started: the gate
        // stops the cost compounding, and must not become a way to recover by
        // training. `min` is what says so, and it is not redundant — without it
        // a player at 60 fitness would come out of a hard week on 80.
        fitness: Math.min(
          input.fitness,
          Math.max(TRAIN_FITNESS_FLOOR, clamp(input.fitness - TRAIN_FITNESS, 0, 100)),
        ),
        growth: round(1 + TRAIN_GROWTH * effort, 3),
        note:
          input.morale >= 60
            ? 'You stayed out after every session, and you enjoyed it.'
            : input.morale <= 35
              ? 'You put the work in. Your heart was not quite in it.'
              : 'A hard week on the training ground.',
      };

    case 'study':
      return {
        ...base,
        preparation: PREPARATION_BONUS,
        note: 'You have watched them all week. You know what is coming.',
      };

    case 'push': {
      const chance = pushChance(input);
      if (rng.chance(chance)) {
        return {
          ...base,
          confidence: clamp(input.confidence + PUSH_CONFIDENCE_GAIN, 0, 100),
          morale: clamp(input.morale + PUSH_MORALE_GAIN, 0, 100),
          note: 'He heard you out, and he took the point.',
        };
      }
      return {
        ...base,
        confidence: clamp(input.confidence - PUSH_CONFIDENCE_LOSS, 0, 100),
        morale: clamp(input.morale - PUSH_MORALE_LOSS, 0, 100),
        note: 'He listened, and told you what he thinks. It did not go well.',
      };
    }
  }
}

/**
 * Is this plan the one for the match about to be played?
 *
 * Asked rather than merely checking a plan exists, for the same reason a
 * transfer request asks whether it is still about the club he is at: a plan
 * that survived the fixture it was made for — through a save written between
 * two matches, or a season that moved on without it — is a week of work being
 * spent twice.
 */
export function planApplies(plan: WeekPlan | null, slotIndex: number): boolean {
  return !!plan && plan.slotIndex === slotIndex;
}
