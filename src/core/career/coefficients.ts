import { clamp, round } from '../util/math.ts';
import {
  allCountries,
  confederationOf,
  countriesByPrestige,
  countryPrestige,
  nationsByPrestige,
} from './countries.ts';
import type { InternationalState } from './international.ts';
import { KNOCKOUT_ROUNDS, knockoutField } from './international.ts';
import { countryOfNation } from './nations.ts';
import type { EuropeanState } from './europe.ts';
import type { EuropeanEntries, EuropeanTier } from './europe.ts';
import { EUROPEAN_TIERS } from './europe.ts';

/**
 * THE COUNTRY COEFFICIENT
 *
 * How many Champions League places a country gets used to be a fixed list read
 * off a fixed prestige order: England always three, Scotland always one, for
 * eighteen seasons. That made the allocation a property of the data file rather
 * than of anything that happened, and it left the international tournament with
 * nothing to do outside the player's own honours list — five matches a year
 * that changed nothing about the world they were played in.
 *
 * So the allocation is now EARNED, over time, by how a country's national side
 * has actually been doing. A country that keeps reaching finals climbs the
 * order and takes a place off one that keeps going out in the groups.
 *
 * WHY A ROLLING RECORD RATHER THAN LAST YEAR'S WINNER. One tournament is five
 * matches decided by two knockout ties, which is far too little football to
 * move a country's standing on. Measured over sixty tournaments with no player
 * involved, England won thirteen and Spain seven — but Spain reached more
 * finals, so ranking on the trophy alone would have had them swapping places
 * almost every year. The window smooths that into something a career can plan
 * around: you can see your country climbing, and you can see why.
 *
 * WHY THE WHOLE CAMPAIGN COUNTS. Group results are the stable part of the
 * signal — every nation plays exactly three, every year — and the knockout
 * bonuses are what separate a country that keeps qualifying from one that keeps
 * winning. Scoring the trophy alone would have made the coefficient as noisy as
 * the thing it is meant to summarise.
 *
 * TWO HALVES, MEASURED SEPARATELY. A country's standing is earned by its
 * NATIONAL SIDE in the summer and by its CLUBS in Europe through the winter —
 * and real football's coefficient is the club half alone. Both are kept here,
 * because between them they say something neither says on its own: a country
 * can have one great generation and no clubs to speak of, or a dominant league
 * whose national side never turns up.
 *
 * They are two ledgers rather than one number because they are not on one
 * scale. A national campaign is at most eight points across five matches; a
 * club season is a longer, steadier thing measured per club entered. Adding
 * them before normalising would let whichever happened to be noisier decide
 * the order. Each is therefore measured against ITS OWN field average, and only
 * the resulting movements are combined — weighted toward the clubs, as football
 * weights them.
 *
 * WHY IT IS A NUDGE AND NOT THE WHOLE RANKING. Prestige is not only the
 * European pecking order: it scales wages, reputation and the bar for
 * international selection. If European places came purely from international
 * form, "a big country" would mean one thing for what you are paid and another
 * for what you can qualify for, and the player would be reading two different
 * worlds off one map. Prestige stays the anchor and the coefficient moves a
 * country around it — far enough that neighbours swap readily, and that a
 * sustained golden generation climbs a place or two over a decade, but not so
 * far that a good summer rewrites the map.
 */

/** How many tournaments the coefficient looks back over. */
export const COEFFICIENT_WINDOW = 5;

/** What one campaign is worth, point by point. */
export const GROUP_WIN = 1;
export const GROUP_DRAW = 0.5;
/** Reaching the knockout at all: the top two of a group of four. */
export const KNOCKOUT_BONUS = 1.5;
/** Winning a semi-final. */
export const FINAL_BONUS = 1.5;
/** Lifting it. */
export const CHAMPION_BONUS = 2;

/**
 * How much each tournament counts.
 *
 * A World Cup is the harder thing by some distance — sixteen nations from every
 * confederation rather than eight from one — so a group win in it is worth more
 * than a group win at home. Without this a country could farm a weak
 * confederation's championship into a standing its World Cups never justified.
 */
export const TOURNAMENT_WEIGHT: Record<string, number> = {
  worldCup: 1.3,
  continental: 1,
};

/** The most one nation can score in one tournament: win the group, win the lot. */
export const MAX_CAMPAIGN = 3 * GROUP_WIN + KNOCKOUT_BONUS + FINAL_BONUS + CHAMPION_BONUS;

