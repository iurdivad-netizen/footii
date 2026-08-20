import { describe, expect, it } from 'vitest';
import '../src/data/gameData.ts';
import { COUNTRIES } from '../src/data/gameData.ts';
import {
  CHAMPION_BONUS,
  COEFFICIENT_SWING,
  COEFFICIENT_WINDOW,
  FINAL_BONUS,
  GROUP_DRAW,
  GROUP_WIN,
  KNOCKOUT_BONUS,
  MAX_CAMPAIGN,
  coefficientNudge,
  coefficientOf,
  countriesByStanding,
  createLedger,
  fieldAverage,
  hasRecord,
  recordTournament,
  scoreTournament,
  standingOf,
  standingsTable,
} from '../src/core/career/coefficients.ts';
import type { CoefficientLedger } from '../src/core/career/coefficients.ts';
import { countriesByPrestige } from '../src/core/career/countries.ts';
import { createCup } from '../src/core/career/cups.ts';
import { INTERNATIONAL } from '../src/core/career/international.ts';
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

  return { fixtures: [], results: [], table, groupRoundsPlayed: 3, knockout };
}

/** Play the same campaign for one country `times` over, everyone else blank. */
function ledgerOf(campaigns: Record<string, Parameters<typeof tournament>[0][string]>, times = COEFFICIENT_WINDOW): CoefficientLedger {
  let ledger = createLedger();
  const keyed = Object.fromEntries(
    Object.entries(campaigns).map(([countryId, campaign]) => [nationId(countryId), campaign]),
  );
  for (let i = 0; i < times; i++) {
    ledger = recordTournament(ledger, scoreTournament(tournament(keyed)));
  }
  return ledger;
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

describe('the rolling window', () => {
  it('remembers only the most recent tournaments', () => {
    let ledger = createLedger();
    for (let i = 0; i < COEFFICIENT_WINDOW + 3; i++) {
      ledger = recordTournament(ledger, { england: i });
    }
    expect(ledger.england).toHaveLength(COEFFICIENT_WINDOW);
    // The oldest have fallen off the front, not the newest off the back.
    expect(ledger.england?.at(-1)).toBe(COEFFICIENT_WINDOW + 2);
  });

  it('ages a country that scores nothing rather than freezing it', () => {
    let ledger = recordTournament(createLedger(), { england: MAX_CAMPAIGN });
    expect(coefficientOf(ledger, 'england')).toBe(MAX_CAMPAIGN);
    for (let i = 0; i < COEFFICIENT_WINDOW; i++) ledger = recordTournament(ledger, {});
    expect(coefficientOf(ledger, 'england')).toBe(0);
  });

  it('averages rather than totals, so a short career is not punished', () => {
    const one = recordTournament(createLedger(), { england: 4 });
    const two = recordTournament(one, { england: 4 });
    expect(coefficientOf(one, 'england')).toBe(4);
    expect(coefficientOf(two, 'england')).toBe(4);
  });

  it('knows when it has nothing on record', () => {
    expect(hasRecord(createLedger())).toBe(false);
    expect(hasRecord(recordTournament(createLedger(), {}))).toBe(true);
  });
});

describe('the European order', () => {
  it('is plain prestige order before anything has been played', () => {
    expect(countriesByStanding(createLedger())).toEqual(IDS);
    for (const id of IDS) {
      expect(standingOf(createLedger(), id)).toBe(
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

  it('averages only the countries that have played', () => {
    const ledger = recordTournament(createLedger(), { england: 4 });
    // Everybody was entered, so everybody is averaged — the seven who scored
    // nothing included.
    expect(fieldAverage(ledger)).toBeCloseTo(4 / IDS.length, 5);
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
      const total = COUNTRIES.reduce((sum, c) => sum + europeanPlaces(c.id, order)[tier], 0);
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
    expect(championsLeaguePlaces('atlantis', IDS)).toBe(1);
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
      expect(row.tournaments).toBe(COEFFICIENT_WINDOW);
    }
  });

  it('says nothing has been played when nothing has', () => {
    for (const row of standingsTable(createLedger())) {
      expect(row.tournaments).toBe(0);
      expect(row.coefficient).toBe(0);
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
