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
