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

/**
 * One moment the player was in, and what became of it.
 *
 * EVERY event is recorded, not only the ones that produced a shot, because
 * whether a chance becomes an attempt at all is half the answer. A striker who
 * squares the ball rather than shooting from a hopeless angle has not had a bad
 * shot; he has had no shot — so the population of ATTEMPTS is already filtered
 * by the decision model, and a mix that looks top-heavy may be top-heavy for
 * the most footballing reason there is.
 */
interface Moment {
  quality: number;
  band: BandName;
  type: SituationType;
  shot: boolean;
  onTarget: boolean;
  goal: boolean;
}

interface Run {
  matches: number;
  /** Every interactive event, shot or not. The denominator for "shots/involvement". */
  involvements: number;
  moments: Moment[];
  goals: number;
}

/** The subset that became a shot. Everything about the mix is measured on these. */
function attemptsOf(run: Run): Moment[] {
  return run.moments.filter((m) => m.shot);
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
    into.moments.push({
      quality: event.context.situationQuality,
      band: bandOf(event.context.situationQuality),
      type: event.template.type,
      shot: (outcome.stats.shots ?? 0) > 0,
      onTarget: (outcome.stats.shotsOnTarget ?? 0) > 0,
      goal: outcome.goalScored,
    });
  }

  into.matches += 1;
  into.goals += engine.state.stats.goals;
}

function measure(player: Player, policy: Policy): Run {
  const run: Run = { matches: 0, involvements: 0, moments: [], goals: 0 };
  for (let i = 0; i < MATCHES; i++) play(player, policy, `m${i}`, run);
  return run;
}

