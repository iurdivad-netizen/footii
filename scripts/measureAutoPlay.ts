/**
 * MEASURING WHAT A SKIPPED MATCH IS WORTH
 *
 * ROADMAP.md records that "auto-play scores far too much" — 1.0 goals a match at
 * ability 55 and 2.9 at ability 85, at an average rating of 9.4 — and
 * deliberately did not act on it, because retuning would move every career
 * already played. This is the tool that turns that observation into a diagnosis,
 * for the same reason `measureInjuries.ts` exists: the number is emergent, so
 * arguing about it from the code is guessing.
 *
 * THE QUESTION IT IS BUILT TO ANSWER, and it is not "how much does auto-play
 * score". It is: IS AUTO-PLAY BEATING A HUMAN? Those are different claims with
 * opposite fixes, and the AutoPlay policy is only guilty of one of them:
 *
 *   If auto sits near BEST, the policy is too sharp and the fix is in
 *   AutoPlay.ts — it is out-reading a person who is actually trying.
 *   If auto sits between RANDOM and BEST exactly as its own calibration note
 *   claims, but all three score far too much, then the policy is innocent and
 *   the inflation is in the match engine's chance supply. Retuning auto-play
 *   there would make skipping a punishment, which is the one thing its notes
 *   forbid.
 *
 * So every ability level is played under all three policies on the SAME seeds
 * and the same fixture, and the gaps are what is reported. A single column of
 * auto-play numbers could not distinguish the two cases, which is why the first
 * version of this script was not worth running.
 *
 * Run with:   npx vite-node scripts/measureAutoPlay.ts [matches] [abilities]
 * For example: npx vite-node scripts/measureAutoPlay.ts 120
 *              npx vite-node scripts/measureAutoPlay.ts 200 55,70,85
 *
 * Deterministic: every match is seeded from its index, so the same arguments
 * always produce the same table and a change in the output is a change in the
 * model rather than noise.
 */
import { Rng } from '../src/core/rng.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { currentAbility } from '../src/core/player/player.ts';
import { getGoalkeeperForTeam, getTeam } from '../src/data/gameData.ts';
import { getAction } from '../src/data/actionCatalogue.ts';
import { MatchEngine } from '../src/simulation/MatchEngine.ts';
import { runMatchAutomatically } from '../src/simulation/AutoPlay.ts';

const MATCHES = Number(process.argv[2] ?? 120);
const ABILITIES = (process.argv[3] ?? '55,70,85').split(',').map(Number);

/**
 * A footballer at a target ability.
 *
 * Built by flooding every attribute to the same value, because `currentAbility`
 * is a weighted mean of the four groups and a flat player therefore lands on
 * exactly the number asked for. A realistically lopsided striker would be a
 * better footballer and a worse instrument: the point here is to move one dial.
 */
function playerAt(ability: number): Player {
  return createPlayer({
    name: `Probe ${ability}`,
    position: 'ST',
    age: 26,
    experience: 60,
    baseAttribute: ability,
    reputation: 50,
    potentialAbility: Math.min(99, ability + 6),
  });
}

type Policy = 'auto' | 'random' | 'best' | 'worst';

interface Sample {
  goals: number;
  rating: number;
}

function engineFor(player: Player, seed: string): MatchEngine {
  const playerTeam = getTeam('vale-park');
  const opponent = getTeam('northport-city');
  return new MatchEngine(
    {
      player,
      playerTeam,
      opponent,
      opponentGoalkeeper: getGoalkeeperForTeam(opponent.id),
      ownGoalkeeper: getGoalkeeperForTeam(playerTeam.id),
      length: 90,
      playerTeamIsHome: true,
      paceScale: 1,
    },
    seed,
  );
}

/**
 * One match under a fixed policy.
 *
 * The non-auto policies mirror `tests/autoPlay.test.ts` exactly, including the
 * detail that `best` decides EARLY as well as correctly — reading a situation
 * buys the tempo bonus as well as the right option, so a "best" that dawdled
 * would understate the human ceiling and flatter auto-play by comparison.
 */
function play(player: Player, policy: Policy, seed: string): Sample {
  const engine = engineFor(player, seed);

  if (policy === 'auto') {
    runMatchAutomatically(engine, seed);
    return { goals: engine.state.stats.goals, rating: engine.rating() };
  }

  const rng = new Rng(`${seed}:policy`);
  for (let i = 0; i < 10000; i++) {
    const update = engine.step();
    if (update.kind === 'finished') break;
    if (update.kind !== 'interactive') continue;

    const { options, context: ctx, timer } = update.event;
    const byFit = [...options].sort(
      (a, b) => getAction(b.kind).fit(ctx) - getAction(a.kind).fit(ctx),
    );
    const option =
      policy === 'random'
        ? rng.pick(options)
        : policy === 'best'
          ? byFit[0]!
          : byFit[byFit.length - 1]!;
    const share = policy === 'best' ? 0.22 : 0.6;
    engine.submitDecision({ option, timeUsed: timer.seconds * share });
  }

  return { goals: engine.state.stats.goals, rating: engine.rating() };
}

