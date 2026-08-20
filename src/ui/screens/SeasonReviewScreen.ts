import type { SeasonRecord } from '../../core/career/career.ts';
import type { SeasonProgress } from '../../core/career/training.ts';
import { averageRating, goalContributions } from '../../core/career/seasonStats.ts';
import type { ReputationSettlement } from '../../core/career/reputation.ts';
import { reputationTier } from '../../core/career/reputation.ts';
import type { Honour } from '../../core/career/awards.ts';
import type { DivisionMovement } from '../../core/career/divisions.ts';
import { confederationOf, getCountry, leagueName } from '../../core/career/countries.ts';
import type { CupKind, CupState } from '../../core/career/cups.ts';
import { CUP_KINDS, cupName, roundName, totalRounds } from '../../core/career/cups.ts';
import type { EuropeanState, EuropeanTier } from '../../core/career/europe.ts';
import { europeanCompetition, europeanNameInProse } from '../../core/career/europe.ts';
import type { InternationalState } from '../../core/career/international.ts';
import { KNOCKOUT_ROUNDS, tournamentName } from '../../core/career/international.ts';
import { countryOfNation, nationId } from '../../core/career/nations.ts';
import { getTeam } from '../../data/gameData.ts';

/** End-of-season summary, shown once the final fixture has been played. */
export class SeasonReviewScreen {
  readonly element: HTMLElement;

