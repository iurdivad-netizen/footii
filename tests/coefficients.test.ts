import { describe, expect, it } from 'vitest';
import '../src/data/gameData.ts';
import { LEAGUE_COUNTRIES } from '../src/data/gameData.ts';
import {
  CHAMPION_BONUS,
  COEFFICIENT_SWING,
  COEFFICIENT_WINDOW,
  FINAL_BONUS,
  GROUP_DRAW,
  GROUP_WIN,
  KNOCKOUT_BONUS,
  MAX_CAMPAIGN,
  CLUB_SCALE,
  EUROPEAN_ROUND_WIN,
  EUROPEAN_TROPHY,
  NATION_SCALE,
  TIER_WEIGHT,
  clubCoefficient,
  coefficientNudge,
  countriesByStanding,
  createCoefficients,
  fieldAverage,
  hasRecord,
  nationCoefficient,
  recordEuropeanSeason,
  scoreEuropeanSeason,
  scoreTournament,
  standingOf,
  standingsTable,
} from '../src/core/career/coefficients.ts';
import type { Coefficients } from '../src/core/career/coefficients.ts';
import type { EuropeanEntries, EuropeanState } from '../src/core/career/europe.ts';
import { countriesByPrestige, countryPrestige } from '../src/core/career/countries.ts';
import { createCup } from '../src/core/career/cups.ts';
import { INTERNATIONAL, KNOCKOUT_ROUNDS } from '../src/core/career/international.ts';
import type { InternationalState } from '../src/core/career/international.ts';
import { emptyTable } from '../src/core/career/league.ts';
import { nationId } from '../src/core/career/nations.ts';
import { championsLeaguePlaces, europeanPlaces } from '../src/core/career/europe.ts';
import { renderPlacesChange } from '../src/ui/screens/SeasonReviewScreen.ts';

/**
 * THE COUNTRY COEFFICIENT
 *
 * What is being tested is a loop, not a formula: five international matches a
 * year decide how many clubs a country sends to each European competition. The
 * cases that matter are the ones where a plausible model quietly does nothing —
 * a country whose record cannot reach the place above it, an allocation whose
 * distribution has no step where the country sits — because those fail silently
 * and leave a system that is implemented, tested and inert.
 */

const IDS = countriesByPrestige().map((c) => c.id);

/** A finished tournament, described by what each nation actually did. */
function tournament(
  campaigns: Record<string, { won?: number; drawn?: number; knockout?: boolean; final?: boolean; champion?: boolean }>,
): InternationalState {
  const nations = IDS.map(nationId);
  const table = emptyTable(nations);
  for (const row of table) {
    const campaign = campaigns[row.teamId] ?? {};
    row.won = campaign.won ?? 0;
    row.drawn = campaign.drawn ?? 0;
    row.played = 3;
    row.lost = 3 - row.won - row.drawn;
    row.points = row.won * 3 + row.drawn;
  }

  const semiFinalists = nations.filter((id) => campaigns[id]?.knockout);
  const finalists = nations.filter((id) => campaigns[id]?.final);
  const champion = nations.find((id) => campaigns[id]?.champion) ?? null;

  const knockout = createCup(INTERNATIONAL, INTERNATIONAL, semiFinalists, { seeded: true });
  if (semiFinalists.length > 0) {
    knockout.rounds.push({
      round: 1,
      ties: [
        { homeId: semiFinalists[0] ?? '', awayId: semiFinalists[1] ?? '', winnerId: finalists[0] },
        { homeId: semiFinalists[2] ?? '', awayId: semiFinalists[3] ?? '', winnerId: finalists[1] },
      ],
    });
    knockout.rounds.push({
      round: 2,
      ties: [{ homeId: finalists[0] ?? '', awayId: finalists[1] ?? '', winnerId: champion ?? undefined }],
    });
    knockout.winnerId = champion;
  }

  return {
    kind: 'continental',
    knockoutRounds: KNOCKOUT_ROUNDS,
    fixtures: [],
    results: [],
    table,
    groups: [nations],
    groupRoundsPlayed: 3,
    knockout,
  };
}

