/** Small numeric helpers shared across the simulation. */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linear remap of `value` from [inMin, inMax] to [outMin, outMax], clamped. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = clamp01((value - inMin) / (inMax - inMin));
  return lerp(outMin, outMax, t);
}

/**
 * Normalise a 1-99 attribute to roughly [-1, 1] around an average of 50.
 * Every attribute-driven formula in the engine is expressed in these units,
 * so weights are directly comparable when balancing.
 */
export function norm(attribute: number): number {
  return clamp((attribute - 50) / 50, -1, 1);
}

/** Normalise a 1-99 attribute to [0, 1]. */
export function unit(attribute: number): number {
  return clamp01((attribute - 1) / 98);
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
