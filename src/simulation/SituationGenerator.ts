import { clamp01, lerp, unit } from '../core/util/math.ts';
import type { Rng } from '../core/rng.ts';
import type { Player } from '../core/player/player.ts';
import type { Position } from '../core/player/positions.ts';
import { POSITION_PROFILES } from '../core/player/positions.ts';
import { tendencyFactor } from '../core/player/tendencies.ts';
import type { Goalkeeper, GoalkeeperAction, GoalkeeperState } from '../core/goalkeeper/goalkeeper.ts';
import type { Team, Teammate } from '../core/team/team.ts';
import type { SituationContext, SituationType } from '../core/events/types.ts';
import { SITUATION_TEMPLATES, getSituationTemplate } from '../data/situations.ts';

/**
 * SITUATION GENERATOR
 *
 * Decides WHICH kind of interactive moment the player is in, and builds the
 * full context for it. Three inputs shape the choice:
 *
 *   1. Position   - a striker and a defensive midfielder must not experience
 *                   the same game (POSITION_PROFILES.positionWeights).
 *   2. Tendencies - two identical strikers diverge because one runs behind and
 *                   the other drops deep.
 *   3. Team style - a wide-play team manufactures crosses, a counterattacking
 *                   team manufactures transitions.
 */

export interface SituationRequest {
  player: Player;
  /** Named teammates who could receive a pass. Omitted when nobody is named. */
  teammates?: readonly Teammate[];
  attackingTeam: Team;
  defendingTeam: Team;
  goalkeeper: Goalkeeper;
  minute: number;
  /** Set when the match engine already knows this is a fast break. */
  transition?: boolean;
  /** Force a specific archetype (used by tests and the debug tools). */
  forceType?: SituationType;
  /** Defensive events are generated when the player's team is defending. */
  defending?: boolean;
  /** How much the match matters, 0-1. Carried through to the context. */
  importance?: number;
}

/** How a tendency biases each archetype. Multiplicative on the base weight. */
function tendencyBias(player: Player, type: SituationType): number {
  const t = player.tendencies;
  switch (type) {
    case 'oneOnOne':
      return tendencyFactor(t, 'runsBehind') * 0.7 + tendencyFactor(t, 'attacksSpace') * 0.3;
    case 'throughBallRun':
      return tendencyFactor(t, 'runsBehind') * 0.6 + tendencyFactor(t, 'movesIntoChannels') * 0.4;
    case 'edgeOfBox':
      return tendencyFactor(t, 'dropsDeep') * 0.5 + tendencyFactor(t, 'comesShort') * 0.5;
    case 'boxSideAttack':
      return tendencyFactor(t, 'cutsInside') * 0.6 + tendencyFactor(t, 'movesIntoChannels') * 0.4;
    case 'wideAttack':
      return tendencyFactor(t, 'staysWide');
    case 'crossArrival':
      return tendencyFactor(t, 'attacksSpace') * 0.5 + tendencyFactor(t, 'holdsPosition') * 0.5;
    case 'midfieldProgression':
      return tendencyFactor(t, 'comesShort') * 0.5 + tendencyFactor(t, 'dropsDeep') * 0.5;
    case 'defensiveDuel':
      return tendencyFactor(t, 'presses') * 0.6 + tendencyFactor(t, 'holdsPosition') * 0.4;
    case 'penalty':
      // Winning a penalty is mostly a consequence of getting in behind people.
      return tendencyFactor(t, 'runsBehind') * 0.5 + tendencyFactor(t, 'attacksSpace') * 0.5;
    case 'freeKickDirect':
      // Free kicks in shooting range are won by players who carry the ball in.
      return tendencyFactor(t, 'cutsInside') * 0.5 + tendencyFactor(t, 'comesShort') * 0.5;
    case 'cornerAttack':
      return tendencyFactor(t, 'attacksSpace') * 0.6 + tendencyFactor(t, 'holdsPosition') * 0.4;
    case 'aerialDuel':
      return tendencyFactor(t, 'holdsPosition') * 0.7 + tendencyFactor(t, 'presses') * 0.3;
    case 'pressingTrap':
      return tendencyFactor(t, 'presses') * 0.8 + tendencyFactor(t, 'attacksSpace') * 0.2;
  }
}

