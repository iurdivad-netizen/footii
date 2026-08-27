/**
 * MEASURING THE SHOT MIX
 *
 * ROADMAP.md and the note above `SHOT_QUALITY` in simulation/ActionResolver.ts
 * both end at the same open question, and neither could answer it: after the
 * chance-quality fix, a hopeless chance still converts better than one in five
 * for a world-class striker where real football is nearer one in twenty, and the
 * spread across the bands is 1.8x against a real tenfold. The conclusion both
 * reached is that the remaining defect is not in the resolver at all — it is
 * that the game hands its striker five to six attempts a match, most of them
 * decent, because he is the focus of every situation it generates.
 *
 * That is a claim about the SITUATION GENERATOR, and it was reasoned about
 * rather than measured. This is the tool that measures it, for the same reason
 * `measureAutoPlay.ts` exists: the number is emergent, and the mix is produced
 * by thirteen templates' `qualityRange` bands crossed with position weights,
 * tendency bias and team style, which is not a thing anybody can read off the
 * data file.
 *
 * THE THREE QUESTIONS IT ANSWERS, in the order a fix would need them.
 *
 *   1. IS THE MIX ACTUALLY WRONG? How many attempts a match, and how they fall
 *      across the quality bands. "Most of them decent" is the claim; a
 *      distribution is what settles it.
 *   2. WHAT IS THE SPREAD? Goals per attempt in each band, and the ratio
 *      between the best band and the worst. This is the 1.8x that the
 *      SHOT_QUALITY note reports, re-measured here per band rather than across
 *      two, so a fix can be checked against it.
 *   3. WHERE DO THE ATTEMPTS COME FROM? The same two numbers per situation
 *      archetype, beside the `qualityRange` that archetype is configured with.
 *      Without this a fix has nowhere to land: "lower the bands" is not an
 *      instruction until you know which templates are supplying the volume.
 *
 * WHY IT MEASURES CONVERSION UNDER TWO POLICIES. Auto-play is what the roadmap
 * numbers were taken under and is the honest picture of a career. A perfect read
 * is the instrument: it removes the decision as a variable, so a difference
 * between bands is the CHANCE rather than what the policy did with it — which is
 * the population `GOAL_CURVE` was calibrated against, and the only one its 40%
 * one-on-one claim can be checked on.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is change anything. Every constant it reads
 * is the shipped one, and the candidate mode below restores what it touched. The
 * bands are `qualityRange` data rather than a curve, so a fix moves careers
 * already in progress exactly as the goal-curve fix did — that is a decision to
 * take with the numbers in hand, and this only supplies the numbers.
 *
 * Run with:   npx vite-node scripts/measureShotMix.ts [matches] [abilities]
 * For example: npx vite-node scripts/measureShotMix.ts 150
 *              npx vite-node scripts/measureShotMix.ts 200 55,70,85
 *              npx vite-node scripts/measureShotMix.ts 150 85 candidates
 *
 * Deterministic: every match is seeded from its index, so the same arguments
 * always produce the same table and a change in the output is a change in the
 * model rather than noise.
 */
import { Rng } from '../src/core/rng.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { currentAbility } from '../src/core/player/player.ts';
import type { SituationType } from '../src/core/events/types.ts';
import { SITUATION_LABELS } from '../src/core/events/types.ts';
import { getGoalkeeperForTeam, getTeam } from '../src/data/gameData.ts';
import { getAction } from '../src/data/actionCatalogue.ts';
import { SITUATION_TEMPLATES } from '../src/data/situations.ts';
import { MatchEngine } from '../src/simulation/MatchEngine.ts';
import { autoDecision } from '../src/simulation/AutoPlay.ts';

const MATCHES = Number(process.argv[2] ?? 150);
const ABILITIES = (process.argv[3] ?? '55,70,85').split(',').map(Number);
const MODE = process.argv[4] ?? '';

/**
 * The bands, and why these cut points.
 *
 * The two that matter are inherited rather than invented: the SHOT_QUALITY note
 * measured "poor" below 0.45 and "big" at 0.62 and above, and a tool whose
 * bands disagreed with the note it exists to check would produce numbers nobody
 * could compare with anything. The pair added here split those two in half,
 * because "poor" spanning everything below 0.45 is most of the scale and hides
 * the tail — and the tail is precisely what the claim is about.
 */
