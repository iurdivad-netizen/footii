import { clamp, round } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import type { Player } from '../player/player.ts';
import { currentAbility } from '../player/player.ts';
import type { MatchStats } from '../match/matchStats.ts';
import type { AttributeChange, DevelopmentState } from './development.ts';
import { createDevelopmentState, developAfterMatch, driftPotential } from './development.ts';
import type { Attributes } from '../player/attributes.ts';
import type { Fixture, FixtureResult, TableRow } from './league.ts';
import { createSeasonStats } from './seasonStats.ts';
import type { SeasonStats } from './seasonStats.ts';
import { matchReputationGain } from './reputation.ts';
import type { TransferOffer, TransferRecord } from './transfers.ts';
import type { Contract, ContractOffer } from './contracts.ts';
import type { WorldLeagues } from './countries.ts';
import type { CupKind, CupState } from './cups.ts';
import { CUP_KINDS, opponentIn, roundName, stillIn, tieFor } from './cups.ts';
import type { EuropeanEntries, EuropeanState, EuropeanTier } from './europe.ts';
import {
  EUROPEAN_KNOCKOUT_ROUNDS,
  europeanWinner,
  isGroupRound,
  knockoutRoundOf,
} from './europe.ts';
import { groupFixtureFor } from './groupStage.ts';
import type { CareerRecords } from './records.ts';
import type { Coefficients } from './coefficients.ts';
import type { NationStrengths } from './nationDrift.ts';
import { breakStreaks, recordMatch as recordMatchInBook } from './records.ts';
import { advanceInjury, rollInjury } from './injury.ts';
import type { Injury } from './injury.ts';
import type { Rival } from './squad.ts';
import type { CalendarSlot, CompetitionKind } from './calendar.ts';
import { isEuropean, isInternational, isSuperCup, seasonCalendar } from './calendar.ts';
import type { InternationalState } from './international.ts';
import { GROUP_ROUNDS, INTERNATIONAL, KNOCKOUT_ROUNDS, groupFixture } from './international.ts';
import { isSelected, nationId } from './nations.ts';
import type { ClubStrengths } from './clubDrift.ts';
import type { Honour } from './awards.ts';
import type { CareerPreferences } from './preferences.ts';
import type { SuperCupTie } from './superCup.ts';
import { playsInSuperCup, superCupOpponent } from './superCup.ts';

/**
 * CAREER STATE
 *
 * The persistent record of one footballer's career. Everything the game needs
 * to resume is here and nothing else: the match engine, development model and
 * league are all pure functions over this state.
 *
 * Deliberately kept serialisable (no class instances, no functions) so that
 * saving is `JSON.stringify` and loading needs no reconstruction.
 */

export interface SeasonRecord {
  seasonNumber: number;
  clubId: string;
  /** Final league position, once the season is complete. */
  position: number;
  stats: SeasonStats;
  age: number;
  /** The division it was played in, so a history reads at the right level. */
  division: number;
  /** The country it was played in. */
  countryId: string;
  /** Cups won that season, for a history that shows more than a league position. */
  cupsWon: CupKind[];
  /** The European competition played that season, if any, and how it ended. */
  europeanTier: EuropeanTier | null;
  /** True when the club won it. */
  wonEurope: boolean;
}

