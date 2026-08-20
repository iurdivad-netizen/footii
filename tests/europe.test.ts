import { describe, expect, it } from 'vitest';
import { LEAGUE_COUNTRIES, teamsInCountry } from '../src/data/gameData.ts';
import {
  CHAMPIONS_LEAGUE_PLACES,
  CONFERENCE_LEAGUE_PLACES,
  EUROPA_LEAGUE_PLACES,
  EUROPEAN_ENTRIES_PER_COUNTRY,
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
  for (const country of LEAGUE_COUNTRIES) {
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
    const best = Math.max(...LEAGUE_COUNTRIES.map((c) => c.prestige));
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
      LEAGUE_COUNTRIES.reduce((sum, c) => sum + europeanPlaces(c.id)[tier], 0);
    expect(total('championsLeague')).toBe(EUROPEAN_FIELD);
    expect(total('europaLeague')).toBe(EUROPEAN_FIELD);
    expect(total('conferenceLeague')).toBe(EUROPEAN_FIELD);
    expect(CHAMPIONS_LEAGUE_PLACES.reduce((a, b) => a + b, 0)).toBe(EUROPEAN_FIELD);
  });

  it('fills every competition to sixteen from its own distribution', () => {
    for (const tier of EUROPEAN_TIERS) {
      expect(PLACES_BY_TIER[tier].reduce((a, b) => a + b, 0), tier).toBe(EUROPEAN_FIELD);
      expect(PLACES_BY_TIER[tier]).toHaveLength(LEAGUE_COUNTRIES.length);
    }
  });

  it('sends a climbing country to BETTER competitions, not to more of them', () => {
    // The totals are what they were when the lower two handed everybody a flat
    // two apiece. Climbing the order trades a Conference place for a Europa one
    // — which is the only thing a country outside the top five can win, since
    // the Champions League row gives ranks six to eight one place each.
    const entries = (rank: number) =>
      CHAMPIONS_LEAGUE_PLACES[rank]! + EUROPA_LEAGUE_PLACES[rank]! + CONFERENCE_LEAGUE_PLACES[rank]!;
    expect(LEAGUE_COUNTRIES.map((_, rank) => entries(rank))).toEqual(
      LEAGUE_COUNTRIES.map(() => EUROPEAN_ENTRIES_PER_COUNTRY),
    );
  });

  it('never gives a lower-ranked country a better competition than a higher one', () => {
    // The Champions League slopes down and the Conference League slopes up: it
    // is the competition you drop OUT of as you climb.
    for (let i = 1; i < CHAMPIONS_LEAGUE_PLACES.length; i++) {
      expect(CHAMPIONS_LEAGUE_PLACES[i - 1], `ucl ${i}`).toBeGreaterThanOrEqual(
        CHAMPIONS_LEAGUE_PLACES[i]!,
      );
      expect(CONFERENCE_LEAGUE_PLACES[i - 1], `uecl ${i}`).toBeLessThanOrEqual(
        CONFERENCE_LEAGUE_PLACES[i]!,
      );
    }
  });

  it('makes the Europa League a hump rather than a slope', () => {
    // Football, not an accident: the biggest countries send most of their
    // allocation to the Champions League and the smallest send theirs to the
    // Conference League, so the Europa League is mostly made of the middle.
    const peak = Math.max(...EUROPA_LEAGUE_PLACES);
    const first = EUROPA_LEAGUE_PLACES.indexOf(peak);
    const last = EUROPA_LEAGUE_PLACES.lastIndexOf(peak);
    expect(first).toBeGreaterThan(0);
    expect(last).toBeLessThan(EUROPA_LEAGUE_PLACES.length - 1);
    // Rising into the hump, falling out of it, and never bouncing.
    for (let i = 1; i <= first; i++) {
      expect(EUROPA_LEAGUE_PLACES[i - 1]).toBeLessThanOrEqual(EUROPA_LEAGUE_PLACES[i]!);
    }
    for (let i = last + 1; i < EUROPA_LEAGUE_PLACES.length; i++) {
      expect(EUROPA_LEAGUE_PLACES[i - 1]).toBeGreaterThanOrEqual(EUROPA_LEAGUE_PLACES[i]!);
    }
  });

  it('treats a country it has never heard of as the smallest', () => {
    expect(championsLeaguePlaces('atlantis')).toBe(
      CHAMPIONS_LEAGUE_PLACES[CHAMPIONS_LEAGUE_PLACES.length - 1],
    );
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
    for (const country of LEAGUE_COUNTRIES) {
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
    for (const country of LEAGUE_COUNTRIES) {
      const order = teamsInCountry(country.id).map((t) => t.id);
      expect(entries[order[order.length - 1]!]).toBeUndefined();
    }
  });

  it('draws from every country that has a place, so a European draw crosses borders', () => {
    const countryOf = (id: string) =>
      LEAGUE_COUNTRIES.find((c) => teamsInCountry(c.id).some((t) => t.id === id))!.id;

    // The Champions League reaches every country with a place in it — and the
    // countries at the bottom of the order have none, which is the point of
    // being at the bottom of the order.
    const inTheCup = new Set(fieldFor(entries, 'championsLeague').map(countryOf));
    const entitled = LEAGUE_COUNTRIES.filter((c) => europeanPlaces(c.id).championsLeague > 0);
    expect(inTheCup.size).toBe(entitled.length);
    expect(entitled.length).toBeLessThan(LEAGUE_COUNTRIES.length);

    // But every country is somewhere in Europe: nobody is shut out entirely.
    const anywhere = new Set(
      EUROPEAN_TIERS.flatMap((tier) => fieldFor(entries, tier)).map(countryOf),
    );
    expect(anywhere.size).toBe(LEAGUE_COUNTRIES.length);
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
    for (const country of LEAGUE_COUNTRIES) {
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


/**
 * A EUROPEAN SEASON, END TO END
 *
 * Two competitions in one object, and the seam between them is where the risk
 * is. A club that finishes third in its group must get nothing after Christmas;
 * one that finishes second must get a quarter-final. Both used to be the same
 * thing — a first-round tie — and neither can be checked by looking at one half.
 */

import { startCareer, endSeason, prepareNextMatch, recordPlayerMatch } from '../src/simulation/CareerService.ts';
import { nextMatch, seasonComplete } from '../src/core/career/career.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { createPlayer } from '../src/core/player/player.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import { EUROPEAN_GROUP_ROUNDS, EUROPEAN_KNOCKOUT_ROUNDS, europeanWinner } from '../src/core/career/europe.ts';
import { groupIndexOf, reachedKnockout } from '../src/core/career/groupStage.ts';

const clubs = (id: string) => getTeam(id);

/** A player good enough that his club keeps qualifying. */
function europeanCareer(): CareerState {
  return startCareer({
    player: createPlayer({
      name: 'Continental',
      position: 'ST',
      age: 22,
      baseAttribute: 80,
      reputation: 80,
      attributes: {},
    }),
    clubId: 'northport-city',
    teams: TEAMS,
    seed: 'euro-season',
  });
}

/** Play one whole season, collecting every European fixture he was offered. */
function playSeason(state: CareerState) {
  const european: { round: number; label?: string }[] = [];
  let guard = 0;
  while (!seasonComplete(state) && guard++ < 250) {
    prepareNextMatch(state, clubs);
    const scheduled = nextMatch(state);
    if (!scheduled) break;
    if (state.europe && scheduled.competition === state.europe.kind) {
      european.push({ round: scheduled.round, label: scheduled.roundLabel });
    }
    recordPlayerMatch(
      state,
      { stats: createMatchStats(), rating: 7, playerTeamScore: 2, opponentScore: 1, fitnessAtEnd: 70 },
      clubs,
    );
  }
  return { european, outcome: endSeason(state, clubs) };
}

describe('playing a European season', () => {
  it('gives every entrant three group matches before anything is decided', () => {
    const state = europeanCareer();
    playSeason(state);

    // Season two is the first he can be in Europe: the first has no previous
    // season to have qualified from.
    let seasons = 0;
    while (seasons < 4) {
      const inEurope = !!state.europe;
      const { european } = playSeason(state);
      seasons += 1;
      if (!inEurope) continue;

      const groupMatches = european.filter((match) => match.round <= EUROPEAN_GROUP_ROUNDS);
      expect(groupMatches).toHaveLength(EUROPEAN_GROUP_ROUNDS);
      for (const match of groupMatches) expect(match.label).toMatch(/^Group match/);
      return;
    }
  });

  it('finishes every competition: four groups, three knockout rounds, one winner', () => {
    const state = europeanCareer();
    for (let season = 0; season < 4; season += 1) {
      const { outcome } = playSeason(state);
      if (!outcome.europe) continue;

      expect(outcome.europe.groups).toHaveLength(4);
      expect(outcome.europe.groupRoundsPlayed).toBe(EUROPEAN_GROUP_ROUNDS);
      expect(outcome.europe.knockout).not.toBeNull();
      expect(outcome.europe.knockout!.rounds).toHaveLength(EUROPEAN_KNOCKOUT_ROUNDS);
      expect(europeanWinner(outcome.europe)).toBeTruthy();
    }
  });

  it('offers knockout ties only to a club that got out of its group', () => {
    const state = europeanCareer();
    for (let season = 0; season < 5; season += 1) {
      const inEurope = !!state.europe;
      const { european, outcome } = playSeason(state);
      if (!inEurope || !outcome.europe) continue;

      const knockoutMatches = european.filter((match) => match.round > EUROPEAN_GROUP_ROUNDS);
      const through = reachedKnockout(outcome.europe, outcome.record.clubId);

      // The whole point of a group stage: going out of it ends the season in
      // Europe, and there is nothing after Christmas.
      if (!through) expect(knockoutMatches).toHaveLength(0);
      else expect(knockoutMatches.length).toBeGreaterThan(0);
      // And he was in a group either way.
      expect(groupIndexOf(outcome.europe, outcome.record.clubId)).toBeGreaterThanOrEqual(0);
    }
  });
});
