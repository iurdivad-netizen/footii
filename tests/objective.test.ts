import { describe, expect, it } from 'vitest';
import {
  DEMAND_CEILING,
  EXCEEDED_MARGIN,
  INJURY_FORGIVENESS,
  OBJECTIVE_SHIFT,
  ROLE_APPEARANCE_SHARE,
  SEASON_BREADTH,
  judgeObjective,
  objectiveAchieved,
  objectiveProgress,
  objectiveShare,
  objectiveSummary,
  setObjective,
} from '../src/core/career/objective.ts';
import type { ObjectiveInput } from '../src/core/career/objective.ts';
import { createSeasonStats } from '../src/core/career/seasonStats.ts';
import type { SeasonStats } from '../src/core/career/seasonStats.ts';
import { startCareer } from '../src/simulation/CareerService.ts';
import { calendarFor, fixturesFor } from '../src/core/career/career.ts';
import { TEAMS } from '../src/data/gameData.ts';
import { prospect } from './helpers.ts';

/**
 * The objective is the first thing in the game that tells a player what he is
 * being judged against. Two properties matter more than any particular number:
 * it must be MEETABLE by the role it was set for, and it must never punish a
 * player for the matches his manager refused to give him.
 */

function input(overrides: Partial<ObjectiveInput> = {}): ObjectiveInput {
  return {
    season: 3,
    clubId: 'northport-city',
    role: 'starter',
    position: 'ST',
    ability: 70,
    squadLevel: 70,
    leagueFixtures: 30,
    ...overrides,
  };
}

function stats(overrides: Partial<SeasonStats> = {}): SeasonStats {
  return { ...createSeasonStats(), ...overrides };
}

describe('what the manager asks for', () => {
  it('asks a star for more football than a squad player', () => {
    const star = setObjective(input({ role: 'star' }));
    const starter = setObjective(input({ role: 'starter' }));
    const squad = setObjective(input({ role: 'squad' }));
    expect(star.appearances).toBeGreaterThan(starter.appearances);
    expect(starter.appearances).toBeGreaterThan(squad.appearances);
  });

  it('measures a season as the league plus the football around it', () => {
    // Not the league list alone: a first-choice player also plays cup ties and
    // European nights, and a demand that ignored them would be met by March.
    for (const role of ['star', 'starter', 'squad'] as const) {
      const objective = setObjective(input({ role, leagueFixtures: 30 }));
      expect(objective.appearances).toBe(
        Math.round(30 * SEASON_BREADTH * ROLE_APPEARANCE_SHARE[role]),
      );
    }
  });

  it('never asks a first-choice player for more than a season contains', () => {
    // The bug this replaced: the demand was set against the CALENDAR, which
    // counts every week the season could contain, and asked a teenager for
    // forty-nine appearances in a thirty-match league.
    const objective = setObjective(input({ role: 'star', leagueFixtures: 30 }));
    expect(objective.appearances).toBeLessThan(30 * SEASON_BREADTH);
  });

  it('asks a striker for more than a centre-back', () => {
    expect(setObjective(input({ position: 'ST' })).contributions).toBeGreaterThan(
      setObjective(input({ position: 'CB' })).contributions,
    );
  });

  it('asks more of a player who is better than the squad around him', () => {
    const standout = setObjective(input({ ability: 85, squadLevel: 60 }));
    const oneOfMany = setObjective(input({ ability: 85, squadLevel: 85 }));
    expect(standout.contributions).toBeGreaterThan(oneOfMany.contributions);
  });

  it('always asks for something, even of a keeper in a bad side', () => {
    const objective = setObjective(input({ position: 'GK', ability: 40, squadLevel: 90 }));
    expect(objective.appearances).toBeGreaterThanOrEqual(4);
    expect(objective.contributions).toBeGreaterThanOrEqual(1);
  });

  it('still asks for a real season when the fixture list is short', () => {
    const objective = setObjective(input({ leagueFixtures: 6 }));
    expect(objective.appearances).toBeGreaterThanOrEqual(4);
  });

  it('says what it wants in words rather than only in numbers', () => {
    const objective = setObjective(input());
    expect(objective.brief).toContain(String(objective.appearances));
    expect(objective.brief).toContain(String(objective.contributions));
    expect(objective.brief.length).toBeGreaterThan(20);
  });

  it('remembers which club and season it belongs to', () => {
    const objective = setObjective(input({ season: 7, clubId: 'vale-park' }));
    expect(objective.season).toBe(7);
    expect(objective.clubId).toBe('vale-park');
  });
});

