import type { HowItWasPlayed } from './career.ts';

/**
 * HOW MUCH OF THIS CAREER WAS ACTUALLY PLAYED
 *
 * The second half of CHANGELOG item 11, and the half that spent a long time
 * open. The counting arrived in v18 — matches skipped, matches played, and the
 * pace each played one was played at — and nothing has ever read it.
 *
 * WHY THIS IS A LABEL RATHER THAN A PENALTY, which is the whole design and a
 * deliberate departure from how the item was first written.
 *
 * It was raised as "the career score should be penalised for skipped matches
 * and for a generous pace", and that framing has a problem it cannot solve: how
 * much? A skipped match is worth what fraction of a played one? Is Relaxed
 * worth 0.9 of Standard, or 0.75? Nothing in the game can answer that, because
 * it is not a question about football — it is a question about how somebody
 * chose to spend their evening, and there is no correct exchange rate between
 * an hour of a person's attention and a number on a wall.
 *
 * A label needs no exchange rate. "Played out at Hardcore" and "largely
 * simulated" are different careers and the wall can say so plainly, which is
 * all the original item actually wanted: for the two not to look identical.
 * Nothing here touches `careerScore`, and there is a test that says so.
 *
 * THE HONESTY PROBLEM, and it is the reason `reliable` exists. A career begun
 * before v18 under-counts itself: the counter can only count forward, so a
 * ten-season career carried through that migration has counts covering however
 * much of it happened afterwards. Reporting "largely simulated" for a career
 * that was played in full, on the strength of counts that were never kept,
 * would be worse than saying nothing. So the summary compares what was counted
 * against what was played, and reports the whole thing as unrecorded when the
 * two do not agree.
 */

export interface HowPlayedSummary {
  /** Matches the counter knows about at all. */
  counted: number;
  played: number;
  skipped: number;
  /** Share of counted matches actually played, 0-1. Null when nothing was. */
  playedShare: number | null;
  /**
   * The pace id most of the played matches were played at, or null.
   *
   * An ID rather than a label, because the ids live in `simulation/` and this
   * is `core`. It is also why an id this game no longer recognises has to
   * degrade to nothing rather than to a raw string on screen — the histogram is
   * deliberately keyed loosely so an old save keeps its counts as an unreadable
   * tally rather than failing to load.
   */
  dominantPace: string | null;
  /** What share of the played matches that pace accounts for, 0-1. */
  dominantShare: number;
  /**
   * False when the counts do not cover enough of the career to mean anything.
   *
   * The screens show `label` regardless; it says so.
   */
  reliable: boolean;
  label: string;
  detail: string;
}

/**
 * How much of the career has to be counted before the counts are worth reading.
 *
 * Nine tenths, which is strict on purpose. The failure this guards against is
 * confidently mislabelling a career that was played in full, and there is no
 * cost to declining to label one — "not recorded" is a true and unembarrassing
 * thing for a wall to say about a career from before anybody was counting.
 */
export const COVERAGE_REQUIRED = 0.9;

export function describeHowPlayed(
  howPlayed: HowItWasPlayed | undefined,
  /** Appearances the career actually made, from the record book. */
  appearances: number,
): HowPlayedSummary {
  const played = howPlayed?.played ?? 0;
  const skipped = howPlayed?.skipped ?? 0;
  const counted = played + skipped;

  const paces = howPlayed?.paces ?? {};
  let dominantPace: string | null = null;
  let dominantCount = 0;
  for (const [pace, count] of Object.entries(paces)) {
    if (count > dominantCount) {
      dominantPace = pace;
      dominantCount = count;
    }
  }

  const unrecorded: HowPlayedSummary = {
    counted,
    played,
    skipped,
    playedShare: null,
    dominantPace: null,
    dominantShare: 0,
    reliable: false,
    label: 'Not recorded',
    detail:
      'This career began before the game started counting how much of itself was played. ' +
      'Nothing can reconstruct it.',
  };

  if (counted === 0) return unrecorded;
  // A career whose counts cover only part of itself cannot be summarised by
  // them. Note this compares against APPEARANCES rather than fixtures: matches
  // missed injured were never his to play or skip, so they are not missing from
  // the count, they were never in it.
  if (appearances > 0 && counted < appearances * COVERAGE_REQUIRED) return unrecorded;

  const playedShare = played / counted;
  const dominantShare = played > 0 ? dominantCount / played : 0;

  return {
    counted,
    played,
    skipped,
    playedShare,
    dominantPace,
    dominantShare,
    reliable: true,
    label: labelFor(playedShare),
    detail: detailFor(played, skipped, playedShare),
  };
}

function labelFor(playedShare: number): string {
  if (playedShare >= 0.95) return 'Played out';
  if (playedShare >= 0.6) return 'Mostly played';
  if (playedShare >= 0.25) return 'Part-played';
  if (playedShare > 0) return 'Largely simulated';
  return 'Simulated';
}

function detailFor(played: number, skipped: number, playedShare: number): string {
  if (skipped === 0) return `Every one of ${played} matches played.`;
  if (played === 0) return `All ${skipped} matches resolved without you.`;
  const percent = Math.round(playedShare * 100);
  return `${played} of ${played + skipped} matches played — ${percent}% — and ${skipped} skipped.`;
}
