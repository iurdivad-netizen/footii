/**
 * FATAL ERROR SCREEN
 *
 * The last line of defence. If anything throws while the game is starting or
 * while a screen is being built, the player would otherwise be left looking at
 * a blank page with no way to recover — they cannot reach a menu, cannot
 * abandon a broken career, and short of opening developer tools cannot clear
 * the save that is causing it.
 *
 * This renders a readable explanation and, crucially, gives them the buttons to
 * get playing again.
 */
export function renderFatalError(root: HTMLElement, error: unknown, storageKey: string): void {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <section class="screen error-screen">
      <h1>Something went wrong</h1>
      <p class="error-lead">
        The game could not start. This is usually a saved career left over from an older version.
      </p>
      <pre class="error-detail">${escapeHtml(message)}</pre>
      <div class="error-actions">
        <button class="primary" id="err-clear-career">Delete saved career and reload</button>
        <button id="err-clear-all">Delete all saved data and reload</button>
        <button class="ghost" id="err-reload">Just reload</button>
      </div>
      <p class="hint">
        Deleting the career keeps your quick-match totals and settings.
      </p>
    </section>`;

  root.querySelector<HTMLButtonElement>('#err-clear-career')?.addEventListener('click', () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const save = JSON.parse(raw) as Record<string, unknown>;
        delete save.careerState;
        localStorage.setItem(storageKey, JSON.stringify(save));
      }
    } catch {
      // If the save cannot even be parsed, remove it outright.
      localStorage.removeItem(storageKey);
    }
    location.reload();
  });

  root.querySelector<HTMLButtonElement>('#err-clear-all')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Nothing more we can do; reloading is still worth a try.
    }
    location.reload();
  });

  root.querySelector<HTMLButtonElement>('#err-reload')?.addEventListener('click', () => {
    location.reload();
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