/** Play the same campaign for one country `times` over, everyone else blank. */
function ledgerOf(
  campaigns: Record<string, Parameters<typeof tournament>[0][string]>,
  times = COEFFICIENT_WINDOW,
): Coefficients {
  let record = createCoefficients();
  const keyed = Object.fromEntries(
    Object.entries(campaigns).map(([countryId, campaign]) => [nationId(countryId), campaign]),
  );
  for (let i = 0; i < times; i++) {
    record = recordEuropeanSeason(record, {
      clubs: {},
      nations: scoreTournament(tournament(keyed)),
    });
  }
  return record;
}

/**
 * The same, for a European season described as club scores.
 *
 * Every country is entered with a zero and the named ones overwrite it, because
 * "scored nothing" and "did not compete" are different things now: leaving a
 * country out of the scores says it never entered, which is neither counted nor
 * penalised.
 */
function everyCountry(scores: Record<string, number>): Record<string, number> {
  return { ...Object.fromEntries(IDS.map((id) => [id, 0])), ...scores };
}

function clubLedger(scores: Record<string, number>, times = COEFFICIENT_WINDOW): Coefficients {
  let record = createCoefficients();
  for (let i = 0; i < times; i++) {
    record = recordEuropeanSeason(record, { clubs: everyCountry(scores), nations: {} });
  }
  return record;
}

/**
 * A finished European competition: `winners` went through in each round.
 *
 * Built with EMPTY groups on purpose. The coefficient now counts group results
 * as well as knockout rounds, and these tests are about the knockout half — a
 * group stage bolted on here would move every expectation without testing
 * anything the group tests do not already cover.
 */
function competition(tier: EuropeanState['kind'], rounds: string[][], winnerId?: string): EuropeanState {
  return {
    kind: tier,
    groups: [],
    fixtures: [],
    results: [],
    table: [],
    groupRoundsPlayed: 0,
    knockout: {
      kind: tier,
      countryId: tier,
      rounds: rounds.map((through, index) => ({
        round: index + 1,
        ties: through.map((clubId) => ({
          homeId: clubId,
          awayId: `beaten-${clubId}-${index}`,
          winnerId: clubId,
        })),
      })),
      survivors: winnerId ? [winnerId] : [],
      winnerId: winnerId ?? null,
      eliminatedInRound: null,
    },
  };
}

describe('scoring one campaign', () => {
  it('counts group results', () => {
    const scores = scoreTournament(tournament({ [nationId('spain')]: { won: 2, drawn: 1 } }));
    expect(scores.spain).toBe(2 * GROUP_WIN + GROUP_DRAW);
  });

  it('adds a bonus for each round reached', () => {
    const scores = scoreTournament(
      tournament({
        [nationId('spain')]: { won: 3, knockout: true, final: true, champion: true },
        [nationId('italy')]: { won: 2, knockout: true, final: true },
        [nationId('france')]: { won: 1, knockout: true },
        [nationId('england')]: { won: 1 },
      }),
    );
    expect(scores.spain).toBe(3 * GROUP_WIN + KNOCKOUT_BONUS + FINAL_BONUS + CHAMPION_BONUS);
    expect(scores.italy).toBe(2 * GROUP_WIN + KNOCKOUT_BONUS + FINAL_BONUS);
    expect(scores.france).toBe(1 * GROUP_WIN + KNOCKOUT_BONUS);
    expect(scores.england).toBe(1 * GROUP_WIN);
  });

  it('cannot score more than a perfect campaign', () => {
    const scores = scoreTournament(
      tournament({ [nationId('spain')]: { won: 3, knockout: true, final: true, champion: true } }),
    );
    expect(scores.spain).toBe(MAX_CAMPAIGN);
    for (const value of Object.values(scores)) expect(value).toBeLessThanOrEqual(MAX_CAMPAIGN);
  });

  it('gives every country a score, including the ones that lost everything', () => {
    const scores = scoreTournament(tournament({}));
    for (const id of IDS) expect(scores[id], id).toBe(0);
  });
});

