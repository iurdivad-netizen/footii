import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { nextMatch } from '../src/core/career/career.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { recordPlayerMatch, startCareer } from '../src/simulation/CareerService.ts';
import type { Honour } from '../src/core/career/awards.ts';
import type { FinalPlayed } from '../src/core/career/ceremony.ts';
import { finalPresentation, seasonPresentations } from '../src/core/career/ceremony.ts';
import { leagueName } from '../src/core/career/countries.ts';

const lookup = (id: string) => getTeam(id);

const final = (overrides: Partial<FinalPlayed> = {}): FinalPlayed => ({
  season: 1,
  label: 'The Challenge Cup',
  opponentName: 'Ashford United',
  goalsFor: 2,
  goalsAgainst: 1,
  presence: 'played',
  won: true,
  goals: 1,
  assists: 0,
  rating: 8.2,
  ...overrides,
});

const honour = (overrides: Partial<Honour> = {}): Honour => ({
  kind: 'title',
  season: 3,
  clubId: 'northport-city',
  division: 1,
  countryId: 'england',
  label: 'English champions',
  detail: 'Won The Premier Division.',
  ...overrides,
});

describe('a final, presented', () => {
  it('says what was won and against whom', () => {
    const shown = finalPresentation(final());
    expect(shown.tone).toBe('trophy');
    expect(shown.title).toBe('The Challenge Cup');
    expect(shown.subtitle).toBe('Winners');
    expect(shown.lines[0]).toContain('2-1 against Ashford United');
  });

  it('presents a final LOST rather than saying nothing at all', () => {
    // The one afternoon a season can turn on is the last one a game should go
    // quiet for — and reaching a final is already on this game's honours list,
    // so refusing to mention it here would contradict the record book.
    const shown = finalPresentation(final({ won: false, goalsFor: 1, goalsAgainst: 2 }));
    expect(shown.tone).toBe('runnerUp');
    expect(shown.subtitle).toBe('Runners-up');
  });

  it('reports the shootout, because a draw is not a thing a final can be', () => {
    const shown = finalPresentation(
      final({ goalsFor: 1, goalsAgainst: 1, shootout: { won: true, scored: 4, conceded: 2 } }),
    );
    expect(shown.lines[0]).toContain('won 4-2 on penalties');
  });

  it('names his own afternoon when he had one', () => {
    expect(finalPresentation(final({ goals: 2, assists: 1 })).lines.join(' ')).toContain(
      '2 goals and 1 assist',
    );
    // Played and did nothing in particular is still played.
    expect(finalPresentation(final({ goals: 0, assists: 0, rating: 6.4 })).lines.join(' ')).toContain(
      'rated 6.4',
    );
  });

  it('does not pretend he was on the pitch when he was not', () => {
    const injured = finalPresentation(final({ presence: 'absent', goals: 0, rating: 0 }));
    expect(injured.lines.join(' ')).toContain('treatment room');
    // The trophy is still his — being injured for the final does not un-win it.
    expect(injured.tone).toBe('trophy');
    // And no invented contribution: a 0.0 rating he never earned is worse than
    // silence, which is the same rule the hub follows for a missed match.
    expect(injured.lines.join(' ')).not.toContain('0.0');

    const skipped = finalPresentation(final({ presence: 'skipped' }));
    expect(skipped.lines.join(' ')).toContain('play itself out');
  });
});