export interface CareerState {
  player: Player;
  clubId: string;
  /** Teams contesting the league this season. */
  leagueTeamIds: string[];
  seasonNumber: number;
  fixtures: Fixture[];
  results: FixtureResult[];
  table: TableRow[];
  /** Index of the player's club's next LEAGUE fixture within `fixtures`. */
  nextFixtureIndex: number;
  /**
   * How far through the season's calendar the player is, counting cup rounds as
   * well as league rounds. `nextFixtureIndex` counts only league matches, so the
   * two advance together on a league slot and only this one advances on a cup
   * slot — see core/career/calendar.ts.
   */
  calendarIndex: number;
  /** Every competition's statistics added together: his season, in full. */
  seasonStats: SeasonStats;
  /**
   * League matches only.
   *
   * Awards are judged against a benchmark inferred from the LEAGUE table, so
   * they have to be judged on league football. Counting cup goals toward the
   * golden boot would let a good cup run win an award the league never saw.
   */
  leagueStats: SeasonStats;
  development: DevelopmentState;
  history: SeasonRecord[];
  /** Seed for this career; every season derives its own stream from it. */
  seed: string;
  /** Attribute changes from the most recent match, for the UI to highlight. */
  lastDevelopment: AttributeChange[];
  /** Fitness carried between matches, 0-100. */
  fitness: number;
  /**
   * Snapshot of the player as the season began, so the end-of-season review can
   * show exactly how far he came. Taken here rather than derived from history,
   * because history stores statistics, not attributes.
   */
  seasonStartAttributes: Attributes;
  seasonStartAbility: number;
  seasonStartExperience: number;
  /** Unspent pre-season training points. */
  trainingPoints: number;
  /**
   * Offers on the table this summer. Written at the end of a season and
   * cleared as soon as one is taken or the window is closed, so a career that
   * is mid-season never carries a stale offer.
   */
  offers: TransferOffer[];
  /** Every move made, oldest first. */
  transfers: TransferRecord[];
  /** The country whose league the player is currently playing in. */
  countryId: string;
  /** The tier within that country; 1 is its top flight. */
  division: number;
  /**
   * Every country's league membership, keyed by country id.
   *
   * Lives in the save rather than being read back from the data file because
   * promotion and relegation reshape it. The tables of the leagues the player
   * is NOT in are deliberately absent: they are a pure function of the seed and
   * are recomputed on demand, which keeps a save small and can never let a
   * stored table disagree with the season that produced it.
   */
  leagues: WorldLeagues;
  /**
   * Live club ratings, which drift season by season. Held here rather than
   * mutating the loaded teams, so two careers in the same browser cannot
   * contaminate each other and a save restores the league it remembers.
   */
  clubStrengths: ClubStrengths;
  /** The deal he is on. Always present — a career is never contract-less. */
  contract: Contract;
  /**
   * Terms his own club has put up this summer, if any. Sits alongside `offers`
   * so the transfer window can present staying as a deal rather than a refusal.
   */
  renewal: ContractOffer | null;
  /**
   * Next season's super cup, decided by the season just finished.
   *
   * Null when there is none to play — the first season of a career has no
   * previous one to earn it, and a country whose cup produced no winner has
   * nobody to send. See core/career/superCup.ts.
   */
  superCup: SuperCupTie | null;
  /** Everything won, oldest first. The only part of a career that only grows. */
  honours: Honour[];
  /**
   * What he wants from a move, stated before the window opens.
   *
   * Read by `generateOffers` at the end of a season, which is the only moment
   * it can matter: a preference applied afterwards would be a filter on a list
   * that had already been decided. See core/career/preferences.ts.
   */
  preferences: CareerPreferences;
  /** Total wages banked across the career, in millions. */
  careerEarnings: number;
  /**
   * The player's country's two knockouts, this season.
   *
   * Only his own country's cups are kept. Every other country's are a pure
   * function of the seed and are computed when somebody asks who won one, in
   * the same spirit as the background league tables.
   */
  cups: Record<CupKind, CupState>;
  /**
   * The international season: two groups of four, then a knockout.
   *
   * Held whole rather than only the player's own nation, because the bracket is
   * seeded off BOTH groups' final tables and there would be nothing to derive
   * the other one from later. Eight rows and twelve fixtures is cheap.
   */
  international: InternationalState;
  /**
   * International appearances THIS season, counted as they happen.
   *
   * Not derivable at season end, and this is why: reputation moves match by
   * match, so a player can climb into the squad in March and play only the last
   * group match. Asking "is he selected?" in June would then credit him with a
   * campaign he was not picked for, or — climbing the other way — none of the
   * ones he was.
   */
  seasonCaps: number;
  /**
   * The European competition the player's club is in this season, if any.
   *
   * Null for a club that did not qualify, which is most clubs most years —
   * that absence is the point of the competition existing.
   */
  europe: EuropeanState | null;
  /**
   * Who qualified for what, decided at the end of last season and fixed for
   * this one. Kept whole rather than only the player's own entry, so a club he
   * transfers to mid-summer arrives with the European place it earned.
   */
  europeanEntries: EuropeanEntries;
  /**
   * Every country's recent European record, five seasons deep: what its clubs
   * did in Europe and what its national side did in the summer.
   *
   * The one part of the world that has to be REMEMBERED rather than recomputed:
   * a national side is built from its country's clubs as they stood at the
   * time, and drift only carries the current strengths, so the world that
   * played season four's tournament no longer exists by season nine. It decides
   * how many Champions League places each country gets — see
   * core/career/coefficients.ts.
   */
  coefficients: Coefficients;
  /**
   * How far each league-less nation has drifted from its authored strength.
   *
   * The countries WITH leagues need nothing here: their sides are derived from
   * clubs that drift on their own. See core/career/nationDrift.ts.
   */
  nationStrengths: NationStrengths;
  /**
   * The record book: the peaks and runs a career is actually remembered for.
   * Accumulated per match and impossible to recompute afterwards.
   */
  records: CareerRecords;
  /**
   * The last match played, for the hub to report.
   *
   * Exists because a skipped match returns straight to the hub rather than to a
   * full-time screen — thirty matches a season is too many to click through a
   * report for each one — so the hub has to be able to say what just happened.
   */
  lastResult: MatchResultSummary | null;
  /** How this career was actually played. See `HowItWasPlayed`. */
  howPlayed: HowItWasPlayed;
  /**
   * The injury keeping him out, or null when he is fit.
   *
   * Null rather than an injury with zero weeks left, so "fit" has exactly one
   * representation and no caller has to remember to check both.
   */
  injury: Injury | null;
  /**
   * The player competing for the same shirt at his club, or null.
   *
   * Belongs to the CLUB rather than to the career: signing somewhere else
   * replaces him outright, because the man already in the shirt at the new club
   * has nothing to do with the one at the old one.
   */
  rival: Rival | null;
}