  constructor(
    record: SeasonRecord,
    context: {
      champion: string;
      leagueSize: number;
      newAge: number;
      potentialHint: string;
      progress: SeasonProgress;
      /** The season before this one, for a like-for-like comparison. */
      previous?: SeasonRecord;
      trainingPoints: number;
      /** How the season moved the player's standing in the game. */
      reputation: ReputationSettlement;
      /** Number of clubs that have made an offer for the summer. */
      offers: number;
      /** The division the season was played in. */
      division: number;
      /** The division the club plays in next season. */
      nextDivision: number;
      /** The country the season was played in. */
      countryId: string;
      /** The country the player plays in next season. */
      nextCountryId: string;
      /** Whether the club went up, went down, or stayed put. */
      movement: DivisionMovement | null;
      /** Anything the season put on the honours list. */
      honours: readonly Honour[];
      /** International caps won this season. */
      capsGained: number;
      /** Wages banked for the season, in millions. */
      earnings: number;
      /** True when the old deal ran out this summer. */
      outOfContract: boolean;
      /** True when nobody wanted him and his club put up a reduced deal. */
      fellBackOnClub: boolean;
      /** Both knockouts as they finished. */
      cups: Record<CupKind, CupState>;
      /** The European competition played this season, as it finished. */
      europe: EuropeanState | null;
      /** The competition the club has qualified for NEXT season, if any. */
      nextEuropeanTier: EuropeanTier | null;
      /** The international season, as it finished. */
      international: InternationalState;
      /** International matches he played in it. Zero when he was not picked. */
      caps: number;
      /**
       * Champions League places his LEAGUE had this season, and has next.
       *
       * They differ when the tournament just played moved his country in the
       * European order. It is the one outcome of an international summer that
       * changes club football, and without saying so the allocation would
       * simply be different one September with nothing to explain it.
       */
      placesBefore: number;
      placesAfter: number;
      /** The player's own nationality, which is who he plays FOR. */
      nationality: string;
      /**
       * True when the summer opens a window even with no offers, because his
       * contract needs resolving. The continue button reads this so it never
       * promises the next season and then shows the transfer window.
       */
      contractDecision: boolean;
    },
    onContinue: () => void,
  ) {
    const stats = record.stats;
    const club = getTeam(record.clubId);
    const champion = getTeam(context.champion);
    const won = context.champion === record.clubId;
    const country = getCountry(context.countryId);

    this.element = document.createElement('section');
    this.element.className = 'screen fulltime-screen';
    this.element.innerHTML = `
      <h1>Season ${record.seasonNumber} review</h1>
      <p class="ft-score">
        ${club.name} finished <strong>${ordinal(record.position)}</strong> of ${context.leagueSize}
        in ${leagueName(country.id)}
        ${won ? '<span class="verdict win">Champions</span>' : ''}
      </p>
      ${won ? '' : `<p class="hint">${champion.name} won ${leagueName(country.id)}.</p>`}
      ${renderMovement(context.movement, context.nextCountryId)}

      <div class="ft-rating">
        <span class="ft-rating-value">${stats.matches ? averageRating(stats).toFixed(2) : '—'}</span>
        <span class="ft-rating-label">Average rating</span>
      </div>

      <div class="ft-columns">
        <div>
          <h2>Your season</h2>
          <dl class="stat-list">
            <div><dt>Appearances</dt><dd>${stats.matches}</dd></div>
            <div><dt>Goals</dt><dd>${stats.goals}</dd></div>
            <div><dt>Assists</dt><dd>${stats.assists}</dd></div>
            <div><dt>Goal contributions</dt><dd>${goalContributions(stats)}</dd></div>
            <div><dt>Key passes</dt><dd>${stats.keyPasses}</dd></div>
            <div><dt>Shots (on target)</dt><dd>${stats.shots} (${stats.shotsOnTarget})</dd></div>
            <div><dt>Best rating</dt><dd>${stats.bestRating ? stats.bestRating.toFixed(1) : '—'}</dd></div>
            <div><dt>Big chances missed</dt><dd>${stats.bigChancesMissed}</dd></div>
          </dl>
        </div>
        <div>
          <h2>Club record</h2>
          <dl class="stat-list">
            <div><dt>Won</dt><dd>${stats.wins}</dd></div>
            <div><dt>Drawn</dt><dd>${stats.draws}</dd></div>
            <div><dt>Lost</dt><dd>${stats.defeats}</dd></div>
            <div><dt>Tackles / int.</dt><dd>${stats.tackles} / ${stats.interceptions}</dd></div>
            <div><dt>Dribbles</dt><dd>${stats.dribbles}/${stats.dribblesAttempted}</dd></div>
            <div><dt>Age next season</dt><dd>${context.newAge}</dd></div>
          </dl>
          <p class="hint">${context.potentialHint}</p>
        </div>
      </div>

      ${renderEurope(context.europe, record.clubId, context.nextEuropeanTier)}
      ${renderInternational(context.international, context.nationality, context.caps, {
        countryId: context.nextCountryId,
        before: context.placesBefore,
        after: context.placesAfter,
      })}
      ${renderCupRuns(context.cups, record.clubId, context.countryId)}
      ${renderHonours(context.honours, context.capsGained)}
      ${renderProgress(context.progress)}
      ${renderReputation(context.reputation)}
      ${renderContractNews(context)}
      ${renderComparison(record, context.previous)}

      <button class="primary" id="continue-career">
        ${continueLabel(context, record.seasonNumber)}
      </button>`;

    this.element
      .querySelector<HTMLButtonElement>('#continue-career')!
      .addEventListener('click', onContinue);
  }
}

/**
 * Promotion and relegation, given the weight they deserve.
 *
 * This is the one thing on the screen the player did not choose and cannot
 * undo, and it changes more about next season than any transfer will: the level
 * of football, the money, and who is watching. It goes directly under the
 * finishing position rather than into a panel further down.
 */
function renderMovement(movement: DivisionMovement | null, nextCountryId: string): string {
  if (!movement) return '';
  const arriving = getCountry(nextCountryId);
  if (movement === 'promoted') {
    return `<p class="division-move up">
        <strong>Promoted.</strong> You will be playing in ${leagueName(arriving.id)} next season.
      </p>`;
  }
  return `<p class="division-move down">
      <strong>Relegated.</strong> Your club drops into ${leagueName(arriving.id)} next season — a smaller
      stage, smaller wages and fewer people watching you play.
    </p>`;
}

/**
 * The European season, and next season's place.
 *
 * The qualification line is the important half. A club that has just finished
 * fourth needs telling, in the moment, that it has earned a season of European
 * football — that is the payoff for a league position that wins nothing.
 */
