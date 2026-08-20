import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import { simulateFixture } from './league.ts';
import { getCountry } from './countries.ts';

/**
 * THE SUPER CUP
 *
 * One match, before the season starts: last year's champions against last
 * year's cup winners.
 *
 * WHY IT IS WORTH HAVING. Everything else a season won is settled in June and
 * then simply sits on the honours list. The super cup is the only thing that
 * pays a previous season out in football rather than in a line of text — the
 * first fixture of the new year exists because of what you did in the old one,
 * and a player who joins the champions in the summer walks into a final in his
 * first week.
 *
 * It is also the cheapest trophy in the game to reach and the least valuable to
 * win, which is exactly right: one match, no run, and a place in it earned by
 * something you have already been given a trophy for.
 *
 * WHEN THE SAME CLUB DID BOTH. A club that won the league and the cup meets the
 * league RUNNER-UP instead, which is what football does and what stops the
 * fixture being a club playing itself.
 *
 * WHAT IT IS NOT. It is not a knockout with rounds, so it does not use
 * `CupState`: a bracket of one tie would be a bracket in name only, and every
 * screen that walks rounds would have to special-case it. It is a single
 * fixture with a winner, stored as such.
 */

/** The competition's id, as the calendar and the record book know it. */
export const SUPER_CUP = 'superCup';
export type SuperCupKind = typeof SUPER_CUP;

/** What a country calls it. */
export function superCupName(countryId: string): string {
  return `The ${getCountry(countryId).adjective} Super Cup`;
}

/**
 * Who plays it, decided at the end of the season before.
 *
 * Held on the career rather than recomputed, because by the time it is played
 * the season that decided it has been archived and the tables it was read from
 * are gone.
 */
export interface SuperCupTie {
  /**
   * The country whose trophy this is.
   *
   * Stored, because a player who moves abroad in the summer carries the tie
   * with him in the save and is simply not in it — without this the fixture
   * would name itself after whichever league he happened to sign in.
   */
  countryId: string;
  /** Last season's league champions. */
  championId: string;
  /**
   * Last season's national cup winners — or the league runner-up, when the
   * champions won the cup as well.
   */
  challengerId: string;
  /** True when the challenger is there as runner-up rather than as cup winner. */
  challengerIsRunnerUp: boolean;
  /** Set once it has been played. */
  homeGoals?: number;
  awayGoals?: number;
  winnerId?: string;
  /** True when it was level after ninety minutes and settled from the spot. */
  penalties?: boolean;
}

/**
 * Build next season's fixture from this season's results.
 *
 * Returns null when there is nobody to play it — a country whose cup has not
 * produced a winner, or one where the same club would be both sides and there
 * is no runner-up to stand in. Null is a real answer: no super cup is played
 * that year, and the calendar simply skips the slot.
 */
export function nextSuperCup(input: {
  countryId: string;
  /** League table, already sorted — champions first. */
  standings: readonly string[];
  /** Who won the national cup, if anybody has yet. */
  cupWinnerId: string | null;
}): SuperCupTie | null {
  const championId = input.standings[0];
  if (!championId) return null;
  const countryId = input.countryId;

  if (input.cupWinnerId && input.cupWinnerId !== championId) {
    return {
      countryId,
      championId,
      challengerId: input.cupWinnerId,
      challengerIsRunnerUp: false,
    };
  }

  const runnerUp = input.standings[1];
  if (!runnerUp) return null;
  return { countryId, championId, challengerId: runnerUp, challengerIsRunnerUp: true };
}

/**
 * Play it out, for a super cup the player is not in.
 *
 * The champions are at home. There is no neutral venue in the model and giving
 * the advantage to the league winners is both the simplest rule and the one
 * that reads as a reward.
 */
export function resolveSuperCup(
  rng: Rng,
  tie: SuperCupTie,
  champion: Team,
  challenger: Team,
): SuperCupTie {
  if (tie.winnerId) return tie;

  const { homeGoals, awayGoals } = simulateFixture(rng, champion, challenger);
  if (homeGoals !== awayGoals) {
    return {
      ...tie,
      homeGoals,
      awayGoals,
      winnerId: homeGoals > awayGoals ? tie.championId : tie.challengerId,
      penalties: false,
    };
  }

  // One match cannot end level any more than a cup tie can. The shootout model
  // is the shared one — see core/career/shootout.ts for why it is barely
  // weighted by strength.
  return {
    ...tie,
    homeGoals,
    awayGoals,
    winnerId: rng.chance(0.5) ? tie.championId : tie.challengerId,
    penalties: true,
  };
}

/** Record a super cup the player took part in. */
export function applySuperCupResult(
  tie: SuperCupTie,
  input: { clubId: string; goalsFor: number; goalsAgainst: number; shootoutWinnerId?: string },
): SuperCupTie {
  const isChampion = tie.championId === input.clubId;
  const homeGoals = isChampion ? input.goalsFor : input.goalsAgainst;
  const awayGoals = isChampion ? input.goalsAgainst : input.goalsFor;

  if (homeGoals !== awayGoals) {
    return {
      ...tie,
      homeGoals,
      awayGoals,
      winnerId: homeGoals > awayGoals ? tie.championId : tie.challengerId,
      penalties: false,
    };
  }
  return {
    ...tie,
    homeGoals,
    awayGoals,
    // Level, so it went to penalties. A shootout he took decides it; one he
    // skipped is rolled by the caller, exactly as a cup tie is.
    winnerId: input.shootoutWinnerId ?? tie.championId,
    penalties: true,
  };
}

/** Is this club in the fixture at all? */
export function playsInSuperCup(tie: SuperCupTie | null, clubId: string): boolean {
  return !!tie && (tie.championId === clubId || tie.challengerId === clubId);
}

/** The other club, from one side's point of view. */
export function superCupOpponent(tie: SuperCupTie, clubId: string): string {
  return tie.championId === clubId ? tie.challengerId : tie.championId;
}