/**
 * How a career was actually played, counted as it goes.
 *
 * Kept because it CANNOT be reconstructed. Everything else a career knows can
 * be recomputed from its seed and its history; this cannot, because the two
 * things it counts are choices the player made outside the simulation and left
 * no trace of. `skipped` existed per match and only ever survived on
 * `lastResult`, so the answer to "how much of this career did you actually
 * play" was overwritten every match and gone by the end of the first season.
 *
 * It is recorded now, ahead of anything reading it, for the one reason that
 * matters with a counter: it can only ever count FORWARD. A season played
 * before the counter existed is a season whose answer is lost for good, so
 * every week this waited on the scoring rule that will eventually read it was
 * a week of data nobody can get back. The rule is a judgement call and can take
 * its time; the counting is not, and could not.
 */
export interface HowItWasPlayed {
  /** Matches resolved automatically rather than played. */
  skipped: number;
  /** Matches the player sat through himself. */
  played: number;
  /**
   * Matches played at each decision pace, keyed by the pace's own id.
   *
   * A plain string key rather than the `DecisionPace` union, for two reasons.
   * The union lives in `simulation/`, and `core` may not import from there —
   * see the dependency rule. And a histogram keyed by a union is a migration
   * waiting to happen: the pace settings have already been renamed and
   * rescaled once, and a save holding counts under a name the code no longer
   * has should keep them as an unreadable tally rather than fail to load. What
   * reads this maps the ids it recognises and can treat the rest as unknown.
   */
  paces: Record<string, number>;
}

export function createHowItWasPlayed(): HowItWasPlayed {
  return { skipped: 0, played: 0, paces: {} };
}

/** Enough of a finished match to describe it in one line. */
export interface MatchResultSummary {
  opponentId: string;
  competition: CompetitionKind;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  goals: number;
  assists: number;
  rating: number;
  /** True when it was resolved automatically rather than played. */
  skipped: boolean;
  /**
   * True when he was not fit to play it at all.
   *
   * Distinct from `skipped`, and the distinction matters on the hub: a skipped
   * match is one he played without watching, and a missed one is a match that
   * happened without him. Reporting the second as the first would credit him
   * with an appearance he never made.
   */
  missed?: boolean;
  /**
   * The shootout, when the tie went to one.
   *
   * Present only for a knockout that finished level. The hub reads it because
   * "1-1" is not a result in a cup — going out on penalties and going through
   * on them are the same scoreline and opposite seasons, and for a long time
   * the game showed only the scoreline.
   */
  shootout?: { won: boolean; scored: number; conceded: number };
}

/**
 * How much fitness a player recovers across one clear week between fixtures.
 *
 * The value is unchanged, and deliberately so: one match a week is what the
 * overwhelming majority of a season looks like, so the ordinary case recovers
 * exactly what it always did and no existing career is retuned. What weeks add
 * is the two tails either side of it — see `fitnessRecovery`.
 */
export const FITNESS_RECOVERY = 34;

