import { clamp, round } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { Player } from '../player/player.ts';
import type { TableRow } from './league.ts';
import { sortTable } from './league.ts';
import type { SeasonStats } from './seasonStats.ts';
import { averageRating } from './seasonStats.ts';
import type { DivisionMovement } from './divisions.ts';
import { countryPrestige, getCountry } from './countries.ts';
import type { CupKind } from './cups.ts';
import type { EuropeanTier } from './europe.ts';
import { europeanCompetition } from './europe.ts';

/**
 * AWARDS AND HONOURS
 *
 * A career needs a record of the things that cannot be taken back. Ability
 * decays, reputation settles, a club can relegate you — but a title is a title
 * ten seasons later, and an honours list is the only part of the save that only
 * ever grows.
 *
 * THE PROBLEM: individual awards need rivals, and the game has no other
 * footballers. There is no squad, no opposition scorer, nobody to finish second
 * in a vote. Inventing a full league of players to award one trophy would be a
 * simulation the rest of the game does not have and could not keep consistent.
 *
 * THE ANSWER: derive the rivals from the football that actually happened. Every
 * club's goals are already in the table, so the division's leading scorer is a
 * plausible SHARE of the goals its club really scored. That gives a golden boot
 * that responds to the season — a division full of 4-3s produces a higher bar
 * than a division of 1-0s — without pretending to know anyone's name.
 *
 * The benchmark is deterministic from the season seed, so an honour is never a
 * reroll away, and the player's own goals are removed from his club's total
 * before the bar is set: you are never competing against yourself.
 */

export type HonourKind =
  | 'title'
  | 'nationalCup'
  | 'leagueCup'
  | 'europeanTitle'
  | 'europeanFinal'
  | 'continentalTreble'
  | 'domesticDouble'
  | 'domesticTreble'
  | 'promotion'
  | 'relegation'
  | 'topScorer'
  | 'playerOfTheSeason'
  | 'youngPlayerOfTheSeason'
  | 'internationalDebut'
  | 'capMilestone';

export interface Honour {
  kind: HonourKind;
  season: number;
  clubId: string;
  /** The division it was won in, so a second-tier title reads as one. */
  division: number;
  /** The country it was won in. */
  countryId: string;
  /** Short name for the honours list. */
  label: string;
  /** One line of context, for the season review. */
  detail: string;
}

/**
 * Base reputation at which a player starts being picked for his country.
 *
 * The actual bar is this plus a share of his NATION'S prestige, because getting
 * into a great side is harder than getting into a poor one. See
 * `selectionThreshold` — it is what makes the nationality you pick at creation a
 * decision rather than a label.
 */
export const INTERNATIONAL_REPUTATION = 58;

/**
 * How much harder a strong footballing nation is to get into, in reputation.
 *
 * A Scot is capped early and often; a Spaniard has to be genuinely among the
 * best players in the world before anyone picks him. That is the whole trade
 * the nationality choice offers: caps and the honours that come with them, or
 * the prestige of the shirt.
 */
export const SELECTION_COMPETITION = 10;

/** The reputation a player of this nationality needs before he is picked. */
export function selectionThreshold(nationality: string): number {
  return INTERNATIONAL_REPUTATION + countryPrestige(nationality) * SELECTION_COMPETITION;
}

/** Caps that count as a career landmark. */
export const CAP_MILESTONES: readonly number[] = [1, 25, 50, 75, 100];

/**
 * The best individual season somebody else had in this division.
 *
 * Not a player — a bar. Everything here is inferred from the table, so it moves
 * with the division's real football rather than from a fixed threshold that a
 * strong career would sail past every year.
 */
export interface LeagueBenchmark {
  /** Goals scored by the division's leading scorer. */
  goldenBoot: number;
  /** Best average match rating in the division, 1-10. */
  bestRating: number;
  /** Best goals-plus-assists total in the division. */
  bestContributions: number;
}

/**
 * Share of a club's goals its leading scorer gets.
 * A real top scorer is somewhere between a quarter and two-fifths of the side.
 */
const TOP_SCORER_SHARE = { min: 0.24, max: 0.4 } as const;

export interface BenchmarkInput {
  table: readonly TableRow[];
  /** The player's club, whose goals are discounted by his own. */
  playerClubId: string;
  /** The player's goals, removed so he never sets his own bar. */
  playerGoals: number;
}

