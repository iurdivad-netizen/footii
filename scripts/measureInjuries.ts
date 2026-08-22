/**
 * MEASURING THE INJURY MODEL
 *
 * Plays whole careers through the REAL match engine and reports what the injury
 * model actually does, as opposed to what its comments claim it does.
 *
 * WHY THIS EXISTS AS A COMMITTED TOOL rather than something written once and
 * thrown away. Injuries are the one part of this game nobody can judge from the
 * code: the risk is quadratic in fitness at the final whistle, fitness is what
 * ninety minutes of a real match happened to leave, and a match costs slightly
 * more than a week of rest returns — so what any given constant produces over a
 * season is an emergent number rather than an arithmetic one. The first time
 * somebody asked "is this too many injuries?", answering it honestly meant
 * building this. The second time should not.
 *
 * It found two things on its first run, both recorded in CHANGELOG.md as items
 * 13 and 14: that the age curve was flat below 28, and that a week of extra
 * work cost 37% more injuries than its card admitted.
 *
 * Run with:   npx vite-node scripts/measureInjuries.ts [careers] [seasons] [week]
 * For example: npx vite-node scripts/measureInjuries.ts 40 12
 *              npx vite-node scripts/measureInjuries.ts 30 12 train
 *
 * The optional third argument makes the simulated player spend every week on
 * one choice, which is how the cost of a week's decision is measured against a
 * career that never plans one.
 *
 * Deterministic: every career is seeded, so the same arguments always produce
 * the same numbers and a change in the output means a change in the model.
 * Thirty careers of twelve seasons takes about fifteen seconds.
 */
import { Rng } from '../src/core/rng.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { TEAMS, getTeam, getGoalkeeperForTeam, bestGoalkeeperIn } from '../src/data/gameData.ts';
import type { Team } from '../src/core/team/team.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { nextMatch, seasonComplete } from '../src/core/career/career.ts';
import {
  acceptOffer,
  canStay,
  careerTeams,
  endSeason,
  missMatch,
  prepareNextMatch,
  recordPlayerMatch,
  startCareer,
  stayAtClub,
  teamSheet,
} from '../src/simulation/CareerService.ts';
import { MatchEngine } from '../src/simulation/MatchEngine.ts';
import { runMatchAutomatically } from '../src/simulation/AutoPlay.ts';
import { INTERNATIONAL } from '../src/core/career/international.ts';
import { countryOfNation, nationId } from '../src/core/career/nations.ts';
import { isExpired } from '../src/core/career/contracts.ts';
import { injuryRisk } from '../src/core/career/injury.ts';
import { TRAITS, TRAIT_IDS } from '../src/core/player/traits.ts';
import type { TraitId } from '../src/core/player/traits.ts';
import { lifetimeTotals } from '../src/core/career/records.ts';
import { traitEvidence } from '../src/core/career/career.ts';
import type { TraitEvidence } from '../src/core/player/traits.ts';
import { careerScore, honourPoints } from '../src/core/career/legacy.ts';
import { planWeek } from '../src/simulation/CareerService.ts';

/** Which week choice the probe makes, if any. Third CLI argument. */
const WEEK = process.argv[4] as 'rest' | 'train' | 'study' | 'push' | undefined;

const lookup = (id: string) => getTeam(id);

/** One finished career, for the trait and power-creep report. */
interface CareerSample {
  traits: TraitId[];
  appearances: number;
  goals: number;
  assists: number;
  averageRating: number;
  score: number;
  moments: number;
}

const careerSamples: CareerSample[] = [];
const evidenceSamples: TraitEvidence[] = [];
const perfectSamples: number[] = [];
const rivalSummers: { displaced: number; former: number }[] = [];
let displacedCount = 0;

interface SeasonSample {
  season: number;
  age: number;
  injuries: number;
  weeksOut: number;
  matchesPlayed: number;
  matchesMissedInjured: number;
  fixtures: number;
  severities: string[];
}

const fitnessAtEnd: number[] = [];
const fitnessAtStart: number[] = [];
const perMatchRisk: number[] = [];
/** Fitness entering the match, bucketed by how far into the season it was. */
const startByStage: number[][] = [[], [], [], [], []];
const riskByStage: number[][] = [[], [], [], [], []];

/**
 * How good the probe career is allowed to become.
 *
 * Fifth CLI argument. It matters more than it looks: auto-play scores 1.0 goals
 * a match at ability 55 and 2.9 at ability 85, so the same thresholds look
 * trivial to one career and out of reach to another. Anything calibrated on one
 * profile alone is calibrated on nothing.
 */
const POTENTIAL = Number(process.argv[5] ?? 86);