/**
 * What a player recovers when his next match is in the SAME week.
 *
 * Saturday to Wednesday is not a week's rest and never was; the calendar simply
 * had no way to say so, because a slot was the only unit of time it had and
 * every slot was worth the same recovery. A congested week is now the thing
 * that makes a fixture pile-up cost something — and it is the mechanic squad
 * rotation and injuries will eventually hang off, since a manager has no reason
 * to rest anybody in a season where nobody ever tires.
 *
 * Saturday to Wednesday is four days against a week's seven, and recovery is
 * not linear in days — the first ones do least — so a little over half of
 * `FITNESS_RECOVERY` is about right. It sits at the FORGIVING end of what could
 * be argued for, deliberately: there is currently no way to be rested, because
 * the player starts every fixture there is, so a congested season is one he has
 * to play all of. This is the number to tighten once squad rotation gives him
 * somewhere to sit.
 */
export const CONGESTED_RECOVERY = 18;

/**
 * Fitness recovered before the next match, given how far away it is in weeks.
 *
 * Linear in the gap and then clamped by the 0-100 ceiling on fitness itself, so
 * a fortnight off is functionally a full recharge without needing a special
 * case to say so. A gap of zero — a midweek fixture — is the one case that is
 * not on the line, because rest between two matches in the same week is not a
 * fraction of a week's rest, it is a different thing: three days.
 */
export function fitnessRecovery(weeksUntilNext: number): number {
  if (weeksUntilNext <= 0) return CONGESTED_RECOVERY;
  return FITNESS_RECOVERY * weeksUntilNext;
}

export function fixturesFor(state: CareerState, teamId: string): Fixture[] {
  return state.fixtures.filter((f) => f.homeId === teamId || f.awayId === teamId);
}

/** The player's club's next LEAGUE fixture, or null once they are all played. */
export function nextFixture(state: CareerState): Fixture | null {
  const own = fixturesFor(state, state.clubId);
  return own[state.nextFixtureIndex] ?? null;
}

/**
 * The bracket a competition slot refers to, or null if the player is not in it.
 *
 * One lookup for all four knockouts, so `nextMatch` and everything downstream
 * never has to know whether a slot is a domestic cup or a European night.
 */
export function knockoutFor(
  state: CareerState,
  competition: CompetitionKind,
): CupState<CompetitionKind> | null {
  if (competition === 'league') return null;
  // The super cup is one fixture rather than a bracket, so it has no rounds to
  // walk and nothing to hand back here. See core/career/superCup.ts.
  if (isSuperCup(competition)) return null;
  if (isInternational(competition)) return state.international?.knockout ?? null;
  if (isEuropean(competition)) {
    // Europe is a group stage with a bracket hanging off it, so the knockout is
    // a field on it rather than the thing itself — and it does not exist at all
    // until the groups have finished.
    return state.europe && state.europe.kind === competition ? state.europe.knockout : null;
  }
  return state.cups?.[competition] ?? null;
}

/** The nation the player turns out for. */
export function playerNation(state: CareerState): string {
  return nationId(state.player.nationality);
}

/**
 * The international match this slot refers to, if the player has one.
 *
 * International slots carry rounds 1 to 5: the first three are group matches,
 * which are fixtures like a league round, and the last two are the knockout,
 * which is a bracket like a cup. One competition, two shapes, because that is
 * what a tournament is.
 */
export function internationalMatch(
  state: CareerState,
  slotIndex: number,
  round: number,
  // The week is attached by `nextMatch`, which is the only place that holds the
  // slot this was built from. Returning a match without one keeps that single.
): Omit<ScheduledMatch, 'week'> | null {
  // Not picked, no international season. This is the whole point of the
  // competition: it is the one thing in a career he can be left out of.
  if (!isSelected(state.player)) return null;
  const international = state.international;
  if (!international) return null;
  const nation = playerNation(state);

  if (round <= GROUP_ROUNDS) {
    const fixture = groupFixture(international, nation, round);
    if (!fixture) return null;
    // Already settled — the round was played around him while he was elsewhere.
    if (international.results.some((r) => r.round === round && r.homeId === fixture.homeId)) {
      return null;
    }
    return {
      competition: INTERNATIONAL,
      slotIndex,
      round,
      opponentId: fixture.homeId === nation ? fixture.awayId : fixture.homeId,
      home: fixture.homeId === nation,
      roundLabel: `Group match ${round}`,
    };
  }

  const knockout = international.knockout;
  if (!knockout || !stillIn(knockout, nation)) return null;
  const koRound = round - GROUP_ROUNDS;
  const drawn = knockout.rounds[koRound - 1];
  const tie = drawn ? tieFor(drawn, nation) : null;
  // Already played. The calendar index normally moves past a played slot on its
  // own, so this only bites for a caller that SCANS the season rather than
  // walking it — `matchesRemaining` would otherwise count a finished tie as one
  // still to come.
  if (tie?.winnerId) return null;
  return {
    competition: INTERNATIONAL,
    slotIndex,
    round,
    opponentId: tie ? opponentIn(tie, nation) : '',
    home: tie ? tie.homeId === nation : true,
    roundLabel: roundName(koRound, international.knockoutRounds ?? KNOCKOUT_ROUNDS),
  };
}

