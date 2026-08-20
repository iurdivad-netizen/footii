import type { Player } from '../../core/player/player.ts';
import { positionLabel } from '../../core/player/positions.ts';
import type { Team } from '../../core/team/team.ts';
import { TACTICAL_STYLE_LABELS } from '../../core/team/team.ts';
import type { TransferOffer } from '../../core/career/transfers.ts';
import {
  SQUAD_ROLE_LABELS,
  marketValue,
  positionalNeed,
  reputationRequired,
  squadLevel,
  tacticalFit,
} from '../../core/career/transfers.ts';
import type { ContractOffer } from '../../core/career/contracts.ts';
import { reputationTier } from '../../core/career/reputation.ts';
import { getCountry, leagueName } from '../../core/career/countries.ts';
import { europeanNameInProse } from '../../core/career/europe.ts';
import type { EuropeanTier } from '../../core/career/europe.ts';
import { NEGOTIATION_LABELS, canAsk } from '../../core/career/negotiation.ts';
import type { NegotiationAsk, Negotiable } from '../../core/career/negotiation.ts';

/**
 * THE TRANSFER WINDOW
 *
 * Shown in the summer, and only when there is a decision to make. Every offer
 * is a real decision with real consequences, so the screen shows the things
 * that will change if you take it rather than a fee and a badge:
 *
 *   - the COUNTRY and league you would be playing in, which is the biggest
 *     single lever on your career: the level of football, the money, and how
 *     many people are watching you play it
 *   - the level of the squad you would join, which sets the quality of the
 *     chances the engine hands you and the coaching that develops you
 *   - how they play, which decides WHICH situations you get
 *   - how badly they need your position, and what they will pay you
 *
 * Staying is a first-class choice, not a cancel button: a bigger club that
 * plays nothing like you can be the wrong move, and the screen has to make that
 * arguable rather than obvious. When your contract has run out, staying is
 * itself a DEAL — your club's renewal, with its own terms — and if they have
 * not offered one, staying is not on the table at all. That is the moment the
 * contract model exists for.
 */

export interface TransferScreenContext {
  /** Country the player is in next season if he stays. */
  currentCountryId: string;
  /** Country of each bidding club. */
  countryOf: (clubId: string) => string;
  /** Prestige of a club's league, for what it expects of a signing. */
  prestigeOf: (clubId: string) => number;
  /** Terms his own club has put up, if any. */
  renewal: ContractOffer | null;
  /** True when the old deal has run out. */
  outOfContract: boolean;
  /** Whether staying is possible at all. */
  canStay: boolean;
  /**
   * Whether his club's renewal can be pushed.
   *
   * False when it is the only thing on the table — a player out of contract
   * with no other bids has no leverage, and letting him haggle would let him
   * talk himself into a summer with nothing to sign.
   */
  canNegotiateRenewal: boolean;
  /** Resolve a club id to the club as the career currently knows it. */
  club: (id: string) => Team;
  /**
   * The European competition a club has qualified for NEXT season, if any.
   *
   * A European place belongs to the club, not to the player: signing for a
   * club that qualified is one of the strongest reasons to move, and turning
   * one down to join a bigger club that finished eighth is a real decision.
   * Neither was possible to make while the card said nothing about it.
   */
  europeanTierOf: (clubId: string) => EuropeanTier | null;
}

export class TransferScreen {
  readonly element: HTMLElement;

  constructor(
    player: Player,
    currentClub: Team,
    offers: readonly TransferOffer[],
    context: TransferScreenContext,
    handlers: {
      onAccept: (offerId: string) => void;
      onStay: () => void;
      /**
       * Push a deal on one thing. `offerId` is null for the club's own
       * renewal, which has no id because there is only ever one of them.
       */
      onNegotiate?: (offerId: string | null, ask: NegotiationAsk) => void;
    },
    /** What the last ask produced, so the screen can report it. */
    negotiation?: { offerId: string | null; outcome: string; message: string },
  ) {
    const tier = reputationTier(player.reputation);
    const country = getCountry(context.currentCountryId);

    this.element = document.createElement('section');
    this.element.className = 'screen transfer-screen';
    this.element.innerHTML = `
      <header class="creator-header">
        <h1>The transfer window</h1>
        <p class="hint">${headline(offers.length, context)}</p>
      </header>

      <div class="transfer-standing">
        <div class="progress-stat">
          <span class="progress-value">£${marketValue(player)}m</span>
          <span class="progress-label">Market value</span>
        </div>
        <div class="progress-stat">
          <span class="progress-value">${Math.round(player.reputation)}</span>
          <span class="progress-label">Reputation — ${tier.label}</span>
        </div>
        <div class="progress-stat">
          <span class="progress-value">${currentClub.shortName}</span>
          <span class="progress-label">${positionLabel(player.position)} · ${country.short}</span>
        </div>
      </div>

      <div class="offer-grid">
        ${offers
          .map((offer) => offerCard(player, currentClub, offer, context, negotiation))
          .join('')}
      </div>

      ${stayCard(currentClub, context, negotiation)}`;

    this.element
      .querySelector<HTMLButtonElement>('#stay-put')
      ?.addEventListener('click', handlers.onStay);
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button[data-offer]')) {
      button.addEventListener('click', () => handlers.onAccept(button.dataset.offer!));
    }
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button[data-ask]')) {
      button.addEventListener('click', () =>
        handlers.onNegotiate?.(
          button.dataset.deal === 'renewal' ? null : button.dataset.deal!,
          button.dataset.ask as NegotiationAsk,
        ),
      );
    }
  }
}

