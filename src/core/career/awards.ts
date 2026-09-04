import { clamp, round } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { Player } from '../player/player.ts';
import type { TableRow } from './league.ts';
import { sortTable } from './league.ts';
import type { SeasonStats } from './seasonStats.ts';
import { averageRating } from './seasonStats.ts';
import type { DivisionMovement } from './divisions.ts';
import { getCountry, leagueName } from './countries.ts';
import type { CupKind } from './cups.ts';
import type { EuropeanTier } from './europe.ts';
import { europeanCompetition } from './europe.ts';
import { caseSummary, madeHisCase } from './awardCase.ts';

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
  | 'superCup'
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
  | 'internationalTitle'
  | 'internationalFinal'
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
 * Selection — who gets picked for their country — lives in `nations.ts`, with
 * the national sides it decides entry to. It used to live here because caps
 * were an honour inferred from fame and nothing else; they are appearances in
 * real fixtures now, so the rule belongs beside the fixtures.
 */

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
  /**
   * True when the club won the super cup played at the START of this season.
   *
   * Belongs to the season it was played in rather than the one that earned the
   * place in it — you win a trophy on the day, not on the strength of the
   * summer before.
   */
  wonSuperCup?: boolean;
  /** The European competition played this season, if any. */
  europeanTier: EuropeanTier | null;
  /** True when the club won it. */
  wonEurope: boolean;
  /** True when it reached the final and lost it. */
  reachedEuropeanFinal: boolean;
  /**
   * International matches actually PLAYED this season, in any round.
   *
   * A cap used to be inferred from reputation and league visibility, because
   * there were no international fixtures to count. There are now, so this is
   * the count — a cap is a match, and a player who was picked and played five
   * has five.
   */
  internationalRounds: number;
  /** True when his nation won the tournament while he was in the squad. */
  wonInternational: boolean;
  /** True when it reached the final and lost it. */
  reachedInternationalFinal: boolean;
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
      at('title', `${info.adjective} champions`, `You finished top of ${leagueName(info.id)}.`),
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
  // One match, played before the season started, and a trophy all the same.
  if (input.wonSuperCup) {
    honours.push(
      at(
        'superCup',
        `${info.adjective} Super Cup`,
        `You won the ${info.adjective} Super Cup to open the season.`,
      ),
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
      at('domesticTreble', 'The treble', `League, Cup and League Cup in ${leagueName(info.id)}.`),
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
    honours.push(at('promotion', 'Promoted', `Your club is going up out of ${leagueName(info.id)}.`));
  }
  if (input.movement === 'relegated') {
    honours.push(at('relegation', 'Relegated', `Your club is going down out of ${leagueName(info.id)}.`));
  }

  const played =
    input.seasonLength > 0 ? stats.matches / input.seasonLength : 0;
  const rating = averageRating(stats);

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

    // JUDGED IN HIS OWN POSITION'S CURRENCY. The rating bar is common to all
    // three and unchanged; what a season has to SHOW beyond it is measured in
    // what that position actually produces — see core/career/awardCase.ts.
    const madeTheCase = madeHisCase({
      position: player.position,
      stats,
      benchmark: input.benchmark,
      played,
    });
    const outplayedTheDivision = rating >= input.benchmark.bestRating && madeTheCase;
    const wonSeniorAward = outplayedTheDivision && input.position <= 4;
    if (wonSeniorAward) {
      honours.push(
        at(
          'playerOfTheSeason',
          `${info.adjective} player of the season`,
          caseSummary(player.position, stats),
        ),
      );
    }

    // A separate, gentler bar, because a teenager is being judged against men.
    // Gated on the SENIOR AWARD rather than on the benchmark: a young player
    // who cleared both bars at a club that finished nowhere used to win
    // nothing at all, while a strictly worse season won the young player award.
    const madeYoungCase = madeHisCase({
      position: player.position,
      stats,
      // Six-tenths of the division's standard, applied to whichever currency
      // his position is judged in.
      benchmark: {
        ...input.benchmark,
        bestContributions: input.benchmark.bestContributions * 0.6,
      },
      played,
    });
    if (
      player.age <= 21 &&
      !wonSeniorAward &&
      rating >= input.benchmark.bestRating - 0.35 &&
      // The young award follows the senior one into the same currency: a
      // nineteen-year-old centre back was previously being asked for a
      // striker's numbers at 60% of a striker's bar, which is still a bar he
      // plays no part of the game near.
      madeYoungCase
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

  // The international tournament, which is not decided inside any one country
  // and is the only trophy a player cannot transfer his way into.
  if (input.internationalRounds > 0) {
    const nation = getCountry(player.nationality);
    if (input.wonInternational) {
      honours.push(
        at(
          'internationalTitle',
          `${nation.name} champions`,
          `You won the international tournament with ${nation.name}.`,
        ),
      );
    } else if (input.reachedInternationalFinal) {
      honours.push(
        at(
          'internationalFinal',
          `${nation.adjective} finalist`,
          `You reached the international final with ${nation.name}.`,
        ),
      );
    }
  }

  // Caps are APPEARANCES now — matches actually played in the shirt, counted by
  // the calendar rather than inferred from fame. Fame still decides selection;
  // it no longer decides how many times you turned out.
  const capsGained = input.internationalRounds;
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
 * What an honour IS, for a screen that has to show it in a table cell.
 *
 * Three kinds, because they answer different questions. A trophy is something
 * the club won; an award is something the player won; and a movement is
 * promotion or relegation — not an honour at all in the case of relegation, but
 * the most important thing that happened to that season and impossible to leave
 * out of a history that claims to list what a season contained.
 */
export type HonourTone = 'trophy' | 'award' | 'movement' | 'setback';

const HONOUR_TONES: Record<HonourKind, HonourTone> = {
  title: 'trophy',
  nationalCup: 'trophy',
  leagueCup: 'trophy',
  superCup: 'trophy',
  europeanTitle: 'trophy',
  continentalTreble: 'trophy',
  domesticDouble: 'trophy',
  domesticTreble: 'trophy',
  internationalTitle: 'trophy',
  europeanFinal: 'award',
  internationalFinal: 'award',
  topScorer: 'award',
  playerOfTheSeason: 'award',
  youngPlayerOfTheSeason: 'award',
  internationalDebut: 'award',
  capMilestone: 'award',
  promotion: 'movement',
  relegation: 'setback',
};

export function honourTone(kind: HonourKind): HonourTone {
  return HONOUR_TONES[kind] ?? 'award';
}

/**
 * Everything one season put on the list.
 *
 * The career history table used to print a 🏆 for the national cup and a 🥈 for
 * the league cup, and nothing else — so a season that won the league, the
 * double and the Champions League showed the same single icon as one that won a
 * minor cup, and a golden boot showed nothing at all. Everything needed was
 * already recorded; only the reading of it was missing.
 *
 * The honours list is the right source rather than `SeasonRecord`, because it
 * is the one place a season's trophies, its individual awards and its
 * promotions all sit together, already labelled and already in the country's
 * own words.
 */
export function honoursInSeason(
  honours: readonly Honour[],
  season: number,
): { label: string; tone: HonourTone; detail: string }[] {
  return honours
    .filter((honour) => honour.season === season)
    .map((honour) => ({
      label: honour.label,
      tone: honourTone(honour.kind),
      detail: honour.detail,
    }));
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