/** The season's shape: league rounds and cup rounds in playing order. */
export function calendarFor(state: CareerState): CalendarSlot[] {
  // The tournament's own depth: a World Cup runs one knockout round longer than
  // a continental championship, so the season it is played in has one more
  // international date at the end of it.
  const knockouts = state.international?.knockoutRounds ?? KNOCKOUT_ROUNDS;
  return seasonCalendar(fixturesFor(state, state.clubId).length, GROUP_ROUNDS + knockouts);
}

/** One entry in the season, resolved to an actual match the player will play. */
export interface ScheduledMatch {
  competition: CompetitionKind;
  /**
   * Where this match sits in the season calendar.
   *
   * Load-bearing. `nextMatch` walks FORWARD past slots that are not the
   * player's — a cup he is out of — so the slot he plays is frequently not the
   * one the index currently points at. Advancing the index by one after a match
   * therefore leaves it trailing, and the season starts offering matches that
   * have already been played: a won cup final gets replayed, and losing the
   * replay hands the trophy to the opponent.
   */
  slotIndex: number;
  /**
   * The week of the season this is played in.
   *
   * Attached by `nextMatch` from the slot rather than by each of the helpers
   * that build a match, so there is one place that can get it wrong instead of
   * five. Read by the hub, to say where in the season you are, and by fitness:
   * two matches in one week is the whole reason weeks exist.
   */
  week: number;
  /** League round, or cup round. */
  round: number;
  opponentId: string;
  home: boolean;
  /** Present for cup ties; names the round as "Semi-final" and so on. */
  roundLabel?: string;
}

/**
 * The player's European fixture in one calendar slot, or nothing.
 *
 * Two competitions in one, and the round number says which: the first three
 * dates are group matches from a fixture list drawn in July, the rest are ties
 * in a bracket that does not exist until the groups have finished. A club that
 * did not get out of its group has nothing on the later dates, which is the
 * whole point of a group stage.
 */
function europeanMatch(
  state: CareerState,
  slotIndex: number,
  round: number,
  tier: EuropeanTier,
): Omit<ScheduledMatch, 'week'> | null {
  const europe = state.europe;
  if (!europe || europe.kind !== tier) return null;

  if (isGroupRound(round)) {
    const fixture = groupFixtureFor(europe, state.clubId, round);
    if (!fixture) return null;
    // Already played: the group table has it, so there is nothing to offer.
    const played = europe.results.some(
      (r) => r.round === round && r.homeId === fixture.homeId && r.awayId === fixture.awayId,
    );
    if (played) return null;
    return {
      competition: tier,
      slotIndex,
      round,
      opponentId: fixture.homeId === state.clubId ? fixture.awayId : fixture.homeId,
      home: fixture.homeId === state.clubId,
      roundLabel: `Group match ${round}`,
    };
  }

  const knockout = europe.knockout;
  if (!knockout || !stillIn(knockout, state.clubId)) return null;
  const koRound = knockoutRoundOf(round);
  const drawn = knockout.rounds[koRound - 1];
  const tie = drawn ? tieFor(drawn, state.clubId) : null;
  return {
    competition: tier,
    slotIndex,
    round,
    opponentId: tie ? opponentIn(tie, state.clubId) : '',
    home: tie ? tie.homeId === state.clubId : true,
    roundLabel: roundName(koRound, EUROPEAN_KNOCKOUT_ROUNDS),
  };
}

/**
 * What the player actually plays next, across all three competitions.
 *
 * Cup slots for a cup he is out of are SKIPPED rather than played, which is why
 * this walks the calendar rather than indexing it: being knocked out means the
 * rest of that competition's slots simply are not his matches. Returns null
 * once nothing is left, which is what ends the season.
 */