/** How the attacking team's style biases each archetype. */
function styleBias(team: Team, type: SituationType): number {
  const r = team.ratings;
  switch (type) {
    case 'oneOnOne':
    case 'throughBallRun':
      return (
        1 +
        unit(r.counterattack) * 0.6 +
        (team.style === 'counterattack' ? 0.5 : 0) +
        (team.style === 'direct' ? 0.25 : 0)
      );
    case 'edgeOfBox':
      return 1 + unit(r.possession) * 0.4 + (team.style === 'possession' ? 0.35 : 0);
    case 'boxSideAttack':
      return 1 + unit(r.creativity) * 0.35;
    case 'wideAttack':
      return (
        1 + unit(r.width) * 0.5 + unit(r.crossing) * 0.4 + (team.style === 'widePlay' ? 0.6 : 0)
      );
    case 'crossArrival':
      return 1 + unit(r.crossing) * 0.6 + (team.style === 'widePlay' ? 0.4 : 0);
    case 'midfieldProgression':
      return 1 + unit(r.possession) * 0.4 + unit(r.passing) * 0.3;
    case 'defensiveDuel':
      return 1;
    case 'penalty':
      // Teams that get into the box get fouled in it.
      return 1 + unit(r.attack) * 0.3 + unit(r.creativity) * 0.2;
    case 'freeKickDirect':
      return 1 + unit(r.creativity) * 0.25 + (team.style === 'possession' ? 0.15 : 0);
    case 'cornerAttack':
      return 1 + unit(r.crossing) * 0.4 + (team.style === 'widePlay' ? 0.35 : 0);
    // For the defensive archetypes `team` is the OPPOSITION — these read as
    // "what does the side attacking you like to do", which is why a direct team
    // makes you head balls all afternoon and a possession team invites a press.
    case 'aerialDuel':
      return (
        1 +
        unit(r.crossing) * 0.35 +
        (team.style === 'direct' ? 0.7 : 0) +
        (team.style === 'widePlay' ? 0.4 : 0)
      );
    case 'pressingTrap':
      return (
        1 +
        unit(r.possession) * 0.4 +
        (team.style === 'possession' ? 0.4 : 0) -
        (team.style === 'direct' ? 0.3 : 0)
      );
  }
}

export function chooseSituationType(
  rng: Rng,
  player: Player,
  attackingTeam: Team,
  options: { defending?: boolean } = {},
): SituationType {
  // Attacking and defending draw from disjoint pools, and which pool a template
  // belongs to is a property of the template — not a list kept in here — so a
  // new defensive archetype needs no change to this function.
  const defending = options.defending ?? false;

  const entries = (Object.keys(SITUATION_TEMPLATES) as SituationType[])
    .filter((type) => SITUATION_TEMPLATES[type].defensive === defending)
    .map((type) => {
      const template = SITUATION_TEMPLATES[type];
      const positionWeight = template.positionWeights[player.position] ?? 0;
      return {
        value: type,
        weight: positionWeight * tendencyBias(player, type) * styleBias(attackingTeam, type),
      };
    })
    .filter((entry) => entry.weight > 0);

  if (entries.length === 0) return defending ? 'defensiveDuel' : 'midfieldProgression';
  return rng.weighted(entries);
}

/**
 * Build the goalkeeper's live state, including WHEN he will commit.
 *
 * The commit moment is the core of the goalkeeper-as-variable design: for the
 * first part of the window the keeper is `set` and gives nothing away; after
 * `commitAt` he has shown his hand and several options change value sharply.
 * Aggressive, decisive keepers commit earlier and more often.
 */
export function createGoalkeeperState(
  rng: Rng,
  keeper: Goalkeeper,
  situation: SituationType,
  decisionWindowEstimate: number,
): GoalkeeperState {
  const a = keeper.attributes;
  const aggression = unit(a.aggression);
  const decisiveness = unit(a.decisionMaking);

  const startingDepth =
    situation === 'oneOnOne' || situation === 'throughBallRun'
      ? clamp01(rng.range(0.2, 0.6) + aggression * 0.35)
      : clamp01(rng.range(0.0, 0.3) + aggression * 0.2);

  // Aggressive keepers commit earlier in the window; indecisive ones may never
  // really commit at all (they end up merely `advancing`).
  const commitFraction = clamp01(rng.range(0.35, 0.85) - aggression * 0.2);
  const commitAt = commitFraction * decisionWindowEstimate;

  // A set piece dictates what the keeper is choosing between, so its template
  // supplies the distribution. Note the commit TIMING above still comes from his
  // aggression: the penalty taker's read is unchanged, only the odds of what he
  // eventually does.
  const templateCommit = SITUATION_TEMPLATES[situation].keeperCommit;

  const commitWeights: { value: GoalkeeperAction; weight: number }[] = templateCommit
    ? (Object.entries(templateCommit) as [GoalkeeperAction, number][]).map(([value, weight]) => ({
        value,
        weight,
      }))
    : situation === 'oneOnOne' || situation === 'throughBallRun'
      ? [
          { value: 'rushing', weight: 2 + aggression * 4 },
          { value: 'advancing', weight: 2.5 },
          { value: 'goingToGround', weight: 1 + aggression * 2 - decisiveness },
          { value: 'divingNear', weight: 1 + (1 - decisiveness) * 1.5 },
          { value: 'divingFar', weight: 1 + (1 - decisiveness) * 1.5 },
          { value: 'holdingLine', weight: 1.5 + (1 - aggression) * 2 },
        ]
      : [
          { value: 'advancing', weight: 2 + aggression * 2 },
          { value: 'holdingLine', weight: 3 },
          { value: 'divingNear', weight: 1.2 },
          { value: 'divingFar', weight: 1.2 },
          { value: 'rushing', weight: 0.6 + aggression * 1.5 },
          { value: 'goingToGround', weight: 0.6 },
        ];

  const committedAction = rng.weighted<GoalkeeperAction>(commitWeights);

  return {
    keeper,
    action: 'set',
    committedAction,
    commitAt,
    startingDepth,
  };
}