describe('scoring a European season', () => {
  /** Two English clubs and one Scottish, all in the Champions League. */
  const entries: EuropeanEntries = {
    'ashford-united': 'championsLeague',
    'northport-city': 'championsLeague',
    'glenmorra-rangers': 'championsLeague',
  };
  const countryOf = (id: string) => (id === 'glenmorra-rangers' ? 'scotland' : 'england');

  it('counts the rounds a club won', () => {
    const scores = scoreEuropeanSeason(
      entries,
      {
        championsLeague: competition('championsLeague', [
          ['ashford-united', 'northport-city', 'glenmorra-rangers'],
          ['ashford-united'],
        ]),
      },
      countryOf,
    );
    // England: one club won two rounds, one won one — three between two clubs.
    expect(scores.england).toBeCloseTo((3 * EUROPEAN_ROUND_WIN) / 2, 5);
    expect(scores.scotland).toBeCloseTo(EUROPEAN_ROUND_WIN, 5);
  });

  it('adds a bonus for lifting it', () => {
    const withTrophy = scoreEuropeanSeason(
      entries,
      {
        championsLeague: competition(
          'championsLeague',
          [['glenmorra-rangers'], ['glenmorra-rangers']],
          'glenmorra-rangers',
        ),
      },
      countryOf,
    );
    expect(withTrophy.scotland).toBeCloseTo(2 * EUROPEAN_ROUND_WIN + EUROPEAN_TROPHY, 5);
  });

  it('is measured PER CLUB ENTERED, not as a total', () => {
    // The property the whole thing rests on. A country at the top of the order
    // enters seven clubs and one at the bottom five, so a raw total would
    // reward a country for the places it already has: the rich would compound
    // and the order could never move again.
    const oneClub = scoreEuropeanSeason(
      { a: 'championsLeague' },
      { championsLeague: competition('championsLeague', [['a'], ['a']]) },
      () => 'spain',
    );
    const fourClubs = scoreEuropeanSeason(
      { a: 'championsLeague', b: 'championsLeague', c: 'championsLeague', d: 'championsLeague' },
      { championsLeague: competition('championsLeague', [['a'], ['a']]) },
      () => 'spain',
    );
    expect(oneClub.spain).toBeGreaterThan(fourClubs.spain!);
  });

  it('weights the competitions against each other', () => {
    const run = (tier: 'championsLeague' | 'conferenceLeague') =>
      scoreEuropeanSeason(
        { a: tier },
        { [tier]: competition(tier, [['a'], ['a']]) },
        () => 'italy',
      ).italy;
    expect(run('championsLeague')).toBeCloseTo(2 * EUROPEAN_ROUND_WIN * TIER_WEIGHT.championsLeague, 5);
    expect(run('conferenceLeague')).toBeCloseTo(2 * EUROPEAN_ROUND_WIN * TIER_WEIGHT.conferenceLeague, 5);
    expect(run('championsLeague')).toBeGreaterThan(run('conferenceLeague')!);
  });

  it('scores nothing rather than nothing at all for a club that lost its first tie', () => {
    const scores = scoreEuropeanSeason(
      { a: 'championsLeague' },
      { championsLeague: competition('championsLeague', [['somebody-else']]) },
      () => 'france',
    );
    expect(scores.france).toBe(0);
  });

  it('ignores a competition that was never played', () => {
    const scores = scoreEuropeanSeason(entries, { championsLeague: null }, countryOf);
    expect(scores).toEqual({});
  });
});