/** Sixth CLI argument: "settled" refuses every transfer offer. */
const SETTLED = process.argv[6] === 'settled';

function prospect(age: number): Player {
  return createPlayer({
    name: 'Probe',
    position: 'ST',
    age,
    experience: 12,
    baseAttribute: Math.min(58, POTENTIAL - 4),
    reputation: 34,
    potentialAbility: POTENTIAL,
    attributes: { finishing: 66, stamina: 60, awareness: 50, composure: 48, decisionMaking: 46 },
  });
}

function playSeason(state: CareerState, sample: SeasonSample): void {
  let guard = 0;
  while (!seasonComplete(state) && guard++ < 200) {
    prepareNextMatch(state, lookup);
    const scheduled = nextMatch(state);
    if (!scheduled) break;

    sample.fixtures += 1;

    if (state.injury) {
      sample.matchesMissedInjured += 1;
      missMatch(state, lookup);
      continue;
    }
    if (!teamSheet(state).selected) {
      missMatch(state, lookup);
      continue;
    }

    const clubs = careerTeams(state, getTeam);
    const international = scheduled.competition === INTERNATIONAL;
    const playerTeam = clubs(international ? nationId(state.player.nationality) : state.clubId);
    const opponent = clubs(scheduled.opponentId);
    const keeperFor = (team: Team) => {
      const country = countryOfNation(team.id);
      return country ? bestGoalkeeperIn(country) : getGoalkeeperForTeam(team.id);
    };

    if (WEEK) planWeek(state, WEEK);
    state.player.fitness = state.fitness;
    fitnessAtStart.push(state.fitness);
    const stage = Math.min(4, Math.floor((sample.fixtures - 1) / 9));
    startByStage[stage]!.push(state.fitness);
    const seed = `${state.seed}:s${state.seasonNumber}:c${state.calendarIndex}`;
    const engine = new MatchEngine(
      {
        player: state.player,
        playerTeam,
        opponent,
        opponentGoalkeeper: keeperFor(opponent),
        ownGoalkeeper: keeperFor(playerTeam),
        length: 90,
        playerTeamIsHome: scheduled.home,
        teammates: state.teammates,
      },
      seed,
    );
    runMatchAutomatically(engine, seed);

    const ended = engine.matchPlayer.fitness;
    fitnessAtEnd.push(ended);
    const risk = injuryRisk({
      fitnessAtEnd: ended,
      minutes: engine.state.stats.minutes,
      age: state.player.age,
      stamina: state.player.attributes.stamina,
    });
    perMatchRisk.push(risk);
    riskByStage[stage]!.push(risk);

    const before = state.injury;
    recordPlayerMatch(
      state,
      {
        stats: engine.state.stats,
        rating: engine.rating(),
        playerTeamScore: engine.state.playerTeamScore,
        opponentScore: engine.state.opponentScore,
        fitnessAtEnd: ended,
      },
      lookup,
    );
    sample.matchesPlayed += 1;

    if (state.injury && state.injury !== before) {
      sample.injuries += 1;
      sample.weeksOut += state.injury.weeks;
      sample.severities.push(state.injury.severity);
    }
  }
}

function playCareer(seed: string, seasons: number): SeasonSample[] {
  const state = startCareer({
    player: prospect(18),
    clubId: 'northport-city',
    teams: TEAMS,
    seed,
  });
  const samples: SeasonSample[] = [];
  displacedCount = 0;

  for (let i = 0; i < seasons; i++) {
    const sample: SeasonSample = {
      season: state.seasonNumber,
      age: state.player.age,
      injuries: 0,
      weeksOut: 0,
      matchesPlayed: 0,
      matchesMissedInjured: 0,
      fixtures: 0,
      severities: [],
    };
    playSeason(state, sample);
    samples.push(sample);

    const summer = endSeason(state, lookup);
    displacedCount += summer.moments.filter((m) => m.kind === 'rivalGone').length;
    const best = state.offers[0];
    // SETTLED mode: refuse every offer. A career that moves clubs every summer
    // never keeps a rival long enough to displace one, which is true of the
    // game and useless for measuring the thing that only happens when you stay.
    if (best && !SETTLED) acceptOffer(state, best.id, lookup);
    else if (canStay(state)) stayAtClub(state);
    else if (isExpired(state.contract)) break;
  }

  rivalSummers.push({
    displaced: displacedCount,
    former: (state.formerRivals ?? []).length,
  });
  const evidence = traitEvidence(state);
  evidenceSamples.push(evidence);
  const totals = lifetimeTotals(state.records);
  careerSamples.push({
    traits: [...(state.player.traits ?? [])],
    appearances: totals.matches,
    goals: totals.goals,
    assists: totals.assists,
    averageRating: totals.matches > 0 ? totals.ratingTotal / totals.matches : 0,
    score: careerScore({
      goals: totals.goals,
      assists: totals.assists,
      appearances: totals.matches,
      averageRating: totals.matches > 0 ? totals.ratingTotal / totals.matches : 0,
      caps: state.records.byCompetition.international?.matches ?? 0,
      seasons: state.history.length,
      honours: [],
      honourPoints: honourPoints(state.honours),
    }),
    moments: state.moments.length,
  });
  perfectSamples.push(state.records.ratings.perfect);
  return samples;
}