function measure(player: Player, policy: Policy): Sample {
  let goals = 0;
  let rating = 0;
  for (let i = 0; i < MATCHES; i++) {
    const sample = play(player, policy, `m${i}`);
    goals += sample.goals;
    rating += sample.rating;
  }
  return { goals: goals / MATCHES, rating: rating / MATCHES };
}

const pad = (text: string, width: number) => text.padEnd(width);
const num = (value: number, places = 2) => value.toFixed(places).padStart(6);

console.log(`Auto-play, measured over ${MATCHES} matches per policy per ability.`);
console.log('Vale Park (home) against Northport City, 90 minutes, pace 1.\n');
console.log(
  pad('ability', 9) +
    pad('policy', 9) +
    pad('goals/match', 13) +
    pad('rating', 8) +
    'gap to best',
);
console.log('-'.repeat(56));

for (const ability of ABILITIES) {
  const player = playerAt(ability);
  const actual = currentAbility(player);
  const results = new Map<Policy, Sample>();
  for (const policy of ['worst', 'random', 'auto', 'best'] as Policy[]) {
    results.set(policy, measure(player, policy));
  }
  const best = results.get('best')!;

  for (const policy of ['worst', 'random', 'auto', 'best'] as Policy[]) {
    const sample = results.get(policy)!;
    console.log(
      pad(String(actual), 9) +
        pad(policy, 9) +
        num(sample.goals) +
        '       ' +
        num(sample.rating) +
        '  ' +
        num(sample.rating - best.rating).padStart(8),
    );
  }
  console.log('-'.repeat(56));
}

/**
 * SWEEPING THE SHARPNESS CONSTANT
 *
 * Second mode, run as: npx vite-node scripts/measureAutoPlay.ts [matches] [abilities] sweep
 *
 * It reimplements the six lines of `autoChooseAction` against a CANDIDATE
 * sharpness range, which is the one duplication in this file and is deliberate:
 * threading a measurement-only parameter through `runMatchAutomatically` and
 * into production would put a dial in the shipped game that only this script
 * ever turns. The chosen constant is always confirmed afterwards through the
 * real code path above, so the copy can never silently disagree with what ships.
 */
function sweep(base: number, scale: number, player: Player, seed: string): Sample {
  const engine = engineFor(player, seed);
  const rng = new Rng(`${seed}:auto`);

  for (let i = 0; i < 10000; i++) {
    const update = engine.step();
    if (update.kind === 'finished') break;
    if (update.kind !== 'interactive') continue;

    const { options, context: ctx, timer } = update.event;
    const a = ctx.player.attributes;
    const judgement = Math.min(
      1,
      Math.max(0, (a.decisionMaking / 100) * 0.45 + (a.composure / 100) * 0.3 + (a.awareness / 100) * 0.25),
    );
    const sharpness = base + judgement * scale;
    const entries = options.map((option) => ({
      value: option,
      weight: 0.05 + Math.min(1, Math.max(0, getAction(option.kind).fit(ctx))) ** sharpness,
    }));
    engine.submitDecision({ option: rng.weighted(entries), timeUsed: timer.seconds * 0.6 });
  }

  return { goals: engine.state.stats.goals, rating: engine.rating() };
}

if (process.argv[4] === 'sweep') {
  console.log('\nCandidate sharpness ranges — rating, and the gap to a perfect read.\n');
  const candidates: [number, number][] = [
    [0.5, 2.6],
    [0.9, 1.0],
    [1.0, 0.8],
    [1.1, 0.6],
    [1.2, 0.4],
  ];

  for (const ability of ABILITIES) {
    const player = playerAt(ability);
    let bestTotal = 0;
    for (let i = 0; i < MATCHES; i++) bestTotal += play(player, 'best', `m${i}`).rating;
    const bestRating = bestTotal / MATCHES;
    console.log(`ability ${currentAbility(player)} — a perfect read averages ${bestRating.toFixed(2)}`);

    for (const [base, scale] of candidates) {
      let rating = 0;
      let goals = 0;
      for (let i = 0; i < MATCHES; i++) {
        const sample = sweep(base, scale, player, `m${i}`);
        rating += sample.rating;
        goals += sample.goals;
      }
      rating /= MATCHES;
      goals /= MATCHES;
      const shipped = base === 0.5 && scale === 2.6 ? '  (shipped)' : '';
      console.log(
        `  ${base.toFixed(1)} + j*${scale.toFixed(1)}   goals ${goals.toFixed(2)}   rating ${rating.toFixed(2)}   gap ${(rating - bestRating).toFixed(2)}${shipped}`,
      );
    }
    console.log();
  }
}
