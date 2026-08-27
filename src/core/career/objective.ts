import type { Position } from '../player/positions.ts';
import { clamp, round } from '../util/math.ts';
import type { SeasonStats } from './seasonStats.ts';
import type { SquadRole } from './transfers.ts';

/**
 * WHAT HE WANTS FROM YOU THIS SEASON
 *
 * Manager confidence has been the club's opinion of you since it was written,
 * and it has moved every single match without the player ever being told what
 * he was being judged AGAINST. That is a scoreboard with no posted score: the
 * number goes up and down, the tier label changes, and the one question a
 * footballer would actually ask his manager in August — what do you want from
 * me — had no answer anywhere in the game.
 *
 * So the manager says it. Two numbers and a sentence, set when a season starts,
 * visible on the hub all year, and settled in the summer.
 *
 * WHY TWO NUMBERS AND NOT ONE. Because the two ways of failing are different
 * and a career has to be able to tell them apart. A striker who plays thirty
 * matches and scores four has a problem; one who scores eight in eleven has a
 * different problem, and it is not his finishing. Appearances and contributions
 * separate "he does not pick me" from "I am not delivering", which are the two
 * arguments this game already models everywhere else.
 *
 * WHY IT IS NOT A NEW COUNTER. Everything it reads — matches, goals, assists —
 * was already in `SeasonStats` before this existed, for the same reason the
 * traits and the moments were built that way: a career already under way gets
 * an objective it can actually meet, rather than a feature that starts counting
 * from now. See core/player/traits.ts for the version of this lesson that cost
 * three attempts.
 *
 * IT IS NOT ALLOWED TO BE A SPIRAL, and this is the constraint that shaped the
 * judging. Being dropped already costs confidence indirectly, and an objective
 * that punished a player for the appearances his manager refused to give him
 * would make being out of favour the CAUSE of being further out of favour —
 * exactly the trap `confidenceAfterAbsence` and `missMatch` are both written to
 * avoid. Two defences:
 *
 *   A season lost to INJURY is not judged at all. Nobody is judged for a torn
 *   hamstring, and the game says so out loud rather than quietly forgiving it.
 *   The appearance target is set from the ROLE HE WAS PROMISED, so a squad
 *   player is asked for a squad player's season. Missing it means missing what
 *   his own contract said he was, which is a fair thing to be asked about.
 *
 * AND IT IS DELIBERATELY GENTLE. Meeting an objective is worth less than a good
 * month of football; missing one is worth less than a bad one. It is a verdict
 * on a season, not a replacement for the season — the matches are still where a
 * manager's mind is actually changed, and a summer that could overturn a year
 * of performances would make the year not matter.
 */

export type ObjectiveVerdict = 'exceeded' | 'met' | 'missed' | 'unjudged';

export interface SeasonObjective {
  /** The season it was set for, so a stale one can never be judged. */
  season: number;
  /**
   * The club that set it.
   *
   * A move means a new manager with his own view, so an objective never travels
   * — the same reason confidence itself belongs to the club rather than to the
   * player. Checked when judging, so a summer transfer cannot be marked against
   * a demand somebody else made.
   */
  clubId: string;
  /** Matches he is expected to play, all competitions. */
  appearances: number;
  /** Goals and assists together. */
  contributions: number;
  /** What he was told, in the manager's words rather than the model's. */
  brief: string;
}

/**
 * How much football a season is, against its league fixture list.
 *
 * A first-choice player does not play thirty matches in a thirty-match league:
 * he plays those plus the cup ties, the European nights and the internationals
 * he is picked for. Measured rather than guessed — `measureInjuries.ts` reports
 * 33.4 to 35.0 appearances a season across whole simulated careers on a
 * thirty-fixture league, which is where this number comes from and why it is
 * not a round one.
 *
 * It is the multiplier that turns "the league has thirty rounds" into "a full
 * season is about thirty-four matches", which is what a role share is a share
 * OF.
 */