const CAREERS = Number(process.argv[2] ?? 12);
const SEASONS = Number(process.argv[3] ?? 12);

const all: SeasonSample[] = [];
for (let i = 0; i < CAREERS; i++) all.push(...playCareer(`probe-${i}`, SEASONS));

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
};

console.log(`careers=${CAREERS} seasons/career=${SEASONS} season-samples=${all.length}`);
console.log('');
console.log('--- per season, all ages ---');
console.log(`fixtures in the calendar : ${mean(all.map((s) => s.fixtures)).toFixed(1)}`);
console.log(`matches played           : ${mean(all.map((s) => s.matchesPlayed)).toFixed(1)}`);
console.log(`INJURIES                 : ${mean(all.map((s) => s.injuries)).toFixed(2)}`);
console.log(`weeks out                : ${mean(all.map((s) => s.weeksOut)).toFixed(2)}`);
console.log(`matches missed injured   : ${mean(all.map((s) => s.matchesMissedInjured)).toFixed(2)}`);
console.log(
  `seasons with 0 injuries  : ${((all.filter((s) => s.injuries === 0).length / all.length) * 100).toFixed(0)}%`,
);
console.log(
  `seasons with 3+ injuries : ${((all.filter((s) => s.injuries >= 3).length / all.length) * 100).toFixed(0)}%`,
);
console.log('');
console.log('--- by age ---');
const ages = [...new Set(all.map((s) => s.age))].sort((a, b) => a - b);
for (const age of ages) {
  const rows = all.filter((s) => s.age === age);
  if (rows.length < 5) continue;
  console.log(
    `age ${String(age).padStart(2)} : injuries ${mean(rows.map((r) => r.injuries)).toFixed(2)}` +
      ` · weeks out ${mean(rows.map((r) => r.weeksOut)).toFixed(1)}` +
      ` · played ${mean(rows.map((r) => r.matchesPlayed)).toFixed(1)}` +
      ` · missed ${mean(rows.map((r) => r.matchesMissedInjured)).toFixed(1)}` +
      ` · n=${rows.length}`,
  );
}
console.log('');
console.log('--- fitness at the final whistle ---');
console.log(
  `mean ${mean(fitnessAtEnd).toFixed(1)} · p10 ${pct(fitnessAtEnd, 0.1).toFixed(1)}` +
    ` · p50 ${pct(fitnessAtEnd, 0.5).toFixed(1)} · p90 ${pct(fitnessAtEnd, 0.9).toFixed(1)}`,
);
console.log(
  `share of matches ending below 50 fitness: ` +
    `${((fitnessAtEnd.filter((f) => f < 50).length / fitnessAtEnd.length) * 100).toFixed(0)}%`,
);
console.log('');
console.log('--- per-match injury risk actually rolled ---');
console.log(
  `mean ${(mean(perMatchRisk) * 100).toFixed(2)}% · p50 ${(pct(perMatchRisk, 0.5) * 100).toFixed(2)}%` +
    ` · p90 ${(pct(perMatchRisk, 0.9) * 100).toFixed(2)}%`,
);
console.log('');
console.log('--- fitness ENTERING the match, and risk, by stage of season ---');
for (let i = 0; i < 5; i++) {
  const starts = startByStage[i]!;
  if (starts.length === 0) continue;
  console.log(
    `matches ${i * 9 + 1}-${i * 9 + 9}`.padEnd(16) +
      `: start ${mean(starts).toFixed(1)}` +
      ` · risk ${(mean(riskByStage[i]!) * 100).toFixed(2)}%` +
      ` · n=${starts.length}`,
  );
}
console.log('');
console.log(`fitness entering a match: mean ${mean(fitnessAtStart).toFixed(1)} · p10 ${pct(fitnessAtStart, 0.1).toFixed(1)} · p90 ${pct(fitnessAtStart, 0.9).toFixed(1)}`);
console.log(`share of matches STARTED below 80 fitness: ${((fitnessAtStart.filter((f) => f < 80).length / fitnessAtStart.length) * 100).toFixed(0)}%`);
console.log('');
console.log('--- injuries per season, distribution ---');
for (const n of [0, 1, 2, 3, 4, 5]) {
  const rows = all.filter((s) => (n === 5 ? s.injuries >= 5 : s.injuries === n));
  console.log(`${n === 5 ? '5+' : n} injuries: ${((rows.length / all.length) * 100).toFixed(0)}%`);
}
console.log('');
console.log('--- traits earned per finished career ---');
const traitCounts = careerSamples.map((c) => c.traits.length);
console.log(`mean ${mean(traitCounts).toFixed(2)} · min ${Math.min(...traitCounts)} · max ${Math.max(...traitCounts)}`);
for (const id of TRAIT_IDS) {
  const held = careerSamples.filter((c) => c.traits.includes(id)).length;
  console.log(
    `${TRAITS[id].label.padEnd(18)}: ${((held / careerSamples.length) * 100).toFixed(0)}% of careers`,
  );
}
console.log('');
console.log('--- the rival, over a career ---');
console.log(
  `rivals who left: mean ${mean(rivalSummers.map((r) => r.displaced)).toFixed(2)}` +
    ` · min ${Math.min(...rivalSummers.map((r) => r.displaced))}` +
    ` · max ${Math.max(...rivalSummers.map((r) => r.displaced))}`,
);
console.log(
  `former rivals remembered: mean ${mean(rivalSummers.map((r) => r.former)).toFixed(2)}`,
);
console.log(
  `careers where nobody ever left: ` +
    `${((rivalSummers.filter((r) => r.displaced === 0).length / rivalSummers.length) * 100).toFixed(0)}%`,
);

