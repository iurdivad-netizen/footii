import { describe, expect, it } from 'vitest';
import {
  PROSPECT_AGE,
  TRIAL_REACH,
  clubStanding,
  describeFailure,
  describeTrial,
  perceivedLevel,
  reachOf,
  startingBar,
  trialPassed,
  trialRequirement,
} from '../src/core/career/trial.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { currentAbility } from '../src/core/player/player.ts';
import { squadLevel } from '../src/core/career/transfers.ts';
import { teamStrength } from '../src/core/team/team.ts';
import { PLAYER_PRESETS, TEAMS } from '../src/data/gameData.ts';

/**
 * WHERE A CAREER MAY BEGIN
 *
 * The setup screen always let you pick any of the 192 clubs, so an
 * eighteen-year-old with 54 ability could start at the best side on earth. The
 * choice was never the problem; the missing piece was the gate.
 *
 * What matters here is that the gate is a GATE and not a wall: there has to be
 * somewhere for everybody, the very top has to be out of reach for a beginner,
 * and the band in between has to be reachable by actually playing well.
 */

const RANKED = [...TEAMS].sort((a, b) => teamStrength(b) - teamStrength(a));
const BEST = RANKED[0]!;
const WORST = RANKED[RANKED.length - 1]!;

function player(overrides: { ability?: number; potential?: number; age?: number } = {}) {
  return createPlayer({
    name: 'Hopeful',
    position: 'ST',
    age: overrides.age ?? 18,
    baseAttribute: overrides.ability ?? 55,
    potentialAbility: overrides.potential ?? overrides.ability ?? 55,
    attributes: {},
  });
}

describe('what a club sees', () => {
  it('counts a young player potential, at least partly', () => {
    const flat = player({ ability: 55, potential: 55, age: 18 });
    const promising = player({ ability: 55, potential: 90, age: 18 });
    expect(perceivedLevel(promising)).toBeGreaterThan(perceivedLevel(flat));
    // But not all of it: he is not that player yet.
    expect(perceivedLevel(promising)).toBeLessThan(promising.potentialAbility);
  });

  it('stops counting potential once he is too old to be a prospect', () => {
    const old = player({ ability: 55, potential: 90, age: PROSPECT_AGE });
    expect(perceivedLevel(old)).toBeCloseTo(currentAbility(old), 1);
  });

  it('counts less of it the closer he gets to that age', () => {
    const younger = perceivedLevel(player({ ability: 55, potential: 90, age: 17 }));
    const older = perceivedLevel(player({ ability: 55, potential: 90, age: 22 }));
    expect(younger).toBeGreaterThan(older);
  });

  it('measures a club by the squad it has, not by its league', () => {
    expect(startingBar(BEST)).toBe(squadLevel(BEST));
    expect(startingBar(BEST)).toBeGreaterThan(startingBar(WORST));
  });
});

describe('the three bands', () => {
  it('puts the best club in the world out of a beginner reach', () => {
    expect(clubStanding(player({ ability: 50, potential: 60 }), BEST)).toBe('closed');
  });

  it('always leaves somewhere for everybody, however badly he was built', () => {
    // The one thing the gate must never do is lock a player out of the game.
    // A creation can come out below the worst squad in the world, and a gate
    // with no floor would leave him every club a trial and no career to begin.
    for (const ability of [10, 20, 35, 50, 65, 80, 95]) {
      const p = player({ ability, potential: ability, age: 20 });
      const open = TEAMS.filter((team) => clubStanding(p, team) === 'open');
      expect(open.length, `ability ${ability}`).toBeGreaterThan(0);
    }
  });

  it('gives every preset a real choice: somewhere to go and somewhere to aim', () => {
    for (const preset of PLAYER_PRESETS) {
      const p = preset.create();
      const bands = TEAMS.map((team) => clubStanding(p, team));
      expect(bands.filter((b) => b === 'open').length, preset.id).toBeGreaterThan(0);
      expect(bands.filter((b) => b === 'trial').length, preset.id).toBeGreaterThan(0);
    }
  });

  it('opens the bottom of the world to anybody at all', () => {
    // The bottom rung does not hold auditions; it needs eleven on Saturday.
    const hopeless = player({ ability: 10, potential: 10, age: 30 });
    expect(clubStanding(hopeless, WORST)).toBe('open');
  });

  it('opens a club the moment he is as good as its squad', () => {
    const level = squadLevel(WORST);
    expect(clubStanding(player({ ability: level + 5, potential: level + 5, age: 25 }), WORST)).toBe(
      'open',
    );
  });

  it('draws the trial band exactly where the reach runs out', () => {
    const bar = startingBar(BEST);
    // Perceived level exactly TRIAL_REACH below the bar: still a trial.
    const justInside = player({ ability: bar - TRIAL_REACH, potential: bar - TRIAL_REACH, age: 25 });
    expect(reachOf(justInside, BEST)).toBeCloseTo(TRIAL_REACH, 1);
    expect(clubStanding(justInside, BEST)).toBe('trial');

    const justOutside = player({
      ability: bar - TRIAL_REACH - 2,
      potential: bar - TRIAL_REACH - 2,
      age: 25,
    });
    expect(clubStanding(justOutside, BEST)).toBe('closed');
  });
});

describe('what a trial demands', () => {
  it('asks more the further he is reaching', () => {
    expect(trialRequirement(TRIAL_REACH)).toBeGreaterThan(trialRequirement(1));
  });

  it('never asks for less than a genuinely good match', () => {
    // A trial you pass by not being noticed is not a trial.
    expect(trialRequirement(0)).toBeGreaterThanOrEqual(6.4);
  });

  it('never asks for more than a match can give', () => {
    expect(trialRequirement(TRIAL_REACH)).toBeLessThan(10);
    expect(trialRequirement(999)).toBeLessThan(10);
  });

  it('passes on the bar and fails just under it', () => {
    const required = trialRequirement(8);
    expect(trialPassed(required, required)).toBe(true);
    expect(trialPassed(required + 0.1, required)).toBe(true);
    expect(trialPassed(required - 0.1, required)).toBe(false);
  });

  it('says in words what the number means', () => {
    expect(describeTrial(trialRequirement(0))).toContain('solid');
    expect(describeTrial(trialRequirement(TRIAL_REACH))).toMatch(/best|pitch/);
  });

  it('describes a failure by how close it came, not by the rating alone', () => {
    // A 3.8 against a required 8.2 is not "a good afternoon narrowly rejected",
    // which is what fixed copy called it.
    expect(describeFailure(8.0, 8.2)).toContain('touching distance');
    expect(describeFailure(7.4, 8.2)).toContain('good afternoon');
    expect(describeFailure(6.5, 8.2)).toContain('steady');
    expect(describeFailure(3.8, 8.2)).toContain('not your day');
  });

  it('reads the gap, so the same rating reads differently against different bars', () => {
    // The point of reading the gap: 6.6 is a near miss at a club wanting 6.8
    // and a long way short at one wanting 8.8, and it is the same 6.6.
    const rating = 6.6;
    expect(describeFailure(rating, 6.8)).toContain('touching distance');
    expect(describeFailure(rating, 8.8)).toContain('steady');
    expect(describeFailure(rating, 6.8)).not.toBe(describeFailure(rating, 8.8));
  });
});
