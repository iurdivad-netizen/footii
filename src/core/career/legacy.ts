import type { CareerState, HowItWasPlayed } from './career.ts';
import type { Team } from '../team/team.ts';
import type { Position } from '../player/positions.ts';
import type { Honour, HonourKind } from './awards.ts';
import type { TraitId } from '../player/traits.ts';
import type { Moment } from './moments.ts';
import { summariseHonours } from './awards.ts';
import type { Milestone } from './records.ts';
import { averageOf, lifetimeTotals, milestones } from './records.ts';
import { averageRating } from './seasonStats.ts';
import { currentAbility } from '../player/player.ts';
import { countryPrestige, getCountry } from './countries.ts';
import { INTERNATIONAL } from './international.ts';
import { round } from '../util/math.ts';

/**
 * THE END OF A CAREER, AND WHAT SURVIVES IT
 *
 * A career used to have exactly one ending: you pressed Abandon on the home
 * screen, a browser dialog asked whether you were sure, and eighteen seasons of
 * honours, records and history were deleted without ever being shown to you.
 * Nothing carried over, so there was no reason to have played the first career
 * before starting the second.
 *
 * This module is the other half of that. It turns a living `CareerState` — a
 * large, versioned, deeply-nested thing — into a `CareerLegacy`: a small, flat
 * summary that outlives the career it came from and can be ranked against
 * every other career the same browser has played.
 *
 * Two decisions are worth explaining.
 *
 * A legacy is a SUMMARY, not a snapshot. Keeping the whole `CareerState` would
 * be easy and wrong: it would multiply the save's size by however many careers
 * you have finished, and every future migration would have to migrate careers
 * nobody is playing any more. A legacy is finished — nothing will ever be added
 * to it — so it stores conclusions rather than the material they were drawn
 * from.
 *
 * A legacy stores NAMES as well as ids. Everything else in the save refers to
 * clubs by id and resolves them at render time, which is correct while the
 * career is live: the club drifts, gets promoted, and must be read fresh. A
 * finished career is the opposite case. It is a historical record, the club it
 * refers to may not exist in a later version of the data file, and a wall of
 * fame that throws because a club was renamed is worse than one that shows the
 * name the career actually played under.
 */

/** How a career came to an end. */
export type CareerEnding = 'retired' | 'abandoned';

/**
 * One season of a finished career, with its names already resolved.
 *
 * A flattened `SeasonRecord`, and flattened deliberately. The live record keeps
 * club and country as IDS because a live career must read them fresh — the club
 * drifts, gets promoted, is renamed by a later data file. A finished career is
 * the opposite case, and the rule the whole legacy is built on applies here
 * exactly as it does to the final club: store the name it was played under, so
 * a history cannot be made unreadable by a change to the world it happened in.
 */
export interface LegacySeason {
  seasonNumber: number;
  clubName: string;
  countryShort: string;
  age: number;
  /** Final league position. */
  position: number;
  matches: number;
  goals: number;
  assists: number;
  /** Already averaged, because nothing will ever be added to it again. */
  rating: number;
}

/** One move, with both clubs resolved for the same reason. */
export interface LegacyMove {
  season: number;
  age: number;
  fromClubName: string;
  toClubName: string;
  /** In millions. Zero on a free. */
  fee: number;
  free: boolean;
}

/**
 * Everything a finished career kept beyond its own summary.
 *
 * This is the part `summariseCareer`'s header note said a legacy would not
 * hold, and the note is worth re-reading rather than quietly contradicting.
 * What it argued against was keeping the whole `CareerState`: a live, deeply
 * nested, versioned thing, every future migration of which would have to
 * migrate careers nobody is playing any more.
 *
 * None of that applies to this. A detail is FLAT, FINISHED and RESOLVED — plain
 * rows of numbers and names, nothing that refers to a club by id, nothing that
 * can go stale, and nothing any future migration will ever have to touch,
 * because nothing will ever be added to it. It is a printed page rather than a
 * copy of the machinery that produced one.
 *
 * WHY IT EXISTS. The end screen showed a career in full — every season, every
 * move, the whole record book — and then threw all of it away and kept the
 * card. So the most complete view of a career was available exactly once, in
 * the moment you were deciding to end it, and never again. The wall could rank
 * a career it could no longer show you.
 *
 * OPTIONAL, AND STAYS OPTIONAL. Careers already on the wall were enshrined by a
 * version that kept none of this, and nothing can reconstruct it: the state it
 * would have come from was deleted when the career ended. An entry without a
 * detail is therefore not a damaged entry, it is an older one, and the screen
 * says so rather than rendering empty tables.
 */
