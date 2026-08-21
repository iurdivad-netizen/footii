import { describe, expect, it } from 'vitest';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import {
  acceptLoan,
  endSeason,
  missMatch,
  prepareNextMatch,
  recordPlayerMatch,
  startCareer,
  teamSheet,
} from '../src/simulation/CareerService.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { fixturesFor, seasonComplete } from '../src/core/career/career.ts';
import { locateClub } from '../src/core/career/countries.ts';

/**
 * A LOAN, END TO END
 *
 * The risky part of a loan is not the loan, it is the seam: everything settled
 * before the return has to read the club he was at, and everything built after
 * it has to read the club that owns him.
 */
const lookup = (id: string) => getTeam(id);

function prospect() {
  return startCareer({
    player: createPlayer({
      name: 'Prospect',
      position: 'ST',
      age: 18,
      baseAttribute: 58,
      reputation: 40,
      potentialAbility: 88,
      attributes: {},
    }),
    clubId: 'castleford-royals',
    teams: TEAMS,
    seed: 'loan-career',
  });
}

/** Play a whole season, sitting out anything he is not picked for. */
function playSeason(state: CareerState) {
  while (!seasonComplete(state)) {
    prepareNextMatch(state, lookup);
    if (state.injury || !teamSheet(state).selected) {
      missMatch(state, lookup);
      continue;
    }
    const stats = createMatchStats();
    stats.minutes = 90;
    stats.goals = 1;
    recordPlayerMatch(
      state,
      {
        stats,
        rating: 7,
        playerTeamScore: 1,
        opponentScore: 1,
        fitnessAtEnd: Math.max(0, state.fitness - 33),
      },
      lookup,
    );
  }
}

describe('going out on loan', () => {
  it('offers one to a young player who spent the season watching', () => {
    const state = prospect();
    playSeason(state);
    const outcome = endSeason(state, lookup);
    expect(outcome.loanOffer).toBeTruthy();
    expect(outcome.loanOffer!.clubId).not.toBe(state.clubId);
  });

  it('moves where he plays without moving who pays him', () => {
    const state = prospect();
    playSeason(state);
    const offer = endSeason(state, lookup).loanOffer!;
    const parent = state.clubId;

    acceptLoan(state, offer, lookup);

    expect(state.clubId).toBe(offer.clubId);
    // The one invariant a loan breaks, and the thing that makes it a loan.
    expect(state.contract.clubId).toBe(parent);
    expect(state.loan!.parentClubId).toBe(parent);
  });

  it('puts him in the loan club league, with its fixtures', () => {
    const state = prospect();
    playSeason(state);
    const offer = endSeason(state, lookup).loanOffer!;
    acceptLoan(state, offer, lookup);

    expect(state.leagueTeamIds).toContain(offer.clubId);
    expect(fixturesFor(state, state.clubId).length).toBeGreaterThan(0);
    expect(locateClub(state.leagues, state.clubId)?.countryId).toBe(state.countryId);
  });

  it('gives him a new dressing room at the loan club', () => {
    const state = prospect();
    playSeason(state);
    const before = state.rival!.name;
    const offer = endSeason(state, lookup).loanOffer!;
    acceptLoan(state, offer, lookup);
    expect(state.rival!.name).not.toBe(before);
    expect(state.teammates.length).toBeGreaterThan(0);
  });

  it('actually gets him games, which is the only reason to go', () => {
    const state = prospect();
    playSeason(state);
    const benchedAtParent = state.leagueStats.matches;
    const offer = endSeason(state, lookup).loanOffer!;
    acceptLoan(state, offer, lookup);
    playSeason(state);

    expect(state.leagueStats.matches).toBeGreaterThan(benchedAtParent);
    // He is at a club that took him to play him, so he plays most of it.
    const share = state.leagueStats.matches / fixturesFor(state, state.clubId).length;
    expect(share).toBeGreaterThan(0.5);
  });

  it('sends him back to the club that owns him at the end of it', () => {
    const state = prospect();
    playSeason(state);
    const offer = endSeason(state, lookup).loanOffer!;
    const parent = state.contract.clubId;
    acceptLoan(state, offer, lookup);
    playSeason(state);
    endSeason(state, lookup);

    expect(state.loan).toBeNull();
    expect(state.clubId).toBe(parent);
    expect(state.leagueTeamIds).toContain(parent);
    expect(fixturesFor(state, parent).length).toBeGreaterThan(0);
  });

  it('credits the loan season to the loan club in the history', () => {
    // Everything above the seam settles the season he actually played.
    const state = prospect();
    playSeason(state);
    const offer = endSeason(state, lookup).loanOffer!;
    acceptLoan(state, offer, lookup);
    playSeason(state);
    const outcome = endSeason(state, lookup);
    expect(outcome.record.clubId).toBe(offer.clubId);
  });

  it('closes the window, so he cannot be loaned and sold in one summer', () => {
    const state = prospect();
    playSeason(state);
    const offer = endSeason(state, lookup).loanOffer!;
    acceptLoan(state, offer, lookup);
    expect(state.offers).toHaveLength(0);
    expect(state.loanOffer).toBeNull();
  });

  it('stops offering loans once he is too old for them to help', () => {
    const state = prospect();
    state.player.age = 30;
    playSeason(state);
    expect(endSeason(state, lookup).loanOffer).toBeNull();
  });
});