export function leagueBenchmark(rng: Rng, input: BenchmarkInput): LeagueBenchmark {
  const ranked = sortTable(input.table);
  let goldenBoot = 0;

  for (const row of ranked) {
    const scored =
      row.teamId === input.playerClubId
        ? Math.max(0, row.goalsFor - input.playerGoals)
        : row.goalsFor;
    const share = rng.range(TOP_SCORER_SHARE.min, TOP_SCORER_SHARE.max);
    goldenBoot = Math.max(goldenBoot, Math.round(scored * share));
  }

  // The best rating in a division tracks how good the best team is: a runaway
  // champion usually has somebody playing very well indeed.
  const champion = ranked[0];
  const perGame = champion && champion.played > 0 ? champion.points / champion.played : 1.5;
  const bestRating = round(clamp(6.85 + (perGame - 1.2) * 0.42 + rng.range(0, 0.18), 6.8, 8), 2);

  // Assists roughly half again on top of goals for a division's best attacker.
  const bestContributions = Math.round(goldenBoot * 1.45);

  return { goldenBoot, bestRating, bestContributions };
}

export interface HonoursInput {
  player: Player;
  stats: SeasonStats;
  season: number;
  clubId: string;
  division: number;
  /** The country whose league it was won in. */
  countryId: string;
  /** Final league position, 1 = champions. */
  position: number;
  /** Whether the club went up or down this season. */
  movement: DivisionMovement | null;
  /** Which of the two domestic knockouts the club won. */
  cupsWon: readonly CupKind[];
  /** The European competition played this season, if any. */
  europeanTier: EuropeanTier | null;
  /** True when the club won it. */
  wonEurope: boolean;
  /** True when it reached the final and lost it. */
  reachedEuropeanFinal: boolean;
  benchmark: LeagueBenchmark;
  /** Matches in a full season, so a part-season cannot win an award. */
  seasonLength: number;
}

export interface HonoursResult {
  honours: Honour[];
  /** International appearances added this season. */
  capsGained: number;
}

/**
 * Minimum share of a season a player must have played to win an individual
 * award. Nobody is player of the season on nine appearances.
 */
export const AWARD_MINIMUM_SHARE = 0.6;

/**
 * Everything the completed season is worth putting on the record.
 *
 * Team honours are facts — you either won it or you did not. Individual ones
 * are measured against the division benchmark, and all of them require having
 * actually played most of the season.
 */