describe('the two halves together', () => {
  it('lets a country climb on its clubs alone', () => {
    const smallest = IDS[IDS.length - 1]!;
    const above = IDS[IDS.length - 2]!;
    const record = clubLedger({ [smallest]: 4, [above]: 0 });
    expect(standingOf(record, smallest)).toBeGreaterThan(standingOf(record, above));
  });

  it('makes a point of club form worth more than a point of international form', () => {
    // The same numeric deviation in each half, so only the scales differ. Small
    // enough that neither hits the clamp, which is where the comparison would
    // stop meaning anything.
    const country = IDS[0]!;
    const onClubs = clubLedger({ [country]: 1 });
    const onNations = recordAcross({ [country]: 1 }, 'nations');
    expect(coefficientNudge(onClubs, country)).toBeGreaterThan(
      coefficientNudge(onNations, country),
    );
    expect(CLUB_SCALE).toBeGreaterThan(NATION_SCALE);
  });

  it('lets either half alone carry a country as far as the swing allows', () => {
    // The mistake this replaced: weighting the halves as shares of one movement
    // meant a country with a perfect international record and ordinary clubs
    // could only reach its share of the swing, which deleted the one thing a
    // player's own performances can change about the world.
    const country = IDS[IDS.length - 1]!;
    const nationsOnly = recordAcross({ [country]: MAX_CAMPAIGN }, 'nations');
    const clubsOnly = clubLedger({ [country]: 3 });
    expect(coefficientNudge(nationsOnly, country)).toBeGreaterThan(COEFFICIENT_SWING * 0.6);
    expect(coefficientNudge(clubsOnly, country)).toBeGreaterThan(COEFFICIENT_SWING * 0.6);
  });

  it('never moves a country past the swing, however well it does at both', () => {
    const country = IDS[IDS.length - 1]!;
    let record = createCoefficients();
    for (let i = 0; i < COEFFICIENT_WINDOW; i++) {
      record = recordEuropeanSeason(record, {
        clubs: everyCountry({ [country]: 99 }),
        nations: everyCountry({ [country]: 99 }),
      });
    }
    expect(coefficientNudge(record, country)).toBeLessThanOrEqual(COEFFICIENT_SWING);
    expect(coefficientNudge(record, country)).toBeGreaterThan(0);
  });

  it('reports the two halves separately', () => {
    const country = IDS[0]!;
    let record = createCoefficients();
    for (let i = 0; i < COEFFICIENT_WINDOW; i++) {
      record = recordEuropeanSeason(record, {
        clubs: everyCountry({ [country]: 3 }),
        nations: everyCountry({ [country]: 5 }),
      });
    }
    expect(clubCoefficient(record, country)).toBe(3);
    expect(nationCoefficient(record, country)).toBe(5);
  });
});

/** A record built by repeating one season's scores into one half. */
function recordAcross(scores: Record<string, number>, half: 'clubs' | 'nations'): Coefficients {
  let record = createCoefficients();
  for (let i = 0; i < COEFFICIENT_WINDOW; i++) {
    record = recordEuropeanSeason(record, {
      clubs: half === 'clubs' ? everyCountry(scores) : {},
      nations: half === 'nations' ? everyCountry(scores) : {},
    });
  }
  return record;
}

describe('the rolling window', () => {
  it('remembers only the most recent tournaments', () => {
    let record = createCoefficients();
    for (let i = 0; i < COEFFICIENT_WINDOW + 3; i++) {
      record = recordEuropeanSeason(record, { clubs: {}, nations: { england: i } });
    }
    expect(record.nations.england).toHaveLength(COEFFICIENT_WINDOW);
    // The oldest have fallen off the front, not the newest off the back.
    expect(record.nations.england?.at(-1)).toBe(COEFFICIENT_WINDOW + 2);
  });

  it('ages a country that scores nothing rather than freezing it', () => {
    let record = recordEuropeanSeason(createCoefficients(), {
      clubs: {},
      nations: { england: MAX_CAMPAIGN },
    });
    expect(nationCoefficient(record, 'england')).toBe(MAX_CAMPAIGN);
    for (let i = 0; i < COEFFICIENT_WINDOW; i++) {
      record = recordEuropeanSeason(record, { clubs: {}, nations: {} });
    }
    expect(nationCoefficient(record, 'england')).toBe(0);
  });

  it('averages rather than totals, so a short career is not punished', () => {
    const one = recordEuropeanSeason(createCoefficients(), { clubs: {}, nations: { england: 4 } });
    const two = recordEuropeanSeason(one, { clubs: {}, nations: { england: 4 } });
    expect(nationCoefficient(one, 'england')).toBe(4);
    expect(nationCoefficient(two, 'england')).toBe(4);
  });

  it('knows when it has nothing on record', () => {
    expect(hasRecord(createCoefficients())).toBe(false);
    // A season nobody competed in is still nothing on record.
    expect(hasRecord(recordEuropeanSeason(createCoefficients(), { clubs: {}, nations: {} }))).toBe(
      false,
    );
    expect(
      hasRecord(recordEuropeanSeason(createCoefficients(), { clubs: { england: 1 }, nations: {} })),
    ).toBe(true);
  });
});