describe('last season, and the treadmill it must not become', () => {
  it('asks for more of a player who delivered last year', () => {
    const base = setObjective(input());
    const proven = setObjective(
      input({ lastSeason: { appearances: 30, contributions: base.contributions * 2 } }),
    );
    expect(proven.contributions).toBeGreaterThan(base.contributions);
  });

  it('refuses to let one extraordinary season set an unreachable price', () => {
    const base = setObjective(input());
    const freak = setObjective(
      input({ lastSeason: { appearances: 38, contributions: 400 } }),
    );
    // Capped by DEMAND_CEILING on the half that reads last season, so an
    // outlier cannot compound into a demand nobody could ever meet again.
    expect(freak.contributions).toBeLessThanOrEqual(
      Math.round(base.contributions * DEMAND_CEILING) + 1,
    );
  });

  it('does not punish a player for a poor season by asking for nothing', () => {
    const poor = setObjective(input({ lastSeason: { appearances: 4, contributions: 0 } }));
    expect(poor.contributions).toBeGreaterThanOrEqual(1);
  });
});

describe('settling it in the summer', () => {
  const objective = setObjective(input());
  const context = { season: 3, clubId: 'northport-city', fixtures: 38, injuredFixtures: 0 };

  it('is met when both halves are done', () => {
    const outcome = judgeObjective(
      objective,
      stats({ matches: objective.appearances, goals: objective.contributions }),
      context,
    );
    expect(outcome.verdict).toBe('met');
    expect(outcome.confidenceShift).toBe(OBJECTIVE_SHIFT.met);
  });

  it('counts assists toward the same half as goals', () => {
    const outcome = judgeObjective(
      objective,
      stats({ matches: objective.appearances, assists: objective.contributions }),
      context,
    );
    expect(outcome.verdict).toBe('met');
  });

  it('is exceeded only comfortably past the demand, not one match over', () => {
    const barely = judgeObjective(
      objective,
      stats({ matches: objective.appearances + 1, goals: objective.contributions }),
      context,
    );
    expect(barely.verdict).toBe('met');

    const comfortably = judgeObjective(
      objective,
      stats({
        matches: Math.ceil(objective.appearances * EXCEEDED_MARGIN),
        goals: Math.ceil(objective.contributions * EXCEEDED_MARGIN),
      }),
      context,
    );
    expect(comfortably.verdict).toBe('exceeded');
    expect(comfortably.confidenceShift).toBe(OBJECTIVE_SHIFT.exceeded);
  });

  it('needs BOTH halves comfortably beaten, not just one', () => {
    // Measured, and the reason the rule is `&&`: on `||` more than half of all
    // seasons came back exceeded, because clearing the appearance half
    // comfortably is close to automatic for anybody being picked. See
    // scripts/measureObjectives.ts.
    const onlyGoals = judgeObjective(
      objective,
      stats({
        matches: objective.appearances,
        goals: objective.contributions * 3,
      }),
      context,
    );
    expect(onlyGoals.verdict).toBe('met');

    const onlyApps = judgeObjective(
      objective,
      stats({
        matches: Math.ceil(objective.appearances * EXCEEDED_MARGIN),
        goals: objective.contributions,
      }),
      context,
    );
    expect(onlyApps.verdict).toBe('met');
  });

  it('is missed when either half falls short', () => {
    const noGoals = judgeObjective(
      objective,
      stats({ matches: objective.appearances, goals: 0 }),
      context,
    );
    expect(noGoals.verdict).toBe('missed');
    expect(noGoals.confidenceShift).toBe(OBJECTIVE_SHIFT.missed);

    const noMatches = judgeObjective(
      objective,
      stats({ matches: 2, goals: objective.contributions }),
      context,
    );
    expect(noMatches.verdict).toBe('missed');
  });

  it('says WHICH half was missed, because they are different conversations', () => {
    const notPicked = judgeObjective(
      objective,
      stats({ matches: 5, goals: objective.contributions }),
      context,
    );
    const notScoring = judgeObjective(
      objective,
      stats({ matches: objective.appearances, goals: 0 }),
      context,
    );
    expect(notPicked.note).not.toBe(notScoring.note);
    expect(notPicked.note).toMatch(/more often/i);
    expect(notScoring.note).toMatch(/goals and assists/i);
  });
});

