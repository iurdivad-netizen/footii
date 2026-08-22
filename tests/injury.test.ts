import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import {
  BASE_INJURY_RISK,
  advanceInjury,
  ageRisk,
  injuryReport,
  injuryRisk,
  recoveryFactor,
  rollInjury,
} from '../src/core/career/injury.ts';
import type { Injury } from '../src/core/career/injury.ts';

const fresh = { fitnessAtEnd: 70, minutes: 90, age: 24, stamina: 70 };

describe('what makes an injury likely', () => {
  it('rises the emptier a player finished the match', () => {
    const rested = injuryRisk({ ...fresh, fitnessAtEnd: 80 });
    const tired = injuryRisk({ ...fresh, fitnessAtEnd: 40 });
    const spent = injuryRisk({ ...fresh, fitnessAtEnd: 5 });
    expect(tired).toBeGreaterThan(rested);
    expect(spent).toBeGreaterThan(tired);
  });

  it('rises faster at the exhausted end than at the fresh end', () => {
    // The quadratic, which is what makes congestion the cause rather than an
    // even sprinkling of bad luck across the season.
    const step = (a: number, b: number) =>
      injuryRisk({ ...fresh, fitnessAtEnd: b }) - injuryRisk({ ...fresh, fitnessAtEnd: a });
    expect(step(40, 10)).toBeGreaterThan(step(90, 60));
  });

  it('scales with how long he was on the pitch', () => {
    expect(injuryRisk({ ...fresh, minutes: 20 })).toBeLessThan(injuryRisk({ ...fresh, minutes: 90 }));
    expect(injuryRisk({ ...fresh, minutes: 0 })).toBe(0);
  });

  it('is higher for an older player and lower for a durable one', () => {
    expect(injuryRisk({ ...fresh, age: 35 })).toBeGreaterThan(injuryRisk({ ...fresh, age: 22 }));
    expect(injuryRisk({ ...fresh, stamina: 95 })).toBeLessThan(injuryRisk({ ...fresh, stamina: 30 }));
  });

  it('never makes a young player MORE fragile than a peak-aged one', () => {
    // The original point of this test, and it still holds: bodies do not start
    // giving out at 23, and a model that says they do makes every young career
    // feel unlucky for no reason it can point at. What changed is the other
    // direction — a young body is now allowed to be a little sturdier.
    for (const age of [17, 20, 23, 26, 28]) {
      expect(injuryRisk({ ...fresh, age })).toBeLessThanOrEqual(injuryRisk({ ...fresh, age: 28 }));
    }
  });

  it('gives youth a real edge rather than a rounding error', () => {
    // Flat below 28 was the state this replaced, and it was measurable in
    // careers: a nineteen-year-old took as many injuries as a man of 28.
    expect(ageRisk(19)).toBeLessThan(ageRisk(28));
    expect(injuryRisk({ ...fresh, age: 19 })).toBeLessThan(injuryRisk({ ...fresh, age: 28 }) * 0.85);
  });

  it('stops short of making the very young invulnerable', () => {
    // A teenager is not made of rubber, and a floor is what says so.
    expect(ageRisk(14)).toBe(ageRisk(17));
    expect(ageRisk(17)).toBeGreaterThan(0.5);
  });

  it('still charges a veteran more, and by more than it discounts a teenager', () => {
    expect(ageRisk(35)).toBeGreaterThan(1);
    expect(ageRisk(35) - 1).toBeGreaterThan(1 - ageRisk(18));
  });

  it('stays a small number for an ordinary match', () => {
    // The season, not the match, is the scale this is judged on: anything much
    // above the base rate here becomes several injuries a month.
    expect(injuryRisk(fresh)).toBeLessThan(BASE_INJURY_RISK * 2);
    expect(injuryRisk(fresh)).toBeGreaterThan(0);
  });
});

