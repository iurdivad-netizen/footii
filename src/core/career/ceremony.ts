import type { Honour, HonourKind } from './awards.ts';
import { leagueName } from './countries.ts';

/**
 * THE CEREMONY
 *
 * What a trophy looks like at the moment it is won, and what a season's awards
 * look like on the night they are handed out.
 *
 * WHY THIS EXISTS. Winning the cup used to produce a full-time screen reading
 * "2-1" and a button marked *Back to career*. The trophy itself appeared four
 * months later, as a row in a table on the season review, between a promotion
 * and a cap count. That is the same defect this codebase has now written up
 * three times in different clothes: morale was a stat with one consumer, a
 * trait announced only in a stats table is an invisible modifier, and a week's
 * plan described in prose that never changed said nothing. A trophy recorded
 * only in a list is a trophy that never happened to you.
 *
 * WHAT A PRESENTATION IS, and why it is data rather than markup. The screen
 * that draws these is a renderer with no opinions: everything about WHICH
 * honours are worth stopping on, what each one says, and what evidence it
 * carries is decided here, where it can be tested without a browser. The same
 * three fields serve a cup final in March and a golden boot in June, because
 * they are the same event — somebody is being handed something, and the reason
 * is worth reading.
 *
 * TWO CEREMONIES, AND THE LINE BETWEEN THEM IS THE CALENDAR:
 *
 *   IN SEASON, a trophy that is settled by a MATCH — the two domestic cups,
 *   the three European competitions, the super cup, the international
 *   tournament. It is presented the moment the final ends, because that is when
 *   it happened, and a celebration that waits until June is not a celebration.
 *
 *   IN JUNE, everything a match cannot settle: the league title, which is the
 *   table rather than a fixture; the doubles and trebles, which are a season's
 *   shape rather than an afternoon; promotion; and every individual award,
 *   which needs the whole season's evidence before anybody can be given one.
 *
 * The June list therefore SKIPS the trophies already presented on the day. A
 * cup celebrated in March and celebrated again in June is a game that does not
 * remember what it told you, and the season review still lists all of it — the
 * review is the record, the ceremony is the moment, and they are allowed to
 * disagree about how often a thing is worth saying.
 */

/**
 * How much of the final was actually his.
 *
 * A trophy belongs to the club, so this never decides WHETHER there is a
 * ceremony — being injured for the final does not un-win the cup. What it
 * decides is what the screen is allowed to say: "you were there" and "you
 * watched it from the treatment room" are different sentences, and printing the
 * first over the second is the game flattering him about his own career.
 */
export type Presence = 'played' | 'skipped' | 'absent';

export type CeremonyTone = 'trophy' | 'award' | 'runnerUp';

export interface Presentation {
  tone: CeremonyTone;
  /** The thing itself, in the country's own words. */
  title: string;
  /** One line on what was won and against whom. */
  subtitle: string;
  /** The evidence. Rendered in order, and any of it may be absent. */
  lines: string[];
}

/**
 * A final the player's side has just played, stored on the career.
 *
 * Written when the tie settles rather than assembled by the screen, for the
 * reason the transfer window and the forced retirement are both stored: a
 * screen is something you can close. A trophy that lived only in the mount call
 * after full time would be lost by anybody who shut the tab on the celebration,
 * and the game would never mention it again.
 */
export interface FinalPlayed {
  season: number;
  /** The competition's own name, resolved when it was won. */
  label: string;
  opponentName: string;
  goalsFor: number;
  goalsAgainst: number;
  shootout?: { won: boolean; scored: number; conceded: number };
  presence: Presence;
  /** True when his side won it. A final lost is still a final. */
  won: boolean;
  /** His own afternoon, when he had one. */
  goals: number;
  assists: number;
  rating: number;
}

