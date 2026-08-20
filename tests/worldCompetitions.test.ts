import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { nextMatch, seasonComplete } from '../src/core/career/career.ts';
import {
  cupWinner,
  endSeason,
  europeanState,
  prepareNextMatch,
  recordPlayerMatch,
  roundsReached,
  startCareer,
  stillInCup,
  worldCountries,
  worldCup,
} from '../src/simulation/CareerService.ts';
import { CUP_KINDS, CUP_ROUNDS } from '../src/core/career/cups.ts';
import { EUROPEAN_TIERS } from '../src/core/career/europe.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';

/**
 * THE WORLD'S OTHER COMPETITIONS
 *
 * Everything here is about the same question: can the player LOOK at a
 * competition, and does what he sees agree with the season that is actually
 * being played? A cup he cannot see may as well not exist, and one that shows
 * him a winner in October or a frozen bracket in April is worse than one he
 * cannot see at all.
 */

const lookup = (id: string) => getTeam(id);

function striker(overrides: Partial<Player> = {}): Player {
  return {
    ...createPlayer({
      name: 'Browser',
      position: 'ST',
      age: 22,
      experience: 40,
      baseAttribute: 60,
      reputation: 45,
      potentialAbility: 80,
      attributes: { finishing: 66, awareness: 60, composure: 58, decisionMaking: 56 },
    }),
    ...overrides,
  };
}

/** A career at a named club, ready to be walked through a season. */
function career(seed = 'world'): CareerState {
  return startCareer({ player: striker(), clubId: 'stapleton-vale', teams: TEAMS, seed });
}

/**
 * Play one match with a fixed scoreline.
 *
 * A heavy defeat is the point in most of these: losing a cup tie is how a
 * player stops being in a competition, which is the case the whole catch-up
 * exists for.
 */
function playMatch(state: CareerState, goalsFor = 0, goalsAgainst = 3): void {
  prepareNextMatch(state, lookup);
  const stats = createMatchStats();
  stats.minutes = 90;
  stats.goals = goalsFor;
  recordPlayerMatch(
    state,
    {
      stats,
      rating: 6,
      playerTeamScore: goalsFor,
      opponentScore: goalsAgainst,
      fitnessAtEnd: 50,
      skipped: true,
    },
    lookup,
  );
}

/** Play until the given predicate holds, or the season runs out. */
function playUntil(state: CareerState, done: (s: CareerState) => boolean): void {
  let guard = 0;
  while (!seasonComplete(state) && !done(state) && guard++ < 120) playMatch(state);
}

describe('browsing another country\'s cup', () => {
  it('shows a bracket that has got as far as the season has', () => {
    const state = career();
    // Nothing has been played, so nothing has been drawn anywhere.
    expect(worldCup(state, 'spain', 'nationalCup', lookup)!.rounds).toHaveLength(0);

    playUntil(state, (s) => roundsReached(s, 'nationalCup') >= 1);
    const cup = worldCup(state, 'spain', 'nationalCup', lookup)!;
    expect(cup.rounds).toHaveLength(1);
    expect(cup.winnerId).toBeNull();
  });

  it('never rewrites a round it has already shown', () => {
    // The world is recomputed on demand rather than stored, so the same cup is
    // built from scratch every time somebody looks at it. If a later look could
    // disagree with an earlier one, the world would rewrite its own history.
    const state = career();
    playUntil(state, (s) => roundsReached(s, 'nationalCup') >= 1);
    const early = worldCup(state, 'spain', 'nationalCup', lookup)!.rounds[0];

    playUntil(state, (s) => roundsReached(s, 'nationalCup') >= 3);
    const later = worldCup(state, 'spain', 'nationalCup', lookup)!;
    expect(later.rounds.length).toBeGreaterThanOrEqual(3);
    expect(later.rounds[0]).toEqual(early);
  });

  it('has a winner by the end of the season', () => {
    const state = career();
    playUntil(state, () => false);
    const cup = worldCup(state, 'spain', 'nationalCup', lookup)!;
    expect(cup.rounds).toHaveLength(CUP_ROUNDS);
    expect(cup.winnerId).toBeTruthy();
  });

  it('returns nothing for a country that has no league here', () => {
    expect(worldCup(career(), 'atlantis', 'nationalCup', lookup)).toBeNull();
  });
});