export const SEASON_BREADTH = 1.15;

/**
 * How much of a season each squad role is expected to play.
 *
 * The contract's word for him, turned into a number. This is the third thing
 * `contract.role` now decides — it already sets what the rival may be and
 * biases selection — and it is the one that makes the term answerable in
 * August rather than in May.
 *
 * Short of the obvious values on purpose. A star is not asked for every match,
 * because nobody plays every match and an objective that assumed so would be
 * missed by every career including the great ones; a squad player is asked for
 * a real share rather than a token, because being fringe is not the same as
 * being absent.
 */
export const ROLE_APPEARANCE_SHARE: Record<SquadRole, number> = {
  star: 0.78,
  starter: 0.64,
  squad: 0.42,
};

/**
 * Goals and assists per appearance, by what he is on the pitch to do.
 *
 * Rates rather than totals, so the same table works for a thirty-match season
 * and a fifteen-match one.
 *
 * CALIBRATED RATHER THAN ESTIMATED, and the first attempt was wrong by a factor
 * of about one and a half in the direction nobody expects. The rates started at
 * what a striker "ought" to score by the standards of real football, and
 * `measureObjectives.ts` showed 77% of seasons EXCEEDING the demand and only 12%
 * missing it — a target three-quarters of careers clear without noticing is not
 * a target. This engine is simply more generous than real football: an
 * auto-played striker returns about 1.22 goals and assists per appearance, and
 * auto-play is the floor rather than the ceiling (see scripts/measureAutoPlay.ts).
 *
 * So the striker's rate is set just under what a SKIPPED season already
 * produces. That is the level where a good season clears it, an ordinary one is
 * close, and a poor one misses — which is the whole job.
 *
 * ONLY THE STRIKER IS MEASURED. The probe career is a centre-forward, so every
 * other rate here keeps its original SHAPE relative to him and was scaled by the
 * same factor. They are honest relative values on an unmeasured absolute scale,
 * and a probe for another position would be the way to improve them rather than
 * an argument about what a full-back ought to get.
 */
export const POSITION_CONTRIBUTION_RATE: Record<Position, number> = {
  GK: 0.02,
  CB: 0.07,
  LB: 0.14,
  RB: 0.14,
  DM: 0.16,
  CM: 0.29,
  AM: 0.53,
  LW: 0.60,
  RW: 0.60,
  ST: 0.76,
};

/** How far ability moves the contribution demand, at either extreme. */
export const ABILITY_SWING = 0.4;

/**
 * How much of last season's return the manager expects again.
 *
 * The half of the demand that is grounded in the player rather than in a table,
 * and it is capped for a reason: a pure "beat last year" objective is a
 * treadmill that eventually asks a great career for a number nobody can reach,
 * and this codebase has already refused one exchange rate it could not honestly
 * produce (see CHANGELOG.md, item 11). Blending it with the positional
 * expectation keeps the demand recognisably about HIM without letting one
 * extraordinary season set the price of every season after it.
 */
export const LAST_SEASON_WEIGHT = 0.5;

/** The most last season can inflate a demand, against the positional figure. */
export const DEMAND_CEILING = 1.4;

export interface ObjectiveInput {
  season: number;
  clubId: string;
  role: SquadRole;
  position: Position;
  /** 1-99, as `currentAbility` reports it. */
  ability: number;
  /** How strong the squad around him is, 1-99. */
  squadLevel: number;
  /**
   * League fixtures in the season ahead.
   *
   * The LEAGUE list rather than the calendar, and that distinction is the whole
   * of this number being right. The calendar is measured in weeks and carries
   * every date the season could contain — cup rounds his club may go out of in
   * August, international dates he may never be picked for — so a demand set
   * against its length asks a first-season teenager for more appearances than
   * exist to be made. The league is the one competition whose fixtures are all
   * certainly going to be played, which makes it the only honest spine to
   * measure a season against.
   */
  leagueFixtures: number;
  /** What he actually returned last season, if there was one. */
  lastSeason?: { appearances: number; contributions: number };
}

