import { clamp, round } from '../util/math.ts';
import type { Player } from '../player/player.ts';
import type { Team } from '../team/team.ts';
import type { SeasonStats } from './seasonStats.ts';
import type { ClubInterest, SquadRole } from './transfers.ts';
import {
  MAX_WAGE,
  MIN_WAGE,
  clubInterest,
  contractYears,
  offeredWage,
  wageAcceptable,
  wageDemand,
} from './transfers.ts';

/**
 * CONTRACTS
 *
 * Wages used to be a number printed on the offer card and then forgotten. The
 * club's side of the market was fully modelled — what it could afford, what it
 * needed, how it played — and the player's side was not modelled at all, so
 * every decision came down to football and money never once changed an answer.
 *
 * A contract makes it a two-sided deal:
 *
 *   WAGE   is a demand as well as an offer. A club that will not pay what you
 *          expect does not sign you, however much it likes you (the gate lives
 *          in `generateOffers`, because it is a market rule, not a career one).
 *   LENGTH is the clock. Deals get shorter as you age, so the back half of a
 *          career is a series of one-year proofs rather than a settled job.
 *   EXPIRY is the event. When a deal runs out you must resolve the summer, and
 *          if nobody renews you leave on a free — which is the one time the
 *          whole market can afford you.
 *
 * The career can never softlock on a contract: if a summer produces neither a
 * renewal nor an offer, the club puts a reduced deal in front of you rather
 * than leaving you unemployed with no way to play the next season.
 */

export interface Contract {
  clubId: string;
  /** Weekly wage, in thousands. */
  wage: number;
  /** Seasons still to run, INCLUDING the one about to be played. */
  yearsRemaining: number;
  /** Season at the end of which it was signed. */
  signedSeason: number;
  role: SquadRole;
}

/**
 * Terms a club is putting in front of the player to stay where he is.
 * The transfer window shows one of these against any bids, so staying is a
 * deal with its own numbers rather than a cancel button.
 */
export interface ContractOffer {
  clubId: string;
  wage: number;
  years: number;
  role: SquadRole;
  season: number;
  /** The club's interest that produced it, 0-1. */
  interest: number;
  notes: string[];
  /** Set once he has pushed his club on something. See core/career/negotiation.ts. */
  negotiated?: boolean;
  /** Set when the club withdrew the terms rather than improve them. */
  withdrawn?: boolean;
}

/**
 * Interest the current club needs in its own player before offering a new deal.
 *
 * Lower than `OFFER_THRESHOLD`: keeping a player you already have is a much
 * easier decision than buying one, and a club that would not sign him today
 * will still often extend the man already in its dressing room.
 *
 * But not a formality. With the acquisition gates lifted, the question that
 * remains is whether he can still play at this level, and this threshold is
 * pitched just above what a player whose quality has bottomed out can reach —
 * so a footballer who is genuinely finished at his club is released to the
 * fallback deal rather than renewed forever.
 */
export const RENEWAL_THRESHOLD = 0.3;

/** Weeks of wages paid in a season, for banking earnings. */
export const WAGE_WEEKS = 52;

export function createContract(
  player: Player,
  team: Team,
  role: SquadRole,
  season: number,
  prestige = 1,
  years = contractYears(player),
): Contract {
  return {
    clubId: team.id,
    wage: offeredWage(player, team, role, prestige),
    yearsRemaining: years,
    signedSeason: season,
    role,
  };
}

/** A contract that has run its course. The summer must resolve it. */
export function isExpired(contract: Contract): boolean {
  return contract.yearsRemaining <= 0;
}

/** A deal in its final season, so the player can be warned before it matters. */
export function isFinalSeason(contract: Contract): boolean {
  return contract.yearsRemaining === 1;
}

/** What a season on this contract is worth, in millions. */
export function seasonEarnings(contract: Contract): number {
  return round((contract.wage * WAGE_WEEKS) / 1000, 2);
}

/**
 * Run the clock down by one season.
 * Returns the earnings banked, so the caller can add them to a career total.
 */
export function advanceContract(contract: Contract): number {
  const earned = seasonEarnings(contract);
  contract.yearsRemaining = Math.max(0, contract.yearsRemaining - 1);
  return earned;
}

export interface RenewalInput {
  player: Player;
  club: Team;
  stats: SeasonStats;
  season: number;
  prestige: number;
}

/**
 * The current club's offer to keep him, or nothing at all.
 *
 * Reuses the same five questions the market asks, so a club is consistent about
 * its own player: if it would not have him at any price, it does not pretend to
 * want him at renewal time either. The wage gate applies here too — a club that
 * cannot meet his demands loses him, which is precisely how a good season at a
 * small club forces a move.
 */
export function renewalOffer(input: RenewalInput): ContractOffer | null {
  const interest = clubInterest({
    player: input.player,
    team: input.club,
    stats: input.stats,
    prestige: input.prestige,
    // He is already theirs: nothing to buy, and no promise to play him that
    // they are not keeping already.
    retaining: true,
  });
  if (interest.score < RENEWAL_THRESHOLD) return null;

  const wage = offeredWage(input.player, input.club, interest.role, input.prestige);
  if (!wageAcceptable(wage, wageDemand(input.player, input.prestige))) return null;

  return {
    clubId: input.club.id,
    wage,
    years: contractYears(input.player),
    role: interest.role,
    season: input.season,
    interest: interest.score,
    notes: renewalNotes(input.club, interest),
  };
}

function renewalNotes(club: Team, interest: ClubInterest): string[] {
  const notes: string[] = [];
  if (interest.role === 'star') notes.push(`${club.name} are building around you.`);
  else notes.push(`${club.name} want you to stay.`);
  if (interest.need > 0.7) notes.push('They have nobody else who plays your position.');
  if (interest.fit > 0.65) notes.push('You are exactly the footballer they want in this side.');
  return notes;
}

/**
 * The deal a club puts up when nothing else is on the table.
 *
 * Deliberately worse than a negotiated renewal — it is the club knowing you
 * have nowhere to go — but it always exists, so a career can never reach a
 * summer with no way to play on. This is a safety net, not a mechanic, and the
 * screen says as much.
 */
export function fallbackContract(
  player: Player,
  team: Team,
  season: number,
  prestige = 1,
): Contract {
  const role: SquadRole = 'starter';
  const wage = round(clamp(offeredWage(player, team, role, prestige) * 0.7, MIN_WAGE, MAX_WAGE), 1);
  return {
    clubId: team.id,
    wage,
    yearsRemaining: 1,
    signedSeason: season,
    role,
  };
}

/** Take a renewal: same club, new terms. */
export function acceptRenewal(offer: ContractOffer): Contract {
  return {
    clubId: offer.clubId,
    wage: offer.wage,
    yearsRemaining: offer.years,
    signedSeason: offer.season,
    role: offer.role,
  };
}

/** How the deal reads on a screen: "3 years · £42k/week". */
export function describeContract(contract: Contract): string {
  const years = contract.yearsRemaining;
  const term =
    years <= 0 ? 'Expired' : years === 1 ? 'Final season' : `${years} seasons remaining`;
  return `${term} · £${contract.wage}k/week`;
}