export function evaluateHonours(input: HonoursInput): HonoursResult {
  const { player, stats, season, clubId, division } = input;
  // Honours are named after the COUNTRY, not the tier: "Spanish champions"
  // reads as football, "Division 1 champions" reads as a database.
  const info = getCountry(input.countryId);
  const honours: Honour[] = [];
  const at = (kind: HonourKind, label: string, detail: string): Honour => ({
    kind,
    season,
    clubId,
    division,
    countryId: input.countryId,
    label,
    detail,
  });

  if (input.position === 1) {
    honours.push(
      at('title', `${info.adjective} champions`, `You finished top of ${info.league}.`),
    );
  }
  // Cups are the club's, not the player's, so they are recorded whatever kind of
  // season he personally had — you do not have to have been good to have won it.
  const wonNational = input.cupsWon.includes('nationalCup');
  const wonLeagueCup = input.cupsWon.includes('leagueCup');
  if (wonNational) {
    honours.push(
      at('nationalCup', `${info.adjective} Cup`, `You won the ${info.adjective} Cup.`),
    );
  }
  if (wonLeagueCup) {
    honours.push(
      at('leagueCup', `${info.adjective} League Cup`, `You won the ${info.adjective} League Cup.`),
    );
  }

  // Europe. The biggest thing a club can win, and the only honour on the list
  // that is not decided inside one country.
  //
  // The TIER is what says the club was in it at all, so every European honour
  // below is gated on it rather than on the result flags alone — a season spent
  // entirely at home cannot produce a European trophy however the flags read.
  const wonEurope = !!input.europeanTier && input.wonEurope;
  if (input.europeanTier) {
    const competition = europeanCompetition(input.europeanTier);
    if (wonEurope) {
      honours.push(
        at('europeanTitle', competition.name, `You won ${competition.name}.`),
      );
    } else if (input.reachedEuropeanFinal) {
      // Losing a European final is not a trophy, and it is still the second
      // best season all but a handful of footballers ever have.
      honours.push(
        at(
          'europeanFinal',
          `${competition.short} finalist`,
          `You reached the final of ${competition.name}.`,
        ),
      );
    }
  }

  // A domestic double or treble is recorded as its own thing rather than left
  // to be inferred from three separate lines, because that is how football
  // talks about it and because it is the rarest thing on the list.
  const trophies = (input.position === 1 ? 1 : 0) + input.cupsWon.length;
  if (trophies === 3) {
    honours.push(
      at('domesticTreble', 'The treble', `League, Cup and League Cup in ${info.league}.`),
    );
  } else if (trophies === 2) {
    honours.push(at('domesticDouble', 'The double', `Two of the three domestic trophies.`));
  }

  // League, a domestic cup and Europe in one season. The rarest line on the
  // list by a distance, and it gets its own name for the same reason the
  // domestic treble does.
  if (wonEurope && input.position === 1 && input.cupsWon.length >= 1) {
    honours.push(
      at('continentalTreble', 'The continental treble', 'League, cup and Europe in one season.'),
    );
  }

  if (input.movement === 'promoted') {
    honours.push(at('promotion', 'Promoted', `Your club is going up out of ${info.league}.`));
  }
  if (input.movement === 'relegated') {
    honours.push(at('relegation', 'Relegated', `Your club is going down out of ${info.league}.`));
  }

  const played =
    input.seasonLength > 0 ? stats.matches / input.seasonLength : 0;
  const rating = averageRating(stats);
  const contributions = stats.goals + stats.assists;

  if (played >= AWARD_MINIMUM_SHARE) {
    if (stats.goals > 0 && stats.goals >= input.benchmark.goldenBoot) {
      honours.push(
        at(
          'topScorer',
          `${info.adjective} top scorer`,
          `${stats.goals} goals, more than anyone else in ${info.league}.`,
        ),
      );
    }

    const outplayedTheDivision =
      rating >= input.benchmark.bestRating && contributions >= input.benchmark.bestContributions;
    const wonSeniorAward = outplayedTheDivision && input.position <= 4;
    if (wonSeniorAward) {
      honours.push(
        at(
          'playerOfTheSeason',
          `${info.adjective} player of the season`,
          `A ${rating.toFixed(2)} average rating and ${contributions} goal contributions.`,
        ),
      );
    }

    // A separate, gentler bar, because a teenager is being judged against men.
    // Gated on the SENIOR AWARD rather than on the benchmark: a young player
    // who cleared both bars at a club that finished nowhere used to win
    // nothing at all, while a strictly worse season won the young player award.
    if (
      player.age <= 21 &&
      !wonSeniorAward &&
      rating >= input.benchmark.bestRating - 0.35 &&
      contributions >= input.benchmark.bestContributions * 0.6
    ) {
      honours.push(
        at(
          'youngPlayerOfTheSeason',
          `${info.adjective} young player of the season`,
          `The best season anyone under 22 had in ${info.league}.`,
        ),
      );
    }
  }

  // International football is a consequence of fame, not of a fixture list.
  const capsGained = capsForSeason(player, input.countryId);
  if (capsGained > 0) {
    const before = player.caps;
    const after = before + capsGained;
    if (before === 0) {
      const nation = getCountry(player.nationality);
      honours.push(
        at(
          'internationalDebut',
          `${nation.adjective} debut`,
          `You have been called up by ${nation.name}.`,
        ),
      );
    }
    for (const milestone of CAP_MILESTONES) {
      if (milestone > 1 && before < milestone && after >= milestone) {
        honours.push(
          at('capMilestone', `${milestone} caps`, `You reached ${milestone} international caps.`),
        );
      }
    }
  }

  return { honours, capsGained };
}

/**
 * Caps won in a season.
 *
 * Three things decide it, and they are genuinely different questions:
 *
 *   HIS NATIONALITY  sets the bar. Competing for a place in a strong national
 *                    side is harder than walking into a weak one.
 *   HIS REPUTATION   decides whether he clears it.
 *   HIS LEAGUE       decides how closely anyone was watching. A brilliant season
 *                    in a country nobody follows gets you looked at, but the
 *                    squad is picked from the well-watched leagues first.
 *
 * `leagueCountryId` is where he PLAYS; `player.nationality` is who he plays FOR.
 * They are frequently different and must not be conflated.
 */
export function capsForSeason(player: Player, leagueCountryId: string): number {
  const visibility = countryPrestige(leagueCountryId);
  const over = player.reputation - selectionThreshold(player.nationality);
  if (over < 0) return 0;
  return Math.round(clamp(2 + over * 0.16, 0, 10) * visibility);
}

/** Group an honours list by kind, for a hub that shows "3× champions". */
export function summariseHonours(honours: readonly Honour[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const honour of honours) {
    counts.set(honour.label, (counts.get(honour.label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