/**
 * What the manager asks for.
 *
 * Pure and total: everything it needs is in the input, so it can be tested
 * without building a career and read without opening the career service.
 */
export function setObjective(input: ObjectiveInput): SeasonObjective {
  const fullSeason = input.leagueFixtures * SEASON_BREADTH;
  const appearances = Math.max(
    4,
    Math.round(fullSeason * ROLE_APPEARANCE_SHARE[input.role]),
  );

  // Ability against the squad he is in, not against the world. A good player at
  // a poor club is the man they look to; the same player at a great one is one
  // of several, and is asked for less on his own account.
  const standing = clamp((input.ability - input.squadLevel) / 25, -1, 1);
  const rate = POSITION_CONTRIBUTION_RATE[input.position] * (1 + standing * ABILITY_SWING);
  const positional = appearances * rate;

  const blended = input.lastSeason
    ? positional * (1 - LAST_SEASON_WEIGHT) +
      Math.min(input.lastSeason.contributions, positional * DEMAND_CEILING) * LAST_SEASON_WEIGHT
    : positional;

  const contributions = Math.max(1, Math.round(blended));

  return {
    season: input.season,
    clubId: input.clubId,
    appearances,
    contributions,
    brief: briefFor(input.role, appearances, contributions),
  };
}

/**
 * The demand in the manager's voice.
 *
 * Written here rather than in the hub because the words are part of the
 * mechanic: a target rendered as `28 / 15` is a progress bar, and the thing
 * being modelled is a person telling you what he wants. The hub renders this
 * and adds nothing, which is the same contract the moments have.
 */
function briefFor(role: SquadRole, appearances: number, contributions: number): string {
  const ask = `${appearances} appearances and ${contributions} goals or assists`;
  if (role === 'star') {
    return `You are his best player. He wants ${ask} — and a season people remember.`;
  }
  if (role === 'starter') {
    return `He is picking you to start. ${ask[0]!.toUpperCase()}${ask.slice(1)}, and the shirt is yours.`;
  }
  return `You are in his squad, not yet his side. ${ask[0]!.toUpperCase()}${ask.slice(1)} would change that.`;
}

/**
 * How much of a season has to be lost to injury before nobody is judged.
 *
 * Set where it is because a season is not thrown away by one bad tear: missing
 * a fifth of the fixtures is a normal season for a normal footballer, and
 * forgiving that would forgive nearly everybody. Above this he has not had a
 * season to be judged on, and being asked about it would be the game punishing
 * bad luck.
 */
export const INJURY_FORGIVENESS = 0.35;

export interface ObjectiveOutcome {
  verdict: ObjectiveVerdict;
  /** What it does to the manager's view of him. */
  confidenceShift: number;
  /** What he is told in the summer. */
  note: string;
}

/** Comfortably past the demand rather than a match over it. */
export const EXCEEDED_MARGIN = 1.25;

/**
 * WHAT MEETING IT IS WORTH, and why these numbers are small.
 *
 * Confidence moves 10-22% of the way toward a match's verdict every time he
 * plays, so a season of thirty matches is worth vastly more than anything here.
 * That ordering is deliberate and load-bearing: the football is where a manager
 * makes his mind up, and a summer verdict that could overturn it would make the
 * football decorative. This is the conversation in his office afterwards, and a
 * conversation is worth a few points.
 */
export const OBJECTIVE_SHIFT = { exceeded: 9, met: 3, missed: -8 } as const;

/**
 * Settle it.
 *
 * `injuredFixtures` is how many of the season's matches he missed hurt, and it
 * is the whole of the no-spiral defence: above `INJURY_FORGIVENESS` the
 * objective is not judged in either direction — a player cannot fail one from
 * the treatment room, and neither can he pass one from there.
 *
 * A stale objective — a different season, or one set by a club he has since
 * left — returns `unjudged` rather than throwing. The summer runs a great many
 * steps in an order that has changed before, and a career should not end on an
 * exception because a transfer landed a line earlier than this expected.
 */