describe("a season's honours, presented", () => {
  it('skips the trophies that already had their afternoon', () => {
    // A cup celebrated in March and celebrated again in June is a game that
    // does not remember what it told you.
    const shown = seasonPresentations(
      [
        honour({ kind: 'nationalCup', label: 'The FA Cup' }),
        honour({ kind: 'europeanTitle', label: 'Champions League' }),
        honour({ kind: 'title' }),
      ],
      3,
    );
    expect(shown.map((item) => item.title)).toEqual(['Champions']);
  });

  it('puts the club before the man', () => {
    const shown = seasonPresentations(
      [honour({ kind: 'topScorer', label: 'English top scorer' }), honour({ kind: 'title' })],
      3,
    );
    expect(shown[0]!.tone).toBe('trophy');
    expect(shown[1]!.tone).toBe('award');
    expect(shown[1]!.title).toBe('The Golden Boot');
  });

  it('says where it was won rather than stuttering the name', () => {
    // "ENGLISH PLAYER OF THE SEASON" over "Player of the Season" is the same
    // words twice. The league is what the name does not already say.
    const shown = seasonPresentations(
      [
        honour({
          kind: 'playerOfTheSeason',
          label: 'English player of the season',
          detail: 'A 7.80 average rating.',
        }),
      ],
      3,
    );
    expect(shown[0]!.title).toBe('Player of the Season');
    expect(shown[0]!.subtitle).toBe(leagueName('england'));
    expect(shown[0]!.subtitle).not.toContain('player of the season');
    expect(shown[0]!.lines).toEqual(['A 7.80 average rating.']);
  });

  it('puts a cap under his country rather than under his league', () => {
    const shown = seasonPresentations(
      [honour({ kind: 'capMilestone', label: '25 caps', detail: 'You reached 25 international caps.' })],
      3,
    );
    expect(shown[0]!.subtitle).toBe('International');
    // No ceremonial rename for a cap count: "25 caps" is already the shortest
    // true thing anybody could put on it.
    expect(shown[0]!.title).toBe('25 caps');
  });

  it('does not print the heading again underneath itself', () => {
    // "THE PREMIER DIVISION / Champions / You finished top of The Premier
    // Division." is the same fact three times.
    const shown = seasonPresentations(
      [honour({ kind: 'title', detail: `You finished top of ${leagueName('england')}.` })],
      3,
    );
    expect(shown[0]!.lines).toEqual([]);
  });

  it('keeps a detail that counts something, however it repeats the heading', () => {
    const shown = seasonPresentations(
      [
        honour({
          kind: 'topScorer',
          label: 'English top scorer',
          detail: `24 goals, more than anyone else in ${leagueName('england')}.`,
        }),
      ],
      3,
    );
    expect(shown[0]!.lines[0]).toContain('24 goals');
  });

  it('never turns a relegation into a presentation', () => {
    // A screen built to say congratulations is the wrong place to be told you
    // went down. The season review says it, with the table underneath.
    expect(seasonPresentations([honour({ kind: 'relegation', label: 'Relegated' })], 3)).toEqual([]);
  });

  it('ignores honours from another season', () => {
    expect(seasonPresentations([honour({ season: 2 })], 3)).toEqual([]);
  });
});

/**
 * The detection, played rather than mocked.
 *
 * A cup is walked to its final through the real service, because the thing
 * being tested is a claim about WHEN a competition acquires a winner — and the
 * only honest way to make that claim is to let the fixtures happen.
 */
