/**
 * MEASURING WHETHER THE MANAGER'S DEMAND IS MEETABLE
 *
 * The season objective is a number a footballer is judged against, so the one
 * way it can be wrong is being pitched somewhere no real season lands. A demand
 * every career meets by turning up says nothing; one nobody can reach is a
 * punishment for playing.
 *
 * So this plays whole careers and reports, per season, what was ASKED against
 * what was RETURNED — and how often each verdict actually fires. The rates in
 * `POSITION_CONTRIBUTION_RATE` come from this rather than from an opinion about
 * how many goals a striker ought to score.
 *
 * WHAT IT MEASURES IS A FLOOR, NOT A TYPICAL CAREER. Every match here is played
 * by AUTO-PLAY, which is deliberately worse than a human reading the situation
 * (see AutoPlay.ts, and scripts/measureAutoPlay.ts for the gap). So a demand met
 * comfortably at this standard is one a person will meet; a demand missed here
 * may still be fair. Read the auto column as "what a skipped career returns".
 *
 * Run with:   npx vite-node scripts/measureObjectives.ts [careers] [seasons]
 */
import { TEAMS, getTeam, getGoalkeeperForTeam, bestGoalkeeperIn } from '../src/data/gameData.ts';
import type { Team } from '../src/core/team/team.ts';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
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
import { countryOfNation, nationId } from '../src/core/career/nations.ts';
import { INTERNATIONAL } from '../src/core/career/calendar.ts';

const CAREERS = Number(process.argv[2] ?? 12);
const SEASONS = Number(process.argv[3] ?? 8);

const lookup = (id: string) => getTeam(id);

function prospect(age: number, potential: number): Player {
  return createPlayer({
    name: 'Probe',
    position: 'ST',
    age,
    experience: 12,
    baseAttribute: Math.min(58, potential - 4),
    reputation: 34,
    potentialAbility: potential,
    attributes: { finishing: 66, stamina: 60, awareness: 50, composure: 48, decisionMaking: 46 },
  });
}

interface Row {
  askedApps: number;
  askedGA: number;
  gotApps: number;
  gotGA: number;
  verdict: string;
}

const rows: Row[] = [];

function playSeason(state: CareerState): void {
  let guard = 0;
  while (!seasonComplete(state) && guard++ < 200) {
    prepareNextMatch(state, lookup);
    const scheduled = nextMatch(state);
    if (!scheduled) break;

    if (state.injury || !teamSheet(state).selected) {
      missMatch(state, lookup);
      continue;
    }

    // `careerTeams` rather than the bare lookup: an international fixture's
    // "club" is a nation, which the team data file has never heard of.
    const clubs = careerTeams(state, getTeam);
    const international = scheduled.competition === INTERNATIONAL;
    const playerTeam = clubs(international ? nationId(state.player.nationality) : state.clubId);
    const opponent = clubs(scheduled.opponentId);
    const keeperFor = (team: Team) => {
      const country = countryOfNation(team.id);
      return country ? bestGoalkeeperIn(country) : getGoalkeeperForTeam(team.id);
    };

    state.player.fitness = state.fitness;
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

    recordPlayerMatch(
      state,
      {
        stats: engine.state.stats,
        rating: engine.rating(),
        playerTeamScore: engine.state.playerTeamScore,
        opponentScore: engine.state.opponentScore,
        fitnessAtEnd: engine.matchPlayer.fitness,
      },
      lookup,
    );
  }
}

for (let c = 0; c < CAREERS; c++) {
  const state = startCareer({
    player: prospect(18, 78 + (c % 3) * 6),
    clubId: 'northport-city',
    teams: TEAMS,
    seed: `obj${c}`,
  });

  for (let s = 0; s < SEASONS; s++) {
    const asked = state.objective;
    playSeason(state);
    const got = { apps: state.seasonStats.matches, ga: state.seasonStats.goals + state.seasonStats.assists };
    const summer = endSeason(state, lookup);
    if (asked) {
      rows.push({
        askedApps: asked.appearances,
        askedGA: asked.contributions,
        gotApps: got.apps,
        gotGA: got.ga,
        verdict: summer.objective.verdict,
      });
    }
    const best = state.offers[0];
    if (best) acceptOffer(state, best.id, lookup);
    else if (canStay(state)) stayAtClub(state);
    else break;
  }
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const share = (verdict: string) =>
  ((rows.filter((r) => r.verdict === verdict).length / rows.length) * 100).toFixed(1);

console.log(`${rows.length} judged seasons, auto-played (a floor, not a typical career).\n`);
console.log(`appearances   asked ${mean(rows.map((r) => r.askedApps)).toFixed(1)}   got ${mean(rows.map((r) => r.gotApps)).toFixed(1)}`);
console.log(`goals+assists asked ${mean(rows.map((r) => r.askedGA)).toFixed(1)}   got ${mean(rows.map((r) => r.gotGA)).toFixed(1)}`);
console.log('\nverdicts');
for (const verdict of ['exceeded', 'met', 'missed', 'unjudged']) {
  console.log(`  ${verdict.padEnd(10)} ${share(verdict)}%`);
}
