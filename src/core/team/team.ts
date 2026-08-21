import { unit } from '../util/math.ts';
import type { Position } from '../player/positions.ts';

/**
 * Tactical style. Styles bias the EVENT GENERATOR, not the resolution maths:
 * a wide-play team produces more crossing situations, a counterattacking team
 * produces more transition one-on-ones, a possession team produces more
 * combination play around the box.
 */
export type TacticalStyle =
  | 'possession'
  | 'counterattack'
  | 'highPress'
  | 'direct'
  | 'widePlay'
  | 'defensive'
  | 'balanced';

export const TACTICAL_STYLE_LABELS: Record<TacticalStyle, string> = {
  possession: 'Possession',
  counterattack: 'Counterattack',
  highPress: 'High Press',
  direct: 'Direct Football',
  widePlay: 'Wide Play',
  defensive: 'Defensive',
  balanced: 'Balanced',
};

/** Team ratings, 1-99. */
export interface TeamRatings {
  attack: number;
  midfield: number;
  defence: number;
  possession: number;
  passing: number;
  tempo: number;
  pressing: number;
  width: number;
  crossing: number;
  counterattack: number;
  creativity: number;
  defensiveIntensity: number;
}

/**
 * A named footballer at a club, as everything outside his own career needs him.
 *
 * The smallest thing that can be passed to. He exists so an assist has a
 * recipient and a goal has somebody who set it up — which is all the match
 * engine ever asks of a teammate, because only the player himself is simulated.
 * Anything more would be a squad model, and this game deliberately does not
 * carry one (see core/career/squad.ts).
 */
export interface Teammate {
  name: string;
  position: Position;
  /** 1-99, on the same scale as a player's current ability. */
  ability: number;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  style: TacticalStyle;
  ratings: TeamRatings;
  /** Primary colour, used by the UI only. */
  colour: string;
  /**
   * The division this club STARTS in, within its own country. Once a career is
   * under way the live division comes from the career's own record, not from
   * here — see core/career/divisions.ts.
   */
  division: number;
  /** The country whose league this club plays in. */
  country: string;
}

export interface TeamInit {
  id?: string;
  name: string;
  shortName?: string;
  style?: TacticalStyle;
  ratings?: Partial<TeamRatings>;
  base?: number;
  colour?: string;
  division?: number;
  country?: string;
}

export function createTeam(init: TeamInit): Team {
  const base = init.base ?? 55;
  return {
    id: init.id ?? init.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: init.name,
    shortName: init.shortName ?? init.name.slice(0, 3).toUpperCase(),
    style: init.style ?? 'balanced',
    colour: init.colour ?? '#4aa3ff',
    division: init.division ?? 1,
    country: init.country ?? 'england',
    ratings: {
      attack: base,
      midfield: base,
      defence: base,
      possession: base,
      passing: base,
      tempo: base,
      pressing: base,
      width: base,
      crossing: base,
      counterattack: base,
      creativity: base,
      defensiveIntensity: base,
      ...init.ratings,
    },
  };
}

/** Overall strength 0-1, used for the possession model and background sim. */
export function teamStrength(team: Team): number {
  const r = team.ratings;
  return unit(r.attack * 0.35 + r.midfield * 0.35 + r.defence * 0.3);
}