/** What he did in the final, when he was in it and it is worth a line. */
function ownContribution(final: FinalPlayed): string | null {
  if (final.presence !== 'played') return null;
  const parts: string[] = [];
  if (final.goals > 0) parts.push(`${final.goals} ${final.goals === 1 ? 'goal' : 'goals'}`);
  if (final.assists > 0) {
    parts.push(`${final.assists} ${final.assists === 1 ? 'assist' : 'assists'}`);
  }
  if (parts.length === 0) return `You played, and rated ${final.rating.toFixed(1)}.`;
  return `${parts.join(' and ')}, and a rating of ${final.rating.toFixed(1)}.`;
}

/**
 * How he came to be holding it, when he was not on the pitch.
 *
 * Said plainly and without apology in both directions. A cup won while he was
 * injured is still his cup — he is in the squad, the medal is real — and the
 * game saying so is the difference between a record and a scoreboard.
 */
function presenceLine(final: FinalPlayed): string | null {
  if (final.presence === 'played') return null;
  const verb = final.won ? 'won it' : 'lost it';
  return final.presence === 'absent'
    ? `You watched from the treatment room. They ${verb} without you.`
    : `You let this one play itself out. They ${verb} anyway.`;
}

/** The scoreline, with the shootout when there was one. */
function scoreLine(final: FinalPlayed): string {
  const score = `${final.goalsFor}-${final.goalsAgainst}`;
  if (!final.shootout) return `${score} against ${final.opponentName}.`;
  return (
    `${score} against ${final.opponentName}, and ` +
    `${final.shootout.won ? 'won' : 'lost'} ${final.shootout.scored}-${final.shootout.conceded} ` +
    `on penalties.`
  );
}

/**
 * The final, presented.
 *
 * A final LOST gets one too, and that is deliberate rather than an oversight in
 * the naming. The alternative is a game that stops speaking to you on the one
 * afternoon a season can turn on — you reach a European final, lose it, and the
 * screen says "1-2, back to career". Reaching a final is already an honour on
 * this game's own list (`europeanFinal`, `internationalFinal`), so refusing to
 * mention it here would contradict the record book two screens later.
 */
export function finalPresentation(final: FinalPlayed): Presentation {
  const lines = [scoreLine(final), presenceLine(final), ownContribution(final)].filter(
    (line): line is string => !!line,
  );

  return {
    tone: final.won ? 'trophy' : 'runnerUp',
    title: final.label,
    subtitle: final.won ? 'Winners' : 'Runners-up',
    lines,
  };
}

/**
 * The honours a match cannot settle, and which therefore wait for June.
 *
 * A set rather than a filter on `honourTone`, because the question is not what
 * KIND of thing an honour is — the league title and the cup are both trophies —
 * but whether there was an afternoon on which it was won. The cup had one. The
 * title did not: it is thirty results settling into a table, and the day it
 * became certain is not a day anybody played.
 */
const SETTLED_BY_A_FINAL: ReadonlySet<HonourKind> = new Set<HonourKind>([
  'nationalCup',
  'leagueCup',
  'superCup',
  'europeanTitle',
  'europeanFinal',
  'internationalTitle',
  'internationalFinal',
]);

/**
 * Honours that are real and still not worth a ceremony.
 *
 * Relegation is on the list because a season's history has to contain it. It is
 * not something anybody hands you, and a screen built to say congratulations is
 * the wrong place to be told you went down — the season review says it, in the
 * sentence it deserves, with the table underneath.
 */
const NOT_A_CEREMONY: ReadonlySet<HonourKind> = new Set<HonourKind>(['relegation']);

/**
 * Everything worth stopping on at the end of a season, in the order it is worth
 * stopping on it.
 *
 * TROPHIES BEFORE AWARDS, and that order is the point rather than a default.
 * The team's season is what the individual one happened inside: being the
 * division's top scorer in a side that won the title reads differently from
 * being its top scorer in a side that went down, and putting the club's night
 * first is what makes the second one land.
 */
