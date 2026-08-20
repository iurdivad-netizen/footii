import type { Rng } from '../rng.ts';
import type { Team } from '../team/team.ts';
import type { Goalkeeper } from '../goalkeeper/goalkeeper.ts';
import { teamStrength } from '../team/team.ts';
import { clamp01, unit } from '../util/math.ts';

/**
 * PENALTY SHOOTOUTS
 *
 * What happens when a knockout tie will not end.
 *
 * WHY THIS EXISTS. It was already happening — `applyPlayerResult` has always
 * sent a level tie to the spot and picked a winner — but it happened INVISIBLY.
 * You played ninety minutes, it finished 1-1, the full-time screen said "Draw",
 * and the next time you looked at the bracket you were out of the cup. Nothing
 * anywhere told you there had been a shootout, let alone let you take a kick.
 * The one moment in a cup run that most deserves to be a decision was the only
 * part of the match you were not allowed to play.
 *
 * So a shootout is now a thing that takes place. Five kicks each, alternating,
 * sudden death after that, and the standard rule that it stops the moment the
 * remaining kicks cannot change the outcome. The player takes his club's kicks
 * when the order comes round to him, through exactly the same penalty situation
 * the match engine uses; every other kick is simulated.
 *
 * WHAT A SHOOTOUT IS NOT. It is not part of the match. Shootout goals are not
 * goals — no career total, no record book, no match rating moves — which is
 * both how football counts them and the reason this lives outside the match
 * engine rather than as an extra phase inside it. The tie's scoreline stays
 * level; all a shootout produces is a winner.
 */

/** Which side a kick belongs to. `player` is always the human's club or nation. */
export type ShootoutSide = 'player' | 'opponent';

/** How many kicks each side gets before sudden death. */
export const REGULATION_KICKS = 5;

/** Takers in the order, which is also the cycle sudden death repeats. */
export const TAKERS = 5;

/**
 * How often a penalty is scored, before anybody's quality is considered.
 *
 * Real shootout conversion sits around three in four. Deliberately stated as a
 * constant rather than derived, because everything below only nudges it: a
 * shootout is famously the part of football where being the better side helps
 * least, and a model that let quality dominate would turn the drama back into
 * the silent roll this replaced.
 */
export const BASE_CONVERSION = 0.75;

export interface ShootoutKick {
  side: ShootoutSide;
  /** 1-based position in the whole shootout, both sides counted. */
  number: number;
  /** Which of the five takers this was, 1-based. */
  taker: number;
  scored: boolean;
  /** True when the human took it himself rather than it being simulated. */
  own: boolean;
  /** One line, for the running commentary. */
  note: string;
}

export interface ShootoutState {
  kicks: ShootoutKick[];
  playerScore: number;
  opponentScore: number;
  /** Set once the shootout is decided. */
  winner: ShootoutSide | null;
  /** True once the first five each are gone and it is still level. */
  suddenDeath: boolean;
}

export function createShootout(): ShootoutState {
  return { kicks: [], playerScore: 0, opponentScore: 0, winner: null, suddenDeath: false };
}

/** Kicks a side has taken so far. */
export function kicksTaken(state: ShootoutState, side: ShootoutSide): number {
  return state.kicks.filter((kick) => kick.side === side).length;
}

/**
 * Whose turn it is, or null when it is over.
 *
 * The player's club always goes first. Real shootouts toss for it, and the toss
 * is worth something — but a coin flip the player neither sees nor influences,
 * deciding a measurable advantage, is exactly the kind of invisible roll this
 * whole feature exists to remove.
 */
export function nextKick(state: ShootoutState): { side: ShootoutSide; taker: number } | null {
  if (state.winner) return null;
  const taken = { player: kicksTaken(state, 'player'), opponent: kicksTaken(state, 'opponent') };
  const side: ShootoutSide = taken.player <= taken.opponent ? 'player' : 'opponent';
  // The order repeats once the first five are gone, which is what sudden death
  // is: the same takers again, in the same order.
  return { side, taker: (taken[side] % TAKERS) + 1 };
}

/**
 * Is this the kick the human takes himself?
 *
 * He is one of five takers, at a slot decided before the shootout starts, and
 * the order repeats — so in a long sudden death he comes round again, which is
 * both how it works and the reason a shootout that goes to eleven kicks is
 * worth watching.
 */
export function isPlayersKick(
  turn: { side: ShootoutSide; taker: number },
  playerTaker: number,
): boolean {
  return turn.side === 'player' && turn.taker === playerTaker;
}

/**
 * Where in the order the human takes his kick.
 *
 * Better takers go earlier. That is a real convention — the first kicks go to
 * the players who want them — and it means a striker built for this gets to
 * decide the shootout early rather than waiting to see whether it reaches him.
 */
export function takingOrder(finishing: number, composure: number): number {
  const nerve = unit(finishing) * 0.6 + unit(composure) * 0.4;
  if (nerve >= 0.8) return 1;
  if (nerve >= 0.65) return 2;
  if (nerve >= 0.5) return 3;
  if (nerve >= 0.35) return 4;
  return TAKERS;
}

