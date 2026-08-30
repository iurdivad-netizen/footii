/**
 * CHOOSING A WORLD
 *
 * A career is deterministic from its seed — that is the rule the whole
 * simulation is built on, and `core/rng.ts` states it plainly: nothing in
 * `core/` or `simulation/` may call `Math.random()`. This is the other side of
 * that rule. Somebody has to pick the seed, exactly once, and the place to do
 * it is the layer that is allowed to be non-deterministic: the one with the
 * buttons on it.
 *
 * WHY IT IS NOT A TEXT FIELD ANY MORE. It was, on the career setup screen,
 * defaulting to the constant "footii-1" and restored from the previous
 * selection after that — so the three careers this game advertises as
 * independent lives were three copies of one world. Measured at the same club
 * on the default: identical fixture list, identical cup draws, identically
 * named rival. A player who never touched the box, which is every player who
 * did not already know what a seed was, got the same fifteen years three times.
 *
 * WHY IT IS STILL READABLE. Determinism is only worth having if you can point
 * at it, so the seed is not hidden — the debug panel prints it on every
 * interactive event, and the whole world travels in an exported save. What is
 * gone is being asked to invent one before the game has started.
 */

/**
 * A seed nobody has used before.
 *
 * The clock and a random suffix rather than either alone: a timestamp is
 * unique but guessable and sorts careers by when they were made, and a bare
 * random string says nothing about where it came from. Together they are
 * unique per career, obviously machine-made, and short enough to read out of
 * the debug panel over the phone.
 */
export function newCareerSeed(): string {
  const stamp = Date.now().toString(36);
  const noise = Math.floor(Math.random() * 0xfffff).toString(36);
  return `c-${stamp}-${noise}`;
}