describe('the European order', () => {
  it('is plain prestige order before anything has been played', () => {
    expect(countriesByStanding(createCoefficients())).toEqual(IDS);
    for (const id of IDS) {
      expect(standingOf(createCoefficients(), id)).toBe(
        countriesByPrestige().find((c) => c.id === id)!.prestige,
      );
    }
  });

  it('leaves a level field standing where it started', () => {
    // Every country doing equally well is not an era of dominance for anybody.
    const level = ledgerOf(Object.fromEntries(IDS.map((id) => [id, { won: 2 }])));
    expect(countriesByStanding(level)).toEqual(IDS);
    for (const id of IDS) expect(Math.abs(coefficientNudge(level, id))).toBeLessThan(0.01);
  });

  it('lifts a country that keeps winning above its neighbours', () => {
    const last = IDS[IDS.length - 1]!;
    const above = IDS[IDS.length - 2]!;
    const ledger = ledgerOf({
      [last]: { won: 3, knockout: true, final: true, champion: true },
      [above]: {},
    });
    expect(standingOf(ledger, last)).toBeGreaterThan(standingOf(ledger, above));
    expect(countriesByStanding(ledger).indexOf(last)).toBeLessThan(
      countriesByStanding(ledger).indexOf(above),
    );
  });

  it('bends the map without tearing it', () => {
    // The smallest country playing perfectly while the biggest plays terribly
    // still does not make it the biggest country in the world. Prestige is the
    // anchor precisely so that the order stays recognisable: 0.50 against 1.00
    // is half the scale, and the swing is a fifth of it.
    const last = IDS[IDS.length - 1]!;
    const first = IDS[0]!;
    const ledger = ledgerOf({
      [last]: { won: 3, knockout: true, final: true, champion: true },
      [first]: {},
    });
    expect(standingOf(ledger, first)).toBeGreaterThan(standingOf(ledger, last));
  });

  it('never moves a country further than the swing allows', () => {
    const ledger = ledgerOf({
      [IDS[IDS.length - 1]!]: { won: 3, knockout: true, final: true, champion: true },
    });
    for (const id of IDS) {
      expect(Math.abs(coefficientNudge(ledger, id)), id).toBeLessThanOrEqual(COEFFICIENT_SWING);
    }
  });

  it('moves a country less on one tournament than on a full window', () => {
    // One campaign is the noisiest evidence there is, and on an average it is
    // also the loudest. The ramp is what stops a single good summer redrawing
    // the map.
    const best = IDS[IDS.length - 1]!;
    const campaign = { [best]: { won: 3, knockout: true, final: true, champion: true } };
    const once = coefficientNudge(ledgerOf(campaign, 1), best);
    const full = coefficientNudge(ledgerOf(campaign, COEFFICIENT_WINDOW), best);
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(full);
  });

  it('averages only the countries that competed', () => {
    // One country entered, so the field IS that country: the eleven that did
    // not play are not counted as zeroes dragging the bar down.
    const record = recordEuropeanSeason(createCoefficients(), {
      clubs: {},
      nations: { england: 4 },
    });
    expect(fieldAverage(record.nations)).toBe(4);

    // Everybody entered and one did well: now the bar is the whole field.
    const full = recordEuropeanSeason(createCoefficients(), {
      clubs: {},
      nations: everyCountry({ england: 4 }),
    });
    expect(fieldAverage(full.nations)).toBeCloseTo(4 / IDS.length, 5);
  });

  it('does not punish a country for a tournament it was not in', () => {
    // The trap this exists to avoid: the tournament holds eight and the world
    // has twelve, so scoring the four who missed out as zeroes dragged them
    // down by most of what they would need to climb back into it. Missing out
    // would then be self-reinforcing and the bottom of the order sealed shut.
    const outsider = IDS[IDS.length - 1]!;
    const field = IDS.slice(0, IDS.length - 1);
    let record = createCoefficients();
    for (let i = 0; i < COEFFICIENT_WINDOW; i++) {
      record = recordEuropeanSeason(record, {
        clubs: {},
        nations: Object.fromEntries(field.map((id) => [id, 3])),
      });
    }
    // Never played, so the national half says nothing about it either way.
    expect(coefficientNudge(record, outsider)).toBe(0);
    expect(standingOf(record, outsider)).toBe(countryPrestige(outsider));
  });
});