export function judgeObjective(
  objective: SeasonObjective | null | undefined,
  stats: SeasonStats,
  context: { season: number; clubId: string; fixtures: number; injuredFixtures: number },
): ObjectiveOutcome {
  if (
    !objective ||
    objective.season !== context.season ||
    objective.clubId !== context.clubId
  ) {
    return { verdict: 'unjudged', confidenceShift: 0, note: '' };
  }

  if (
    context.fixtures > 0 &&
    context.injuredFixtures / context.fixtures > INJURY_FORGIVENESS
  ) {
    return {
      verdict: 'unjudged',
      confidenceShift: 0,
      note: 'You spent too much of the season injured for anybody to judge it.',
    };
  }

  const contributions = stats.goals + stats.assists;
  const playedEnough = stats.matches >= objective.appearances;
  const deliveredEnough = contributions >= objective.contributions;

  if (playedEnough && deliveredEnough) {
    // BOTH halves, not either. Measured: on `||` more than half of all seasons
    // came back "exceeded", because clearing one half comfortably is ordinary
    // and clearing the appearance half is nearly automatic for anybody being
    // picked. A verdict most seasons receive is not a verdict — exceeding has
    // to mean he played the football AND delivered on it.
    const comfortably =
      stats.matches >= objective.appearances * EXCEEDED_MARGIN &&
      contributions >= objective.contributions * EXCEEDED_MARGIN;
    return comfortably
      ? {
          verdict: 'exceeded',
          confidenceShift: OBJECTIVE_SHIFT.exceeded,
          note: 'You gave him more than he asked for.',
        }
      : {
          verdict: 'met',
          confidenceShift: OBJECTIVE_SHIFT.met,
          note: 'You did what he asked of you.',
        };
  }

  // Named rather than scored, because which half he missed is the useful fact
  // and an aggregate percentage would hide it. These are the two different
  // conversations a manager has in the summer.
  const note = !playedEnough
    ? deliveredEnough
      ? 'You delivered when you played. He wanted you out there more often.'
      : 'You were not in the side enough, and it showed in the numbers.'
    : 'You played the football. The goals and assists were not there.';

  return { verdict: 'missed', confidenceShift: OBJECTIVE_SHIFT.missed, note };
}

/** How far along he is, 0-1 per half. For the hub. */
export function objectiveProgress(
  objective: SeasonObjective,
  stats: SeasonStats,
): { appearances: number; contributions: number } {
  return {
    appearances: clamp(stats.matches / Math.max(1, objective.appearances), 0, 1),
    contributions: clamp(
      (stats.goals + stats.assists) / Math.max(1, objective.contributions),
      0,
      1,
    ),
  };
}

/**
 * Where he stands, in a few words, for the hub's peek.
 *
 * Rounded to whole matches because that is the unit a footballer thinks in, and
 * `round` from the shared maths rather than `toFixed`, so it matches every other
 * figure the hub shows.
 */
export function objectiveSummary(objective: SeasonObjective, stats: SeasonStats): string {
  const contributions = stats.goals + stats.assists;
  return `${stats.matches}/${objective.appearances} apps · ${contributions}/${objective.contributions} g+a`;
}

/** Whether both halves are already done, so the hub can say so. */
export function objectiveAchieved(objective: SeasonObjective, stats: SeasonStats): boolean {
  return (
    stats.matches >= objective.appearances &&
    stats.goals + stats.assists >= objective.contributions
  );
}

/** Rounded progress across both halves, 0-1, for anything that wants one number. */
export function objectiveShare(objective: SeasonObjective, stats: SeasonStats): number {
  const progress = objectiveProgress(objective, stats);
  return round((progress.appearances + progress.contributions) / 2, 3);
}