export interface LegacyDetail {
  /** Every completed season, oldest first. */
  seasons: LegacySeason[];
  /** Every move, oldest first. */
  moves: LegacyMove[];
  /** The record book in full, rather than the four the card shows. */
  records: Milestone[];
  /**
   * Every honour, with the season it was won in.
   *
   * The raw list rather than the grouped one on the legacy itself, because the
   * two answer different questions: the cabinet asks "what did he win", and the
   * history table asks "what did he win THAT year". The grouped list is
   * derivable from this one; it is kept as its own field because it was there
   * first and rebuilding it at render time would be work for no gain.
   */
  honours: Honour[];
  /**
   * What he was known for by the end. Empty for a career that became nothing in
   * particular, and for every career enshrined before traits existed.
   */
  traits: TraitId[];
  /**
   * The moments the career kept, oldest first.
   *
   * Resolved and finished like everything else here — the text was written when
   * it happened, so a wall entry read five seasons later still says what it
   * said at the time rather than reconstructing it from a world that has moved.
   */
  moments: Moment[];
}

/**
 * One finished career, as the wall of fame remembers it.
 *
 * Plain data, like everything else that reaches the save: no classes, no
 * functions, nothing that needs reconstructing on load.
 */
/**
 * The scoring model careers are played under today.
 *
 * Bumped only when a change moves what a career's numbers MEAN — the goal
 * model, the rating scale — and never for a change that leaves them
 * comparable. A version nobody can point at a measured shift for is a version
 * that makes the wall harder to read rather than easier.
 *
 * 1. Everything up to and including the sixteen-card hub.
 * 2. The goal-conversion fix: chance quality separated out of the shot roll, so
 *    a season returns about a third fewer goals and about a rating point less.
 */
export const BALANCE_VERSION = 2;

/** Anything unstamped predates versioning, which makes it version 1. */
export function balanceVersionOf(legacy: { balanceVersion?: number }): number {
  return legacy.balanceVersion ?? 1;
}

export interface CareerLegacy {
  /** Stable id, so an entry can be removed without depending on its position. */
  id: string;
  name: string;
  position: Position;
  nationality: string;
  ending: CareerEnding;
  /** When it ended, for ordering two careers that scored the same. */
  endedAt: number;
  /** Seasons completed. A career abandoned in March completed the ones before it. */
  seasons: number;
  /** The season he was in when it ended, completed or not. */
  finalSeasonNumber: number;
  ageAtEnd: number;
  /** Ability as he finished, which for a long career is well below his peak. */
  abilityAtEnd: number;
  finalClubId: string;
  /** Resolved at the end, so a later data change cannot make this unreadable. */
  finalClubName: string;
  finalCountryId: string;
  finalCountryShort: string;
  /** Distinct clubs played for, and distinct countries played in. */
  clubs: number;
  countries: number;
  /** Every competition added together, the season in progress included. */
  appearances: number;
  goals: number;
  assists: number;
  averageRating: number;
  /** International appearances, which are the ones a country remembers. */
  caps: number;
  /** Wages banked across the career, in millions. */
  earnings: number;
  /** Everything won, grouped — "Champions ×3" rather than three entries. */
  honours: { label: string; count: number }[];
  /** League titles alone, because that is the number people compare. */
  titles: number;
  /** The peaks worth listing on a card, longest first. */
  highlights: Milestone[];
  /** The ranking number. See `careerScore`. */
  score: number;
  /** One line on what kind of footballer this was. */
  verdict: string;
  /**
   * Which scoring model the career was played under.
   *
   * A career's numbers are only comparable with another career's if the two
   * were produced by the same simulation, and in one respect they were not: the
   * goal-conversion model was corrected (see simulation/ActionResolver.ts,
   * `SHOT_QUALITY`), and a season now returns about a third fewer goals and
   * roughly a rating point less than it did before. `careerScore` reads both, so
   * an entry enshrined under the old model outranks an identical career played
   * under the new one, permanently and through no merit of its own.
   *
   * WHY THIS IS A LABEL RATHER THAN A CORRECTION. Rescaling old scores by some
   * measured factor was the obvious move and it is the wrong one twice over. It
   * would rewrite a number a player was shown when his career ended, which is
   * the one thing a record must never do; and the factor itself would be a
   * fiction, since no single multiplier maps a career that was actually played
   * onto the career it would have been. This codebase has settled exactly this
   * argument once before, over how much of a career was played rather than
   * skipped, and settled it the same way: say which is which, and let the wall
   * be read rather than silently re-ranked. See CHANGELOG.md, item 11.
   *
   * Absent on entries enshrined before this was kept, which is itself the
   * answer — anything without a version is version 1.
   */
  balanceVersion?: number;
  /**
   * How much of the career was actually played rather than skipped, and at
   * what pace. The raw counts, so both screens derive the same summary from one
   * source — see core/career/howPlayed.ts.
   *
   * Absent on entries enshrined before this was kept, which reads as "not
   * recorded" and is the truthful answer for them.
   */
  howPlayed?: HowItWasPlayed;
  /**
   * The whole career, for the screen that shows one in full.
   *
   * Absent on entries enshrined before this was kept. See `LegacyDetail`.
   */
  detail?: LegacyDetail;
}