describe('what the order is worth', () => {
  it('always fills every competition, whatever the order', () => {
    const shuffled = ledgerOf({
      [IDS[IDS.length - 1]!]: { won: 3, knockout: true, final: true, champion: true },
      [IDS[0]!]: {},
    });
    const order = countriesByStanding(shuffled);
    for (const tier of ['championsLeague', 'europaLeague', 'conferenceLeague'] as const) {
      const total = LEAGUE_COUNTRIES.reduce((sum, c) => sum + europeanPlaces(c.id, order)[tier], 0);
      expect(total, tier).toBe(16);
    }
  });

  it('rewards the smallest country for a golden generation', () => {
    // The case the whole mechanic exists for, and the one an earlier shape
    // could not reach: the bottom country climbing the order used to win it
    // nothing, because ranks six to eight all get one Champions League place.
    const smallest = IDS[IDS.length - 1]!;
    const before = europeanPlaces(smallest, IDS);
    const ledger = ledgerOf({
      [smallest]: { won: 3, knockout: true, final: true, champion: true },
      [IDS[IDS.length - 2]!]: {},
      [IDS[IDS.length - 3]!]: {},
    });
    const after = europeanPlaces(smallest, countriesByStanding(ledger));

    expect(after.europaLeague).toBeGreaterThan(before.europaLeague);
    expect(after.conferenceLeague).toBeLessThan(before.conferenceLeague);
  });

  it('sends a climbing country to better competitions, not to more of them', () => {
    const smallest = IDS[IDS.length - 1]!;
    const ledger = ledgerOf({
      [smallest]: { won: 3, knockout: true, final: true, champion: true },
      [IDS[IDS.length - 2]!]: {},
    });
    const total = (order: readonly string[]) => {
      const places = europeanPlaces(smallest, order);
      return places.championsLeague + places.europaLeague + places.conferenceLeague;
    };
    expect(total(countriesByStanding(ledger))).toBe(total(IDS));
  });

  it('takes a place off whoever was passed rather than inventing one', () => {
    const smallest = IDS[IDS.length - 1]!;
    const passed = IDS[IDS.length - 2]!;
    const ledger = ledgerOf({
      [smallest]: { won: 3, knockout: true, final: true, champion: true },
      [passed]: {},
    });
    const order = countriesByStanding(ledger);
    expect(europeanPlaces(smallest, order).europaLeague).toBeGreaterThan(
      europeanPlaces(passed, order).europaLeague,
    );
  });

  it('treats a country nobody has heard of as the smallest', () => {
    expect(championsLeaguePlaces('atlantis', IDS)).toBe(
      championsLeaguePlaces(IDS[IDS.length - 1]!, IDS),
    );
  });
});

describe('reading the order back', () => {
  it('reports every country with the numbers behind its place', () => {
    const ledger = ledgerOf({ [IDS[0]!]: { won: 3, knockout: true } });
    const rows = standingsTable(ledger);
    expect(rows).toHaveLength(IDS.length);
    expect(rows.map((row) => row.countryId)).toEqual(countriesByStanding(ledger));
    for (const row of rows) {
      expect(row.standing).toBeCloseTo(row.nudge + (row.standing - row.nudge), 5);
      expect(row.seasons).toBe(COEFFICIENT_WINDOW);
    }
  });

  it('says nothing has been played when nothing has', () => {
    for (const row of standingsTable(createCoefficients())) {
      expect(row.seasons).toBe(0);
      expect(row.clubs).toBe(0);
      expect(row.nations).toBe(0);
      expect(row.nudge).toBe(0);
    }
  });
});

describe('telling the player his league has moved', () => {
  it('says nothing when the allocation is unchanged', () => {
    expect(renderPlacesChange({ countryId: 'england', before: 3, after: 3 })).toBe('');
  });

  it('names the country and both numbers when it has', () => {
    const gained = renderPlacesChange({ countryId: 'scotland', before: 1, after: 2 });
    expect(gained).toContain('A place gained');
    expect(gained).toContain('Scotland');
    expect(gained).toContain('2 places');
    expect(gained).toContain('1 place');
    expect(gained).toContain('up');
  });

  it('reads as a loss when a place has gone', () => {
    const lost = renderPlacesChange({ countryId: 'england', before: 3, after: 2 });
    expect(lost).toContain('A place lost');
    expect(lost).toContain('slips');
    expect(lost).toContain('down');
  });

  it('gets the singular right, since one place is not "1 places"', () => {
    const lost = renderPlacesChange({ countryId: 'england', before: 2, after: 1 });
    expect(lost).toContain('1 place in the Champions League');
    expect(lost).not.toContain('1 places');
  });
});