describe('a trophy the career noticed on its own', () => {
  function career(seed: string): CareerState {
    return startCareer({
      player: createPlayer({
        name: 'Winner',
        position: 'ST',
        baseAttribute: 92,
        attributes: {},
      }),
      clubId: 'northport-city',
      teams: TEAMS,
      seed,
    });
  }

  /** Read the pending final and clear it, exactly as the screen does. */
  function takeFinal(state: CareerState): FinalPlayed | null {
    const final = state.pendingFinal ?? null;
    state.pendingFinal = null;
    return final;
  }

  /** Win everything, all season, until something is lifted. */
  function playUntilATrophy(state: CareerState, limit = 60): FinalPlayed | null {
    for (let i = 0; i < limit; i++) {
      if (!nextMatch(state)) break;
      const stats = createMatchStats();
      stats.minutes = 90;
      stats.goals = 3;
      recordPlayerMatch(
        state,
        { stats, rating: 9, playerTeamScore: 3, opponentScore: 0, fitnessAtEnd: 70 },
        lookup,
      );
      if (state.pendingFinal) return state.pendingFinal;
    }
    return null;
  }

  it('notices a cup being won, on the day it is won', () => {
    const state = career('trophy');
    const won = playUntilATrophy(state);
    expect(won).not.toBeNull();
    expect(won!.won).toBe(true);
    expect(won!.presence).toBe('played');
    expect(won!.label.length).toBeGreaterThan(0);
    expect(won!.season).toBe(state.seasonNumber);
  });

  it('writes it to the diary as well, because a screen is something you close', () => {
    const state = career('diary');
    const won = playUntilATrophy(state)!;
    const trophies = (state.moments ?? []).filter((moment) => moment.kind === 'trophy');
    expect(trophies).toHaveLength(1);
    expect(trophies[0]!.text).toContain(won.label);
  });

  it('cannot congratulate him for the same cup twice', () => {
    const state = career('twice');
    const first = playUntilATrophy(state)!;
    // Clear it exactly as the screen does, then play on to the end of the
    // season: the same competition must never raise a second final.
    state.pendingFinal = null;
    const labels = new Set<string>([first.label]);
    for (let i = 0; i < 80 && nextMatch(state); i++) {
      const stats = createMatchStats();
      stats.minutes = 90;
      recordPlayerMatch(
        state,
        { stats, rating: 8, playerTeamScore: 2, opponentScore: 0, fitnessAtEnd: 70 },
        lookup,
      );
      const raised = takeFinal(state);
      if (raised) {
        expect(labels.has(raised.label)).toBe(false);
        labels.add(raised.label);
      }
    }
  });

  it('congratulates a career that lost everything on nothing at all', () => {
    // Out of both cups at the first hurdle, and out of Europe by not being in
    // it. The competitions he went out of are finished in June with nobody
    // watching, which is why nothing is raised: a cup only acquires a winner
    // mid-season on the afternoon its final is played, and he is not in it.
    const state = career('losing');
    const raised: string[] = [];
    for (let i = 0; i < 60 && nextMatch(state); i++) {
      const stats = createMatchStats();
      stats.minutes = 90;
      recordPlayerMatch(
        state,
        { stats, rating: 4, playerTeamScore: 0, opponentScore: 3, fitnessAtEnd: 70 },
        lookup,
      );
      const final = takeFinal(state);
      if (final) raised.push(final.label);
    }
    expect(raised).toEqual([]);
  });

  it('says nothing at all about a league fixture', () => {
    const state = career('league');
    const stats = createMatchStats();
    stats.minutes = 90;
    // The first fixture of a season is never a final.
    recordPlayerMatch(
      state,
      { stats, rating: 7, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 70 },
      lookup,
    );
    expect(state.pendingFinal ?? null).toBeNull();
  });
});

/**
 * A presentation nobody draws is a presentation that does not exist. Asserted
 * against the source in the way this project's other screen decisions are.
 */
describe('the flow the ceremony sits in', () => {
  const app = readFileSync(new URL('../src/ui/App.ts', import.meta.url), 'utf8');

  it('presents a trophy on the way back to the hub, whichever way he got there', () => {
    // Played, skipped and missed all come back through the hub, so the check
    // lives there rather than at the three places a final can settle.
    expect(app).toContain('career.pendingFinal');
    expect(app).toContain('finalPresentation(final)');
  });

  it('clears it before showing it, so it cannot be shown twice', () => {
    expect(app).toContain('career.pendingFinal = null;');
    expect(app).toContain('career.pendingCeremony = null;');
  });

  it('hands over the season honours before the report is read', () => {
    const ceremony = app.indexOf('career.pendingCeremony');
    const review = app.indexOf('new SeasonReviewScreen');
    expect(ceremony).toBeGreaterThan(-1);
    expect(ceremony).toBeLessThan(review);
  });
});
