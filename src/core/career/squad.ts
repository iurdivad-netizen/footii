import type { Rng } from '../rng.ts';
import type { Player } from '../player/player.ts';
import type { Team, Teammate } from '../team/team.ts';
import type { Position } from '../player/positions.ts';
import type { SquadRole } from './transfers.ts';
import { effectiveAbility, squadLevel } from './transfers.ts';
import { clamp, clamp01, remap, round } from '../util/math.ts';
import type { CompetitionKind } from './calendar.ts';
import { isEuropean, isInternational, isSuperCup } from './calendar.ts';
import { EUROPEAN_GROUP_ROUNDS } from './europe.ts';

/**
 * THE COMPETITION FOR YOUR PLACE
 *
 * Rotation is the other half of what the roadmap called squad context, and it
 * is the half that gives the player something to do. An injury is something
 * that happens to you; being left out while perfectly fit is an argument you
 * can win.
 *
 * WHY ONE RIVAL RATHER THAN A SQUAD. The obvious implementation is eighteen
 * named players per club, and it is the wrong one here. There are 192 clubs, so
 * a real squad model is three and a half thousand footballers to generate, to
 * drift every summer, and — worst of all — to carry in a localStorage save that
 * currently holds a whole career in a few tens of kilobytes. The README lists
 * "large player databases" among the things this game deliberately does not
 * build, and a squad for every club in the world is exactly that.
 *
 * What selection actually needs is much smaller: somebody to be dropped FOR.
 * Only one club ever picks a team the player is in, and within that club only
 * one shirt is contested. So the model is a single rival for the player's own
 * position at his own club — generated when he signs, drifting while he is
 * there, and replaced when he moves.
 *
 * WHAT THIS MAKES REAL. `contract.role` has existed since contracts did. It is
 * offered by clubs, shown on two screens, and can be pushed for in negotiation
 * — you can talk a club up from squad player to first-team regular — and until
 * now absolutely nothing read it. Rotation is what turns the central non-money
 * term of a contract from a label into a promise the club has to keep.
 */

/**
 * The player competing for the same shirt.
 *
 * Deliberately thin. He needs enough to be a credible obstacle — a name, an
 * ability, and form that responds to whether he has been playing — and nothing
 * more, because everything else about him would be simulation nobody sees.
 */
export interface Rival {
  name: string;
  age: number;
  /** 1-99, on the same scale as the player's current ability. */
  ability: number;
  /** 0-100. Moves with matches played, exactly as the player's does. */
  form: number;
}

/** Whether the player is in the side, and why not when he is not. */
export interface TeamSheet {
  selected: boolean;
  /** One line for the hub, always present — being picked is news too. */
  note: string;
}

/**
 * How much the shirt is worth defending, by squad role.
 *
 * A club that called you its star player and then benched you every other week
 * has broken the deal, so the bias is large enough to be felt: at `star` you
 * are dropped only when genuinely outplayed or genuinely spent. `squad` is the
 * other end — the club told you what you were signing up for.
 */
const ROLE_BIAS: Record<SquadRole, number> = {
  star: 0.26,
  starter: 0.1,
  squad: -0.14,
};

/**
 * Build the rival the player will be competing with at a club.
 *
 * His ability is pitched off the club's own squad level rather than off the
 * player, and that asymmetry is deliberate: a club's second-choice striker is a
 * fact about the club, not about whoever just signed. Sign for a side far above
 * you and the man in possession of the shirt is better than you; drop a
 * division and he is not.
 *
 * The spread is wide enough that two clubs of the same standing are not the
 * same problem — some have a weak spot in your position, some have an
 * international in it.
 */
export function createRival(
  rng: Rng,
  team: Team,
  name: string,
  promise: { role: SquadRole; playerAbility: number },
): Rival {
  const level = squadLevel(team);
  // Centred a shade below the squad's own level: the contested shirt is more
  // often a squad-standard player than a star, or the club would not be
  // shopping for one.
  const drawn = Math.round(level - 3 + rng.range(-6, 9));
  // Then held to what the club actually promised. Without this the two halves
  // of a signing can contradict each other outright — a club calls you its star
  // player, hands you the wage of one, and has somebody ten points better in
  // your position who you will never displace. The role is the club's own
  // judgement of where you stand in its squad, so it is the thing that has to
  // bound the competition rather than the other way round.
  const ceiling =
    promise.role === 'star'
      ? promise.playerAbility - 2
      : promise.role === 'starter'
        ? promise.playerAbility + 2
        : // Signed as cover, and told so — but a rival you could never reach is
          // a career with nothing in it, not a hard one.
          promise.playerAbility + 9;
  const ability = clamp(Math.round(Math.min(drawn, ceiling)), 30, 95);
  return {
    name,
    age: Math.round(rng.range(21, 32)),
    ability,
    // Everybody starts a season with something to prove and nothing decided.
    form: 50,
  };
}

/**
 * A summer for the rival: a year older, and better or worse for it.
 *
 * The same shape as the player's own ageing, deliberately coarse. He improves
 * while young and declines once past thirty, so a rival you beat at twenty-two
 * is not one you can forget about, and one who kept you out at thirty-one is a
 * problem that solves itself.
 */