/**
 * How far a coefficient can move a country from its prestige, either way.
 *
 * Calibrated against the gaps it has to bridge. The shipped world runs 1.00,
 * 0.96, 0.92, 0.90, 0.80, 0.68, 0.66, 0.50, so neighbouring countries sit 0.02
 * to 0.16 apart.
 *
 * It was 0.15, and 0.15 was a ceiling disguised as a range. Played out, a
 * Scottish career that won five caps a season for eighteen years drove
 * Scotland's coefficient to 6.0 — the best record in the world by some margin —
 * and Scotland's allocation never moved once, because the 0.16 to the
 * Netherlands is more than the whole swing and no record, however good, could
 * cover it alone. The one country with everything to gain from the mechanic was
 * the one country the mechanic could not reach.
 *
 * At 0.20 the bottom country can climb a place on its own merit rather than
 * having to wait for the country above it to collapse at the same time. It
 * costs nothing at the top: the gaps there are 0.02 to 0.04 and were already
 * crossable, and the 3-3-3-2-2-1-1-1 distribution has plateaus, so reordering
 * the top three changes nobody's allocation anyway. The map bends further; it
 * still does not tear.
 */
export const COEFFICIENT_SWING = 0.2;

/**
 * Points of prestige per point of coefficient above the field's average.
 *
 * Set from the measured spread, and the first attempt was set from the wrong
 * measurement. Averaged over sixty tournaments a country's coefficient lands
 * between 2.0 and 3.3, which suggested a scale of 0.2 — but no country is ever
 * judged on sixty tournaments. Judged on the five in the window, real
 * coefficients ran from 1.7 to 5.3, so deviations reached ±2.4 and every one of
 * them clamped: five countries of eight sat pinned at exactly the maximum swing
 * and the nudge stopped being a gradient at all. It had become "top group up,
 * bottom group down", which reorders on a knife edge and flips an allocation
 * whenever two countries trade places by a hair.
 *
 * At this scale the widest era on record lands just inside the swing, so the
 * clamp is the guard rail it was meant to be and a country half a point clear
 * of the field moves by 0.03 — a nudge, resolved by prestige when it is not
 * enough.
 */
export const COEFFICIENT_SCALE = 0.06;

/** What one club's European run is worth, per knockout round it won. */
export const EUROPEAN_ROUND_WIN = 1;
/** And for lifting the thing. */
export const EUROPEAN_TROPHY = 2;

/**
 * What a group match is worth.
 *
 * A third of a knockout round, and half that for a draw. Deliberately small:
 * there are three group matches and only three knockout rounds, so pricing them
 * equally would make a country's coefficient mostly a record of the group stage
 * — which is the half where nobody is eliminated.
 */
export const EUROPEAN_GROUP_WIN = 0.34;
export const EUROPEAN_GROUP_DRAW = 0.17;

/**
 * How much each competition counts.
 *
 * A quarter-final in the Champions League is not the same evening as a
 * quarter-final in the Conference League, and a coefficient that treated them
 * alike would reward a country for sending clubs to competitions it could win
 * rather than for being good at football.
 */
export const TIER_WEIGHT: Record<EuropeanTier, number> = {
  championsLeague: 1,
  europaLeague: 0.7,
  conferenceLeague: 0.5,
};

/**
 * How much a point of each half is worth, in prestige.
 *
 * ADDITIVE CONTRIBUTIONS, each on its own scale, with only the total clamped —
 * and the first attempt got this wrong in a way worth recording. Weighting the
 * two halves as shares of one movement (0.6 clubs, 0.4 nation) looked like the
 * obvious way to say "clubs count more". What it actually said was "each half
 * alone can only reach its share of the swing": a country with a perfect
 * international record and ordinary clubs could move 0.08 where it used to move
 * 0.19, which deleted the one thing in this game a player's own performances
 * can change. A weighted average of two movements is smaller than either.
 *
 * So each half contributes on its own terms and the SUM is clamped. "Clubs
 * count more" then means what it should: a point of club form is worth more
 * prestige than a point of international form, and either, on its own, can
 * still carry a country as far as the swing allows.
 *
 * Both scales are set from the MEASURED spread of their own ledger, because the
 * two spreads are nothing like each other. Over 240 country-seasons: club
 * coefficients ran 0.19 to 1.52 with deviations from the field reaching ±0.77
 * (95th percentile 0.41), while national coefficients ran 0.50 to 6.10 with
 * deviations reaching ±3.22 (95th percentile 1.98) — five times wider, because
 * one is an average per club entered and the other is a whole campaign. Scaled
 * as measured, a typical good club era is worth about 0.14 of prestige and a
 * typical good international era about 0.12, so the clubs are the larger half
 * without the smaller one being a rounding error.
 */