const pad = (text: string, width: number) => text.padEnd(width);
const num = (value: number, places = 2) => value.toFixed(places).padStart(6);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`.padStart(7);

function share(run: Run, band: BandName): number {
  const attempts = attemptsOf(run);
  if (attempts.length === 0) return 0;
  return attempts.filter((a) => a.band === band).length / attempts.length;
}

function conversion(attempts: readonly Moment[]): number {
  if (attempts.length === 0) return 0;
  return attempts.filter((a) => a.goal).length / attempts.length;
}

function inBand(run: Run, band: BandName): Moment[] {
  return attemptsOf(run).filter((a) => a.band === band);
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

function enough(attempts: readonly Moment[]): boolean {
  return attempts.length >= MIN_SAMPLE;
}

/**
 * A conversion rate with its sample size, or an honest dash.
 *
 * A rate off fewer than MIN_SAMPLE attempts is prefixed with a tilde rather
 * than hidden, because "the game produced four of these in thirty matches" is
 * information and a blank row is not.
 */
function rate(attempts: readonly Moment[]): string {
  if (attempts.length === 0) return '-';
  const text = `${(conversion(attempts) * 100).toFixed(1)}% (${attempts.length})`;
  return enough(attempts) ? text : `~${text}`;
}

function report(ability: number): void {
  const player = playerAt(ability);
  const actual = currentAbility(player);
  const auto = measure(player, 'auto');
  const best = measure(player, 'best');

  const shots = attemptsOf(auto);
  const perMatch = shots.length / auto.matches;
  const meanQuality = shots.reduce((sum, a) => sum + a.quality, 0) / Math.max(1, shots.length);

  console.log(`\nABILITY ${actual}`);
  console.log(
    `  auto-play: ${num(perMatch)} attempts a match from ${num(auto.involvements / auto.matches)} involvements, ` +
      `mean chance quality ${num(meanQuality)}`,
  );
  console.log(
    `             ${num(auto.goals / auto.matches)} goals a match, ` +
      `${pct(conversion(shots))} of attempts, ` +
      `${pct(shots.filter((a) => a.onTarget).length / Math.max(1, shots.length))} on target`,
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
      pad('events', 9) +
      pad('shoots', 9) +
      pad('shots/match', 13) +
      pad('share', 9) +
      pad('configured', 13) +
      'converts',
  );
  console.log('  ' + '-'.repeat(100));
  const byType = new Map<SituationType, Moment[]>();
  for (const moment of auto.moments) {
    const list = byType.get(moment.type) ?? [];
    list.push(moment);
    byType.set(moment.type, list);
  }
  const ordered = [...byType.entries()].sort(
    (a, b) => b[1].filter((m) => m.shot).length - a[1].filter((m) => m.shot).length,
  );
  for (const [type, moments] of ordered) {
    const [qMin, qMax] = SITUATION_TEMPLATES[type].qualityRange;
    const attempts = moments.filter((m) => m.shot);
    console.log(
      '  ' +
        pad(SITUATION_LABELS[type], 28) +
        pad(num(moments.length / auto.matches).trim(), 9) +
        // How often this kind of moment becomes a shot at all. A low number is
        // not a suppressed chance: it is the decision model declining to shoot.
        pad(pct(attempts.length / moments.length).trim(), 9) +
        pad(num(attempts.length / auto.matches).trim(), 13) +
        pad(attempts.length === 0 ? '-' : pct(attempts.length / shots.length).trim(), 9) +
        pad(`${qMin.toFixed(2)}-${qMax.toFixed(2)}`, 13) +
        rate(attempts),
    );
  }

  // The selection effect, stated as one number: how much of the gap between the
  // events the game generates and the shots it records is the decision model
  // declining to shoot from a poor position.
  const poorMoments = auto.moments.filter((m) => m.band === 'hopeless' || m.band === 'poor');
  const goodMoments = auto.moments.filter((m) => m.band === 'big');
  console.log(
    `\n  a poor moment becomes a shot ${pct(poorMoments.filter((m) => m.shot).length / Math.max(1, poorMoments.length)).trim()} of the time, ` +
      `a big one ${pct(goodMoments.filter((m) => m.shot).length / Math.max(1, goodMoments.length)).trim()}` +
      ` — the attempt mix is filtered by the decision, not only generated.`,
  );
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

/**
 * CANDIDATE WEIGHTS
 *
 * Third mode, run as: npx vite-node scripts/measureShotMix.ts [matches] [abilities] weights
 *
 * The candidate-bands mode above rules out `qualityRange` as the lever, and
 * this is what is left. Read the two columns of `data/situations.ts` together
 * and the mix stops being mysterious: for a striker the three LIKELIEST
 * archetypes are the three BEST ones — one-on-one at weight 6 over a 0.62-0.90
 * band, the through ball at 5 over 0.50-0.82, arriving on a cross at 5 over
 * 0.45-0.78 — while the poor ones carry the lowest weights of all, midfield
 * possession at 0.6 over 0.12-0.40 and the wide attack at 1 over 0.25-0.55.
 *
 * `positionWeights` and `qualityRange` are correlated, and that correlation IS
 * the shot mix. Nothing about any individual number is wrong; a striker really
 * is in more one-on-ones than a midfielder. What it produces in aggregate is a
 * footballer whose every moment is one of his best ones.
 *
 * So this mode leaves every band exactly as it shipped — the one-on-one stays
 * the 40% chance `GOAL_CURVE` was calibrated to produce — and moves only how
 * OFTEN each archetype comes up, by lifting the poor ones toward the good ones
 * for the position being measured. If the aggregate falls toward real football
 * without any single chance changing value, the defect was never in what a
 * chance is worth.
 */
interface WeightCandidate {
  label: string;
  /** Multiplier on this archetype's weight for the measured position. */
  scale: Partial<Record<SituationType, number>>;
}

const WEIGHT_CANDIDATES: WeightCandidate[] = [
  { label: 'shipped', scale: {} },
  {
    label: 'poor moments x2',
    scale: { midfieldProgression: 2, wideAttack: 2, edgeOfBox: 2, freeKickDirect: 2 },
  },
  {
    label: 'poor moments x4',
    scale: { midfieldProgression: 4, wideAttack: 4, edgeOfBox: 4, freeKickDirect: 4 },
  },
  {
    label: 'poor x4, one-on-one halved',
    scale: {
      midfieldProgression: 4,
      wideAttack: 4,
      edgeOfBox: 4,
      freeKickDirect: 4,
      oneOnOne: 0.5,
    },
  },
];

if (MODE === 'weights') {
  console.log('\n\nCANDIDATE WEIGHTS — every band left exactly as it shipped.\n');
  const shipped = new Map<SituationType, number | undefined>();
  for (const [type, template] of Object.entries(SITUATION_TEMPLATES)) {
    shipped.set(type as SituationType, template.positionWeights.ST);
  }

  for (const ability of ABILITIES) {
    const player = playerAt(ability);
    console.log(`ability ${currentAbility(player)}`);
    console.log(
      '  ' +
        pad('candidate', 28) +
        pad('shots', 8) +
        pad('goals', 8) +
        pad('per shot', 10) +
        pad('decent+big', 12) +
        'mean q',
    );
    console.log('  ' + '-'.repeat(74));

    for (const candidate of WEIGHT_CANDIDATES) {
      for (const [type, weight] of shipped) {
        if (weight === undefined) continue;
        SITUATION_TEMPLATES[type].positionWeights.ST = weight * (candidate.scale[type] ?? 1);
      }

      const auto = measure(player, 'auto');
      const topHeavy = share(auto, 'decent') + share(auto, 'big');
      const meanQuality =
        attemptsOf(auto).reduce((sum, a) => sum + a.quality, 0) /
        Math.max(1, attemptsOf(auto).length);

      console.log(
        '  ' +
          pad(candidate.label, 28) +
          pad(num(attemptsOf(auto).length / auto.matches).trim(), 8) +
          pad(num(auto.goals / auto.matches).trim(), 8) +
          pad(pct(conversion(attemptsOf(auto))).trim(), 10) +
          pad(pct(topHeavy).trim(), 12) +
          meanQuality.toFixed(2),
      );
    }
    console.log('');
  }

  for (const [type, weight] of shipped) {
    if (weight === undefined) continue;
    SITUATION_TEMPLATES[type].positionWeights.ST = weight;
  }
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
          pad(num(attemptsOf(auto).length / auto.matches).trim(), 8) +
          pad(num(auto.goals / auto.matches).trim(), 8) +
          pad(pct(conversion(attemptsOf(auto))).trim(), 10) +
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