export function driftRival(rng: Rng, rival: Rival): Rival {
  const age = rival.age + 1;
  const growth = age <= 25 ? rng.range(0, 2.4) : age <= 29 ? rng.range(-0.6, 1) : rng.range(-3, 0.4);
  return {
    ...rival,
    age,
    ability: clamp(Math.round(rival.ability + growth), 30, 95),
    form: 50,
  };
}

/**
 * Move the rival's form on after a match he did or did not play.
 *
 * He is not simulated, so his form is inferred rather than earned: playing
 * pulls it toward what a player of his ability would be expected to produce,
 * and sitting out lets it drift back to nothing in particular. That is enough
 * for the thing form is here to do — make the competition move while the player
 * is not looking, so winning the shirt back is a race rather than a threshold.
 */
export function rivalAfterMatch(rng: Rng, rival: Rival, played: boolean): Rival {
  if (!played) {
    // Out of the side, and drifting back toward neutral rather than decaying to
    // nothing: a man on the bench is not getting worse, he is getting forgotten.
    return { ...rival, form: round(rival.form * 0.85 + 50 * 0.15, 1) };
  }
  const expected = remap(rival.ability, 40, 90, 42, 68);
  const performance = clamp(expected + rng.range(-16, 16), 0, 100);
  return { ...rival, form: round(rival.form * 0.65 + performance * 0.35, 1) };
}

/**
 * How much a fixture matters to the club, 0-1.
 *
 * The input that separates ROTATION from being dropped, and the reason the
 * distinction is worth the trouble: a manager resting his best player in the
 * second round of the league cup is looking after him, and a model that reads
 * that as a demotion would have the player training and transfer-requesting to
 * fix a problem he does not have.
 *
 * Knockouts climb as they narrow, because a semi-final is not a third round.
 * European nights sit above domestic ones throughout — those are the matches a
 * season is judged on, and nobody is rested from them.
 */
export function matchImportance(competition: CompetitionKind, round: number): number {
  // His country picks him on reputation, through its own selection rule. Club
  // rotation must not get a second vote on an international.
  if (isInternational(competition)) return 1;
  if (isSuperCup(competition)) return 0.62;
  if (isEuropean(competition)) {
    // Group football is serious; a knockout tie is the season.
    return round <= EUROPEAN_GROUP_ROUNDS
      ? 0.72
      : clamp01(0.82 + (round - EUROPEAN_GROUP_ROUNDS) * 0.06);
  }
  if (competition === 'league') return 0.6;
  // The two domestic cups, which is where rotation actually lives. The league
  // cup is the one every manager in football treats as a reserve fixture.
  const base = competition === 'nationalCup' ? 0.4 : 0.26;
  return clamp01(base + (round - 1) * 0.13);
}

/**
 * The positions a footballer actually passes to, by where he plays.
 *
 * Not a formation and not a full XI — the handful of people who would be at the
 * end of a ball from him. A winger crosses to strikers and arriving midfielders;
 * a defender's forward pass goes to midfield. Keeping it to the plausible
 * receivers is what stops a named squad being needed: an assist has a recipient
 * because the recipient is drawn from the two or three shirts it could have
 * gone to, not from a list of eighteen.
 */
const PASSES_TO: Record<Position, readonly Position[]> = {
  GK: ['CB', 'LB', 'RB', 'DM'],
  CB: ['DM', 'CM', 'LB', 'RB'],
  LB: ['LW', 'CM', 'AM', 'ST'],
  RB: ['RW', 'CM', 'AM', 'ST'],
  DM: ['CM', 'AM', 'LW', 'RW'],
  CM: ['AM', 'ST', 'LW', 'RW'],
  AM: ['ST', 'LW', 'RW', 'CM'],
  LW: ['ST', 'AM', 'RW'],
  RW: ['ST', 'AM', 'LW'],
  ST: ['AM', 'LW', 'RW', 'CM'],
};

/** How many named teammates a career carries. */
export const SQUAD_SIZE = 5;

/**
 * The teammates worth naming, for the player's own position.
 *
 * Five, and specifically the five he would pass to. The whole reason a squad is
 * not modelled is that nothing needs one; what the match engine needs is a name
 * for whoever got on the end of the ball, and only the players in front of him
 * can be that. So this generates the receivers rather than a team.
 *
 * Their ability comes off the club's squad level with a spread, which is what
 * makes playing for a better club feel different: the same pass finds a better
 * finisher, and the engine already reads the club's attack rating when deciding
 * whether a chance is taken.
 */
export function createSquad(
  rng: Rng,
  team: Team,
  playerPosition: Position,
  name: (rng: Rng) => string,
): Teammate[] {
  const level = squadLevel(team);
  const receivers = PASSES_TO[playerPosition];
  // Surnames are drawn from a pool of sixteen per country, so five draws
  // collide often — and two men called Hallam in the same five reads as a bug
  // rather than as a coincidence, even though real squads have brothers in
  // them. Redrawing on a repeated surname is cheap and removes the question.
  const used = new Set<string>();
  const distinct = (): string => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = name(rng);
      const surname = candidate.slice(candidate.lastIndexOf(' ') + 1);
      if (used.has(surname)) continue;
      used.add(surname);
      return candidate;
    }
    return name(rng);
  };

  return Array.from({ length: SQUAD_SIZE }, (_, index) => ({
    name: distinct(),
    // Cycled rather than drawn at random, so the five always cover the
    // available shirts instead of landing four strikers and nobody wide.
    position: receivers[index % receivers.length]!,
    ability: clamp(Math.round(level + rng.range(-9, 7)), 30, 95),
  }));
}