export function nextMatch(state: CareerState): ScheduledMatch | null {
  const calendar = calendarFor(state);
  const fixtures = fixturesFor(state, state.clubId);

  for (let i = state.calendarIndex; i < calendar.length; i++) {
    const slot = calendar[i]!;

    if (slot.competition === 'league') {
      const fixture = fixtures[state.nextFixtureIndex];
      if (!fixture) continue;
      return {
        competition: 'league',
        slotIndex: i,
        week: slot.week,
        round: slot.round,
        opponentId: fixture.homeId === state.clubId ? fixture.awayId : fixture.homeId,
        home: fixture.homeId === state.clubId,
      };
    }

    if (isSuperCup(slot.competition)) {
      // One match, and only for the two clubs that earned it. Everybody else
      // simply does not have a fixture that week.
      const tie = state.superCup;
      if (!tie || tie.winnerId || !playsInSuperCup(tie, state.clubId)) continue;
      return {
        competition: slot.competition,
        slotIndex: i,
        week: slot.week,
        round: 1,
        opponentId: superCupOpponent(tie, state.clubId),
        // The champions are at home; the challenger travels.
        home: tie.championId === state.clubId,
        roundLabel: 'Final',
      };
    }

    if (isInternational(slot.competition)) {
      const international = internationalMatch(state, i, slot.round);
      if (!international) continue;
      return { ...international, week: slot.week };
    }

    if (isEuropean(slot.competition)) {
      const european = europeanMatch(state, i, slot.round, slot.competition);
      if (!european) continue;
      return { ...european, week: slot.week };
    }

    const cup = knockoutFor(state, slot.competition);
    if (!cup || !stillIn(cup, state.clubId)) continue;

    // The tie itself is only drawn when the round is opened, which the career
    // service does at the moment the match is about to be played. Until then
    // all that is known is that there IS a match — the opponent is decided by
    // the round before it, which may only just have finished.
    const drawn = cup.rounds[slot.round - 1];
    const tie = drawn ? tieFor(drawn, state.clubId) : null;
    return {
      competition: slot.competition,
      slotIndex: i,
      week: slot.week,
      round: slot.round,
      opponentId: tie ? opponentIn(tie, state.clubId) : '',
      home: tie ? tie.homeId === state.clubId : true,
      roundLabel: roundName(slot.round),
    };
  }

  return null;
}

/**
 * Where the calendar actually stands, skipping slots that are not the player's.
 * The season is over when nothing playable is left.
 */
export function seasonComplete(state: CareerState): boolean {
  return nextMatch(state) === null;
}

export function matchesRemaining(state: CareerState): number {
  const calendar = calendarFor(state);
  const fixtures = fixturesFor(state, state.clubId);
  let remaining = 0;
  let leaguePlayed = state.nextFixtureIndex;
  const counted = new Set<CompetitionKind>();

  for (let i = state.calendarIndex; i < calendar.length; i++) {
    const slot = calendar[i]!;
    if (slot.competition === 'league') {
      if (fixtures[leaguePlayed]) {
        remaining += 1;
        leaguePlayed += 1;
      }
      continue;
    }
    if (isInternational(slot.competition)) {
      // An international is his COUNTRY's match, not his club's, so it cannot
      // be counted by asking whether his club is still in something. Each group
      // round he is picked for is a match he will play; the knockout counts as
      // one more, on the same "only the next round" rule as a cup.
      if (!internationalMatch(state, i, slot.round)) continue;
      if (slot.round > GROUP_ROUNDS) {
        if (counted.has(slot.competition)) continue;
        counted.add(slot.competition);
      }
      remaining += 1;
      continue;
    }

    // Only the NEXT round of each live cup counts. Whether he plays the round
    // after that depends on a result nobody has yet, so counting every
    // remaining round would advertise a 47-match season to a player whose cup
    // runs will almost certainly end sooner.
    const cup = knockoutFor(state, slot.competition);
    if (cup && stillIn(cup, state.clubId) && !counted.has(slot.competition)) {
      counted.add(slot.competition);
      remaining += 1;
    }
  }

  return remaining;
}

export interface MatchOutcomeInput {
  stats: MatchStats;
  rating: number;
  /** 1 win, 0 draw, -1 defeat. */
  result: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Coaching quality of the player's club, 0-1. */
  coaching: number;
  /** Standing of the player's club, 0-1; how widely the match was watched. */
  clubStature: number;
  /** How closely the division is watched, 0-1. */
  divisionPrestige: number;
  /** Fitness left at the final whistle. */
  fitnessAtEnd: number;
  /** Which competition it was, so league statistics stay separable. */
  competition: CompetitionKind;
  /** The calendar slot it was played in, so the season advances past it. */
  slotIndex: number;
  /** True when it was resolved automatically rather than played. */
  skipped: boolean;
  /**
   * The decision pace it was played at, or null when it was skipped.
   *
   * Null rather than the setting in force, because a skipped match was not
   * played at any pace: counting it under whatever the menu happened to say
   * would credit a career with football it never sat through.
   */
  pace: string | null;
}

