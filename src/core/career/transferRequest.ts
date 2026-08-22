/**
 * ASKING TO LEAVE
 *
 * The other half of the transfer market, and the half that was missing.
 *
 * Everything about a move used to be decided by other people. Clubs bid or they
 * did not; the player answered yes or no in July and then waited another year.
 * Preferences softened that — he could say where he would go before being asked
 * — but they are still a position taken in advance of somebody else's decision.
 * There was no way to make anything happen.
 *
 * A transfer request is the one lever that is entirely his. It does not ask the
 * club's permission, because in football it does not: a player who wants to go
 * says so, and what the club decides is not whether he said it but what to do
 * about it.
 *
 * WHY IT NEEDED ROTATION TO EXIST. On the old model, where the player started
 * every match there was, a transfer request would have been free — a button
 * that made offers likelier and cost nothing, so the correct play would have
 * been to press it every summer and never press it back. Selection is what
 * gives it a price. The manager who has to pick between you and the man
 * competing for your shirt now knows you have asked to leave, and he has a
 * ready-made reason to pick the other one. See core/career/squad.ts.
 *
 * So the deal is legible and it is genuinely two-sided:
 *
 *   YOU GET     more clubs bidding, and a fee low enough that more of them can
 *               afford you. A club that knows a player wants out is negotiating
 *               from a worse position and prices accordingly.
 *   YOU PAY     your place in the side while it stands, and any prospect of the
 *               club offering you new terms. You asked to go; they have stopped
 *               planning around you.
 *
 * IT CAN BE WITHDRAWN, and withdrawing costs nothing extra — which is not
 * generosity, it is honesty about what has already been spent. The matches you
 * were left out of while it stood are gone, and no refund can reach them. A
 * separate lingering penalty on top would be punishing the same decision twice.
 */

/**
 * A request that has been handed in and not yet answered by a move.
 *
 * It names the club it was handed TO, so it cannot follow him through a
 * transfer: a request is a thing you said to one set of people, and arriving at
 * a new club still asking to leave it would be a grudge nobody has earned yet.
 */
export interface TransferRequest {
  /** The club he asked to leave. */
  clubId: string;
  /** Season it was handed in, so the hub can say how long he has been asking. */
  season: number;
}

/**
 * How much keener clubs are on a player who has asked to leave.
 *
 * A multiplier on interest, and bigger than the favoured-country nudge because
 * it is a different kind of fact. A player wanting to play in Spain is a
 * preference Spanish clubs may never hear about; a player who has handed in a
 * transfer request is public information.
 *
 * What it does NOT do on its own is produce more offers, and that is worth
 * stating because it is the obvious thing to assume. Offers are capped, and for
 * anybody with a season worth bidding on the cap binds before the interest
 * threshold does — so a multiplier under a full cap changes WHICH clubs come
 * rather than HOW MANY, skewing the list toward the ones that were keenest.
 * Widening it is done by raising the cap; see `REQUESTED_MAX_OFFERS`.
 */
export const REQUEST_INTEREST_BOOST = 1.3;

/**
 * What the club will take for him, as a fraction of the fee it would have held
 * out for.
 *
 * The mechanically important half of the boost, and easy to miss: interest
 * decides who bids, but the FEE decides who can afford to. A club that knows
 * the player wants out has lost the ability to say no, so the discount widens
 * the market at the bottom — which is exactly where a player who cannot get a
 * game needs it to widen.
 */
export const REQUEST_FEE_DISCOUNT = 0.8;

/**
 * How much less likely the manager is to pick him while it stands.
 *
 * Applied in `selectionChance` on the same scale as the squad-role bias, and
 * deliberately worse than the gap between `starter` and `squad`. Being told you
 * want to leave is a bigger thing than what your contract calls you; a club
 * that is about to lose you has every reason to give the shirt to the man who
 * will still be there in August.
 *
 * It is a bias rather than a bar. A player good enough to be undroppable is
 * still undroppable — a manager fighting for a title does not leave his best
 * footballer out to make a point — which is what keeps this a cost rather than
 * an exile, and what makes handing one in at a club you are too good for a
 * genuinely different decision from handing one in at a club you are not.
 */
export const REQUEST_SELECTION_BIAS = -0.22;

/** Hand one in. Returns the request; the caller owns where it is stored. */
export function handInRequest(clubId: string, season: number): TransferRequest {
  return { clubId, season };
}

/**
 * Is this request still about the club he is at?
 *
 * The guard that makes a request self-clearing. Anything reading one has to ask
 * this rather than merely checking it exists, because a request that survived a
 * transfer — through a save written mid-window, or a loan that sent him
 * somewhere else and brought him back — must not go on costing him his place at
 * a club he never asked to leave.
 */
export function requestStands(
  request: TransferRequest | null | undefined,
  clubId: string,
): boolean {
  return !!request && request.clubId === clubId;
}

/** How it reads on the hub, given how long it has been standing. */
export function describeRequest(request: TransferRequest, season: number): string {
  const seasons = season - request.season;
  if (seasons <= 0) return 'You have asked to leave. The club knows, and so does everybody else.';
  if (seasons === 1) return 'You have been asking to leave since last summer.';
  return `You have been asking to leave for ${seasons} seasons.`;
}
