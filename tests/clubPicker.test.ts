import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TEAMS } from '../src/data/gameData.ts';
import { allCountries } from '../src/core/career/countries.ts';
import { clubStanding } from '../src/core/career/trial.ts';
import { squadLevel } from '../src/core/career/transfers.ts';
import { prospect, veteran } from './helpers.ts';

/**
 * CHOOSING WHERE A CAREER BEGINS
 *
 * The picker itself needs a DOM, and this suite runs on `node` by design — so
 * what is checked here is the part that can be checked without one, which is
 * also the part that was actually wrong: the SHAPE of the data the screen is
 * built from, and the two facts about the world that decided the layout.
 *
 * The screen's own wiring is covered by driving it in a browser, which is how
 * the forty-eight-country bug below was found.
 */

const source = readFileSync(
  new URL('../src/ui/screens/clubPicker.ts', import.meta.url),
  'utf8',
);

describe('the world the picker has to lay out', () => {
  it('has far more countries than it has leagues', () => {
    // The bug this pins. The world carries forty-eight countries because
    // international football needs them, and only twelve of them have a club
    // competition — so a picker built from `allCountries()` offers thirty-six
    // countries with nothing behind them. The first version of this screen did
    // exactly that.
    const withClubs = new Set(TEAMS.map((team) => team.country));
    expect(allCountries().length).toBeGreaterThan(withClubs.size);
    expect(withClubs.size).toBe(12);
  });

  it('builds its country list from the clubs rather than the registry', () => {
    // The import is the thing that matters: the doc comment above the method
    // names `allCountries()` precisely to explain why it is NOT used.
    expect(source).not.toMatch(/import \{[^}]*allCountries/);
    expect(source).toContain('this.teams.map((team) => team.country)');
  });

  it('divides evenly enough for a country to be one screen', () => {
    // Sixteen clubs a country is what makes country-first work at all. If this
    // ever stops being true the layout needs revisiting, not just the data.
    const byCountry = new Map<string, number>();
    for (const team of TEAMS) {
      byCountry.set(team.country, (byCountry.get(team.country) ?? 0) + 1);
    }
    for (const [country, count] of byCountry) {
      expect(count, `${country} has an unusual number of clubs`).toBeLessThanOrEqual(24);
    }
  });
});

describe('why the band is a badge rather than the structure', () => {
  /**
   * The measurement that decided the layout, kept as a test so the reasoning
   * survives contact with a future data change.
   *
   * Grouping by "would they sign you" is the obvious structure and it organises
   * almost nothing: nearly every club in the world is reachable, so the bands
   * would be one enormous group and two small ones.
   */
  it('leaves most of the world reachable even for a modest prospect', () => {
    // Measured at about 65% for the weakest player the test helpers build, and
    // at 91% for the game's own young-prospect preset. Either way the "would
    // sign you" band is the overwhelming majority of the list, which is what
    // makes it useless as a top-level division and fine as a badge.
    const player = prospect();
    const reachable = TEAMS.filter((team) => clubStanding(player, team) !== 'closed');
    expect(reachable.length / TEAMS.length).toBeGreaterThan(0.6);
  });

  it('leaves a veteran with even fewer doors closed', () => {
    const player = veteran();
    const closed = TEAMS.filter((team) => clubStanding(player, team) === 'closed');
    expect(closed.length / TEAMS.length).toBeLessThan(0.2);
  });

  it('still closes some doors, or the badge would say nothing', () => {
    // The gate has to bite somewhere. A prospect who could walk into any club
    // in the world would make the whole trial model decoration.
    const player = prospect();
    const closed = TEAMS.filter((team) => clubStanding(player, team) === 'closed');
    expect(closed.length).toBeGreaterThan(0);
  });
});

describe('the ladder the dropdown hid', () => {
  it('has a real spread of squad strength inside a single country', () => {
    // Clubs are listed strongest first, which is only worth doing because the
    // gap is big: in the old dropdown they were in data-file order, so the
    // difference between the best side in a country and its worst was
    // invisible until a season had been played.
    const english = TEAMS.filter((team) => team.country === 'england').map(squadLevel);
    const spread = Math.max(...english) - Math.min(...english);
    expect(spread).toBeGreaterThan(15);
  });

  it('sorts by that strength rather than by name or file order', () => {
    expect(source).toContain('squadLevel(b) - squadLevel(a)');
  });
});

describe('what the card has to say', () => {
  const shows = (what: string, needle: string) =>
    it(`shows ${what}`, () => expect(source).toContain(needle));

  // Everything the 192-item dropdown knew and did not show.
  shows('the squad strength', 'club-card-level');
  shows('what kind of football they play', 'TACTICAL_STYLE_LABELS');
  shows('what a trial would take', 'trialRequirement');
  shows("the club's own colour", 'clubPalette');

  it('keeps out-of-reach clubs on the screen rather than filtering them out', () => {
    // Hiding them would be tidier and would cost the player the thing worth
    // knowing: that the club he has heard of is up there, and what it would
    // take. A ladder you cannot see the top of is not a ladder.
    //
    // Every club in the country is rendered — the list is never filtered by
    // standing — and the unreachable ones are disabled rather than dropped.
    expect(source).toContain('this.clubsIn(this.countryId)');
    expect(source).toContain("standing === 'closed' ? 'disabled' : ''");
    expect(source).toContain('club-${standing}');
  });

  it('marks the country holding the current choice', () => {
    // Otherwise browsing away from your pick leaves nothing pointing back at it.
    expect(source).toContain('holds-choice');
  });
});

describe('the setup screen no longer has a 192-item dropdown', () => {
  const setup = readFileSync(
    new URL('../src/ui/screens/SetupScreen.ts', import.meta.url),
    'utf8',
  );

  it('mounts the picker instead of building option groups', () => {
    expect(setup).toContain('new ClubPicker');
    expect(setup).not.toContain('<optgroup');
  });

  it('reads the chosen club from the picker', () => {
    expect(setup).toContain('this.picker.value');
  });
});
