import { clamp, round } from '../util/math.ts';
import type { SquadRole } from './transfers.ts';

/**
 * WHAT THE MANAGER THINKS OF YOU
 *
 * A single number, 0-100, held per club: how far the man picking the side
 * currently rates you. It is the club's opinion, not yours.
 *
 * WHY IT EXISTS. Morale has been on the hub since there was a hub, and until
 * now it did exactly one thing: contribute `TIMER_WEIGHTS.morale` — 0.08 — to
 * the decision window. Across the whole 0-100 range that is 0.53 seconds out of
 * ten. A player could go from delighted to despairing and never see the game
 * change, which makes a number on a screen that is not a mechanic. Rotation is
 * what fixed the other half of this problem for `contract.role`, and it is the
 * same fix: the thing that gives a mood teeth is somebody whose opinion decides
 * whether you play.
 *
 * WHY IT IS SEPARATE FROM MORALE rather than replacing it. They are two facts
 * about different people and they can disagree, which is the whole reason to
 * keep both:
 *
 *   MORALE      is his. It follows results, because a footballer in a winning
 *               side is happy whatever the manager makes of him.
 *   CONFIDENCE  is the manager's. It follows PERFORMANCES, weighted by how much
 *               the match mattered, because that is what a manager is judging.
 *
 * So a good player in a bad side keeps his manager's trust while his mood sinks,
 * and a passenger in a winning side is cheerful and about to be dropped. Neither
 * would be sayable with one number.
 *
 * WHAT IT READS INTO. Three places, and deliberately no more:
 *
 *   - SELECTION, alongside the squad role and the transfer request, on the same
 *     scale they use (see `CONFIDENCE_SELECTION_BIAS`).
 *   - THE RENEWAL, because a club that has stopped believing in you is a club
 *     that lets your contract run down.
 *   - MORALE, which is the coupling that gives the older number its job at
 *     last: being trusted lifts him, being frozen out grinds him down.
 *
 * WHAT IT DELIBERATELY DOES NOT READ. A transfer request. That already has a
 * measured price in selection (`REQUEST_SELECTION_BIAS`) and at the negotiating
 * table, and charging it a second time here would make one decision cost twice
 * — which is the exact mistake the request's own notes warn about. A manager
 * whose player has asked to leave thinks less of him; the game already says so
 * in the only place it changes anything.
 *
 * IT BELONGS TO THE CLUB, like the rival and the teammates. Signing somewhere
 * else does not carry a grudge or a reputation across: the new manager has his
 * own view, and it starts from what the club just promised you.
 */

/** Neutral. A manager who has not made his mind up. */
export const CONFIDENCE_NEUTRAL = 50;

/**
 * Where a manager starts, by what the club called you when it signed you.
 *
 * The third job `contract.role` now does — it already sets what the rival is
 * allowed to be, and biases selection — and it is the one that makes the term
 * mean something on day one rather than in March. A club that paid for a star
 * begins by believing in him; a club that signed cover begins by not.
 *
 * Deliberately short of the extremes. Arriving as a star does not make you
 * undroppable and arriving as cover does not make you unpickable; both are a
 * head start on an argument that is settled by playing.
 */
export const STARTING_CONFIDENCE: Record<SquadRole, number> = {
  star: 64,
  starter: 52,
  squad: 40,
};

export function startingConfidence(role: SquadRole): number {
  return STARTING_CONFIDENCE[role];
}

/**
 * How much a manager's view is worth in selection, at either extreme.
 *
 * On the same scale as `ROLE_BIAS` and `REQUEST_SELECTION_BIAS`, because they
 * are added together and a scale nobody shares is a scale nobody can reason
 * about. Sized between the two on purpose: what the manager currently makes of
 * you matters more than the difference between `starter` and `squad` in the
 * contract, and less than announcing you want to leave.
 *
 * At 0 confidence this is -0.12 and at 100 it is +0.12, so the full range of a
 * manager's opinion is worth slightly less than the gap between being signed as
 * a star and being signed as cover. That is the right size: a manager can talk
 * himself into and out of a player, but he cannot make a bad one good.
 */
export const CONFIDENCE_SELECTION_BIAS = 0.12;

/** The selection term, -CONFIDENCE_SELECTION_BIAS to +CONFIDENCE_SELECTION_BIAS. */
export function confidenceBias(confidence: number): number {
  return ((clamp(confidence, 0, 100) - CONFIDENCE_NEUTRAL) / 50) * CONFIDENCE_SELECTION_BIAS;
}

/**
 * The importance a match is assumed to have had when nobody said.
 *
 * A league match's own weight, from `matchImportance`, and stated as a constant
 * rather than imported so that the value a caller falls back to is visible at
 * the point it is used. Every caller written before confidence existed was
 * playing league football as far as this number is concerned, and a league
 * match is the honest default for one that arrives unlabelled.
 */
export const DEFAULT_MATCH_IMPORTANCE = 0.6;

export interface ConfidenceMatchInput {
  confidence: number;
  /** Match rating, 1-10. */
  rating: number;
  /** 1 win, 0 draw, -1 defeat. */
  result: number;
  /** How much the match mattered to the club, 0-1. See `matchImportance`. */
  importance: number;
}

