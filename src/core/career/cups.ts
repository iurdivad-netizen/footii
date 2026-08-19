import { clamp01, unit } from '../util/math.ts';
import type { Rng } from '../rng.ts';
import { Rng as SeededRng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import { teamStrength } from '../team/team.ts';
import { simulateFixture } from './league.ts';
import { getCountry } from './countries.ts';

/**
 * DOMESTIC CUPS
 *
 * Every country runs two knockouts alongside its league: a national cup and a
 * league cup. Sixteen clubs make a clean bracket — 16, 8, 4, 2 — so both are
 * four rounds and neither needs byes.
 *
 * WHY A KNOCKOUT IS WORTH HAVING. A league is a thirty-match average: one bad
 * afternoon costs almost nothing, which is the right shape for a season but a
 * poor shape for a single match. A cup tie is the opposite. It cannot be drawn,
 * it cannot be made up next week, and the small club drawn against the big one
 * has exactly ninety minutes in which the gap between them might not matter.
 * That is a different kind of match to play, using the same engine.
 *
 * THE DRAW IS OPEN. No seeding, no keeping the big clubs apart: the two best
 * clubs in the country can meet in the first round and frequently do. Seeding
 * would make the cup a second, shorter league, which is the one thing it should
 * not be.
 *
 * Everything here is deterministic from the career seed, so a cup run is as
 * reproducible as a league season and browsing a country's cup never changes
 * what it says.
 */

export type CupKind = 'nationalCup' | 'leagueCup';

export const CUP_KINDS: readonly CupKind[] = ['nationalCup', 'leagueCup'];

/**
 * Any competition decided by a bracket.
 *
 * The domestic cups and the three European competitions are the same object:
 * sixteen clubs, an open draw, a tie that cannot end level, one club left. The
 * only differences are who enters and what it is called, so the model is
 * generic over its id rather than duplicated — every fix to the draw or the
 * shootout applies to all five competitions at once.
 */
export type KnockoutId = string;

/** How many rounds a sixteen-club knockout takes. */
export const CUP_ROUNDS = 4;

/** Early rounds, named as football names them rather than numbered. */
const EARLY_ROUND_NAMES: readonly string[] = [
  'First round',
  'Second round',
  'Third round',
  'Fourth round',
  'Fifth round',
];

/**
 * What a round is called.
 *
 * Named from the END, so a cup with fewer clubs still calls its last tie the
 * final and its penultimate one the semi-final. Earlier rounds get an ordinal
 * rather than a number, because these read in running prose — "out in the first
 * round" is a sentence and "out in the round 1" is a database field.
 */
export function roundName(round: number, totalRounds = CUP_ROUNDS): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-final';
  if (fromEnd === 2) return 'Quarter-final';
  return EARLY_ROUND_NAMES[round - 1] ?? `Round ${round}`;
}

/** What a cup is called in a given country. */
export function cupName(kind: CupKind, countryId: string): string {
  const country = getCountry(countryId);
  return kind === 'nationalCup'
    ? `The ${country.adjective} Cup`
    : `The ${country.adjective} League Cup`;
}

/** Short form, for chips and tables. */
export function cupShortName(kind: CupKind): string {
  return kind === 'nationalCup' ? 'Cup' : 'League Cup';
}

export interface CupTie {
  homeId: string;
  awayId: string;
  /** Filled once the tie has been resolved. */
  homeGoals?: number;
  awayGoals?: number;
  /**
   * Who went through. A knockout cannot end level, so this is always one of the
   * two once the tie is resolved — see `resolveTie`.
   */
  winnerId?: string;
  /** True when it was level after ninety minutes and settled from the spot. */
  penalties?: boolean;
}

export interface CupRound {
  /** 1-based. */
  round: number;
  ties: CupTie[];
}

export interface CupState<K extends KnockoutId = CupKind> {
  kind: K;
  /**
   * Where it is played. A country id for a domestic cup; for a European
   * competition there is no single country, so it carries the tier's own id.
   */
  countryId: string;
  /** Rounds drawn so far, oldest first. A round is drawn when it is reached. */
  rounds: CupRound[];
  /** Clubs still in it. */
  survivors: string[];
  /** Set once somebody has lifted it. */
  winnerId: string | null;
  /**
   * The round in which the player's club went out, if it has.
   * Null while it is still in, and stays null if it won the thing.
   */
  eliminatedInRound: number | null;
  /**
   * Pair the survivors in the order they are held, rather than drawing them.
   *
   * A cup draw is open — that is the whole reason a cup is worth playing, and
   * seeding would turn it into a second, shorter league. A tournament bracket
   * is the opposite: a group stage exists precisely to earn a better opponent,
   * and shuffling afterwards would make winning your group worth nothing. So
   * both behaviours live on the same object, chosen by whoever builds it.
   */
  seeded?: boolean;
}