export const NATION_SCALE = 0.06;
export const CLUB_SCALE = 0.34;

/**
 * What each country's clubs earned from one European season.
 *
 * PER CLUB ENTERED, which is the whole reason this is not a sum. A country at
 * the top of the order sends seven clubs to Europe and one at the bottom sends
 * five, so a raw total would reward a country for the places it already has and
 * the order could never move — the rich would compound and the map would set
 * like concrete. Dividing by the field a country actually sent asks the only
 * question worth asking: how well did its clubs do, each of them?
 */
export function scoreEuropeanSeason(
  entries: EuropeanEntries,
  competitions: Partial<Record<EuropeanTier, EuropeanState | null>>,
  countryOf: (clubId: string) => string | null,
): Record<string, number> {
  const earned: Record<string, number> = {};
  const entered: Record<string, number> = {};

  for (const tier of EUROPEAN_TIERS) {
    const competition = competitions[tier];
    if (!competition) continue;
    const weight = TIER_WEIGHT[tier];

    for (const [clubId, clubTier] of Object.entries(entries)) {
      if (clubTier !== tier) continue;
      const countryId = countryOf(clubId);
      if (!countryId) continue;
      entered[countryId] = (entered[countryId] ?? 0) + 1;

      // Two halves, counted the same way and for the same reason: what a
      // country earns is what its clubs actually did, and a group stage is
      // football a club won or lost as much as a tie is. Group MATCHES are
      // worth less than knockout rounds because there are three of them and a
      // club that wins all three has still not knocked anybody out.
      const groupWins = competition.results.filter(
        (result) =>
          (result.homeId === clubId && result.homeGoals > result.awayGoals) ||
          (result.awayId === clubId && result.awayGoals > result.homeGoals),
      ).length;
      const groupDraws = competition.results.filter(
        (result) =>
          (result.homeId === clubId || result.awayId === clubId) &&
          result.homeGoals === result.awayGoals,
      ).length;

      // A knockout tie cannot end level, so rounds survived IS the record.
      const knockout = competition.knockout;
      const roundsWon = knockout
        ? knockout.rounds.filter((round) => round.ties.some((tie) => tie.winnerId === clubId))
            .length
        : 0;
      const trophy = knockout?.winnerId === clubId ? EUROPEAN_TROPHY : 0;
      earned[countryId] =
        (earned[countryId] ?? 0) +
        (groupWins * EUROPEAN_GROUP_WIN +
          groupDraws * EUROPEAN_GROUP_DRAW +
          roundsWon * EUROPEAN_ROUND_WIN +
          trophy) *
          weight;
    }
  }

  const scores: Record<string, number> = {};
  for (const [countryId, total] of Object.entries(earned)) {
    const clubs = entered[countryId] ?? 0;
    scores[countryId] = clubs > 0 ? round(total / clubs, 2) : 0;
  }
  // A country that entered nobody scores nothing, rather than being left out
  // and quietly keeping last year's average.
  for (const countryId of Object.keys(entered)) scores[countryId] ??= 0;

  return scores;
}

/**
 * One country's most recent seasons in one competition, oldest first.
 *
 * `null` means DID NOT COMPETE, which is not the same as scored nothing. The
 * tournament holds eight nations and the world has twelve, so a country outside
 * the field plays no international football that year — and scoring that as a
 * zero was a trap: it dragged every non-qualifying country down by about a
 * fifth of the swing, which is most of what it would need to climb back INTO
 * the tournament. Not qualifying became self-reinforcing, and the bottom of the
 * order was sealed shut. A null neither helps nor hurts: it says the ledger has
 * nothing to report, so the country is judged on the half it did play.
 *
 * Stored rather than derived, unlike almost everything else about the world. A
 * past season CANNOT be recomputed: national sides are built from their
 * country's clubs as they stood at the time, and club drift only ever carries
 * the current strengths, so the world that played the tournament of season four
 * no longer exists by season nine. A dozen countries times five numbers is a
 * cheap thing to remember and an impossible thing to reconstruct.
 */
export type CoefficientLedger = Record<string, (number | null)[]>;

/**
 * A country's whole European record: what its clubs did, and what its nation did.
 *
 * Two ledgers rather than one, because the two are not on one scale — see the
 * note at the top of this file.
 */
export interface Coefficients {
  clubs: CoefficientLedger;
  nations: CoefficientLedger;
}

export function createCoefficients(): Coefficients {
  return { clubs: {}, nations: {} };
}

