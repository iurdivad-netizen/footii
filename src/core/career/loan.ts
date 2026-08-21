import type { Player } from '../player/player.ts';
import type { Team } from '../team/team.ts';
import type { SquadRole } from './transfers.ts';
import { effectiveAbility, squadLevel, squadRole } from './transfers.ts';

/**
 * LOANS
 *
 * What a young footballer does when he cannot get in the side.
 *
 * This exists because rotation made it necessary. Before there was competition
 * for the shirt, a season at a club above your level was indistinguishable from
 * a season at a club at it — you played every match either way — so a loan had
 * nothing to solve. Now a nineteen-year-old can sign for the champions, be told
 * honestly that he is cover, and spend a year watching. A loan is the way out
 * of that, and it is the way real football solves the same problem.
 *
 * It is deliberately NOT a transfer. The contract does not move, the wage does
 * not change, and the parent club takes him back in a year. What moves is the
 * only thing that was wrong: where he plays.
 */

/** A club's offer to take the player for a season. */
export interface LoanOffer {
  clubId: string;
  clubName: string;
  countryId: string;
  /** The division he would be playing in. */
  division: number;
  /** What he would be there — always better than what he has, or it is no use. */
  role: SquadRole;
  /** One line on why this club, for the summer screen. */
  pitch: string;
}

/** A loan being served. */
export interface Loan {
  /** The club that holds the contract and takes him back. */
  parentClubId: string;
  /** Resolved at the time, so a later data change cannot make it unreadable. */
  parentClubName: string;
  clubId: string;
  clubName: string;
  /**
   * What he is AT THE LOAN CLUB.
   *
   * Carried on the loan rather than read off the contract, because the contract
   * belongs to the parent and says what he is there — cover, usually, since
   * that is what sent him away. Selection reading the parent's word for him
   * while he is somewhere else would leave him on the bench at a club that took
   * him specifically to play him, which is the loan failing at the one job it
   * has.
   */
  role: SquadRole;
  /** The season it is being served in. */
  season: number;
}

/** Nobody over this age goes out to get games; they are sold instead. */
export const LOAN_MAX_AGE = 23;

/**
 * The most of a league season he can have played and still need a loan.
 *
 * Above this he is in the side often enough that a year away would cost him
 * more than it gained. It is measured on LEAGUE football for the same reason
 * reputation and the awards gate are: it is the only competition with a fixture
 * count known in advance, so it is the only one where "how much did he play"
 * has a denominator.
 */
export const LOAN_PLAYING_TIME = 0.45;

/**
 * Should anybody be offering this player a season somewhere else?
 *
 * Three conditions, and all three are needed. Young enough that a year of
 * football is worth more than a year of training; short of games; and at a club
 * where that is unlikely to change, which is what `squadRole` says.
 */
export function needsLoan(
  player: Player,
  club: Team,
  input: { leagueMatches: number; seasonLength: number },
): boolean {
  if (player.age > LOAN_MAX_AGE) return false;
  const played =
    input.seasonLength > 0 ? input.leagueMatches / input.seasonLength : 1;
  if (played > LOAN_PLAYING_TIME) return false;
  // A club that considers him a first-team player is not one to run away from
  // after a quiet year — being out of the side is then a fight worth having.
  return squadRole(player, club) === 'squad';
}

/**
 * Would this club be a step down far enough to guarantee football?
 *
 * The bar is "he would walk into this side", because a loan that repeats the
 * problem is worse than no loan: another year of watching, and a year older.
 * But not so far down that it is a waste — a season in a league he is twenty
 * points too good for teaches him nothing and impresses nobody.
 */
export function suitableLoanClub(player: Player, club: Team): boolean {
  const gap = effectiveAbility(player) - squadLevel(club);
  return gap >= 2 && gap <= 18;
}

/**
 * Rank the clubs that would take him, best first.
 *
 * "Best" is the strongest club he would still be a starter at, because that is
 * the loan worth having: the hardest football he can be sure of playing. A
 * bigger step down is easier and worth less.
 */
export function rankLoanClubs(player: Player, clubs: readonly Team[]): Team[] {
  return clubs
    .filter((club) => suitableLoanClub(player, club))
    .sort((a, b) => squadLevel(b) - squadLevel(a));
}

/** How a loan club sells itself, given what he would be there. */
export function loanPitch(player: Player, club: Team): string {
  const gap = effectiveAbility(player) - squadLevel(club);
  if (gap >= 12) {
    return `${club.name} would build their season around you, and you would play every week.`;
  }
  if (gap >= 6) {
    return `${club.name} want you starting, and they are a level you can hold down.`;
  }
  return `${club.name} would give you the shirt, and they are as good a side as you could ask for.`;
}

/** What he would be at a loan club — always a step up in standing. */
export function loanRole(player: Player, club: Team): SquadRole {
  return squadRole(player, club) === 'star' ? 'star' : 'starter';
}

/**
 * One line for the hub while he is away.
 *
 * Names both clubs, because the whole point of a loan is that he belongs to one
 * and plays for the other, and a screen that showed only where he is playing
 * would look like he had been sold.
 */
export function loanReport(loan: Loan): string {
  return `On loan at ${loan.clubName} from ${loan.parentClubName}.`;
}