describe('how fast a body mends', () => {
  it('heals a young player faster and an old one slower', () => {
    expect(recoveryFactor(19)).toBeLessThan(1);
    expect(recoveryFactor(28)).toBe(1);
    expect(recoveryFactor(35)).toBeGreaterThan(1);
  });

  it('caps how long a veteran is kept out', () => {
    // Past the mid-thirties a career is already ending on the ageing curve in
    // development.ts. It should not also be ending in the treatment room.
    expect(recoveryFactor(45)).toBe(recoveryFactor(37));
    expect(recoveryFactor(45)).toBeLessThanOrEqual(1.35);
  });

  it('shortens the weeks a young player actually serves', () => {
    // Sampled rather than compared one-to-one: a single roll at the same seed
    // does not fire at both ages, because the young player is less likely to be
    // hurt in the first place. What is being measured here is the LENGTH of the
    // ones that do happen, so the rate has to be sampled out of the way.
    const served = (age: number) => {
      const rng = new Rng(`mend-${age}`);
      const weeks: number[] = [];
      for (let i = 0; i < 4000; i++) {
        const injury = rollInjury(rng, { ...fresh, fitnessAtEnd: 0, age }, 3);
        if (injury) weeks.push(injury.weeks);
      }
      expect(weeks.length).toBeGreaterThan(100);
      return weeks.reduce((a, b) => a + b, 0) / weeks.length;
    };
    expect(served(19)).toBeLessThan(served(28));
    expect(served(28)).toBeLessThan(served(35));
  });

  it('never diagnoses an injury worth no matches at all', () => {
    // A one-week knock scaled by 0.7 rounds toward nothing, and an injury the
    // hub cannot render is worse than no injury model.
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const injury = rollInjury(new Rng(seed), { ...fresh, fitnessAtEnd: 2, age: 17 }, 1);
      if (injury) expect(injury.weeks).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('rolling for one', () => {
  it('never injures a player who did not play', () => {
    const rng = new Rng('never');
    for (let i = 0; i < 200; i++) {
      expect(rollInjury(rng, { ...fresh, minutes: 0 }, 1)).toBeNull();
    }
  });

  it('produces mostly minor injuries and rarely a serious one', () => {
    // Sampled off the severity roll directly rather than off the risk roll, so
    // this measures the distribution and not the rate.
    const rng = new Rng('spread');
    const seen: Injury[] = [];
    for (let i = 0; i < 4000; i++) {
      const injury = rollInjury(rng, { ...fresh, fitnessAtEnd: 0 }, 1);
      if (injury) seen.push(injury);
    }
    expect(seen.length).toBeGreaterThan(100);
    const share = (severity: string) =>
      seen.filter((one) => one.severity === severity).length / seen.length;
    expect(share('knock')).toBeGreaterThan(share('strain'));
    expect(share('strain')).toBeGreaterThan(share('tear'));
    expect(share('tear')).toBeGreaterThan(share('rupture'));
    expect(share('rupture')).toBeLessThan(0.1);
  });

  it('gives every injury a length of at least one week', () => {
    const rng = new Rng('lengths');
    for (let i = 0; i < 500; i++) {
      const injury = rollInjury(rng, { ...fresh, fitnessAtEnd: 0 }, 3);
      if (!injury) continue;
      expect(injury.weeks).toBeGreaterThanOrEqual(1);
      expect(injury.weeksRemaining).toBe(injury.weeks);
      expect(injury.season).toBe(3);
    }
  });

  it('is deterministic, like everything else the career rolls', () => {
    const one = rollInjury(new Rng('same'), { ...fresh, fitnessAtEnd: 10 }, 1);
    const two = rollInjury(new Rng('same'), { ...fresh, fitnessAtEnd: 10 }, 1);
    expect(one).toEqual(two);
  });
});

describe('serving one', () => {
  const injury: Injury = {
    severity: 'tear',
    label: 'A torn muscle',
    weeks: 5,
    weeksRemaining: 5,
    season: 2,
  };

  it('counts down by the weeks that passed', () => {
    expect(advanceInjury(injury, 2)!.weeksRemaining).toBe(3);
  });

  it('heals to nothing rather than to zero weeks left', () => {
    // One representation of "fit", not two: every caller checks for an injury,
    // and an injury with nothing left to serve would be a second way to be fit.
    expect(advanceInjury(injury, 5)).toBeNull();
    expect(advanceInjury(injury, 99)).toBeNull();
  });

  it('does not heal on a week that did not pass', () => {
    // A midweek fixture is a gap of zero, and missing it must not shorten the
    // injury that caused it to be missed.
    expect(advanceInjury(injury, 0)!.weeksRemaining).toBe(5);
    expect(advanceInjury(injury, -4)!.weeksRemaining).toBe(5);
  });

  it('leaves a fit player fit', () => {
    expect(advanceInjury(null, 3)).toBeNull();
  });

  it('reads as what it is and how long is left', () => {
    expect(injuryReport(injury)).toBe('A torn muscle — 5 weeks out');
    expect(injuryReport({ ...injury, weeksRemaining: 1 })).toBe('A torn muscle — 1 week out');
  });
});