/**
 * What each honour is CALLED on the night, as opposed to on the list.
 *
 * The honours list names things for the record — "Spanish champions", "Spanish
 * top scorer" — which is right for a table of eighteen seasons and wrong for a
 * screen showing one thing. So the ceremony gets the short name and the list's
 * own label becomes the line underneath, where the country it was won in is
 * context rather than the headline.
 */
const CEREMONY_NAMES: Partial<Record<HonourKind, string>> = {
  title: 'Champions',
  domesticDouble: 'The Double',
  domesticTreble: 'The Treble',
  continentalTreble: 'The Treble',
  promotion: 'Promoted',
  topScorer: 'The Golden Boot',
  playerOfTheSeason: 'Player of the Season',
  youngPlayerOfTheSeason: 'Young Player of the Season',
  internationalDebut: 'Your first cap',
};

/** Honours that belong to his country rather than to the league he plays in. */
const INTERNATIONAL_KINDS: ReadonlySet<HonourKind> = new Set<HonourKind>([
  'internationalDebut',
  'capMilestone',
]);

/**
 * WHERE it was won, which is what the line above the name is for.
 *
 * The first version of this screen put the honours list's own label there and
 * it read as a stutter — "ENGLISH PLAYER OF THE SEASON" above "Player of the
 * Season" — because that label is a wordier version of the same words. The
 * league is the thing the name does NOT already say, and in a game where a
 * career crosses countries it is also the thing worth knowing: a golden boot
 * in The Premier Division and one in Die Erste Klasse are different afternoons.
 */
function wonIn(honour: Honour): string {
  return INTERNATIONAL_KINDS.has(honour.kind) ? 'International' : leagueName(honour.countryId);
}

/**
 * Everything worth stopping on at the end of a season, in the order it is worth
 * stopping on it.
 *
 * TROPHIES BEFORE AWARDS, and that order is the point rather than a default.
 * The team's season is what the individual one happened inside: being the
 * division's top scorer in a side that won the title reads differently from
 * being its top scorer in a side that went down, and putting the club's night
 * first is what makes the second one land.
 */
export function seasonPresentations(honours: readonly Honour[], season: number): Presentation[] {
  const eligible = honours.filter(
    (honour) =>
      honour.season === season &&
      !SETTLED_BY_A_FINAL.has(honour.kind) &&
      !NOT_A_CEREMONY.has(honour.kind),
  );

  const rank = (honour: Honour): number => {
    if (honour.kind === 'domesticTreble' || honour.kind === 'continentalTreble') return 0;
    if (honour.kind === 'domesticDouble') return 1;
    if (honour.kind === 'title') return 2;
    if (honour.kind === 'promotion') return 3;
    return 4;
  };

  return [...eligible]
    .sort((a, b) => rank(a) - rank(b))
    .map((honour) => {
      const subtitle = wonIn(honour);
      return {
        tone: rank(honour) < 4 ? ('trophy' as const) : ('award' as const),
        title: CEREMONY_NAMES[honour.kind] ?? honour.label,
        subtitle,
        lines: evidence(honour, subtitle),
      };
    });
}

/**
 * The detail line, unless it is the line above it said again.
 *
 * The honours list writes its details to stand alone in a table — "You finished
 * top of The Premier Division." — and once the league is already the heading,
 * that sentence is the heading with a verb on the front. A number is what makes
 * a detail worth its own line, so a detail that names the same competition and
 * counts nothing is dropped rather than printed under itself.
 *
 * Deliberately a rule about the TEXT rather than a list of kinds. The details
 * are written in awards.ts and will go on being written there; a hard-coded set
 * of kinds here would be a second place to remember, and it would be wrong the
 * first time somebody added an honour.
 */
function evidence(honour: Honour, subtitle: string): string[] {
  const restatesTheHeading = honour.detail.includes(subtitle) && !/\d/.test(honour.detail);
  return restatesTheHeading ? [] : [honour.detail];
}