function renderEurope(
  europe: EuropeanState | null,
  clubId: string,
  nextTier: EuropeanTier | null,
): string {
  // Named as the CLUB's achievement, because that is whose it is. A European
  // place belongs to the club that earned it: leave in the window that opens
  // on the next screen and it stays behind, and sign for a club that qualified
  // and you inherit theirs. "You are in the Champions League next season" was a
  // promise the very next screen could quietly take away.
  const qualified = nextTier
    ? `<p class="division-move up">
         <strong>Qualified.</strong> ${getTeam(clubId).name} are in
         ${europeanNameInProse(nextTier)} next season — stay, and so are you.
       </p>`
    : '';

  if (!europe) {
    return qualified
      ? `<div class="career-card"><h2>Europe</h2>${qualified}</div>`
      : '';
  }

  const competition = europeanCompetition(europe.kind);
  const rounds = totalRounds(europe);
  const won = europe.winnerId === clubId;
  const out = europe.eliminatedInRound;
  const line = won
    ? '<strong>Champions of Europe.</strong>'
    : out !== null
      ? `Knocked out in the ${roundName(out, rounds).toLowerCase()}.`
      : 'Did not take part.';
  const winner = !won && europe.winnerId ? ` Won by ${getTeam(europe.winnerId).name}.` : '';

  // Headed "Europe" with the competition named in the row, matching the cups
  // card — the card said its own name twice otherwise.
  return `
    <div class="career-card">
      <h2>Europe</h2>
      <ul class="honours-won">
        <li class="${won ? 'up' : ''}">
          <strong>${competition.name}</strong>
          <span>${line}${winner}</span>
        </li>
      </ul>
      ${qualified}
    </div>`;
}

/**
 * The international summer.
 *
 * Shown whether or not he was in it, and the difference is the whole card: a
 * tournament your country won while you watched it is a different sentence to
 * one you won, and a season with no call-up should say so rather than quietly
 * omitting the competition.
 */
function renderInternational(
  international: InternationalState,
  nationality: string,
  caps: number,
  places: { countryId: string; before: number; after: number },
): string {
  const knockout = international.knockout;
  if (!knockout?.winnerId) return '';

  const me = nationId(nationality);
  const nation = getCountry(nationality);
  const competition = tournamentName(
    international.kind ?? 'continental',
    confederationOf(nationality),
  );
  const champion = getCountry(countryOfNation(knockout.winnerId) ?? '');
  const wonIt = knockout.winnerId === me;
  const out = knockout.eliminatedInRound;

  let line: string;
  if (caps === 0) {
    // He was not picked. The tournament happened anyway — that is the point.
    line = wonIt
      ? `${nation.name} won it without you.`
      : `${champion.name} won it. You were not called up.`;
  } else if (wonIt) {
    line = `<strong>Champions with ${nation.name}.</strong>`;
  } else if (out !== null) {
    line = `Out in the ${roundName(out, international.knockoutRounds ?? KNOCKOUT_ROUNDS).toLowerCase()}. ${champion.name} won it.`;
  } else {
    line = `Out at the group stage. ${champion.name} won it.`;
  }

  return `
    <div class="career-card">
      <h2>${competition}</h2>
      <ul class="honours-won">
        <li class="${wonIt && caps > 0 ? 'up' : ''}">
          <strong>${nation.name}</strong>
          <span>${line}</span>
        </li>
      </ul>
      ${caps > 0 ? `<p class="hint">${caps} ${caps === 1 ? 'cap' : 'caps'} this season.</p>` : ''}
      ${renderPlacesChange(places)}
    </div>`;
}

/**
 * When the summer's football has changed what your league is worth.
 *
 * Reported on the international card rather than the European one because this
 * is where it was decided: national sides moved their countries up and down the
 * order, and one of those countries is the one you play in.
 */
