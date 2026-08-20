import { describe, expect, it } from 'vitest';
import { COUNTRIES, teamsInCountry } from '../src/data/gameData.ts';
import {
  CHAMPIONS_LEAGUE_PLACES,
  CONFERENCE_LEAGUE_PLACES,
  EUROPA_LEAGUE_PLACES,
  PLACES_BY_TIER,
  EUROPEAN_FIELD,
  EUROPEAN_TIERS,
  championsLeaguePlaces,
  cupRouteInto,
  europeanCompetition,
  europeanNameInProse,
  europeanPlaces,
  europeanTierOf,
  fieldFor,
  isEuropeanTier,
  qualifyForEurope,
  tierForPosition,
  visibilityOf,
} from '../src/core/career/europe.ts';
import type { EuropeanTier } from '../src/core/career/europe.ts';
import { countriesByPrestige, countryPrestige } from '../src/core/career/countries.ts';
import { emptyTable } from '../src/core/career/league.ts';
import type { TableRow } from '../src/core/career/league.ts';

/** A finished table in a known order: first in the list finished first. */
function tableInOrder(ids: readonly string[]): TableRow[] {
  const table = emptyTable(ids);
  for (const [index, row] of table.entries()) {
    row.played = 30;
    // Distinct, descending points so the order is exactly the order given.
    row.points = (ids.length - index) * 3;
    row.won = ids.length - index;
  }
  return table;
}

/** Every country's table, each in its data-file order. */
function worldTables(): Record<string, TableRow[]> {
  const tables: Record<string, TableRow[]> = {};
  for (const country of COUNTRIES) {
    tables[country.id] = tableInOrder(teamsInCountry(country.id).map((t) => t.id));
  }
  return tables;
}

const NO_WINNERS: Record<string, string | null> = {};

describe('the three competitions', () => {
  it('ranks them, with the Champions League above the rest', () => {
    const [top, middle, bottom] = EUROPEAN_TIERS.map((t) => europeanCompetition(t).prestige);
    expect(top).toBeGreaterThan(middle!);
    expect(middle).toBeGreaterThan(bottom!);
  });

  it('is watched more closely than any single league', () => {
    const best = Math.max(...COUNTRIES.map((c) => c.prestige));
    expect(europeanCompetition('championsLeague').prestige).toBeGreaterThanOrEqual(best);
  });

  it('recognises its own tiers and nothing else', () => {
    for (const tier of EUROPEAN_TIERS) expect(isEuropeanTier(tier)).toBe(true);
    expect(isEuropeanTier('league')).toBe(false);
    expect(isEuropeanTier('nationalCup')).toBe(false);
  });

  it('says which cup is a route into which competition', () => {
    expect(cupRouteInto('europaLeague')).toBe('nationalCup');
    expect(cupRouteInto('conferenceLeague')).toBe('leagueCup');
    expect(cupRouteInto('championsLeague')).toBeNull();
  });
});

describe('naming a competition in prose', () => {
  it('drops the capital article so it reads as a sentence', () => {
    expect(europeanNameInProse('championsLeague')).toBe('the Champions League');
    expect(europeanNameInProse('europaLeague')).toBe('the Europa League');
    expect(europeanNameInProse('conferenceLeague')).toBe('the Conference League');
  });

  it('still names every competition it is asked about', () => {
    for (const tier of EUROPEAN_TIERS) {
      expect(europeanNameInProse(tier).toLowerCase()).toBe(
        europeanCompetition(tier).name.toLowerCase(),
      );
    }
  });
});

