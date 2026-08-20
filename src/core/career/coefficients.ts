import { clamp, round } from '../util/math.ts';
import { allCountries, countriesByPrestige, countryPrestige } from './countries.ts';
import type { InternationalState } from './international.ts';
import { KNOCKOUT_ROUNDS, knockoutField } from './international.ts';
import { countryOfNation } from './nations.ts';

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

/**
 * Each country's most recent campaigns, oldest first, keyed by country id.
 *
 * Stored rather than derived, unlike almost everything else about the world. A
 * past tournament CANNOT be recomputed: national sides are built from their
 * country's clubs as they stood at the time, and club drift only ever carries
 * the current strengths, so the world that played the tournament of season four
 * no longer exists by season nine. Eight countries times five numbers is a
 * cheap thing to remember and an impossible thing to reconstruct.
 */
export type CoefficientLedger = Record<string, number[]>;

export function createLedger(): CoefficientLedger {
  return {};
}

/** What each country's national side earned from one finished tournament. */
export function scoreTournament(state: InternationalState): Record<string, number> {
  const scores: Record<string, number> = {};
  const qualified = new Set(knockoutField(state));
  const knockout = state.knockout;
  // The last round of a complete bracket is the final. Read that way rather
  // than by index so a tournament of a different depth still scores.
  const finalRound = knockout?.rounds[KNOCKOUT_ROUNDS - 1];
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

    scores[countryId] = round(score, 2);
  }

  return scores;
}

/**
 * Add one tournament to the ledger, dropping whatever has fallen out of the
 * window.
 *
 * A country absent from the scores still ages: it is given a zero rather than
 * being left alone, so a country that somehow stops entering slides down the
 * order instead of freezing at whatever it last managed.
 */
export function recordTournament(
  ledger: CoefficientLedger,
  scores: Record<string, number>,
): CoefficientLedger {
  const updated: CoefficientLedger = {};
  const countries = new Set([
    ...Object.keys(ledger),
    ...Object.keys(scores),
    ...allCountries().map((country) => country.id),
  ]);

  for (const countryId of countries) {
    const history = [...(ledger[countryId] ?? []), scores[countryId] ?? 0];
    updated[countryId] = history.slice(-COEFFICIENT_WINDOW);
  }

  return updated;
}

/**
 * A country's coefficient: what its national side has averaged per tournament.
 *
 * An average rather than a total, so a country is not punished for a career
 * that has not run long enough to fill the window yet — in season two, one good
 * tournament is the whole record and counts as such.
 */
export function coefficientOf(ledger: CoefficientLedger, countryId: string): number {
  const history = ledger[countryId];
  if (!history || history.length === 0) return 0;
  return round(history.reduce((sum, score) => sum + score, 0) / history.length, 2);
}

/** True once there is any tournament on record at all. */
export function hasRecord(ledger: CoefficientLedger): boolean {
  return Object.values(ledger).some((history) => history.length > 0);
}

/**
 * The average coefficient across every country that has actually played.
 *
 * Countries with no record at all are left out rather than counted as zero: a
 * country the world has never heard of should not drag the bar down for the
 * ones it is measuring.
 */
export function fieldAverage(ledger: CoefficientLedger): number {
  const recorded = Object.keys(ledger).filter((id) => (ledger[id]?.length ?? 0) > 0);
  if (recorded.length === 0) return 0;
  return recorded.reduce((sum, id) => sum + coefficientOf(ledger, id), 0) / recorded.length;
}

/**
 * How much a country's record moves it from its prestige, positive or negative.
 *
 * Measured against the FIELD's average rather than against the best and worst
 * of it. Normalising to the extremes would hand the leading country the full
 * swing every single year however narrow the gap behind it — an era in which
 * all eight nations are level would read as an era of total dominance. Against
 * the average, a field that is level produces nudges of nearly nothing, which
 * is the honest answer.
 */
export function coefficientNudge(ledger: CoefficientLedger, countryId: string): number {
  if (!hasRecord(ledger)) return 0;
  const deviation = coefficientOf(ledger, countryId) - fieldAverage(ledger);
  const moved = clamp(deviation * COEFFICIENT_SCALE, -COEFFICIENT_SWING, COEFFICIENT_SWING);
  return round(moved * confidence(ledger, countryId), 3);
}

/**
 * How much of the window a country has actually filled, 0-1.
 *
 * One tournament is the noisiest evidence there is and, on an average, it is
 * also the loudest: a country that wins its first tournament has a coefficient
 * of eight and nothing to temper it. Ramping the nudge by how full the record
 * is means a single good summer moves a country a fifth as far as five
 * consistent ones do, which is both the honest reading of the evidence and the
 * better career arc — the map opens as the data file drew it and becomes
 * earned as the seasons accumulate.
 */
function confidence(ledger: CoefficientLedger, countryId: string): number {
  const played = ledger[countryId]?.length ?? 0;
  return Math.min(1, played / COEFFICIENT_WINDOW);
}

/**
 * Where a country stands in the European order today.
 *
 * Prestige, bent by what its national side has been doing. This is the number
 * the Champions League places are handed out on.
 */
export function standingOf(ledger: CoefficientLedger, countryId: string): number {
  return round(countryPrestige(countryId) + coefficientNudge(ledger, countryId), 3);
}

/**
 * Every country in European order, best first.
 *
 * Falls back to plain prestige order while nothing has been played, which is
 * exactly season one: the allocation a career opens with is the one the data
 * file describes, and it starts moving the moment there is a tournament to
 * move it.
 */
export function countriesByStanding(ledger: CoefficientLedger): string[] {
  const prestigeOrder = countriesByPrestige().map((country) => country.id);
  if (!hasRecord(ledger)) return prestigeOrder;

  return prestigeOrder
    .slice()
    .sort((a, b) => {
      const difference = standingOf(ledger, b) - standingOf(ledger, a);
      // Prestige order breaks a tie, so the ordering is total and stable and
      // two countries level on everything never swap from one look to the next.
      if (difference !== 0) return difference;
      return prestigeOrder.indexOf(a) - prestigeOrder.indexOf(b);
    });
}

/** One row of the European order, for showing the player why he gets what he gets. */
export interface StandingRow {
  countryId: string;
  /** Average points per tournament over the window. */
  coefficient: number;
  /** How far that has moved the country from its prestige. */
  nudge: number;
  /** Prestige plus the nudge: what the order is actually sorted on. */
  standing: number;
  /** How many tournaments are on record, up to the window. */
  tournaments: number;
}

/** The whole European order, best first, with the numbers behind it. */
export function standingsTable(ledger: CoefficientLedger): StandingRow[] {
  return countriesByStanding(ledger).map((countryId) => ({
    countryId,
    coefficient: coefficientOf(ledger, countryId),
    nudge: coefficientNudge(ledger, countryId),
    standing: standingOf(ledger, countryId),
    tournaments: ledger[countryId]?.length ?? 0,
  }));
}