/** What each country's national side earned from one finished tournament. */
export function scoreTournament(state: InternationalState): Record<string, number> {
  const scores: Record<string, number> = {};
  const qualified = new Set(knockoutField(state));
  const knockout = state.knockout;
  // The last round of a complete bracket is the final, read by the tournament's
  // OWN depth: a World Cup is three rounds and a continental championship two,
  // so a fixed index would score a World Cup semi-final as a final.
  const depth = state.knockoutRounds ?? KNOCKOUT_ROUNDS;
  const finalRound = knockout?.rounds[depth - 1];
  const finalists = new Set(
    finalRound ? finalRound.ties.flatMap((tie) => [tie.homeId, tie.awayId]) : [],
  );

  for (const row of state.table) {
    const countryId = countryOfNation(row.teamId);
    if (!countryId) continue;

    let score = row.won * GROUP_WIN + row.drawn * GROUP_DRAW;
    if (qualified.has(row.teamId)) score += KNOCKOUT_BONUS;
    if (finalists.has(row.teamId)) score += FINAL_BONUS;
    if (knockout?.winnerId === row.teamId) score += CHAMPION_BONUS;

    scores[countryId] = round(score * (TOURNAMENT_WEIGHT[state.kind] ?? 1), 2);
  }

  return scores;
}

/**
 * Add one season to both ledgers, dropping whatever has fallen out of the
 * window.
 *
 * A country absent from the scores is recorded as having NOT COMPETED rather
 * than as having scored nothing — see the note on the ledger. It still ages:
 * the null takes a slot in the window, so a country five seasons out of the
 * tournament has an empty record and its national side stops counting either
 * way, rather than freezing at whatever it last managed.
 */
export function recordEuropeanSeason(
  record: Coefficients,
  scores: { clubs: Record<string, number>; nations: Record<string, number> },
): Coefficients {
  return {
    clubs: pushSeason(record.clubs, scores.clubs),
    nations: pushSeason(record.nations, scores.nations),
  };
}

function pushSeason(ledger: CoefficientLedger, scores: Record<string, number>): CoefficientLedger {
  const updated: CoefficientLedger = {};
  const countries = new Set([
    ...Object.keys(ledger),
    ...Object.keys(scores),
    ...allCountries().map((country) => country.id),
  ]);

  for (const countryId of countries) {
    const played = countryId in scores ? scores[countryId]! : null;
    const history = [...(ledger[countryId] ?? []), played];
    updated[countryId] = history.slice(-COEFFICIENT_WINDOW);
  }

  return updated;
}

/**
 * What a country has averaged per season in one ledger.
 *
 * An average rather than a total, so a country is not punished for a career
 * that has not run long enough to fill the window yet — in season two, one good
 * season is the whole record and counts as such.
 */
export function coefficientOf(ledger: CoefficientLedger, countryId: string): number {
  const played = competed(ledger, countryId);
  if (played.length === 0) return 0;
  return round(played.reduce((sum, score) => sum + score, 0) / played.length, 2);
}

/** The seasons a country actually competed in, out of the window. */
function competed(ledger: CoefficientLedger, countryId: string): number[] {
  return (ledger[countryId] ?? []).filter((score): score is number => score !== null);
}

/** What a country's clubs have averaged in Europe. */
export function clubCoefficient(record: Coefficients, countryId: string): number {
  return coefficientOf(record.clubs, countryId);
}

/** What a country's national side has averaged. */
export function nationCoefficient(record: Coefficients, countryId: string): number {
  return coefficientOf(record.nations, countryId);
}

/** True once there is any season on record at all, in either ledger. */
export function hasRecord(record: Coefficients): boolean {
  return [record.clubs, record.nations].some((ledger) =>
    Object.values(ledger).some((history) => history.some((score) => score !== null)),
  );
}

/**
 * The average across every country that has actually competed in one ledger.
 *
 * Countries with no record at all are left out rather than counted as zero: a
 * country the world has never heard of should not drag the bar down for the
 * ones it is measuring.
 */
export function fieldAverage(ledger: CoefficientLedger): number {
  const recorded = Object.keys(ledger).filter((id) => competed(ledger, id).length > 0);
  if (recorded.length === 0) return 0;
  return recorded.reduce((sum, id) => sum + coefficientOf(ledger, id), 0) / recorded.length;
}

/**
 * How far one ledger alone moves a country from its prestige.
 *
 * Measured against the FIELD's average rather than against the best and worst
 * of it. Normalising to the extremes would hand the leading country the full
 * swing every single year however narrow the gap behind it — an era in which
 * all the nations are level would read as an era of total dominance. Against
 * the average, a level field produces nudges of nearly nothing, which is the
 * honest answer.
 */