export function createCup<K extends KnockoutId>(
  kind: K,
  countryId: string,
  clubIds: readonly string[],
  options: { seeded?: boolean } = {},
): CupState<K> {
  return {
    kind,
    countryId,
    ...(options.seeded ? { seeded: true } : {}),
    rounds: [],
    survivors: clubIds.slice(),
    winnerId: null,
    eliminatedInRound: null,
  };
}

/** How many rounds this cup takes, given how many clubs entered it. */
export function totalRounds(cup: CupState<KnockoutId>): number {
  const entered = cup.rounds[0]?.ties.length ? cup.rounds[0].ties.length * 2 : cup.survivors.length;
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, entered))));
}

/**
 * Draw one round from the clubs still in.
 *
 * An open draw: shuffle and pair. Home advantage goes to whichever club comes
 * out of the hat first, which is how a real open draw works and is why a small
 * club can land a home tie against a big one.
 *
 * An odd survivor gets a bye rather than being dropped — impossible with
 * sixteen clubs, but a cup that silently lost a team on bad data would be worse
 * than one that carried somebody through.
 */
export function drawRound(rng: Rng, cup: CupState<KnockoutId>): CupRound {
  const order = cup.seeded ? cup.survivors.slice() : rng.shuffle(cup.survivors);
  const ties: CupTie[] = [];

  for (let i = 0; i + 1 < order.length; i += 2) {
    ties.push({ homeId: order[i]!, awayId: order[i + 1]! });
  }
  if (order.length % 2 === 1) {
    const bye = order[order.length - 1]!;
    ties.push({ homeId: bye, awayId: bye, homeGoals: 0, awayGoals: 0, winnerId: bye });
  }

  return { round: cup.rounds.length + 1, ties };
}

/**
 * Settle a tie that has to produce a winner.
 *
 * Ninety minutes first, using the same scoreline model as every other match the
 * player does not play. Level after that and it goes to penalties, which are
 * only lightly weighted by strength: a shootout is the one part of football
 * where being the better side barely helps, and a cup that quietly awarded them
 * to the favourite would remove the reason knockouts are worth playing.
 */
export function resolveTie(rng: Rng, tie: CupTie, home: Team, away: Team): CupTie {
  if (tie.winnerId) return tie;

  const { homeGoals, awayGoals } = simulateFixture(rng, home, away);
  if (homeGoals !== awayGoals) {
    return {
      ...tie,
      homeGoals,
      awayGoals,
      winnerId: homeGoals > awayGoals ? tie.homeId : tie.awayId,
      penalties: false,
    };
  }

  const edge = clamp01(0.5 + (teamStrength(home) - teamStrength(away)) * 0.35);
  return {
    ...tie,
    homeGoals,
    awayGoals,
    winnerId: rng.chance(edge) ? tie.homeId : tie.awayId,
    penalties: true,
  };
}

/** The tie a club is involved in this round, or null if it is not in one. */
export function tieFor(round: CupRound, clubId: string): CupTie | null {
  return round.ties.find((tie) => tie.homeId === clubId || tie.awayId === clubId) ?? null;
}

/** The other club in a tie. */
export function opponentIn(tie: CupTie, clubId: string): string {
  return tie.homeId === clubId ? tie.awayId : tie.homeId;
}

export interface CupProgressInput {
  rng: Rng;
  cup: CupState<KnockoutId>;
  lookup: (id: string) => Team;
  /**
   * The player's club. Its tie is LEFT UNRESOLVED for the caller to play, and
   * every other tie in the round is settled here. Omit to settle the lot.
   */
  playerClubId?: string;
}

/**
 * Open the next round: draw it, then settle every tie except the player's.
 *
 * Returns the round as it now stands. The player's own tie, if he has one, is
 * the only one without a winner — the career service plays or skips it and then
 * calls `applyPlayerResult`.
 */
export function openRound(input: CupProgressInput): CupRound {
  const { cup, rng, lookup } = input;
  const drawn = drawRound(rng.fork(`draw:${cup.rounds.length + 1}`), cup);

  const ties = drawn.ties.map((tie, index) => {
    const isPlayers =
      !!input.playerClubId && (tie.homeId === input.playerClubId || tie.awayId === input.playerClubId);
    if (isPlayers) return tie;
    return resolveTie(rng.fork(`tie:${drawn.round}:${index}`), tie, lookup(tie.homeId), lookup(tie.awayId));
  });

  const round: CupRound = { round: drawn.round, ties };
  cup.rounds.push(round);
  return round;
}