/**
 * What each honour is worth to a career's standing.
 *
 * These are deliberately NOT the same as the reputation weights. Reputation
 * asks "how good is he right now", and decays; this asks "what will he be
 * remembered for", and cannot. So a European Cup is worth more here than the
 * league title that qualified him for it, an international tournament is worth
 * the most of all, and a relegation costs something — a career that went down
 * twice is a different career, and a scoreboard that only ever adds would say
 * it was the same one.
 */
const HONOUR_POINTS: Record<HonourKind, number> = {
  internationalTitle: 110,
  europeanTitle: 90,
  continentalTreble: 80,
  domesticTreble: 55,
  internationalFinal: 50,
  playerOfTheSeason: 50,
  title: 45,
  europeanFinal: 40,
  topScorer: 35,
  domesticDouble: 30,
  youngPlayerOfTheSeason: 25,
  nationalCup: 20,
  leagueCup: 12,
  // The cheapest trophy in the game to reach, and priced as one: a single match,
  // entered on something you already have a trophy for.
  superCup: 8,
  capMilestone: 8,
  promotion: 10,
  internationalDebut: 6,
  relegation: -12,
};

/**
 * Which stage an honour was contested on.
 *
 * `domestic` honours are decided inside one country, so what one is worth
 * depends on which country. Sixteen clubs in Austria and sixteen in England are
 * not the same sixteen, and a scoreboard that pays 45 points for either title
 * says the career that avoided the hard leagues was the better one. It also
 * gives the transfer market a perverse instruction: the surest way to climb the
 * wall of fame was to drop into the weakest league in the world and win it
 * every year.
 *
 * `common` honours are contested on a stage every country enters on the same
 * terms — the three European competitions, and the international tournament.
 * A European Cup is the same trophy whoever qualified for it, and scaling one
 * by the winner's league would dock points from exactly the clubs whose
 * achievement was largest: the ones who came out of a small league and won it
 * anyway. The continental treble sits here for the same reason, since a
 * European trophy is the leg that makes it one.
 */
const HONOUR_STAGE: Record<HonourKind, 'domestic' | 'common'> = {
  title: 'domestic',
  nationalCup: 'domestic',
  leagueCup: 'domestic',
  superCup: 'domestic',
  domesticDouble: 'domestic',
  domesticTreble: 'domestic',
  promotion: 'domestic',
  relegation: 'domestic',
  topScorer: 'domestic',
  playerOfTheSeason: 'domestic',
  youngPlayerOfTheSeason: 'domestic',
  europeanTitle: 'common',
  europeanFinal: 'common',
  continentalTreble: 'common',
  internationalTitle: 'common',
  internationalFinal: 'common',
  internationalDebut: 'common',
  capMilestone: 'common',
};