describe('how many places a country gets', () => {
  it('gives the best-watched leagues the most Champions League places', () => {
    const ranked = countriesByPrestige();
    const places = ranked.map((c) => championsLeaguePlaces(c.id));
    for (let i = 1; i < places.length; i++) {
      expect(places[i - 1]).toBeGreaterThanOrEqual(places[i]!);
    }
    expect(places[0]).toBeGreaterThan(places[places.length - 1]!);
  });

  it('fills each competition exactly, with no place left over', () => {
    const total = (tier: EuropeanTier) =>
      COUNTRIES.reduce((sum, c) => sum + europeanPlaces(c.id)[tier], 0);
    expect(total('championsLeague')).toBe(EUROPEAN_FIELD);
    expect(total('europaLeague')).toBe(EUROPEAN_FIELD);
    expect(total('conferenceLeague')).toBe(EUROPEAN_FIELD);
    expect(CHAMPIONS_LEAGUE_PLACES.reduce((a, b) => a + b, 0)).toBe(EUROPEAN_FIELD);
  });

  it('fills every competition to sixteen from its own distribution', () => {
    for (const tier of EUROPEAN_TIERS) {
      expect(PLACES_BY_TIER[tier].reduce((a, b) => a + b, 0), tier).toBe(EUROPEAN_FIELD);
      expect(PLACES_BY_TIER[tier]).toHaveLength(COUNTRIES.length);
    }
  });

  it('sends a climbing country to BETTER competitions, not to more of them', () => {
    // The totals are what they were when the lower two handed everybody a flat
    // two apiece. Climbing the order trades a Conference place for a Europa one
    // — which is the only thing a country outside the top five can win, since
    // the Champions League row gives ranks six to eight one place each.
    const entries = (rank: number) =>
      CHAMPIONS_LEAGUE_PLACES[rank]! + EUROPA_LEAGUE_PLACES[rank]! + CONFERENCE_LEAGUE_PLACES[rank]!;
    expect(COUNTRIES.map((_, rank) => entries(rank))).toEqual([7, 7, 7, 6, 6, 5, 5, 5]);
  });

  it('never gives a lower-ranked country a better competition than a higher one', () => {
    for (const tier of ['championsLeague', 'europaLeague'] as const) {
      const places = PLACES_BY_TIER[tier];
      for (let i = 1; i < places.length; i++) {
        expect(places[i - 1], `${tier} ${i}`).toBeGreaterThanOrEqual(places[i]!);
      }
    }
    // The Conference League runs the other way: it is the competition you drop
    // OUT of as you climb, so the smallest country sends the most clubs to it.
    for (let i = 1; i < CONFERENCE_LEAGUE_PLACES.length; i++) {
      expect(CONFERENCE_LEAGUE_PLACES[i - 1]).toBeLessThanOrEqual(CONFERENCE_LEAGUE_PLACES[i]!);
    }
  });

  it('treats a country it has never heard of as the smallest', () => {
    expect(championsLeaguePlaces('atlantis')).toBe(1);
  });
});

describe('qualifying on league position', () => {
  const entries = qualifyForEurope({
    tables: worldTables(),
    nationalCupWinners: NO_WINNERS,
    leagueCupWinners: NO_WINNERS,
  });

  it('fills all three competitions to sixteen', () => {
    for (const tier of EUROPEAN_TIERS) {
      expect(fieldFor(entries, tier), tier).toHaveLength(EUROPEAN_FIELD);
    }
  });

  it('never puts a club in two competitions', () => {
    const all = Object.keys(entries);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(EUROPEAN_FIELD * 3);
  });

  it('awards places strictly down the table', () => {
    for (const country of COUNTRIES) {
      const order = teamsInCountry(country.id).map((t) => t.id);
      const places = europeanPlaces(country.id);
      for (let i = 0; i < places.championsLeague; i++) {
        expect(entries[order[i]!], `${country.id} ${i}`).toBe('championsLeague');
      }
      const europaStart = places.championsLeague;
      for (let i = europaStart; i < europaStart + places.europaLeague; i++) {
        expect(entries[order[i]!], `${country.id} ${i}`).toBe('europaLeague');
      }
    }
  });

  it('leaves the bottom of every league out of Europe entirely', () => {
    for (const country of COUNTRIES) {
      const order = teamsInCountry(country.id).map((t) => t.id);
      expect(entries[order[order.length - 1]!]).toBeUndefined();
    }
  });

  it('draws from every country, so a European draw crosses borders', () => {
    const countriesInvolved = new Set(
      fieldFor(entries, 'championsLeague').map(
        (id) => COUNTRIES.find((c) => teamsInCountry(c.id).some((t) => t.id === id))!.id,
      ),
    );
    expect(countriesInvolved.size).toBe(COUNTRIES.length);
  });

  it('is a pure function of its input', () => {
    const again = qualifyForEurope({
      tables: worldTables(),
      nationalCupWinners: NO_WINNERS,
      leagueCupWinners: NO_WINNERS,
    });
    expect(again).toEqual(entries);
  });
});