/**
 * How likely a simulated kick is to go in.
 *
 * Bounded tightly around `BASE_CONVERSION` on purpose: the spread between the
 * best and worst side in the world is worth about ten percentage points here,
 * where in open play it decides matches. A shootout should feel like a
 * shootout, not like a table.
 */
export function conversionChance(taking: Team, keeper: Goalkeeper): number {
  const quality = teamStrength(taking) - 0.5;
  const goalkeeping =
    (unit(keeper.attributes.reflexes) * 0.55 + unit(keeper.attributes.anticipation) * 0.45) - 0.5;
  return clamp01(BASE_CONVERSION + quality * 0.16 - goalkeeping * 0.14);
}

/**
 * Can the side behind still catch up?
 *
 * The rule that stops a shootout at 3-0 after four kicks rather than making
 * everybody take five. In sudden death it reduces to "level after both have
 * taken the same number", which is why it is one function rather than two.
 */
export function decided(state: ShootoutState): ShootoutSide | null {
  const taken = { player: kicksTaken(state, 'player'), opponent: kicksTaken(state, 'opponent') };
  const remaining = {
    player: Math.max(0, REGULATION_KICKS - taken.player),
    opponent: Math.max(0, REGULATION_KICKS - taken.opponent),
  };

  // Sudden death: decided only when both have taken the same number and one is
  // ahead. An unequal count means the reply is still to come.
  if (taken.player >= REGULATION_KICKS && taken.opponent >= REGULATION_KICKS) {
    if (taken.player !== taken.opponent) return null;
    if (state.playerScore === state.opponentScore) return null;
    return state.playerScore > state.opponentScore ? 'player' : 'opponent';
  }

  if (state.playerScore > state.opponentScore + remaining.opponent) return 'player';
  if (state.opponentScore > state.playerScore + remaining.player) return 'opponent';
  return null;
}

/** Add a kick and settle the state around it. */
export function recordKick(
  state: ShootoutState,
  kick: Omit<ShootoutKick, 'number'>,
): ShootoutState {
  state.kicks.push({ ...kick, number: state.kicks.length + 1 });
  if (kick.scored) {
    if (kick.side === 'player') state.playerScore += 1;
    else state.opponentScore += 1;
  }
  state.suddenDeath =
    kicksTaken(state, 'player') >= REGULATION_KICKS &&
    kicksTaken(state, 'opponent') >= REGULATION_KICKS;
  state.winner = decided(state);
  return state;
}

/**
 * Roll a simulated kick.
 *
 * The note deliberately does not name anybody. There are no named teammates in
 * the game yet, so the only name available would be the club's — and "NPC
 * scores" beside a chip that already says NPC is the same word twice. Who took
 * it is the chip's job; this says what happened.
 */
export function simulateKick(
  rng: Rng,
  side: ShootoutSide,
  taker: number,
  chance: number,
): Omit<ShootoutKick, 'number'> {
  const scored = rng.chance(chance);
  return { side, taker, scored, own: false, note: scored ? scoreNote(rng) : missNote(rng) };
}

/** A goal, told as one of the ways a penalty is actually scored. */
function scoreNote(rng: Rng): string {
  const ways = [
    'Scores. Straight down the middle.',
    'Scores, low into the corner.',
    'Sends the keeper the wrong way.',
    'Scores. Never in doubt.',
    'Buries it under the bar.',
  ];
  return ways[rng.int(0, ways.length - 1)] ?? 'Scores.';
}

/** A miss, told as one of the ways a penalty is actually missed. */
function missNote(rng: Rng): string {
  const ways = [
    'Saved! Denied by the keeper.',
    'Over the bar.',
    'Off the post — and out.',
    'The keeper guesses right. Saved.',
    'Dragged wide.',
  ];
  return ways[rng.int(0, ways.length - 1)] ?? 'Misses.';
}

/** The score as it stands, from the player's point of view. */
export function shootoutScoreline(state: ShootoutState): string {
  return `${state.playerScore}-${state.opponentScore}`;
}

/**
 * Play out an entire shootout without anybody taking a kick.
 *
 * Used for a tie the player SKIPPED. Skipping a match is a deliberate choice to
 * let the season resolve itself, and it would be strange for the one part of it
 * you cannot skip to be the penalties — but the result still has to be a real
 * shootout rather than a coin flip, and the hub still has to be able to say
 * what happened.
 */
export function simulateShootout(
  rng: Rng,
  sides: { player: Team; opponent: Team },
  keepers: { player: Goalkeeper; opponent: Goalkeeper },
): ShootoutState {
  const state = createShootout();
  const chances = {
    player: conversionChance(sides.player, keepers.opponent),
    opponent: conversionChance(sides.opponent, keepers.player),
  };

  // A shootout that will not end is a bug, not a story. Real ones have run past
  // twenty kicks a side; this cap is far beyond that and exists only so a
  // pathological rng cannot hang the game.
  for (let guard = 0; guard < 100; guard += 1) {
    const turn = nextKick(state);
    if (!turn) break;
    recordKick(state, simulateKick(rng, turn.side, turn.taker, chances[turn.side]));
  }

  // With the cap reached and still level, the tie has to go somewhere.
  if (!state.winner) state.winner = state.playerScore >= state.opponentScore ? 'player' : 'opponent';
  return state;
}