/**
 * How much the football of one country counts toward what a career is
 * remembered for, as a multiplier on a domestic honour.
 *
 * A TAPER of prestige rather than prestige itself, and the difference is the
 * whole design. Raw prestige runs from 1 down to 0.46 across the twelve
 * countries with leagues, which would say an Austrian title is worth less than
 * half an English one — a bigger claim than a ranking number has any business
 * making, and one that would bury every career played outside the top four
 * leagues no matter how good it was. Tapered, the spread is about 3:2: enough
 * that the harder league settles a tie between two similar careers, not enough
 * to decide one on its own.
 *
 * It applies to `relegation` too, which is negative, so going down in a weaker
 * league costs less. That is the same statement read backwards and it is meant:
 * the fall is smaller because the height was.
 */
function domesticWeight(countryId: string): number {
  return 0.4 + 0.6 * countryPrestige(countryId);
}

/** Milestones shown on a legacy card. More than this is a record book, not a card. */
const HIGHLIGHT_LIMIT = 4;

/**
 * How good a career was, as one number.
 *
 * Used only for ORDERING the wall of fame, which is why it can be this blunt.
 * Three things are balanced against each other: what he won, what he produced,
 * and how long he did it for. Longevity is weighted lightest on purpose — a
 * twenty-season journeyman should sit below a ten-season winner — but it is not
 * zero, because turning out four hundred times is itself an achievement.
 *
 * The rating term is centred on 6.5 rather than 0 so that an average career
 * scores nothing for it either way. Without that, appearances would be paid
 * twice: once for happening, and again for having been merely adequate.
 */
export function careerScore(legacy: {
  goals: number;
  assists: number;
  appearances: number;
  averageRating: number;
  caps: number;
  seasons: number;
  honours: readonly { label: string; count: number }[];
  honourPoints: number;
}): number {
  const production = legacy.goals * 3 + legacy.assists * 1.6;
  const longevity = legacy.appearances * 0.35 + legacy.seasons * 6;
  const quality = legacy.appearances > 0 ? (legacy.averageRating - 6.5) * legacy.appearances * 0.9 : 0;
  const country = legacy.caps * 1.5;
  return Math.max(0, Math.round(production + longevity + quality + country + legacy.honourPoints));
}

/**
 * What a set of honours is worth, in the currency `careerScore` spends.
 *
 * Every honour already carries the country it was won in, so weighting one by
 * where it happened needs no new field and no migration — only the decision to
 * read what was always being recorded.
 */
export function honourPoints(honours: readonly Honour[]): number {
  return honours.reduce((total, honour) => {
    const points = HONOUR_POINTS[honour.kind] ?? 0;
    if (HONOUR_STAGE[honour.kind] === 'domestic') {
      return total + points * domesticWeight(honour.countryId);
    }
    return total + points;
  }, 0);
}

/**
 * Should this career be kept at all?
 *
 * A career started and abandoned before a ball was kicked is not a career, and
 * a wall of fame full of players who never played would bury the ones who did.
 * The threshold is deliberately the lowest one possible — a single appearance —
 * because anything higher would start making judgements about which real
 * careers were worth remembering, and that is what the ranking is for.
 */
export function isWorthRemembering(legacy: { appearances: number }): boolean {
  return legacy.appearances > 0;
}

/**
 * One line on what kind of footballer this was.
 *
 * Reads the SHAPE of the career rather than its size, so two players with the
 * same totals can be described differently — the one who never left, and the
 * one who won the same things in four countries, are not the same story. Ordered
 * most specific first: the first thing that is true is the thing worth saying.
 */
