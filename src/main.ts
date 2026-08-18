import './style.css';
import { App } from './ui/App.ts';
import { STORAGE_KEY } from './persistence/storage.ts';
import { renderFatalError } from './ui/screens/ErrorScreen.ts';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app root element not found');

/**
 * Start the game behind an error boundary.
 *
 * A thrown error during boot previously left a blank page with no route back:
 * no menu, no way to abandon a broken career, no way to clear the save without
 * developer tools. Whatever happens, the player now gets something they can act
 * on.
 */
try {
  new App(root);
} catch (error) {
  console.error('Footii failed to start', error);
  renderFatalError(root, error, STORAGE_KEY);
}

// Tell the boot watchdog in index.html that the module ran. Set after the try
// block rather than inside it: reaching the error boundary still counts as
// "the code loaded", and that screen is far more useful than the watchdog's.
declare global {
  interface Window {
    __footiiStarted?: boolean;
  }
}
window.__footiiStarted = true;