/**
 * Who got on the end of it.
 *
 * Weighted toward the better players, because a ball into the box finds the
 * centre-forward more often than it finds the full-back who happened to arrive.
 * Returns null for a career with nobody named — every save from before
 * teammates existed — so callers fall back to the wording they always used.
 */
export function receiverOf(rng: Rng, squad: readonly Teammate[]): Teammate | null {
  if (squad.length === 0) return null;
  const weights = squad.map((mate) => Math.max(1, mate.ability - 30) ** 1.5);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < squad.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return squad[i]!;
  }
  return squad[squad.length - 1]!;
}

export interface SelectionInput {
  player: Player;
  rival: Rival;
  /** What the club promised when he signed. */
  role: SquadRole;
  /** Fitness going INTO this match, 0-100. */
  fitness: number;
  /**
   * How much this match matters to the club, 0-1.
   *
   * The single most important input after ability, because it is what separates
   * rotation from being dropped. A manager rests people in the second round of
   * the league cup and picks his best side for a European night, and a model
   * without that reads every omission as a demotion.
   */
  importance: number;
  /** True when this is the second match of the same week. */
  congested: boolean;
}

/**
 * How strong the case for starting the player is, 0-1.
 *
 * Ability first, form second, and both measured against the rival rather than
 * in the abstract: being good is not the question, being better than the man
 * beside you is. Then the two things that make a manager pick somebody other
 * than his best player — a contract that says otherwise, and a tired footballer
 * in a match that does not matter.
 */
export function selectionChance(input: SelectionInput): number {
  const mine = effectiveAbility(input.player) * 0.78 + input.player.form * 0.22;
  const theirs = input.rival.ability * 0.78 + input.rival.form * 0.22;
  const edge = clamp((mine - theirs) / 12, -1.4, 1.4);

  // Tired legs, in a match nobody will remember, are what rotation IS. Both
  // halves are required: a manager does not rest his best player in a final
  // however tired he is, and does not rest a fresh one from a cup tie either.
  const tired = 1 - clamp01(input.fitness / 100);
  const expendable = 1 - clamp01(input.importance);
  const rest = tired * expendable * (input.congested ? 1.35 : 0.85) * 0.9;

  // How hard the manager tries to field his best side, by how much the match
  // matters. This is the mechanism that lets a fringe player into the team at
  // all: in a second-round cup tie both the pecking order and the contract
  // count for less, because the manager is resting the people they favour. It
  // is rotation working in the player's favour rather than against him, and
  // without it being signed as cover is a season of watching with no way in.
  const strictness = 0.45 + 0.55 * clamp01(input.importance);

  return clamp01(0.5 + (edge * 0.42 + ROLE_BIAS[input.role]) * strictness - rest);
}

/**
 * Pick the side.
 *
 * A roll rather than a threshold, so a marginal call is genuinely marginal and
 * the same fixture is not decided the same way twice in a career. The seed
 * comes from the calendar slot, so it is stable for any given match — the hub
 * can render the team sheet as many times as it likes and get one answer.
 */
export function pickSide(rng: Rng, input: SelectionInput): TeamSheet {
  const chance = selectionChance(input);
  const selected = rng.chance(chance);
  return { selected, note: selectionNote(input, selected, chance) };
}

/**
 * Why the manager did what he did.
 *
 * The player cannot see the numbers, so the reason has to be legible from the
 * outcome — and it has to be honest, because the whole point of rotation is
 * that it tells you something you can act on. Being rested is a different
 * message from being dropped, and a player who cannot tell them apart will
 * either train for nothing or ask for a transfer he did not need.
 */
function selectionNote(input: SelectionInput, selected: boolean, chance: number): string {
  const mine = effectiveAbility(input.player) * 0.78 + input.player.form * 0.22;
  const theirs = input.rival.ability * 0.78 + input.rival.form * 0.22;
  const behind = theirs - mine;
  const tired = input.fitness < 62;

  if (selected) {
    if (chance > 0.9) return 'You are the first name on the team sheet.';
    if (behind > 0) return `You keep your place ahead of ${input.rival.name}, for now.`;
    return 'You start.';
  }

  if (tired && input.importance < 0.55) {
    return `Rested. ${input.rival.name} starts, and you are being saved for something that matters more.`;
  }
  if (behind > 3) {
    return `${input.rival.name} is ahead of you at the moment, and the manager has gone with him.`;
  }
  if (input.role === 'squad') {
    return `${input.rival.name} starts. You were signed as cover, and this is what that means.`;
  }
  return `${input.rival.name} gets the nod. It was close.`;
}