function ledgerNudge(ledger: CoefficientLedger, countryId: string, scale: number): number {
  const played = competed(ledger, countryId).length;
  if (played === 0) return 0;
  const deviation = coefficientOf(ledger, countryId) - fieldAverage(ledger);
  const moved = deviation * scale;
  // How much of the window a country has filled, 0-1. One season is the
  // noisiest evidence there is and, on an average, also the loudest: a country
  // that wins its first tournament has a coefficient of eight and nothing to
  // temper it. Ramping by the record's depth means a single good year moves a
  // country a fifth as far as five consistent ones do, which is both the honest
  // reading of the evidence and the better career arc — the map opens as the
  // data file drew it and becomes earned as the seasons accumulate.
  return moved * Math.min(1, played / COEFFICIENT_WINDOW);
}

/**
 * How much a country's whole record moves it from its prestige.
 *
 * Each half is measured against its OWN field average — the right
 * normalisation, since a club season and an international campaign are not on
 * one scale — and the two contributions are added. Only the total is clamped,
 * so a country that is excellent at both is capped rather than doubled, and a
 * country that is excellent at one is not quietly halved for it.
 */
export function coefficientNudge(record: Coefficients, countryId: string): number {
  const moved =
    ledgerNudge(record.clubs, countryId, CLUB_SCALE) +
    ledgerNudge(record.nations, countryId, NATION_SCALE);
  return round(clamp(moved, -COEFFICIENT_SWING, COEFFICIENT_SWING), 3);
}

/**
 * Where a country stands in the European order today.
 *
 * Prestige, bent by what its clubs and its national side have been doing. This
 * is the number the European places are handed out on.
 */
export function standingOf(record: Coefficients, countryId: string): number {
  return round(countryPrestige(countryId) + coefficientNudge(record, countryId), 3);
}

/**
 * Every country in European order, best first.
 *
 * Falls back to plain prestige order while nothing has been played, which is
 * exactly season one: the allocation a career opens with is the one the data
 * file describes, and it starts moving the moment there is a season to move it.
 */
export function countriesByStanding(record: Coefficients): string[] {
  const prestigeOrder = countriesByPrestige().map((country) => country.id);
  if (!hasRecord(record)) return prestigeOrder;

  return prestigeOrder
    .slice()
    .sort((a, b) => {
      const difference = standingOf(record, b) - standingOf(record, a);
      // Prestige order breaks a tie, so the ordering is total and stable and
      // two countries level on everything never swap from one look to the next.
      if (difference !== 0) return difference;
      return prestigeOrder.indexOf(a) - prestigeOrder.indexOf(b);
    });
}

/** Every nation of ONE confederation in standing order, best first. */
export function confederationByStanding(record: Coefficients, confederation: string): string[] {
  return nationsByStanding(record).filter((id) => confederationOf(id) === confederation);
}

/**
 * Every NATION in the world in standing order, best first.
 *
 * The wider cousin of `countriesByStanding`, which is deliberately Europe only
 * because it hands out European places. This one includes the countries with no
 * league of their own, because a World Cup is seeded from all of them.
 */
export function nationsByStanding(record: Coefficients): string[] {
  const prestigeOrder = nationsByPrestige().map((country) => country.id);
  if (!hasRecord(record)) return prestigeOrder;

  return prestigeOrder
    .slice()
    .sort((a, b) => {
      const difference = standingOf(record, b) - standingOf(record, a);
      if (difference !== 0) return difference;
      return prestigeOrder.indexOf(a) - prestigeOrder.indexOf(b);
    });
}

/** One row of the European order, for showing the player why he gets what he gets. */
export interface StandingRow {
  countryId: string;
  /** Average points per European season, per club entered. */
  clubs: number;
  /** Average points per tournament for the national side, when it played. */
  nations: number;
  /** How many of the window's tournaments its national side was in. */
  tournaments: number;
  /** How far the two together have moved the country from its prestige. */
  nudge: number;
  /** Prestige plus the nudge: what the order is actually sorted on. */
  standing: number;
  /** How many seasons are on record, up to the window. */
  seasons: number;
}

/** The whole European order, best first, with the numbers behind it. */
export function standingsTable(record: Coefficients): StandingRow[] {
  return countriesByStanding(record).map((countryId) => ({
    countryId,
    clubs: clubCoefficient(record, countryId),
    nations: nationCoefficient(record, countryId),
    tournaments: competed(record.nations, countryId).length,
    nudge: coefficientNudge(record, countryId),
    standing: standingOf(record, countryId),
    seasons: Math.max(
      competed(record.clubs, countryId).length,
      competed(record.nations, countryId).length,
    ),
  }));
}