/**
 * Move his manager's view on after a match he played.
 *
 * Rating first and result second, which is the opposite weighting to morale and
 * the reason both exist. A manager watching his side lose 3-0 does not think
 * less of the one man who played well; a supporter — and the player himself —
 * feels the scoreline regardless.
 *
 * WEIGHTED BY IMPORTANCE, which is the part that makes this more than a slower
 * copy of form. A hatful against nobody in the second round of the league cup
 * is not the evidence a European night is, so the same performance moves this
 * number between roughly a third and a full share depending on where it
 * happened. That is also what stops rotation from being self-confirming: the
 * matches a fringe player is given are the cheap ones, and doing well in them
 * climbs slowly rather than not at all.
 *
 * It moves more slowly than form in every case. Form is what he is doing;
 * this is what somebody has decided about him, and opinions are stickier than
 * evidence.
 */
export function confidenceAfterMatch(input: ConfidenceMatchInput): number {
  // The same rating-to-0-100 mapping form uses, so a 7.0 means the same thing
  // to both numbers and the two can be read side by side.
  const performance = clamp((input.rating - 4) * 16.5, 0, 100);
  // The result is worth something, but a quarter of what the performance is: a
  // manager picks the side, so he knows who was responsible for what.
  const target = clamp(performance + input.result * 5, 0, 100);
  const weight = 0.1 + 0.12 * clamp(input.importance, 0, 1);
  return round(clamp(input.confidence * (1 - weight) + target * weight, 0, 100), 1);
}

/**
 * Move it on after a match he was not in.
 *
 * Toward neutral, never away from it, and that is a deliberate refusal to build
 * a spiral. Being left out is already the punishment for low confidence; making
 * it also the cause of lower confidence would lock the way out behind the thing
 * being punished — the same trap `missMatch` avoids for form, for the same
 * reason and with the same shape.
 *
 * So a manager who has stopped picking you slowly stops having a view. That is
 * both the merciful reading and the true one: a player nobody has watched for
 * six weeks is a question rather than an answer, and the answer comes back the
 * moment he plays.
 *
 * An injury does it faster than an omission. Nobody is being judged for a torn
 * hamstring, whereas a fit man left out is still being weighed against the
 * player in his shirt every week.
 */
export function confidenceAfterAbsence(confidence: number, injured: boolean): number {
  const pull = injured ? 0.1 : 0.06;
  return round(clamp(confidence * (1 - pull) + CONFIDENCE_NEUTRAL * pull, 0, 100), 1);
}

/**
 * How far the manager's view drags the player's mood.
 *
 * The coupling that finally gives morale something to be about. Morale still
 * follows results first — that is what it has always been — but a player being
 * told every week that he is trusted is a happier man than the same player at
 * the same club in the same league position who is not.
 *
 * ±12 on a target that sits between 34 and 78, so it is a real term and not the
 * decisive one. Being frozen out at a winning club is still better than being
 * adored at a losing one, which is the correct ordering: footballers say so.
 */
export function moraleShift(confidence: number): number {
  return ((clamp(confidence, 0, 100) - CONFIDENCE_NEUTRAL) / 50) * 12;
}

export interface ConfidenceTier {
  label: string;
  /** One line for the hub, in the manager's voice rather than a number's. */
  note: string;
}

/**
 * What the number means, in words.
 *
 * The hub shows this rather than the figure, for the same reason the team-sheet
 * note exists: the player cannot see the arithmetic, so the thing he is told
 * has to be legible from the outside and honest about which way it is pointing.
 * A band he can watch move is a mechanic; a two-digit number beside `Morale` is
 * what this feature was written to stop being.
 */
export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence < 25) {
    return { label: 'Out of favour', note: 'He is picking around you.' };
  }
  if (confidence < 42) {
    return { label: 'Unconvinced', note: 'You have not persuaded him yet.' };
  }
  if (confidence < 58) {
    return { label: 'Watching', note: 'He has not made his mind up about you.' };
  }
  if (confidence < 75) {
    return { label: 'Trusted', note: 'He wants you in the side.' };
  }
  return { label: 'Untouchable', note: 'He builds the team around you.' };
}

/**
 * What a manager's view does to his club's willingness to keep you.
 *
 * A multiplier on the interest that decides whether a renewal is offered at
 * all. Renewal already asks the same five questions the market asks, which is
 * what keeps a club honest about its own player — this is the sixth, and the
 * only one that could not be asked before, because it is the one thing about a
 * player that is true at his club and nowhere else.
 *
 * It is the mechanism behind a real and previously unsayable career: the good
 * footballer his manager has stopped fancying, whose contract runs down while
 * clubs elsewhere are still interested. The market sees the player; only the
 * club sees the dressing room.
 */
export function confidenceInterest(confidence: number): number {
  return 1 + ((clamp(confidence, 0, 100) - CONFIDENCE_NEUTRAL) / 50) * 0.2;
}

/**
 * Whether the club's word for him should change when it puts up new terms.
 *
 * The other half of the renewal, and the half that is worth having: a squad
 * player who has spent a season being undroppable should be offered a starter's
 * deal, and being offered one is how the game says the argument was won. It
 * moves at most one step, and only from the ends of the range, so it is a
 * verdict on a season rather than a slider.
 */
export function renewalRole(role: SquadRole, confidence: number): SquadRole {
  if (confidence >= 78) {
    if (role === 'squad') return 'starter';
    if (role === 'starter') return 'star';
    return role;
  }
  if (confidence <= 25) {
    if (role === 'star') return 'starter';
    if (role === 'starter') return 'squad';
    return role;
  }
  return role;
}