/**
 * Record the result of the player's own tie and move the cup on.
 *
 * Called after the tie has been played or skipped. A knockout cannot end level,
 * so a drawn ninety minutes is settled from the spot here exactly as it is for
 * every other tie.
 */
export function applyPlayerResult(
  rng: Rng,
  cup: CupState<KnockoutId>,
  input: { clubId: string; goalsFor: number; goalsAgainst: number; lookup: (id: string) => Team },
): CupTie {
  const round = cup.rounds[cup.rounds.length - 1];
  if (!round) throw new Error('applyPlayerResult: no round has been drawn');

  const index = round.ties.findIndex(
    (tie) => tie.homeId === input.clubId || tie.awayId === input.clubId,
  );
  if (index === -1) throw new Error(`applyPlayerResult: ${input.clubId} is not in this round`);

  const tie = round.ties[index]!;
  const isHome = tie.homeId === input.clubId;
  const homeGoals = isHome ? input.goalsFor : input.goalsAgainst;
  const awayGoals = isHome ? input.goalsAgainst : input.goalsFor;

  let winnerId: string;
  let penalties = false;
  if (homeGoals !== awayGoals) {
    winnerId = homeGoals > awayGoals ? tie.homeId : tie.awayId;
  } else {
    penalties = true;
    const edge = clamp01(
      0.5 + (teamStrength(input.lookup(tie.homeId)) - teamStrength(input.lookup(tie.awayId))) * 0.35,
    );
    winnerId = rng.chance(edge) ? tie.homeId : tie.awayId;
  }

  round.ties[index] = { ...tie, homeGoals, awayGoals, winnerId, penalties };
  return round.ties[index]!;
}

/**
 * Close a round: work out who survived, and note if the player went out.
 * Once one club is left, it has won the cup.
 */
export function closeRound<K extends KnockoutId>(cup: CupState<K>, playerClubId?: string): CupState<K> {
  const round = cup.rounds[cup.rounds.length - 1];
  if (!round) return cup;
  if (round.ties.some((tie) => !tie.winnerId)) {
    throw new Error('closeRound: the round still has an unresolved tie');
  }

  const survivors = round.ties.map((tie) => tie.winnerId!);
  const wasIn = cup.survivors.includes(playerClubId ?? '');
  cup.survivors = survivors;

  if (playerClubId && wasIn && !survivors.includes(playerClubId)) {
    cup.eliminatedInRound = round.round;
  }
  if (survivors.length === 1) cup.winnerId = survivors[0]!;

  return cup;
}

/** Is this club still in it? */
export function stillIn(cup: CupState<KnockoutId>, clubId: string): boolean {
  return cup.winnerId === null ? cup.survivors.includes(clubId) : cup.winnerId === clubId;
}

/**
 * Play out whatever is left of a cup with nobody watching.
 *
 * Used when the player is knocked out — the competition carries on without him
 * and still produces a winner, because "who won the cup you went out of" is
 * part of knowing where you stand.
 */
export function finishCup<K extends KnockoutId>(
  rng: Rng,
  cup: CupState<K>,
  lookup: (id: string) => Team,
  playerClubId?: string,
): CupState<K> {
  let guard = 0;
  while (cup.winnerId === null && guard++ < 16) {
    const last = cup.rounds[cup.rounds.length - 1];
    if (last && last.ties.some((tie) => !tie.winnerId)) {
      throw new Error('finishCup: cannot run on past an unresolved tie');
    }
    openRound({ rng, cup, lookup });
    // Passed through so a club that goes out here still has the round recorded.
    // Without it a player somehow still in a cup at the end of a season could be
    // handed a trophy for a final he never played, with nothing to say he had
    // gone out instead.
    closeRound(cup, playerClubId);
  }
  return cup;
}

/**
 * The winner of a cup nobody was watching, for a country the player is not in.
 *
 * A pure function of the seed, in the same spirit as the background league
 * tables: no cup state is stored for the other seven countries, so this can
 * never disagree with itself between one screen and the next.
 */
export function backgroundCupWinner(
  seed: string,
  season: number,
  kind: CupKind,
  countryId: string,
  clubIds: readonly string[],
  lookup: (id: string) => Team,
): string | null {
  if (clubIds.length === 0) return null;
  const cup = createCup(kind, countryId, clubIds);
  finishCup(new SeededRng(`${seed}:s${season}:cup:${countryId}:${kind}`), cup, lookup);
  return cup.winnerId;
}

/**
 * How much of a shock a tie would be, 0-1, from the underdog's point of view.
 * Used only for presentation — the cup itself has no idea who is supposed to
 * win, which is rather the point.
 */
export function upsetScale(underdog: Team, favourite: Team): number {
  return clamp01(unit(favourite.ratings.attack) - unit(underdog.ratings.attack));
}