export interface GeneratedSituation {
  type: SituationType;
  context: SituationContext;
}

export function generateSituation(rng: Rng, request: SituationRequest): GeneratedSituation {
  const type =
    request.forceType ??
    chooseSituationType(rng, request.player, request.attackingTeam, {
      defending: request.defending,
    });
  const template = getSituationTemplate(type);
  const zone = template.zone(rng, request.player.position as Position);

  // Defender count: a uniform draw from the template's band, with a good
  // defence occasionally adding a covering runner. Note the extra defender is a
  // CHANCE rather than a constant bias — otherwise a "one-on-one" would almost
  // always arrive with a defender attached and stop being a one-on-one at all.
  const [minDefenders, maxDefenders] = template.defenders;
  const defenceQuality = unit(request.defendingTeam.ratings.defence);
  let defenders = Math.floor(rng.range(minDefenders, maxDefenders + 1));
  if (rng.chance((defenceQuality - 0.5) * 0.8)) defenders += 1;
  const clampedDefenders = Math.max(0, Math.min(4, defenders));

  const intensity = unit(request.defendingTeam.ratings.defensiveIntensity);
  const defensivePressure = clamp01(
    clampedDefenders * 0.22 + intensity * 0.25 + rng.range(-0.08, 0.08),
  );

  // Chance quality: the archetype's band, nudged by attacking quality, the
  // player's own off-the-ball ability, and the defending team's resistance.
  const [qMin, qMax] = template.qualityRange;
  const attackEdge =
    unit(request.attackingTeam.ratings.attack) * 0.5 +
    unit(request.player.attributes.positioning) * 0.25 +
    unit(request.player.attributes.movement) * 0.25;
  const situationQuality = clamp01(
    lerp(qMin, qMax, clamp01(rng.next() * 0.6 + attackEdge * 0.4)) - defenceQuality * 0.12,
  );

  const transition =
    request.transition ??
    (type === 'oneOnOne' || type === 'throughBallRun'
      ? rng.chance(0.3 + unit(request.attackingTeam.ratings.counterattack) * 0.4)
      : false);

  // The keeper state needs an estimate of the window before the timer runs; the
  // timer then uses the keeper state. We resolve the circularity by seeding the
  // keeper with the template's base time and letting the real timer refine it.
  const goalkeeper = createGoalkeeperState(rng, request.goalkeeper, type, template.baseTime);

  const context: SituationContext = {
    situation: type,
    zone,
    player: request.player,
    goalkeeper,
    attackingTeam: request.attackingTeam,
    defendingTeam: request.defendingTeam,
    teammates: request.teammates ?? [],
    nearbyDefenders: clampedDefenders,
    defensivePressure,
    situationQuality,
    firstTime: template.firstTime,
    transition,
    minute: request.minute,
    importance: request.importance,
  };

  return { type, context };
}

/** Probability the player is personally involved in a given attacking sequence. */
export function involvementChance(player: Player, team: Team, defending = false): number {
  const profile = POSITION_PROFILES[player.position];
  const base = defending ? profile.defensiveInvolvement : profile.attackingInvolvement;
  const positioningEdge = defending
    ? unit(player.attributes.defensiveAwareness)
    : unit(player.attributes.positioning) * 0.6 + unit(player.attributes.movement) * 0.4;
  const teamEdge = defending ? 0.5 : unit(team.ratings.attack);
  return clamp01(base * (0.7 + positioningEdge * 0.6) * (0.8 + teamEdge * 0.4));
}
