/**
 * Seeded, deterministic random number generation.
 *
 * Every part of the simulation that needs randomness receives an `Rng`
 * instance. Nothing in `core/` or `simulation/` may call `Math.random()`.
 * That rule is what makes a match reproducible from a seed, which in turn
 * makes the engine testable and balanceable.
 */

/** Hash an arbitrary string seed into a 32-bit integer. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface WeightedEntry<T> {
  value: T;
  weight: number;
}

/**
 * mulberry32 — small, fast, good enough statistical quality for a game
 * simulation, and trivially serialisable (a single 32-bit state word).
 */
export class Rng {
  private state: number;
  readonly seed: string;

  constructor(seed: string | number = 'footii') {
    this.seed = String(seed);
    this.state = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)]!;
  }

  /** Weighted pick. Entries with weight <= 0 are ignored. */
  weighted<T>(entries: readonly WeightedEntry<T>[]): T {
    const usable = entries.filter((e) => e.weight > 0);
    if (usable.length === 0) throw new Error('Rng.weighted: no positive weights');
    const total = usable.reduce((sum, e) => sum + e.weight, 0);
    let roll = this.next() * total;
    for (const entry of usable) {
      roll -= entry.weight;
      if (roll <= 0) return entry.value;
    }
    return usable[usable.length - 1]!.value;
  }

  /** Fisher-Yates, returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /**
   * Approximately normal variate (mean 0, sd 1) via the sum of 3 uniforms.
   * Naturally bounded to +/-3 sd, which is exactly what we want: football
   * results should be uncertain, never absurd.
   */
  gaussian(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  /** Gaussian noise with a hard clamp, for bounded randomness in resolution. */
  noise(sd: number, clampSd = 2): number {
    const raw = this.gaussian() * sd;
    const limit = sd * clampSd;
    return Math.max(-limit, Math.min(limit, raw));
  }

  /** Fork a derived generator so sub-systems cannot disturb each other's stream. */
  fork(label: string): Rng {
    return new Rng((this.state ^ hashSeed(label)) >>> 0);
  }
}
