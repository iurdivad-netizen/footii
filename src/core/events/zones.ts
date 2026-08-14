/**
 * Lightweight tactical location model.
 *
 * Deliberately NOT a coordinate system. A zone is (third x channel x box
 * relation), which is enough to decide what situations can occur and what
 * options make sense, and cheap enough to reason about while balancing.
 * A future 2D model can implement the same `Zone` interface by deriving these
 * three fields from coordinates, so nothing downstream needs to change.
 */

export type Third = 'defensive' | 'middle' | 'attacking';

export type Channel = 'left' | 'leftHalf' | 'central' | 'rightHalf' | 'right';

/** Relationship to the penalty area. */
export type BoxRelation = 'inside' | 'edge' | 'outside';

export interface Zone {
  third: Third;
  channel: Channel;
  box: BoxRelation;
}

export const THIRD_LABELS: Record<Third, string> = {
  defensive: 'Defensive third',
  middle: 'Middle third',
  attacking: 'Attacking third',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  left: 'Wide left',
  leftHalf: 'Left channel',
  central: 'Central',
  rightHalf: 'Right channel',
  right: 'Wide right',
};

export function zoneLabel(zone: Zone): string {
  if (zone.box === 'inside') return `${CHANNEL_LABELS[zone.channel]}, inside the box`;
  if (zone.box === 'edge') return `${CHANNEL_LABELS[zone.channel]}, edge of the box`;
  return `${CHANNEL_LABELS[zone.channel]}, ${THIRD_LABELS[zone.third].toLowerCase()}`;
}

export function isWide(zone: Zone): boolean {
  return zone.channel === 'left' || zone.channel === 'right';
}

export function isCentral(zone: Zone): boolean {
  return zone.channel === 'central';
}

/** Which side a wide/half-space zone is on, for naming near/far post options. */
export function zoneSide(zone: Zone): 'left' | 'right' | 'centre' {
  if (zone.channel === 'left' || zone.channel === 'leftHalf') return 'left';
  if (zone.channel === 'right' || zone.channel === 'rightHalf') return 'right';
  return 'centre';
}

/**
 * Rough distance-to-goal factor, 0 (tap-in range) to 1 (a long way out).
 * Used by shot actions to scale difficulty without needing coordinates.
 */
export function goalDistanceFactor(zone: Zone): number {
  const thirdBase = zone.third === 'attacking' ? 0.35 : zone.third === 'middle' ? 0.8 : 1;
  const boxAdjust = zone.box === 'inside' ? -0.22 : zone.box === 'edge' ? -0.05 : 0.05;
  const wideAdjust = isWide(zone) ? 0.12 : zone.channel === 'central' ? 0 : 0.05;
  return Math.max(0, Math.min(1, thirdBase + boxAdjust + wideAdjust));
}

/** How tight the shooting angle is, 0 (dead centre) to 1 (byline). */
export function goalAngleFactor(zone: Zone): number {
  switch (zone.channel) {
    case 'central':
      return 0.05;
    case 'leftHalf':
    case 'rightHalf':
      return 0.35;
    default:
      return 0.8;
  }
}