/** Fold one match into a running set of statistics. */
function addMatchToStats(
  season: SeasonStats,
  stats: MatchStats,
  rating: number,
  result: number,
): void {
  season.matches += 1;
  season.starts += 1;
  season.minutes += stats.minutes;
  season.goals += stats.goals;
  season.assists += stats.assists;
  season.shots += stats.shots;
  season.shotsOnTarget += stats.shotsOnTarget;
  season.keyPasses += stats.keyPasses;
  season.dribbles += stats.dribbles;
  season.dribblesAttempted += stats.dribblesAttempted;
  season.passes += stats.passes;
  season.passesCompleted += stats.passesCompleted;
  season.tackles += stats.tackles;
  season.interceptions += stats.interceptions;
  season.bigChancesMissed += stats.bigChancesMissed;
  season.fouls += stats.fouls;
  season.ratingTotal += rating;
  season.bestRating = Math.max(season.bestRating, rating);
  if (result > 0) season.wins += 1;
  else if (result < 0) season.defeats += 1;
  else season.draws += 1;
}

/**
 * Fold one completed match into the career: season statistics, form, morale,
 * development, experience and fitness recovery.
 *
 * This is the ONLY place a match is allowed to change the persistent player,
 * which is why the engine plays a clone.
 */
export function applyMatchToCareer(
  rng: Rng,
  state: CareerState,
  input: MatchOutcomeInput,
): AttributeChange[] {
  const { stats, rating, result } = input;

  // Every match feeds the season total; only league matches feed the league
  // ledger the awards are judged on. Accumulating both here rather than at the
  // call site means the two can never drift apart.
  addMatchToStats(state.seasonStats, stats, rating, result);
  if (input.competition === 'league') {
    addMatchToStats(state.leagueStats, stats, rating, result);
  }

  // How the match was reached, as opposed to how it went. Counted here for the
  // same reason the statistics are: this is the one place a completed match
  // becomes part of the career, so the two can never drift apart.
  state.howPlayed ??= createHowItWasPlayed();
  if (input.skipped) {
    state.howPlayed.skipped += 1;
  } else {
    state.howPlayed.played += 1;
    if (input.pace) {
      state.howPlayed.paces[input.pace] = (state.howPlayed.paces[input.pace] ?? 0) + 1;
    }
  }

  // A cap is a match played in the shirt, counted here rather than inferred.
  if (input.competition === INTERNATIONAL) state.seasonCaps += 1;

  // The record book takes every match in every competition: a hat-trick is a
  // hat-trick whether it came in the league or a European quarter-final.
  recordMatchInBook(state.records, {
    competition: input.competition,
    goals: stats.goals,
    assists: stats.assists,
    rating,
    result,
  });

  // Form is a moving average of recent ratings, expressed on the 0-100 scale
  // the timer and resolver expect. It moves quickly but not instantly.
  const ratingAsForm = clamp((rating - 4) * 16.5, 0, 100);
  state.player.form = round(state.player.form * 0.65 + ratingAsForm * 0.35, 1);

  // Morale follows results more than personal performance.
  const moraleTarget = result > 0 ? 78 : result < 0 ? 34 : 52;
  state.player.morale = round(
    state.player.morale * 0.7 + (moraleTarget + (rating - 6.5) * 6) * 0.3,
    1,
  );
  state.player.morale = clamp(state.player.morale, 0, 100);

  const development = developAfterMatch(rng, state.development, {
    player: state.player,
    rating,
    minutes: stats.minutes,
    coaching: input.coaching,
  });

  // Reputation moves fast on goals and standout ratings; the summer settles it
  // back toward what the season as a whole justifies (see reputation.ts).
  const reputationGain = matchReputationGain({
    goals: stats.goals,
    assists: stats.assists,
    rating,
    clubStature: input.clubStature,
    reputation: state.player.reputation,
    divisionPrestige: input.divisionPrestige,
  });
  state.player.reputation = clamp(state.player.reputation + reputationGain, 0, 100);

  if (input.competition === 'league') state.nextFixtureIndex += 1;
  // Past the slot that was PLAYED, not one past where the walk started.
  state.calendarIndex = input.slotIndex + 1;

  restUntilNextMatch(state, input.slotIndex, input.fitnessAtEnd);

  // Then, and only then, the roll for a new one. AFTER the rest above rather
  // than before it, so a fresh diagnosis keeps its full length: an injury found
  // at this whistle starts serving from here, and must not have the week that
  // led up to it deducted from it.
  //
  // He can only be here if he was fit, so there is never an old injury to
  // collide with.
  state.injury = rollInjury(
    rng,
    {
      fitnessAtEnd: input.fitnessAtEnd,
      minutes: stats.minutes,
      age: state.player.age,
      stamina: state.player.attributes.stamina,
    },
    state.seasonNumber,
  );

  state.lastDevelopment = development.changes;
  return development.changes;
}