export function careerVerdict(legacy: {
  ending: CareerEnding;
  seasons: number;
  clubs: number;
  countries: number;
  goals: number;
  assists: number;
  appearances: number;
  averageRating: number;
  titles: number;
  caps: number;
  honours: readonly { label: string; count: number }[];
}): string {
  const trophies = legacy.honours.reduce((total, entry) => total + entry.count, 0);
  const goalsPerMatch = legacy.appearances > 0 ? legacy.goals / legacy.appearances : 0;

  if (legacy.ending === 'abandoned' && legacy.seasons <= 1) {
    return 'A career that was put down before it had said anything.';
  }
  if (legacy.titles >= 5) {
    return `A serial winner: ${legacy.titles} league titles in ${legacy.seasons} seasons.`;
  }
  if (legacy.clubs === 1 && legacy.seasons >= 8) {
    return `A one-club man — ${legacy.seasons} seasons, and never a reason to leave.`;
  }
  if (legacy.countries >= 4) {
    return `A footballing life spent moving: ${legacy.countries} countries, ${legacy.clubs} clubs.`;
  }
  if (goalsPerMatch >= 0.7) {
    return `A goalscorer above all else — ${goalsPerMatch.toFixed(2)} a game across a career.`;
  }
  if (legacy.caps >= 40) {
    return `His country's for a decade: ${legacy.caps} caps and ${trophies} honours.`;
  }
  if (trophies === 0 && legacy.seasons >= 10) {
    return `${legacy.seasons} seasons, ${legacy.appearances} appearances, and nothing in the cabinet.`;
  }
  if (legacy.averageRating >= 7.4) {
    return `Reliably excellent: ${legacy.averageRating.toFixed(2)} across ${legacy.appearances} matches.`;
  }
  if (trophies > 0) {
    return `${trophies} ${trophies === 1 ? 'honour' : 'honours'} in ${legacy.seasons} seasons.`;
  }
  return `${legacy.appearances} appearances, ${legacy.goals} goals, ${legacy.assists} assists.`;
}

/**
 * Turn a living career into the record that outlives it.
 *
 * `lookup` is passed in rather than imported, for the same reason every other
 * career function takes it: nothing under `core/` reaches into `data/`, so the
 * caller supplies the clubs — drifted, as this career knew them.
 *
 * Totals come from the RECORD BOOK rather than from `history`, and the
 * difference matters. History holds completed seasons, so a career abandoned in
 * March would lose the season it was abandoned in — the very season that made
 * somebody abandon it. The record book is written per match, so it already
 * contains today.
 */
export function summariseCareer(
  state: CareerState,
  lookup: (id: string) => Team,
  ending: CareerEnding,
  now: number = Date.now(),
): CareerLegacy {
  const totals = lifetimeTotals(state.records);
  const honours = state.honours ?? [];
  const grouped = summariseHonours(honours);

  // A club he only ever played one match for still counts as a club he played
  // for, so this walks history and transfers rather than counting moves.
  const clubIds = new Set<string>([state.clubId]);
  const countryIds = new Set<string>([state.countryId]);
  for (const season of state.history) {
    clubIds.add(season.clubId);
    if (season.countryId) countryIds.add(season.countryId);
  }
  for (const move of state.transfers ?? []) {
    clubIds.add(move.fromClubId);
    clubIds.add(move.toClubId);
    countryIds.add(move.fromCountryId);
    countryIds.add(move.toCountryId);
  }

  const legacy = {
    id: `${state.seed}:${state.seasonNumber}:${now}`,
    name: state.player.name,
    position: state.player.position,
    nationality: state.player.nationality,
    ending,
    endedAt: now,
    balanceVersion: BALANCE_VERSION,
    seasons: state.history.length,
    finalSeasonNumber: state.seasonNumber,
    ageAtEnd: state.player.age,
    abilityAtEnd: currentAbility(state.player),
    finalClubId: state.clubId,
    finalClubName: safeClubName(state.clubId, lookup),
    finalCountryId: state.countryId,
    // `getCountry` answers with a placeholder rather than throwing, so an
    // unknown country degrades to a readable dash instead of losing the entry.
    finalCountryShort: getCountry(state.countryId).short,
    clubs: clubIds.size,
    countries: countryIds.size,
    appearances: totals.matches,
    goals: totals.goals,
    assists: totals.assists,
    averageRating: averageOf(totals),
    caps: state.records.byCompetition[INTERNATIONAL]?.matches ?? 0,
    earnings: round(state.careerEarnings ?? 0, 1),
    honours: grouped,
    titles: honours.filter((honour) => honour.kind === 'title').length,
    highlights: milestones(state.records).slice(0, HIGHLIGHT_LIMIT),
  };

  const verdict = careerVerdict(legacy);
  const score = careerScore({ ...legacy, honourPoints: honourPoints(honours) });

  return {
    ...legacy,
    verdict,
    score,
    // Carried, and deliberately NOT fed into `score` above. See
    // core/career/howPlayed.ts for why this is a label rather than a penalty.
    howPlayed: state.howPlayed,
    detail: detailOf(state, lookup, honours),
  };
}