describe('qualifying by winning a cup', () => {
  const order = teamsInCountry('england').map((t) => t.id);
  /** A club that finished well outside the European places. */
  const outsider = order[12]!;

  it('takes a club into Europe from nowhere in the league', () => {
    const entries = qualifyForEurope({
      tables: worldTables(),
      nationalCupWinners: { england: outsider },
      leagueCupWinners: NO_WINNERS,
    });
    // The whole reason a cup is worth winning for a club going nowhere.
    expect(entries[outsider]).toBe('europaLeague');
  });

  it('costs the league the place, rather than adding one', () => {
    const withCup = qualifyForEurope({
      tables: worldTables(),
      nationalCupWinners: { england: outsider },
      leagueCupWinners: NO_WINNERS,
    });
    const english = Object.keys(withCup).filter((id) => order.includes(id));
    const places = europeanPlaces('england');
    expect(english).toHaveLength(
      places.championsLeague + places.europaLeague + places.conferenceLeague,
    );
    // The club that would have had the last Europa place drops a competition.
    expect(fieldFor(withCup, 'europaLeague')).toHaveLength(EUROPEAN_FIELD);
  });

  it('passes the place down the table when the winner already qualified', () => {
    // A champion who also wins the cup keeps his Champions League place; the
    // Europa place he would have taken goes to the next club instead.
    const champion = order[0]!;
    const entries = qualifyForEurope({
      tables: worldTables(),
      nationalCupWinners: { england: champion },
      leagueCupWinners: NO_WINNERS,
    });
    expect(entries[champion]).toBe('championsLeague');
    const places = europeanPlaces('england');
    const firstEuropa = order[places.championsLeague]!;
    expect(entries[firstEuropa]).toBe('europaLeague');
    expect(fieldFor(entries, 'europaLeague')).toHaveLength(EUROPEAN_FIELD);
  });

  it('sends the league cup winner into the Conference League', () => {
    const entries = qualifyForEurope({
      tables: worldTables(),
      nationalCupWinners: NO_WINNERS,
      leagueCupWinners: { england: outsider },
    });
    expect(entries[outsider]).toBe('conferenceLeague');
  });

  it('handles one club winning both cups', () => {
    const entries = qualifyForEurope({
      tables: worldTables(),
      nationalCupWinners: { england: outsider },
      leagueCupWinners: { england: outsider },
    });
    // The better of the two places, and only one of them.
    expect(entries[outsider]).toBe('europaLeague');
    for (const tier of EUROPEAN_TIERS) {
      expect(fieldFor(entries, tier), tier).toHaveLength(EUROPEAN_FIELD);
    }
  });

  it('ignores a cup winner that does not exist', () => {
    const entries = qualifyForEurope({
      tables: worldTables(),
      nationalCupWinners: { england: null },
      leagueCupWinners: {},
    });
    expect(fieldFor(entries, 'europaLeague')).toHaveLength(EUROPEAN_FIELD);
  });
});

describe('what a league position is worth', () => {
  it('tells a club what finishing where would earn', () => {
    expect(tierForPosition('england', 1)).toBe('championsLeague');
    const places = europeanPlaces('england');
    expect(tierForPosition('england', places.championsLeague)).toBe('championsLeague');
    expect(tierForPosition('england', places.championsLeague + 1)).toBe('europaLeague');
    expect(tierForPosition('england', 16)).toBeNull();
  });

  it('is harsher in a country with fewer places', () => {
    // Scotland gets one Champions League place; England gets three.
    expect(tierForPosition('scotland', 2)).not.toBe('championsLeague');
    expect(tierForPosition('england', 2)).toBe('championsLeague');
  });
});

describe('how many people are watching', () => {
  it('is the league alone for a club not in Europe', () => {
    expect(visibilityOf('england', null)).toBe(countryPrestige('england'));
    expect(visibilityOf('scotland', null)).toBe(countryPrestige('scotland'));
  });

  it('lifts a small league onto a bigger stage', () => {
    // The point: a Scottish club in the Champions League is genuinely more
    // visible than the Scottish league makes it.
    expect(visibilityOf('scotland', 'championsLeague')).toBeGreaterThan(
      countryPrestige('scotland'),
    );
  });

  it('never makes a club LESS visible than its own league', () => {
    for (const country of COUNTRIES) {
      for (const tier of EUROPEAN_TIERS) {
        expect(visibilityOf(country.id, tier), `${country.id}/${tier}`).toBeGreaterThanOrEqual(
          countryPrestige(country.id),
        );
      }
    }
  });

  it('ranks the competitions the way it ranks the leagues', () => {
    expect(visibilityOf('scotland', 'championsLeague')).toBeGreaterThan(
      visibilityOf('scotland', 'conferenceLeague'),
    );
  });
});

describe('locating a club in Europe', () => {
  it('reports the competition, or nothing at all', () => {
    const entries = { 'a-club': 'europaLeague' as const };
    expect(europeanTierOf(entries, 'a-club')).toBe('europaLeague');
    expect(europeanTierOf(entries, 'another-club')).toBeNull();
  });
});
