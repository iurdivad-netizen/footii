/**
 * THE FIRST SCREEN, AND THE ONLY TIME IT IS SHOWN
 *
 * The front door is a rack of career slots, a wall of fame, a quick match and
 * three settings. That is exactly the right screen for somebody who already
 * knows what this game is, and exactly the wrong one for somebody who does not
 * — a first-time player was being asked to pick a **decision pace** before
 * anything on the page had told him that a decision was a thing the game had.
 *
 * The explanation did exist. It was five bullets inside a collapsed `<details>`
 * at the very bottom, under the careers, the wall, the quick match, the
 * settings and the save panel. A folded paragraph below the fold is a thing
 * nobody has ever read.
 *
 * WHAT THIS SCREEN IS FOR, and it is deliberately not a tutorial. It answers
 * one question — what am I about to do — in three beats, and then gets out of
 * the way. Everything else a player might want is on the manual (see
 * `HowToPlayScreen`), which is linked from here and from the front door, and
 * which he can read when he has a reason to rather than before he has one.
 *
 * THREE BEATS, AND WHY THESE THREE. They are the three things that make this
 * game different from the football games somebody arriving has already played:
 *
 *   YOU ARE ONE PLAYER. Not the manager, not the team. The match plays itself
 *   and fetches you when you can change it.
 *   THE MOMENT IS THE GAME. Six options, a clock, and a keeper who commits
 *   inside your window.
 *   IT IS A CAREER. What happens in those moments is written down for fifteen
 *   years.
 *
 * IT IS SKIPPABLE AND IT IS NEVER FORCED TWICE. `seenIntro` is set the moment
 * the player leaves this screen by either door, so the only way back is the
 * manual. An introduction that reappeared would be an obstacle rather than a
 * welcome.
 */
export interface WelcomeHandlers {
  /** Straight into starting a career — the thing this screen is selling. */
  onStart: () => void;
  /** The full manual, for somebody who would rather read first. */
  onHowToPlay: () => void;
  /** The ordinary front door, for somebody who wants to look around. */
  onSkip: () => void;
}

export class WelcomeScreen {
  readonly element: HTMLElement;

  constructor(handlers: WelcomeHandlers) {
    this.element = document.createElement('section');
    this.element.className = 'screen welcome-screen';
    this.element.innerHTML = `
      <header class="welcome-header">
        <div class="home-crest" aria-hidden="true">
          <span class="crest-ring"></span>
          <span class="crest-dot"></span>
        </div>
        <h1>FOOTII</h1>
        <p class="welcome-tagline">One player. Ninety minutes. Six choices at a time.</p>
      </header>

      <ol class="welcome-beats">
        <li>
          <span class="beat-number" aria-hidden="true">1</span>
          <h2>You are one footballer</h2>
          <p>
            Not the manager and not the team. The match runs on its own and pulls you in only at
            the moments you could actually change — a chance, a duel, a ball you have to do
            something with.
          </p>
        </li>
        <li>
          <span class="beat-number" aria-hidden="true">2</span>
          <h2>Then six options and a clock</h2>
          <p>
            Every moment is a short build-up, then six things you could do. Pick with
            <kbd>1</kbd>–<kbd>6</kbd> or a tap. <strong>Watch the goalkeeper</strong> — he commits
            partway through your window, and waiting to see what he does costs you time you may
            need.
          </p>
        </li>
        <li>
          <span class="beat-number" aria-hidden="true">3</span>
          <h2>For fifteen years</h2>
          <p>
            Those moments become a career: contracts, transfers, a manager with an opinion of you,
            injuries, a rival for your shirt, and a record book that remembers the first goal and
            the hundredth appearance.
          </p>
        </li>
      </ol>

      <div class="welcome-actions">
        <button class="primary" id="welcome-start">Start a career</button>
        <div class="welcome-secondary">
          <button class="ghost" id="welcome-how">How to play</button>
          <button class="ghost" id="welcome-skip">Just look around</button>
        </div>
      </div>

      <p class="hint welcome-note">
        There is no time limit on your decisions until you ask for one, and everything here can be
        changed later. You can keep three careers going at once.
      </p>`;

    this.element
      .querySelector<HTMLButtonElement>('#welcome-start')!
      .addEventListener('click', handlers.onStart);
    this.element
      .querySelector<HTMLButtonElement>('#welcome-how')!
      .addEventListener('click', handlers.onHowToPlay);
    this.element
      .querySelector<HTMLButtonElement>('#welcome-skip')!
      .addEventListener('click', handlers.onSkip);
  }
}
