/**
 * WHAT A SECTION SAYS BEFORE YOU OPEN IT
 *
 * The competitions peek is the only one of the four that has to be computed
 * rather than counted, and it is the one that got it wrong: it named the round
 * a cup had reached by counting the rounds already played, which in August is
 * none of them, and printed "Round 0" — a round nobody has ever been in, on a
 * line whose entire job is to be true at a glance.
 *
 * It lives out here rather than inside the screen so it can be read at all.
 * The screen needs a career, a DOM and a season's worth of set-up to render one
 * line; this needs four fields.
 */

import type { CupKind, CupState } from '../core/career/cups.ts';
import { CUP_KINDS, cupName, roundName, stillIn, totalRounds } from '../core/career/cups.ts';
import type { EuropeanTier } from '../core/career/europe.ts';
import { europeanCompetition } from '../core/career/europe.ts';

export interface CompetitionsPeekInput {
  cups?: Record<CupKind, CupState>;
  clubId: string;
  countryId: string;
  /**
   * Only the tier, because only the tier is read. Taking the whole European
   * state would make this function look like it knows how the group stage is
   * going, and the next person to edit it would try to say so.
   */
  europe: { kind: EuropeanTier } | null;
}

/**
 * The shortest true thing that can be said about where his season stands.
 *
 * A cup he is still in AND has actually played beats one that has only been
 * drawn: in August both are alive, and "in the fourth round" is the sentence
 * worth spending the line on. A cup with nothing behind it says "not started",
 * which is the wording the cup card itself uses — a peek that contradicts the
 * card it is peeking at is worse than no peek.
 */
export function competitionsPeek(input: CompetitionsPeekInput): string {
  const parts: string[] = [];
  let notStarted = '';

  for (const kind of CUP_KINDS) {
    const cup = input.cups?.[kind];
    if (!cup || !stillIn(cup, input.clubId)) continue;
    const name = cupName(kind, input.countryId);
    if (cup.rounds.length === 0) {
      if (!notStarted) notStarted = `${name} · not started`;
      continue;
    }
    parts.push(`${name} · ${roundName(cup.rounds.length, totalRounds(cup))}`);
    break;
  }

  if (parts.length === 0 && notStarted) parts.push(notStarted);
  if (input.europe) parts.push(europeanCompetition(input.europe.kind).name);
  if (parts.length === 0) parts.push('Nothing left to play for beyond the league');
  return parts.join(' · ');
}
