import type { Rng } from '../rng.ts';
import type { SquadRole } from './transfers.ts';
import { clamp, round } from '../util/math.ts';

/**
 * SAYING SOMETHING ABOUT THE DEAL
 *
 * A contract used to be take-it-or-leave-it. A club made an offer, you accepted
 * it or you did not, and the wage, the length and the squad role were things
 * that happened TO the player rather than things he had a position on. That is
 * the one part of a career where a footballer has real leverage, and it was the
 * one part the game did not model.
 *
 * So you can push, ONCE, on one of the three things. Once, deliberately: a deal
 * you can renegotiate repeatedly is a slot machine, not a decision — you would
 * simply keep asking until it improved, and the ask would cost nothing.
 *
 * And it can cost something. A club that is only just interested can walk away
 * rather than improve, which is what makes the ask a real decision instead of a
 * free roll. How likely that is comes from its interest and nothing else: the
 * side desperate for you will take being pushed, and the side that was half
 * looking elsewhere will not.
 */

/** What he is asking them to move on. */
export type NegotiationAsk = 'wage' | 'years' | 'role';

export const NEGOTIATION_LABELS: Record<NegotiationAsk, string> = {
  wage: 'Ask for more money',
  years: 'Ask for a longer deal',
  role: 'Ask to be promised more',
};

/**
 * The part of an offer a negotiation touches.
 *
 * Structural rather than named, so the same rules apply to a bid from another
 * club and to your own club's renewal. They are different objects with
 * different other fields, and identical in every way that matters here.
 */
export interface Negotiable {
  wage: number;
  years: number;
  role: SquadRole;
  /** The club's interest that produced it, 0-1. */
  interest: number;
  notes: string[];
  /** Set once he has pushed. One ask per deal. */
  negotiated?: boolean;
  /** Set when the club walked away rather than improve. */
  withdrawn?: boolean;
}

export type NegotiationOutcome = 'improved' | 'refused' | 'withdrawn';

export interface NegotiationResult<T extends Negotiable> {
  outcome: NegotiationOutcome;
  /** The deal as it now stands. Unchanged on a refusal. */
  deal: T;
  /** What the club said, in one line. */
  message: string;
}

/** How much each ask costs him, in the club's willingness to agree. */
const ASK_COST: Record<NegotiationAsk, number> = {
  wage: 0.15,
  years: 0.25,
  // The hardest, and rightly. Money is a number and a promise about playing
  // time is a plan for the season.
  role: 0.42,
};

/** How much more money is worth asking for. */
export const WAGE_RISE = 0.18;

/** Nobody signs longer than this, however well it goes. */
export const MAX_YEARS = 5;

const ROLE_LADDER: readonly SquadRole[] = ['squad', 'starter', 'star'];

/** The next rung up, or null when he is already top of the tree. */
export function promotedRole(role: SquadRole): SquadRole | null {
  const index = ROLE_LADDER.indexOf(role);
  return index >= 0 && index < ROLE_LADDER.length - 1 ? ROLE_LADDER[index + 1]! : null;
}

/**
 * Can this be asked at all?
 *
 * Separate from the roll, because a button that cannot do anything should not
 * be offered rather than offered and then refused — "they will not make it six
 * years" is a rule, not an opinion, and the player should not have to spend his
 * one ask to discover it.
 */
export function canAsk(deal: Negotiable, ask: NegotiationAsk): boolean {
  if (deal.negotiated || deal.withdrawn) return false;
  if (ask === 'years') return deal.years < MAX_YEARS;
  if (ask === 'role') return promotedRole(deal.role) !== null;
  return true;
}

/**
 * How likely the club is to say yes.
 *
 * Interest is the whole story. A club at the threshold of bidding barely wants
 * him and will not be pushed; a club that has decided he is the signing of its
 * summer will find the money.
 */
export function agreementChance(deal: Negotiable, ask: NegotiationAsk): number {
  return clamp(deal.interest * 1.15 - ASK_COST[ask], 0.05, 0.92);
}

/**
 * How likely the club is to walk away rather than negotiate.
 *
 * Only ever a risk for a club that was lukewarm. Deliberately capped well below
 * the refusal rate: the common answer to being pushed is no, not goodbye, and a
 * summer where asking about money regularly lost you the move would teach
 * players never to ask, which is the state this replaced.
 */
export function withdrawalChance(deal: Negotiable, ask: NegotiationAsk): number {
  return clamp(0.26 - deal.interest * 0.3 + ASK_COST[ask] * 0.25, 0.01, 0.22);
}

/**
 * Push the club on one thing.
 *
 * Returns a NEW deal rather than mutating, so a caller holding the old one
 * still has it — the transfer screen renders both the offer and the answer, and
 * a refusal has to be able to show what was refused.
 */
export function negotiate<T extends Negotiable>(
  rng: Rng,
  deal: T,
  ask: NegotiationAsk,
): NegotiationResult<T> {
  if (!canAsk(deal, ask)) {
    return { outcome: 'refused', deal, message: 'There is nothing left to ask for on this one.' };
  }

  // The order matters: walking away is checked first, because a club that has
  // decided to leave does not then consider the request.
  if (rng.chance(withdrawalChance(deal, ask))) {
    return {
      outcome: 'withdrawn',
      deal: { ...deal, negotiated: true, withdrawn: true },
      message: 'They take the offer off the table rather than be haggled with.',
    };
  }

  if (!rng.chance(agreementChance(deal, ask))) {
    return {
      outcome: 'refused',
      deal: { ...deal, negotiated: true },
      message: refusal(ask),
    };
  }

  return { outcome: 'improved', deal: improve(deal, ask), message: agreement(ask) };
}

function improve<T extends Negotiable>(deal: T, ask: NegotiationAsk): T {
  const improved: T = { ...deal, negotiated: true };
  if (ask === 'wage') improved.wage = round(deal.wage * (1 + WAGE_RISE), 1);
  if (ask === 'years') improved.years = Math.min(MAX_YEARS, deal.years + 1);
  if (ask === 'role') improved.role = promotedRole(deal.role) ?? deal.role;
  return improved;
}

function agreement(ask: NegotiationAsk): string {
  if (ask === 'wage') return 'They find the money. The wage goes up.';
  if (ask === 'years') return 'They agree to a longer deal.';
  return 'They agree to a bigger role in the side.';
}

function refusal(ask: NegotiationAsk): string {
  if (ask === 'wage') return 'The wage is the wage. They will not move on it.';
  if (ask === 'years') return 'They will not commit for longer than they have offered.';
  return 'They will not promise you more than they already have. You would have to earn it.';
}