/**
 * The whole career, flattened and resolved, for the screen that shows one.
 *
 * Every name is resolved HERE, at the one moment the world is still known,
 * rather than at render time. That is the entire design: a wall entry read five
 * data files later must show the career that was actually played, not a table
 * of dashes where the clubs used to be.
 */
function detailOf(
  state: CareerState,
  lookup: (id: string) => Team,
  honours: readonly Honour[],
): LegacyDetail {
  return {
    seasons: state.history.map((season) => ({
      seasonNumber: season.seasonNumber,
      clubName: safeClubName(season.clubId, lookup),
      countryShort: getCountry(season.countryId ?? state.countryId).short,
      age: season.age,
      position: season.position,
      matches: season.stats.matches,
      goals: season.stats.goals,
      assists: season.stats.assists,
      // Averaged now rather than kept as a running total, because a finished
      // season will never have another match folded into it.
      rating: round(averageRating(season.stats), 2),
    })),
    moves: (state.transfers ?? []).map((move) => ({
      season: move.season,
      age: move.age,
      fromClubName: safeClubName(move.fromClubId, lookup),
      toClubName: safeClubName(move.toClubId, lookup),
      fee: move.fee,
      free: move.free,
    })),
    records: milestones(state.records),
    traits: [...(state.player.traits ?? [])],
    moments: [...(state.moments ?? [])],
    // Copied rather than referenced: the career this came from is about to be
    // deleted, and a legacy holding a live array would be holding a corpse.
    honours: honours.map((honour) => ({ ...honour })),
  };
}

/**
 * Sort a wall of fame: best first, most recent breaking a tie.
 * Returns a new array — the caller's list is never reordered underneath it.
 */
export function rankLegacies(entries: readonly CareerLegacy[]): CareerLegacy[] {
  return [...entries].sort((a, b) => b.score - a.score || b.endedAt - a.endedAt);
}

// ------------------------------------------------------------ retirement ---

/**
 * The age at which retiring becomes an option he is offered.
 * Ability starts falling at 31 (see `ageFactor`), so by here the decline is
 * something he has felt for three seasons rather than a number on a screen.
 */
export const RETIREMENT_OFFER_AGE = 34;

/** The age at which he is not offered the choice. Everybody stops eventually. */
export const RETIREMENT_FORCED_AGE = 39;

/** Whether a career can go on, and what to say about it. */
export interface RetirementProspect {
  /** True when the decision has been taken for him. */
  forced: boolean;
  /** One line of context for the review screen. */
  reason: string;
}

/**
 * Is it time?
 *
 * Returns null for a career with football left in it — most careers, most
 * seasons — which is the case the caller should find easiest to handle.
 *
 * Deliberately asked at the SEASON REVIEW rather than mid-season. A footballer
 * decides this in the summer, and asking it after a bad match in November would
 * turn a form dip into a life decision.
 */
export function retirementProspect(state: CareerState): RetirementProspect | null {
  const age = state.player.age;
  if (age >= RETIREMENT_FORCED_AGE) {
    return {
      forced: true,
      reason: `At ${age} there is no more football in the legs. This is where it ends.`,
    };
  }
  if (age < RETIREMENT_OFFER_AGE) return null;

  const last = state.history[state.history.length - 1];
  const before = state.history[state.history.length - 2];
  const ratingOf = (season?: { stats: { matches: number; ratingTotal: number } }) =>
    season && season.stats.matches > 0 ? season.stats.ratingTotal / season.stats.matches : 0;

  const now = ratingOf(last);
  const then = ratingOf(before);

  if (now > 0 && then > 0 && now < then - 0.35) {
    return {
      forced: false,
      reason: `You are ${age}, and last season was your worst in a while — ${now.toFixed(2)} against
        ${then.toFixed(2)} the year before. You could go one more, or stop while the record still
        reads well.`,
    };
  }
  return {
    forced: false,
    reason: `You are ${age}. There is another season in you if you want it, and nobody would
      question you for calling it a career instead.`,
  };
}

/** A club name that cannot throw, for a record that has to outlive the data file. */
function safeClubName(id: string, lookup: (clubId: string) => Team): string {
  try {
    return lookup(id).name;
  } catch {
    return id;
  }
}