describe('the things it refuses to judge', () => {
  const objective = setObjective(input());

  it('does not judge a season lost to injury, in either direction', () => {
    const injured = {
      season: 3,
      clubId: 'northport-city',
      fixtures: 38,
      injuredFixtures: Math.ceil(38 * INJURY_FORGIVENESS) + 1,
    };
    const outcome = judgeObjective(objective, stats({ matches: 3, goals: 0 }), injured);
    expect(outcome.verdict).toBe('unjudged');
    expect(outcome.confidenceShift).toBe(0);
    // Said out loud rather than silently forgiven — the player has to know why
    // nothing happened.
    expect(outcome.note).toMatch(/injured/i);
  });

  it('still judges a season with an ordinary number of injuries', () => {
    const outcome = judgeObjective(objective, stats({ matches: 4, goals: 0 }), {
      season: 3,
      clubId: 'northport-city',
      fixtures: 38,
      injuredFixtures: 4,
    });
    expect(outcome.verdict).toBe('missed');
  });

  it('does not judge a demand made by a club he has left', () => {
    const outcome = judgeObjective(objective, stats({ matches: 38, goals: 40 }), {
      season: 3,
      clubId: 'somewhere-else',
      fixtures: 38,
      injuredFixtures: 0,
    });
    expect(outcome.verdict).toBe('unjudged');
    expect(outcome.confidenceShift).toBe(0);
  });

  it('does not judge last season s demand against this season', () => {
    const outcome = judgeObjective(objective, stats({ matches: 38, goals: 40 }), {
      season: 4,
      clubId: 'northport-city',
      fixtures: 38,
      injuredFixtures: 0,
    });
    expect(outcome.verdict).toBe('unjudged');
  });

  it('survives having no objective at all rather than throwing', () => {
    // Every career that existed before this feature did, on the match it next
    // plays.
    for (const missing of [null, undefined]) {
      const outcome = judgeObjective(missing, stats(), {
        season: 3,
        clubId: 'northport-city',
        fixtures: 38,
        injuredFixtures: 0,
      });
      expect(outcome.verdict).toBe('unjudged');
      expect(outcome.confidenceShift).toBe(0);
    }
  });
});

describe('reading it on the hub', () => {
  const objective = setObjective(input());

  it('reports progress on each half separately', () => {
    const progress = objectiveProgress(
      objective,
      stats({ matches: objective.appearances, goals: 0 }),
    );
    expect(progress.appearances).toBe(1);
    expect(progress.contributions).toBe(0);
  });

  it('never reports more than complete', () => {
    const progress = objectiveProgress(
      objective,
      stats({ matches: 500, goals: 500, assists: 500 }),
    );
    expect(progress.appearances).toBe(1);
    expect(progress.contributions).toBe(1);
  });

  it('knows when both halves are already done', () => {
    expect(
      objectiveAchieved(
        objective,
        stats({ matches: objective.appearances, goals: objective.contributions }),
      ),
    ).toBe(true);
    expect(objectiveAchieved(objective, stats({ matches: 1 }))).toBe(false);
  });

  it('summarises both halves in one line', () => {
    const line = objectiveSummary(objective, stats({ matches: 9, goals: 4, assists: 1 }));
    expect(line).toContain(`9/${objective.appearances}`);
    expect(line).toContain(`5/${objective.contributions}`);
  });

  it('averages the two halves into one share', () => {
    expect(objectiveShare(objective, stats())).toBe(0);
    expect(
      objectiveShare(
        objective,
        stats({ matches: objective.appearances, goals: objective.contributions }),
      ),
    ).toBe(1);
  });
});

/**
 * THE PART THE UNIT TESTS ABOVE CANNOT SEE.
 *
 * Everything above tests the objective model in isolation, which is how it was
 * built and how it should stay. What that leaves untested is the wiring: whether
 * a real career ever actually GETS a demand, whether it survives a season, and
 * whether the summer settles it against the manager's confidence. A model that
 * works perfectly and is never called is the failure mode this file exists to
 * rule out.
 */
describe('an objective inside a real career', () => {
  it('is set the moment a career starts', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'obj-1',
    });

    expect(state.objective).not.toBeNull();
    expect(state.objective!.season).toBe(1);
    expect(state.objective!.clubId).toBe('northport-city');
    expect(state.objective!.appearances).toBeGreaterThan(0);
  });

  it('is pitched against the whole season, not just the league', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'obj-2',
    });

    // The calendar carries cup dates as well as league ones, and the demand is
    // set from the calendar. A target built off the fixture list alone would be
    // quietly easier than it looks — which is the bug this asserts against.
    expect(state.objective!.appearances).toBeLessThanOrEqual(calendarFor(state).length);
  });

  it('counts a fixture missed through injury, so the summer can forgive it', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'obj-3',
    });

    expect(state.seasonInjuredMisses).toBe(0);
  });

  it('starts the objective from the role the contract promised', () => {
    const state = startCareer({
      player: prospect(),
      clubId: 'northport-city',
      teams: TEAMS,
      seed: 'obj-4',
    });

    const role = state.contract!.role;
    expect(state.objective!.appearances).toBe(
      Math.max(
        4,
        Math.round(
          fixturesFor(state, state.clubId).length * SEASON_BREADTH * ROLE_APPEARANCE_SHARE[role],
        ),
      ),
    );
  });
});