console.log('');
console.log('--- the evidence traits are judged on ---');
const ev = (pick: (e: TraitEvidence) => number) => evidenceSamples.map(pick);
const line = (label: string, pick: (e: TraitEvidence) => number, dp = 2) => {
  const xs = ev(pick);
  console.log(
    `${label.padEnd(20)}: mean ${mean(xs).toFixed(dp)} · p10 ${pct(xs, 0.1).toFixed(dp)}` +
      ` · p50 ${pct(xs, 0.5).toFixed(dp)} · p90 ${pct(xs, 0.9).toFixed(dp)}`,
  );
};
line('appearances', (e) => e.appearances, 0);
line('assists', (e) => e.assists, 0);
line('average rating', (e) => e.averageRating, 2);
line('perfect tens', (e) => e.perfectRatings, 1);
line('nine-or-better', (e) => e.nineOrBetter, 0);
line('nines per 100 apps', (e) => (e.appearances ? (e.nineOrBetter / e.appearances) * 100 : 0), 1);
line('hat-tricks', (e) => e.hatTricks, 0);
line('hat-tricks per 100', (e) => (e.appearances ? (e.hatTricks / e.appearances) * 100 : 0), 1);
line('longest scoring run', (e) => e.longestScoringRun, 1);
line('big matches', (e) => e.bigMatches, 0);
line('big-match average', (e) => e.bigMatchAverage, 2);
line('apps per season', (e) => (e.seasons ? e.appearances / e.seasons : 0), 1);
console.log(
  `${'perfect tens'.padEnd(20)}: mean ${mean(perfectSamples).toFixed(2)} · p10 ${pct(perfectSamples, 0.1)} · p50 ${pct(perfectSamples, 0.5)} · p90 ${pct(perfectSamples, 0.9)}`,
);

console.log('');
console.log('--- career outcome (power creep watch) ---');
console.log(
  `appearances ${mean(careerSamples.map((c) => c.appearances)).toFixed(0)}` +
    ` · goals ${mean(careerSamples.map((c) => c.goals)).toFixed(0)}` +
    ` · assists ${mean(careerSamples.map((c) => c.assists)).toFixed(0)}` +
    ` · avg rating ${mean(careerSamples.map((c) => c.averageRating)).toFixed(3)}` +
    ` · score ${mean(careerSamples.map((c) => c.score)).toFixed(0)}`,
);
console.log(`moments kept per career: ${mean(careerSamples.map((c) => c.moments)).toFixed(1)}`);
console.log('');
console.log('--- severity mix ---');
const severities = all.flatMap((s) => s.severities);
for (const kind of ['knock', 'strain', 'tear', 'rupture']) {
  const n = severities.filter((s) => s === kind).length;
  console.log(`${kind.padEnd(8)}: ${n} (${((n / severities.length) * 100).toFixed(0)}%)`);
}