export function renderPlacesChange(places: {
  countryId: string;
  before: number;
  after: number;
}): string {
  if (places.before === places.after) return '';
  const country = getCountry(places.countryId);
  const gained = places.after > places.before;
  const count = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`;
  return `<p class="division-move ${gained ? 'up' : 'down'}">
      <strong>${gained ? 'A place gained.' : 'A place lost.'}</strong>
      ${country.name} ${gained ? 'climbs' : 'slips'} in the European order and now has
      ${count(places.after)} in the Champions League rather than ${count(places.before)}.
    </p>`;
}

/**
 * How the two cup runs ended.
 *
 * Reported whether or not anything was won, because a knockout is the one
 * competition where "how far did we get" is a real answer — going out in a
 * semi-final is a season, and a league table cannot say that.
 */
function renderCupRuns(
  cups: Record<CupKind, CupState> | undefined,
  clubId: string,
  countryId: string,
): string {
  if (!cups) return '';

  const rows = CUP_KINDS.map((kind) => {
    const cup = cups[kind];
    if (!cup) return '';
    const rounds = totalRounds(cup);
    const won = cup.winnerId === clubId;
    const out = cup.eliminatedInRound;

    const line = won
      ? '<strong>Winners.</strong>'
      : out !== null
        ? `Knocked out in the ${roundName(out, rounds).toLowerCase()}.`
        : 'Did not take part.';
    const winner =
      !won && cup.winnerId ? ` Won by ${getTeam(cup.winnerId).name}.` : '';

    return `<li class="${won ? 'up' : ''}">
        <strong>${cupName(kind, countryId)}</strong>
        <span>${line}${winner}</span>
      </li>`;
  }).join('');

  return `
    <div class="career-card">
      <h2>The cups</h2>
      <ul class="honours-won">${rows}</ul>
    </div>`;
}

/**
 * What the season put on the record.
 *
 * Honours are the only thing in a career that a later season cannot take away,
 * so they are announced rather than tabulated — the hub keeps the running list.
 */
function renderHonours(honours: readonly Honour[], capsGained: number): string {
  if (honours.length === 0 && capsGained === 0) return '';

  const items = honours
    .map(
      (honour) =>
        `<li class="honour honour-${honour.kind}">
          <strong>${honour.label}</strong>
          <span>${honour.detail}</span>
        </li>`,
    )
    .join('');

  const caps =
    capsGained > 0
      ? `<p class="hint">${capsGained} international ${capsGained === 1 ? 'cap' : 'caps'} this season.</p>`
      : '';

  return `
    <div class="career-card honours-panel">
      <h2>Honours</h2>
      ${items ? `<ul class="honours-won">${items}</ul>` : ''}
      ${caps}
    </div>`;
}

/**
 * The money and the contract clock.
 *
 * Wages are only interesting when they are about to matter, so this leads with
 * the expiry rather than the earnings: a player being told his deal has run out
 * needs that before he is told what he banked.
 */
function renderContractNews(context: {
  earnings: number;
  outOfContract: boolean;
  fellBackOnClub: boolean;
  offers: number;
}): string {
  const lines: string[] = [];
  if (context.fellBackOnClub) {
    lines.push(
      `Your contract expired and nobody — including your own club — offered you terms worth the
       name. They have put up a reduced one-year deal rather than leave you without a season to
       play. Next year you have to earn a better one.`,
    );
  } else if (context.outOfContract) {
    lines.push(
      `Your contract has run out. You can leave for nothing this summer, which makes you a great
       deal cheaper than your market value — expect clubs that could not afford a fee for you to
       come forward.`,
    );
  }

  if (lines.length === 0 && context.earnings <= 0) return '';

  return `
    <div class="career-card">
      <h2>Wages</h2>
      <dl class="stat-list">
        <div><dt>Earned this season</dt><dd>£${context.earnings}m</dd></div>
      </dl>
      ${lines.map((line) => `<p class="hint">${line}</p>`).join('')}
    </div>`;
}

/** What the next screen will be, so the button never lies about where it goes. */
function continueLabel(
  context: { offers: number; trainingPoints: number; contractDecision: boolean },
  seasonNumber: number,
): string {
  if (context.offers > 0) {
    return context.offers === 1 ? 'You have an offer' : `You have ${context.offers} offers`;
  }
  // No bids, but the window still opens: his deal is up and has to be settled.
  if (context.contractDecision) return 'Your contract is up';
  if (context.trainingPoints > 0) return `Pre-season training — ${context.trainingPoints} points`;
  return `Start season ${seasonNumber + 1}`;
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}

/**
 * How the player changed across the season.
 *
 * The decision window is listed first and deliberately given the most weight:
 * ability is an abstraction, but "you now get half a second longer on the ball"
 * is the thing you actually experience in the next match.
 */
function renderProgress(progress: SeasonProgress): string {
  const windowDelta = progress.windowAfter - progress.windowBefore;
  const abilityDelta = progress.abilityAfter - progress.abilityBefore;
  const experienceDelta = Math.round(progress.experienceAfter - progress.experienceBefore);

  const changes = progress.changes
    .map((c) => {
      const delta = c.to - c.from;
      return `<li class="${delta > 0 ? 'up' : 'down'}">
          ${c.label} ${c.from} → <strong>${c.to}</strong>
          <span class="delta">${delta > 0 ? '+' : ''}${delta}</span>
        </li>`;
    })
    .join('');

  return `
    <div class="progress-panel">
      <h2>How you developed</h2>
      <div class="progress-headline">
        <div class="progress-stat ${windowDelta > 0 ? 'good' : windowDelta < 0 ? 'bad' : ''}">
          <span class="progress-value">${progress.windowBefore.toFixed(2)}s → ${progress.windowAfter.toFixed(2)}s</span>
          <span class="progress-label">Decision window in a standard one-on-one</span>
        </div>
        <div class="progress-stat ${abilityDelta > 0 ? 'good' : abilityDelta < 0 ? 'bad' : ''}">
          <span class="progress-value">${progress.abilityBefore} → ${progress.abilityAfter}</span>
          <span class="progress-label">Overall ability</span>
        </div>
        <div class="progress-stat">
          <span class="progress-value">+${experienceDelta}</span>
          <span class="progress-label">Experience</span>
        </div>
      </div>
      ${
        changes
          ? `<ul class="progress-changes">${changes}</ul>`
          : '<p class="hint">No attribute changes this season.</p>'
      }
    </div>`;
}

/**
 * What the season did to the player's standing in the game.
 *
 * Shown separately from ability because the two genuinely diverge: a good
 * footballer at a club that finishes bottom every year slides out of view, and
 * the screen has to say so before the empty transfer window does.
 */
function renderReputation(settlement: ReputationSettlement): string {
  const tier = reputationTier(settlement.after);
  const direction = settlement.delta > 0.5 ? 'good' : settlement.delta < -0.5 ? 'bad' : '';
  const sign = settlement.delta > 0 ? '+' : '';

  return `
    <div class="career-card reputation-panel">
      <h2>Your standing in the game</h2>
      <div class="progress-headline">
        <div class="progress-stat ${direction}">
          <span class="progress-value">${settlement.before} → ${settlement.after}</span>
          <span class="progress-label">Reputation (${sign}${settlement.delta})</span>
        </div>
        <div class="progress-stat">
          <span class="progress-value">${tier.label}</span>
          <span class="progress-label">${tier.description}</span>
        </div>
      </div>
      <ul class="training-notes">${settlement.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    </div>`;
}

/** Season-on-season comparison, once there is something to compare against. */
function renderComparison(record: SeasonRecord, previous?: SeasonRecord): string {
  if (!previous) return '';
  const rows: [string, number, number][] = [
    ['Appearances', previous.stats.matches, record.stats.matches],
    ['Goals', previous.stats.goals, record.stats.goals],
    ['Assists', previous.stats.assists, record.stats.assists],
    ['Key passes', previous.stats.keyPasses, record.stats.keyPasses],
    ['Average rating', averageRating(previous.stats), averageRating(record.stats)],
    ['League position', previous.position, record.position],
  ];

  return `
    <div class="career-card">
      <h2>Compared with season ${previous.seasonNumber}</h2>
      <table class="league-table">
        <thead><tr><th></th><th>S${previous.seasonNumber}</th><th>S${record.seasonNumber}</th><th></th></tr></thead>
        <tbody>
          ${rows
            .map(([label, before, after]) => {
              // For league position, lower is better.
              const improved = label === 'League position' ? after < before : after > before;
              const worse = label === 'League position' ? after > before : after < before;
              const arrow = improved ? '▲' : worse ? '▼' : '–';
              return `<tr>
                  <td>${label}</td>
                  <td>${before}</td>
                  <td><strong>${after}</strong></td>
                  <td class="${improved ? 'trend-up' : worse ? 'trend-down' : ''}">${arrow}</td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}