function headline(count: number, context: TransferScreenContext): string {
  if (count === 0) {
    return `Nobody has bid for you this summer. ${
      context.canStay
        ? 'Your club have put new terms in front of you.'
        : 'Your contract has run out.'
    }`;
  }
  const who = count === 1 ? 'One club has' : `${count} clubs have`;
  const free = context.outOfContract
    ? ' You are out of contract, so you would cost them nothing but wages.'
    : '';
  return `${who} made an offer for you.${free} Where you play decides the chances you get, the
    coaching you receive and who watches you next season.`;
}

/**
 * Staying, as a deal rather than a refusal.
 *
 * Three different things can be true here, and the card has to say which:
 * you are under contract and simply staying; your deal ran out and the club
 * want to renew it on stated terms; or your deal ran out and they do not, in
 * which case there is nothing to stay on and the button is gone.
 */
function stayCard(
  club: Team,
  context: TransferScreenContext,
  negotiation?: { offerId: string | null; outcome: string; message: string },
): string {
  const europe = europeanLine(context.europeanTierOf(club.id));
  if (!context.canStay) {
    return `
      <div class="career-card stay-card unavailable">
        <h2>You are out of contract</h2>
        <p class="hint">
          ${club.name} have not offered you new terms, so staying is not one of your options.
          You have to take one of the offers above.
        </p>
      </div>`;
  }

  const renewal = context.renewal;
  if (!renewal) {
    return `
      <div class="career-card stay-card">
        <h2>Stay at ${club.name}</h2>
        <p class="hint">
          Turn everything down and see out your contract. Offers are made on the season you just
          had, so another one like it brings the clubs back — a better one brings better clubs.
        </p>
        ${europe}
        <button class="primary" id="stay-put">Stay at ${club.name}</button>
      </div>`;
  }

  return `
    <div class="career-card stay-card">
      <h2>New terms at ${club.name}</h2>
      <p class="hint">
        Your contract has run out and ${club.name} want to keep you. Signing this is the same
        club, the same league and a new deal.
      </p>
      ${europe}
      <dl class="stat-list">
        <div><dt>Wages</dt><dd>£${renewal.wage}k / week</dd></div>
        <div><dt>Length</dt><dd>${describeYears(renewal.years)}</dd></div>
        <div><dt>Your role</dt><dd>${SQUAD_ROLE_LABELS[renewal.role]}</dd></div>
      </dl>
      ${renewal.notes.length ? `<ul class="offer-notes">${renewal.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${
        context.canNegotiateRenewal
          ? negotiationRow(renewal, 'renewal', negotiation)
          : `<p class="hint">
               It is the only deal in front of you, so there is nothing to push with. Another
               season like the last one and there will be.
             </p>`
      }
      <button class="primary" id="stay-put">Sign a new ${describeYears(renewal.years)} deal</button>
    </div>`;
}

/** One club's pitch, framed against the club the player is leaving. */
function offerCard(
  player: Player,
  currentClub: Team,
  offer: TransferOffer,
  context: TransferScreenContext,
  negotiation?: { offerId: string | null; outcome: string; message: string },
): string {
  const club = context.club(offer.clubId);
  const level = squadLevel(club);
  const step = level - squadLevel(currentClub);
  const fit = tacticalFit(player, club);
  const need = positionalNeed(club, player.position);
  const prestige = context.prestigeOf(offer.clubId);

  const country = getCountry(context.countryOf(offer.clubId));
  const home = getCountry(context.currentCountryId);
  const abroad = country.id !== home.id;
  // Prestige, not squad level, decides whether a foreign league is a step up:
  // the best club in a small country can have the stronger squad and still be
  // the smaller move, because far fewer people are watching it.
  const leagueStep = country.prestige - home.prestige;

  // The league change is the headline when it crosses a border, because it
  // outranks everything else on the card. Squad level decides the label only
  // when both clubs play in the same league.
  const stepLabel = abroad
    ? leagueStep > 0.06
      ? `Step up to ${country.name}`
      : leagueStep < -0.06
        ? `Drop down to ${country.name}`
        : `Move to ${country.name}`
    : step >= 6
      ? 'Step up'
      : step <= -6
        ? 'Step down'
        : 'Sideways move';
  const stepClass = (abroad ? leagueStep > 0.06 : step >= 6) ? 'up' : '';
  const downClass = (abroad ? leagueStep < -0.06 : step <= -6) ? 'down' : '';

  return `
    <div class="career-card offer-card" style="border-left: 4px solid ${club.colour}">
      <div class="offer-head">
        <h2>${club.name}</h2>
        <span class="offer-step ${stepClass}${downClass}">${stepLabel}</span>
      </div>
      <p class="hint">
        ${leagueName(country.id)} · ${TACTICAL_STYLE_LABELS[club.style]} · squad level ${level} ·
        expects ${withArticle(reputationTier(reputationRequired(club, prestige)).label.toLowerCase())} player
      </p>
      ${europeanLine(context.europeanTierOf(offer.clubId))}

      <dl class="stat-list">
        <div><dt>Fee</dt><dd>${offer.free ? 'Free transfer' : `£${offer.fee}m`}</dd></div>
        <div><dt>Wages</dt><dd>£${offer.wage}k / week</dd></div>
        <div><dt>Length</dt><dd>${describeYears(offer.years)}</dd></div>
        <div><dt>Your role</dt><dd>${SQUAD_ROLE_LABELS[offer.role]}</dd></div>
        <div><dt>Suits your game</dt><dd>${describeFit(fit)}</dd></div>
        <div><dt>Need in your position</dt><dd>${describeNeed(need)}</dd></div>
      </dl>

      ${offer.notes.length ? `<ul class="offer-notes">${offer.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}

      ${negotiationRow(offer, offer.id, negotiation)}

      ${
        offer.withdrawn
          ? ''
          : `<button class="primary" data-offer="${offer.id}">Join ${club.shortName}</button>`
      }
    </div>`;
}

/**
 * What he can say back.
 *
 * Three asks, one of which he may make. Rendered as buttons that disappear once
 * spent rather than as disabled ones, because a spent negotiation is over: the
 * club has answered, and a greyed-out row of things you can no longer do is
 * just clutter on a card you are about to make a decision on.
 */
function negotiationRow(
  deal: Negotiable,
  dealId: string,
  negotiation?: { offerId: string | null; outcome: string; message: string },
): string {
  const answer =
    negotiation && (negotiation.offerId ?? 'renewal') === dealId
      ? `<p class="negotiation-answer ${negotiation.outcome}">${negotiation.message}</p>`
      : '';

  if (deal.withdrawn) {
    return `${answer}<p class="negotiation-gone">This offer is gone.</p>`;
  }
  if (deal.negotiated) return answer;

  const asks = (Object.keys(NEGOTIATION_LABELS) as NegotiationAsk[])
    .filter((ask) => canAsk(deal, ask))
    .map(
      (ask) =>
        `<button class="ghost small" data-ask="${ask}" data-deal="${dealId}">
           ${NEGOTIATION_LABELS[ask]}
         </button>`,
    )
    .join('');

  if (!asks) return answer;
  return `${answer}
    <div class="negotiation">
      <p class="hint">
        You can push them on one thing, once. A club that only half wants you may walk away.
      </p>
      <div class="negotiation-asks">${asks}</div>
    </div>`;
}

/**
 * The European football a move comes with, said plainly.
 *
 * Its own line rather than another clause in the hint, because it is the one
 * thing on the card that is not a property of the club's size: an eighth-placed
 * club that won the cup is in Europe and a second-placed one may not be.
 */
function europeanLine(tier: EuropeanTier | null): string {
  if (!tier) return '';
  return `<p class="offer-europe">In ${europeanNameInProse(tier)} next season</p>`;
}

function describeYears(years: number): string {
  return years === 1 ? '1 season' : `${years} seasons`;
}

/** "an established", "a well known" — the tier labels start with both. */
function withArticle(label: string): string {
  return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`;
}

/** Model numbers as something a footballer would actually be told. */
function describeFit(value: number): string {
  if (value >= 0.75) return 'Perfectly';
  if (value >= 0.6) return 'Well';
  if (value >= 0.4) return 'Reasonably';
  if (value >= 0.25) return 'Not really';
  return 'Poorly';
}

function describeNeed(value: number): string {
  if (value >= 0.8) return 'Desperate';
  if (value >= 0.6) return 'Strong';
  if (value >= 0.4) return 'Some';
  if (value >= 0.2) return 'Little';
  return 'Well covered already';
}
