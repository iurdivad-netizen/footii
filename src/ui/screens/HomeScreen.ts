/**
 * HOME SCREEN
 *
 * The front door: pick a mode before configuring anything. Previously the game
 * opened straight onto a wall of settings with the mode buried at the bottom,
 * which made "career" look like an afterthought rather than the main game.
 */
export interface HomeHandlers {
  onNewCareer: () => void;
  onQuickMatch: () => void;
  /** Present only when a career is in progress. */
  onContinueCareer?: () => void;
  onAbandonCareer?: () => void;
  careerSummary?: string;
}

export class HomeScreen {
  readonly element: HTMLElement;

  constructor(handlers: HomeHandlers) {
    this.element = document.createElement('section');
    this.element.className = 'screen home-screen';
    this.element.innerHTML = `
      <header class="home-header">
        <h1>FOOTII</h1>
        <p class="tagline">One player. Ninety minutes. Six choices at a time.</p>
      </header>

      ${
        handlers.onContinueCareer
          ? `<div class="home-card featured">
               <h2>Continue career</h2>
               <p class="home-summary">${handlers.careerSummary ?? ''}</p>
               <button class="primary" id="continue-career">Continue</button>
               <button class="ghost" id="abandon-career">Abandon this career</button>
             </div>`
          : ''
      }

      <div class="home-modes">
        <button class="home-mode" id="new-career">
          <span class="mode-title">Career</span>
          <span class="mode-desc">
            Build or pick a footballer and follow him season by season. Your ratings drive
            development — and as your awareness and composure grow, you get measurably more time
            on the ball.
          </span>
          <span class="mode-cta">${handlers.onContinueCareer ? 'Start a new career' : 'Start a career'} →</span>
        </button>

        <button class="home-mode" id="quick-match">
          <span class="mode-title">Quick match</span>
          <span class="mode-desc">
            A single game, any player against any opponent. Nothing is saved to a career — good
            for trying a position or a tactical matchup.
          </span>
          <span class="mode-cta">Play one match →</span>
        </button>
      </div>

      <div class="setup-notes">
        <h2>How it works</h2>
        <ul>
          <li>The match simulates itself. You are pulled in only when you can change the outcome.</li>
          <li>Each chance is told as a short build-up, then six options appear and the clock starts.</li>
          <li>Your decision window comes from your awareness, composure, decision making and
              experience — minus the pressure you are under.</li>
          <li><strong>Watch the goalkeeper.</strong> He commits partway through your window.
              Waiting tells you what he has done, but costs you time.</li>
          <li>Press <kbd>D</kbd> at any point for the simulation debug panel.</li>
        </ul>
      </div>`;

    this.element
      .querySelector<HTMLButtonElement>('#new-career')!
      .addEventListener('click', handlers.onNewCareer);
    this.element
      .querySelector<HTMLButtonElement>('#quick-match')!
      .addEventListener('click', handlers.onQuickMatch);
    this.element
      .querySelector<HTMLButtonElement>('#continue-career')
      ?.addEventListener('click', () => handlers.onContinueCareer?.());
    this.element
      .querySelector<HTMLButtonElement>('#abandon-career')
      ?.addEventListener('click', () => {
        if (confirm('Abandon this career? Your season and development will be lost.')) {
          handlers.onAbandonCareer?.();
        }
      });
  }
}
