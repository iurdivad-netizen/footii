import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS } from '../player/attributes.ts';
import type { AttributeKey, Attributes } from '../player/attributes.ts';
import { currentAbility } from '../player/player.ts';
import type { CareerState } from './career.ts';

/**
 * A FOOTBALLER ACROSS A CAREER
 *
 * The hub's "Key attributes" card showed a man as he is today, and the review
 * every June showed how he moved in the season just finished. Nothing showed the
 * whole arc, because nothing recorded it: `history` kept statistics, and the only
 * attribute snapshot was the current season's, replaced every summer.
 *
 * This turns what is now recorded — the footballer on the first day, and at the
 * close of every season — into the points a chart is drawn from. It is pure and
 * lives here rather than in the view so that "what did his finishing do" has one
 * answer, and so a save with gaps in it is a case with a test rather than a
 * surprise on screen.
 *
 * THE GAPS ARE THE HARD PART. A career begun before this was recorded has seasons
 * with no attributes and no first day, and nothing can put them back. The rules:
 *
 *   NEVER INVENT A POINT. A start guessed from today's numbers draws a flat line
 *   across a career of growth, which is worse than no line.
 *   ALWAYS SAY WHERE THE RECORD BEGINS, so a short chart reads as a short record
 *   and not as a footballer who did not change.
 *   NEVER LEAVE IT EMPTY. The season in progress has an exact start (its
 *   snapshot), so even the oldest career has two honest points: then, and now.
 */

export type TimelineKind = 'origin' | 'season-end' | 'season-start' | 'now';

export interface TimelinePoint {
  kind: TimelineKind;
  /** In full: "End of season 3". */
  label: string;
  /** For an axis: "S3". */
  short: string;
  seasonNumber: number;
  age: number;
  ability: number;
  experience: number;
  attributes: Attributes;
  /** The club he played that season, for the points that close one. */
  clubId: string | null;
}

export interface AttributeTimeline {
  points: TimelinePoint[];
  /** True when the first point is the first day of the career. */
  complete: boolean;
}

type TimelineSource = Pick<
  CareerState,
  | 'player'
  | 'history'
  | 'origin'
  | 'seasonNumber'
  | 'clubId'
  | 'seasonStartAttributes'
  | 'seasonStartAbility'
  | 'seasonStartExperience'
>;

export function attributeTimeline(state: TimelineSource): AttributeTimeline {
  const points: TimelinePoint[] = [];

  if (state.origin) {
    points.push({
      kind: 'origin',
      label: 'Career start',
      short: 'Start',
      seasonNumber: 1,
      age: state.origin.age,
      ability: state.origin.ability,
      experience: state.origin.experience,
      attributes: { ...state.origin.attributes },
      clubId: null,
    });
  }

  for (const record of state.history) {
    // A season archived before the game kept these has nothing to draw. Skipped
    // rather than filled in: see the note at the top.
    if (!record.attributes || record.ability === undefined || record.experience === undefined) {
      continue;
    }
    points.push({
      kind: 'season-end',
      label: `End of season ${record.seasonNumber}`,
      short: `S${record.seasonNumber}`,
      seasonNumber: record.seasonNumber,
      age: record.age,
      ability: record.ability,
      experience: record.experience,
      attributes: { ...record.attributes },
      clubId: record.clubId,
    });
  }

  // A career with no recorded past at all — one that played seasons before this
  // existed — still has an exact start for the season it is in.
  if (points.length === 0) {
    points.push({
      kind: 'season-start',
      label: `Start of season ${state.seasonNumber}`,
      short: `S${state.seasonNumber}`,
      seasonNumber: state.seasonNumber,
      age: state.player.age,
      ability: state.seasonStartAbility,
      experience: state.seasonStartExperience,
      attributes: { ...state.seasonStartAttributes },
      clubId: null,
    });
  }

  points.push({
    kind: 'now',
    label: 'Now',
    short: 'Now',
    seasonNumber: state.seasonNumber,
    age: state.player.age,
    // From the same function the hub reads, so this chart cannot disagree with
    // the number on the card it opens from.
    ability: currentAbility(state.player),
    experience: state.player.experience,
    // A copy, like every other point: a snapshot that kept changing as he did
    // would be a chart of the present pretending to be a record.
    attributes: { ...state.player.attributes },
    clubId: state.clubId,
  });

  return { points, complete: state.origin != null };
}

export interface AttributeChange {
  key: AttributeKey;
  label: string;
  group: string;
  start: number;
  now: number;
  delta: number;
  /** One value per timeline point, in order. */
  series: number[];
}

/** Every attribute, first point to last, in family order. */
export function attributeChanges(timeline: AttributeTimeline): AttributeChange[] {
  const first = timeline.points[0]!;
  const last = timeline.points[timeline.points.length - 1]!;
  return ATTRIBUTE_GROUPS.flatMap((group) =>
    group.keys.map((key) => ({
      key,
      label: ATTRIBUTE_LABELS[key],
      group: group.label,
      start: first.attributes[key],
      now: last.attributes[key],
      delta: last.attributes[key] - first.attributes[key],
      series: timeline.points.map((point) => point.attributes[key]),
    })),
  );
}

/**
 * The biggest movers each way. Only movement counts: an attribute that did not
 * change is not a "gain", and a career with no growth reports none rather than
 * naming the three that happened to sort first.
 */
export function biggestMovers(
  changes: readonly AttributeChange[],
  count = 3,
): { gained: AttributeChange[]; slipped: AttributeChange[] } {
  const byDelta = [...changes].sort((a, b) => b.delta - a.delta);
  return {
    gained: byDelta.filter((change) => change.delta > 0).slice(0, count),
    slipped: byDelta
      .filter((change) => change.delta < 0)
      .reverse()
      .slice(0, count),
  };
}

export interface SeasonRow {
  point: TimelinePoint;
  /** Ability gained since the point before it, or null for the first point. */
  abilityDelta: number | null;
}

/** One row per timeline point, with what changed since the previous one. */
export function seasonRows(timeline: AttributeTimeline): SeasonRow[] {
  return timeline.points.map((point, index) => ({
    point,
    abilityDelta: index === 0 ? null : point.ability - timeline.points[index - 1]!.ability,
  }));
}
