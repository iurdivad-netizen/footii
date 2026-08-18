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
import { reputationTier } from '../../core/career/reputation.ts';
import { getTeam } from '../../data/gameData.ts';

/**
 * THE TRANSFER WINDOW
 *
 * Shown in the summer, and only when somebody actually wants you. Every offer
 * is a real decision with real consequences, so the screen shows the things
 * that will change if you take it rather than a fee and a badge:
 *
 *   - the level of the squad you would join, which sets the quality of the
 *     chances the engine hands you and the coaching that develops you
 *   - how they play, which decides WHICH situations you get
 *   - how badly they need your position
 *   - where they would see you in the side
 *
 * Staying is a first-class choice, not a cancel button: a bigger club that
 * plays nothing like you can be the wrong move, and the screen has to make that
 * arguable rather than obvious.
 */
export class TransferScreen {
  readonly element: HTMLElement;

  constructor(
    player: Player,
    currentClub: Team,
    offers: readonly TransferOffer[],
    handlers: { onAccept: (offerId: string) => void; onStay: () => void },
  ) {
    const tier = reputationTier(player.reputation);

    this.element = document.createElement('section');
    this.element.className = 'screen transfer-screen';
    this.element.innerHTML = `
      <header class="creator-header">
        <h1>The transfer window</h1>
        <p class="hint">
          ${offers.length === 1 ? 'One club has' : `${offers.length} clubs have`} made an offer for
          you. Where you play decides the chances you get, the coaching you receive and who
          watches you next season.
        </p>
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
          <span class="progress-label">${positionLabel(player.position)} at ${currentClub.name}</span>
        </div>
      </div>

      <div class="offer-grid">
        ${offers.map((offer) => offerCard(player, currentClub, offer)).join('')}
      </div>

      <div class="career-card stay-card">
        <h2>Stay at ${currentClub.name}</h2>
        <p class="hint">
          Turn everything down. Offers are made on the season you just had, so another one like it
          brings the clubs back — a better one brings better clubs.
        </p>
        <button class="primary" id="stay-put">Stay at ${currentClub.name}</button>
      </div>`;

    this.element.querySelector<HTMLButtonElement>('#stay-put')!.addEventListener('click', handlers.onStay);
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button[data-offer]')) {
      button.addEventListener('click', () => handlers.onAccept(button.dataset.offer!));
    }
  }
}

/** One club's pitch, framed against the club the player is leaving. */
function offerCard(player: Player, currentClub: Team, offer: TransferOffer): string {
  const club = getTeam(offer.clubId);
  const level = squadLevel(club);
  const step = level - squadLevel(currentClub);
  const fit = tacticalFit(player, club);
  const need = positionalNeed(club, player.position);

  const stepLabel = step >= 6 ? 'Step up' : step <= -6 ? 'Step down' : 'Sideways move';
  const stepClass = step >= 6 ? 'up' : step <= -6 ? 'down' : '';

  return `
    <div class="career-card offer-card" style="border-left: 4px solid ${club.colour}">
      <div class="offer-head">
        <h2>${club.name}</h2>
        <span class="offer-step ${stepClass}">${stepLabel}</span>
      </div>
      <p class="hint">
        ${TACTICAL_STYLE_LABELS[club.style]} · squad level ${level} ·
        expects ${withArticle(reputationTier(reputationRequired(club)).label.toLowerCase())} player
      </p>

      <dl class="stat-list">
        <div><dt>Fee</dt><dd>£${offer.fee}m</dd></div>
        <div><dt>Wages</dt><dd>£${offer.wage}k / week</dd></div>
        <div><dt>Your role</dt><dd>${SQUAD_ROLE_LABELS[offer.role]}</dd></div>
        <div><dt>Suits your game</dt><dd>${describeFit(fit)}</dd></div>
        <div><dt>Need in your position</dt><dd>${describeNeed(need)}</dd></div>
      </dl>

      ${offer.notes.length ? `<ul class="offer-notes">${offer.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}

      <button class="primary" data-offer="${offer.id}">Join ${club.shortName}</button>
    </div>`;
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