/**
 * Rest between this match and the next: fitness back, and an injury one week
 * closer to over.
 *
 * Shared by the two ways a fixture can pass — played, and missed through
 * injury — because they are the same question. Asked AFTER the indexes move,
 * because "the next game" is a question only the advanced career can answer.
 * `nextMatch` walks past every slot that is not his — a cup he is out of, a
 * European tier he is not in, an international he was not picked for — so a
 * midweek he has no fixture in correctly reads as rest rather than as
 * congestion. That accuracy is why this is computed here rather than handed in.
 */
export function restUntilNextMatch(
  state: CareerState,
  playedSlotIndex: number,
  fitnessAtEnd: number,
): void {
  const playedWeek = calendarFor(state)[playedSlotIndex]?.week ?? 1;
  const next = nextMatch(state);
  // Nothing left means the season is over, and the summer resets fitness to
  // 100 regardless — a full week is the honest neutral answer either way.
  const weeks = next ? next.week - playedWeek : 1;

  state.fitness = clamp(fitnessAtEnd + fitnessRecovery(weeks), 0, 100);
  state.player.fitness = state.fitness;
  state.injury = advanceInjury(state.injury, weeks);
}

/**
 * Close the season: archive it, age the player, drift his potential and reset
 * for the next campaign. The caller supplies the new fixtures and table.
 */
export function advanceSeason(
  rng: Rng,
  state: CareerState,
  position: number,
  next: {
    fixtures: Fixture[];
    table: TableRow[];
    leagueTeamIds: string[];
    division: number;
    countryId: string;
  },
): SeasonRecord {
  const record: SeasonRecord = {
    seasonNumber: state.seasonNumber,
    clubId: state.clubId,
    position,
    stats: state.seasonStats,
    age: state.player.age,
    division: state.division,
    countryId: state.countryId,
    cupsWon: CUP_KINDS.filter((kind) => state.cups?.[kind]?.winnerId === state.clubId),
    europeanTier: state.europe?.kind ?? null,
    wonEurope: europeanWinner(state.europe) === state.clubId,
  };
  state.history.push(record);

  const averageRating =
    state.seasonStats.matches > 0 ? state.seasonStats.ratingTotal / state.seasonStats.matches : 6;

  state.player.age += 1;
  driftPotential(rng, state.player, averageRating);

  state.seasonNumber += 1;
  state.seasonStats = createSeasonStats();
  state.leagueStats = createSeasonStats();
  state.seasonCaps = 0;
  state.calendarIndex = 0;
  // A run does not span a summer: "eleven in a row" has to mean eleven
  // consecutive matches, not a number that quietly skips three months off.
  breakStreaks(state.records);
  state.fixtures = next.fixtures;
  state.table = next.table;
  state.leagueTeamIds = next.leagueTeamIds;
  state.division = next.division;
  state.countryId = next.countryId;
  state.results = [];
  state.nextFixtureIndex = 0;
  state.development = createDevelopmentState();
  state.lastDevelopment = [];
  // Last season's final match must not greet the player on the first day of the
  // new one — the hub reports it as "your last match".
  state.lastResult = null;
  state.fitness = 100;
  state.player.fitness = 100;
  // A summer heals everything. Carrying a rupture into pre-season would be the
  // better simulation and it is not worth what it costs: the break between
  // seasons is months long, so almost every injury genuinely would have healed,
  // and the one that would not is a rare enough case that modelling it means
  // greeting somebody with an unplayable August for the sake of realism nobody
  // asked for. The cost is that an injury picked up in May is served cheaply,
  // and that is the honest trade.
  state.injury = null;

  // Re-baseline for the new season. Note this happens AFTER ageing and
  // potential drift, so next season's review measures the new season only.
  state.seasonStartAttributes = { ...state.player.attributes };
  state.seasonStartAbility = currentAbility(state.player);
  state.seasonStartExperience = state.player.experience;

  return record;
}

export function careerAbility(state: CareerState): number {
  return currentAbility(state.player);
}