const BANDS = [
  { name: 'hopeless', min: 0, max: 0.35 },
  { name: 'poor', min: 0.35, max: 0.45 },
  { name: 'decent', min: 0.45, max: 0.62 },
  { name: 'big', min: 0.62, max: 1.01 },
] as const;

type BandName = (typeof BANDS)[number]['name'];

function bandOf(quality: number): BandName {
  for (const band of BANDS) {
    if (quality >= band.min && quality < band.max) return band.name;
  }
  return 'big';
}

type Policy = 'auto' | 'best';

/** One shot, and everything about the chance it came from. */
interface Attempt {
  quality: number;
  band: BandName;
  type: SituationType;
  onTarget: boolean;
  goal: boolean;
}

interface Run {
  matches: number;
  /** Every interactive event, shot or not. The denominator for "shots/involvement". */
  involvements: number;
  attempts: Attempt[];
  goals: number;
}

/**
 * A footballer at a target ability.
 *
 * Flat across every attribute, exactly as `measureAutoPlay.ts` builds him and
 * for the same reason: `currentAbility` is a weighted mean, so a flat player
 * lands on the number asked for and only one dial moves between rows.
 */
function playerAt(ability: number): Player {
  return createPlayer({
    name: `Probe ${ability}`,
    position: 'ST',
    attributes: {},
    age: 26,
    experience: 60,
    baseAttribute: ability,
    reputation: 50,
    potentialAbility: Math.min(99, ability + 6),
  });
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
 * One match, recording every chance the player was in and what became of it.
 *
 * The auto policy calls `autoDecision` — the real one the game skips matches
 * with — rather than reimplementing it, so the mix measured here is the mix a
 * skipped match actually produces. The perfect read mirrors `measureAutoPlay`'s
 * `best`, including deciding early, because reading a situation buys the tempo
 * bonus as well as the right option.
 */
function play(player: Player, policy: Policy, seed: string, into: Run): void {
  const engine = engineFor(player, seed);
  const rng = new Rng(`${seed}:${policy === 'auto' ? 'auto' : 'policy'}`);

  for (let i = 0; i < 10000; i++) {
    const update = engine.step();
    if (update.kind === 'finished') break;
    if (update.kind !== 'interactive') continue;

    const event = update.event;
    into.involvements += 1;

    const resolution =
      policy === 'auto'
        ? engine.submitDecision(autoDecision(rng, event.context, event.options, event.timer.seconds))
        : engine.submitDecision({
            option: [...event.options].sort(
              (a, b) => getAction(b.kind).fit(event.context) - getAction(a.kind).fit(event.context),
            )[0]!,
            timeUsed: event.timer.seconds * 0.22,
          });

    const outcome = resolution.result.outcome;
    if ((outcome.stats.shots ?? 0) > 0) {
      into.attempts.push({
        quality: event.context.situationQuality,
        band: bandOf(event.context.situationQuality),
        type: event.template.type,
        onTarget: (outcome.stats.shotsOnTarget ?? 0) > 0,
        goal: outcome.goalScored,
      });
    }
  }

  into.matches += 1;
  into.goals += engine.state.stats.goals;
}

function measure(player: Player, policy: Policy): Run {
  const run: Run = { matches: 0, involvements: 0, attempts: [], goals: 0 };
  for (let i = 0; i < MATCHES; i++) play(player, policy, `m${i}`, run);
  return run;
}

const pad = (text: string, width: number) => text.padEnd(width);
const num = (value: number, places = 2) => value.toFixed(places).padStart(6);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`.padStart(7);

function share(run: Run, band: BandName): number {
  if (run.attempts.length === 0) return 0;
  return run.attempts.filter((a) => a.band === band).length / run.attempts.length;
}

function conversion(attempts: readonly Attempt[]): number {
  if (attempts.length === 0) return 0;
  return attempts.filter((a) => a.goal).length / attempts.length;
}

function inBand(run: Run, band: BandName): Attempt[] {
  return run.attempts.filter((a) => a.band === band);
}

/**
 * Below this a band's conversion is noise, and is printed as noise.
 *
 * Not a nicety. The bands this tool exists to look at are the RARE ones — the
 * whole claim is that the game hardly generates them — so the sample that
 * matters is always the smallest one on the table, and a 75% conversion off
 * four attempts is exactly the kind of number that gets quoted in a roadmap and
 * then acted on. The count is printed beside every rate so the reader can see
 * what it rests on.
 */
const MIN_SAMPLE = 25;

function enough(attempts: readonly Attempt[]): boolean {
  return attempts.length >= MIN_SAMPLE;
}

/**
 * A conversion rate with its sample size, or an honest dash.
 *
 * A rate off fewer than MIN_SAMPLE attempts is prefixed with a tilde rather
 * than hidden, because "the game produced four of these in thirty matches" is
 * information and a blank row is not.
 */
function rate(attempts: readonly Attempt[]): string {
  if (attempts.length === 0) return '-';
  const text = `${(conversion(attempts) * 100).toFixed(1)}% (${attempts.length})`;
  return enough(attempts) ? text : `~${text}`;
}

function report(ability: number): void {
  const player = playerAt(ability);
  const actual = currentAbility(player);
  const auto = measure(player, 'auto');
  const best = measure(player, 'best');

  const perMatch = auto.attempts.length / auto.matches;
  const meanQuality =
    auto.attempts.reduce((sum, a) => sum + a.quality, 0) / Math.max(1, auto.attempts.length);

  console.log(`\nABILITY ${actual}`);
  console.log(
    `  auto-play: ${num(perMatch)} attempts a match from ${num(auto.involvements / auto.matches)} involvements, ` +
      `mean chance quality ${num(meanQuality)}`,
  );
  console.log(
    `             ${num(auto.goals / auto.matches)} goals a match, ` +
      `${pct(conversion(auto.attempts))} of attempts, ` +
      `${pct(auto.attempts.filter((a) => a.onTarget).length / Math.max(1, auto.attempts.length))} on target`,
  );

  console.log('\n  THE MIX, and what each band is worth');
  console.log(
    '  ' +
      pad('band', 11) +
      pad('share', 9) +
      pad('per match', 11) +
      pad('auto', 14) +
      'perfect read',
  );
  console.log('  ' + '-'.repeat(62));
  for (const band of BANDS) {
    const autoBand = inBand(auto, band.name);
    const bestBand = inBand(best, band.name);
    console.log(
      '  ' +
        pad(band.name, 11) +
        pad(pct(share(auto, band.name)).trim(), 9) +
        pad(num(autoBand.length / auto.matches).trim(), 11) +
        pad(rate(autoBand), 14) +
        rate(bestBand),
    );
  }

  // The headline number the SHOT_QUALITY note reports, re-derived from the two
  // extreme bands rather than from its two-way split, and under the perfect
  // read — the population the goal curve was calibrated against.
  const low = inBand(best, 'hopeless');
  const high = inBand(best, 'big');
  console.log(
    `\n  spread, perfect read: ${rate(high)} on a big chance against ` +
      `${rate(low)} on a hopeless one` +
      (enough(low) && enough(high) && conversion(low) > 0
        ? ` — ${(conversion(high) / conversion(low)).toFixed(1)}x`
        : ' — too few hopeless chances to divide by, which is itself the finding'),
  );
  console.log('  real football is nearer tenfold, on an aggregate of 12-15% per shot.');

  console.log('\n  WHERE THE ATTEMPTS COME FROM');
  console.log(
    '  ' +
      pad('archetype', 28) +
      pad('per match', 11) +
      pad('share', 9) +
      pad('mean q', 9) +
      pad('configured', 13) +
      'converts',
  );
  console.log('  ' + '-'.repeat(84));
  const byType = new Map<SituationType, Attempt[]>();
  for (const attempt of auto.attempts) {
    const list = byType.get(attempt.type) ?? [];
    list.push(attempt);
    byType.set(attempt.type, list);
  }
  const ordered = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [type, attempts] of ordered) {
    const [qMin, qMax] = SITUATION_TEMPLATES[type].qualityRange;
    const mean = attempts.reduce((sum, a) => sum + a.quality, 0) / attempts.length;
    console.log(
      '  ' +
        pad(SITUATION_LABELS[type], 28) +
        pad(num(attempts.length / auto.matches).trim(), 11) +
        pad(pct(attempts.length / auto.attempts.length).trim(), 9) +
        pad(mean.toFixed(2), 9) +
        pad(`${qMin.toFixed(2)}-${qMax.toFixed(2)}`, 13) +
        rate(attempts),
    );
  }
}

console.log(`The shot mix, measured over ${MATCHES} matches per policy per ability.`);
console.log('Vale Park (home) against Northport City, 90 minutes, pace 1.');
console.log('Every constant is the shipped one; nothing here is a proposal.');

for (const ability of ABILITIES) report(ability);

/**
 * CANDIDATE BANDS
 *
 * Second mode, run as: npx vite-node scripts/measureShotMix.ts [matches] [abilities] candidates
 *
 * A candidate is a transform applied to every template's `qualityRange` and
 * then measured end to end through the real generator, resolver and curve —
 * which is the whole reason it is done by mutating the imported data rather
 * than by arithmetic on the tables above. The mix is produced by the bands
 * crossed with position weights, tendency bias, team style, the attacking edge
 * and the defence's resistance, and only the running game knows what that
 * composition does.
 *
 * The two transforms are the two theories of the defect, and they are not the
 * same fix:
 *
 *   SHIFT   lowers every band by a constant. If the mix is simply too generous
 *           across the board, this is the fix and it costs one line in each
 *           template.
 *   STRETCH pulls the bands apart around the midpoint: a poor archetype gets
 *           poorer, a gilt-edged one is untouched. If the defect is that
 *           everything the game generates lands in the middle — which is what
 *           "most of them decent" claims — then this is the fix, and a shift
 *           would only move the whole clump down.
 *
 * Each is restored immediately after it is measured. The tool never leaves the
 * data file changed, and it never writes one.
 */
interface Candidate {
  label: string;
  apply: (range: [number, number]) => [number, number];
}

const CANDIDATES: Candidate[] = [
  { label: 'shipped', apply: (range) => range },
  { label: 'shift -0.05', apply: ([lo, hi]) => [lo - 0.05, hi - 0.05] },
  { label: 'shift -0.10', apply: ([lo, hi]) => [lo - 0.1, hi - 0.1] },
  { label: 'stretch 1.4', apply: ([lo, hi]) => stretch(lo, hi, 1.4) },
  { label: 'stretch 1.8', apply: ([lo, hi]) => stretch(lo, hi, 1.8) },
  { label: 'stretch 1.4, shift -0.05', apply: ([lo, hi]) => shift(stretch(lo, hi, 1.4), -0.05) },
];

/**
 * Pull a band away from the scale's midpoint.
 *
 * 0.5 rather than the band's own centre, because the point is to separate the
 * archetypes from EACH OTHER — widening every band around its own middle would
 * leave a penalty and a speculative effort exactly as close together as they
 * started, which is the thing being tested.
 */
function stretch(lo: number, hi: number, factor: number): [number, number] {
  return [
    Math.max(0, 0.5 + (lo - 0.5) * factor),
    Math.min(1, 0.5 + (hi - 0.5) * factor),
  ];
}

function shift([lo, hi]: [number, number], by: number): [number, number] {
  return [Math.max(0, lo + by), Math.min(1, hi + by)];
}

if (MODE === 'candidates') {
  console.log('\n\nCANDIDATE BANDS — measured end to end, then reverted.\n');
  const shipped = new Map<SituationType, [number, number]>();
  for (const [type, template] of Object.entries(SITUATION_TEMPLATES)) {
    shipped.set(type as SituationType, [...template.qualityRange] as [number, number]);
  }

  for (const ability of ABILITIES) {
    const player = playerAt(ability);
    console.log(`ability ${currentAbility(player)}`);
    console.log(
      '  ' +
        pad('candidate', 26) +
        pad('shots', 8) +
        pad('goals', 8) +
        pad('per shot', 10) +
        pad('hopeless (n)', 14) +
        pad('big (n)', 14) +
        'spread',
    );
    console.log('  ' + '-'.repeat(84));

    for (const candidate of CANDIDATES) {
      for (const [type, range] of shipped) {
        SITUATION_TEMPLATES[type].qualityRange = candidate.apply([...range] as [number, number]);
      }

      const auto = measure(player, 'auto');
      const best = measure(player, 'best');
      const low = inBand(best, 'hopeless');
      const high = inBand(best, 'big');
      const divisible = enough(low) && enough(high) && conversion(low) > 0;

      console.log(
        '  ' +
          pad(candidate.label, 26) +
          pad(num(auto.attempts.length / auto.matches).trim(), 8) +
          pad(num(auto.goals / auto.matches).trim(), 8) +
          pad(pct(conversion(auto.attempts)).trim(), 10) +
          pad(rate(low), 14) +
          pad(rate(high), 14) +
          (divisible ? `${(conversion(high) / conversion(low)).toFixed(1)}x` : '-'),
      );
    }
    console.log('');
  }

  // Put the world back exactly as it shipped, so a later import in the same
  // process — a test, a REPL, anything — reads the real data file.
  for (const [type, range] of shipped) {
    SITUATION_TEMPLATES[type].qualityRange = range;
  }
}
