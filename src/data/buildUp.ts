import type { Rng } from '../core/rng.ts';
import type { SituationContext } from '../core/events/types.ts';
import { zoneSide } from '../core/events/zones.ts';
import type { SituationTemplate } from './situations.ts';

/**
 * BUILD-UP NARRATION
 *
 * Every interactive event opens with a short story of how the chance came
 * about, revealed a beat at a time before the options appear.
 *
 * This is not decoration. It does three jobs:
 *
 *   1. It delivers the CONTEXT (where you are, who is around you, how fast the
 *      move is) before you are asked to choose, so the decision window can stay
 *      short without being unfair.
 *   2. It builds tension. A chance that arrives instantly has no weight; one
 *      that you watch develop for two seconds does.
 *   3. It makes the team's tactical style legible in play rather than only in
 *      the numbers — a counterattacking side visibly breaks at pace, a
 *      possession side visibly works an opening.
 *
 * The beats are generated from the same seeded Rng as the rest of the event, so
 * a replayed match narrates identically.
 *
 * The final beat is always the situation description itself, and it lands at
 * the moment the options appear.
 */

function originBeat(rng: Rng, context: SituationContext): string {
  const team = context.attackingTeam.name;

  if (context.transition) {
    return rng.pick([
      `${team} win the ball back and break at once.`,
      `Turnover — ${team} are away on the counter.`,
      `It breaks loose in midfield and ${team} pour forward.`,
    ]);
  }

  switch (context.attackingTeam.style) {
    case 'possession':
      return rng.pick([
        `${team} keep the ball, probing for an opening.`,
        `Patient build-up from ${team}, side to side.`,
        `${team} circulate it, waiting for the gap.`,
      ]);
    case 'counterattack':
      return rng.pick([
        `${team} soak up the pressure, then spring forward.`,
        `${team} are content to sit in — until now.`,
      ]);
    case 'highPress':
      return rng.pick([
        `${team} win it high up the pitch.`,
        `The press works — ${team} steal it in the final third.`,
      ]);
    case 'direct':
      return rng.pick([
        `${team} go long, straight over the top.`,
        `No messing about from ${team} — it's forward early.`,
      ]);
    case 'widePlay':
      return rng.pick([
        `${team} work it wide looking for the overlap.`,
        `${team} stretch the pitch and get down the flank.`,
      ]);
    case 'defensive':
      return rng.pick([
        `${team} clear their lines and push up.`,
        `A rare foray forward from ${team}.`,
      ]);
    default:
      return rng.pick([
        `${team} move it forward with purpose.`,
        `${team} build through midfield.`,
      ]);
  }
}

function progressionBeat(rng: Rng, context: SituationContext): string {
  const side = zoneSide(context.zone);
  const flank = side === 'centre' ? 'through the middle' : `down the ${side}`;

  switch (context.situation) {
    case 'oneOnOne':
      return rng.pick([
        'The defence steps up — and it springs the offside trap!',
        'One pass splits them wide open.',
        'A defensive mix-up, and suddenly the goal is open.',
      ]);
    case 'throughBallRun':
      return rng.pick([
        `The ball is slid ${flank} behind the back line.`,
        'A first-time pass in behind, and the run is on.',
        'The defence is turned, chasing back.',
      ]);
    case 'edgeOfBox':
      return rng.pick([
        'It comes off a defender and drops invitingly.',
        'The ball is worked back to the top of the area.',
        'A cross is half-cleared to the edge of the box.',
      ]);
    case 'boxSideAttack':
      return rng.pick([
        `A quick exchange ${flank} opens the corner of the box.`,
        'A clever ball inside the full back.',
      ]);
    case 'wideAttack':
      return rng.pick([
        `The ball is switched ${flank} into acres of space.`,
        'The overlap comes, and the full back is committed.',
      ]);
    case 'crossArrival':
      return rng.pick([
        'The winger stands it up towards the far post…',
        'It is whipped in first time from the flank…',
        'The cross hangs in the air…',
      ]);
    case 'midfieldProgression':
      return rng.pick([
        'The ball comes square into midfield with time to look up.',
        'A midfielder drops in and receives on the half-turn.',
      ]);
    case 'defensiveDuel':
      return rng.pick([
        'They are running straight at the defence.',
        'A ball in behind, and the attacker is onto it.',
        'The attack builds dangerously.',
      ]);
  }
}

/** A closing pressure cue, only when the situation is genuinely fraught. */
function pressureBeat(rng: Rng, context: SituationContext): string | null {
  if (context.nearbyDefenders >= 3) {
    return rng.pick(['Bodies everywhere in the box.', 'The area is packed.']);
  }
  if (context.nearbyDefenders === 0 && context.situation !== 'defensiveDuel') {
    return rng.pick(['There is nobody near him.', 'Acres of space — this is a huge chance.']);
  }
  if (context.goalkeeper.startingDepth > 0.6) {
    return 'The keeper is already off his line.';
  }
  return null;
}

/**
 * Build the ordered beats for an event. The last beat is always the situation
 * description, which lands as the options are revealed.
 */
export function generateBuildUp(
  rng: Rng,
  context: SituationContext,
  template: SituationTemplate,
): string[] {
  const beats = [originBeat(rng, context), progressionBeat(rng, context)];

  const pressure = pressureBeat(rng, context);
  if (pressure) beats.push(pressure);

  beats.push(template.describe(context));
  return beats;
}