describe('the cup the player went out of', () => {
  it('carries on without him during the season, not at the end of it', () => {
    // The failure this catches: his own country's cup sitting frozen at the
    // round he lost in, all season, while every other country's was live.
    const state = career();
    playUntil(state, (s) => CUP_KINDS.some((kind) => !stillInCup(s, kind)));

    const out = CUP_KINDS.find((kind) => !stillInCup(state, kind))!;
    const whenHeWentOut = state.cups[out].rounds.length;

    playUntil(state, (s) => roundsReached(s, out) > whenHeWentOut + 1);
    prepareNextMatch(state, lookup);
    expect(state.cups[out].rounds.length).toBeGreaterThan(whenHeWentOut);
    expect(state.cups[out].rounds.length).toBe(roundsReached(state, out));
  });

  it('still records the round he went out in', () => {
    const state = career();
    playUntil(state, (s) => CUP_KINDS.some((kind) => !stillInCup(s, kind)));
    const out = CUP_KINDS.find((kind) => !stillInCup(state, kind))!;
    expect(state.cups[out].eliminatedInRound).not.toBeNull();

    // And running the rest of it without him does not quietly clear that.
    playUntil(state, () => false);
    expect(state.cups[out].eliminatedInRound).not.toBeNull();
    expect(state.cups[out].winnerId).not.toBe(state.clubId);
  });

  it('never runs past a tie he is still expected to play', () => {
    const state = career();
    playUntil(state, (s) => nextMatch(s)?.competition === 'nationalCup');
    prepareNextMatch(state, lookup);
    // He is in this round, so the catch-up must leave it alone: its ties are
    // drawn but his own has no result until he plays it.
    const round = state.cups.nationalCup.rounds.at(-1)!;
    const his = round.ties.find(
      (tie) => tie.homeId === state.clubId || tie.awayId === state.clubId,
    );
    expect(his).toBeTruthy();
    expect(his!.winnerId).toBeUndefined();
  });
});

describe('browsing Europe', () => {
  it('has nothing to show in the first season, when nobody has qualified', () => {
    const state = career();
    for (const tier of EUROPEAN_TIERS) {
      expect(europeanState(state, tier, lookup)).toBeNull();
    }
  });

  it('shows all three competitions once places have been awarded', () => {
    const state = career();
    playUntil(state, () => false);
    endSeason(state, lookup);

    for (const tier of EUROPEAN_TIERS) {
      const competition = europeanState(state, tier, lookup)!;
      expect(competition.kind).toBe(tier);
      expect(competition.survivors.length).toBeGreaterThan(1);
    }
  });

  it('hands back the real competition for the one the club is in', () => {
    const state = career();
    playUntil(state, () => false);
    endSeason(state, lookup);
    if (!state.europe) return; // A first season rarely qualifies anybody.
    expect(europeanState(state, state.europe.kind, lookup)).toBe(state.europe);
  });
});

describe('European places are awarded on the season that was played', () => {
  it('gives every country\'s cup winners the place their cup run earned', () => {
    // Drifting the clubs BEFORE reading the cup winners meant a country's
    // European places were awarded off a table from the season just played and
    // a cup won by NEXT season's squads: the two halves of one qualification
    // decided by two different worlds. A club that had just collapsed could
    // lift a trophy on the strength of a side it no longer had.
    //
    // Several seasons, because that is what the bug needs to show itself. Drift
    // moves a club by a point or two a year, which flips a background cup only
    // when a tie was close — measured at around one winner in twenty-five. One
    // season is a coin that mostly lands the same either way; ten is not.
    //
    // Only the background countries can show it at all: the player's own cup is
    // a real bracket that has already been played, so no amount of drift can
    // change who won it.
    const state = career('places');

    for (let season = 0; season < 10; season++) {
      playUntil(state, () => false);

      const others = worldCountries(state).filter((id) => id !== state.countryId);
      const winners = others.flatMap((id) =>
        CUP_KINDS.map((kind) => cupWinner(state, kind, id, lookup)).filter(
          (club): club is string => !!club,
        ),
      );
      expect(winners.length).toBeGreaterThan(10);

      endSeason(state, lookup);

      // Winning either cup is a route into Europe, so every one of these clubs
      // must have a place — on merit if it also finished high enough, and via
      // the cup if it did not.
      for (const club of winners) {
        expect(state.europeanEntries[club], `season ${season + 1}: ${club}`).toBeTruthy();
      }
    }
  }, 60000);
});
